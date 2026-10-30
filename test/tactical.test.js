const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'usmc-tactical-'));
process.env.USMC_DB_PATH = path.join(temporary, 'isolated.sqlite');
process.env.GUILD_ID = 'test-guild';
const db = require('../src/database/db');
const eco = require('../src/database/economyDb');
const events = require('../src/bot/commands/eventos');
const { handleInteraction } = require('../src/bot/handlers/interactionHandler');
after(() => { db.db.close(); fs.rmSync(temporary, { recursive: true, force: true }); });
const server = () => db.createPrivateServer({ guild_id: 'test-guild', server_name: 'Alpha', server_code: 'VIP-TEST' });

test('reservations are scoped, exclusive, and retain event ownership', () => {
    const srv = server();
    assert.equal(db.getPrivateServerById(srv.id, 'other-guild'), undefined);
    assert.equal(db.occupyPrivateServer(srv.id, '1', 'A', 'Patrol', 1, 'other-guild').success, false);
    assert.equal(db.occupyPrivateServer(srv.id, '1', 'A', 'Patrol', 1, 'test-guild').success, true);
    assert.equal(db.occupyPrivateServer(srv.id, '2', 'B', 'Other', 2, 'test-guild').success, false);
    assert.equal(db.deletePrivateServer(srv.id, 'test-guild'), false);
    assert.equal(db.releasePrivateServerByEventId(2, 'test-guild').length, 0);
    assert.equal(db.getPrivateServerById(srv.id).current_event_id, 1);
});
test('event creation rolls back if its server is busy and unpublished events can be cancelled', () => {
    const srv = server();
    const args = { guild_id: 'test-guild', name: 'Exercise', base_reward: 10, event_type: 'REGISTRATION', private_server_id: srv.id };
    const first = eco.createEvent(args);
    assert.equal(first.success, true);
    const before = db.db.prepare('SELECT COUNT(*) n FROM event_payouts').get().n;
    assert.equal(eco.createEvent(args).success, false);
    assert.equal(db.db.prepare('SELECT COUNT(*) n FROM event_payouts').get().n, before);
    assert.equal(eco.cancelUnpublishedEvent(first.event.id, 'test-guild'), true);
    assert.equal(db.getPrivateServerById(srv.id).status, 'LIBRE');
    assert.equal(eco.getEventById(first.event.id), undefined);
});
test('board reference survives an empty catalog and all pages serialize', () => {
    db.saveServerBoardMessage('empty-guild', 'channel', 'message');
    assert.equal(db.getServerBoardMessage('empty-guild').board_message_id, 'message');
    for (let i = 0; i < 28; i++) server();
    const build = require('../src/bot/commands/servidor').buildPrivateServersPanel;
    const panel = build('test-guild', 6);
    assert.ok(panel.embeds[0].toJSON().fields.length <= 4);
    panel.components.forEach(row => row.toJSON());
    assert.ok(build('empty-guild').embeds[0].toJSON().fields[0].value);
});
test('shop refunds restore balance, stock and inventory once only', () => {
    eco.getAccount('buyer', 'test-guild'); eco.addWallet('buyer', 1000);
    const initial = eco.getAccount('buyer').wallet;
    const item = eco.createShopItem({ guild_id: 'test-guild', name: 'Patch', price: 250, stock: 2 });
    const order = eco.purchaseShopItem('buyer', item.id, [], 'test-guild');
    assert.equal(order.success, true);
    assert.equal(eco.getAccount('buyer').wallet, initial - 250);
    assert.equal(eco.refundShopOrder(order.orderId), true);
    assert.equal(eco.refundShopOrder(order.orderId), false);
    assert.equal(eco.getAccount('buyer').wallet, initial);
    assert.equal(eco.getShopItemById(item.id).stock, 2);
    assert.equal(db.db.prepare('SELECT COUNT(*) n FROM economy_inventory WHERE discord_id = ? AND item_id = ?').get('buyer', item.id).n, 0);
    assert.equal(eco.purchaseShopItem('buyer', item.id, [], 'other-guild').success, false);
    assert.equal(eco.purchaseShopItem('buyer', item.id, [], 'test-guild', 1).success, false);
    assert.equal(eco.getAccount('buyer').wallet, initial);
});
test('IDs modal opens as the initial response and supports multiple teams', async () => {
    const event = eco.createEvent({ guild_id: 'test-guild', name: 'Multi squad', base_reward: 0 }).event;
    const draft = { requested_by: '123456789012345678', active_team: 'alpha', teams: {
        alpha: { members: ['123456789012345678'], leader_id: '123456789012345678' },
        bravo: { members: ['223456789012345678'], leader_id: '223456789012345678' }
    } };
    eco.saveEventFinalizationDraft(event.id, draft);
    let shown;
    await handleInteraction({ isChatInputCommand: () => false, isButton: () => true,
        guild: { ownerId: '123456789012345678' }, guildId: 'test-guild', member: {},
        user: { id: '123456789012345678' }, createdTimestamp: Date.now(),
        customId: `event_finalize_ids_${event.id}`, showModal: async modal => { shown = modal.toJSON(); }
    }, {}, new Map());
    assert.equal(shown.custom_id, `event_finalize_ids_modal_${event.id}_alpha`);
    assert.equal(shown.components.length, 5);
    const panel = events.buildEventFinalizationPanel(event, draft);
    panel.components.forEach(row => row.toJSON());
    assert.match(panel.embeds[0].toJSON().description, /2 equipos/);
});
test('editing a deleted report fails without posting a duplicate', async () => {
    const event = eco.createEvent({ guild_id: 'test-guild', name: 'Missing report', base_reward: 0 }).event;
    let sends = 0;
    const channel = { isTextBased: () => true, messages: { fetch: async () => { throw new Error('Deleted'); } }, send: async () => { sends++; } };
    await assert.rejects(events.publishEventReport({ guild: { channels: { cache: new Map([['channel', channel]]) } },
        channel, channelId: 'channel', user: { id: '123456789012345678' } },
        { ...event, report_channel_id: 'channel', report_message_id: 'missing' }, {}, null, '', '', true), /original/);
    assert.equal(sends, 0);
});

