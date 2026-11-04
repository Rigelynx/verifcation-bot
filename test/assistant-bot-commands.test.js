const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-commands-'));
const G = '900000000000000001', USER = '100000000000000001', BOT = '100000000000000002', CHANNEL = '200000000000000001';
Object.assign(process.env, { GUILD_ID: G, USMC_DB_PATH: path.join(directory, 'database.sqlite') });
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const store = require('../src/database/db');
const economy = require('../src/database/economyDb');
const community = require('../src/database/communityDb');
const { withGuild } = require('../src/database/guildContext');
const { executeTool } = require('../src/assistant/tools');
const { validatePlan } = require('../src/assistant/creationPlan');
let context, channel, audits;
beforeEach(() => {
    community.ensureCommunity(G);
    audits = [];
    const permissions = new PermissionsBitField(P.Administrator);
    const member = { id: USER, displayName: 'Owner', permissions, roles: { cache: new Map(), highest: { position: 10 } },
        user: { id: USER, username: 'Owner', tag: 'Owner', displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' } };
    channel = { id: CHANNEL, guildId: G, isTextBased: () => true, permissionsFor: () => permissions };
    const guild = { id: G, ownerId: USER, client: {}, iconURL: () => null, channels: { fetch: async () => channel },
        members: { fetch: async () => member }, roles: { fetch: async () => null } };
    context = { guild, member, bot: { id: BOT, permissions, roles: { highest: { position: 20 } } },
        assistantPolicy: { run_bot_command: true }, authorizeAction: async () => true, requestId: 'test-command-request',
        writeCount: 0, audit: (...args) => audits.push(args) };
});
const run = (command, options = {}) => withGuild(G, () => executeTool('run_bot_command', { command, options, channel_id: CHANNEL }, context));
test('catalog uses real schemas and omits credentials and unfinished interactive flows', async () => {
    const result = await withGuild(G, () => executeTool('bot_command_catalog', {}, context));
    assert.ok(result.commands.find(row => row.command === 'evento:convocar').options.required.includes('nombre'));
    for (const command of ['admin:panel-web', 'admin:configurar', 'evento:finalizar', 'tienda:comprar'])
        assert.equal(result.commands.some(row => row.command === command), false);
});
test('executes the existing economy handler and returns its private response', async () => {
    const result = await run('economia:balance');
    assert.equal(result.execution_status, 'RESPONDED', result.error);
    assert.equal(result.changed, false);
    assert.ok(result.responses[0].embeds.length);
    assert.equal(audits.length, 2);
});
test('same arguments execute only once within a request, including reordered options', async () => {
    const before = withGuild(G, () => economy.getAccount(USER).wallet);
    const first = await run('economia:admin:dar', { monto: 37, destino: 'wallet' });
    const second = await run('economia:admin:dar', { destino: 'wallet', monto: 37 });
    assert.deepEqual(second, first);
    assert.equal(withGuild(G, () => economy.getAccount(USER).wallet), before + 37);
    assert.equal(audits.length, 2);
});
test('rejects invalid amounts, extra options, disabled capability and unauthorized intent', async () => {
    await assert.rejects(run('economia:admin:dar', { monto: -1 }));
    await assert.rejects(run('economia:balance', { sql: 'anything' }));
    context.assistantPolicy.run_bot_command = false;
    await assert.rejects(run('economia:balance'), /Habilita/);
    context.assistantPolicy.run_bot_command = true;
    context.authorizeAction = async () => false;
    await assert.rejects(run('economia:admin:dar', { monto: 10 }), /no autoriza/);
    assert.equal(audits.length, 0);
});
test('rechecks owner policy and exact command permissions before execution', async () => {
    context.refreshIdentity = async () => { context.assistantPolicy.run_bot_command = false; };
    await assert.rejects(run('economia:balance'), /deshabilitó/);
    context.refreshIdentity = null;
    context.assistantPolicy.run_bot_command = true;
    withGuild(G, () => economy.updateCommandPermission('economia:balance', false, []));
    await assert.rejects(run('economia:balance'), /deshabilitado/);
    withGuild(G, () => economy.updateCommandPermission('economia:balance', true, []));
});
test('rejects inaccessible and foreign channels before invoking handlers', async () => {
    channel.guildId = '900000000000000002';
    await assert.rejects(run('economia:balance'), /accesible/);
    channel.guildId = G;
    channel.permissionsFor = () => new PermissionsBitField();
    await assert.rejects(run('economia:balance'), /accesible/);
    assert.equal(audits.length, 0);
});
test('moderation requires native actor permissions even with command-matrix grants', async () => {
    context.member.permissions = new PermissionsBitField(P.ViewChannel);
    await assert.rejects(run('mod:purge', { cantidad: 1 }), /permiso nativo/);
});
test('audit failure after an executed command preserves result and prevents duplicate execution', async () => {
    const before = withGuild(G, () => economy.getAccount(USER).wallet);
    context.audit = action => { if (action === 'IA_COMANDO_RESULTADO') throw new Error('audit failure'); };
    const result = await run('economia:admin:dar', { monto: 11 });
    assert.ok(result.audit_warning);
    await run('economia:admin:dar', { monto: 11 });
    assert.equal(withGuild(G, () => economy.getAccount(USER).wallet), before + 11);
});
test('plans validate command-specific options before being saved', () => {
    assert.equal(validatePlan([{ tool: 'run_bot_command', args: { command: 'economia:balance', options: {}, channel_id: CHANNEL } }]).length, 1);
    assert.throws(() => validatePlan([{ tool: 'run_bot_command', args: { command: 'admin:panel-web', options: {}, channel_id: CHANNEL } }]));
});
test('a handler failure after writing is retained as uncertain and is not reexecuted', async () => {
    const command = require('../src/bot/commands/economia');
    const original = command.execute;
    let calls = 0;
    command.execute = async () => { calls++; throw new Error('failure after a possible write'); };
    try {
        const result = await run('economia:admin:dar', { monto: 12 });
        assert.equal(result.execution_status, 'UNCERTAIN');
        assert.match(result.error, /cambios parciales/);
        await run('economia:admin:dar', { monto: 12 });
        assert.equal(calls, 1);
    } finally { command.execute = original; }
});
test('private server commands update only the current community and return the real response', async () => {
    const serverId = withGuild(G, () => store.createPrivateServer({ guild_id: G, server_name: 'Alpha', server_code: 'test-only' }).id);
    const result = await run('servidor:ocupar', { servidor_id: Number(serverId), mision: 'Patrulla' });
    assert.equal(result.execution_status, 'RESPONDED', result.error);
    assert.equal(withGuild(G, () => store.getPrivateServerById(Number(serverId), G).status), 'EN_USO');
});
test('new command capability starts disabled and is saved independently by community', () => {
    const profile = community.ensureCommunity('900000000000000002');
    assert.equal(profile.assistant_bot_commands, 0);
    community.updateAssistant(G, { enabled: true, allowed_ids: [USER], daily_limit: 0, bot_commands: true });
    assert.equal(community.ensureCommunity(G).assistant_bot_commands, 1);
    assert.equal(community.ensureCommunity(profile.guild_id).assistant_bot_commands, 0);
});
test('event convocar uses the existing handler and actually publishes the registration panel', async () => {
    let published = 0;
    channel.type = 0;
    channel.send = async () => { published++; return { id: '300000000000000001' }; };
    const template = withGuild(G, () => economy.getEventReportTemplates(G, true)[0]);
    const result = await run('evento:convocar', { nombre: 'Reconocimiento', paga_base: 100, plantilla_id: template.id });
    assert.equal(result.execution_status, 'RESPONDED', result.error);
    assert.equal(published, 1);
    assert.match(result.responses[0].content, /activada/);
    const event = withGuild(G, () => economy.getRecentEvents(G, 1)[0]);
    assert.equal(event.registration_message_id, '300000000000000001');
    assert.equal(event.guild_id, G);
});
test('service keeps command receipts after provider failure and replay does not repeat a payout', async () => {
    Object.assign(process.env, { ASSISTANT_ENABLED: 'true', DEEPSEEK_API_KEY: 'test-only' });
    community.updateAssistant(G, { enabled: true, allowed_ids: [USER], daily_limit: 0, bot_commands: true });
    context.guild.members.fetchMe = async () => context.bot;
    const client = { isReady: () => true, guilds: { cache: new Map([[G, context.guild]]) } };
    const args = { command: 'economia:admin:dar', options: { monto: 19 }, channel_id: CHANNEL };
    const queue = [{ tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'run_bot_command', arguments: JSON.stringify(args) } }] },
        { content: JSON.stringify({ run_bot_command: 'request' }) }];
    const service = require('../src/assistant/service').getAssistant(client, { assistantFetch: async () => {
        const message = queue.shift();
        if (!message) throw new Error('Provider connection failed');
        return { ok: true, json: async () => ({ choices: [{ message }] }) };
    } });
    const before = withGuild(G, () => economy.getAccount(USER).wallet);
    const request = { guildId: G, userId: USER, requestId: 'command-service-replay-001', prompt: 'Dame 19 créditos en mi cartera' };
    const result = await service.run(request);
    assert.equal(result.failed, true);
    assert.equal(result.trace[0].execution_status, 'RESPONDED');
    assert.ok(result.trace[0].responses.length);
    assert.match(result.answer, /Ajuste Concedido/);
    assert.equal((await service.run(request)).replayed, true);
    assert.equal(withGuild(G, () => economy.getAccount(USER).wallet), before + 19);
});
after(() => { store.db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

const shop = (name, args) => {
    Object.assign(context.assistantPolicy, { configure_shop_item: true, configure_bonus_panel: true, publish_panel: true });
    return withGuild(G, () => executeTool(name, args, context));
};
test('shop configuration creates shared products, preserves omitted fields and withdraws without deletion', async () => {
    const created = await shop('configure_shop_item', { fields: { name: 'Radio', price: 250, stock: 8, description: 'Equipo', max_per_user: 0 } });
    assert.equal(created.created, true);
    const updated = await shop('configure_shop_item', { item_id: created.id, fields: { price: 300, is_active: false } });
    assert.equal(updated.item.description, 'Equipo');
    assert.equal(updated.item.stock, 8);
    assert.equal(updated.item.is_active, 0);
    assert.equal(withGuild(G, () => economy.getShopItemById(created.id).price), 300);
    const config = await shop('shop_configuration', {});
    assert.ok(config.items.some(item => item.id === created.id));
    assert.ok(Array.isArray(config.bonus_panels));
});
test('shop rejects invalid fields, disabled capability and unauthorized intent before writing', async () => {
    await assert.rejects(shop('configure_shop_item', { fields: { name: 'Invalid', price: -1 } }));
    await assert.rejects(shop('configure_shop_item', { fields: { name: 'Invalid', price: 1, guild_id: G } }));
    context.assistantPolicy.configure_shop_item = false;
    await assert.rejects(withGuild(G, () => executeTool('configure_shop_item', { fields: { name: 'Invalid', price: 1 } }, context)), /habilitar/);
    context.authorizeAction = async () => false;
    await assert.rejects(shop('configure_shop_item', { fields: { name: 'Invalid', price: 1 } }), /no autoriza/);
    assert.equal(audits.length, 0);
});
test('shop requires native administration and rechecks revoked capabilities', async () => {
    context.member.id = '100000000000000009';
    context.member.permissions = new PermissionsBitField(P.ViewChannel);
    await assert.rejects(shop('configure_shop_item', { fields: { name: 'Invalid', price: 1 } }), /Gestionar servidor/);
    context.member.id = USER;
    context.refreshIdentity = async () => { context.assistantPolicy.configure_shop_item = false; };
    await assert.rejects(shop('configure_shop_item', { fields: { name: 'Invalid', price: 1 } }), /deshabilitó/);
});
test('shop and bonus IDs cannot modify records from another guild', async () => {
    const other = '900000000000000002';
    const item = withGuild(other, () => economy.createShopItem({ guild_id: other, name: 'Foreign', price: 100 }));
    const panel = withGuild(other, () => economy.createBonusPanel(other, { title: 'Foreign' }));
    await assert.rejects(shop('configure_shop_item', { item_id: item.id, fields: { price: 1 } }), /no encontrado/);
    await assert.rejects(shop('configure_bonus_panel', { panel_id: panel.id, fields: { amount: 1 } }), /no encontrado/);
});
test('shop cannot sell privileged or integration-managed roles', async () => {
    context.guild.roles.fetch = async roleId => ({ id: roleId, guild: context.guild, managed: true, position: 1, permissions: new PermissionsBitField() });
    await assert.rejects(shop('configure_shop_item', { fields: { name: 'Dangerous', price: 1, roles_to_give: ['400000000000000001'] } }), /jerarquía/);
});
test('bonus configuration preserves settings and does not distribute funds', async () => {
    const balance = withGuild(G, () => economy.getAccount(USER).wallet);
    const created = await shop('configure_bonus_panel', { fields: { title: 'Bono diario', amount: 120, claim_mode: 'COOLDOWN', cooldown_seconds: 86400 } });
    const edited = await shop('configure_bonus_panel', { panel_id: created.id, fields: { button_label: 'Cobrar', description: 'Nueva descripción' } });
    assert.equal(edited.panel.amount, 120);
    assert.equal(edited.panel.claim_mode, 'COOLDOWN');
    assert.equal(withGuild(G, () => economy.getAccount(USER).wallet), balance);
});
test('publishing verification panel keeps real action buttons and suppresses mentions', async () => {
    let payload;
    channel.send = async value => { payload = value; return { id: '300000000000000002' }; };
    const result = await shop('publish_panel', { kind: 'verification', channel_id: CHANNEL, title: 'Bienvenidos', color: '#123456' });
    assert.equal(result.sent, true);
    assert.equal(payload.embeds[0].toJSON().title, 'Bienvenidos');
    assert.equal(payload.components[0].toJSON().components[0].custom_id, 'btn_start_verification');
    assert.deepEqual(payload.allowedMentions, { parse: [] });
    assert.match(result.url, /300000000000000002$/);
});
test('updating a panel rejects another author or a different panel type', async () => {
    channel.messages = { fetch: async () => ({ id: '300000000000000002', author: { id: USER }, components: [] }) };
    await assert.rejects(shop('publish_panel', { kind: 'verification', channel_id: CHANNEL, message_id: '300000000000000002' }), /no es un panel/);
    assert.equal(audits.length, 0);
});
test('panel edits reuse the same message and publishing failures are not audited as success', async () => {
    let edits = 0;
    channel.messages = { fetch: async () => ({ id: '300000000000000002', author: { id: BOT }, embeds: [],
        components: [{ components: [{ customId: 'btn_start_verification' }] }], edit: async () => { edits++; return { id: '300000000000000002' }; } }) };
    const result = await shop('publish_panel', { kind: 'verification', channel_id: CHANNEL, message_id: '300000000000000002', title: 'Actualizado' });
    assert.equal(result.updated, true);
    assert.equal(edits, 1);
    await shop('publish_panel', { kind: 'verification', channel_id: CHANNEL, message_id: '300000000000000002', title: 'Actualizado' });
    assert.equal(edits, 1);
    channel.send = async () => { throw new Error('Discord failure'); };
    await assert.rejects(shop('publish_panel', { kind: 'shop', channel_id: CHANNEL }), /Discord failure/);
    assert.equal(audits.filter(row => row[0] === 'IA_CONFIGURACION_RESULTADO').length, 1);
});
test('shop plans preserve nested fields and audit failures retain successful mutations', async () => {
    const actions = [{ tool: 'configure_shop_item', args: { fields: { name: 'Plan', price: 15, stock: 4 } } }];
    assert.deepEqual(validatePlan(actions), actions);
    context.audit = action => { if (action === 'IA_CONFIGURACION_RESULTADO') throw new Error('Audit failure'); };
    const result = await shop('configure_shop_item', actions[0].args);
    assert.equal(result.created, true);
    assert.ok(result.audit_warning);
    const replay = await shop('configure_shop_item', actions[0].args);
    assert.equal(replay.id, result.id);
});
