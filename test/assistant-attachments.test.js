const { test } = require('node:test');
const assert = require('node:assert/strict');
let Database; try { Database = require('better-sqlite3'); } catch { Database = require('node:sqlite').DatabaseSync; }
const { attachmentStore, downloadDiscordImage } = require('../src/assistant/attachments');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYV8AAAAASUVORK5CYII=', 'base64');
function database() {
    const db = new Database(':memory:');
    if (!db.transaction) db.transaction = fn => () => {
        db.exec('BEGIN');
        try { const result = fn(); db.exec('COMMIT'); return result; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
    };
    return db;
}
test('uploads are private to user, guild and conversation and identical files reuse their ID', () => {
    const db = database();
    try {
        const store = attachmentStore(db), input = { content: png.toString('base64'), name: '../../imagen.svg' };
        const image = store.save('guild', 'user', 'chat', input);
        assert.equal(image.mime, 'image/png'); assert.match(image.name, /^[a-z0-9_-]+\.png$/i);
        assert.equal(store.save('guild', 'user', 'chat', input).id, image.id);
        assert.deepEqual(Buffer.from(store.get('guild', 'user', 'chat', image.id).data), png);
        for (const scope of [['other', 'user', 'chat'], ['guild', 'other', 'chat'], ['guild', 'user', 'other']]) {
            assert.equal(store.list(...scope).length, 0);
            assert.throws(() => store.get(...scope, image.id), /no encontrada/);
        }
        assert.ok(!('data' in store.list('guild', 'user', 'chat')[0]));
    } finally { db.close(); }
});
test('unsupported files, oversize uploads, expiry and account quota are enforced', () => {
    const db = database();
    try {
        const store = attachmentStore(db);
        for (const content of ['<svg/>', Buffer.from('<html>not PNG</html>').toString('base64'), Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')]) {
            assert.throws(() => store.save('g', 'u', 'c', { content }));
        }
        for (let n = 0; n < 20; n++) store.save('g', 'u', 'c', { content: Buffer.concat([png, Buffer.from([n])]).toString('base64') });
        assert.throws(() => store.save('g', 'u', 'c2', { content: png.toString('base64') }), /20 imágenes/);
        const id = store.list('g', 'u', 'c')[0].id;
        db.prepare('UPDATE assistant_attachments SET created_at=0').run();
        assert.throws(() => store.get('g', 'u', 'c', id), /no encontrada/);
        assert.equal(store.list('g', 'u', 'c').length, 0);
        assert.ok(store.save('g', 'u', 'c2', { content: png.toString('base64') }).id);
    } finally { db.close(); }
});
test('Discord downloads only original CDN attachments with bounded streaming and no redirects', async () => {
    let calls = 0;
    const file = { url: 'https://cdn.discordapp.com/attachments/123/456/image.png', size: png.length, name: 'image.png' };
    const fetcher = async (_url, init) => { calls++; assert.equal(init.redirect, 'error'); return new Response(png); };
    assert.equal((await downloadDiscordImage(file, fetcher)).content, png.toString('base64'));
    for (const url of ['https://evil.example/image.png', 'http://cdn.discordapp.com/attachments/123/456/a.png', 'https://cdn.discordapp.com/other/image.png', 'https://cdn.discordapp.com:444/attachments/a']) {
        await assert.rejects(downloadDiscordImage({ ...file, url }, fetcher));
    }
    assert.equal(calls, 1);
    const large = async () => ({ ok: true, headers: new Headers(), body: (async function* () { yield Buffer.alloc(2 * 1024 * 1024); yield Buffer.alloc(1); })() });
    await assert.rejects(downloadDiscordImage(file, large), /2 MB/);
});
