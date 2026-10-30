const crypto = require('crypto');
const db = require('../database/db');
const { withGuild } = require('../database/guildContext');
const { hasAdminPermission, hasOfficerPermission } = require('../bot/handlers/permissionHandler');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
function oauthConfig() {
    let origin;
    try {
        const url = new URL(process.env.WEB_URL);
        if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error();
        origin = url.origin;
    } catch { origin = null; }
    const enabled = Boolean(origin && /^\d{17,20}$/.test(process.env.CLIENT_ID || '') && process.env.DISCORD_CLIENT_SECRET);
    return { enabled, origin, redirectUri: origin ? `${origin}/auth/discord/callback` : null,
        legacyAllowed: !enabled || process.env.ADMIN_LEGACY_LOGIN === 'true' };
}
function cookie(req, name) {
    const value = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`));
    return value ? value.slice(name.length + 1) : '';
}
function safeTarget(value) {
    if (typeof value !== 'string' || !/^\/(owner|portal|admin|asistente|patrullas|verify(?:\/[A-Za-z0-9_-]+)?)(?:\?guild=\d{17,20})?$/.test(value)) return '/patrullas';
    return value;
}
function installDiscordAuth(app, client, options = {}) {
    const httpFetch = options.oauthFetch || globalThis.fetch;
    db.db.exec(`CREATE TABLE IF NOT EXISTS discord_login_states (
        state_hash TEXT PRIMARY KEY, destination TEXT NOT NULL, expires_at INTEGER NOT NULL
    ); CREATE TABLE IF NOT EXISTS discord_web_sessions (
        token_hash TEXT PRIMARY KEY, discord_id TEXT NOT NULL, guild_id TEXT NOT NULL,
        username TEXT NOT NULL, avatar TEXT NOT NULL, csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
    );`);
    const cookieOptions = () => ({ httpOnly: true, secure: oauthConfig().origin?.startsWith('https:') || false,
        sameSite: 'lax', path: '/' });
    const loginUrl = target => `/auth/discord?next=${encodeURIComponent(safeTarget(target))}`;
    async function discord(path, token, init = {}) {
        const response = await httpFetch(`https://discord.com/api/v10${path}`, { ...init,
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Discord no pudo confirmar tu identidad o tu pertenencia al servidor.');
        return response.json();
    }
    function account(req) {
        const token = cookie(req, 'usmc_discord');
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
        const session = db.db.prepare('SELECT * FROM discord_web_sessions WHERE token_hash = ? AND expires_at > ?')
            .get(hash(token), Date.now());
        if (!session) return null;
        return { id: session.discord_id, username: session.username, avatar: session.avatar, csrf: session.csrf_token, guildId: session.guild_id };
    }
    async function identity(req, requiredGuild = null) {
        const accountUser = account(req);
        if (!accountUser) return null;
        const token = cookie(req, 'usmc_discord');
        const selected = requiredGuild || req.headers['x-guild-id'] || req.query?.guild || accountUser.guildId;
        if (!/^\d{17,20}$/.test(String(selected || ''))) { const error = new Error('Elige una comunidad desde Mi espacio.'); error.status = 400; throw error; }
        const session = { discord_id: accountUser.id, guild_id: String(selected), username: accountUser.username, avatar: accountUser.avatar, csrf_token: accountUser.csrf };
        if (!client?.isReady()) { const error = new Error('El bot debe estar conectado para comprobar tus permisos.'); error.status = 503; throw error; }
        const guild = client.guilds.cache.get(session.guild_id);
        if (!guild) { const error = new Error('El bot no está conectado al servidor configurado.'); error.status = 503; throw error; }
        let member;
        try { member = await guild.members.fetch({ user: session.discord_id, force: true }); }
        catch (error) {
            if (error.code === 10007) { db.db.prepare('DELETE FROM discord_web_sessions WHERE token_hash = ?').run(hash(token)); return null; }
            const failure = new Error('No pude comprobar tus roles en Discord. Reintenta en unos segundos.'); failure.status = 503; throw failure;
        }
        const interaction = { guild, guildId: guild.id, member, user: { id: session.discord_id } };
        return { id: session.discord_id, guildId: session.guild_id, username: member.displayName || session.username,
            avatar: session.avatar, csrf: session.csrf_token, member, guild,
            access: { admin: hasAdminPermission(interaction), patrol: hasOfficerPermission(interaction) } };
    }
    function csrf(req, user) {
        const supplied = req.headers['x-csrf-token'];
        const origin = req.headers.origin;
        return typeof supplied === 'string' && /^[A-Za-z0-9_-]{43}$/.test(supplied) && supplied.length === user.csrf.length &&
            crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(user.csrf)) &&
            (!origin || origin === oauthConfig().origin);
    }
    function requireAccess(level) {
        return async (req, res, next) => {
            res.set('Cache-Control', 'no-store');
            try {
                const user = await identity(req);
                if (!user) return res.status(401).json({ success: false, message: 'Inicia sesión con Discord.', login_url: loginUrl('/portal') });
                if (level !== 'member' && !user.access[level]) return res.status(403).json({ success: false, message: 'Tu rol no tiene acceso a esta sección.' });
                if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !csrf(req, user)) return res.status(403).json({ success: false, message: 'La sesión del formulario cambió. Recarga la página antes de guardar.' });
                req.discordIdentity = user;
                req.guildId = user.guildId;
                req.adminOperator = { operator_name: user.username, discord_id: user.id, operator_rank: user.access.admin ? 'ALTO MANDO DISCORD' : 'OFICIAL DISCORD', ip_address: req.ip };
                require('../database/communityDb').ensureCommunity(user.guildId, user.guild.name);
                withGuild(user.guildId, next);
            } catch (error) { res.status(error.status || 503).json({ success: false, message: error.message }); }
        };
    }
    app.get('/api/auth/config', (req, res) => {
        const config = oauthConfig();
        const target = new URL(safeTarget(req.query.next), 'http://local');
        if (/^\d{17,20}$/.test(req.headers['x-guild-id'] || '')) target.searchParams.set('guild', req.headers['x-guild-id']);
        res.set('Cache-Control', 'no-store').json({ enabled: config.enabled, legacy_allowed: config.legacyAllowed,
            login_url: loginUrl(target.pathname + target.search), setup_required: !config.enabled });
    });
    app.get('/auth/discord', (req, res) => {
        const config = oauthConfig();
        if (!config.enabled) return res.status(503).send('El inicio con Discord requiere CLIENT_ID, DISCORD_CLIENT_SECRET y WEB_URL con HTTPS.');
        const state = random();
        db.db.prepare('DELETE FROM discord_login_states WHERE expires_at < ?').run(Date.now());
        db.db.prepare('INSERT INTO discord_login_states VALUES (?, ?, ?)').run(hash(state), safeTarget(req.query.next), Date.now() + 300000);
        res.cookie('usmc_oauth_state', state, { ...cookieOptions(), maxAge: 300000 });
        const query = new URLSearchParams({ client_id: process.env.CLIENT_ID, redirect_uri: config.redirectUri,
            response_type: 'code', scope: 'identify', state });
        res.redirect(`https://discord.com/oauth2/authorize?${query}`);
    });
    app.get('/auth/discord/callback', async (req, res) => {
        res.set('Referrer-Policy', 'no-referrer');
        const config = oauthConfig(), state = String(req.query.state || '');
        const browserState = cookie(req, 'usmc_oauth_state');
        res.clearCookie('usmc_oauth_state', cookieOptions());
        if (!config.enabled || !/^[A-Za-z0-9_-]{43}$/.test(state) || state !== browserState) return res.status(400).send('Solicitud de inicio de sesión inválida. Vuelve a entrar desde la web.');
        const flow = db.db.prepare('SELECT * FROM discord_login_states WHERE state_hash = ? AND expires_at > ?').get(hash(state), Date.now());
        db.db.prepare('DELETE FROM discord_login_states WHERE state_hash = ?').run(hash(state));
        if (!flow) return res.status(400).send('El enlace de inicio de sesión venció o ya fue utilizado.');
        if (req.query.error || !req.query.code) return res.redirect(`${flow.destination}?auth_error=${encodeURIComponent('No se completó la autorización con Discord.')}`);
        try {
            if (req.query.iss && req.query.iss !== 'https://discord.com') throw new Error('La respuesta no procede de Discord.');
            const tokens = await discord('/oauth2/token', null, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ client_id: process.env.CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: config.redirectUri }).toString() });
            const user = await discord('/users/@me', tokens.access_token);
            if (!/^\d{17,20}$/.test(user.id)) throw new Error('Identidad de Discord inválida.');
            const selectedGuild = new URL(flow.destination, config.origin).searchParams.get('guild') || process.env.GUILD_ID || 'ACCOUNT';
            const member = null; // Membership and roles are checked live by the bot on each protected request.
            const token = random(), csrfToken = random();
            const avatar = user.avatar && /^[a-zA-Z0-9_]+$/.test(user.avatar) ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            db.db.prepare('DELETE FROM discord_web_sessions WHERE expires_at < ?').run(Date.now());
            db.db.prepare('INSERT INTO discord_web_sessions VALUES (?, ?, ?, ?, ?, ?, ?)').run(hash(token), user.id,
                selectedGuild, member?.nick || user.global_name || user.username, avatar, csrfToken, Date.now() + 4 * 3600000);
            res.cookie('usmc_discord', token, { ...cookieOptions(), maxAge: 4 * 3600000 });
            // Authentication is global to the account. Record it in a community only
            // after Discord confirms membership of that requested community.
            const targetGuild = client?.isReady() && client.guilds.cache.get(selectedGuild);
            if (targetGuild) {
                const confirmed = await targetGuild.members.fetch({ user: user.id, force: true }).catch(() => null);
                if (confirmed) withGuild(selectedGuild, () => db.addAdminAuditLog({ operator_name: confirmed.displayName || user.username, discord_id: user.id, operator_rank: 'DISCORD OAUTH', ip_address: req.ip },
                    'INICIO_SESION_DISCORD', user.id, 'Identidad y comunidad confirmadas por Discord'));
            }
            res.redirect(flow.destination);
        } catch (error) {
            console.error('[Discord login]', error.message);
            res.redirect(`${flow.destination}?auth_error=${encodeURIComponent(error.message)}`);
        }
    });
    app.get('/api/auth/session', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const user = await identity(req);
            if (!user) return res.status(401).json({ success: false });
            res.json({ success: true, guild: { id: user.guildId, name: user.guild.name }, user: { id: user.id, name: user.username, avatar: user.avatar }, access: user.access, csrf_token: user.csrf });
        } catch (error) { res.status(error.status || 503).json({ success: false, message: error.message }); }
    });
    app.post('/auth/logout', (req, res) => {
        const token = cookie(req, 'usmc_discord');
        const session = db.db.prepare('SELECT csrf_token FROM discord_web_sessions WHERE token_hash = ?').get(hash(token));
        if (session && !csrf(req, { csrf: session.csrf_token })) return res.status(403).json({ success: false, message: 'Sesión inválida para cerrar el acceso.' });
        db.db.prepare('DELETE FROM discord_web_sessions WHERE token_hash = ?').run(hash(cookie(req, 'usmc_discord')));
        res.clearCookie('usmc_discord', cookieOptions());
        res.json({ success: true });
    });
    return { account, identity, csrf, loginUrl, requireAccess, config: oauthConfig, hasCookie: req => Boolean(cookie(req, 'usmc_discord')) };
}

module.exports = { installDiscordAuth, oauthConfig };
