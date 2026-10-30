const { randomUUID, createHash } = require('node:crypto');
const MAX_BYTES = 2 * 1024 * 1024;
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
function imageType(bytes) {
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ['png', 'image/png'];
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ['jpg', 'image/jpeg'];
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return ['webp', 'image/webp'];
    fail(400, 'Solo se admiten imágenes PNG, JPG o WebP de hasta 2 MB.');
}
function attachmentStore(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_attachments (
        id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
        name TEXT NOT NULL, mime TEXT NOT NULL, digest TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL,
        UNIQUE(guild_id,user_id,conversation_id,digest)
    ); CREATE INDEX IF NOT EXISTS assistant_attachments_owner ON assistant_attachments(guild_id,user_id,conversation_id);`);
    const metadata = row => ({ id: row.id, name: row.name, mime: row.mime, size: row.size ?? row.data?.length });
    function get(guildId, userId, conversationId, id) {
        const row = db.prepare('SELECT * FROM assistant_attachments WHERE guild_id=? AND user_id=? AND conversation_id=? AND id=? AND created_at>?')
            .get(guildId, userId, conversationId, id, Date.now() - 30 * 86400000);
        if (!row) fail(404, 'Imagen no encontrada en esta cuenta, servidor y conversación.');
        return row;
    }
    function save(guildId, userId, conversationId, { content, name = 'imagen' }) {
        if (typeof content !== 'string' || content.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) fail(400, 'La imagen debe pesar como máximo 2 MB.');
        const bytes = Buffer.from(content, 'base64');
        if (!bytes.length || bytes.length > MAX_BYTES) fail(400, 'La imagen debe pesar como máximo 2 MB.');
        const [extension, mime] = imageType(bytes), digest = createHash('sha256').update(bytes).digest('hex');
        return db.transaction(() => {
            db.prepare('DELETE FROM assistant_attachments WHERE created_at<?').run(Date.now() - 30 * 86400000);
            const existing = db.prepare('SELECT * FROM assistant_attachments WHERE guild_id=? AND user_id=? AND conversation_id=? AND digest=?').get(guildId, userId, conversationId, digest);
            if (existing) return metadata(existing);
            if (db.prepare('SELECT COUNT(*) AS n FROM assistant_attachments WHERE guild_id=? AND user_id=?').get(guildId, userId).n >= 20) fail(400, 'Alcanzaste 20 imágenes guardadas para esta cuenta y servidor durante 30 días.');
            const id = randomUUID();
            const basename = String(name).replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || 'imagen';
            const filename = `${id.slice(0, 8)}-${basename}.${extension}`;
            db.prepare('INSERT INTO assistant_attachments VALUES(?,?,?,?,?,?,?,?,?)').run(id, guildId, userId, conversationId, filename, mime, digest, bytes, Date.now());
            return { id, name: filename, mime, size: bytes.length };
        })();
    }
    function list(guildId, userId, conversationId) {
        return db.prepare('SELECT id,name,mime,length(data) AS size FROM assistant_attachments WHERE guild_id=? AND user_id=? AND conversation_id=? AND created_at>? ORDER BY created_at,id')
            .all(guildId, userId, conversationId, Date.now() - 30 * 86400000).map(metadata);
    }
    return { save, get, list, metadata };
}
async function downloadDiscordImage(file, fetcher = globalThis.fetch) {
    let url;
    try { url = new URL(file?.url); } catch { fail(400, 'Adjunta una imagen válida de Discord.'); }
    if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) || !url.pathname.startsWith('/attachments/') || url.username || url.password || url.port) fail(400, 'Solo se descargan adjuntos originales de Discord.');
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_BYTES) fail(400, 'La imagen debe pesar como máximo 2 MB.');
    const response = await fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) fail(400, 'No se pudo descargar la imagen de Discord o supera 2 MB.');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
        size += chunk.length;
        if (size > MAX_BYTES) fail(400, 'La imagen supera 2 MB.');
        chunks.push(Buffer.from(chunk));
    }
    return { content: Buffer.concat(chunks).toString('base64'), name: file.name || 'imagen' };
}
module.exports = { attachmentStore, downloadDiscordImage };
