const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rico-portal-'));
const ownerId = '111111111111111111', adminId = '222222222222222222', guestId = '333333333333333333';
Object.assign(process.env, { USMC_DB_PATH: path.join(temporary, 'isolated.sqlite'), GUILD_ID: '999999999999999999',
    CLIENT_ID: '888888888888888888', DISCORD_CLIENT_SECRET: 'test-only-secret', WEB_URL: 'https://unit.example', BOT_OWNER_IDS: ownerId });
const db = require('../src/database/db');
const { createWebServer } = require('../src/web/server');
const client = new EventEmitter();
client.isReady = () => true;
client.ws = { ping: 42 };
const member = { displayName: 'Administrator', permissions: { has: () => false }, roles: { cache: new Map() } };
function guild(id, name, owner) { return { id, name, ownerId: owner, joinedTimestamp: Date.now(), available: true, iconURL: () => null,
    members: { fetch: async value => { if (value.user === owner) return member; const error = new Error('not a member'); error.code = 10007; throw error; } } }; }
const primary = guild(process.env.GUILD_ID, 'Primary', adminId), other = guild('777777777777777777', 'Second', adminId);
client.guilds = { cache: new Map([[primary.id, primary], [other.id, other]]) };
const oauthFetch = async url => ({ ok: true, json: async () => {
    if (url.endsWith('/oauth2/token')) return { access_token: 'test' };
    if (url.endsWith('/users/@me')) return { id: guestId, username: 'Guest' };
    throw new Error('Portal login must not require membership of the primary guild');
} });
let http, base;
before(async () => { http = createWebServer(client, { oauthFetch }).listen(0, '127.0.0.1'); await new Promise(resolve => http.once('listening', resolve)); base = `http://127.0.0.1:${http.address().port}`; });
after(async () => { await new Promise(resolve => http.close(resolve)); db.db.close(); fs.rmSync(temporary, { recursive: true, force: true }); });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function cookie(id, expired = false) { const token = crypto.randomBytes(32).toString('base64url'); db.db.prepare('INSERT INTO discord_web_sessions VALUES (?, ?, ?, ?, ?, ?, ?)').run(hash(token), id, process.env.GUILD_ID, 'Test user', '', crypto.randomBytes(32).toString('base64url'), Date.now() + (expired ? -100 : 100000)); return `usmc_discord=${token}`; }
const get = (url, token) => fetch(base + url, { headers: token ? { Cookie: token } : {} });
test('public presentation and identity metadata do not expose private installations', async () => {
    for (const url of ['/', '/portal', '/owner', '/portal.css', '/portal.js', '/privacidad', '/soporte']) assert.equal((await get(url)).status, 200);
    const data = await get('/api/public/bot').then(res => res.json());
    assert.equal(Object.hasOwn(data, 'installations'), false);
    assert.equal(new URL(data.invite_url).searchParams.get('permissions'), '0');
    assert.equal((await get('/api/owner/overview')).status, 401);
    assert.equal((await get('/api/portal/communities')).status, 401);
});
test('guild administrator and master key cannot access owner API; allowlist fails closed', async () => {
    const token = cookie(adminId);
    assert.equal((await get('/api/owner/overview', token)).status, 403);
    assert.equal((await fetch(base + '/api/owner/overview', { headers: { Authorization: 'Bearer USMC-COMMAND-2026' } })).status, 401);
    const owner = cookie(ownerId);
    const overview = await get('/api/owner/overview', owner).then(res => res.json());
    assert.equal(overview.installations.length, 2); assert.equal(overview.bot.ping, 42);
    delete process.env.BOT_OWNER_IDS;
    assert.equal((await get('/api/owner/overview', owner)).status, 403);
    process.env.BOT_OWNER_IDS = ownerId;
    assert.equal((await get('/api/owner/overview', cookie(ownerId, true))).status, 401);
});
test('community selector checks membership and links each isolated guild dashboard', async () => {
    const data = await get('/api/portal/communities', cookie(adminId)).then(res => res.json());
    assert.equal(data.communities.find(row => row.id === primary.id).url, `/admin?guild=${primary.id}`);
    assert.equal(data.communities.find(row => row.id === other.id).url, `/admin?guild=${other.id}`);
    assert.equal(data.owner, false);
    assert.equal((await get('/api/portal/communities', cookie(guestId)).then(res => res.json())).communities.length, 0);
});
test('join and leave are persisted, temporary unavailability is not a departure', async () => {
    const added = guild('666666666666666666', 'New guild', guestId);
    client.guilds.cache.set(added.id, added); client.emit('guildCreate', added);
    assert.ok(db.db.prepare('SELECT * FROM bot_installations WHERE guild_id = ?').get(added.id));
    client.emit('guildDelete', { ...added, available: false });
    assert.equal(db.db.prepare('SELECT left_at FROM bot_installations WHERE guild_id = ?').get(added.id).left_at, null);
    client.guilds.cache.delete(added.id); client.emit('guildDelete', added);
    assert.ok(db.db.prepare('SELECT left_at FROM bot_installations WHERE guild_id = ?').get(added.id).left_at);
});
test('portal OAuth accepts an identified account outside the main guild', async () => {
    const start = await fetch(base + '/auth/discord?next=/portal', { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const callback = await fetch(`${base}/auth/discord/callback?state=${state}&code=guest`, { redirect: 'manual', headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] } });
    assert.equal(callback.headers.get('location'), '/portal');
    assert.ok(callback.headers.getSetCookie().some(value => value.startsWith('usmc_discord=')));
});

test('owner sees reported token counters and requires the dedicated DeepSeek credential', async () => {
    const previous = { provider: process.env.ASSISTANT_PROVIDER, legacy: process.env.ASSISTANT_API_KEY, deepseek: process.env.DEEPSEEK_API_KEY };
    process.env.ASSISTANT_PROVIDER = 'deepseek'; process.env.ASSISTANT_API_KEY = 'test-legacy-only'; delete process.env.DEEPSEEK_API_KEY;
    db.db.prepare(`INSERT INTO assistant_usage(guild_id,user_id,request_id,round_index,provider,model,prompt_tokens,completion_tokens,total_tokens,cache_hit_tokens,cache_miss_tokens,created_at)
        VALUES(?,?,?,0,'deepseek','deepseek-flash',512,10,522,384,128,?)`).run(primary.id, adminId, 'owner-usage-test', Date.now());
    try {
        const overview = await get('/api/owner/overview', cookie(ownerId)).then(res => res.json());
        assert.equal(overview.setup.provider, false);
        const row = overview.installations.find(item => item.guild_id === primary.id);
        assert.equal(row.assistant_effective_provider, 'deepseek'); assert.equal(row.assistant_key_present, false);
        assert.equal(row.usage.cache_hit_tokens, 384); assert.equal(Object.hasOwn(row.usage, 'user_id'), false);
        assert.equal(JSON.stringify(overview).includes('test-legacy-only'), false);
    } finally {
        for (const [key, value] of [['ASSISTANT_PROVIDER', previous.provider], ['ASSISTANT_API_KEY', previous.legacy], ['DEEPSEEK_API_KEY', previous.deepseek]]) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
});
