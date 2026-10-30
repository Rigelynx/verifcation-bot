const { randomUUID } = require('node:crypto');
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{10,80}$/.test(id);
function conversationStore(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_conversations (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(guild_id,user_id,id)
    ); CREATE TABLE IF NOT EXISTS assistant_active_conversations (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
        PRIMARY KEY(guild_id,user_id), FOREIGN KEY(guild_id,user_id,conversation_id) REFERENCES assistant_conversations(guild_id,user_id,id)
    );`);
    const columns = new Set(db.prepare('PRAGMA table_info(assistant_turns)').all().map(column => column.name));
    db.transaction(() => {
        if (!columns.has('conversation_id')) db.exec('ALTER TABLE assistant_turns ADD COLUMN conversation_id TEXT');
        db.exec(`INSERT OR IGNORE INTO assistant_conversations(guild_id,user_id,id,title,created_at,updated_at)
            SELECT guild_id,user_id,'legacy-chat','Conversación anterior',MIN(created_at),MAX(created_at) FROM assistant_turns
            WHERE conversation_id IS NULL OR conversation_id='legacy-chat' GROUP BY guild_id,user_id;
            UPDATE assistant_turns SET conversation_id='legacy-chat' WHERE conversation_id IS NULL;
            INSERT OR IGNORE INTO assistant_active_conversations(guild_id,user_id,conversation_id)
                SELECT guild_id,user_id,id FROM assistant_conversations WHERE id='legacy-chat';
            CREATE INDEX IF NOT EXISTS assistant_conversation_history ON assistant_turns(guild_id,user_id,conversation_id,id);
            CREATE TRIGGER IF NOT EXISTS assistant_turn_chat_insert BEFORE INSERT ON assistant_turns
                WHEN NOT EXISTS(SELECT 1 FROM assistant_conversations WHERE guild_id=NEW.guild_id AND user_id=NEW.user_id AND id=NEW.conversation_id)
                BEGIN SELECT RAISE(ABORT,'Assistant conversation owner mismatch'); END;
            CREATE TRIGGER IF NOT EXISTS assistant_turn_chat_update BEFORE UPDATE OF guild_id,user_id,conversation_id ON assistant_turns
                WHEN NOT EXISTS(SELECT 1 FROM assistant_conversations WHERE guild_id=NEW.guild_id AND user_id=NEW.user_id AND id=NEW.conversation_id)
                BEGIN SELECT RAISE(ABORT,'Assistant conversation owner mismatch'); END;`);
    })();
    function get(guildId, userId, id) {
        if (!validId(id)) fail(400, 'Identificador de conversación inválido.');
        const row = db.prepare('SELECT * FROM assistant_conversations WHERE guild_id=? AND user_id=? AND id=?').get(guildId, userId, id);
        if (!row) fail(404, 'Conversación no encontrada en esta cuenta y servidor.');
        return row;
    }
    const activate = (guildId, userId, id) => {
        const row = get(guildId, userId, id);
        db.prepare(`INSERT INTO assistant_active_conversations VALUES(?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET conversation_id=excluded.conversation_id`).run(guildId, userId, id);
        return row;
    };
    function create(guildId, userId, id = randomUUID()) {
        if (!validId(id)) fail(400, 'Identificador de conversación inválido.');
        return db.transaction(() => {
            const now = Date.now();
            db.prepare('INSERT OR IGNORE INTO assistant_conversations VALUES(?,?,?,?,?,?)').run(guildId, userId, id, 'Nuevo chat', now, now);
            return activate(guildId, userId, id);
        })();
    }
    function active(guildId, userId) {
        const row = db.prepare('SELECT conversation_id FROM assistant_active_conversations WHERE guild_id=? AND user_id=?').get(guildId, userId);
        return row ? get(guildId, userId, row.conversation_id) : create(guildId, userId);
    }
    function list(guildId, userId) {
        const selected = active(guildId, userId);
        const rows = db.prepare(`SELECT c.*,COUNT(t.id) AS turn_count FROM assistant_conversations c
            LEFT JOIN assistant_turns t ON t.guild_id=c.guild_id AND t.user_id=c.user_id AND t.conversation_id=c.id AND t.created_at>?
            WHERE c.guild_id=? AND c.user_id=? GROUP BY c.guild_id,c.user_id,c.id ORDER BY c.updated_at DESC,c.created_at DESC,c.id`)
            .all(Date.now() - 30 * 86400000, guildId, userId);
        return { conversations: rows, active_conversation_id: selected.id };
    }
    function touch(guildId, userId, id, prompt) {
        const existing = db.prepare('SELECT 1 FROM assistant_turns WHERE guild_id=? AND user_id=? AND conversation_id=? LIMIT 1').get(guildId, userId, id);
        const title = existing ? get(guildId, userId, id).title : prompt.replace(/\s+/g, ' ').slice(0, 60);
        db.prepare('UPDATE assistant_conversations SET title=?,updated_at=? WHERE guild_id=? AND user_id=? AND id=?').run(title, Date.now(), guildId, userId, id);
    }
    return { get, activate, create, active, list, touch };
}
module.exports = { conversationStore };
