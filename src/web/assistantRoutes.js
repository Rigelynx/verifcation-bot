const path = require('path');
const { getAssistant } = require('../assistant/service');
function installAssistantRoutes(app, client, auth, options = {}) {
    const assistant = getAssistant(client, options);
    app.get('/asistente', (req, res) => res.sendFile(path.join(__dirname, 'views/assistant.html')));
    app.use('/api/assistant', auth.requireAccess('member'));
    const route = fn => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try { await assistant.access(req.discordIdentity.guildId, req.discordIdentity.id); await fn(req, res); }
        catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'No se pudo completar la petición del asistente.' }); }
    };
    app.get('/api/assistant/config', route(async (req, res) => {
        const config = assistant.config();
        res.json({ success: true, ready: config.ready, provider: config.provider, model: config.model, daily_limit: config.dailyLimit,
            max_output_tokens: config.maxOutputTokens });
    }));
    app.get('/api/assistant/conversations', route(async (req, res) => res.json({ success: true,
        ...assistant.conversations(req.discordIdentity.guildId, req.discordIdentity.id) })));
    app.post('/api/assistant/conversations', route(async (req, res) => res.json({ success: true,
        conversation: await assistant.newChat(req.discordIdentity.guildId, req.discordIdentity.id, req.body.conversation_id) })));
    app.post('/api/assistant/conversations/:id/activate', route(async (req, res) => res.json({ success: true,
        conversation: await assistant.selectChat(req.discordIdentity.guildId, req.discordIdentity.id, req.params.id) })));
    app.get('/api/assistant/history', route(async (req, res) => {
        const guildId = req.discordIdentity.guildId, userId = req.discordIdentity.id;
        const id = req.query.conversation_id === undefined ? assistant.activeChat(guildId, userId).id : req.query.conversation_id;
        res.json({ success: true, conversation_id: id, history: assistant.history(guildId, userId, id) });
    }));
    app.get('/api/assistant/usage', route(async (req, res) => res.json({ success: true,
        usage: assistant.usage(req.discordIdentity.guildId, req.discordIdentity.id) })));
    app.post('/api/assistant/attachments', route(async (req, res) => {
        const result = await assistant.upload(req.discordIdentity.guildId, req.discordIdentity.id, req.body.conversation_id, req.body);
        res.json({ success: true, ...result });
    }));
    app.get('/api/assistant/attachments/:id', route(async (req, res) => {
        const image = await assistant.attachment(req.discordIdentity.guildId, req.discordIdentity.id, req.query.conversation_id, req.params.id);
        res.set({ 'Content-Type': image.mime, 'X-Content-Type-Options': 'nosniff' }).send(Buffer.from(image.data));
    }));
    app.post('/api/assistant/ask', route(async (req, res) => {
        const result = await assistant.run({ guildId: req.discordIdentity.guildId, userId: req.discordIdentity.id,
            prompt: req.body.prompt, requestId: req.body.request_id, conversationId: req.body.conversation_id, attachmentIds: req.body.attachment_ids });
        res.json({ success: true, ...result });
    }));
}
module.exports = { installAssistantRoutes };
