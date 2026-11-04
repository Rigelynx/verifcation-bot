const { PermissionFlagsBits: P, EmbedBuilder } = require('discord.js');
const eco = require('../database/economyDb');
const { validateArguments } = require('./schema');
const id = { type: 'string', pattern: '^\\d{17,20}$' };
const ids = { type: 'array', maxItems: 20, uniqueItems: true, items: id };
const text = maxLength => ({ type: 'string', maxLength });
const itemFields = { name: { type: 'string', minLength: 1, maxLength: 100 }, description: text(1000),
    price: { type: 'integer', minimum: 0, maximum: 1000000000 }, stock: { type: 'integer', minimum: -1, maximum: 1000000 },
    max_per_user: { type: 'integer', minimum: 0, maximum: 1000000, description: '0 permite compras sin límite por persona.' }, custom_reply: text(1000), icon: text(32),
    is_active: { type: 'boolean' }, roles_to_give: ids, roles_to_remove: ids, required_roles: ids, blocked_roles: ids };
const bonusFields = { title: { type: 'string', minLength: 1, maxLength: 200 }, description: text(2500),
    amount: { type: 'integer', minimum: 1, maximum: 1000000000 }, claim_mode: { type: 'string', enum: ['ONCE', 'COOLDOWN'] },
    cooldown_seconds: { type: 'integer', minimum: 1, maximum: 31536000 }, button_label: { type: 'string', minLength: 1, maxLength: 80 },
    required_roles: ids, is_active: { type: 'boolean' } };
const definition = (name, description, properties, required = []) => ({ type: 'function', function: { name, description,
    parameters: { type: 'object', properties, required, additionalProperties: false } } });
