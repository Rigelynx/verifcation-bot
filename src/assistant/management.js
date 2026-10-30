const { ChannelType, PermissionFlagsBits: P, PermissionsBitField, OverwriteType, AttachmentBuilder } = require('discord.js');
const { actionPolicies } = require('./capabilities');
const id = { type: 'string', pattern: '^\\d{17,20}$' };
const text = maxLength => ({ type: 'string', maxLength });
const url = { type: 'string', minLength: 1, maxLength: 1000 };
const embedSchema = { type: 'object', additionalProperties: false, properties: {
    title: text(256), description: text(4096), color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, url,
    image_url: url, thumbnail_url: url,
    author: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 256 }, url, icon_url: url } },
    footer: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string', minLength: 1, maxLength: 2048 }, icon_url: url } },
    fields: { type: 'array', maxItems: 25, items: { type: 'object', additionalProperties: false, required: ['name', 'value'], properties: {
        name: { type: 'string', minLength: 1, maxLength: 256 }, value: { type: 'string', minLength: 1, maxLength: 1024 }, inline: { type: 'boolean' }
    } } }
} };
const permissionNames = Object.keys(P);
const permissionList = { type: 'array', items: { type: 'string', enum: permissionNames }, uniqueItems: true };
const definition = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description,
    parameters: { type: 'object', properties, required, additionalProperties: false } } });
