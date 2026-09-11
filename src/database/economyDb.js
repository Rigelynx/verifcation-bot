const { db } = require('./db');

// =========================================================================
// INICIALIZACIÓN DE TABLAS DE ECONOMÍA, TIENDA Y EVENTOS
// =========================================================================
function initEconomyTables() {
    // 1. Cuentas financieras de los reclutas
    db.exec(`
        CREATE TABLE IF NOT EXISTS economy_accounts (
            discord_id TEXT PRIMARY KEY,
            username TEXT DEFAULT '',
            avatar TEXT DEFAULT '',
            wallet INTEGER DEFAULT 0,
            bank INTEGER DEFAULT 0,
            bank_capacity INTEGER DEFAULT 50000,
            last_work INTEGER DEFAULT 0,
            last_crime INTEGER DEFAULT 0,
            last_rob INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Migración automática de columnas para bases de datos existentes
    try {
        const cols = db.prepare("PRAGMA table_info(economy_accounts)").all();
        const colNames = cols.map(c => c.name);
        if (!colNames.includes('username')) {
            db.exec("ALTER TABLE economy_accounts ADD COLUMN username TEXT DEFAULT ''");
        }
        if (!colNames.includes('avatar')) {
            db.exec("ALTER TABLE economy_accounts ADD COLUMN avatar TEXT DEFAULT ''");
        }
        if (!colNames.includes('last_bonus')) {
            db.exec("ALTER TABLE economy_accounts ADD COLUMN last_bonus INTEGER DEFAULT 0");
        }

        const sCols = db.prepare("PRAGMA table_info(economy_settings)").all();
        const sColNames = sCols.map(c => c.name);
        if (!sColNames.includes('bonus_daily_enabled')) {
            db.exec("ALTER TABLE economy_settings ADD COLUMN bonus_daily_enabled INTEGER DEFAULT 1");
        }
        if (!sColNames.includes('bonus_daily_amount')) {
            db.exec("ALTER TABLE economy_settings ADD COLUMN bonus_daily_amount INTEGER DEFAULT 250");
        }
        if (!sColNames.includes('bonus_daily_cooldown')) {
            db.exec("ALTER TABLE economy_settings ADD COLUMN bonus_daily_cooldown INTEGER DEFAULT 86400");
        }
        if (!sColNames.includes('bonus_max_give')) {
            db.exec("ALTER TABLE economy_settings ADD COLUMN bonus_max_give INTEGER DEFAULT 50000");
        }
        if (!sColNames.includes('log_channel_id')) {
            db.exec("ALTER TABLE economy_settings ADD COLUMN log_channel_id TEXT DEFAULT NULL");
        }
    } catch (e) {
        console.error('[DB Column Migration Error]:', e.message);
    }

    // Purga automática de cuentas y datos temporales de prueba
    try {
        db.exec(`
            DELETE FROM economy_accounts WHERE discord_id LIKE 'TEST_%';
            DELETE FROM economy_inventory WHERE discord_id LIKE 'TEST_%';
            DELETE FROM economy_transactions WHERE discord_id LIKE 'TEST_%';
            DELETE FROM event_attendance WHERE discord_id LIKE 'TEST_%';
            DELETE FROM economy_shop_items WHERE roles_to_give LIKE '%ROLE_SARGENTO_ID%';
        `);
    } catch (e) {}

    // 2. Parámetros de configuración económica global
    db.exec(`
        CREATE TABLE IF NOT EXISTS economy_settings (
            guild_id TEXT PRIMARY KEY,
            currency_name TEXT DEFAULT 'Créditos USMC',
            currency_symbol TEXT DEFAULT '$',
            work_min INTEGER DEFAULT 50,
            work_max INTEGER DEFAULT 250,
            work_cooldown INTEGER DEFAULT 3600,
            crime_min INTEGER DEFAULT 100,
            crime_max INTEGER DEFAULT 600,
            crime_cooldown INTEGER DEFAULT 7200,
            crime_fail_rate INTEGER DEFAULT 45,
            rob_cooldown INTEGER DEFAULT 14400,
            rob_fail_rate INTEGER DEFAULT 50,
            starting_balance INTEGER DEFAULT 100,
            log_channel_id TEXT DEFAULT NULL
        );
    `);

    // 3. Catálogo de la Tienda militar (Shop) estilo UnbelievaBoat
    db.exec(`
        CREATE TABLE IF NOT EXISTS economy_shop_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            price INTEGER NOT NULL,
            roles_to_give TEXT DEFAULT '[]',     -- JSON array de IDs de rol a otorgar
            roles_to_remove TEXT DEFAULT '[]',   -- JSON array de IDs de rol a retirar
            required_roles TEXT DEFAULT '[]',    -- JSON array de IDs de rol requeridos
            blocked_roles TEXT DEFAULT '[]',     -- JSON array de IDs de rol que bloquean la compra
            stock INTEGER DEFAULT -1,            -- -1 para infinito
            max_per_user INTEGER DEFAULT 1,      -- -1 para ilimitado, o entero >= 1
            custom_reply TEXT DEFAULT '',
            icon TEXT DEFAULT '🎖️',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 4. Mochila / Inventario de reclutas
    db.exec(`
        CREATE TABLE IF NOT EXISTS economy_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT NOT NULL,
            item_id INTEGER NOT NULL,
            quantity INTEGER DEFAULT 1,
            acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(item_id) REFERENCES economy_shop_items(id)
        );
    `);

    // 5. Matriz de bonificaciones y multiplicadores por rango / rol
    db.exec(`
        CREATE TABLE IF NOT EXISTS economy_role_rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            role_name TEXT NOT NULL,
            multiplier REAL DEFAULT 1.0,
            flat_bonus INTEGER DEFAULT 0
        );
    `);

    // 6. Registro de Operaciones y Eventos de Asistencia (Voz / Chat)
    db.exec(`
        CREATE TABLE IF NOT EXISTS event_payouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            event_type TEXT NOT NULL,             -- 'VOICE', 'TEXT', 'HYBRID'
            target_channel_id TEXT NOT NULL,
            payout_channel_id TEXT NOT NULL,
            base_reward INTEGER NOT NULL,
            claim_deadline_hours INTEGER DEFAULT 24,
            grace_period_minutes INTEGER DEFAULT 5,
            min_attendance_percent INTEGER DEFAULT 80,
            status TEXT DEFAULT 'ACTIVE',          -- 'ACTIVE', 'ENDED', 'CANCELLED'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME DEFAULT NULL,
            claim_expires_at INTEGER DEFAULT 0,
            discord_message_id TEXT DEFAULT NULL
        );
    `);

    // 7. Registro de Asistencia Individual a Eventos
    db.exec(`
        CREATE TABLE IF NOT EXISTS event_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            discord_id TEXT NOT NULL,
            username TEXT NOT NULL,
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            total_seconds_present INTEGER DEFAULT 0,
            message_count INTEGER DEFAULT 0,
            is_eligible INTEGER DEFAULT 0,
            claimed INTEGER DEFAULT 0,
            claimed_at DATETIME DEFAULT NULL,
            payout_amount INTEGER DEFAULT 0,
            FOREIGN KEY(event_id) REFERENCES event_payouts(id)
        );
    `);

    // 8. Registro de Transacciones Financieras
    db.exec(`
        CREATE TABLE IF NOT EXISTS economy_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT NOT NULL,
            type TEXT NOT NULL,                   -- 'WORK', 'CRIME', 'ROB', 'PAY', 'EVENT_CLAIM', 'BUY_ITEM', 'DEP', 'WITH', 'ADMIN_ADJUST'
            amount INTEGER NOT NULL,
            details TEXT DEFAULT '',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 9. Permisos y Activación de Comandos de Economía
    db.exec(`
        CREATE TABLE IF NOT EXISTS economy_command_permissions (
            command_name TEXT PRIMARY KEY,
            is_enabled INTEGER DEFAULT 1,
            allowed_roles TEXT DEFAULT '[]'
        );
    `);

    // 10. Paneles Tácticos de Bonos Militares Interactivas con Botón
    db.exec(`
        CREATE TABLE IF NOT EXISTS economy_bonus_panels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            title TEXT DEFAULT '🎖️ [BONO MILITAR EXTRAORDINARIO // ASIGNACIÓN DE MANDO]',
            description TEXT DEFAULT 'El Estado Mayor de la Base USMC ha autorizado una asignación financiera especial para el personal militar en servicio activo.',
            amount INTEGER DEFAULT 500,
            claim_mode TEXT DEFAULT 'ONCE',       -- 'ONCE' (1 sola vez por combatiente), 'COOLDOWN' (periódico con tiempo de espera)
            cooldown_seconds INTEGER DEFAULT 86400,
            button_label TEXT DEFAULT 'RECLAMAR BONO MILITAR',
            button_emoji TEXT DEFAULT '🎁',
            channel_id TEXT DEFAULT '',
            message_id TEXT DEFAULT '',
            required_roles TEXT DEFAULT '[]',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS economy_bonus_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            panel_id INTEGER NOT NULL,
            discord_id TEXT NOT NULL,
            amount INTEGER NOT NULL,
            claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            timestamp_unix INTEGER NOT NULL
        );
    `);

    // Sembrar todos los protocolos configurables, incluidos sus subcomandos.
    const defaultCmds = [
        'admin', 'admin:verificar-manual', 'admin:desverificar', 'admin:panel-web', 'admin:configurar',
        'bono', 'bono:panel', 'bono:crear', 'bono:eliminar', 'bono:reset_reclamos', 'bono:lista', 'bono:reclamar', 'bono:dar', 'bono:masivo', 'bono:estado',
        'datos-usuario',
        'economia', 'economia:balance', 'economia:depositar', 'economia:retirar', 'economia:pagar', 'economia:trabajar', 'economia:crimen', 'economia:robar', 'economia:ranking',
        'economia:admin:dar', 'economia:admin:quitar', 'economia:admin:fijar',
        'evento', 'evento:convocar', 'evento:confirmar', 'evento:panel_pago', 'evento:pagar_todos', 'evento:lista', 'evento:iniciar', 'evento:finalizar', 'evento:estado',
        'help',
        'mod', 'mod:ban', 'mod:kick', 'mod:timeout', 'mod:purge',
        'panel-verificacion',
        'tienda', 'tienda:panel', 'tienda:comprar', 'tienda:inventario'
    ];
    const insertCmd = db.prepare('INSERT OR IGNORE INTO economy_command_permissions (command_name, is_enabled, allowed_roles) VALUES (?, 1, ?)');
    for (const c of defaultCmds) {
        insertCmd.run(c, '[]');
    }

    // Migrar la primera versión de la matriz (que guardaba subcomandos de
    // economía sin prefijo) a sus rutas completas, sin perder restricciones.
    const legacyCommandMap = {
        balance: 'economia:balance', trabajar: 'economia:trabajar', crimen: 'economia:crimen',
        robar: 'economia:robar', pagar: 'economia:pagar', depositar: 'economia:depositar',
        retirar: 'economia:retirar', ranking: 'economia:ranking'
    };
    const findCmd = db.prepare('SELECT is_enabled, allowed_roles FROM economy_command_permissions WHERE command_name = ?');
    const moveCmd = db.prepare('UPDATE economy_command_permissions SET is_enabled = ?, allowed_roles = ? WHERE command_name = ?');
    const removeCmd = db.prepare('DELETE FROM economy_command_permissions WHERE command_name = ?');
    for (const [legacyName, canonicalName] of Object.entries(legacyCommandMap)) {
        const legacy = findCmd.get(legacyName);
        const canonical = findCmd.get(canonicalName);
        if (legacy && canonical) {
            moveCmd.run(legacy.is_enabled, legacy.allowed_roles, canonicalName);
        }
        if (legacy) removeCmd.run(legacyName);
    }

    // Migraciones seguras para columnas avanzadas de eventos y pases de lista
    try {
        const pCols = db.prepare("PRAGMA table_info(event_payouts)").all().map(c => c.name);
        if (!pCols.includes('registration_channel_id')) db.exec("ALTER TABLE event_payouts ADD COLUMN registration_channel_id TEXT DEFAULT NULL");
        if (!pCols.includes('confirmation_channel_id')) db.exec("ALTER TABLE event_payouts ADD COLUMN confirmation_channel_id TEXT DEFAULT NULL");
        if (!pCols.includes('registration_message_id')) db.exec("ALTER TABLE event_payouts ADD COLUMN registration_message_id TEXT DEFAULT NULL");
        if (!pCols.includes('confirmation_message_id')) db.exec("ALTER TABLE event_payouts ADD COLUMN confirmation_message_id TEXT DEFAULT NULL");
        if (!pCols.includes('phase')) db.exec("ALTER TABLE event_payouts ADD COLUMN phase TEXT DEFAULT 'ACTIVE'");
        if (!pCols.includes('max_participants')) db.exec("ALTER TABLE event_payouts ADD COLUMN max_participants INTEGER DEFAULT 0");
    } catch (e) {
        console.error('[Migration Error event_payouts]:', e.message);
    }

    try {
        const aCols = db.prepare("PRAGMA table_info(event_attendance)").all().map(c => c.name);
        if (!aCols.includes('registered_at')) db.exec("ALTER TABLE event_attendance ADD COLUMN registered_at DATETIME DEFAULT NULL");
        if (!aCols.includes('attendance_confirmed')) db.exec("ALTER TABLE event_attendance ADD COLUMN attendance_confirmed INTEGER DEFAULT 0");
        if (!aCols.includes('attendance_confirmed_at')) db.exec("ALTER TABLE event_attendance ADD COLUMN attendance_confirmed_at DATETIME DEFAULT NULL");
        if (!aCols.includes('status')) db.exec("ALTER TABLE event_attendance ADD COLUMN status TEXT DEFAULT 'PRESENT'");
    } catch (e) {
        console.error('[Migration Error event_attendance]:', e.message);
    }
}

// =========================================================================
// GESTIÓN DE CUENTAS FINANCIERAS (WALLET / BANK)
// =========================================================================

function getAccount(discordId, defaultGuildId = 'GLOBAL', username = '', avatar = '') {
    let stmt = db.prepare('SELECT * FROM economy_accounts WHERE discord_id = ?');
    let account = stmt.get(discordId);

    if (!account) {
        const settings = getEconomySettings(defaultGuildId);
        // El saldo inicial puede ser 0. No usar un fallback basado en falsy aquí.
        const startingWallet = settings && settings.starting_balance !== null && settings.starting_balance !== undefined
            ? Number(settings.starting_balance)
            : 100;

        const insert = db.prepare(`
            INSERT INTO economy_accounts (discord_id, username, avatar, wallet, bank, bank_capacity)
            VALUES (?, ?, ?, ?, 0, 50000)
        `);
        insert.run(discordId, username || '', avatar || '', startingWallet);
        account = stmt.get(discordId);
    } else if (username || avatar) {
        const fields = [];
        const params = [];
        if (username && account.username !== username) {
            fields.push('username = ?');
            params.push(username);
        }
        if (avatar && account.avatar !== avatar) {
            fields.push('avatar = ?');
            params.push(avatar);
        }
        if (fields.length > 0) {
            params.push(discordId);
            db.prepare(`UPDATE economy_accounts SET ${fields.join(', ')} WHERE discord_id = ?`).run(...params);
            account = stmt.get(discordId);
        }
    }
    return account;
}

function syncAccountUser(discordId, username = '', avatar = '', guildId = 'GLOBAL') {
    if (!discordId) return;
    return getAccount(discordId, guildId || 'GLOBAL', username, avatar);
}

function updateCooldown(discordId, type, timestamp = Math.floor(Date.now() / 1000)) {
    getAccount(discordId);
    const colMap = {
        work: 'last_work',
        crime: 'last_crime',
        rob: 'last_rob'
    };
    const col = colMap[type];
    if (!col) return false;

    const stmt = db.prepare(`UPDATE economy_accounts SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`);
    stmt.run(timestamp, discordId);
    return true;
}

function addWallet(discordId, amount, type = 'GENERAL', details = '') {
    getAccount(discordId);
    const stmt = db.prepare(`
        UPDATE economy_accounts 
        SET wallet = wallet + ?, updated_at = CURRENT_TIMESTAMP 
        WHERE discord_id = ?
    `);
    stmt.run(amount, discordId);

    logTransaction(discordId, type, amount, details);
    return getAccount(discordId);
}

function removeWallet(discordId, amount, type = 'GENERAL', details = '') {
    const acc = getAccount(discordId);
    if (acc.wallet < amount) return false;

    const stmt = db.prepare(`
        UPDATE economy_accounts 
        SET wallet = wallet - ?, updated_at = CURRENT_TIMESTAMP 
        WHERE discord_id = ?
    `);
    stmt.run(amount, discordId);

    logTransaction(discordId, type, -amount, details);
    return getAccount(discordId);
}

function addBank(discordId, amount, type = 'GENERAL', details = '') {
    getAccount(discordId);
    const stmt = db.prepare(`
        UPDATE economy_accounts 
        SET bank = bank + ?, updated_at = CURRENT_TIMESTAMP 
        WHERE discord_id = ?
    `);
    stmt.run(amount, discordId);

    logTransaction(discordId, type, amount, details);
    return getAccount(discordId);
}

function removeBank(discordId, amount, type = 'GENERAL', details = '') {
    const acc = getAccount(discordId);
    if (acc.bank < amount) return false;

    const stmt = db.prepare(`
        UPDATE economy_accounts 
        SET bank = bank - ?, updated_at = CURRENT_TIMESTAMP 
        WHERE discord_id = ?
    `);
    stmt.run(amount, discordId);

    logTransaction(discordId, type, -amount, details);
    return getAccount(discordId);
}

function deposit(discordId, amount) {
    const acc = getAccount(discordId);
    const toDeposit = amount === 'all' ? acc.wallet : parseInt(amount, 10);

    if (isNaN(toDeposit) || toDeposit <= 0) return { success: false, message: 'Monto inválido.' };
    if (acc.wallet < toDeposit) return { success: false, message: 'No tienes suficiente efectivo en cartera.' };

    const availableBank = acc.bank_capacity - acc.bank;
    if (availableBank <= 0) return { success: false, message: 'Tu caja fuerte bancaria está a máxima capacidad.' };

    const actualAmount = Math.min(toDeposit, availableBank);

    const tx = db.transaction(() => {
        db.prepare('UPDATE economy_accounts SET wallet = wallet - ?, bank = bank + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?')
            .run(actualAmount, actualAmount, discordId);
        logTransaction(discordId, 'DEP', actualAmount, 'Depósito en caja fuerte militar');
    });
    tx();

    return { success: true, deposited: actualAmount, account: getAccount(discordId) };
}

function withdraw(discordId, amount) {
    const acc = getAccount(discordId);
    const toWithdraw = amount === 'all' ? acc.bank : parseInt(amount, 10);

    if (isNaN(toWithdraw) || toWithdraw <= 0) return { success: false, message: 'Monto inválido.' };
    if (acc.bank < toWithdraw) return { success: false, message: 'No tienes suficientes fondos en tu banco.' };

    const tx = db.transaction(() => {
        db.prepare('UPDATE economy_accounts SET bank = bank - ?, wallet = wallet + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?')
            .run(toWithdraw, toWithdraw, discordId);
        logTransaction(discordId, 'WITH', toWithdraw, 'Retiro de caja fuerte militar');
    });
    tx();

    return { success: true, withdrawn: toWithdraw, account: getAccount(discordId) };
}

function transfer(fromId, toId, amount) {
    const sender = getAccount(fromId);
    getAccount(toId);

    const num = parseInt(amount, 10);
    if (isNaN(num) || num <= 0) return { success: false, message: 'Monto de transferencia inválido.' };
    if (sender.wallet < num) return { success: false, message: 'No tienes suficiente dinero en tu cartera para realizar este envío.' };

    const tx = db.transaction(() => {
        db.prepare('UPDATE economy_accounts SET wallet = wallet - ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?').run(num, fromId);
        db.prepare('UPDATE economy_accounts SET wallet = wallet + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?').run(num, toId);
        logTransaction(fromId, 'PAY', -num, `Transferencia enviada a <@${toId}>`);
        logTransaction(toId, 'PAY', num, `Transferencia recibida de <@${fromId}>`);
    });
    tx();

    return { success: true, amount: num };
}

function getLeaderboard(limit = 10) {
    const stmt = db.prepare(`
        SELECT discord_id, username, avatar, wallet, bank, (wallet + bank) as net_worth
        FROM economy_accounts
        WHERE LENGTH(discord_id) >= 17 AND discord_id GLOB '[0-9]*'
        ORDER BY net_worth DESC
        LIMIT ?
    `);
    return stmt.all(limit);
}

function getAllEconomyAccounts(limit = 50, search = '', offset = 0) {
    if (search && search.trim().length > 0) {
        const stmt = db.prepare(`
            SELECT a.*, (a.wallet + a.bank) as net_worth, 
                   COALESCE(NULLIF(a.username, ''), NULLIF(v.username, ''), '') as resolved_name
            FROM economy_accounts a
            LEFT JOIN verifications v ON a.discord_id = v.discord_id
            WHERE (LENGTH(a.discord_id) >= 17 AND a.discord_id GLOB '[0-9]*')
              AND (a.discord_id LIKE ? OR a.username LIKE ? OR v.username LIKE ?)
            ORDER BY net_worth DESC
            LIMIT ? OFFSET ?
        `);
        const q = `%${search.trim()}%`;
        return stmt.all(q, q, q, limit, offset);
    } else {
        const stmt = db.prepare(`
            SELECT a.*, (a.wallet + a.bank) as net_worth, 
                   COALESCE(NULLIF(a.username, ''), NULLIF(v.username, ''), '') as resolved_name
            FROM economy_accounts a
            LEFT JOIN verifications v ON a.discord_id = v.discord_id
            WHERE LENGTH(a.discord_id) >= 17 AND a.discord_id GLOB '[0-9]*'
            ORDER BY net_worth DESC
            LIMIT ? OFFSET ?
        `);
        return stmt.all(limit, offset);
    }
}

function countEconomyAccounts(search = '') {
    const q = `%${String(search || '').trim()}%`;
    return db.prepare(`
        SELECT COUNT(*) AS total
        FROM economy_accounts a
        LEFT JOIN verifications v ON a.discord_id = v.discord_id
        WHERE LENGTH(a.discord_id) >= 17 AND a.discord_id GLOB '[0-9]*'
          AND (? = '%%' OR a.discord_id LIKE ? OR a.username LIKE ? OR v.username LIKE ?)
    `).get(q, q, q, q).total;
}

function deleteEconomyAccount(discordId) {
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM economy_inventory WHERE discord_id = ?').run(discordId);
        return db.prepare('DELETE FROM economy_accounts WHERE discord_id = ?').run(discordId).changes;
    });
    return tx() > 0;
}

// =========================================================================
// PERMISOS Y RESTRICCIONES DE COMANDOS DE ECONOMÍA
// =========================================================================

function getCommandPermissions() {
    const rows = db.prepare('SELECT * FROM economy_command_permissions ORDER BY command_name ASC').all();
    return rows.map(r => ({
        command_name: r.command_name,
        is_enabled: r.is_enabled === 1,
        allowed_roles: JSON.parse(r.allowed_roles || '[]')
    }));
}

function updateCommandPermission(commandName, isEnabled, allowedRoles = []) {
    const rolesJson = JSON.stringify(Array.isArray(allowedRoles) ? allowedRoles : []);
    const stmt = db.prepare(`
        INSERT INTO economy_command_permissions (command_name, is_enabled, allowed_roles)
        VALUES (?, ?, ?)
        ON CONFLICT(command_name) DO UPDATE SET
            is_enabled = excluded.is_enabled,
            allowed_roles = excluded.allowed_roles
    `);
    stmt.run(commandName, isEnabled ? 1 : 0, rolesJson);
    return {
        command_name: commandName,
        is_enabled: !!isEnabled,
        allowed_roles: Array.isArray(allowedRoles) ? allowedRoles : []
    };
}

function isCommandAllowed(commandName, member) {
    if (!member) return { allowed: true };
    // Administradores de Discord siempre tienen bypass total
    if (member.permissions && member.permissions.has(8n)) {
        return { allowed: true };
    }

    const perm = db.prepare('SELECT is_enabled, allowed_roles FROM economy_command_permissions WHERE command_name = ?').get(commandName);
    if (!perm) return { allowed: true };

    if (perm.is_enabled === 0) {
        return { allowed: false, reason: 'DISABLED' };
    }

    const roles = JSON.parse(perm.allowed_roles || '[]');
    if (roles.length > 0) {
        const memberRoles = member.roles ? member.roles.cache.map(r => r.id) : [];
        const hasRole = roles.some(rId => memberRoles.includes(rId));
        if (!hasRole) {
            return { allowed: false, reason: 'ROLE_RESTRICTED', requiredRoles: roles };
        }
    }

    return { allowed: true };
}

function adminAdjustBalance(discordId, action, amount, target = 'wallet') {
    getAccount(discordId);
    const col = target === 'bank' ? 'bank' : 'wallet';
    const num = parseInt(amount, 10);

    if (action === 'set') {
        db.prepare(`UPDATE economy_accounts SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`).run(num, discordId);
    } else if (action === 'add') {
        db.prepare(`UPDATE economy_accounts SET ${col} = ${col} + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`).run(num, discordId);
    } else if (action === 'remove') {
        db.prepare(`UPDATE economy_accounts SET ${col} = MAX(0, ${col} - ?), updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`).run(num, discordId);
    }
    logTransaction(discordId, 'ADMIN_ADJUST', num, `Ajuste administrativo (${action} ${target})`);
    return getAccount(discordId);
}

let onTransactionLogged = null;

function setOnTransactionLogged(callback) {
    onTransactionLogged = callback;
}

function logTransaction(discordId, type, amount, details = '') {
    try {
        const stmt = db.prepare(`
            INSERT INTO economy_transactions (discord_id, type, amount, details)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(discordId, type, amount, details);

        if (typeof onTransactionLogged === 'function') {
            try {
                onTransactionLogged({ discordId, type, amount, details });
            } catch (cbErr) {
                console.error('[Error en callback onTransactionLogged]:', cbErr.message);
            }
        }
    } catch (e) {
        console.error('Error al registrar transacción:', e.message);
    }
}

