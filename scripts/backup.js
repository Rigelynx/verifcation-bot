const fs = require('node:fs');
const path = require('node:path');
function backupDatabase(db, filename) {
    if (filename === ':memory:') throw new Error('La base en memoria no admite este respaldo.');
    const root = path.dirname(path.resolve(filename));
    const destination = path.join(root, 'backups', `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(destination, { recursive: true });
    try {
        const file = path.join(destination, 'database.sqlite');
        db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
        if (fs.existsSync(path.join(root, 'guilds'))) fs.cpSync(path.join(root, 'guilds'), path.join(destination, 'guilds'), { recursive: true });
        fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ created_at: new Date().toISOString(), database: 'database.sqlite', assets: 'guilds/', complete: true }, null, 2));
        return destination;
    } catch (error) {
        fs.writeFileSync(path.join(destination, 'INCOMPLETE.txt'), 'No restaurar este respaldo incompleto. Repetir la copia.');
        throw error;
    }
}
let timer;
function scheduleBackups(db, filename) {
    const hours = process.env.BACKUP_INTERVAL_HOURS === undefined ? 24 : Number(process.env.BACKUP_INTERVAL_HOURS);
    if (timer || !Number.isFinite(hours) || hours <= 0 || filename === ':memory:') return;
    timer = setInterval(() => {
        try { backupDatabase(db, filename); console.log('[Backup] Copia de base y assets completada.'); }
        catch (error) { console.error('[Backup] No se pudo completar la copia:', error.message); }
    }, Math.min(168, Math.max(1, hours)) * 3600000);
    timer.unref();
}
if (require.main === module) {
    require('dotenv').config();
    const legacy = path.join(__dirname, '../database.sqlite');
    const filename = process.env.DB_PATH || process.env.USMC_DB_PATH || (fs.existsSync(legacy) ? legacy : path.join(__dirname, '../data/database.sqlite'));
    let Database; try { Database = require('better-sqlite3'); } catch { Database = require('node:sqlite').DatabaseSync; }
    if (!fs.existsSync(filename)) throw new Error('No existe la base que se intenta respaldar.');
    const db = new Database(filename);
    try { db.function('current_guild_id', () => process.env.GUILD_ID || 'GLOBAL'); console.log(backupDatabase(db, filename)); }
    finally { db.close(); }
}
module.exports = { backupDatabase, scheduleBackups };