const managementTools = [
    definition('send_message', 'Publica un mensaje real en un canal de texto o anuncios de esta comunidad cuando el usuario lo solicita. content conserva el Markdown de Discord: spoilers ||texto||, encabezados, negritas, cursivas, subrayado, tachado, listas, citas, enlaces y código. Admite hasta 10 embeds con color, campos, imágenes y miniaturas. Las menciones no notifican. Para textos largos reparte en mensajes completos, sin cortar código ni spoilers.', {
        channel_id: id, content: text(2000), embeds: { type: 'array', maxItems: 10, items: embedSchema },
        attachment_ids: { type: 'array', maxItems: 4, uniqueItems: true, items: { type: 'string', pattern: '^[a-f0-9-]{36}$' } },
        spoiler_attachments: { type: 'boolean' }
    }, ['channel_id']),
    definition('permission_catalog', 'Lista los nombres técnicos de permisos admitidos y ejemplos de su significado. Consulta antes de configurar permisos desconocidos.'),
    definition('inspect_channel', 'Consulta configuración, categoría y excepciones de permisos de un canal visible.', { channel_id: id }, ['channel_id']),
    definition('inspect_role', 'Consulta posición, permisos y miembros de un rol. fetch_members=true consulta todos los miembros para comprobar si realmente está sin asignar.', { role_id: id, fetch_members: { type: 'boolean' } }, ['role_id']),
    definition('find_members', 'Busca miembros de esta comunidad por nombre o indicativo. Si hay coincidencias ambiguas, pide el ID adecuado.', { query: { type: 'string', minLength: 1, maxLength: 100 } }, ['query']),
    definition('member_info', 'Consulta el nombre y los roles actuales de un miembro de esta comunidad.', { user_id: id }, ['user_id']),
    definition('update_channel', 'Edita nombre, tema, modo lento, NSFW o límite/bitrate de voz. Conserva los campos que no indiques.', {
        channel_id: id, name: { type: 'string', minLength: 1, maxLength: 100 }, topic: text(4096),
        slowmode_seconds: { type: 'integer', minimum: 0, maximum: 21600 }, nsfw: { type: 'boolean' },
        user_limit: { type: 'integer', minimum: 0, maximum: 99 }, bitrate: { type: 'integer', minimum: 8000 }
    }, ['channel_id']),
    definition('move_channel', 'Mueve un canal a una categoría visible. parent_id=null lo saca de su categoría. Conserva sus permisos; para heredar usa después sync_channel_permissions.', { channel_id: id, parent_id: { type: ['string', 'null'], pattern: '^\\d{17,20}$' } }, ['channel_id', 'parent_id']),
    definition('reorder_channel', 'Cambia la posición de un canal o categoría en la lista, sin modificar sus permisos.', { channel_id: id, position: { type: 'integer', minimum: 0 } }, ['channel_id', 'position']),
    definition('delete_channel', 'Borra un canal o categoría cuando el usuario pide esa eliminación. El borrado es irreversible. Borrar una categoría no borra sus canales hijos; quedan fuera de ella.', { channel_id: id }, ['channel_id']),
    definition('update_role', 'Edita nombre, color, visibilidad separada y si un rol puede mencionarse. Conserva sus permisos. Para permisos usa set_role_permissions.', {
        role_id: id, name: { type: 'string', minLength: 1, maxLength: 100 }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, hoist: { type: 'boolean' }, mentionable: { type: 'boolean' }
    }, ['role_id']),
    definition('reorder_role', 'Cambia la posición de un rol dentro de la jerarquía que el usuario y el bot pueden gestionar.', { role_id: id, position: { type: 'integer', minimum: 1 } }, ['role_id', 'position']),
    definition('delete_role', 'Borra un rol solicitado por el usuario y lo retira de sus miembros. No se pueden borrar @everyone ni roles gestionados por integraciones. El borrado no se puede deshacer.', { role_id: id }, ['role_id']),
    definition('assign_role', 'Asigna un rol existente a un miembro del servidor, respetando permisos y jerarquía.', { role_id: id, user_id: id }, ['role_id', 'user_id']),
    definition('remove_role', 'Retira un rol existente de un miembro del servidor.', { role_id: id, user_id: id }, ['role_id', 'user_id']),
    definition('set_role_permissions', 'Concede o retira permisos globales de un rol, incluido @everyone, conservando los demás. No concedas privilegios que el usuario o el bot no tengan.', { role_id: id, grant: permissionList, revoke: permissionList }, ['role_id']),
    definition('set_channel_permissions', 'Configura excepciones de canal para un rol o miembro: allow=permitir, deny=denegar, inherit=quitar la excepción de ese permiso. Conserva las demás excepciones. Para @everyone usa el ID del servidor y target_type=role.', {
        channel_id: id, target_id: id, target_type: { type: 'string', enum: ['role', 'member'] },
        changes: { type: 'array', minItems: 1, items: { type: 'object', properties: { permission: { type: 'string', enum: permissionNames }, value: { type: 'string', enum: ['allow', 'deny', 'inherit'] } }, required: ['permission', 'value'], additionalProperties: false } }
    }, ['channel_id', 'target_id', 'target_type', 'changes']),
    definition('sync_channel_permissions', 'Sustituye las excepciones de un canal por las de su categoría actual cuando se pide heredar o sincronizar permisos.', { channel_id: id }, ['channel_id'])
];
const fail = message => { throw new Error(message); };
const has = (member, permission) => Boolean(member?.permissions?.has(permission));
const entries = collection => [...(collection?.values?.() || [])];
const flagNames = bits => new PermissionsBitField(bits || 0n).toArray();
const overwriteSnapshot = channel => entries(channel.permissionOverwrites?.cache).map(row => ({ id: row.id, type: row.type, allow: flagNames(row.allow?.bitfield), deny: flagNames(row.deny?.bitfield) }));
const roleSnapshot = role => ({ id: role.id, name: role.name, position: role.position, color: role.hexColor || null,
    hoist: role.hoist, mentionable: role.mentionable, managed: role.managed, permissions: flagNames(role.permissions?.bitfield) });
const channelSnapshot = channel => ({ id: channel.id, name: channel.name, type: channel.type, parent_id: channel.parentId || null,
    position: channel.rawPosition ?? channel.position, topic: channel.topic ?? null, nsfw: channel.nsfw, slowmode_seconds: channel.rateLimitPerUser,
    bitrate: channel.bitrate, user_limit: channel.userLimit, overwrites: overwriteSnapshot(channel) });
