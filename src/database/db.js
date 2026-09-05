const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, '../../database.sqlite');
const db = new DatabaseSync(dbPath);

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
    try { db.exec("ALTER TABLE config ADD COLUMN officer_role_id TEXT DEFAULT NULL;"); } catch (e) {}
    try { db.exec("ALTER TABLE config ADD COLUMN admin_role_id TEXT DEFAULT NULL;"); } catch (e) {}

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
            reason TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

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

// ================= UTILIDADES DE CONFIGURACIÓN ================= //

function getConfig(guildId = 'default') {
    const stmt = db.prepare('SELECT * FROM config WHERE guild_id = ?');
    let row = stmt.get(guildId);
    if (!row) {
        const insertStmt = db.prepare('INSERT INTO config (guild_id) VALUES (?)');
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
    const query = `UPDATE config SET ${fields.join(', ')} WHERE guild_id = ?`;
    const stmt = db.prepare(query);
    stmt.run(...values);
    return getConfig(guildId);
}

// ================= UTILIDADES DE PREGUNTAS ================= //

function getQuestions() {
    const stmt = db.prepare('SELECT * FROM questions ORDER BY sort_order ASC, id ASC');
    const rows = stmt.all();
    return rows.map(r => ({
        ...r,
        options: JSON.parse(r.options_json || '[]')
    }));
}

function addQuestion({ label, description = '', field_type = 'text', options = [], required = 1 }) {
    const maxOrderStmt = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 as nextOrder FROM questions');
    const { nextOrder } = maxOrderStmt.get();

    const stmt = db.prepare(`
        INSERT INTO questions (label, description, field_type, options_json, required, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(label, description, field_type, JSON.stringify(options), required ? 1 : 0, nextOrder);
    return info.lastInsertRowid;
}

function updateQuestion(id, { label, description, field_type, options, required, sort_order }) {
    const stmt = db.prepare(`
        UPDATE questions 
        SET label = ?, description = ?, field_type = ?, options_json = ?, required = ?, sort_order = ?
        WHERE id = ?
    `);
    stmt.run(label, description, field_type, JSON.stringify(options || []), required ? 1 : 0, sort_order || 0, id);
    return true;
}

function deleteQuestion(id) {
    const stmt = db.prepare('DELETE FROM questions WHERE id = ?');
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
    const cleanStmt = db.prepare('DELETE FROM verification_tokens WHERE discord_id = ? OR expires_at < ?');
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
            WHERE discord_id = ?
        `);
        stmt.run(username, avatar, JSON.stringify(answers), status, discordId);
        return getVerificationByDiscordId(discordId);
    } else {
        const stmt = db.prepare(`
            INSERT INTO verifications (discord_id, username, avatar, answers_json, status)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(discordId, username, avatar, JSON.stringify(answers), status);
        return getVerificationByDiscordId(discordId);
    }
}

function getVerificationByDiscordId(discordId) {
    const stmt = db.prepare('SELECT * FROM verifications WHERE discord_id = ?');
    const row = stmt.get(discordId);
    if (!row) return null;
    return {
        ...row,
        answers: JSON.parse(row.answers_json || '{}')
    };
}

function getVerificationById(id) {
    const stmt = db.prepare('SELECT * FROM verifications WHERE id = ?');
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
        stmt = db.prepare('SELECT * FROM verifications WHERE status = ? ORDER BY updated_at DESC');
        return stmt.all(statusFilter).map(r => ({
            ...r,
            answers: JSON.parse(r.answers_json || '{}')
        }));
    } else {
        stmt = db.prepare('SELECT * FROM verifications ORDER BY updated_at DESC');
        return stmt.all().map(r => ({
            ...r,
            answers: JSON.parse(r.answers_json || '{}')
        }));
    }
}

function updateVerificationStatus(discordId, status, reviewerId = null, reason = null) {
    const stmt = db.prepare(`
        UPDATE verifications 
        SET status = ?, reviewer_id = ?, reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE discord_id = ?
    `);
    stmt.run(status, reviewerId, reason, discordId);
    return getVerificationByDiscordId(discordId);
}

function removeVerification(discordId) {
    const stmt = db.prepare('DELETE FROM verifications WHERE discord_id = ?');
    stmt.run(discordId);
    return true;
}

module.exports = {
    db,
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
    removeVerification
};
