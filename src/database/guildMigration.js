const fs = require('node:fs');
const path = require('node:path');

// Run against the raw connection before serving requests. Every step is transactional;
// VACUUM INTO captures WAL data as well as the main database file.
function migrateGuildTables(db, dbPath, group) {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
    const name = `guild-partition-v1-${group}`;
    if (db.prepare('SELECT name FROM schema_migrations WHERE name=?').get(name)) return;
    const guilds = db.prepare("SELECT guild_id FROM config WHERE guild_id NOT IN ('default','GLOBAL')").all();
    const legacyGuild = process.env.GUILD_ID || (guilds.length === 1 ? guilds[0].guild_id : 'GLOBAL');
    if (!process.env.GUILD_ID && guilds.length > 1) throw new Error('Configura GUILD_ID para identificar la comunidad de los datos antiguos antes de migrar.');
    const tables = group === 'core'
        ? ['questions', 'verifications', 'admin_audit_logs', 'admin_sessions', 'private_servers', 'private_server_boards']
        : ['economy_accounts', 'economy_inventory', 'economy_transactions', 'economy_command_permissions', 'shop_orders', 'event_attendance', 'economy_bonus_claims', 'economy_shop_items', 'economy_role_rewards', 'event_payouts', 'event_report_templates', 'economy_bonus_panels', 'economy_settings'];
    const exists = table => db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table);
    const populated = tables.some(table => exists(table) && db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get());
    if (populated && dbPath !== ':memory:') {
        const directory = path.join(path.dirname(dbPath), 'backups');
        fs.mkdirSync(directory, { recursive: true });
        const backup = path.join(directory, `before-${name}-${Date.now()}.sqlite`);
        db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
    }
    const migrate = db.transaction(() => {
        for (const table of tables) {
            const schema = exists(table);
            if (!schema) continue;
            const columns = db.prepare(`PRAGMA table_info(${table})`).all();
            if (columns.some(column => column.name === 'guild_id')) {
                // A configured primary row wins over a legacy GLOBAL setting.
                // Keep conflicting legacy rows intact rather than overwrite or delete them;
                // tenant queries never expose GLOBAL as a fallback.
                db.prepare(`UPDATE OR IGNORE ${table} SET guild_id=? WHERE guild_id IN ('GLOBAL','default') OR guild_id IS NULL`).run(legacyGuild);
                continue;
            }
            const key = { economy_accounts: 'discord_id', verifications: 'discord_id', economy_command_permissions: 'command_name' }[table];
            if (key) {
                let sql = schema.sql.replace(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ["\x60]?${table}["\x60]?`, 'i'), `CREATE TABLE ${table}_guild_migration`);
                if (table === 'verifications') sql = sql.replace(/discord_id TEXT NOT NULL UNIQUE/i, 'discord_id TEXT NOT NULL');
                else sql = sql.replace(new RegExp(`${key} TEXT PRIMARY KEY`, 'i'), `${key} TEXT NOT NULL`);
                sql = sql.replace(/\)\s*$/, `, guild_id TEXT NOT NULL DEFAULT (current_guild_id()), ${table === 'verifications' ? 'UNIQUE' : 'PRIMARY KEY'} (guild_id, ${key}))`);
                db.exec(sql);
                const names = columns.map(column => column.name).join(',');
                db.prepare(`INSERT INTO ${table}_guild_migration (${names},guild_id) SELECT ${names},? FROM ${table}`).run(legacyGuild);
                db.exec(`DROP TABLE ${table}; ALTER TABLE ${table}_guild_migration RENAME TO ${table}`);
            } else {
                // ALTER does not accept a function default on a populated table.
                db.exec(`ALTER TABLE ${table} ADD COLUMN guild_id TEXT NOT NULL DEFAULT ''`);
                db.prepare(`UPDATE ${table} SET guild_id=?`).run(legacyGuild);
            }
            db.exec(`CREATE INDEX IF NOT EXISTS ${table}_guild_partition ON ${table}(guild_id)`);
        }
        if (group === 'economy') {
            db.exec(`UPDATE event_attendance SET guild_id=COALESCE((SELECT guild_id FROM event_payouts WHERE id=event_attendance.event_id),guild_id);
                UPDATE economy_inventory SET guild_id=COALESCE((SELECT guild_id FROM economy_shop_items WHERE id=economy_inventory.item_id),guild_id);
                UPDATE shop_orders SET guild_id=COALESCE((SELECT guild_id FROM economy_shop_items WHERE id=shop_orders.item_id),guild_id);
                UPDATE economy_bonus_claims SET guild_id=COALESCE((SELECT guild_id FROM economy_bonus_panels WHERE id=economy_bonus_claims.panel_id),guild_id);`);
        }
        db.prepare('INSERT INTO schema_migrations(name) VALUES (?)').run(name);
        const check = db.prepare('PRAGMA quick_check').get();
        if (Object.values(check)[0] !== 'ok') throw new Error('La comprobación de integridad de la migración falló.');
    });
    migrate();
}
function installGuildConstraints(db) {
    for (const [child, foreignKey, parent] of [
        ['event_attendance', 'event_id', 'event_payouts'], ['economy_inventory', 'item_id', 'economy_shop_items'],
        ['shop_orders', 'item_id', 'economy_shop_items'], ['economy_bonus_claims', 'panel_id', 'economy_bonus_panels']
    ]) {
        for (const operation of ['INSERT', `UPDATE OF guild_id, ${foreignKey}`]) {
            db.exec(`CREATE TRIGGER IF NOT EXISTS ${child}_guild_${operation.startsWith('INSERT') ? 'insert' : 'update'}
                BEFORE ${operation} ON ${child} BEGIN
                SELECT RAISE(ABORT, 'El recurso pertenece a otra comunidad')
                WHERE NOT EXISTS (SELECT 1 FROM ${parent} WHERE id=NEW.${foreignKey} AND guild_id=NEW.guild_id);
                END`);
        }
    }
}
module.exports = { migrateGuildTables, installGuildConstraints };
