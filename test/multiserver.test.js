const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rico-multiserver-'));
const A = '900000000000000001', B = '900000000000000002', user = '100000000000000001', owner = '100000000000000002', outsider = '100000000000000003';
Object.assign(process.env, { USMC_DB_PATH: path.join(temporary, 'database.sqlite'), GUILD_ID: A, CLIENT_ID: '800000000000000001', BOT_OWNER_IDS: owner,
    DISCORD_CLIENT_SECRET: 'test-secret', WEB_URL: 'https://test.example', ASSISTANT_ENABLED: 'true', DEEPSEEK_API_KEY: 'test-provider-secret' });
// Representative legacy database, before either module runs its migrations.
let Database; try { Database = require('better-sqlite3'); } catch { Database = require('node:sqlite').DatabaseSync; }
const old = new Database(process.env.USMC_DB_PATH);
old.exec(`CREATE TABLE config(guild_id TEXT PRIMARY KEY, verified_role_id TEXT, unverified_role_id TEXT, officer_role_id TEXT, admin_role_id TEXT, log_channel_id TEXT, review_channel_id TEXT, verification_mode TEXT DEFAULT 'manual', military_base_name TEXT, military_subtitle TEXT);
    CREATE TABLE economy_accounts(discord_id TEXT PRIMARY KEY, username TEXT, avatar TEXT, wallet INTEGER DEFAULT 0, bank INTEGER DEFAULT 0, bank_capacity INTEGER DEFAULT 50000, last_work INTEGER DEFAULT 0, last_crime INTEGER DEFAULT 0, last_rob INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE verifications(id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL, avatar TEXT, answers_json TEXT NOT NULL, status TEXT DEFAULT 'PENDIENTE', reviewer_id TEXT, reviewer_name TEXT, reason TEXT, created_at TEXT, updated_at TEXT);`);
old.exec(`CREATE TABLE economy_settings(guild_id TEXT PRIMARY KEY, currency_name TEXT, currency_symbol TEXT DEFAULT '$', work_min INTEGER DEFAULT 50, work_max INTEGER DEFAULT 250, work_cooldown INTEGER DEFAULT 3600, crime_min INTEGER DEFAULT 100, crime_max INTEGER DEFAULT 600, crime_cooldown INTEGER DEFAULT 7200, crime_fail_rate INTEGER DEFAULT 45, rob_cooldown INTEGER DEFAULT 14400, rob_fail_rate INTEGER DEFAULT 50, starting_balance INTEGER DEFAULT 100, log_channel_id TEXT);`);
old.prepare('INSERT INTO economy_settings(guild_id,currency_name) VALUES (?,?)').run('GLOBAL', 'Legacy global');
old.prepare('INSERT INTO economy_settings(guild_id,currency_name) VALUES (?,?)').run(A, 'Primary custom');
old.prepare('INSERT INTO config(guild_id,military_base_name) VALUES (?,?)').run(A, 'USMC original');
old.prepare('INSERT INTO economy_accounts(discord_id,username,wallet,bank) VALUES (?,?,?,?)').run(user, 'Original', 1200, 450);
old.prepare('INSERT INTO verifications(discord_id,username,answers_json) VALUES (?,?,?)').run(user, 'Original', '{"dato":"USMC"}'); old.close();
const db = require('../src/database/db'), eco = require('../src/database/economyDb'), communities = require('../src/database/communityDb');
const { withGuild } = require('../src/database/guildContext');
const { createWebServer } = require('../src/web/server');
const { registerCommands } = require('../src/bot/registerCommands');
const { getAssistant } = require('../src/assistant/service');
const guilds = new Map([A, B].map(id => [id, { id, name: `Community ${id.slice(-1)}`, ownerId: user, available: true, iconURL: () => null,
    members: { fetch: async value => { if (value.user === outsider && id === B) { const error = new Error('not member'); error.code = 10007; throw error; } return { id: value.user, displayName: 'Operator', roles: { cache: new Map() }, permissions: { has: () => value.user !== outsider } }; }, fetchMe: async () => ({ id: 'bot' }) } }]));
