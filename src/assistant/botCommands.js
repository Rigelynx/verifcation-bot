const { PermissionFlagsBits: P } = require('discord.js');
const economy = require('../database/economyDb');
const { executeCommand } = require('../bot/commandExecution');
const { validateArguments } = require('./schema');

const modules = ['economia', 'eventos', 'servidor', 'moderacion', 'admin', 'bono', 'tienda', 'datosUsuario', 'patrulla'];
// These flows need a Discord button/modal, or issue credentials/change access configuration.
const excluded = new Set(['asistente', 'admin:panel-web', 'admin:configurar', 'evento:finalizar', 'evento:editar-reporte', 'tienda:comprar']);
const queries = new Set(['economia:balance', 'economia:ranking', 'evento:lista', 'evento:estado', 'servidor:lista',
    'bono:lista', 'bono:estado', 'tienda:panel', 'tienda:inventario', 'datos-usuario', 'patrulla']);
let registry;
function commands() {
    if (registry) return registry;
    registry = new Map();
    const add = (command, root, node, path) => {
        const key = [root, ...path].join(':');
        if (excluded.has(key)) return;
        const properties = {}, required = [];
        for (const option of node.options || []) {
            if (option.type === 11) continue; // Attachments retain their existing assistant upload flow.
            const type = option.type === 4 ? 'integer' : option.type === 10 ? 'number' : option.type === 5 ? 'boolean' : 'string';
            properties[option.name] = { type, description: option.description,
                ...([6, 7, 8, 9].includes(option.type) ? { pattern: '^\\d{17,20}$' } : {}),
                ...(option.choices ? { enum: option.choices.map(choice => choice.value) } : {}),
                ...(option.min_value !== undefined ? { minimum: option.min_value } : {}),
                ...(option.max_value !== undefined ? { maximum: option.max_value } : {}),
                ...(type === 'string' ? { maxLength: option.max_length || 2000, minLength: option.min_length || 1 } : {}) };
            if (option.required) required.push(option.name);
        }
        registry.set(key, { command, root, path, options: node.options || [], key, description: node.description,
            schema: { type: 'object', properties, required, additionalProperties: false }, query: queries.has(key) });
    };
    for (const file of modules) {
        const command = require(`../bot/commands/${file}`);
        const data = command.data.toJSON();
        const walk = (node, path = []) => {
            const children = (node.options || []).filter(option => option.type === 1 || option.type === 2);
            if (!children.length) add(command, data.name, node, path);
            else for (const child of children) walk(child, [...path, child.name]);
        };
        walk(data);
    }
    return registry;
}
function catalog(context) {
    return { enabled: Boolean(context.assistantPolicy?.run_bot_command),
        commands: [...commands().values()].filter(entry => economy.isCommandAllowed(entry.key, context.member).allowed)
            .map(entry => ({ command: entry.key, description: entry.description, options: entry.schema, read_only: entry.query,
                requires_channel: true })),
        unavailable: [...excluded], note: 'Las respuestas privadas del comando se devuelven al chat. Los botones no se ejecutan: un panel no significa que la acción esté completada.' };
}
function validateCommand(args) {
    const entry = commands().get(args.command);
    if (!entry) throw new Error('Ese comando no está conectado al asistente. Consulta bot_command_catalog.');
    validateArguments(entry.schema, args.options);
    return entry;
}
function json(value) { return value?.toJSON ? value.toJSON() : value; }
function responseData(payload) {
    if (typeof payload === 'string') return { content: payload };
    const text=node=>[node.content,...(node.components||[]).flatMap(text)].filter(Boolean);
    const componentText=(payload.components||[]).map(json).flatMap(text).join('\n');
    return { content: payload.content || componentText, embeds: (payload.embeds || []).map(json),
        controls: (payload.components || []).map(json) };
}
const stable = value => value && typeof value === 'object'
    ? JSON.stringify(Object.keys(value).sort().map(key => [key, stable(value[key])])) : JSON.stringify(value);

