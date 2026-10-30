const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rico-management-'));
const G = '900000000000000001', OWNER = '100000000000000001', OFFICER = '100000000000000002', BOT = '100000000000000003', TARGET = '100000000000000004';
const ROLE = '200000000000000001', HIGH = '200000000000000002', MANAGED = '200000000000000003';
const CHANNEL = '300000000000000001', CATEGORY = '300000000000000002', HIDDEN = '300000000000000003', FOREIGN = '400000000000000001';
Object.assign(process.env, { USMC_DB_PATH: path.join(directory, 'database.sqlite'), GUILD_ID: G });
const { Collection, PermissionsBitField, PermissionFlagsBits: P, ChannelType } = require('discord.js');
const { executeTool } = require('../src/assistant/tools');
const { actionPolicies } = require('../src/assistant/capabilities');
const store = require('../src/database/db');
let guild, roles, channels, members, calls, audits, context;
const bits = permissions => new PermissionsBitField(permissions);
function role(id, name, position, permissions = [P.ViewChannel], managed = false) {
    const result = { id, name, position, permissions: bits(permissions), managed, guild, hexColor: '#123456', hoist: false, mentionable: false,
        comparePositionTo: other => result.position - other.position,
        edit: async options => { calls.push({ method: 'role.edit', id, options });
            for (const [key, value] of Object.entries(options)) {
                if (key === 'permissions') result.permissions = bits(value);
                else if (key === 'color') result.hexColor = value;
                else if (key !== 'reason') result[key] = value;
            } return result; },
        setPosition: async (value, options) => { calls.push({ method: 'role.position', id, value, options }); result.position = value; return result; },
        delete: async reason => { calls.push({ method: 'role.delete', id, reason }); roles.delete(id); for (const member of members.values()) member.roles.cache.delete(id); return result; }
    };
    roles.set(id, result); return result;
}
function overwrite(id, type, allow = [], deny = []) {
    const result = { id, type, allow: bits(allow), deny: bits(deny), toJSON: () => ({ id, type, allow: result.allow.bitfield.toString(), deny: result.deny.bitfield.toString() }) }; return result;
}
function channel(id, name, type = ChannelType.GuildText, parentId = null) {
    const cache = new Collection();
    const result = { id, name, type, parentId, guild, rawPosition: 1, topic: 'Tema anterior', rateLimitPerUser: 0, nsfw: false,
        permissionsFor: member => id === HIDDEN && member.id !== BOT ? bits([]) : member.permissions,
        permissionOverwrites: { cache, edit: async (target, changes, options) => {
            calls.push({ method: 'channel.permissions', id, target, changes, options });
            const entry = cache.get(target) || overwrite(target, options.type);
            for (const [key, value] of Object.entries(changes)) {
                entry.allow.remove(P[key]); entry.deny.remove(P[key]);
                if (value === true) entry.allow.add(P[key]); else if (value === false) entry.deny.add(P[key]);
            }
            cache.set(target, entry); return result;
        } },
        edit: async options => { calls.push({ method: 'channel.edit', id, options });
            for (const [key, value] of Object.entries(options)) {
                if (key === 'permissionOverwrites') { cache.clear(); for (const item of value) cache.set(item.id, overwrite(item.id, item.type, BigInt(item.allow), BigInt(item.deny))); }
                else if (key !== 'reason') result[key] = value;
            } return result;
        },
        setParent: async (value, options) => { calls.push({ method: 'channel.parent', id, value, options }); result.parentId = value; return result; },
        setPosition: async (value, options) => { calls.push({ method: 'channel.position', id, value, options }); result.rawPosition = value; return result; },
        delete: async reason => { calls.push({ method: 'channel.delete', id, reason }); channels.delete(id); for (const row of channels.values()) if (row.parentId === id) row.parentId = null; return result; }
    };
    channels.set(id, result); return result;
}
function member(id, permissions, highest) {
    const cache = new Collection([[G, roles.get(G)]]);
    const result = { id, guild, displayName: `Member ${id}`, user: { username: `user${id}` }, permissions: bits(permissions),
        roles: { cache, highest,
            add: async (value, reason) => { calls.push({ method: 'member.add', id, value, reason }); cache.set(value, roles.get(value)); return result; },
            remove: async (value, reason) => { calls.push({ method: 'member.remove', id, value, reason }); cache.delete(value); return result; }
        }
    }; members.set(id, result); return result;
}
beforeEach(() => {
    roles = new Collection(); channels = new Collection(); members = new Collection(); calls = []; audits = [];
    guild = { id: G, ownerId: OWNER, maximumBitrate: 128000,
        roles: { fetch: async () => roles }, channels: { fetch: async () => channels },
        members: { cache: members, fetch: async value => value ? members.get(value.user) : members,
            search: async ({ query }) => members.filter(row => row.displayName.includes(query)) }
    };
    role(G, '@everyone', 0); role(ROLE, 'Equipo', 10, [P.ViewChannel, P.ReadMessageHistory]);
    role(HIGH, 'Alto', 150); role(MANAGED, 'Integración', 5, [P.ViewChannel], true);
    const highest = role('200000000000000010', 'Bot alto', 100);
    const officerHighest = role('200000000000000011', 'Oficial', 50);
    member(OWNER, [P.Administrator], roles.get(G)); member(BOT, [P.Administrator], highest);
    member(OFFICER, [P.ManageChannels, P.ManageRoles, P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.Connect, P.Speak], officerHighest);
    member(TARGET, [P.ViewChannel], roles.get(ROLE));
    channel(CHANNEL, 'operaciones'); channel(CATEGORY, 'Operaciones', ChannelType.GuildCategory); channel(HIDDEN, 'oculto');
    context = { guild, member: members.get(OWNER), bot: members.get(BOT), requestId: 'management-request-001',
        assistantPolicy: Object.fromEntries(Object.keys(actionPolicies).map(key => [key, true])),
        authorizeAction: async () => true, refreshIdentity: async () => ({ member: context.member, bot: context.bot }),
        audit: (action, target, details) => audits.push({ action, target, details: JSON.parse(details) })
    };
});
after(() => { store.db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
const run = (name, args) => executeTool(name, args, context);

test('inspection reports exact role permissions and distinguishes cached from complete membership', async () => {
    members.get(TARGET).roles.cache.set(ROLE, roles.get(ROLE));
    const cached = await run('inspect_role', { role_id: ROLE });
    assert.equal(cached.members_complete, false); assert.equal(cached.members_count, 1);
    const complete = await run('inspect_role', { role_id: ROLE, fetch_members: true });
    assert.equal(complete.members_complete, true); assert.deepEqual(complete.permissions, ['ViewChannel', 'ReadMessageHistory']);
    assert.ok((await run('permission_catalog', {})).permissions.includes('ManageRoles'));
    assert.equal((await run('member_info', { user_id: TARGET })).roles.length, 2);
    assert.equal((await run('find_members', { query: TARGET })).members[0].id, TARGET);
    await assert.rejects(run('inspect_channel', { channel_id: HIDDEN }), /sin acceso/);
    assert.equal(calls.length, 0);
});

test('channel updates preserve unspecified fields and record before and after with request identity', async () => {
    const result = await run('update_channel', { channel_id: CHANNEL, name: 'soporte', topic: 'Soporte del bot', slowmode_seconds: 10 });
    assert.equal(result.changed, true); assert.equal(result.before.name, 'operaciones'); assert.equal(result.after.name, 'soporte');
    assert.equal(channels.get(CHANNEL).nsfw, false);
    assert.equal(audits[0].action, 'IA_EDITAR_CANAL'); assert.equal(audits[0].details.request_id, context.requestId);
    assert.ok(calls[0].options.reason.includes(OWNER));
    await assert.rejects(run('update_channel', { channel_id: CHANNEL }), /qué propiedad/);
    await assert.rejects(run('update_channel', { channel_id: CHANNEL, bitrate: 64000 }), /canales de voz/);
});

test('voice updates support bitrate and member cap but respect the guild maximum', async () => {
    channels.get(CHANNEL).type = ChannelType.GuildVoice;
    await run('update_channel', { channel_id: CHANNEL, bitrate: 64000, user_limit: 12 });
    assert.equal(channels.get(CHANNEL).bitrate, 64000); assert.equal(channels.get(CHANNEL).userLimit, 12);
    await assert.rejects(run('update_channel', { channel_id: CHANNEL, bitrate: 256000 }), /máximo/);
});

test('moving a channel preserves its overwrites, allows moving to root and refuses hidden destinations', async () => {
    const entry = overwrite(G, 0, [P.ViewChannel], [P.SendMessages]);
    channels.get(CHANNEL).permissionOverwrites.cache.set(G, entry);
    const result = await run('move_channel', { channel_id: CHANNEL, parent_id: CATEGORY });
    assert.equal(result.after.parent_id, CATEGORY); assert.equal(calls[0].options.lockPermissions, false);
    assert.equal(channels.get(CHANNEL).permissionOverwrites.cache.get(G), entry);
    assert.equal((await run('move_channel', { channel_id: CHANNEL, parent_id: CATEGORY })).changed, false);
    await run('move_channel', { channel_id: CHANNEL, parent_id: null }); assert.equal(channels.get(CHANNEL).parentId, null);
    await assert.rejects(run('move_channel', { channel_id: CHANNEL, parent_id: HIDDEN }), /sin acceso/);
    await assert.rejects(run('move_channel', { channel_id: CATEGORY, parent_id: CATEGORY }), /categoría/);
});

test('channel and role ordering respects native hierarchy limits', async () => {
    await run('reorder_channel', { channel_id: CHANNEL, position: 7 });
    assert.equal(channels.get(CHANNEL).rawPosition, 7);
    context.member = members.get(OFFICER);
    await run('reorder_role', { role_id: ROLE, position: 20 }); assert.equal(roles.get(ROLE).position, 20);
    await assert.rejects(run('reorder_role', { role_id: ROLE, position: 50 }), /debajo/);
});

test('deleting a category leaves its children intact and records a deletion rather than a creation', async () => {
    channels.get(CHANNEL).parentId = CATEGORY;
    const result = await run('delete_channel', { channel_id: CATEGORY });
    assert.equal(result.deleted, true); assert.equal(result.created, undefined); assert.equal(result.after, null);
    assert.deepEqual(result.detached_children, [CHANNEL]); assert.equal(channels.has(CHANNEL), true);
    assert.equal(channels.get(CHANNEL).parentId, null); assert.equal(audits[0].action, 'IA_BORRAR_CANAL');
});

test('community-required channels cannot be deleted and failed writes never produce success audits', async () => {
    guild.rulesChannelId = CHANNEL;
    await assert.rejects(run('delete_channel', { channel_id: CHANNEL }), /obligatorio/);
    assert.equal(calls.length, 0); assert.equal(audits.length, 0);
    guild.rulesChannelId = null;
    channels.get(CHANNEL).delete = async () => { throw new Error('Discord refused'); };
    await assert.rejects(run('delete_channel', { channel_id: CHANNEL }), /Discord refused/);
    assert.equal(audits.length, 0);
});

test('role editing preserves permissions and deletion rejects everyone, integrations and inaccessible hierarchy', async () => {
    const previous = roles.get(ROLE).permissions.bitfield;
    await run('update_role', { role_id: ROLE, name: 'Soporte', color: '#abcdef', hoist: true, mentionable: false });
    assert.equal(roles.get(ROLE).name, 'Soporte'); assert.equal(roles.get(ROLE).permissions.bitfield, previous);
    for (const role_id of [G, MANAGED, HIGH]) await assert.rejects(run('delete_role', { role_id }));
    context.member = members.get(OFFICER); roles.get(ROLE).position = 75;
    await assert.rejects(run('update_role', { role_id: ROLE, name: 'Fuera de jerarquía' }), /debajo/);
    context.member = members.get(OWNER); roles.get(ROLE).position = 10;
    const result = await run('delete_role', { role_id: ROLE });
    assert.equal(result.deleted, true); assert.equal(roles.has(ROLE), false);
});

test('role assignments are idempotent, preserve other roles and honor both actor and bot permissions', async () => {
    const first = await run('assign_role', { role_id: ROLE, user_id: TARGET }); assert.equal(first.assigned, true);
    assert.equal((await run('assign_role', { role_id: ROLE, user_id: TARGET })).changed, false);
    const removed = await run('remove_role', { role_id: ROLE, user_id: TARGET }); assert.equal(removed.removed, true);
    assert.equal((await run('remove_role', { role_id: ROLE, user_id: TARGET })).changed, false);
    assert.equal(members.get(TARGET).roles.cache.has(G), true);
    context.member = members.get(OFFICER); roles.get(ROLE).permissions.add(P.Administrator);
    await assert.rejects(run('assign_role', { role_id: ROLE, user_id: TARGET }), /conceder Administrator/);
    context.member = members.get(OWNER); context.bot.permissions = bits([P.ViewChannel]);
    await assert.rejects(run('assign_role', { role_id: ROLE, user_id: TARGET }), /Gestionar roles/);
});

test('role permission changes merge grants and revocations and support everyone without granting missing privileges', async () => {
    context.member = members.get(OFFICER);
    await run('set_role_permissions', { role_id: ROLE, grant: ['SendMessages'], revoke: ['ViewChannel'] });
    assert.equal(roles.get(ROLE).permissions.has(P.SendMessages), true);
    assert.equal(roles.get(ROLE).permissions.has(P.ViewChannel), false);
    assert.equal(roles.get(ROLE).permissions.has(P.ReadMessageHistory), true);
    await run('set_role_permissions', { role_id: G, grant: ['SendMessages'] });
    await assert.rejects(run('set_role_permissions', { role_id: ROLE, grant: ['Administrator'] }), /conceder/);
    await assert.rejects(run('set_role_permissions', { role_id: ROLE, grant: ['SendMessages'], revoke: ['SendMessages'] }), /a la vez/);
    context.member = members.get(OWNER); context.bot.permissions = bits([P.ManageRoles, P.ViewChannel]);
    await assert.rejects(run('set_role_permissions', { role_id: ROLE, grant: ['Administrator'] }), /conceder/);
});

test('channel overwrites use allow deny inherit without replacing unrelated targets or permission bits', async () => {
    const cache = channels.get(CHANNEL).permissionOverwrites.cache;
    cache.set(ROLE, overwrite(ROLE, 0, [P.ReadMessageHistory, P.SendMessages], [P.Speak]));
    cache.set(G, overwrite(G, 0, [P.ViewChannel]));
    const result = await run('set_channel_permissions', { channel_id: CHANNEL, target_type: 'role', target_id: ROLE,
        changes: [{ permission: 'ViewChannel', value: 'allow' }, { permission: 'SendMessages', value: 'deny' }, { permission: 'Speak', value: 'inherit' }] });
    assert.equal(result.updated, true); assert.equal(result.target_id, ROLE);
    assert.equal(cache.get(ROLE).allow.has(P.ReadMessageHistory), true);
    assert.equal(cache.get(ROLE).deny.has(P.SendMessages), true); assert.equal(cache.get(ROLE).deny.has(P.Speak), false);
    assert.equal(cache.has(G), true); assert.equal(calls[0].options.type, 0);
    await run('set_channel_permissions', { channel_id: CHANNEL, target_type: 'member', target_id: TARGET, changes: [{ permission: 'Connect', value: 'deny' }] });
    assert.equal(cache.get(TARGET).type, 1);
});

test('permission synchronization copies the category only when explicitly selected and rejects invalid exceptions', async () => {
    channels.get(CHANNEL).parentId = CATEGORY;
    channels.get(CATEGORY).permissionOverwrites.cache.set(G, overwrite(G, 0, [P.ViewChannel], [P.SendMessages]));
    await run('sync_channel_permissions', { channel_id: CHANNEL });
    assert.equal(channels.get(CHANNEL).permissionOverwrites.cache.get(G).deny.has(P.SendMessages), true);
    await assert.rejects(run('set_channel_permissions', { channel_id: CHANNEL, target_type: 'role', target_id: ROLE,
        changes: [{ permission: 'Administrator', value: 'allow' }] }), /rol/);
    await assert.rejects(run('set_channel_permissions', { channel_id: CHANNEL, target_type: 'role', target_id: ROLE,
        changes: [{ permission: 'SendMessages', value: 'allow' }, { permission: 'SendMessages', value: 'deny' }] }), /dos valores/);
});

test('disabled capabilities, denial of intent and live revocation all stop mutations', async () => {
    context.assistantPolicy.delete_channel = false;
    await assert.rejects(run('delete_channel', { channel_id: CHANNEL }), /deshabilit/);
    context.assistantPolicy.delete_channel = true; context.authorizeAction = async () => false;
    await assert.rejects(run('delete_channel', { channel_id: CHANNEL }), /solicitaste/);
    context.authorizeAction = async () => true;
    context.refreshIdentity = async () => { context.assistantPolicy.delete_channel = false; return context; };
    await assert.rejects(run('delete_channel', { channel_id: CHANNEL }), /deshabilit/);
    assert.equal(calls.length, 0);
});

test('foreign guild targets, hidden channels and malformed parameters never reach a write API', async () => {
    for (const [name, args] of [
        ['delete_channel', { channel_id: FOREIGN }], ['delete_role', { role_id: FOREIGN }],
        ['assign_role', { role_id: ROLE, user_id: FOREIGN }], ['move_channel', { channel_id: CHANNEL, parent_id: FOREIGN }],
        ['update_channel', { channel_id: CHANNEL, name: 'test', permissionOverwrites: [] }],
        ['set_role_permissions', { role_id: ROLE, grant: ['RootPermission'] }],
        ['update_role', { role_id: ROLE, hoist: 'true' }]
    ]) await assert.rejects(run(name, args));
    const foreign = role(FOREIGN, 'Otro servidor', 3); foreign.guild = { id: FOREIGN };
    await assert.rejects(run('delete_role', { role_id: FOREIGN }), /esta comunidad/);
    assert.equal(calls.length, 0);
});

test('a completed mutation with an audit failure remains reported as completed with an explicit warning', async () => {
    context.audit = () => { throw new Error('Storage error'); };
    const result = await run('delete_channel', { channel_id: CHANNEL });
    assert.equal(result.deleted, true); assert.equal(result.changed, true); assert.match(result.audit_warning, /falló/);
    assert.equal(channels.has(CHANNEL), false);
});

test('permission plans preserve nested values and reject a different target or grant on approval', async () => {
    const { actionAuthorizer } = require('../src/assistant/intent');
    const args = { channel_id: CHANNEL, target_type: 'role', target_id: ROLE, changes: [{ permission: 'SendMessages', value: 'deny' }] };
    const plan = await run('propose_actions', { actions: [{ tool: 'set_channel_permissions', args }] });
    assert.equal(plan.proposed, true); assert.equal(calls.length, 0);
    const inputs = [], indexes = [];
    const authorize = actionAuthorizer({ provider: 'deepseek', url: 'https://unit.invalid', key: 'test-key', model: 'test-model' },
        [{ role: 'user', content: 'Dale con el plan de permisos' }], plan.actions,
        index => { indexes.push(index); return { timeoutMs: 1000, fetch: async (_url, init) => {
            const payload = JSON.parse(init.body); inputs.push(JSON.parse(payload.messages[1].content));
            return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ set_channel_permissions: 'proposal' }) } }] }) };
        } }; });
    assert.equal(await authorize('set_channel_permissions', JSON.parse(JSON.stringify(args))), true);
    assert.equal(await authorize('set_channel_permissions', { ...args, target_id: G }), false);
    assert.equal(await authorize('set_channel_permissions', { ...args, changes: [{ permission: 'SendMessages', value: 'allow' }] }), false);
    assert.deepEqual(indexes, [1, 2, 3]);
    assert.ok(inputs.every(input => input.candidate_action.tool === 'set_channel_permissions'));
});