function getRecentTransactions(discordId = null, limit = 20) {
    if (discordId) {
        const stmt = db.prepare('SELECT * FROM economy_transactions WHERE discord_id = ? ORDER BY timestamp DESC LIMIT ?');
        return stmt.all(discordId, limit);
    } else {
        const stmt = db.prepare('SELECT * FROM economy_transactions ORDER BY timestamp DESC LIMIT ?');
        return stmt.all(limit);
    }
}

/**
 * Consulta contable enriquecida uniendo transacciones con cuentas para auditoría completa
 */
function getEnrichedTransactions({ discordId = null, type = null, search = '', from = null, to = null, limit = 50, offset = 0 } = {}) {
    let query = `
        SELECT t.*, 
               COALESCE(a.username, 'Combatiente Desconocido') as username, 
               COALESCE(a.avatar, '') as avatar,
               COALESCE(a.wallet, 0) as current_wallet,
               COALESCE(a.bank, 0) as current_bank
        FROM economy_transactions t
        LEFT JOIN economy_accounts a ON t.discord_id = a.discord_id
        WHERE 1=1
    `;
    const params = [];

    if (discordId) {
        query += ` AND t.discord_id = ?`;
        params.push(discordId);
    }

    if (type && type !== 'ALL') {
        query += ` AND t.type = ?`;
        params.push(type);
    }

    if (search && search.trim().length > 0) {
        const s = `%${search.trim()}%`;
        query += ` AND (t.discord_id LIKE ? OR a.username LIKE ? OR t.details LIKE ?)`;
        params.push(s, s, s);
    }

    if (from) { query += ` AND date(t.timestamp) >= date(?)`; params.push(from); }
    if (to) { query += ` AND date(t.timestamp) <= date(?)`; params.push(to); }

    query += ` ORDER BY t.timestamp DESC, t.id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    return db.prepare(query).all(...params);
}

function countEnrichedTransactions({ discordId = null, type = null, search = '', from = null, to = null } = {}) {
    let query = `SELECT COUNT(*) AS total FROM economy_transactions t LEFT JOIN economy_accounts a ON t.discord_id = a.discord_id WHERE 1=1`;
    const params = [];
    if (discordId) { query += ' AND t.discord_id = ?'; params.push(discordId); }
    if (type && type !== 'ALL') { query += ' AND t.type = ?'; params.push(type); }
    if (search && search.trim()) { query += ' AND (t.discord_id LIKE ? OR a.username LIKE ? OR t.details LIKE ?)'; const s = `%${search.trim()}%`; params.push(s, s, s); }
    if (from) { query += ' AND date(t.timestamp) >= date(?)'; params.push(from); }
    if (to) { query += ' AND date(t.timestamp) <= date(?)'; params.push(to); }
    return db.prepare(query).get(...params).total;
}

/**
 * Estadísticas globales de tesorería y flujo monetario para el panel web
 */
function getTreasuryStats(guildId = 'GLOBAL') {
    const totalEventPaid = db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM economy_transactions WHERE type = 'EVENT_CLAIM'").get().s;
    const totalBonusPaid = db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM economy_transactions WHERE type IN ('BONUS_CLAIM', 'BONUS_GIVE', 'MASS_BONUS')").get().s;
    const totalShopSpent = db.prepare("SELECT COALESCE(ABS(SUM(amount)), 0) as s FROM economy_transactions WHERE type = 'BUY_ITEM'").get().s;
    const totalTransfers = db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM economy_transactions WHERE type = 'PAY' AND amount > 0").get().s;
    const totalTxCount = db.prepare("SELECT COUNT(*) as c FROM economy_transactions").get().c;
    const totalCirculating = db.prepare("SELECT COALESCE(SUM(wallet + bank), 0) as s FROM economy_accounts").get().s;

    return {
        totalEventPaid,
        totalBonusPaid,
        totalShopSpent,
        totalTransfers,
        totalTxCount,
        totalCirculating
    };
}

/**
 * Perfil financiero individual: cómo gana y en qué gasta su dinero un soldado
 */
function getUserFinancialProfile(discordId) {
    const account = getAccount(discordId);
    const recentTransactions = getEnrichedTransactions({ discordId, limit: 30 });
    const totalEarned = db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM economy_transactions WHERE discord_id = ? AND amount > 0").get(discordId).s;
    const totalSpent = db.prepare("SELECT COALESCE(ABS(SUM(amount)), 0) as s FROM economy_transactions WHERE discord_id = ? AND amount < 0").get(discordId).s;
    const itemsCount = db.prepare("SELECT COUNT(*) as c FROM economy_inventory WHERE discord_id = ?").get(discordId).c;

    return {
        account,
        totalEarned,
        totalSpent,
        itemsCount,
        recentTransactions
    };
}

/**
 * Eliminar un registro contable específico por ID
 */
function deleteTransaction(id) {
    const info = db.prepare('DELETE FROM economy_transactions WHERE id = ?').run(id);
    return info.changes > 0;
}

/**
 * Eliminar múltiples registros contables por lote de IDs
 */
function deleteTransactions(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const cleanIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (cleanIds.length === 0) return 0;
    const placeholders = cleanIds.map(() => '?').join(',');
    const info = db.prepare(`DELETE FROM economy_transactions WHERE id IN (${placeholders})`).run(...cleanIds);
    return info.changes;
}

/**
 * Vaciar / Purgar todos los registros contables del libro de auditoría
 */
function clearAllTransactions() {
    const info = db.prepare('DELETE FROM economy_transactions').run();
    return info.changes;
}

// =========================================================================
// AJUSTES DE ECONOMÍA (SETTINGS)
// =========================================================================

function getEconomySettings(guildId = 'GLOBAL') {
    let stmt = db.prepare('SELECT * FROM economy_settings WHERE guild_id = ?');
    let row = stmt.get(guildId);

    if (!row) {
        db.prepare(`
            INSERT INTO economy_settings (guild_id, currency_name, currency_symbol)
            VALUES (?, 'Créditos USMC', '$')
        `).run(guildId);
        row = stmt.get(guildId);
    }
    return row;
}

function updateEconomySettings(guildId = 'GLOBAL', data = {}) {
    getEconomySettings(guildId);
    const fields = [];
    const values = [];

    const allowed = [
        'currency_name', 'currency_symbol', 'work_min', 'work_max', 'work_cooldown',
        'crime_min', 'crime_max', 'crime_cooldown', 'crime_fail_rate',
        'rob_cooldown', 'rob_fail_rate', 'starting_balance',
        'bonus_daily_enabled', 'bonus_daily_amount', 'bonus_daily_cooldown', 'bonus_max_give',
        'log_channel_id'
    ];

    for (const [k, v] of Object.entries(data)) {
        if (allowed.includes(k)) {
            fields.push(`${k} = ?`);
            values.push(v);
        }
    }

    if (fields.length === 0) return getEconomySettings(guildId);

    values.push(guildId);
    const query = `UPDATE economy_settings SET ${fields.join(', ')} WHERE guild_id = ?`;
    db.prepare(query).run(...values);
    return getEconomySettings(guildId);
}

// =========================================================================
// TIENDA E INVENTARIO (SHOP & INVENTORY) ESTILO UNBELIEVABOAT
// =========================================================================

function getShopItems(guildId = 'GLOBAL', activeOnly = true) {
    const query = activeOnly 
        ? "SELECT * FROM economy_shop_items WHERE (guild_id = ? OR guild_id = 'GLOBAL') AND is_active = 1 ORDER BY price ASC, id ASC"
        : "SELECT * FROM economy_shop_items WHERE (guild_id = ? OR guild_id = 'GLOBAL') ORDER BY price ASC, id ASC";
    const stmt = db.prepare(query);
    const rows = stmt.all(guildId);

    return rows.map(r => ({
        ...r,
        roles_to_give: JSON.parse(r.roles_to_give || '[]'),
        roles_to_remove: JSON.parse(r.roles_to_remove || '[]'),
        required_roles: JSON.parse(r.required_roles || '[]'),
        blocked_roles: JSON.parse(r.blocked_roles || '[]')
    }));
}

function getShopItemById(id) {
    const stmt = db.prepare('SELECT * FROM economy_shop_items WHERE id = ?');
    const r = stmt.get(id);
    if (!r) return null;

    return {
        ...r,
        roles_to_give: JSON.parse(r.roles_to_give || '[]'),
        roles_to_remove: JSON.parse(r.roles_to_remove || '[]'),
        required_roles: JSON.parse(r.required_roles || '[]'),
        blocked_roles: JSON.parse(r.blocked_roles || '[]')
    };
}

function createShopItem({
    guild_id = 'GLOBAL',
    name,
    description = '',
    price,
    roles_to_give = [],
    roles_to_remove = [],
    required_roles = [],
    blocked_roles = [],
    stock = -1,
    max_per_user = 1,
    custom_reply = '',
    icon = '🎖️',
    is_active = 1
}) {
    const stmt = db.prepare(`
        INSERT INTO economy_shop_items (
            guild_id, name, description, price, roles_to_give, roles_to_remove,
            required_roles, blocked_roles, stock, max_per_user, custom_reply, icon, is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
        guild_id,
        name,
        description,
        price,
        JSON.stringify(roles_to_give),
        JSON.stringify(roles_to_remove),
        JSON.stringify(required_roles),
        JSON.stringify(blocked_roles),
        stock,
        max_per_user,
        custom_reply,
        icon || '🎖️',
        is_active ? 1 : 0
    );

    return getShopItemById(info.lastInsertRowid);
}

