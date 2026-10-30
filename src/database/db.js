const { currentGuild, bindExports } = require('./guildContext');
const { migrateGuildTables } = require('./guildMigration');
const path = require('path');
const fs = require('fs');

let Database;
let isNodeSqlite = false;

try {
    Database = require('better-sqlite3');
} catch (e) {
    try {
        const { DatabaseSync } = require('node:sqlite');
        Database = DatabaseSync;
        isNodeSqlite = true;
    } catch (e2) {
        throw new Error('Ni better-sqlite3 ni node:sqlite están disponibles en este entorno Node.js.');
    }
}

const legacyPath = path.join(__dirname, '../../database.sqlite');
const dbPath = process.env.DB_PATH || process.env.USMC_DB_PATH || (fs.existsSync(legacyPath) ? legacyPath : path.join(__dirname, '../../data/database.sqlite'));
if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

if (isNodeSqlite) {
    let transactionDepth = 0;
    db.transaction = (fn) => {
        return (...args) => {
            const level = transactionDepth++;
            const savepoint = `nested_${level}`;
            db.exec(level ? `SAVEPOINT ${savepoint}` : 'BEGIN');
            try {
                const res = fn(...args);
                db.exec(level ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT');
                return res;
            } catch (err) {
                db.exec(level ? `ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}` : 'ROLLBACK');
                throw err;
            } finally {
                transactionDepth--;
            }
        };
    };
}

db.function('current_guild_id', currentGuild);

// Activar modo WAL para alta velocidad y concurrencia
db.exec('PRAGMA journal_mode = WAL;');

function initDatabase() {
    // 1. Tabla de configuración por servidor
    db.exec(`
        CREATE TABLE IF NOT EXISTS config (
            guild_id TEXT PRIMARY KEY,
            verified_role_id TEXT DEFAULT NULL,
            unverified_role_id TEXT DEFAULT NULL,
            officer_role_id TEXT DEFAULT NULL,
            admin_role_id TEXT DEFAULT NULL,
            log_channel_id TEXT DEFAULT NULL,
            review_channel_id TEXT DEFAULT NULL,
            verification_mode TEXT DEFAULT 'manual',
            military_base_name TEXT DEFAULT 'USMC CLASSIFIED ACCESS TERMINAL',
            military_subtitle TEXT DEFAULT 'DIVISIÓN DE INTELIGENCIA Y SEGURIDAD'
        );
    `);

    // Migraciones automáticas seguras para bases de datos existentes
    try { db.exec("ALTER TABLE config ADD COLUMN officer_role_id TEXT DEFAULT NULL;"); } catch (e) { }
    try { db.exec("ALTER TABLE config ADD COLUMN admin_role_id TEXT DEFAULT NULL;"); } catch (e) { }

    // 2. Tabla de preguntas personalizables para el cuestionario
    db.exec(`
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            description TEXT DEFAULT '',
            field_type TEXT DEFAULT 'text',
            options_json TEXT DEFAULT '[]',
            required INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0
        );
    `);

    // 3. Tabla de expedientes de verificación de usuarios
    db.exec(`
        CREATE TABLE IF NOT EXISTS verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL,
            avatar TEXT DEFAULT NULL,
            answers_json TEXT NOT NULL,
            status TEXT DEFAULT 'PENDIENTE',
            reviewer_id TEXT DEFAULT NULL,
            reviewer_name TEXT DEFAULT NULL,
            reason TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    try { db.exec("ALTER TABLE verifications ADD COLUMN reviewer_name TEXT DEFAULT NULL;"); } catch (e) { }

    // 4. Tabla de tokens temporales de verificación efímera
    db.exec(`
        CREATE TABLE IF NOT EXISTS verification_tokens (
            token TEXT PRIMARY KEY,
            discord_id TEXT NOT NULL,
            username TEXT NOT NULL,
            avatar TEXT DEFAULT NULL,
            guild_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at INTEGER NOT NULL
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor TEXT NOT NULL,
            operator_id TEXT DEFAULT NULL,
            operator_rank TEXT DEFAULT NULL,
            action TEXT NOT NULL,
            target_id TEXT DEFAULT NULL,
            details TEXT DEFAULT '',
            ip_address TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    try { db.exec("ALTER TABLE admin_audit_logs ADD COLUMN operator_id TEXT DEFAULT NULL;"); } catch (e) { }
    try { db.exec("ALTER TABLE admin_audit_logs ADD COLUMN operator_rank TEXT DEFAULT NULL;"); } catch (e) { }
    try { db.exec("ALTER TABLE admin_audit_logs ADD COLUMN ip_address TEXT DEFAULT NULL;"); } catch (e) { }

    // 5. Tabla de sesiones nominales del Alto Mando para el Panel Web
    db.exec(`
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token TEXT PRIMARY KEY,
            discord_id TEXT DEFAULT NULL,
            operator_name TEXT NOT NULL,
            operator_rank TEXT DEFAULT 'ALTO MANDO',
            ip_address TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at INTEGER NOT NULL
        );
    `);

    // 6. Tabla de Servidores Privados de Roblox (VIP Servers BRM 5)
    db.exec(`
        CREATE TABLE IF NOT EXISTS private_servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT DEFAULT 'GLOBAL',
            server_name TEXT NOT NULL,
            server_code TEXT DEFAULT '',
            sector_map TEXT DEFAULT 'Ronograd Island',
            status TEXT DEFAULT 'LIBRE',
            current_officer_id TEXT DEFAULT NULL,
            current_officer_name TEXT DEFAULT NULL,
            current_mission TEXT DEFAULT NULL,
            current_event_id INTEGER DEFAULT NULL,
            started_at DATETIME DEFAULT NULL,
            notes TEXT DEFAULT '',
            board_channel_id TEXT DEFAULT NULL,
            board_message_id TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    db.exec(`CREATE TABLE IF NOT EXISTS private_server_boards (
        guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT NOT NULL
    );
    INSERT OR IGNORE INTO private_server_boards (guild_id, channel_id, message_id)
        SELECT guild_id, board_channel_id, board_message_id FROM private_servers
        WHERE board_channel_id IS NOT NULL AND board_message_id IS NOT NULL;
    `);
    if (process.env.GUILD_ID) {
        db.prepare("UPDATE private_servers SET guild_id = ? WHERE guild_id = 'GLOBAL'").run(process.env.GUILD_ID);
        db.prepare("UPDATE OR IGNORE private_server_boards SET guild_id = ? WHERE guild_id = 'GLOBAL'").run(process.env.GUILD_ID);
    }

    const serverCountStmt = db.prepare('SELECT COUNT(*) as count FROM private_servers');
    const { count: serverCount } = serverCountStmt.get();
    if (serverCount === 0 && process.env.USMC_SEED_DEMO_SERVERS === 'true') {
        const insertSrv = db.prepare(`
            INSERT INTO private_servers (guild_id, server_name, server_code, sector_map, status, notes)
            VALUES ('GLOBAL', ?, ?, ?, 'LIBRE', ?)
        `);
        insertSrv.run('Servidor Alpha-1', 'BRM5-ALPHA-01', 'Ronograd Island (Operaciones)', 'Servidor principal para incursiones y patrullajes tácticos.');
        insertSrv.run('Servidor Bravo-2', 'BRM5-BRAVO-02', 'FOB / Academia Militar', 'Destinado a entrenamientos CQB, formaciones y pruebas de reclutas.');
        insertSrv.run('Servidor Charlie-3', 'BRM5-CHARLIE-03', 'Fuerzas Especiales / Joint Ops', 'Reservado para despliegues clasificados y operaciones conjuntas.');
    }

    // Comprobar si hay preguntas iniciales por defecto
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM questions');
    const { count } = countStmt.get();

    if (count === 0) {
        const insertQ = db.prepare(`
            INSERT INTO questions (label, description, field_type, options_json, required, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        insertQ.run(
            'Nombre de Usuario / Indicativo en Roblox',
            'Escribe tu usuario exacto de Roblox o de la plataforma correspondiente.',
            'text',
            '[]',
            1,
            1
        );

        insertQ.run(
            'Edad del Aspirante',
            'Debes ingresar tu edad real para asignación de escuadrón.',
            'number',
            '[]',
            1,
            2
        );

        insertQ.run(
            'Especialidad o División de Interés',
            'Selecciona el cuerpo o división al que deseas unirte.',
            'select',
            JSON.stringify([
                'Infantería de Marina (Marine Infantry)',
                'Cuerpo de Policía Militar (Military Police)',
                'División de Aviación Táctica (Naval Aviation)',
                'Comunicaciones, Logística e Inteligencia'
            ]),
            1,
            3
        );

        insertQ.run(
            '¿Cómo supiste de nuestro destacamento?',
            'Menciona si fue por un amigo, reclutador o red social.',
            'text',
            '[]',
            0,
            4
        );

        insertQ.run(
            'Confirmación del Código de Honor y Disciplina',
            '¿Te comprometes a respetar los protocolos y la jerarquía militar?',
            'select',
            JSON.stringify([
                'Afirmativo: Acepto los protocolos y la disciplina del cuartel.',
                'Negativo: No estoy de acuerdo.'
            ]),
            1,
            5
        );
    }
}

// Inicializar tablas al cargar el módulo
initDatabase();
migrateGuildTables(db, dbPath, 'core');

// ================= UTILIDADES DE CONFIGURACIÓN ================= //

function getConfig(guildId = currentGuild()) {
    const stmt = db.prepare('SELECT * FROM (SELECT * FROM config WHERE guild_id = current_guild_id()) AS config WHERE guild_id = ?');
    let row = stmt.get(guildId);
    if (!row) {
        const insertStmt = db.prepare("INSERT INTO config (guild_id, military_base_name, military_subtitle) VALUES (?, 'CENTRO DE LA COMUNIDAD', 'VERIFICACIÓN Y ADMINISTRACIÓN')");
        insertStmt.run(guildId);
        row = stmt.get(guildId);
    }
    return row;
}

function updateConfig(guildId, data) {
    getConfig(guildId); // Asegura que existe
    const fields = [];
    const values = [];

    for (const [key, val] of Object.entries(data)) {
        if (['verified_role_id', 'unverified_role_id', 'officer_role_id', 'admin_role_id', 'log_channel_id', 'review_channel_id', 'verification_mode', 'military_base_name', 'military_subtitle'].includes(key)) {
            fields.push(`${key} = ?`);
            values.push(val);
        }
    }

    if (fields.length === 0) return false;

    values.push(guildId);
    const query = `UPDATE config SET ${fields.join(', ')} WHERE guild_id = current_guild_id() AND (guild_id = ?) `;
    const stmt = db.prepare(query);
    stmt.run(...values);
    return getConfig(guildId);
}

// ================= UTILIDADES DE PREGUNTAS ================= //

function getQuestions() {
    const stmt = db.prepare('SELECT * FROM (SELECT * FROM questions WHERE guild_id = current_guild_id()) AS questions ORDER BY sort_order ASC, id ASC');
    const rows = stmt.all();
    return rows.map(r => ({
        ...r,
        options: JSON.parse(r.options_json || '[]')
    }));
}

function addQuestion({ label, description = '', field_type = 'text', options = [], required = 1 }) {
    const maxOrderStmt = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 as nextOrder FROM (SELECT * FROM questions WHERE guild_id = current_guild_id()) AS questions');
    const { nextOrder } = maxOrderStmt.get();

    const stmt = db.prepare(`
        INSERT INTO questions (guild_id, label, description, field_type, options_json, required, sort_order)
        VALUES (current_guild_id(), ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(label, description, field_type, JSON.stringify(options), required ? 1 : 0, nextOrder);
    return info.lastInsertRowid;
}

function updateQuestion(id, { label, description, field_type, options, required, sort_order }) {
    const stmt = db.prepare(`
        UPDATE questions
        SET label = ?, description = ?, field_type = ?, options_json = ?, required = ?, sort_order = ?
        WHERE guild_id = current_guild_id() AND (id = ?)
    `);
    stmt.run(label, description, field_type, JSON.stringify(options || []), required ? 1 : 0, sort_order || 0, id);
    return true;
}

function deleteQuestion(id) {
    const stmt = db.prepare('DELETE FROM questions WHERE guild_id = current_guild_id() AND (id = ?) ');
    stmt.run(id);
    return true;
}

// ================= UTILIDADES DE TOKENS EFÍMEROS ================= //

function createVerificationToken(discordId, username, avatar, guildId) {
    // Generar un token único militar de 32 caracteres hexadecimales
    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + (30 * 60 * 1000); // 30 minutos de vigencia

    // Limpiar tokens viejos del usuario
    const cleanStmt = db.prepare('DELETE FROM verification_tokens WHERE (discord_id = ? AND guild_id = current_guild_id()) OR expires_at < ?');
    cleanStmt.run(discordId, Date.now());

    const insertStmt = db.prepare(`
        INSERT INTO verification_tokens (token, discord_id, username, avatar, guild_id, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(token, discordId, username, avatar, guildId, expiresAt);

    return token;
}

function getVerificationToken(token) {
    const stmt = db.prepare('SELECT * FROM verification_tokens WHERE token = ? AND expires_at > ?');
    return stmt.get(token, Date.now());
}

function deleteVerificationToken(token) {
    const stmt = db.prepare('DELETE FROM verification_tokens WHERE token = ?');
    stmt.run(token);
}

// ================= UTILIDADES DE EXPEDIENTES / VERIFICACIONES ================= //

function submitVerification(discordId, username, avatar, answers, status = 'PENDIENTE') {
    const existing = getVerificationByDiscordId(discordId);
    if (existing) {
        const stmt = db.prepare(`
            UPDATE verifications
            SET username = ?, avatar = ?, answers_json = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = current_guild_id() AND (discord_id = ?)
        `);
        stmt.run(username, avatar, JSON.stringify(answers), status, discordId);
        return getVerificationByDiscordId(discordId);
    } else {
        const stmt = db.prepare(`
            INSERT INTO verifications (guild_id, discord_id, username, avatar, answers_json, status)
            VALUES (current_guild_id(), ?, ?, ?, ?, ?)
        `);
        stmt.run(discordId, username, avatar, JSON.stringify(answers), status);
        return getVerificationByDiscordId(discordId);
    }
}

function getVerificationByDiscordId(discordId) {
    const stmt = db.prepare('SELECT * FROM (SELECT * FROM verifications WHERE guild_id = current_guild_id()) AS verifications WHERE discord_id = ?');
    const row = stmt.get(discordId);
    if (!row) return null;
    return {
        ...row,
        answers: JSON.parse(row.answers_json || '{}')
    };
}

function getVerificationById(id) {
    const stmt = db.prepare('SELECT * FROM (SELECT * FROM verifications WHERE guild_id = current_guild_id()) AS verifications WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return {
        ...row,
        answers: JSON.parse(row.answers_json || '{}')
    };
}

function getAllVerifications(statusFilter = null) {
    let stmt;
    if (statusFilter) {
        stmt = db.prepare('SELECT * FROM (SELECT * FROM verifications WHERE guild_id = current_guild_id()) AS verifications WHERE status = ? ORDER BY updated_at DESC');
        return stmt.all(statusFilter).map(r => ({
            ...r,
            answers: JSON.parse(r.answers_json || '{}')
        }));
    } else {
        stmt = db.prepare('SELECT * FROM (SELECT * FROM verifications WHERE guild_id = current_guild_id()) AS verifications ORDER BY updated_at DESC');
        return stmt.all().map(r => ({
            ...r,
            answers: JSON.parse(r.answers_json || '{}')
        }));
    }
}

function updateVerificationStatus(discordId, status, reviewerId = null, reason = null, reviewerName = null) {
    const stmt = db.prepare(`
        UPDATE verifications
        SET status = ?, reviewer_id = ?, reviewer_name = ?, reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = current_guild_id() AND (discord_id = ?)
    `);
    stmt.run(status, reviewerId, reviewerName, reason, discordId);
    return getVerificationByDiscordId(discordId);
}

function updateVerificationRecord(discordId, { username, answers, status, reason, reviewerName, reviewerId }) {
    const existing = getVerificationByDiscordId(discordId);
    if (!existing) return null;

    const newUsername = username !== undefined && String(username).trim() ? String(username).trim() : existing.username;
    const newAnswers = answers !== undefined && typeof answers === 'object' ? answers : existing.answers;
    const newStatus = status !== undefined ? status : existing.status;
    const newReason = reason !== undefined ? reason : existing.reason;
    const newReviewerName = reviewerName !== undefined ? reviewerName : existing.reviewer_name;
    const newReviewerId = reviewerId !== undefined ? reviewerId : existing.reviewer_id;

    db.prepare(`
        UPDATE verifications
        SET username = ?, answers_json = ?, status = ?, reason = ?, reviewer_name = ?, reviewer_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = current_guild_id() AND (discord_id = ?)
    `).run(newUsername, JSON.stringify(newAnswers), newStatus, newReason, newReviewerName, newReviewerId, discordId);

    // Sincronizar también el nombre en cuentas de economía si existe
    try {
        db.prepare(`UPDATE economy_accounts SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = current_guild_id() AND (discord_id = ?) `).run(newUsername, discordId);
    } catch (e) {}

    return {
        before: existing,
        after: getVerificationByDiscordId(discordId)
    };
}

function removeVerification(discordId) {
    const stmt = db.prepare('DELETE FROM verifications WHERE guild_id = current_guild_id() AND (discord_id = ?) ');
    stmt.run(discordId);
    return true;
}

// ================= UTILIDADES DE SESIONES NOMINALES Y AUDITORÍA ================= //

let onAdminAuditCallback = null;
function setOnAdminAuditLogged(fn) {
    onAdminAuditCallback = typeof fn === 'function' ? fn : null;
}

function createAdminSession(operatorName, discordId = null, operatorRank = 'ALTO MANDO', ipAddress = null, ttlHours = 12) {
    const crypto = require('crypto');
    const token = 'USMC-OP-' + crypto.randomBytes(20).toString('hex');
    const expiresAt = Date.now() + (ttlHours * 3600 * 1000);

    db.prepare('DELETE FROM admin_sessions WHERE guild_id = current_guild_id() AND (expires_at < ?) ').run(Date.now());
    db.prepare(`
        INSERT INTO admin_sessions (guild_id, token, discord_id, operator_name, operator_rank, ip_address, expires_at)
        VALUES (current_guild_id(), ?, ?, ?, ?, ?, ?)
    `).run(token, discordId || null, String(operatorName || 'Oficial').trim(), String(operatorRank || 'ALTO MANDO').trim(), ipAddress || null, expiresAt);

    return {
        token,
        discord_id: discordId || null,
        operator_name: String(operatorName || 'Oficial').trim(),
        operator_rank: String(operatorRank || 'ALTO MANDO').trim(),
        expires_at: expiresAt
    };
}

function getAdminSession(token) {
    if (!token) return null;
    const row = db.prepare('SELECT * FROM (SELECT * FROM admin_sessions WHERE guild_id = current_guild_id()) AS admin_sessions WHERE token = ? AND expires_at > ?').get(token, Date.now());
    return row || null;
}

function deleteAdminSession(token) {
    if (!token) return false;
    db.prepare('DELETE FROM admin_sessions WHERE guild_id = current_guild_id() AND (token = ?) ').run(token);
    return true;
}

function addAdminAuditLog(actorOrObj, action, targetId = null, details = '') {
    let actorName = 'ADMIN_WEB';
    let operatorId = null;
    let operatorRank = 'ALTO MANDO';
    let ipAddress = null;

    if (actorOrObj && typeof actorOrObj === 'object') {
        actorName = actorOrObj.operator_name || actorOrObj.actor || 'ADMIN_WEB';
        operatorId = actorOrObj.discord_id || actorOrObj.operator_id || null;
        operatorRank = actorOrObj.operator_rank || 'ALTO MANDO';
        ipAddress = actorOrObj.ip_address || null;
    } else if (typeof actorOrObj === 'string' && actorOrObj.trim()) {
        actorName = actorOrObj.trim();
    }

    const info = db.prepare(`
        INSERT INTO admin_audit_logs (guild_id, actor, operator_id, operator_rank, action, target_id, details, ip_address)
        VALUES (current_guild_id(), ?, ?, ?, ?, ?, ?, ?)
    `).run(actorName, operatorId, operatorRank, action, targetId, details, ipAddress);

    const logEntry = {
        id: info.lastInsertRowid,
        guild_id: currentGuild(),
        actor: actorName,
        operator_id: operatorId,
        operator_rank: operatorRank,
        action,
        target_id: targetId,
        details,
        ip_address: ipAddress,
        created_at: new Date().toISOString()
    };

    if (onAdminAuditCallback) {
        try { onAdminAuditCallback(logEntry); } catch (e) {}
    }

    return logEntry;
}

function getAdminAuditLogs(limit = 50, offset = 0) {
    return db.prepare('SELECT * FROM (SELECT * FROM admin_audit_logs WHERE guild_id = current_guild_id()) AS admin_audit_logs ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
}

// ================= UTILIDADES DE SERVIDORES PRIVADOS (VIP SERVERS BRM 5) ================= //

function getPrivateServers(guildId = currentGuild()) {
    return db.prepare(`
        SELECT * FROM (SELECT * FROM private_servers WHERE guild_id = current_guild_id()) AS private_servers
        WHERE guild_id = ?
        ORDER BY id ASC
    `).all(guildId);
}

function getPrivateServerById(id, guildId = null) {
    return guildId === null
        ? db.prepare('SELECT * FROM (SELECT * FROM private_servers WHERE guild_id = current_guild_id()) AS private_servers WHERE id = ?').get(Number(id))
        : db.prepare('SELECT * FROM (SELECT * FROM private_servers WHERE guild_id = current_guild_id()) AS private_servers WHERE id = ? AND guild_id = ?').get(Number(id), guildId);
}

function createPrivateServer({ guild_id = currentGuild(), server_name, server_code = '', sector_map = 'Sin especificar', notes = '' }) {
    const info = db.prepare(`
        INSERT INTO private_servers (guild_id, server_name, server_code, sector_map, status, notes)
        VALUES (?, ?, ?, ?, 'LIBRE', ?)
    `).run(
        guild_id || currentGuild(),
        String(server_name || 'Servidor Táctico').trim(),
        String(server_code || '').trim(),
        String(sector_map || 'Sin especificar').trim(),
        String(notes || '').trim()
    );
    return getPrivateServerById(info.lastInsertRowid);
}

function updatePrivateServer(id, data = {}) {
    const existing = getPrivateServerById(id);
    if (!existing) return null;

    const serverName = data.server_name !== undefined ? String(data.server_name).trim() : existing.server_name;
    const serverCode = data.server_code !== undefined ? String(data.server_code).trim() : existing.server_code;
    const sectorMap = data.sector_map !== undefined ? String(data.sector_map).trim() : existing.sector_map;
    const status = data.status !== undefined ? String(data.status).trim() : existing.status;
    const notes = data.notes !== undefined ? String(data.notes).trim() : existing.notes;

    db.prepare(`
        UPDATE private_servers
        SET server_name = ?, server_code = ?, sector_map = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = current_guild_id() AND (id = ?)
    `).run(serverName, serverCode, sectorMap, status, notes, Number(id));

    return getPrivateServerById(id);
}

function deletePrivateServer(id, guildId = null) {
    const server = getPrivateServerById(id, guildId);
    if (!server || server.status === 'EN_USO') return false;
    const info = db.prepare('DELETE FROM private_servers WHERE guild_id = current_guild_id() AND (id = ?) ').run(Number(id));
    return info.changes > 0;
}

function occupyPrivateServer(id, officerId, officerName, missionName = 'Despliegue Táctico', eventId = null, guildId = null) {
    const existing = getPrivateServerById(id, guildId);
    if (!existing) return { success: false, message: 'El servidor indicado no existe.' };

    const result = db.prepare(`
        UPDATE private_servers
        SET status = 'EN_USO',
            current_officer_id = ?,
            current_officer_name = ?,
            current_mission = ?,
            current_event_id = ?,
            started_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = current_guild_id() AND (id = ? AND status = 'LIBRE')
    `).run(
        officerId ? String(officerId) : null,
        String(officerName || 'Oficial de Mando'),
        String(missionName || 'Operación / Patrullaje').trim(),
        eventId ? Number(eventId) : null,
        Number(id)
    );

    if (!result.changes) return { success: false, message: 'El servidor ya está en uso. Actualiza la pizarra y elige otro.' };
    return { success: true, server: getPrivateServerById(id, guildId) };
}

function releasePrivateServer(id, guildId = null) {
    const existing = getPrivateServerById(id, guildId);
    if (!existing) return { success: false, message: 'El servidor indicado no existe.' };

    db.prepare(`
        UPDATE private_servers
        SET status = 'LIBRE',
            current_officer_id = NULL,
            current_officer_name = NULL,
            current_mission = NULL,
            current_event_id = NULL,
            started_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = current_guild_id() AND (id = ?)
    `).run(Number(id));

    return { success: true, server: getPrivateServerById(id) };
}

function releasePrivateServerByEventId(eventId, guildId = null) {
    if (!eventId) return [];
    const occupied = db.prepare('SELECT id FROM (SELECT * FROM private_servers WHERE guild_id = current_guild_id()) AS private_servers WHERE current_event_id = ? AND (? IS NULL OR guild_id = ?)').all(Number(eventId), guildId, guildId);
    const released = [];
    for (const row of occupied) {
        const res = releasePrivateServer(row.id);
        if (res.success && res.server) released.push(res.server);
    }
    return released;
}

function saveServerBoardMessage(guildId, channelId, messageId) {
    db.prepare(`INSERT INTO private_server_boards (guild_id, channel_id, message_id) VALUES (?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id
    `).run(guildId || currentGuild(), channelId, messageId);
}

function getServerBoardMessage(guildId) {
    return db.prepare('SELECT channel_id AS board_channel_id, message_id AS board_message_id FROM (SELECT * FROM private_server_boards WHERE guild_id = current_guild_id()) AS private_server_boards WHERE guild_id = ?').get(guildId);
}

module.exports = bindExports({
    getServerBoardMessage,
    db,
    dbPath,
    getConfig,
    updateConfig,
    getQuestions,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    createVerificationToken,
    getVerificationToken,
    deleteVerificationToken,
    submitVerification,
    getVerificationByDiscordId,
    getVerificationById,
    getAllVerifications,
    updateVerificationStatus,
    updateVerificationRecord,
    removeVerification,
    createAdminSession,
    getAdminSession,
    deleteAdminSession,
    addAdminAuditLog,
    getAdminAuditLogs,
    setOnAdminAuditLogged,
    getPrivateServers,
    getPrivateServerById,
    createPrivateServer,
    updatePrivateServer,
    deletePrivateServer,
    occupyPrivateServer,
    releasePrivateServer,
    releasePrivateServerByEventId,
    saveServerBoardMessage
}, { getConfig: 0, updateConfig: 0, createVerificationToken: 3, createPrivateServer: args => args[0]?.guild_id, getPrivateServers: 0, getPrivateServerById: 1, deletePrivateServer: 1, occupyPrivateServer: 5, releasePrivateServer: 1, releasePrivateServerByEventId: 1, saveServerBoardMessage: 0, getServerBoardMessage: 0 });
