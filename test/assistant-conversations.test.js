const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conversationStore } = require('../src/assistant/conversations');
let Database; try { Database = require('better-sqlite3'); } catch { Database = require('node:sqlite').DatabaseSync; }
function fixture() {
    const db = new Database(':memory:');
    if (!db.transaction) db.transaction = fn => (...args) => { db.exec('BEGIN'); try { const result = fn(...args); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
    db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE assistant_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,request_id TEXT NOT NULL,prompt TEXT NOT NULL,
        answer TEXT,trace TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'RUNNING',created_at INTEGER NOT NULL,UNIQUE(guild_id,user_id,request_id));`);
    return db;
}
test('legacy conversation migration preserves messages and replay receipts per guild and user without changing the active new chat', () => {
    const db = fixture();
    try {
        const insert = db.prepare('INSERT INTO assistant_turns(guild_id,user_id,request_id,prompt,answer,trace,status,created_at) VALUES(?,?,?,?,?,?,?,?)');
        insert.run('A', 'owner', 'legacy-request-001', 'Mensaje anterior', 'Respuesta anterior', '[{"created":true,"id":"123"}]', 'DONE', Date.now());
        insert.run('A', 'reader', 'legacy-request-002', 'Mensaje de otra persona', 'Privado', '[]', 'ERROR', Date.now());
        insert.run('B', 'owner', 'legacy-request-003', 'Otro servidor', 'Privado', '[]', 'RUNNING', Date.now());
        const chats = conversationStore(db);
        assert.equal(chats.active('A', 'owner').id, 'legacy-chat');
        assert.equal(chats.list('A', 'owner').conversations.length, 1);
        const turn = db.prepare('SELECT * FROM assistant_turns WHERE request_id=?').get('legacy-request-001');
        assert.equal(turn.conversation_id, 'legacy-chat'); assert.equal(turn.answer, 'Respuesta anterior'); assert.equal(JSON.parse(turn.trace)[0].created, true);
        chats.create('A', 'owner', 'new-after-migration-001');
        const reloaded = conversationStore(db);
        assert.equal(reloaded.active('A', 'owner').id, 'new-after-migration-001');
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM assistant_turns').get().n, 3);
        assert.equal(reloaded.list('B', 'owner').conversations[0].title, 'Conversación anterior');
    } finally { db.close(); }
});
test('conversation identifiers cannot read, activate or attach turns to another owner or guild', () => {
    const db = fixture();
    try {
        const chats = conversationStore(db); chats.create('A', 'owner', 'private-conversation-001');
        for (const [guild, user] of [['B', 'owner'], ['A', 'reader']]) {
            assert.throws(() => chats.get(guild, user, 'private-conversation-001'), error => error.status === 404);
            assert.throws(() => chats.activate(guild, user, 'private-conversation-001'), error => error.status === 404);
            assert.ok(chats.list(guild, user).conversations.every(row => row.guild_id === guild && row.user_id === user));
        }
        assert.throws(() => db.prepare('INSERT INTO assistant_turns(guild_id,user_id,conversation_id,request_id,prompt,created_at) VALUES(?,?,?,?,?,?)')
            .run('B', 'owner', 'private-conversation-001', 'forged-request', 'Mensaje', Date.now()), /owner mismatch/);
        assert.throws(() => chats.get('A', 'owner', '../not-valid'), error => error.status === 400);
    } finally { db.close(); }
});