function updateShopItem(id, data = {}) {
    const item = getShopItemById(id);
    if (!item) return null;

    const fields = [];
    const values = [];

    const jsonFields = ['roles_to_give', 'roles_to_remove', 'required_roles', 'blocked_roles'];
    const standardFields = ['name', 'description', 'price', 'stock', 'max_per_user', 'custom_reply', 'icon', 'is_active'];

    for (const [k, v] of Object.entries(data)) {
        if (jsonFields.includes(k)) {
            fields.push(`${k} = ?`);
            values.push(JSON.stringify(v || []));
        } else if (standardFields.includes(k)) {
            fields.push(`${k} = ?`);
            values.push(v);
        }
    }

    if (fields.length === 0) return item;

    values.push(id);
    const query = `UPDATE economy_shop_items SET ${fields.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...values);
    return getShopItemById(id);
}

/**
 * Obtiene la lista de usuarios que tienen comprado un ítem en su inventario
 */
function getItemBuyers(itemId) {
    const stmt = db.prepare(`
        SELECT inv.discord_id, inv.quantity, inv.acquired_at, COALESCE(acc.username, inv.discord_id) as username
        FROM economy_inventory inv
        LEFT JOIN economy_accounts acc ON inv.discord_id = acc.discord_id
        WHERE inv.item_id = ?
        ORDER BY inv.acquired_at DESC
    `);
    return stmt.all(itemId);
}

function deleteShopItem(id, force = false) {
    const buyers = getItemBuyers(id);
    if (buyers.length > 0 && !force) {
        return {
            success: false,
            requiresConfirmation: true,
            buyers,
            buyerCount: buyers.length
        };
    }

    const tx = db.transaction(() => {
        db.prepare('DELETE FROM economy_inventory WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM economy_shop_items WHERE id = ?').run(id);
    });
    tx();

    return { success: true };
}


function getUserInventory(discordId) {
    const stmt = db.prepare(`
        SELECT inv.*, item.name, item.description, item.icon, item.price, item.roles_to_give, item.roles_to_remove
        FROM economy_inventory inv
        JOIN economy_shop_items item ON inv.item_id = item.id
        WHERE inv.discord_id = ?
        ORDER BY inv.acquired_at DESC
    `);
    const rows = stmt.all(discordId);
    return rows.map(r => ({
        ...r,
        roles_to_give: JSON.parse(r.roles_to_give || '[]'),
        roles_to_remove: JSON.parse(r.roles_to_remove || '[]')
    }));
}

function getUserItemCount(discordId, itemId) {
    const stmt = db.prepare('SELECT COALESCE(SUM(quantity), 0) as count FROM economy_inventory WHERE discord_id = ? AND item_id = ?');
    const { count } = stmt.get(discordId, itemId);
    return count;
}

/**
 * Compra atómica de un ítem de la tienda
 * Valida saldo, stock y límite por usuario en una transacción SQLite segura.
 */
function purchaseShopItem(discordId, itemId, userRoleIds = []) {
    const item = getShopItemById(itemId);
    if (!item) {
        return { success: false, message: 'El ítem solicitado no existe en la armería.' };
    }
    if (!item.is_active) {
        return { success: false, message: 'Este ítem militar se encuentra desactivado temporalmente.' };
    }

    // 1. Validar Stock
    if (item.stock !== -1 && item.stock <= 0) {
        return { success: false, message: '⚠️ Este suministro está completamente agotado en la armería.' };
    }

    // 2. Validar límite por usuario
    if (item.max_per_user !== -1) {
        const userOwns = getUserItemCount(discordId, itemId);
        if (userOwns >= item.max_per_user) {
            return { 
                success: false, 
                message: `⚠️ Ya has alcanzado el límite máximo permitido para este ítem (${item.max_per_user} compras).` 
            };
        }
    }

    // 3. Validar Roles Requeridos (Prerrequisitos)
    if (item.required_roles && item.required_roles.length > 0) {
        const hasRequired = item.required_roles.some(rId => userRoleIds.includes(rId));
        if (!hasRequired) {
            return {
                success: false,
                message: '⛔ **Acceso Denegado**: No cuentas con el rango militar requerido para adquirir este ítem.'
            };
        }
    }

    // 4. Validar Roles Bloqueados (Incompatibles)
    if (item.blocked_roles && item.blocked_roles.length > 0) {
        const hasBlocked = item.blocked_roles.some(rId => userRoleIds.includes(rId));
        if (hasBlocked) {
            return {
                success: false,
                message: '⛔ **Acceso Restringido**: Tu rango actual es incompatible con este suministro militar.'
            };
        }
    }

    // 5. Validar Fondos (prioriza cartera, si no alcanza pero tiene en banco se cobra de cartera)
    const acc = getAccount(discordId);
    if (acc.wallet < item.price) {
        return {
            success: false,
            message: `💸 **Fondos Insuficientes**: Cuesta **$${item.price}** y solo tienes **$${acc.wallet}** en tu cartera. (Retira dinero de tu banco si lo tienes guardado).`
        };
    }

    // 6. Ejecutar Transacción Atómica
    const tx = db.transaction(() => {
        // Descontar dinero de cartera
        db.prepare('UPDATE economy_accounts SET wallet = wallet - ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?')
            .run(item.price, discordId);

        // Descontar stock si no es infinito
        if (item.stock !== -1) {
            db.prepare('UPDATE economy_shop_items SET stock = stock - 1 WHERE id = ?').run(itemId);
        }

        // Registrar en inventario (si ya existe suma cantidad, sino inserta)
        const existingInv = db.prepare('SELECT id, quantity FROM economy_inventory WHERE discord_id = ? AND item_id = ?').get(discordId, itemId);
        if (existingInv) {
            db.prepare('UPDATE economy_inventory SET quantity = quantity + 1, acquired_at = CURRENT_TIMESTAMP WHERE id = ?').run(existingInv.id);
        } else {
            db.prepare('INSERT INTO economy_inventory (discord_id, item_id, quantity) VALUES (?, ?, 1)').run(discordId, itemId);
        }

        // Registrar en historial de transacciones
        logTransaction(discordId, 'BUY_ITEM', -item.price, `Compra de ítem en tienda: ${item.name}`);
    });
    tx();

    return {
        success: true,
        item,
        rolesToGive: item.roles_to_give,
        rolesToRemove: item.roles_to_remove,
        customReply: item.custom_reply || `Has adquirido **${item.name}** con éxito por **$${item.price}**.`
    };
}

// =========================================================================
// BONIFICACIONES Y MULTIPLICADORES POR ROL
// =========================================================================

function getRoleRewards(guildId = 'GLOBAL') {
    const stmt = db.prepare("SELECT * FROM economy_role_rewards WHERE guild_id = ? OR guild_id = 'GLOBAL' ORDER BY multiplier DESC, flat_bonus DESC");
    return stmt.all(guildId);
}

function setRoleReward(guildId = 'GLOBAL', { role_id, role_name, multiplier = 1.0, flat_bonus = 0 }) {
    const existing = db.prepare("SELECT id FROM economy_role_rewards WHERE (guild_id = ? OR guild_id = 'GLOBAL') AND role_id = ?").get(guildId, role_id);
    if (existing) {
        db.prepare(`
            UPDATE economy_role_rewards 
            SET role_name = ?, multiplier = ?, flat_bonus = ?
            WHERE id = ?
        `).run(role_name, multiplier, flat_bonus, existing.id);
        return existing.id;
    } else {
        const stmt = db.prepare(`
            INSERT INTO economy_role_rewards (guild_id, role_id, role_name, multiplier, flat_bonus)
            VALUES (?, ?, ?, ?, ?)
        `);
        const info = stmt.run(guildId, role_id, role_name, multiplier, flat_bonus);
        return info.lastInsertRowid;
    }
}

function deleteRoleReward(id) {
    db.prepare('DELETE FROM economy_role_rewards WHERE id = ?').run(id);
    return true;
}

function getBestRoleRewardForUser(guildId, userRoleIds = []) {
    const rewards = getRoleRewards(guildId);
    let best = { multiplier: 1.0, flat_bonus: 0, role_name: 'Recluta Base' };

    for (const r of rewards) {
        if (userRoleIds.includes(r.role_id)) {
            if (r.multiplier > best.multiplier || (r.multiplier === best.multiplier && r.flat_bonus > best.flat_bonus)) {
                best = r;
            }
        }
    }
    return best;
}

// =========================================================================
// EVENTOS Y PAGOS AUTOMÁTICOS MULTICANAL (VOZ & CHAT)
// =========================================================================

function createEvent({
    guild_id,
    name,
    event_type = 'VOICE',
    target_channel_id = '',
    payout_channel_id = '',
    registration_channel_id = null,
    confirmation_channel_id = null,
    base_reward,
    claim_deadline_hours = 24,
    grace_period_minutes = 5,
    min_attendance_percent = 80,
    max_participants = 0,
    phase = null
}) {
    // Si hay otro evento activo en el servidor, lo cancelamos o evitamos duplicidad
    const active = getActiveEvent(guild_id);
    if (active) {
        return { success: false, message: `Ya existe una operación militar activa: [${active.name}]. Finalízala primero.` };
    }

    const initialPhase = phase || (event_type === 'REGISTRATION' ? 'REGISTRATION' : 'ACTIVE');

    const stmt = db.prepare(`
        INSERT INTO event_payouts (
            guild_id, name, event_type, target_channel_id, payout_channel_id,
            registration_channel_id, confirmation_channel_id,
            base_reward, claim_deadline_hours, grace_period_minutes, min_attendance_percent,
            max_participants, phase, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `);

    const info = stmt.run(
        guild_id,
        name,
        event_type,
        target_channel_id || '',
        payout_channel_id || '',
        registration_channel_id,
        confirmation_channel_id,
        base_reward,
        claim_deadline_hours,
        grace_period_minutes,
        min_attendance_percent,
        max_participants || 0,
        initialPhase
    );

    return { success: true, event: getEventById(info.lastInsertRowid) };
}

function getActiveEvent(guildId) {
    const stmt = db.prepare("SELECT * FROM event_payouts WHERE (guild_id = ? OR guild_id = 'GLOBAL') AND status = 'ACTIVE' LIMIT 1");
    return stmt.get(guildId);
}

function getEventById(id) {
    const stmt = db.prepare('SELECT * FROM event_payouts WHERE id = ?');
    return stmt.get(id);
}

function recordAttendanceHeartbeat(eventId, discordId, username, addedSeconds = 10) {
    const now = Math.floor(Date.now() / 1000);
    const existing = db.prepare('SELECT * FROM event_attendance WHERE event_id = ? AND discord_id = ?').get(eventId, discordId);

    if (existing) {
        db.prepare(`
            UPDATE event_attendance 
            SET last_seen = ?, total_seconds_present = total_seconds_present + ? 
            WHERE id = ?
        `).run(now, addedSeconds, existing.id);
    } else {
        db.prepare(`
            INSERT INTO event_attendance (event_id, discord_id, username, first_seen, last_seen, total_seconds_present, message_count)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        `).run(eventId, discordId, username, now, now, addedSeconds);
    }
}

function recordChatActivity(eventId, discordId, username) {
    const now = Math.floor(Date.now() / 1000);
    const existing = db.prepare('SELECT * FROM event_attendance WHERE event_id = ? AND discord_id = ?').get(eventId, discordId);

    if (existing) {
        db.prepare(`
            UPDATE event_attendance 
            SET last_seen = ?, message_count = message_count + 1 
            WHERE id = ?
        `).run(now, existing.id);
    } else {
        db.prepare(`
            INSERT INTO event_attendance (event_id, discord_id, username, first_seen, last_seen, total_seconds_present, message_count)
            VALUES (?, ?, ?, ?, ?, 0, 1)
        `).run(eventId, discordId, username, now, now);
    }
}

function finalizeAttendanceCalculation(eventId) {
    const event = getEventById(eventId);
    if (!event) return null;

    const endedAtUnix = Math.floor(Date.now() / 1000);
    const createdAtUnix = Math.floor(new Date(event.created_at).getTime() / 1000);
    const totalDurationSeconds = Math.max(60, endedAtUnix - createdAtUnix);
    const graceSeconds = (event.grace_period_minutes || 5) * 60;
    const minPercent = (event.min_attendance_percent || 80) / 100;

    const attendees = db.prepare('SELECT * FROM event_attendance WHERE event_id = ?').all(eventId);

    const updateStmt = db.prepare('UPDATE event_attendance SET is_eligible = ? WHERE id = ?');

    const updateTx = db.transaction(() => {
        for (const att of attendees) {
            let eligible = 0;

            if (att.status === 'EXPELLED' || att.status === 'CANCELLED') {
                eligible = 0;
            } else if (att.attendance_confirmed === 1) {
                // Asistencia confirmada explícitamente por botón de pase de lista o validación de oficial
                eligible = 1;
            } else if (event.event_type === 'VOICE') {
                // Presencia efectiva + tolerancia a caídas de conexión
                // Si el tiempo efectivo + tolerancia cubre el porcentaje requerido
                const effectivePresence = att.total_seconds_present + graceSeconds;
                const ratio = effectivePresence / totalDurationSeconds;
                if (ratio >= minPercent) {
                    eligible = 1;
                }
            } else if (event.event_type === 'TEXT') {
                // Participación en chat: mínimo 2 mensajes y presencia temporal
                if (att.message_count >= 2) {
                    eligible = 1;
                }
            } else if (event.event_type === 'HYBRID') {
                const ratio = (att.total_seconds_present + graceSeconds) / totalDurationSeconds;
                if (ratio >= minPercent && att.message_count >= 1) {
                    eligible = 1;
                }
            }

            updateStmt.run(eligible, att.id);
        }
    });
    updateTx();

    return db.prepare('SELECT * FROM event_attendance WHERE event_id = ?').all(eventId);
}

function finalizeEvent(eventId, discordMessageId = null) {
    finalizeAttendanceCalculation(eventId);
    const event = getEventById(eventId);
    if (!event) return false;

    const claimExpiresAt = Math.floor(Date.now() / 1000) + ((event.claim_deadline_hours || 24) * 3600);

    db.prepare(`
        UPDATE event_payouts 
        SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP, claim_expires_at = ?, discord_message_id = ?
        WHERE id = ?
    `).run(claimExpiresAt, discordMessageId, eventId);

    return getEventById(eventId);
}

function getEventAttendance(eventId) {
    return db.prepare('SELECT * FROM event_attendance WHERE event_id = ? ORDER BY is_eligible DESC, total_seconds_present DESC').all(eventId);
}

function getUserEventRecord(eventId, discordId) {
    return db.prepare('SELECT * FROM event_attendance WHERE event_id = ? AND discord_id = ?').get(eventId, discordId);
}

/**
 * Reclamo seguro de pago de evento
 */
function claimEventPayout(eventId, discordId, userRoleIds = []) {
    const event = getEventById(eventId);
    if (!event) {
        return { success: false, message: 'Operación militar no encontrada.' };
    }

    if (event.status !== 'ENDED') {
        return { success: false, message: 'Esta operación aún sigue activa o no ha concluido.' };
    }

    // Validar plazo de expiración
    const now = Math.floor(Date.now() / 1000);
    if (event.claim_expires_at && now > event.claim_expires_at) {
        return { 
            success: false, 
            message: '⌛ **Plazo Expirado**: El periodo establecido para reclamar los fondos de esta operación militar ha finalizado.' 
        };
    }

    // Validar asistencia
    const att = getUserEventRecord(eventId, discordId);
    if (!att) {
        return { 
            success: false, 
            message: '❌ **Sin Registro**: No fuiste detectado en el canal asignado durante el desarrollo de la operación.' 
        };
    }

    if (att.status === 'EXPELLED') {
        return {
            success: false,
            message: '❌ **Descalificado**: Has sido retirado de esta operación militar por un oficial. No tienes derecho a cobro.'
        };
    }

    if (att.status === 'CANCELLED') {
        return {
            success: false,
            message: '⚠️ **Inscripción Anulada**: Habías cancelado tu participación en esta operación militar.'
        };
    }

    if (!att.is_eligible) {
        return { 
            success: false, 
            message: `⚠️ **No Elegible**: Tu permanencia/participación no alcanzó el mínimo requerido (${event.min_attendance_percent}% de tiempo o actividad) o superaste la tolerancia permitida.` 
        };
    }

    if (att.claimed) {
        return { 
            success: false, 
            message: `🎖️ **Ya Reclamado**: Ya cobraste tu paga de **$${att.payout_amount}** para esta misión el ${att.claimed_at}.` 
        };
    }

    // Calcular multiplicadores por Rango Militar
    const bestRole = getBestRoleRewardForUser(event.guild_id, userRoleIds);
    const finalAmount = Math.floor((event.base_reward * bestRole.multiplier) + bestRole.flat_bonus);

    // Ejecutar abono en transacción atómica
    const tx = db.transaction(() => {
        // Abonar a la cartera del usuario
        db.prepare('UPDATE economy_accounts SET wallet = wallet + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?')
            .run(finalAmount, discordId);

        // Marcar asistencia como reclamada
        db.prepare(`
            UPDATE event_attendance 
            SET claimed = 1, claimed_at = CURRENT_TIMESTAMP, payout_amount = ? 
            WHERE id = ?
        `).run(finalAmount, att.id);

        // Registrar log de transacción
        logTransaction(discordId, 'EVENT_CLAIM', finalAmount, `Paga militar de evento: ${event.name} (Rango: ${bestRole.role_name || 'Estándar'})`);
    });
    tx();

    return {
        success: true,
        amount: finalAmount,
        baseReward: event.base_reward,
        bonusRole: bestRole.role_name,
        multiplier: bestRole.multiplier,
        account: getAccount(discordId)
    };
}

function getEventHistory(guildId = 'GLOBAL', limit = 15) {
    const stmt = db.prepare(`
        SELECT e.*, 
            (SELECT COUNT(*) FROM event_attendance WHERE event_id = e.id) as total_attendees,
            (SELECT COUNT(*) FROM event_attendance WHERE event_id = e.id AND is_eligible = 1) as eligible_count,
            (SELECT COUNT(*) FROM event_attendance WHERE event_id = e.id AND claimed = 1) as claimed_count,
            (SELECT COALESCE(SUM(payout_amount), 0) FROM event_attendance WHERE event_id = e.id) as total_paid
        FROM event_payouts e
        WHERE e.guild_id = ? OR e.guild_id = 'GLOBAL'
        ORDER BY e.created_at DESC
        LIMIT ?
    `);
    return stmt.all(guildId, limit);
}

/**
 * Registra a un combatiente en la lista previa de la operación
 */
function registerUserForEvent(eventId, discordId, username = '') {
    const event = getEventById(eventId);
    if (!event) return { success: false, message: 'Operación militar no encontrada.' };
    if (event.status === 'ENDED' || event.status === 'CANCELLED') {
        return { success: false, message: 'Esta operación militar ya ha concluido y no acepta nuevos registros.' };
    }

    // Comprobar límite de reclutas si está configurado
    if (event.max_participants > 0) {
        const count = db.prepare("SELECT COUNT(*) as c FROM event_attendance WHERE event_id = ? AND status != 'CANCELLED'").get(eventId).c;
        if (count >= event.max_participants) {
            return { success: false, message: `⚠️ Cupo militar agotado: se ha alcanzado el límite máximo de ${event.max_participants} reclutas.` };
        }
    }

    const now = Math.floor(Date.now() / 1000);
    const existing = db.prepare('SELECT * FROM event_attendance WHERE event_id = ? AND discord_id = ?').get(eventId, discordId);

    if (existing) {
        if (existing.status === 'EXPELLED') {
            return { success: false, message: '❌ Has sido descalificado de esta misión militar por el oficial al mando.' };
        }
        if (existing.status === 'REGISTERED' || existing.status === 'CONFIRMED') {
            return { success: false, message: '⚠️ Ya estás registrado en el pase de lista de esta operación militar.' };
        }
        db.prepare(`
            UPDATE event_attendance
            SET status = 'REGISTERED', registered_at = CURRENT_TIMESTAMP, last_seen = ?
            WHERE id = ?
        `).run(now, existing.id);
        return { success: true, message: '¡Recluta reincorporado y registrado exitosamente a la operación!', event };
    }

    db.prepare(`
        INSERT INTO event_attendance (
            event_id, discord_id, username, first_seen, last_seen,
            total_seconds_present, message_count, is_eligible, claimed,
            registered_at, attendance_confirmed, status
        )
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, CURRENT_TIMESTAMP, 0, 'REGISTERED')
    `).run(eventId, discordId, username || 'Recluta', now, now);

    return { success: true, message: '¡Inscripción militar formalizada con éxito!', event };
}

/**
 * Permite a un recluta anular su registro en la operación militar
 */
function unregisterUserFromEvent(eventId, discordId) {
    const event = getEventById(eventId);
    if (!event) return { success: false, message: 'Operación militar no encontrada.' };
    if (event.status === 'ENDED') {
        return { success: false, message: 'La operación ya concluyó; no es posible anular la inscripción.' };
    }

    const existing = db.prepare('SELECT * FROM event_attendance WHERE event_id = ? AND discord_id = ?').get(eventId, discordId);
    if (!existing || existing.status === 'CANCELLED') {
        return { success: false, message: 'No figuras en la lista activa de reclutas inscritos para esta operación.' };
    }

    if (existing.claimed) {
        return { success: false, message: 'Ya cobraste tus haberes para esta misión; no se puede cancelar el registro.' };
    }

    db.prepare("UPDATE event_attendance SET status = 'CANCELLED', attendance_confirmed = 0, is_eligible = 0 WHERE id = ?").run(existing.id);
    return { success: true, message: 'Has anulado tu inscripción a la operación militar.' };
}

/**
 * Expulsa / retira a un combatiente de la lista de la operación militar
 */
function expelUserFromEvent(eventId, discordId, adminId = null) {
    const event = getEventById(eventId);
    if (!event) return { success: false, message: 'Operación militar no encontrada.' };

    const existing = db.prepare('SELECT * FROM event_attendance WHERE event_id = ? AND discord_id = ?').get(eventId, discordId);
    if (!existing) {
        return { success: false, message: 'El combatiente no figura en el registro de esta operación.' };
    }

    db.prepare(`
        UPDATE event_attendance
        SET status = 'EXPELLED',
            attendance_confirmed = 0,
            is_eligible = 0
        WHERE id = ?
    `).run(existing.id);

    return { 
        success: true, 
        message: `Combatiente <@${discordId}> ha sido retirado de la operación militar.`,
        username: existing.username,
        discord_id: discordId
    };
}

/**
 * Confirma la asistencia presencial de un recluta en la operación militar
 */
function confirmAttendanceForEvent(eventId, discordId, username = '') {
    const event = getEventById(eventId);
    if (!event) return { success: false, message: 'Operación militar no encontrada.' };

    const now = Math.floor(Date.now() / 1000);
    const existing = db.prepare('SELECT * FROM event_attendance WHERE event_id = ? AND discord_id = ?').get(eventId, discordId);

    if (existing) {
        if (existing.status === 'EXPELLED') {
            return { 
                success: false, 
                message: '❌ **Acceso Denegado:** Has sido retirado / descalificado de esta operación militar por un oficial. No puedes confirmar asistencia.' 
            };
        }
        if (existing.status === 'CANCELLED') {
            return { 
                success: false, 
                message: '⚠️ Habías anulado tu inscripción a esta operación militar.' 
            };
        }
        if (existing.attendance_confirmed === 1) {
            return { success: false, message: '✅ Tu asistencia a esta operación ya fue confirmada previamente.' };
        }
        db.prepare(`
            UPDATE event_attendance
            SET attendance_confirmed = 1,
                attendance_confirmed_at = CURRENT_TIMESTAMP,
                is_eligible = 1,
                status = 'CONFIRMED',
                last_seen = ?
            WHERE id = ?
        `).run(now, existing.id);
        return { success: true, message: '🎖️ ¡Asistencia confirmada! Has sido acreditado como apto para la paga militar.', event };
    }

    // Si el evento era de convocatoria con pre-registro estricto y no estaba en lista
    if (event.event_type === 'REGISTRATION') {
        return { 
            success: false, 
            message: '⚠️ No estabas pre-registrado en la convocatoria de esta operación militar.' 
        };
    }

    // Si no estaba pre-registrado y es un evento abierto, lo incorpora y confirma como asistente en el terreno
    db.prepare(`
        INSERT INTO event_attendance (
            event_id, discord_id, username, first_seen, last_seen,
            total_seconds_present, message_count, is_eligible, claimed,
            registered_at, attendance_confirmed, attendance_confirmed_at, status
        )
        VALUES (?, ?, ?, ?, ?, 0, 0, 1, 0, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP, 'CONFIRMED')
    `).run(eventId, discordId, username || 'Recluta', now, now);

    return { success: true, message: '🎖️ ¡Asistencia confirmada en el terreno! Has sido acreditado para el cobro militar.', event };
}

/**
 * Actualiza la fase de un evento y opcionalmente IDs de mensajes/canales asociados
 */
function setEventPhase(eventId, phase, data = {}) {
    const fields = ['phase = ?'];
    const values = [phase];

    if (data.registration_channel_id) { fields.push('registration_channel_id = ?'); values.push(data.registration_channel_id); }
    if (data.registration_message_id) { fields.push('registration_message_id = ?'); values.push(data.registration_message_id); }
    if (data.confirmation_channel_id) { fields.push('confirmation_channel_id = ?'); values.push(data.confirmation_channel_id); }
    if (data.confirmation_message_id) { fields.push('confirmation_message_id = ?'); values.push(data.confirmation_message_id); }
    if (data.payout_channel_id) { fields.push('payout_channel_id = ?'); values.push(data.payout_channel_id); }
    if (data.discord_message_id) { fields.push('discord_message_id = ?'); values.push(data.discord_message_id); }

    values.push(eventId);
    db.prepare(`UPDATE event_payouts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return getEventById(eventId);
}