test('finalization command opens the editor for active events and rejects editing an unpublished report', async () => {
    const event = eco.createEvent({ guild_id: 'test-guild', name: 'Active exercise', base_reward: 10 }).event;
    let payload, sub = 'finalizar';
    const interaction = { guild: { ownerId: '123456789012345678' }, guildId: 'test-guild',
        user: { id: '123456789012345678' }, member: { displayName: 'Officer' },
        options: { getSubcommand: () => sub, getInteger: () => event.id, getAttachment: () => null, getString: () => null },
        reply: async value => { payload = value; } };
    await events.execute(interaction);
    assert.ok(payload.components.length > 0);
    sub = 'editar-reporte';
    await events.execute(interaction);
    assert.match(payload.content, /finalizados/);
});

test('IDs submission acknowledges before fetching Discord members and assigns its captured team', async () => {
    const event = eco.createEvent({ guild_id: 'test-guild', name: 'IDs exercise', base_reward: 0 }).event;
    const officer = '123456789012345678', soldier = '323456789012345678';
    eco.saveEventFinalizationDraft(event.id, { requested_by: officer, active_team: 'bravo', teams: {} });
    let acknowledged = false;
    await handleInteraction({
        isChatInputCommand: () => false, isButton: () => false, isStringSelectMenu: () => false,
        isUserSelectMenu: () => false, isModalSubmit: () => true, createdTimestamp: Date.now(),
        customId: `event_finalize_ids_modal_${event.id}_alpha`, user: { id: officer }, member: {}, guildId: 'test-guild', message: {},
        guild: { ownerId: officer, members: { cache: new Map(), fetch: async () => { assert.equal(acknowledged, true); return { displayName: 'Soldier' }; } } },
        fields: { getTextInputValue: key => key === 'team_ids' ? soldier : '' },
        deferUpdate: async () => { acknowledged = true; }, editReply: async payload => payload.components.forEach(row => row.toJSON())
    }, {}, new Map());
    assert.deepEqual(eco.getEventFinalizationDraft(event.id).teams.alpha.members, [soldier]);
});