const shopTools = [
    definition('shop_configuration', 'Consulta productos activos/inactivos de la tienda web y Discord y configuraciones de paneles de bonos. Requiere administrar la comunidad.', {}),
    definition('configure_shop_item', 'Crea o edita un producto de la tienda existente (web y Discord comparten datos). Sin item_id crea y exige nombre y precio. Con item_id conserva campos no indicados. is_active=false retira de venta conservando compras. No compra ni entrega roles.', {
        item_id: { type: 'integer', minimum: 1 }, fields: { type: 'object', properties: itemFields, additionalProperties: false }
    }, ['fields']),
    definition('configure_bonus_panel', 'Crea o edita la configuración de un panel de bonos. Sin panel_id crea; con ID conserva campos no indicados. No distribuye dinero ni reinicia reclamos. Para actualizar el mensaje publicado usa publish_panel con message_id.', {
        panel_id: { type: 'integer', minimum: 1 }, fields: { type: 'object', properties: bonusFields, additionalProperties: false }
    }, ['fields']),
    definition('publish_panel', 'Publica un panel funcional de tienda, bonos o verificación con sus botones reales. Con message_id edita un panel del bot del mismo tipo en ese canal. Publicar exige una orden explícita. Las opciones visuales modifican el mensaje, no los permisos ni las reglas del sistema.', {
        kind: { type: 'string', enum: ['shop', 'bonus', 'verification'] }, channel_id: id, message_id: id,
        panel_id: { type: 'integer', minimum: 1 }, title: { type: 'string', minLength: 1, maxLength: 200 },
        description: text(2500), color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }
    }, ['kind', 'channel_id'])
];
const stable = value => value && typeof value === 'object' ? JSON.stringify(Object.keys(value).sort().map(key => [key, stable(value[key])])) : JSON.stringify(value);
async function executeShop(name, args, context) {
    validateArguments(shopTools.find(tool => tool.function.name === name).function.parameters, args);
    if (name !== 'shop_configuration') {
        if (!context.assistantPolicy?.[name]) throw new Error('El propietario debe habilitar esta capacidad en Owner → Configurar IA.');
        if (!await context.authorizeAction?.(name, args)) throw new Error('La petición no autoriza esta configuración o publicación.');
    }
    if (context.refreshIdentity) await context.refreshIdentity();
    const { guild, member, bot } = context;
    if (member.id !== guild.ownerId && !member.permissions.has(P.ManageGuild)) throw new Error('Necesitas Gestionar servidor para configurar la tienda y los paneles.');
    if (name !== 'shop_configuration' && !context.assistantPolicy?.[name]) throw new Error('El propietario deshabilitó esta capacidad.');
    const permissionKey = name === 'configure_bonus_panel' ? 'bono:crear' : args.kind === 'bonus' ? 'bono:panel'
        : args.kind === 'verification' ? 'panel-verificacion' : 'tienda:panel';
    if (!eco.isCommandAllowed(permissionKey, member).allowed)
        throw new Error('La matriz de comandos no permite esta función para tu cuenta.');
    if (name === 'shop_configuration') return { items: eco.getShopItems(guild.id, false), bonus_panels: eco.getAllBonusPanels(guild.id) };
    const key = name + ':' + stable(args);
    context.shopResults ||= new Map();
    if (context.shopResults.has(key)) return context.shopResults.get(key);
    let started = false;
    const execute = async () => {
        let before = null, after, result, channel, payload, message;
        const validateRoles = async (fields, grants = false) => {
            for (const roleId of [...new Set(Object.values(fields).flat())]) {
                const role = await guild.roles.fetch(roleId);
                if (!role || role.guild?.id && role.guild.id !== guild.id) throw new Error('Rol no encontrado en esta comunidad.');
                if (grants && (role.id === guild.id || role.managed || !member.permissions.has(P.ManageRoles) || !bot.permissions.has(P.ManageRoles)
                    || role.position >= bot.roles.highest.position || (member.id !== guild.ownerId && role.position >= member.roles.highest.position)
                    || !member.permissions.has(role.permissions) || !bot.permissions.has(role.permissions))) throw new Error('No puedes configurar la entrega o retirada de ese rol por permisos o jerarquía.');
            }
        };
        if (name === 'configure_shop_item') {
            before = args.item_id ? eco.getShopItemById(args.item_id) : null;
            if (args.item_id && !before) throw new Error('Producto no encontrado en esta comunidad.');
            if (!Object.keys(args.fields).length) throw new Error('Indica los campos que quieres configurar.');
            const fields = { ...before, ...args.fields };
            if (!fields.name?.trim() || fields.price === undefined) throw new Error('Para crear un producto hacen falta nombre y precio.');
            await validateRoles({ required_roles: fields.required_roles || [], blocked_roles: fields.blocked_roles || [] });
            await validateRoles({ roles_to_give: fields.roles_to_give || [], roles_to_remove: fields.roles_to_remove || [] }, true);
        } else if (name === 'configure_bonus_panel') {
            before = args.panel_id ? eco.getBonusPanelById(args.panel_id) : null;
            if (args.panel_id && !before) throw new Error('Panel de bonos no encontrado en esta comunidad.');
            if (!Object.keys(args.fields).length) throw new Error('Indica los campos que quieres configurar.');
            await validateRoles({ required_roles: args.fields.required_roles || [] });
        } else {
            channel = await guild.channels.fetch(args.channel_id);
            if (!channel || channel.guildId !== guild.id || !channel.isTextBased() || channel.isThread?.()
                || ![member, bot].every(identity => channel.permissionsFor(identity)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])))
                throw new Error('El usuario y el bot necesitan ver y publicar embeds en ese canal de esta comunidad.');
            if (args.kind === 'shop') payload = require('../bot/commands/tienda').buildShopPanel(guild.id);
            else if (args.kind === 'bonus') {
                before = args.panel_id ? eco.getBonusPanelById(args.panel_id) : null;
                if (!before) throw new Error('Indica el ID de un panel de bonos de esta comunidad.');
                payload = require('../bot/commands/bono').buildBonusPanelMessage(before, eco.getEconomySettings(guild.id));
            } else payload = require('../bot/commands/panel').buildVerificationPanel(guild, require('../database/db').getConfig(guild.id));
            payload = { ...payload, allowedMentions: { parse: [] } };
            const embed = EmbedBuilder.from(payload.embeds[0]);
            if (args.title !== undefined) embed.setTitle(args.title);
            if (args.description !== undefined) embed.setDescription(args.description || null);
            if (args.color) embed.setColor(args.color);
            payload.embeds = [embed, ...payload.embeds.slice(1)];
            if (args.message_id) {
                if (![member, bot].every(identity => channel.permissionsFor(identity)?.has(P.ReadMessageHistory))) throw new Error('Necesitas acceso al historial para editar el panel.');
                message = await channel.messages.fetch(args.message_id);
                const controls = (message.components || []).flatMap(row => (row.components || []).map(component => component.customId));
                const matches = args.kind === 'verification' ? controls.includes('btn_start_verification')
                    : args.kind === 'bonus' ? controls.includes(`claim_bonus_panel_${args.panel_id}`)
                    : controls.some(value => /^(shop_|tienda_)/.test(value || '') || value === 'btn_refresh_shop');
                if (message.author?.id !== bot.id || !matches) throw new Error('Ese mensaje no es un panel del bot de este tipo.');
                before = { id: message.id, embeds: message.embeds.map(embed => embed.toJSON()) };
            }
        }
        context.audit('IA_CONFIGURACION_INICIO', name, JSON.stringify({ request_id: context.requestId, args, before }));
        started = true;
        if (name === 'configure_shop_item') {
            const fields = { ...args.fields };
            if (fields.is_active !== undefined) fields.is_active = Number(fields.is_active);
            after = args.item_id ? eco.updateShopItem(args.item_id, fields) : eco.createShopItem({ guild_id: guild.id, ...fields });
            result = { changed: true, created: !args.item_id, updated: Boolean(args.item_id), id: after.id, name: after.name, item: after };
        } else if (name === 'configure_bonus_panel') {
            after = args.panel_id ? eco.saveBonusPanel(guild.id, { id: args.panel_id, ...args.fields }) : eco.createBonusPanel(guild.id, args.fields);
            result = { changed: true, created: !args.panel_id, updated: Boolean(args.panel_id), id: after.id, name: after.title, panel: after };
        } else {
            const sent = message ? await message.edit(payload) : await channel.send(payload);
            after = { id: sent.id, channel_id: channel.id, kind: args.kind };
            result = { changed: true, sent: true, updated: Boolean(message), id: sent.id, name: `Panel ${args.kind}`, channel_id: channel.id,
                url: `https://discord.com/channels/${guild.id}/${channel.id}/${sent.id}` };
            if (args.kind === 'bonus') {
                try { eco.saveBonusPanel(guild.id, { id: args.panel_id, channel_id: channel.id, message_id: sent.id }); }
                catch { result.audit_warning = 'El mensaje se publicó pero no se pudo guardar su referencia en el panel de bonos.'; }
            }
        }
        context.writeCount++;
        try { context.audit('IA_CONFIGURACION_RESULTADO', String(result.id), JSON.stringify({ request_id: context.requestId, name, before, after })); }
        catch { result.audit_warning = 'El cambio se realizó pero no se pudo guardar la auditoría final.'; }
        return result;
    };
    const pending = execute().catch(error => {
        if (!started) throw error;
        throw new Error(`${error.message}. La operación pudo quedar parcial; revisa antes de repetirla.`);
    });
    context.shopResults.set(key, pending);
    return pending;
}
module.exports = { shopTools, executeShop };