/**
 * Ajuste manual de asistencia/elegibilidad por un oficial desde el panel web
 */
function manualToggleAttendance(eventId, discordId, { isEligible, isConfirmed }) {
    const existing = db.prepare('SELECT * FROM event_attendance WHERE event_id = ? AND discord_id = ?').get(eventId, discordId);
    if (!existing) return { success: false, message: 'Registro de combatiente no encontrado.' };

    const newEligible = isEligible !== undefined ? (isEligible ? 1 : 0) : existing.is_eligible;
    const newConfirmed = isConfirmed !== undefined ? (isConfirmed ? 1 : 0) : existing.attendance_confirmed;
    const newStatus = newConfirmed ? 'CONFIRMED' : (existing.status === 'CONFIRMED' ? 'REGISTERED' : existing.status);

    db.prepare(`
        UPDATE event_attendance
        SET is_eligible = ?, attendance_confirmed = ?, status = ?
        WHERE id = ?
    `).run(newEligible, newConfirmed, newStatus, existing.id);

    return { success: true, record: db.prepare('SELECT * FROM event_attendance WHERE id = ?').get(existing.id) };
}

/**
 * Pago Masivo Directo: Liquida a todos los reclutas confirmados de inmediato
 */
function massPayoutEvent(eventId, discordClient = null, officerDiscordId = null) {
    const event = getEventById(eventId);
    if (!event) return { success: false, message: 'Operación militar no encontrada.' };

    const attendees = db.prepare("SELECT * FROM event_attendance WHERE event_id = ? AND is_eligible = 1 AND claimed = 0 AND status != 'EXPELLED' AND status != 'CANCELLED'").all(eventId);
    if (attendees.length === 0) {
        return { success: false, message: 'No hay reclutas confirmados pendientes de cobro para esta operación.' };
    }

    const guild = discordClient && event.guild_id !== 'GLOBAL' ? discordClient.guilds.cache.get(event.guild_id) : null;
    let totalPaid = 0;
    const paidList = [];

    const tx = db.transaction(() => {
        for (const att of attendees) {
            let userRoleIds = [];
            if (guild) {
                const member = guild.members.cache.get(att.discord_id);
                if (member) userRoleIds = member.roles.cache.map(r => r.id);
            }

            const bestRole = getBestRoleRewardForUser(event.guild_id, userRoleIds);
            const finalAmount = Math.floor((event.base_reward * bestRole.multiplier) + bestRole.flat_bonus);

            // Asegurar cuenta creada
            getAccount(att.discord_id, event.guild_id, att.username);

            // Abonar fondos
            db.prepare('UPDATE economy_accounts SET wallet = wallet + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?')
                .run(finalAmount, att.discord_id);

            // Marcar como cobrado
            db.prepare(`
                UPDATE event_attendance 
                SET claimed = 1, claimed_at = CURRENT_TIMESTAMP, payout_amount = ? 
                WHERE id = ?
            `).run(finalAmount, att.id);

            // Log contable
            const officerTag = officerDiscordId ? `Oficial <@${officerDiscordId}>` : 'Comando Central';
            logTransaction(att.discord_id, 'EVENT_CLAIM', finalAmount, `Paga militar de evento: ${event.name} (Liquidación directa por ${officerTag})`);

            totalPaid += finalAmount;
            paidList.push({ discord_id: att.discord_id, username: att.username, amount: finalAmount, role: bestRole.role_name });
        }

        // Si todos cobraron, finalizar evento
        db.prepare("UPDATE event_payouts SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP, phase = 'ENDED' WHERE id = ?").run(eventId);
    });
    tx();

    return {
        success: true,
        paidCount: paidList.length,
        totalDistributed: totalPaid,
        paidList
    };
}

