const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'usmc-discord-web-'));
Object.assign(process.env, { USMC_DB_PATH: path.join(temporary, 'isolated.sqlite'), GUILD_ID: '999999999999999999',
    CLIENT_ID: '888888888888888888', DISCORD_CLIENT_SECRET: 'test-only-secret', WEB_URL: 'https://unit.example' });
delete process.env.ADMIN_LEGACY_LOGIN;
const db = require('../src/database/db'), eco = require('../src/database/economyDb');
const { createWebServer } = require('../src/web/server');
const { oauthConfig } = require('../src/web/discordAuth');
const { Collection } = require('discord.js');
const adminId = '111111111111111111', officerId = '222222222222222222', otherId = '333333333333333333', recruitId = '444444444444444444', participantId = '555555555555555555';
const members = new Map();
function member(id, officer = false) {
    const row = { id, displayName: `Operator ${id[0]}`, user: { id, username: `user${id[0]}`, bot: false },
        permissions: { has: () => false }, roles: { cache: new Collection(officer ? [['officer', { id: 'officer' }]] : []) } };
    members.set(id, row); return row;
}
member(adminId); member(officerId, true); member(otherId, true); member(recruitId); member(participantId);
const messages = new Map(); let sequence = 1;
const channel = { id: '777777777777777777', name: 'operations', isTextBased: () => true, permissionsFor: () => ({ has: () => true }),
    messages: { fetch: async id => { if (!messages.has(id)) throw new Error('Deleted'); return messages.get(id); } },
    send: async payload => {
        payload.embeds?.forEach(embed => embed.toJSON()); payload.components?.forEach(row => row.toJSON());
        const row = { id: `123456789012345${String(sequence++).padStart(3, '0')}`, edit: async () => row }; messages.set(row.id, row); return row;
    } };
const guild = { id: process.env.GUILD_ID, ownerId: adminId, systemChannel: channel,
    channels: { cache: new Map([[channel.id, channel]]), fetch: async () => channel },
    members: { cache: members, fetch: async value => { const found = members.get(typeof value === 'string' ? value : value.user); if (!found) { const error = new Error('Not a member'); error.code = 10007; throw error; } return found; } } };