test('live loss of native permissions after intent interpretation blocks a role permission change', async () => {
    context.member = members.get(OFFICER);
    context.refreshIdentity = async () => { context.member.permissions = bits([P.ViewChannel]); return context; };
    await assert.rejects(run('set_role_permissions', { role_id: ROLE, grant: ['SendMessages'] }), /Gestionar roles/);
    assert.equal(calls.length, 0); assert.equal(audits.length, 0);
});

function captureMessages() {
    channels.get(CHANNEL).send = async options => {
        calls.push({ method: 'message.send', options });
        return { id: '500000000000000001', url: `https://discord.com/channels/${G}/${CHANNEL}/500000000000000001` };
    };
}
test('messages preserve Discord formatting, suppress pings and audit the actual destination and receipt', async () => {
    captureMessages();
    const content = '# Operación\n**Atención** __equipo__ ~~cancelado~~\n> Informe\n- Punto uno\n||Ubicación secreta||\n```js\nconst x = 1;\n```\n@everyone <@100000000000000004>';
    const result = await run('send_message', { channel_id: CHANNEL, content, embeds: [{ title: 'Briefing', description: '**Listos** ||dato||', color: '#123456',
        image_url: 'https://example.org/image.png', thumbnail_url: 'https://example.org/logo.png', fields: [{ name: 'AO', value: 'Sector uno', inline: true }], footer: { text: 'Mando' } }] });
    assert.equal(result.sent, true); assert.equal(result.changed, true); assert.equal(result.channel_id, CHANNEL);
    assert.equal(calls.length, 1); assert.equal(calls[0].options.content, content);
    assert.deepEqual(calls[0].options.allowedMentions, { parse: [], users: [], roles: [], repliedUser: false });
    assert.equal(calls[0].options.embeds[0].color, 0x123456);
    assert.deepEqual(calls[0].options.embeds[0].image, { url: 'https://example.org/image.png' });
    assert.equal(audits[0].action, 'IA_ENVIAR_MENSAJE'); assert.equal(audits[0].target, result.id);
    assert.equal(audits[0].details.after.channel_id, CHANNEL); assert.equal(audits[0].details.after.content, content);
});
test('message policy, human intent, target isolation and live permissions are enforced before sending', async () => {
    captureMessages(); const args = { channel_id: CHANNEL, content: 'Anuncio' };
    context.assistantPolicy.send_message = false;
    await assert.rejects(run('send_message', args), /deshabilit/);
    context.assistantPolicy.send_message = true; context.authorizeAction = async () => false;
    await assert.rejects(run('send_message', args), /solicitaste/);
    context.authorizeAction = async () => true; context.member = members.get(OFFICER);
    await assert.rejects(run('send_message', { ...args, channel_id: HIDDEN }), /sin acceso/);
    await assert.rejects(run('send_message', { ...args, channel_id: FOREIGN }), /esta comunidad/);
    await assert.rejects(run('send_message', { ...args, channel_id: CATEGORY }), /texto o anuncios/);
    await assert.rejects(run('send_message', { ...args, embeds: [{ title: 'Embebido' }] }), /Insertar enlaces/);
    context.bot.permissions = bits([P.ViewChannel]);
    await assert.rejects(run('send_message', args), /Enviar mensajes/);
    context.bot.permissions = bits([P.Administrator]);
    context.refreshIdentity = async () => { context.member.permissions = bits([P.ViewChannel]); return context; };
    await assert.rejects(run('send_message', args), /Enviar mensajes/);
    assert.equal(calls.length, 0); assert.equal(audits.length, 0);
});
test('invalid message payloads and combined embed limits are rejected without a Discord write', async () => {
    captureMessages();
    for (const payload of [{}, { content: '  ' }, { content: 'x'.repeat(2001) }, { embeds: [{}] }, { embeds: Array(11).fill({ title: 'x' }) },
        { embeds: [{ description: 'x'.repeat(4000) }, { description: 'x'.repeat(2001) }] },
        { embeds: [{ title: 'x', image_url: 'javascript:alert(1)' }] }, { embeds: [{ title: 'x', url: 'https://name:pass@example.org/' }] },
        { embeds: [{ title: 'x', color: '#zzzzzz' }] }, { content: 'x', allowedMentions: { parse: ['everyone'] } }]) {
        await assert.rejects(run('send_message', { channel_id: CHANNEL, ...payload }));
    }
    assert.equal(calls.length, 0); assert.equal(audits.length, 0);
});
test('failed Discord delivery is not audited as sent; failed audit preserves a successful delivery receipt', async () => {
    channels.get(CHANNEL).send = async () => { throw new Error('Discord unavailable'); };
    await assert.rejects(run('send_message', { channel_id: CHANNEL, content: 'Hola' }), /Discord unavailable/);
    assert.equal(audits.length, 0);
    captureMessages(); context.audit = () => { throw new Error('Storage unavailable'); };
    const result = await run('send_message', { channel_id: CHANNEL, embeds: [{ description: 'Solo embed' }] });
    assert.equal(result.sent, true); assert.match(result.audit_warning, /falló/); assert.equal(calls.length, 1);
});

test('user image attachments can be sent as spoilers and need current AttachFiles permission', async () => {
    captureMessages();
    const id = '12345678-1234-1234-1234-123456789abc', data = Buffer.from('image-test');
    context.getAttachments = ids => ids.map(value => { assert.equal(value, id); return { id, data, name: 'imagen.png', mime: 'image/png' }; });
    const result = await run('send_message', { channel_id: CHANNEL, attachment_ids: [id], spoiler_attachments: true });
    assert.equal(result.sent, true); assert.equal(result.attachment_count, 1);
    assert.equal(calls[0].options.files[0].name, 'SPOILER_imagen.png');
    assert.deepEqual(calls[0].options.files[0].attachment, data);
    assert.equal(audits[0].details.after.attachments[0].id, id);
    assert.equal(JSON.stringify(audits).includes('image-test'), false);
    calls.length = 0; context.member = members.get(OFFICER);
    await assert.rejects(run('send_message', { channel_id: CHANNEL, attachment_ids: [id] }), /Adjuntar archivos/);
    assert.equal(calls.length, 0);
});