async function runCommand(args, context) {
    const entry = validateCommand(args);
    if (!context.assistantPolicy?.run_bot_command) throw new Error('Habilita Usar comandos del bot en Owner → Configurar IA.');
    // Even query commands can publish a board or disclose private information. Authorize the exact arguments.
    if (!await context.authorizeAction?.('run_bot_command', args)) throw new Error('La petición no autoriza este comando con estos datos.');
    if (context.refreshIdentity) await context.refreshIdentity();
    if (!context.assistantPolicy?.run_bot_command) throw new Error('El propietario deshabilitó los comandos para la IA.');
    const { guild, member, bot } = context;
    if (!economy.isCommandAllowed(entry.key, member).allowed) throw new Error('El comando está deshabilitado o tu cuenta no tiene permiso.');
    const channel = await guild.channels.fetch(args.channel_id);
    const accessible = (target, flags = [P.ViewChannel]) => target?.guildId === guild.id
        && target.permissionsFor(member)?.has(flags) && target.permissionsFor(bot)?.has(flags);
    if (!channel?.isTextBased() || !accessible(channel)) throw new Error('Elige un canal de texto accesible de esta comunidad.');
    const resolved = {};
    for (const option of entry.options) {
        const value = args.options[option.name];
        if (value === undefined) continue;
        if (option.type === 7) {
            const target = await guild.channels.fetch(value);
            if (!accessible(target) || (option.channel_types?.length && !option.channel_types.includes(target.type))) throw new Error('Canal de opción inválido o inaccesible.');
            resolved[option.name] = target;
        } else if (option.type === 6 || option.type === 9) {
            const target = await guild.members.fetch(value);
            if (!target) throw new Error('Miembro no encontrado en esta comunidad.');
            resolved[option.name] = option.type === 6 ? target.user : target;
        } else if (option.type === 8) {
            const role = await guild.roles.fetch(value);
            if (!role) throw new Error('Rol no encontrado en esta comunidad.');
            resolved[option.name] = role;
        } else resolved[option.name] = value;
    }
    const publishes = (entry.root === 'evento' && ['convocar', 'entrenamiento'].includes(entry.path[0]))
        || (entry.root === 'bono' && entry.path[0] === 'panel') || (entry.key === 'servidor:lista' && args.options.fijar_panel);
    if (publishes && !accessible(resolved.canal_registro || resolved.canal || channel, [P.ViewChannel, P.SendMessages, P.EmbedLinks]))
        throw new Error('El usuario y el bot necesitan acceso para publicar en el canal de destino.');
    if (entry.root === 'admin') {
        const config = require('../database/db').getConfig(guild.id);
        const { parseRoleIds } = require('../bot/utils/roleUtils');
        for (const roleId of [...new Set([...parseRoleIds(config.verified_role_id), ...parseRoleIds(config.unverified_role_id)])]) {
            const role = await guild.roles.fetch(roleId);
            if (!role || role.managed || role.id === guild.id || !member.permissions.has(P.ManageRoles) || !bot.permissions.has(P.ManageRoles)
                || role.position >= bot.roles.highest.position || (member.id !== guild.ownerId && role.position >= member.roles.highest.position)
                || !member.permissions.has(role.permissions) || !bot.permissions.has(role.permissions))
                throw new Error('No puedes gestionar los roles configurados para verificación.');
        }
    }
    if (entry.root === 'mod') {
        const permission = { ban: P.BanMembers, kick: P.KickMembers, timeout: P.ModerateMembers, purge: P.ManageMessages }[entry.path[0]];
        if (!member.permissions.has(permission) || !bot.permissions.has(permission)) throw new Error('El usuario y el bot necesitan el permiso nativo de moderación correspondiente.');
        if (args.options.usuario) {
            const target = await guild.members.fetch(args.options.usuario);
            if (target.id === guild.ownerId || target.id === member.id || (guild.ownerId !== member.id && target.roles.highest.position >= member.roles.highest.position)) throw new Error('No puedes sancionar a este miembro por su jerarquía.');
        }
        if (entry.path[0] === 'timeout' && (args.options.minutos < 1 || args.options.minutos > 40320)) throw new Error('El aislamiento debe durar entre 1 minuto y 28 días.');
        if (entry.path[0] === 'purge' && !accessible(channel, [P.ViewChannel, P.ManageMessages, P.ReadMessageHistory])) throw new Error('No puedes borrar mensajes en ese canal.');
    }
    if (entry.root === 'evento' && entry.path[0] === 'entrenamiento') {
        const role = resolved.rol;
        if (!member.permissions.has(P.ManageRoles) || !bot.permissions.has(P.ManageRoles) || role.managed || role.id === guild.id
            || role.position >= bot.roles.highest.position || (member.id !== guild.ownerId && role.position >= member.roles.highest.position)
            || !member.permissions.has(role.permissions) || !bot.permissions.has(role.permissions)) throw new Error('No puedes conceder el rol de recompensa con tus permisos y jerarquía.');
    }
    const channelScoped = entry.root === 'evento' || publishes || entry.key === 'mod:purge';
    const memoKey = stable({ ...args, channel_id: channelScoped ? args.channel_id : null });
    context.commandResults ||= new Map();
    if (context.commandResults.has(memoKey)) return context.commandResults.get(memoKey);
    const execute = async () => {
        const responses = [];
        // Execution context for existing handlers. It never sends a synthetic slash interaction to Discord.
        const execution = { guild, guildId: guild.id, member, user: member.user, memberPermissions: member.permissions,
            client: guild.client, channel, channelId: channel.id, commandName: entry.root, id: context.requestId,
            createdTimestamp: Date.now(), deferred: false, replied: false,
            options: { getSubcommand: () => entry.path.at(-1) || null,
                getSubcommandGroup: () => entry.path.length === 2 ? entry.path[0] : null },
            deferReply: async () => { execution.deferred = true; },
            reply: async payload => { execution.replied = true; responses.push(responseData(payload)); },
            editReply: async payload => { execution.replied = true; responses.push(responseData(payload)); },
            followUp: async payload => { responses.push(responseData(payload)); } };
        for (const type of ['String', 'Integer', 'Number', 'Boolean', 'User', 'Member', 'Channel', 'Role', 'Mentionable', 'Attachment'])
            execution.options[`get${type}`] = name => resolved[name] ?? null;
        const receipt = { command: entry.key, name: entry.key, options: args.options, channel_id: channel.id, responses,
            execution_status: 'STARTED', changed: false };
        // Write an intent before invoking a handler. A thrown exception must never trigger an automatic retry.
        context.audit('IA_COMANDO_INICIO', entry.key, JSON.stringify({ request_id: context.requestId, ...args }));
        try {
            await executeCommand(entry.command, execution);
            receipt.execution_status = 'RESPONDED';
            receipt.note = 'El comando terminó y devolvió estas respuestas. Verifica su contenido: puede ser una denegación o un panel pendiente. No implica éxito por sí solo.';
        } catch (error) {
            receipt.execution_status = 'UNCERTAIN';
            receipt.error = `El comando falló: ${error.message}. Puede haber cambios parciales; revisa el resultado antes de repetirlo.`;
        }
        context.writeCount += entry.query && !publishes ? 0 : 1;
        try { context.audit('IA_COMANDO_RESULTADO', entry.key, JSON.stringify({ request_id: context.requestId, ...receipt })); }
        catch { receipt.audit_warning = 'El comando se invocó pero no se pudo guardar su auditoría final.'; }
        return receipt;
    };
    const pending = execute();
    context.commandResults.set(memoKey, pending);
    return pending;
}

module.exports = { catalog, runCommand, validateCommand };
