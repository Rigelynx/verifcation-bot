const store = require('./db');
// Complete economy schema migrations before ensureCommunity opens its transaction.
const eco = require('./economyDb');
const { withGuild } = require('./guildContext');
const { db } = store;
const { policySeeds } = require('../assistant/capabilities');
const {shopThemes}=require('../shared/shopThemes');
db.exec(`CREATE TABLE IF NOT EXISTS community_profiles (
    guild_id TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT 'Comunidad', short_name TEXT NOT NULL DEFAULT '',
    theme TEXT NOT NULL DEFAULT 'neutral', accent TEXT NOT NULL DEFAULT '#b8cba6', logo_url TEXT NOT NULL DEFAULT '',
    banner_url TEXT NOT NULL DEFAULT '/media/coastal-command.png', shop_theme TEXT NOT NULL DEFAULT 'neutral', panel_theme TEXT NOT NULL DEFAULT 'neutral',
    assistant_enabled INTEGER NOT NULL DEFAULT 0, assistant_provider TEXT, assistant_model TEXT,
    assistant_daily_limit INTEGER, assistant_allowed_ids TEXT,
    assistant_create_channels INTEGER NOT NULL DEFAULT 1, assistant_create_roles INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
const profileColumns = new Set(db.prepare('PRAGMA table_info(community_profiles)').all().map(column => column.name));
if(!profileColumns.has('shop_theme')) db.exec("ALTER TABLE community_profiles ADD COLUMN shop_theme TEXT NOT NULL DEFAULT 'neutral'");
if(!profileColumns.has('panel_theme')) db.exec("ALTER TABLE community_profiles ADD COLUMN panel_theme TEXT NOT NULL DEFAULT 'neutral'");
for (const [key, source] of Object.entries(policySeeds)) {
    const column = `assistant_${key}`;
    if (profileColumns.has(column)) continue;
    db.transaction(() => {
        db.exec(`ALTER TABLE community_profiles ADD COLUMN ${column} INTEGER NOT NULL DEFAULT ${source === '0' ? 0 : 1}`);
        db.exec(`UPDATE community_profiles SET ${column}=${source}`);
    })();
}
// Normalize old provider settings while preserving access, budgets and audit history.
db.exec(`UPDATE community_profiles SET assistant_provider='deepseek',
    assistant_model=CASE WHEN instr(COALESCE(assistant_model,''),'/')>0 THEN NULL ELSE assistant_model END
    WHERE assistant_provider IS NULL OR assistant_provider<>'deepseek' OR instr(COALESCE(assistant_model,''),'/')>0`);
const safeImage = value => {
    const text = String(value || '').trim();
    if (!text || /^\/media\/[A-Za-z0-9_.-]+$/.test(text) || /^\/guild-media\/\d{17,20}\/branding\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(text)) return text;
    try { const url = new URL(text); if (url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 1000) return url.href; } catch {}
    throw new Error('Usa una imagen local de /media/ o una URL HTTPS válida.');
};
function ensureCommunity(guildId, name = 'Comunidad') {
    return withGuild(guildId, () => {
        const existing = db.prepare('SELECT * FROM community_profiles WHERE guild_id=?').get(guildId);
        if (existing) return existing;
        return db.transaction(() => {
            const original = guildId === process.env.GUILD_ID;
            db.prepare("INSERT INTO community_profiles(guild_id,display_name,theme,assistant_enabled,assistant_provider) VALUES (?,?,?,?,'deepseek')")
                .run(guildId, String(name).slice(0, 100), original ? 'usmc' : 'neutral', original && process.env.ASSISTANT_ENABLED === 'true' ? 1 : 0);
            store.getConfig(guildId);
            eco.getEconomySettings(guildId);
            const permissions = new Set(eco.getCommandPermissions().map(row => row.command_name));
            for (const key of require('./commandCatalog')) if (!permissions.has(key)) eco.updateCommandPermission(key, true, []);
            if (!store.getQuestions().length) {
                store.addQuestion({ label: 'Nombre o indicativo', description: 'Cómo quieres que te identifiquen en esta comunidad.' });
                store.addQuestion({ label: '¿Por qué quieres unirte?', required: 0 });
                store.addQuestion({ label: 'Acepto las normas de la comunidad', field_type: 'select', options: ['Sí'], required: 1 });
            }
            // Seed neutral templates independently, never copy another guild's settings.
            if (!eco.getEventReportTemplates(guildId, true).length) {
                for (const [name, kind] of [['General', 'ALL'], ['Entrenamiento', 'TRAINING'], ['Patrullaje', 'PATROL'], ['Operación', 'OPERATION']])
                    eco.saveEventReportTemplate(guildId, { name, template_kind: kind, title: 'REPORTE DE EVENTO', footer: 'Registro de la comunidad' });
            }
            return db.prepare('SELECT * FROM community_profiles WHERE guild_id=?').get(guildId);
        })();
    });
}
function updateBranding(guildId, data) {
    const previous=ensureCommunity(guildId);
    const panelTheme=data.panel_theme===undefined?previous.panel_theme:data.panel_theme;
    if(typeof panelTheme!=='string'||!Object.hasOwn(shopThemes,panelTheme))throw new Error('Paleta de paneles inválida.');
    const shopTheme=data.shop_theme===undefined?previous.shop_theme:data.shop_theme;
    if(typeof shopTheme!=='string'||!Object.hasOwn(shopThemes,shopTheme))throw new Error('Diseño de tienda inválido.');
    if (!['neutral', 'usmc', 'ukaf', 'paf', 'custom'].includes(data.theme)) throw new Error('Tema inválido.');
    if (!/^#[0-9a-f]{6}$/i.test(data.accent || '')) throw new Error('El color debe tener formato #RRGGBB.');
    const name = String(data.display_name || '').trim().slice(0, 100);
    if (!name) throw new Error('El nombre de la comunidad es obligatorio.');
    const logo=data.theme==='paf'&&!data.logo_url?'/media/paf-crest.svg':data.logo_url;
    const banner=data.theme==='paf'&&(!data.banner_url||data.banner_url==='/media/coastal-command.png')?'/media/paf-banner.svg':data.banner_url;
    db.prepare(`UPDATE community_profiles SET display_name=?, short_name=?, theme=?, accent=?, logo_url=?, banner_url=?, shop_theme=?, panel_theme=?, updated_at=CURRENT_TIMESTAMP WHERE guild_id=?`)
        .run(name, String(data.short_name || '').trim().slice(0, 16), data.theme, data.accent, safeImage(logo), safeImage(banner),shopTheme,panelTheme, guildId);
    return ensureCommunity(guildId);
}
function updateAssistant(guildId, data) {
    const previous = ensureCommunity(guildId);
    if (data.provider && data.provider !== 'deepseek') throw new Error('Solo está disponible DeepSeek.');
    const ids = [...new Set(Array.isArray(data.allowed_ids) ? data.allowed_ids.map(String) : [])];
    if (ids.length > 10 || ids.some(id => !/^\d{17,20}$/.test(id))) throw new Error('Introduce como máximo 10 IDs de Discord válidos.');
    const limit = Number(data.daily_limit);
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Usa un número entero de consultas; 0 desactiva el cupo diario.');
    const model = String(data.model || '').trim();
    if (model && !/^[a-zA-Z0-9._-]{1,150}$/.test(model)) throw new Error('Modelo de DeepSeek inválido.');
    const capabilities = Object.keys(policySeeds).map(key => {
        if (data[key] !== undefined && typeof data[key] !== 'boolean') throw new Error('Las capacidades del asistente deben activarse o desactivarse con valores booleanos.');
        return data[key] === undefined ? previous[`assistant_${key}`] : Number(data[key]);
    });
    db.prepare(`UPDATE community_profiles SET assistant_enabled=?, assistant_provider=?, assistant_model=?, assistant_daily_limit=?, assistant_allowed_ids=?, assistant_create_channels=?, assistant_create_roles=?, ${Object.keys(policySeeds).map(key => `assistant_${key}=?`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE guild_id=?`)
        .run(data.enabled === true ? 1 : 0, 'deepseek', model || null, limit, JSON.stringify(ids), data.create_channels === true ? 1 : 0, data.create_roles === true ? 1 : 0, ...capabilities, guildId);
    return ensureCommunity(guildId);
}
function publicProfile(profile) { const { display_name, short_name, theme, accent, logo_url, banner_url, guild_id,shop_theme,panel_theme } = profile; return { display_name, short_name, theme, accent, logo_url, banner_url, guild_id,shop_theme,panel_theme }; }
module.exports = { ensureCommunity, updateBranding, updateAssistant, publicProfile };