const client = { isReady: () => true, user: { id: process.env.CLIENT_ID }, guilds: { cache: new Map([[guild.id, guild]]) } };
const oauthFetch = async (url, init) => {
    let body;
    if (url.endsWith('/oauth2/token')) {
        const form = new URLSearchParams(init.body);
        assert.equal(form.get('redirect_uri'), oauthConfig().redirectUri);
        body = { access_token: form.get('code') };
    }
    else if (url.endsWith('/users/@me')) { const id = init.headers.Authorization.slice(7); body = { id, username: `discord-${id[0]}`, avatar: null }; }
    else if (url.includes('/guilds/')) body = { nick: 'Confirmed by Discord', roles: [] };
    else throw new Error('Unexpected request');
    return { ok: true, json: async () => body };
};
let http, base;
before(async () => {
    db.updateConfig(guild.id, { officer_role_id: 'officer' });
    http = createWebServer(client, { oauthFetch }).listen(0, '127.0.0.1');
    await new Promise(resolve => http.once('listening', resolve));
    base = `http://127.0.0.1:${http.address().port}`;
});
after(async () => { await new Promise(resolve => http.close(resolve)); db.db.close(); fs.rmSync(temporary, { recursive: true, force: true }); });
async function login(id, next = '/patrullas') {
    const start = await fetch(`${base}/auth/discord?next=${encodeURIComponent(next)}`, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const callback = await fetch(`${base}/auth/discord/callback?state=${state}&code=${id}`, { redirect: 'manual', headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] } });
    assert.equal(callback.status, 302);
    const cookie = callback.headers.getSetCookie().find(value => value.startsWith('usmc_discord=')).split(';')[0];
    const data = await fetch(base + '/api/auth/session', { headers: { Cookie: cookie } }).then(res => res.json());
    return { cookie, csrf: data.csrf_token, data, state };
}
async function api(session, url, method = 'GET', body, extra = {}) {
    return fetch(base + url, { method, headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrf,
        'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
}
test('OAuth state is browser-bound, single use and prevents external redirects', async () => {
    const start = await fetch(base + '/auth/discord?next=https://evil.example', { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    assert.equal((await fetch(`${base}/auth/discord/callback?state=${state}&code=${officerId}`, { redirect: 'manual' })).status, 400);
    const session = await login(officerId);
    assert.equal(session.data.access.patrol, true); assert.equal(session.data.access.admin, false);
    assert.equal((await fetch(`${base}/auth/discord/callback?state=${session.state}&code=${officerId}`, { headers: { Cookie: `usmc_oauth_state=${session.state}` } })).status, 400);
    const stored = db.db.prepare('SELECT token_hash FROM discord_web_sessions').all();
    assert.ok(stored.every(row => !session.cookie.includes(row.token_hash)));
});
test('public HTTP OAuth keeps the callback port and authenticates with browser-bound cookies', async () => {
    const previousUrl = process.env.WEB_URL;
    process.env.WEB_URL = 'http://va46.holy.gg:25757';
    try {
        const config = await fetch(base + '/api/auth/config').then(res => res.json());
        assert.equal(config.enabled, true);
        const start = await fetch(base + '/auth/discord?next=/patrullas', { redirect: 'manual' });
        assert.equal(start.status, 302);
        const authorize = new URL(start.headers.get('location'));
        assert.equal(authorize.origin, 'https://discord.com');
        assert.equal(authorize.searchParams.get('redirect_uri'), 'http://va46.holy.gg:25757/auth/discord/callback');
        const state = authorize.searchParams.get('state');
        const stateCookie = start.headers.getSetCookie().find(value => value.startsWith('usmc_oauth_state='));
        assert.match(stateCookie, /HttpOnly/);
        assert.match(stateCookie, /SameSite=Lax/i);
        assert.doesNotMatch(stateCookie, /;\s*Secure(?:;|$)/i);
        const callbackUrl = `${base}/auth/discord/callback?state=${state}&code=${officerId}`;
        assert.equal((await fetch(callbackUrl, { redirect: 'manual' })).status, 400);
        const callback = await fetch(callbackUrl, { redirect: 'manual', headers: { Cookie: stateCookie.split(';')[0] } });
        assert.equal(callback.status, 302);
        const sessionCookie = callback.headers.getSetCookie().find(value => value.startsWith('usmc_discord='));
        assert.match(sessionCookie, /HttpOnly/);
        assert.match(sessionCookie, /SameSite=Lax/i);
        assert.doesNotMatch(sessionCookie, /;\s*Secure(?:;|$)/i);
        const session = await fetch(base + '/api/auth/session', { headers: { Cookie: sessionCookie.split(';')[0] } }).then(res => res.json());
        assert.equal(session.success, true);
        const active = { cookie: sessionCookie.split(';')[0], csrf: session.csrf_token };
        assert.equal((await api(active, '/auth/logout', 'POST', {}, { Origin: 'http://other.example' })).status, 403);
        assert.equal((await api(active, '/auth/logout', 'POST', {}, { Origin: process.env.WEB_URL })).status, 200);
    } finally {
        process.env.WEB_URL = previousUrl;
    }
});
test('patrol sessions cannot enter admin; live role revocation and CSRF are enforced', async () => {
    const officer = await login(officerId);
    assert.equal((await api(officer, '/api/admin/data')).status, 403);
    assert.equal((await api(officer, '/api/patrol/events', 'POST', {}, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await fetch(base + '/api/admin/data', { headers: { Authorization: 'Bearer USMC-COMMAND-2026' } })).status, 401);
    members.get(officerId).roles.cache.clear();
    assert.equal((await api(officer, '/api/patrol/events')).status, 403);
    members.get(officerId).roles.cache.set('officer', { id: 'officer' });
    const admin = await login(adminId, '/admin');
    assert.equal((await api(admin, '/api/admin/data')).status, 200);
});
test('verification token can only be read and submitted by its Discord owner', async () => {
    const recruit = await login(recruitId), officer = await login(officerId);
    const token = db.createVerificationToken(recruitId, 'Recruit', '', guild.id);
    assert.equal((await fetch(`${base}/api/verify-data/${token}`)).status, 401);
    assert.equal((await api(officer, `/api/verify-data/${token}`)).status, 403);
    assert.equal((await api(recruit, `/api/verify-data/${token}`)).status, 200);
    assert.equal((await api(recruit, `/api/verify/${token}`, 'POST', { answers: {} }, { 'X-CSRF-Token': '' })).status, 403);
    const ownLink = await api(recruit, '/verify');
    assert.equal(ownLink.status, 200);
    assert.equal((await api(recruit, '/api/patrol/events')).status, 403);
});
test('owner can add attendees and publish registration; another officer cannot mutate or read account balances', async () => {
    const owner = await login(officerId), other = await login(otherId);
    const event = eco.createEvent({ guild_id: guild.id, name: 'Portal exercise', event_type: 'REGISTRATION', base_reward: 25,
        registration_channel_id: channel.id, target_channel_id: channel.id, created_by_id: officerId, created_by_name: 'Officer' }).event;
    assert.equal((await api(other, `/api/patrol/events/${event.id}/participants`, 'POST', { ids: participantId })).status, 403);
    assert.equal((await api(owner, `/api/patrol/events/${event.id}/participants`, 'POST', { ids: participantId })).status, 200);
    const detail = await api(other, `/api/patrol/events/${event.id}`).then(res => res.json());
    assert.equal(detail.roster.attendees.length, 1);
    assert.equal(Object.hasOwn(detail.roster.attendees[0], 'wallet'), false);
    assert.equal(Object.hasOwn(detail.roster.attendees[0], 'bank'), false);
    assert.equal((await api(owner, `/api/patrol/events/${event.id}/registration`, 'POST', {})).status, 200);
    const sent = messages.size;
    assert.equal((await api(owner, `/api/patrol/events/${event.id}/registration`, 'POST', {})).status, 200);
    assert.equal(messages.size, sent);
    const foreign = eco.createEvent({ guild_id: 'foreign', name: 'Other community', base_reward: 0, created_by_id: officerId }).event;
    assert.equal((await api(owner, `/api/patrol/events/${foreign.id}`)).status, 404);
});
test('web finalization and report correction share the Discord payout and never pay twice', async () => {
    const owner = await login(officerId);
    const event = eco.createEvent({ guild_id: guild.id, name: 'AAR exercise', event_type: 'REGISTRATION', base_reward: 25,
        registration_channel_id: channel.id, payout_channel_id: channel.id, target_channel_id: channel.id,
        created_by_id: officerId, created_by_name: 'Officer' }).event;
    await api(owner, `/api/patrol/events/${event.id}/participants`, 'POST', { ids: participantId });
    assert.equal((await api(owner, `/api/patrol/events/${event.id}/report`, 'PUT', { result: 'Objetivos completados', team_key: 'alpha', team_ids: participantId })).status, 200);
    eco.getAccount(participantId, guild.id); const initial = eco.getAccount(participantId).wallet;
    const end = await api(owner, `/api/patrol/events/${event.id}/finalize`, 'POST', {});
    assert.equal(end.status, 200, JSON.stringify(await end.json()));
    assert.equal(eco.getAccount(participantId).wallet, initial + 25);
    assert.ok(eco.getEventById(event.id).report_message_id);
    assert.equal((await api(owner, `/api/patrol/events/${event.id}/finalize`, 'POST', {})).status, 409);
    assert.equal((await api(owner, `/api/patrol/events/${event.id}/report/publish`, 'POST', {})).status, 200);
    assert.equal(eco.getAccount(participantId).wallet, initial + 25);
    assert.equal((await api(owner, `/api/patrol/events/${event.id}/participants`, 'POST', { ids: recruitId })).status, 409);
});

test('only the event owner can take roll; attendance is shared with Discord and excludes absent or unresponsive payouts', async () => {
    const owner = await login(officerId), other = await login(otherId), admin = await login(adminId);
    const event = eco.createEvent({ guild_id: guild.id, name: 'Pase de lista', event_type: 'REGISTRATION', base_reward: 31,
        registration_channel_id: channel.id, payout_channel_id: channel.id, target_channel_id: channel.id,
        created_by_id: officerId, created_by_name: 'Officer' }).event;
    await api(owner, `/api/patrol/events/${event.id}/participants`, 'POST', { ids: `${participantId} ${recruitId} ${otherId}` });
    const endpoint = `/api/patrol/events/${event.id}/roll-call`;
    assert.equal((await api(other, endpoint, 'PUT', { discord_id: participantId, state: 'ABSENT' })).status, 403);
    assert.equal((await api(admin, endpoint, 'PUT', { discord_id: participantId, state: 'ABSENT' })).status, 403);
    assert.equal((await api(owner, endpoint, 'PUT', { discord_id: participantId, state: 'BOGUS' })).status, 400);
    assert.equal((await api(owner, endpoint, 'PUT', { discord_id: adminId, state: 'PRESENT' })).status, 409);
    for (const [id, state] of [[participantId, 'PRESENT'], [recruitId, 'ABSENT'], [otherId, 'NO_RESPONSE']]) {
        assert.equal((await api(owner, endpoint, 'PUT', { discord_id: id, state })).status, 200);
    }
    assert.equal(eco.confirmAttendanceForEvent(event.id, recruitId).success, false);
    const detail = await api(owner, `/api/patrol/events/${event.id}`).then(res => res.json());
    assert.equal(detail.event.can_take_roll, true);
    assert.deepEqual(detail.roll_call, { total: 3, present: 1, absent: 1, no_response: 1, pending: 0 });
    assert.equal((await api(other, `/api/patrol/events/${event.id}`).then(res => res.json())).event.can_take_roll, false);
    const discordPanel = require('../src/bot/commands/eventos').buildEventRosterPanel(event);
    const panelText = discordPanel.embeds[0].toJSON().description;
    for (const state of ['Presente', 'Ausente', 'No responde']) assert.ok(panelText.includes(state));
    assert.ok(discordPanel.components.some(row => row.toJSON().components.some(component => component.url?.endsWith(`?evento=${event.id}`))));
    const before = [participantId, recruitId, otherId].map(id => eco.getAccount(id, guild.id).wallet);
    assert.equal((await api(owner, `/api/patrol/events/${event.id}/finalize`, 'POST', {})).status, 200);
    assert.equal(eco.getAccount(participantId).wallet, before[0] + 31);
    assert.equal(eco.getAccount(recruitId).wallet, before[1]);
    assert.equal(eco.getAccount(otherId).wallet, before[2]);
    assert.equal(eco.getUserEventRecord(event.id, recruitId).roll_call_status, 'ABSENT');
    assert.equal((await api(owner, endpoint, 'PUT', { discord_id: recruitId, state: 'PRESENT' })).status, 409);
    const audit = db.db.prepare("SELECT * FROM admin_audit_logs WHERE action = 'PASAR_LISTA_WEB'").all();
    assert.ok(audit.length >= 3);
});

test('roll call can be corrected before closing and cannot mark withdrawn attendees or cross guild events', async () => {
    const owner = await login(officerId);
    const event = eco.createEvent({ guild_id: guild.id, name: 'Corrección de asistencia', event_type: 'VOICE', base_reward: 0,
        created_by_id: officerId }).event;
    eco.syncEventParticipantsByIds(event.id, [participantId]);
    const endpoint = `/api/patrol/events/${event.id}/roll-call`;
    for (const state of ['ABSENT', 'NO_RESPONSE', 'PRESENT']) {
        assert.equal((await api(owner, endpoint, 'PUT', { discord_id: participantId, state })).status, 200);
        assert.equal(eco.getUserEventRecord(event.id, participantId).is_eligible, state === 'PRESENT' ? 1 : 0);
    }
    eco.expelUserFromEvent(event.id, participantId);
    assert.equal((await api(owner, endpoint, 'PUT', { discord_id: participantId, state: 'PRESENT' })).status, 409);
    const foreign = eco.createEvent({ guild_id: 'other-community', name: 'Foreign roll call', base_reward: 0, created_by_id: officerId }).event;
    assert.equal((await api(owner, `/api/patrol/events/${foreign.id}/roll-call`, 'PUT', { discord_id: participantId, state: 'PRESENT' })).status, 404);
    const tracked = eco.createEvent({ guild_id: guild.id, name: 'Automatic attendance', event_type: 'VOICE', base_reward: 10, created_by_id: officerId }).event;
    eco.syncEventParticipantsByIds(tracked.id, [participantId]);
    eco.setEventRollCall(tracked.id, participantId, 'NO_RESPONSE', officerId);
    db.db.prepare('UPDATE event_attendance SET total_seconds_present = 999999 WHERE event_id = ?').run(tracked.id);
    assert.equal(eco.massPayoutEvent(tracked.id).paidCount, 0);
    assert.equal(eco.getUserEventRecord(tracked.id, participantId).is_eligible, 0);
});

test('training roles and its published report honor the roll call', async () => {
    const owner = await login(officerId), awarded = [];
    const role = { id: '666666666666666666', managed: false, editable: true, toString: () => '<@&666666666666666666>' };
    guild.roles = { cache: new Map([[role.id, role]]) };
    for (const id of [participantId, recruitId, otherId]) members.get(id).roles.add = async () => { awarded.push(id); };
    const event = eco.createEvent({ guild_id: guild.id, name: 'Training roll call', event_type: 'TRAINING', base_reward: 0, reward_role_id: role.id,
        registration_channel_id: channel.id, target_channel_id: channel.id, created_by_id: officerId }).event;
    eco.syncEventParticipantsByIds(event.id, [participantId, recruitId, otherId]);
    eco.setEventRollCall(event.id, participantId, 'PRESENT', officerId);
    eco.setEventRollCall(event.id, recruitId, 'ABSENT', officerId);
    eco.setEventRollCall(event.id, otherId, 'NO_RESPONSE', officerId);
    assert.equal((await api(owner, `/api/patrol/events/${event.id}/finalize`, 'POST', {})).status, 200);
    assert.deepEqual(awarded, [participantId]);
    assert.ok(eco.getEventById(event.id).report_message_id);
});

test('large roll calls keep page positions when marking attendees and count the whole event', async () => {
    const owner = await login(officerId);
    const event = eco.createEvent({ guild_id: guild.id, name: 'Large roll call', event_type: 'REGISTRATION', base_reward: 0, created_by_id: officerId }).event;
    const ids = Array.from({ length: 30 }, (_, index) => String(600000000000000000n + BigInt(index)));
    eco.syncEventParticipantsByIds(event.id, ids);
    const read = page => api(owner, `/api/patrol/events/${event.id}?page=${page}`).then(res => res.json());
    const first = await read(1), second = await read(2);
    assert.equal(first.roster.attendees.length, 25);
    assert.equal(second.roster.attendees.length, 5);
    assert.equal((await api(owner, `/api/patrol/events/${event.id}/roll-call`, 'PUT', { discord_id: ids[0], state: 'ABSENT' })).status, 200);
    assert.deepEqual((await read(1)).roster.attendees.map(member => member.discord_id), first.roster.attendees.map(member => member.discord_id));
    const after = await read(2);
    assert.deepEqual(after.roster.attendees.map(member => member.discord_id), second.roster.attendees.map(member => member.discord_id));
    assert.deepEqual(after.roll_call, { total: 30, present: 0, absent: 1, no_response: 0, pending: 29 });
});

test('verification requires complete answers, consumes its token and prevents duplicate review submissions', async () => {
    const session = await login(recruitId);
    const token = db.createVerificationToken(recruitId, 'Recruit', '', guild.id);
    assert.equal((await api(session, `/api/verify/${token}`, 'POST', { answers: {} })).status, 400);
    const answers = {};
    for (const question of db.getQuestions()) answers[question.label] = question.field_type === 'number' ? '22' : question.options?.[0] || 'Respuesta válida';
    assert.equal((await api(session, `/api/verify/${token}`, 'POST', { answers })).status, 200);
    assert.equal(db.getVerificationByDiscordId(recruitId).status, 'PENDIENTE');
    assert.equal(db.getVerificationToken(token), undefined);
    const duplicate = db.createVerificationToken(recruitId, 'Recruit', '', guild.id);
    assert.equal((await api(session, `/api/verify/${duplicate}`, 'POST', { answers })).status, 409);
});

test('session logout rejects CSRF, revokes the cookie session and is independent of live roles', async () => {
    const session = await login(otherId);
    assert.equal((await api(session, '/auth/logout', 'POST', {}, { Origin: 'https://evil.example' })).status, 403);
    members.get(otherId).roles.cache.clear();
    assert.equal((await api(session, '/auth/logout', 'POST', {})).status, 200);
    assert.equal((await api(session, '/api/auth/session')).status, 401);
    members.get(otherId).roles.cache.set('officer', { id: 'officer' });
});