const client = { isReady: () => true, guilds: { cache: guilds }, ws: { ping: 8 } };
let http, base;
const sessions = new Map();
function session(id) { const token = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(32).toString('base64url'); db.db.prepare('INSERT INTO discord_web_sessions VALUES (?,?,?,?,?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'), id, A, 'Operator', '', csrf, Date.now() + 100000); return { cookie: `usmc_discord=${token}`, csrf }; }
async function api(guild, url, method = 'GET', body, id = user) {
    const who = sessions.get(id); return fetch(base + url, { method, headers: { Cookie: who.cookie, 'X-Guild-Id': guild, 'X-CSRF-Token': who.csrf, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
before(async () => { http = createWebServer(client).listen(0, '127.0.0.1'); await new Promise(resolve => http.once('listening', resolve)); base = `http://127.0.0.1:${http.address().port}`; [user, owner, outsider].forEach(id => sessions.set(id, session(id))); });
after(async () => { await new Promise(resolve => http.close(resolve)); db.db.close(); fs.rmSync(temporary, { recursive: true, force: true }); });
test('legacy balances and dossiers migrate once, backups contain original schema and balances', () => {
    assert.equal(eco.forGuild(A).getAccount(user).wallet, 1200);
    assert.equal(eco.forGuild(A).getAccount(user).bank, 450);
    assert.equal(eco.getEconomySettings(A).currency_name, 'Primary custom');
    assert.equal(db.db.prepare('SELECT currency_name FROM economy_settings WHERE guild_id=?').get('GLOBAL').currency_name, 'Legacy global');
    assert.equal(db.forGuild(A).getVerificationByDiscordId(user).answers.dato, 'USMC');
    assert.equal(eco.forGuild(B).getAccount(user).wallet, 100);
    assert.equal(db.forGuild(B).getVerificationByDiscordId(user), null);
    const files = fs.readdirSync(path.join(temporary, 'backups'));
    assert.ok(files.length >= 2);
    const backup = new Database(path.join(temporary, 'backups', files.find(file => file.includes('core'))), { readonly: true });
    assert.equal(backup.prepare('SELECT wallet FROM economy_accounts WHERE discord_id=?').get(user).wallet, 1200);
    assert.equal(backup.prepare('PRAGMA quick_check').get().quick_check, 'ok'); backup.close();
    require('../src/database/guildMigration').migrateGuildTables(db.db, db.dbPath, 'economy');
    assert.equal(eco.forGuild(A).getAccount(user).wallet, 1200);
});
test('wallets, banking, inventory, refunds, permission matrix and audit are guild-scoped', () => {
    const a = eco.forGuild(A), b = eco.forGuild(B);
    b.addWallet(user, 500); b.deposit(user, 50);
    assert.equal(a.getAccount(user).wallet, 1200); assert.equal(b.getAccount(user).wallet, 550);
    const item = b.createShopItem({ guild_id: B, name: 'Item B', price: 10, stock: 3 });
    assert.equal(a.getShopItemById(item.id), null);
    const order = b.purchaseShopItem(user, item.id, [], B); assert.equal(order.success, true);
    assert.equal(a.getUserInventory(user).length, 0); assert.equal(b.getUserInventory(user).length, 1);
    assert.equal(a.refundShopOrder(order.orderId), false); assert.equal(b.refundShopOrder(order.orderId), true); assert.equal(b.refundShopOrder(order.orderId), false);
    b.updateCommandPermission('tienda:comprar', false); assert.equal(b.isCommandAllowed('tienda:comprar').allowed, false); assert.equal(a.isCommandAllowed('tienda:comprar').allowed, true);
    db.forGuild(B).addAdminAuditLog('Tester', 'ONLY_B'); assert.ok(db.forGuild(B).getAdminAuditLogs().some(row => row.action === 'ONLY_B')); assert.ok(!db.forGuild(A).getAdminAuditLogs().some(row => row.action === 'ONLY_B'));
    assert.equal(a.getEnrichedTransactions({ discordId: user }).length, 0); assert.ok(b.getEnrichedTransactions({ discordId: user }).length > 0);
});
test('events, attendance, templates and verification edits reject IDs from another community', () => {
    communities.ensureCommunity(B, 'UKAF');
    const event = eco.createEvent({ guild_id: B, name: 'B only', event_type: 'REGISTRATION', base_reward: 50 }).event;
    eco.forGuild(B).registerUserForEvent(event.id, user, 'Operator');
    assert.equal(eco.forGuild(A).getEventById(event.id), undefined);
    assert.equal(eco.forGuild(A).getEventAttendance(event.id).length, 0);
    assert.equal(eco.forGuild(A).getEventFinalizationDraft(event.id), null);
    eco.forGuild(A).saveEventFinalizationDraft(event.id, { result: 'attack' });
    assert.equal(eco.forGuild(B).getEventFinalizationDraft(event.id), null);
    db.forGuild(B).submitVerification(user, 'Different name', '', { data: 'B' });
    assert.equal(db.forGuild(A).getVerificationByDiscordId(user).username, 'Original');
    const question = db.forGuild(B).getQuestions()[0];
    db.forGuild(A).deleteQuestion(question.id); assert.ok(db.forGuild(B).getQuestions().some(row => row.id === question.id));
    const template = eco.forGuild(B).getEventReportTemplates(B)[0];
    assert.equal(eco.forGuild(A).getEventReportTemplateById(template.id, A), null);
});
test('overlapping async requests preserve the selected community', async () => {
    const values = await Promise.all([A, B].map(guild => withGuild(guild, async () => { await new Promise(resolve => setTimeout(resolve, guild === A ? 20 : 2)); return eco.getAccount(user).guild_id; })));
    assert.deepEqual(values, [A, B]);
    const data = await Promise.all([A, B].map(guild => api(guild, '/api/admin/data').then(res => res.json())));
    assert.equal(data[0].config.guild_id, A); assert.equal(data[1].config.guild_id, B);
    assert.ok(data[0].verifications.every(row => row.guild_id === A)); assert.ok(data[1].verifications.every(row => row.guild_id === B));
});
test('web rejects forged guild selection and isolates branding changes and uploads', async () => {
    assert.equal((await api(B, '/api/admin/data', 'GET', undefined, outsider)).status, 401);
    const profile = communities.ensureCommunity(B);
    const save = await api(B, '/api/admin/branding', 'PUT', { ...profile, theme: 'ukaf', accent: '#b84048', display_name: 'UKAF' });
    assert.equal(save.status, 200); assert.equal(communities.ensureCommunity(A).theme, 'usmc');
    const upload = await api(B, '/api/admin/branding/image', 'POST', { kind: 'logo', content: Buffer.from('<svg onload=alert(1)>').toString('base64') });
    assert.equal(upload.status, 400);
    const valid = await api(B, '/api/admin/branding/image', 'POST', { kind: 'logo', content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=' }).then(res => res.json());
    assert.ok(valid.url.startsWith(`/guild-media/${B}/branding/`));
    assert.equal((await fetch(base + valid.url)).status, 200);
    const auth = await api(B, '/api/auth/config?next=%2Fadmin').then(res => res.json());
    assert.equal(new URL(auth.login_url, base).searchParams.get('next'), `/admin?guild=${B}`);
});
test('only bot owner can distribute AI; guild settings never expose keys', async () => {
    const payload = { enabled: true, provider: 'deepseek', daily_limit: 5, allowed_ids: [user], create_channels: false, create_roles: false };
    assert.equal((await api(B, `/api/owner/installations/${B}/assistant`, 'PUT', payload)).status, 403);
    assert.equal((await api(B, `/api/owner/installations/${B}/assistant`, 'PUT', payload, owner)).status, 200);
    const assistant = getAssistant(client);
    assert.equal(assistant.config(B).dailyLimit, 5); assert.equal((await assistant.access(B, user)).assistantPolicy.create_role, false);
    const publicData = await api(B, '/api/community/profile').then(res => res.json());
    assert.equal(JSON.stringify(publicData).includes('test-provider-secret'), false);
    assert.equal(Object.hasOwn(publicData.profile, 'assistant_allowed_ids'), false);
});
test('slash command registration defaults to global, keeps data guild separate and scopes tests explicitly', async () => {
    const calls = [], rest = { put: async (...args) => calls.push(args) };
    await registerCommands(rest, 'app', [{ name: 'help', description: 'Ayuda' }], { GUILD_ID: A });
    assert.equal(calls[0][0], '/applications/app/commands'); assert.deepEqual(calls[0][1].body[0].contexts, [0]); assert.deepEqual(calls[1][1].body, []);
    calls.length = 0; await registerCommands(rest, 'app', [], { COMMAND_SCOPE: 'guild', COMMAND_TEST_GUILD_ID: B, GUILD_ID: A });
    assert.equal(calls[0][0], `/applications/app/guilds/${B}/commands`);
});

test('only the owner can disable the daily AI quota per community and zero survives saving', async () => {
    const payload = { enabled: true, provider: 'deepseek', daily_limit: 0, allowed_ids: [user], create_channels: false, create_roles: false };
    assert.equal((await api(B, `/api/owner/installations/${B}/assistant`, 'PUT', payload)).status, 403);
    assert.equal((await api(B, `/api/owner/installations/${B}/assistant`, 'PUT', payload, owner)).status, 200);
    assert.equal(communities.ensureCommunity(B).assistant_daily_limit, 0);
    assert.equal(getAssistant(client).config(B).dailyLimit, 0);
    assert.equal((await api(B, `/api/owner/installations/${B}/assistant`, 'PUT', { ...payload, daily_limit: -1 }, owner)).status, 400);
});

test('all slash definitions serialize with neutral faction-independent names and descriptions', () => {
    for (const file of fs.readdirSync(path.join(__dirname, '../src/bot/commands')).filter(name => name.endsWith('.js'))) {
        const command = require('../src/bot/commands/' + file).data.toJSON();
        assert.equal(/USMC|UKAF|Ronograd|BRM ?5/i.test(JSON.stringify(command)), false, file);
    }
});
test('SQLite refuses attendance rows pointing into a different guild', () => {
    const event = eco.createEvent({ guild_id: B, name: 'Constraint', event_type: 'REGISTRATION', base_reward: 0 }).event;
    assert.throws(() => withGuild(A, () => eco.recordAttendanceHeartbeat(event.id, user, 'Cross guild')), /otra comunidad/);
});
test('snapshot includes a consistent SQLite and guild assets', () => {
    const destination = require('../scripts/backup').backupDatabase(db.db, db.dbPath);
    assert.ok(fs.existsSync(path.join(destination, 'database.sqlite')));
    assert.ok(fs.existsSync(path.join(destination, 'guilds', B, 'branding')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(destination, 'manifest.json'))).complete, true);
});

test('legacy provider settings migrate to DeepSeek without altering access and retired providers are rejected', async () => {
    const before = communities.ensureCommunity(B);
    db.db.prepare('UPDATE community_profiles SET assistant_provider=?,assistant_model=? WHERE guild_id=?').run('legacy-provider', 'vendor/old-model', B);
    delete require.cache[require.resolve('../src/database/communityDb')];
    const current = require('../src/database/communityDb').ensureCommunity(B);
    assert.equal(current.assistant_provider, 'deepseek'); assert.equal(current.assistant_model, null);
    assert.equal(current.assistant_enabled, before.assistant_enabled);
    assert.equal(current.assistant_allowed_ids, before.assistant_allowed_ids);
    assert.equal(current.assistant_daily_limit, before.assistant_daily_limit);
    const response = await api(B, `/api/owner/installations/${B}/assistant`, 'PUT', { enabled: true, provider: 'legacy-provider', daily_limit: 5, allowed_ids: [user] }, owner);
    assert.equal(response.status, 400);
    assert.equal(getAssistant(client).config(B).url, 'https://api.deepseek.com/chat/completions');
});

test('management capabilities are configurable only by the owner, remain guild scoped and preserve omitted settings', async () => {
    const originalA = communities.ensureCommunity(A);
    const flags = { edit_channels: true, delete_channels: false, edit_roles: true, delete_roles: false, assign_roles: true, manage_permissions: false };
    const body = { enabled: true, daily_limit: 0, allowed_ids: [user], create_channels: true, create_roles: true, ...flags };
    assert.equal((await api(B, `/api/owner/installations/${B}/assistant`, 'PUT', body)).status, 403);
    assert.equal((await api(B, `/api/owner/installations/${B}/assistant`, 'PUT', body, owner)).status, 200);
    const identity = await getAssistant(client).access(B, user);
    assert.equal(identity.assistantPolicy.update_channel, true); assert.equal(identity.assistantPolicy.delete_channel, false);
    assert.equal(identity.assistantPolicy.assign_role, true); assert.equal(identity.assistantPolicy.set_channel_permissions, false);
    assert.equal(communities.ensureCommunity(A).assistant_delete_channels, originalA.assistant_delete_channels);
    const legacyBody = { enabled: true, daily_limit: 0, allowed_ids: [user], create_channels: true, create_roles: true };
    assert.equal((await api(B, `/api/owner/installations/${B}/assistant`, 'PUT', legacyBody, owner)).status, 200);
    assert.equal(communities.ensureCommunity(B).assistant_delete_channels, 0);
    assert.equal((await api(B, `/api/owner/installations/${B}/assistant`, 'PUT', { ...body, manage_permissions: 'yes' }, owner)).status, 400);
    const log = db.db.prepare("SELECT * FROM admin_audit_logs WHERE guild_id=? AND action='CONFIGURAR_IA' ORDER BY id DESC").get(B);
    assert.equal(JSON.parse(log.details).tools.set_channel_permissions, false);
});

test('legacy management capability migration inherits existing creation policy and is idempotent', () => {
    const seeds = require('../src/assistant/capabilities').policySeeds;
    db.db.prepare('UPDATE community_profiles SET assistant_create_channels=0,assistant_create_roles=1 WHERE guild_id=?').run(A);
    for (const key of Object.keys(seeds)) db.db.exec(`ALTER TABLE community_profiles DROP COLUMN assistant_${key}`);
    const reload = () => { delete require.cache[require.resolve('../src/database/communityDb')]; return require('../src/database/communityDb'); };
    const migrated = reload().ensureCommunity(A);
    assert.equal(migrated.assistant_edit_channels, 0); assert.equal(migrated.assistant_delete_channels, 0);
    assert.equal(migrated.assistant_edit_roles, 1); assert.equal(migrated.assistant_manage_permissions, 1);
    db.db.prepare('UPDATE community_profiles SET assistant_manage_permissions=0 WHERE guild_id=?').run(A);
    assert.equal(reload().ensureCommunity(A).assistant_manage_permissions, 0);
});