/**
 * Obtiene la lista completa de registrados y confirmados para un evento
 */
function getEventRegistrations(eventId, includeExpelled = false) {
    const query = includeExpelled
        ? `
        SELECT a.*, 
               COALESCE(acc.avatar, '') as avatar,
               acc.wallet, 
               acc.bank
        FROM event_attendance a
        LEFT JOIN economy_accounts acc ON a.discord_id = acc.discord_id
        WHERE a.event_id = ?
        ORDER BY a.attendance_confirmed DESC, a.registered_at ASC, a.total_seconds_present DESC
        `
        : `
        SELECT a.*, 
               COALESCE(acc.avatar, '') as avatar,
               acc.wallet, 
               acc.bank
        FROM event_attendance a
        LEFT JOIN economy_accounts acc ON a.discord_id = acc.discord_id
        WHERE a.event_id = ? AND a.status != 'EXPELLED' AND a.status != 'CANCELLED'
        ORDER BY a.attendance_confirmed DESC, a.registered_at ASC, a.total_seconds_present DESC
        `;
    return db.prepare(query).all(eventId);
}

// =========================================================================
// PANELES Y GESTIÓN DE BONOS MILITARES (INTERACTIVOS CON BOTÓN)
// =========================================================================

function getAllBonusPanels(guildId = 'GLOBAL') {
    const panels = db.prepare("SELECT * FROM economy_bonus_panels WHERE (guild_id = ? OR guild_id = 'GLOBAL') ORDER BY id DESC").all(guildId);
    return panels.map(p => {
        const stats = db.prepare('SELECT COUNT(*) as claims, COALESCE(SUM(amount), 0) as total FROM economy_bonus_claims WHERE panel_id = ?').get(p.id);
        return {
            ...p,
            required_roles: JSON.parse(p.required_roles || '[]'),
            total_claims: stats ? stats.claims : 0,
            total_distributed: stats ? stats.total : 0
        };
    });
}