function below(role, highest) {
    if (!highest) return false;
    return typeof role.comparePositionTo === 'function' ? role.comparePositionTo(highest) < 0 : role.position < highest.position;
}
async function executeManagement(name, args, context) {
    const { guild } = context;
    let { member, bot } = context;
    const owner = () => member.id === guild.ownerId;
    const visible = channel => Boolean(channel && channel.permissionsFor(member)?.has(P.ViewChannel) && channel.permissionsFor(bot)?.has(P.ViewChannel));
    const channelFor = async raw => {
        const channel = (await guild.channels.fetch()).get(raw);
        if (!visible(channel) || (channel.guild?.id && channel.guild.id !== guild.id)) fail('Canal no encontrado o sin acceso en esta comunidad.');
        if (channel.isThread?.()) fail('Esta herramienta gestiona canales y categorías; los hilos requieren su gestión específica.');
        return channel;
    };
    const roleFor = async raw => {
        const role = (await guild.roles.fetch()).get(raw);
        if (!role || (role.guild?.id && role.guild.id !== guild.id)) fail('Rol no encontrado en esta comunidad.');
        return role;
    };
    const memberFor = async raw => {
        const result = await guild.members.fetch({ user: raw, force: true }).catch(() => null);
        if (!result || (result.guild?.id && result.guild.id !== guild.id)) fail('Miembro no encontrado en esta comunidad.');
        return result;
    };
    const requirePermission = (permission, channel = null) => {
        const userHas = owner() || has(member, permission) || channel?.permissionsFor(member)?.has(permission);
        const botHas = has(bot, permission) || channel?.permissionsFor(bot)?.has(permission);
        if (!userHas || !botHas) fail(`Tú y el bot necesitáis ${permission === P.ManageRoles ? 'Gestionar roles/permisos' : 'Gestionar canales'} en el destino.`);
    };
    const roleHierarchy = (role, allowEveryone = false) => {
        if (role.id === guild.id) { if (allowEveryone) return; fail('@everyone no puede renombrarse, asignarse, moverse ni borrarse.'); }
        if (role.managed) fail('Ese rol lo gestiona Discord o una integración.');
        if (!below(role, bot.roles?.highest) || (!owner() && !below(role, member.roles?.highest))) fail('El rol debe estar por debajo del rol más alto del bot y del usuario (salvo el dueño del servidor).');
    };
    const ensureGrants = (permissions, channel = null) => {
        for (const permission of permissions) {
            if ((!owner() && !has(member, P[permission]) && !channel?.permissionsFor(member)?.has(P[permission]))
                || (!has(bot, P[permission]) && !channel?.permissionsFor(bot)?.has(P[permission]))) fail(`No puedes conceder ${permission}: el usuario y el bot deben tener ese permiso.`);
        }
    };
    const reason = () => `Asistente privado: ${member.id} · ${context.requestId}`;
    const authorize = async () => {
        if (context.assistantPolicy?.[name] === false) fail('El propietario deshabilitó esta herramienta para la comunidad.');
        if (!context.authorizeAction || !await context.authorizeAction(name, args)) fail('Esta modificación no forma parte de lo que solicitaste en la conversación.');
        if (context.refreshIdentity) ({ member, bot } = await context.refreshIdentity());
        if (context.assistantPolicy?.[name] === false) fail('El propietario deshabilitó esta herramienta para la comunidad.');
    };
    const finish = (action, resource, before, after, extra = {}) => {
        const result = { changed: true, id: resource.id, name: resource.name, before, after, ...extra };
        try { context.audit(action, resource.id, JSON.stringify({ request_id: context.requestId, before, after })); }
        catch { result.audit_warning = 'La acción se completó, pero falló su registro local de auditoría.'; }
        return result;
    };
    if (name === 'permission_catalog') return { permissions: permissionNames, examples: { ViewChannel: 'Ver canal', SendMessages: 'Enviar mensajes',
        ReadMessageHistory: 'Leer historial', Connect: 'Conectarse a voz', Speak: 'Hablar en voz', ManageChannels: 'Gestionar canales', ManageRoles: 'Gestionar roles y permisos', Administrator: 'Administrador; omite las excepciones de canal' } };
    if (name === 'inspect_channel') {
        const channel = await channelFor(args.channel_id);
        return { ...channelSnapshot(channel), requester_permissions: channel.permissionsFor(member)?.toArray?.() || [], bot_permissions: channel.permissionsFor(bot)?.toArray?.() || [] };
    }
    if (name === 'inspect_role') {
        const role = await roleFor(args.role_id);
        const members = args.fetch_members ? await guild.members.fetch() : guild.members.cache;
        const assigned = entries(members).filter(row => row.roles.cache.has(role.id));
        return { ...roleSnapshot(role), members_count: assigned.length, members_complete: Boolean(args.fetch_members),
            members: assigned.slice(0, 50).map(row => ({ id: row.id, name: row.displayName })), members_truncated: assigned.length > 50 };
    }
    if (name === 'find_members') {
        const found = await guild.members.search({ query: args.query, limit: 25 });
        return { members: entries(found).map(row => ({ id: row.id, name: row.displayName, username: row.user.username })), sample_limit: 25 };
    }
    if (name === 'member_info') {
        const found = await memberFor(args.user_id);
        return { id: found.id, name: found.displayName, username: found.user.username, roles: entries(found.roles.cache).map(role => ({ id: role.id, name: role.name })) };
    }
    await authorize();
    if (name === 'send_message') {
        const channel = await channelFor(args.channel_id);
        if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) fail('Elige un canal de texto o anuncios para publicar el mensaje.');
        const attachmentIds = args.attachment_ids || [];
        if (attachmentIds.length && !context.getAttachments) fail('No hay acceso a las imágenes de esta conversación.');
        const attachments = attachmentIds.length ? context.getAttachments(attachmentIds) : [];
        const files = attachments.map(image => new AttachmentBuilder(Buffer.from(image.data), { name: image.name }).setSpoiler(args.spoiler_attachments === true));
        const fileNames = files.map(file => file.name);
        const embeds = (args.embeds || []).map(embed => {
            for (const [value, attachmentAllowed] of [[embed.url, false], [embed.image_url, true], [embed.thumbnail_url, true], [embed.author?.url, false], [embed.author?.icon_url, false], [embed.footer?.icon_url, false]]) {
                if (!value) continue;
                if (attachmentAllowed && value.startsWith('attachment://') && fileNames.includes(value.slice('attachment://'.length))) continue;
                let parsed;
                try { parsed = new URL(value); } catch { fail('Los enlaces e imágenes del embed deben ser URLs HTTP o HTTPS válidas.'); }
                if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('Los enlaces e imágenes del embed deben ser URLs HTTP o HTTPS sin credenciales.');
            }
            if (![embed.title, embed.description, embed.image_url, embed.thumbnail_url, embed.author?.name, embed.footer?.text].some(value => value?.trim()) && !embed.fields?.length) fail('El embed está vacío.');
            const { color, image_url, thumbnail_url, ...rest } = embed;
            return { ...rest, ...(color ? { color: parseInt(color.slice(1), 16) } : {}),
                ...(image_url ? { image: { url: image_url } } : {}), ...(thumbnail_url ? { thumbnail: { url: thumbnail_url } } : {}) };
        });
        if (!args.content?.trim() && !embeds.length && !files.length) fail('Incluye texto, una imagen o al menos un embed para enviar.');
        const embedLength = embeds.reduce((sum, embed) => sum + (embed.title?.length || 0) + (embed.description?.length || 0)
            + (embed.author?.name.length || 0) + (embed.footer?.text.length || 0)
            + (embed.fields || []).reduce((total, field) => total + field.name.length + field.value.length, 0), 0);
        if (embedLength > 6000) fail('Los embeds de un mismo mensaje no pueden superar 6000 caracteres de texto en total.');
        const permissions = [P.ViewChannel, P.SendMessages, ...(embeds.length ? [P.EmbedLinks] : []), ...(files.length ? [P.AttachFiles] : [])];
        if (!channel.permissionsFor(member)?.has(permissions) || !channel.permissionsFor(bot)?.has(permissions)) fail('Tú y el bot necesitáis Ver canal, Enviar mensajes y, para embeds o imágenes, Insertar enlaces o Adjuntar archivos en el canal de destino.');
        const message = await channel.send({ ...(args.content ? { content: args.content } : {}), ...(embeds.length ? { embeds } : {}),
            ...(files.length ? { files } : {}), allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } });
        context.writeCount = (context.writeCount || 0) + 1;
        return finish('IA_ENVIAR_MENSAJE', { id: message.id, name: channel.name }, null,
            { channel_id: channel.id, content: args.content || '', embeds, attachments: attachments.map(image => ({ id: image.id, name: image.name, mime: image.mime })), spoiler_attachments: Boolean(args.spoiler_attachments), url: message.url },
            { sent: true, channel_id: channel.id, url: message.url, attachment_count: files.length });
    }
    if (['update_channel', 'move_channel', 'reorder_channel', 'delete_channel', 'set_channel_permissions', 'sync_channel_permissions'].includes(name)) {
        const channel = await channelFor(args.channel_id);
        const permissionAction = ['set_channel_permissions', 'sync_channel_permissions'].includes(name);
        requirePermission(permissionAction ? P.ManageRoles : P.ManageChannels, channel);
        const before = channelSnapshot(channel);
        if (name === 'delete_channel') {
            if ([guild.rulesChannelId, guild.publicUpdatesChannelId].filter(Boolean).includes(channel.id)) fail('Discord no permite eliminar este canal obligatorio de la comunidad.');
            const children = entries(await guild.channels.fetch()).filter(row => row?.parentId === channel.id).map(row => row.id);
            await channel.delete(reason());
            return finish('IA_BORRAR_CANAL', channel, before, null, { deleted: true, detached_children: children });
        }
        if (name === 'move_channel') {
            if (channel.type === ChannelType.GuildCategory) fail('Una categoría no puede colocarse dentro de otra categoría.');
            const parent = args.parent_id ? await channelFor(args.parent_id) : null;
            if (parent && parent.type !== ChannelType.GuildCategory) fail('El destino debe ser una categoría.');
            if (parent) requirePermission(P.ManageChannels, parent);
            if ((channel.parentId || null) === args.parent_id) return { changed: false, id: channel.id, name: channel.name, reason: 'Ya está en esa categoría.' };
            const updated = await channel.setParent(args.parent_id, { lockPermissions: false, reason: reason() });
            return finish('IA_MOVER_CANAL', updated, before, channelSnapshot(updated), { updated: true });
        }
        if (name === 'reorder_channel') {
            const updated = await channel.setPosition(args.position, { reason: reason() });
            return finish('IA_ORDENAR_CANAL', updated, before, channelSnapshot(updated), { updated: true });
        }
        if (name === 'update_channel') {
            const edit = {};
            for (const key of ['name', 'topic', 'nsfw', 'bitrate']) if (Object.hasOwn(args, key)) edit[key] = args[key];
            if (args.name !== undefined && (!args.name.trim() || /[\r\n\x00-\x1f]/.test(args.name))) fail('Nombre de canal inválido.');
            if (args.slowmode_seconds !== undefined) edit.rateLimitPerUser = args.slowmode_seconds;
            if (args.user_limit !== undefined) edit.userLimit = args.user_limit;
            if (!Object.keys(edit).length) fail('Indica qué propiedad del canal quieres editar.');
            const voice = [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type);
            const forum = [ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type);
            if ((args.bitrate !== undefined || args.user_limit !== undefined) && !voice) fail('El bitrate y el límite de usuarios corresponden a canales de voz.');
            if (args.bitrate !== undefined && args.bitrate > (guild.maximumBitrate || 96000)) fail('El bitrate supera el máximo de esta comunidad.');
            if (args.topic !== undefined && (voice || channel.type === ChannelType.GuildCategory || (!forum && args.topic.length > 1024))) fail('Tema incompatible con el tipo de canal o demasiado largo.');
            if (channel.type === ChannelType.GuildCategory && Object.keys(edit).some(key => key !== 'name')) fail('Para una categoría puedes editar el nombre o usar las herramientas de orden y permisos.');
            const updated = await channel.edit({ ...edit, reason: reason() });
            return finish('IA_EDITAR_CANAL', updated, before, channelSnapshot(updated), { updated: true });
        }
        if (name === 'sync_channel_permissions') {
            const parent = channel.parentId ? await channelFor(channel.parentId) : null;
            if (!parent) fail('El canal no pertenece a una categoría.');
            requirePermission(P.ManageRoles, parent);
            ensureGrants(overwriteSnapshot(parent).flatMap(row => row.allow), parent);
            const updated = await channel.edit({ permissionOverwrites: entries(parent.permissionOverwrites.cache).map(row => row.toJSON()), reason: reason() });
            return finish('IA_SINCRONIZAR_PERMISOS', updated, before, channelSnapshot(updated), { updated: true });
        }
        const target = args.target_type === 'role' ? await roleFor(args.target_id) : await memberFor(args.target_id);
        const duplicates = new Set(); const changes = {};
        for (const change of args.changes) {
            if (change.permission === 'Administrator') fail('Administrator se configura en un rol con set_role_permissions, no como excepción de canal.');
            if (duplicates.has(change.permission)) fail('Un permiso no puede tener dos valores distintos en la misma petición.');
            duplicates.add(change.permission);
            if (change.value === 'allow') ensureGrants([change.permission], channel);
            changes[change.permission] = change.value === 'inherit' ? null : change.value === 'allow';
        }
        await channel.permissionOverwrites.edit(target.id, changes, { type: args.target_type === 'role' ? OverwriteType.Role : OverwriteType.Member, reason: reason() });
        const fresh = await channelFor(channel.id).catch(() => null);
        return finish('IA_PERMISOS_CANAL', channel, before, fresh ? channelSnapshot(fresh) : { target_id: target.id, changes }, { updated: true, target_id: target.id });
    }
    if (!Object.hasOwn(actionPolicies, name)) fail('Herramienta no permitida.');
    requirePermission(P.ManageRoles);
    const role = await roleFor(args.role_id);
    roleHierarchy(role, name === 'set_role_permissions');
    const before = roleSnapshot(role);
    if (name === 'delete_role') {
        await role.delete(reason());
        return finish('IA_BORRAR_ROL', role, before, null, { deleted: true });
    }
    if (name === 'update_role') {
        const edit = Object.fromEntries(['name', 'color', 'hoist', 'mentionable'].filter(key => Object.hasOwn(args, key)).map(key => [key, args[key]]));
        if (!Object.keys(edit).length) fail('Indica qué propiedad del rol quieres editar.');
        if (args.name !== undefined && (!args.name.trim() || /[\r\n\x00-\x1f]/.test(args.name))) fail('Nombre de rol inválido.');
        const updated = await role.edit({ ...edit, reason: reason() });
        return finish('IA_EDITAR_ROL', updated, before, roleSnapshot(updated), { updated: true });
    }
    if (name === 'reorder_role') {
        if (args.position >= bot.roles.highest.position || (!owner() && args.position >= member.roles.highest.position)) fail('La nueva posición debe quedar por debajo del usuario y del bot.');
        const updated = await role.setPosition(args.position, { reason: reason() });
        return finish('IA_ORDENAR_ROL', updated, before, roleSnapshot(updated), { updated: true });
    }
    if (name === 'set_role_permissions') {
        const grant = args.grant || [], revoke = args.revoke || [];
        if (!grant.length && !revoke.length) fail('Indica los permisos que quieres conceder o retirar.');
        if (grant.some(key => revoke.includes(key))) fail('Un permiso no puede concederse y retirarse a la vez.');
        ensureGrants(grant);
        const permissions = new PermissionsBitField(role.permissions.bitfield).add(grant.map(key => P[key])).remove(revoke.map(key => P[key]));
        const updated = await role.edit({ permissions: permissions.bitfield, reason: reason() });
        return finish('IA_PERMISOS_ROL', updated, before, roleSnapshot(updated), { updated: true });
    }
    const target = await memberFor(args.user_id);
    if (name === 'assign_role') ensureGrants(before.permissions);
    const present = target.roles.cache.has(role.id);
    if ((name === 'assign_role') === present) return { changed: false, id: role.id, name: role.name, user_id: target.id, reason: present ? 'Ya tenía ese rol.' : 'Ya no tiene ese rol.' };
    await target.roles[name === 'assign_role' ? 'add' : 'remove'](role.id, reason());
    return finish(name === 'assign_role' ? 'IA_ASIGNAR_ROL' : 'IA_RETIRAR_ROL', role, { user_id: target.id, assigned: present },
        { user_id: target.id, assigned: name === 'assign_role' }, { assigned: name === 'assign_role', removed: name === 'remove_role', user_id: target.id });
}
module.exports = { managementTools, executeManagement, roleSnapshot, channelSnapshot };
