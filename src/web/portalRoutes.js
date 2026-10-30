const path = require('path');
const db = require('../database/db');
const community = require('../database/communityDb');
const { withGuild } = require('../database/guildContext');
const { hasAdminPermission, hasOfficerPermission } = require('../bot/handlers/permissionHandler');

const ownerIds = () => new Set((process.env.BOT_OWNER_IDS || '').split(/[\s,]+/).filter(id => /^\d{17,20}$/.test(id)));

function installPortalRoutes(app, client, auth) {
    db.db.exec(`CREATE TABLE IF NOT EXISTS bot_installations (
        guild_id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT,
        joined_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, left_at INTEGER
    )`);
    const remember = guild => {
        if (!guild?.id) return;
        db.db.prepare(`INSERT INTO bot_installations VALUES (?, ?, ?, ?, ?, NULL)
            ON CONFLICT(guild_id) DO UPDATE SET name=excluded.name, icon=excluded.icon,
            last_seen_at=excluded.last_seen_at, left_at=NULL`)
            .run(guild.id, guild.name || 'Comunidad', guild.iconURL?.({ size: 128 }) || null,
                guild.joinedTimestamp || Date.now(), Date.now());
    };
    function reconcile() {
        if (!client?.isReady()) return;
        for (const guild of client.guilds.cache.values()) remember(guild);
        const departed = db.db.prepare('SELECT guild_id FROM bot_installations WHERE left_at IS NULL').all();
        const leave = db.db.prepare('UPDATE bot_installations SET left_at = ? WHERE guild_id = ?');
        for (const row of departed) if (!client.guilds.cache.has(row.guild_id)) leave.run(Date.now(), row.guild_id);
    }
    client?.on?.('clientReady', reconcile);
    client?.on?.('guildCreate', remember);
    client?.on?.('guildUpdate', (_old, guild) => remember(guild));
    client?.on?.('guildDelete', guild => {
        if (guild.available === false) return; // A temporary outage is not a departure.
        db.db.prepare('UPDATE bot_installations SET left_at = ? WHERE guild_id = ?').run(Date.now(), guild.id);
    });
    reconcile();
    for (const [url, file] of [['/', 'landing.html'], ['/portal', 'portal.html'], ['/owner', 'owner.html'], ['/privacidad', 'privacy.html'], ['/soporte', 'support.html']]) {
        app.get(url, (_req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(__dirname, 'views', file)));
    }
    app.get('/api/public/bot', (_req, res) => {
        const id = process.env.CLIENT_ID;
        const invite = /^\d{17,20}$/.test(id || '') ? `https://discord.com/oauth2/authorize?${new URLSearchParams({ client_id: id, scope: 'bot applications.commands', permissions: '0', integration_type: '0' })}` : null;
        res.set('Cache-Control', 'no-store').json({ name: process.env.BOT_PUBLIC_NAME || 'RICO', invite_url: invite,
            support_url: /^https:\/\//.test(process.env.SUPPORT_URL || '') ? process.env.SUPPORT_URL : null, login_url: auth.loginUrl('/portal'), login_enabled: auth.config().enabled });
    });
    function account(req, res) {
        res.set('Cache-Control', 'no-store');
        const user = auth.account(req);
        if (!user) { res.status(401).json({ success: false, message: 'Inicia sesión con Discord.', login_url: auth.loginUrl(req.path.startsWith('/api/owner') ? '/owner' : '/portal') }); return null; }
        return user;
    }
    const presentUser = user => ({ id: user.id, name: user.username, avatar: user.avatar });
    app.get('/api/owner/overview', (req, res) => {
        const user = account(req, res);
        if (!user) return;
        if (!ownerIds().has(user.id)) return res.status(403).json({ success: false, message: 'Esta consola está reservada al propietario del bot.' });
        reconcile();
        const installations = db.db.prepare('SELECT * FROM bot_installations ORDER BY left_at IS NOT NULL, name COLLATE NOCASE').all();
        const usageRows = db.db.prepare(`SELECT guild_id, COUNT(*) AS provider_calls, SUM(prompt_tokens) AS input_tokens,
            SUM(completion_tokens) AS output_tokens, SUM(cache_hit_tokens) AS cache_hit_tokens, SUM(cache_miss_tokens) AS cache_miss_tokens
            FROM assistant_usage WHERE created_at>? GROUP BY guild_id`).all(Date.now() - 86400000);
        const usageByGuild = new Map(usageRows.map(row => [row.guild_id, row]));
        const keyPresent = () => Boolean(process.env.DEEPSEEK_API_KEY?.trim());
        res.json({ success: true, user: presentUser(user), csrf_token: user.csrf,
            bot: { name: process.env.BOT_PUBLIC_NAME || 'RICO', connected: Boolean(client?.isReady()), ping: Number.isFinite(client?.ws?.ping) && client.ws.ping >= 0 ? Math.round(client.ws.ping) : null },
            installations: installations.map(row => {
                const profile = community.ensureCommunity(row.guild_id, row.name);
                return { ...row, available: Boolean(client?.isReady() && client.guilds.cache.has(row.guild_id) && client.guilds.cache.get(row.guild_id).available !== false),
                    assistant: profile, usage: usageByGuild.get(row.guild_id) || null,
                    assistant_effective_provider: 'deepseek',
                    assistant_key_present: keyPresent(),
                    dashboard_url: !row.left_at ? `/admin?guild=${row.guild_id}` : null };
            }),
            setup: { oauth: auth.config().enabled, owner: ownerIds().size > 0, community: Boolean(process.env.GUILD_ID),
                provider: keyPresent(), multiserver_dashboards: true } });
    });
    app.put('/api/owner/installations/:guildId/assistant', (req, res) => {
        const user = account(req, res);
        if (!user) return;
        if (!ownerIds().has(user.id)) return res.status(403).json({ success: false, message: 'Acceso exclusivo del propietario.' });
        if (!auth.csrf(req, user)) return res.status(403).json({ success: false, message: 'Recarga la sesión antes de guardar.' });
        const guildId = req.params.guildId;
        if (!client?.isReady() || !client.guilds.cache.has(guildId)) return res.status(404).json({ success: false, message: 'Instalación no disponible.' });
        try {
            const previous = community.ensureCommunity(guildId);
            const profile = community.updateAssistant(guildId, req.body);
            withGuild(guildId, () => db.addAdminAuditLog({ operator_name: user.username, discord_id: user.id, operator_rank: 'PROPIETARIO' }, 'CONFIGURAR_IA', guildId,
                JSON.stringify({ enabled: profile.assistant_enabled, provider: profile.assistant_provider, daily_limit: profile.assistant_daily_limit,
                    allowed_ids: JSON.parse(profile.assistant_allowed_ids || '[]'), before_tools: require('../assistant/capabilities').policyFor(previous), tools: require('../assistant/capabilities').policyFor(profile) })));
            res.json({ success: true });
        } catch (error) { res.status(400).json({ success: false, message: error.message }); }
    });
    app.get('/api/portal/communities', async (req, res) => {
        const user = account(req, res);
        if (!user) return;
        if (!client?.isReady()) return res.status(503).json({ success: false, message: 'El bot está desconectado. Reintenta cuando vuelva a estar en línea.' });
        const communities = [];
        const guilds = [...client.guilds.cache.values()];
        let unavailable = false;
        // Bounded concurrency avoids a burst of membership lookups.
        for (let i = 0; i < guilds.length; i += 4) {
            await Promise.all(guilds.slice(i, i + 4).map(async guild => {
                try {
                    const member = await guild.members.fetch({ user: user.id, force: true });
                    const context = { guild, guildId: guild.id, member, user: { id: user.id } };
                    const admin = hasAdminPermission(context), officer = hasOfficerPermission(context);
                    if (!admin && !officer) return;
                    const active = true;
                    communities.push({ id: guild.id, name: guild.name || 'Comunidad', icon: guild.iconURL?.({ size: 128 }) || null,
                        access: admin ? 'Administración' : 'Operaciones', ready: active,
                        url: `${admin ? '/admin' : '/patrullas'}?guild=${guild.id}` });
                } catch (error) { if (error.code !== 10007) unavailable = true; }
            }));
        }
        communities.sort((a, b) => a.name.localeCompare(b.name));
        res.json({ success: true, user: presentUser(user), csrf_token: user.csrf, communities, partial: unavailable,
            owner: ownerIds().has(user.id) });
    });
}

module.exports = { installPortalRoutes };