function getBonusPanelById(panelId) {
    const panel = db.prepare('SELECT * FROM economy_bonus_panels WHERE id = ?').get(panelId);
    if (!panel) return null;
    return {
        ...panel,
        required_roles: JSON.parse(panel.required_roles || '[]')
    };
}

function getBonusPanel(guildId = 'GLOBAL') {
    let stmt = db.prepare("SELECT * FROM economy_bonus_panels WHERE (guild_id = ? OR guild_id = 'GLOBAL') AND is_active = 1 ORDER BY id DESC LIMIT 1");
    let panel = stmt.get(guildId);
    if (!panel) {
        let stmtAny = db.prepare("SELECT * FROM economy_bonus_panels WHERE (guild_id = ? OR guild_id = 'GLOBAL') ORDER BY id DESC LIMIT 1");
        panel = stmtAny.get(guildId);
    }
    if (!panel) {
        return createBonusPanel(guildId, {});
    }
    return {
        ...panel,
        required_roles: JSON.parse(panel.required_roles || '[]')
    };
}

function createBonusPanel(guildId = 'GLOBAL', data = {}) {
    const stmt = db.prepare(`
        INSERT INTO economy_bonus_panels (
            guild_id, title, description, amount, claim_mode, cooldown_seconds,
            button_label, button_emoji, channel_id, message_id, required_roles, is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
        guildId,
        data.title || '🎖️ [BONO MILITAR EXTRAORDINARIO // ASIGNACIÓN DE MANDO]',
        data.description || 'El Estado Mayor de la Base USMC ha autorizado una asignación financiera especial para el personal militar en servicio activo.',
        data.amount !== undefined ? parseInt(data.amount, 10) : 500,
        data.claim_mode || 'ONCE',
        data.cooldown_seconds !== undefined ? parseInt(data.cooldown_seconds, 10) : 86400,
        data.button_label || 'RECLAMAR BONO MILITAR',
        data.button_emoji || '🎁',
        data.channel_id || '',
        data.message_id || '',
        JSON.stringify(Array.isArray(data.required_roles) ? data.required_roles : []),
        data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
    );

    return getBonusPanelById(info.lastInsertRowid);
}

function saveBonusPanel(guildId = 'GLOBAL', data = {}) {
    const panelId = data.id || (getBonusPanel(guildId)?.id);
    if (!panelId) return createBonusPanel(guildId, data);

    const fields = [];
    const values = [];
    const allowed = ['title', 'description', 'amount', 'claim_mode', 'cooldown_seconds', 'button_label', 'button_emoji', 'channel_id', 'message_id', 'is_active'];

    for (const [k, v] of Object.entries(data)) {
        if (allowed.includes(k)) {
            fields.push(`${k} = ?`);
            values.push(k === 'is_active' ? (v ? 1 : 0) : v);
        }
    }

    if (data.required_roles !== undefined) {
        fields.push('required_roles = ?');
        values.push(JSON.stringify(Array.isArray(data.required_roles) ? data.required_roles : []));
    }

    if (fields.length > 0) {
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(panelId);
        const query = `UPDATE economy_bonus_panels SET ${fields.join(', ')} WHERE id = ?`;
        db.prepare(query).run(...values);
    }
    return getBonusPanelById(panelId);
}

function deleteBonusPanel(panelId) {
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM economy_bonus_claims WHERE panel_id = ?').run(panelId);
        db.prepare('DELETE FROM economy_bonus_panels WHERE id = ?').run(panelId);
    });
    tx();
    return true;
}

function resetBonusClaims(panelId) {
    const info = db.prepare('DELETE FROM economy_bonus_claims WHERE panel_id = ?').run(panelId);
    return { success: true, deletedClaims: info.changes };
}

function claimPanelBonus(panelId, discordId, memberRoles = []) {
    let panel;
    if (panelId) {
        panel = db.prepare('SELECT * FROM economy_bonus_panels WHERE id = ?').get(panelId);
    }
    if (!panel) {
        panel = db.prepare('SELECT * FROM economy_bonus_panels ORDER BY id DESC LIMIT 1').get();
    }
    if (!panel) {
        return { success: false, message: '❌ **Sin Panel Activo**: No hay un panel de bonos activo configurado en el sistema.' };
    }

    if (panel.is_active === 0) {
        return { success: false, message: '🔒 **Bono Inactivo**: La asignación de este bono militar ha sido cerrada o pausada por la comandancia.' };
    }

    const requiredRoles = JSON.parse(panel.required_roles || '[]');
    if (requiredRoles.length > 0) {
        const hasReq = requiredRoles.some(rId => memberRoles.includes(rId));
        if (!hasReq) {
            return { 
                success: false, 
                message: '⛔ **Acceso Restringido por Rango**: Tu escalafón militar actual no cumple los roles requeridos para reclamar este bono extraordinario.' 
            };
        }
    }

    const now = Math.floor(Date.now() / 1000);

    // Modo: Una sola vez (ONCE)
    if (panel.claim_mode === 'ONCE') {
        const existing = db.prepare('SELECT * FROM economy_bonus_claims WHERE panel_id = ? AND discord_id = ?').get(panel.id, discordId);
        if (existing) {
            return {
                success: false,
                message: `🎖️ **Bono Ya Reclamado**: Ya has cobrado previamente esta asignación de **$${existing.amount.toLocaleString()}** el ${existing.claimed_at}. *(Límite militar: 1 reclamo por soldado)*.`
            };
        }
    } else if (panel.claim_mode === 'COOLDOWN') {
        const lastClaim = db.prepare('SELECT * FROM economy_bonus_claims WHERE panel_id = ? AND discord_id = ? ORDER BY timestamp_unix DESC LIMIT 1').get(panel.id, discordId);
        const cooldown = panel.cooldown_seconds || 86400;
        if (lastClaim && (now - lastClaim.timestamp_unix) < cooldown) {
            const waitSec = (lastClaim.timestamp_unix + cooldown) - now;
            const hours = Math.floor(waitSec / 3600);
            const minutes = Math.floor((waitSec % 3600) / 60);
            const seconds = waitSec % 60;
            const waitStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
            return {
                success: false,
                message: `⏳ **Frecuencia Militar Excedida**: Ya reclamaste este bono recientemente. Debes esperar **${waitStr}** para solicitar la siguiente asignación de servicio.`
            };
        }
    }

    // Acreditación atómica
    const amount = panel.amount || 500;
    const tx = db.transaction(() => {
        getAccount(discordId);
        db.prepare('UPDATE economy_accounts SET wallet = wallet + ?, last_bonus = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?')
            .run(amount, now, discordId);
        
        db.prepare(`
            INSERT INTO economy_bonus_claims (panel_id, discord_id, amount, timestamp_unix)
            VALUES (?, ?, ?, ?)
        `).run(panel.id, discordId, amount, now);

        logTransaction(discordId, 'BONUS_CLAIM', amount, `Bono reclamado desde panel táctico: "${panel.title}" (Modo: ${panel.claim_mode})`);
    });
    tx();

    const updatedAcc = getAccount(discordId);
    return {
        success: true,
        amount,
        account: updatedAcc,
        panel,
        message: `¡Asignación militar de **$${amount.toLocaleString()}** acreditada en tu cartera con éxito!`
    };
}

function giveBonus(discordId, amount, reason = '', target = 'wallet', issuerTag = 'Oficial USMC') {
    getAccount(discordId);
    const col = target === 'bank' ? 'bank' : 'wallet';
    const num = Math.max(1, parseInt(amount, 10));

    db.prepare(`UPDATE economy_accounts SET ${col} = ${col} + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`).run(num, discordId);
    logTransaction(discordId, 'BONUS_GIVE', num, `Bono concedido por ${issuerTag}: ${reason || 'Gratificación táctica'}`);
    return getAccount(discordId);
}

function giveMassBonus(amount, reason = '', issuerTag = 'Mando USMC') {
    const num = Math.max(1, parseInt(amount, 10));
    const stmt = db.prepare(`
        UPDATE economy_accounts 
        SET wallet = wallet + ?, updated_at = CURRENT_TIMESTAMP 
        WHERE LENGTH(discord_id) >= 17 AND discord_id GLOB '[0-9]*'
    `);
    const info = stmt.run(num);
    logTransaction('GLOBAL', 'MASS_BONUS', num, `Bono masivo a ${info.changes} combatientes por ${issuerTag}: ${reason || 'Gratificación general de brigada'}`);
    return { count: info.changes, amount: num };
}

function getBonusStats(guildId = 'GLOBAL', panelId = null) {
    const panel = panelId ? getBonusPanelById(panelId) : getBonusPanel(guildId);
    if (!panel) {
        return {
            panel: null,
            totalClaims: 0,
            totalDistributed: 0,
            recentClaims: []
        };
    }

    const countRow = db.prepare('SELECT COUNT(*) as total_claims, COALESCE(SUM(amount), 0) as total_distributed FROM economy_bonus_claims WHERE panel_id = ?').get(panel.id);
    const recent = db.prepare(`
        SELECT c.*, COALESCE(NULLIF(a.username, ''), c.discord_id) as username, a.avatar
        FROM economy_bonus_claims c
        LEFT JOIN economy_accounts a ON c.discord_id = a.discord_id
        WHERE c.panel_id = ?
        ORDER BY c.claimed_at DESC
        LIMIT 10
    `).all(panel.id);

    return {
        panel,
        totalClaims: countRow ? countRow.total_claims : 0,
        totalDistributed: countRow ? countRow.total_distributed : 0,
        recentClaims: recent
    };
}

// Inicializar tablas de economía al cargar el módulo
try {
    initEconomyTables();
} catch (e) {
    console.error('Error al inicializar tablas de economía:', e.message);
}

module.exports = {
    initEconomyTables,
    getAccount,
    updateCooldown,
    addWallet,
    removeWallet,
    addBank,
    removeBank,
    deposit,
    withdraw,
    transfer,
    getLeaderboard,
    getAllEconomyAccounts,
    countEconomyAccounts,
    deleteEconomyAccount,
    adminAdjustBalance,
    getRecentTransactions,
    getEconomySettings,
    updateEconomySettings,
    getShopItems,
    getShopItemById,
    createShopItem,
    updateShopItem,
    deleteShopItem,
    getItemBuyers,
    getUserInventory,
    purchaseShopItem,
    getRoleRewards,
    setRoleReward,
    deleteRoleReward,
    getBestRoleRewardForUser,
    createEvent,
    getActiveEvent,
    getEventById,
    recordAttendanceHeartbeat,
    recordChatActivity,
    finalizeEvent,
    getEventAttendance,
    getUserEventRecord,
    claimEventPayout,
    getEventHistory,
    syncAccountUser,
    getCommandPermissions,
    updateCommandPermission,
    isCommandAllowed,
    getAllBonusPanels,
    getBonusPanelById,
    getBonusPanel,
    createBonusPanel,
    saveBonusPanel,
    deleteBonusPanel,
    resetBonusClaims,
    claimPanelBonus,
    giveBonus,
    giveMassBonus,
    getBonusStats,
    registerUserForEvent,
    unregisterUserFromEvent,
    expelUserFromEvent,
    confirmAttendanceForEvent,
    setEventPhase,
    manualToggleAttendance,
    massPayoutEvent,
    getEventRegistrations,
    getEnrichedTransactions,
    countEnrichedTransactions,
    getTreasuryStats,
    getUserFinancialProfile,
    deleteTransaction,
    deleteTransactions,
    clearAllTransactions,
    setOnTransactionLogged
};