test('failed Discord role delivery refunds the purchase', async () => {
    const { processShopPurchase } = require('../src/bot/commands/tienda');
    const id = '923456789012345678';
    eco.getAccount(id, 'test-guild'); eco.addWallet(id, 1000);
    const initial = eco.getAccount(id).wallet;
    const item = eco.createShopItem({ guild_id: 'test-guild', name: 'Rank', price: 200, stock: 1, roles_to_give: ['role'] });
    const member = { roles: { cache: new Map(), add: async () => { throw new Error('Discord unavailable'); }, remove: async () => {} } };
    let receipt;
    const interaction = { user: { id }, member, guildId: 'test-guild',
        guild: { members: { fetch: async () => member }, roles: { cache: new Map([['role', { editable: true }]]) } },
        deferUpdate: async () => { interaction.deferred = true; }, editReply: async payload => { receipt = payload; } };
    await processShopPurchase(interaction, item.id, true, item.price);
    assert.equal(eco.getAccount(id).wallet, initial);
    assert.equal(eco.getShopItemById(item.id).stock, 1);
    assert.match(receipt.content, /reembolsado/);
});

test('web API scopes servers, rejects stale toggles and audits the session identity', async () => {
    const { createWebServer } = require('../src/web/server');
    const app = createWebServer(null);
    const http = app.listen(0, '127.0.0.1');
    await new Promise(resolve => http.once('listening', resolve));
    try {
        const session = db.createAdminSession('Real Officer', '123456789012345678');
        const url = `http://127.0.0.1:${http.address().port}/api/admin/servers`;
        const request = (suffix, method, body) => fetch(url + suffix, { method,
            headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json', 'X-Operator-Name': 'Spoofed' },
            body: body ? JSON.stringify(body) : undefined });
        const response = await request('', 'POST', { server_name: 'Web Server', server_code: 'TEST' });
        assert.equal(response.status, 200);
        const { server: srv } = await response.json();
        assert.equal((await request(`/${srv.id}/toggle`, 'POST', { expected_status: 'LIBRE', mission: 'Exercise' })).status, 200);
        assert.equal((await request(`/${srv.id}/toggle`, 'POST', { expected_status: 'LIBRE' })).status, 409);
        assert.equal((await request(`/${srv.id}`, 'DELETE')).status, 409);
        const foreign = db.createPrivateServer({ guild_id: 'other-guild', server_name: 'Foreign' });
        assert.equal((await request(`/${foreign.id}`, 'DELETE')).status, 404);
        const audit = db.getAdminAuditLogs(10).find(log => log.target_id === `SRV #${srv.id}`);
        assert.equal(audit.actor, 'Real Officer');
    } finally { await new Promise(resolve => http.close(resolve)); }
});

test('patrulla command gives authorized officers a direct portal button', async () => {
    const command = require('../src/bot/commands/patrulla');
    const previous = process.env.WEB_URL;
    process.env.WEB_URL = 'https://unit.example';
    try {
        let payload;
        await command.execute({ guild: { ownerId: '123456789012345678' }, guildId: 'test-guild', member: {},
            user: { id: '123456789012345678' }, reply: async data => { payload = data; } });
        assert.equal(payload.components[0].toJSON().components[0].url, 'https://unit.example/patrullas?guild=test-guild');
        assert.equal(payload.embeds[0].toJSON().image.url, 'https://unit.example/media/patrol-field.png');
    } finally { if (previous === undefined) delete process.env.WEB_URL; else process.env.WEB_URL = previous; }
});
