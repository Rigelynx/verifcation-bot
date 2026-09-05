const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('../database/db');
const { hasAnyRole } = require('../bot/utils/roleUtils');

function createWebServer(discordClient) {
    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Servir estáticos (CSS, scripts de efectos, imágenes)
    app.use(express.static(path.join(__dirname, 'public')));

    // Middleware de autenticación de admin con ADMIN_KEY
    function requireAdmin(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        const masterKey = process.env.ADMIN_KEY || 'USMC-COMMAND-2026';

        if (token && token === masterKey) {
            return next();
        }
        return res.status(401).json({ success: false, message: 'No autorizado / Clave incorrecta' });
    }

    // Ruta principal: Redirige a Admin o bienvenida
    app.get('/', (req, res) => {
        res.redirect('/admin');
    });

    // Vista de verificación por token
    app.get('/verify/:token', (req, res) => {
        const { token } = req.params;
        const tokenData = db.getVerificationToken(token);
        if (!tokenData) {
            // Renderizamos la página igualmente, el JS del cliente mostrará la pantalla de error táctica
        }
        res.sendFile(path.join(__dirname, 'views/verify.html'));
    });

    // API para cargar preguntas y datos del usuario para el formulario
    app.get('/api/verify-data/:token', async (req, res) => {
        const { token } = req.params;
        const tokenData = db.getVerificationToken(token);

        if (!tokenData) {
            return res.status(404).json({ success: false, message: 'Token militar inválido o caducado.' });
        }

        const config = db.getConfig(tokenData.guild_id);
        const questions = db.getQuestions();

        // Comprobar si el recluta ya está verificado en base de datos
        const existing = db.getVerificationByDiscordId(tokenData.discord_id);
        let alreadyVerified = (existing && existing.status === 'APROBADO');
        let pendingReview = (existing && existing.status === 'PENDIENTE');

        // Verificar también si ya tiene el rol en Discord
        if (!alreadyVerified && config.verified_role_id && discordClient && discordClient.isReady()) {
            try {
                const guild = discordClient.guilds.cache.get(tokenData.guild_id) || discordClient.guilds.cache.first();
                if (guild) {
                    const member = await guild.members.fetch(tokenData.discord_id).catch(() => null);
                    if (hasAnyRole(member, config.verified_role_id)) {
                        alreadyVerified = true;
                    }
                }
            } catch (e) {}
        }

        res.json({
            success: true,
            already_verified: alreadyVerified,
            pending_review: pendingReview,
            verification_status: alreadyVerified ? 'APROBADO' : (pendingReview ? 'PENDIENTE' : 'NUEVO'),
            user: {
                discord_id: tokenData.discord_id,
                username: tokenData.username,
                avatar: tokenData.avatar,
                reviewed_at: existing ? existing.updated_at : null
            },
            config,
            questions
        });
    });

    // API para procesar el envío del formulario de verificación
    app.post('/api/verify/:token', async (req, res) => {
        const { token } = req.params;
        const { answers } = req.body;

        const tokenData = db.getVerificationToken(token);
        if (!tokenData) {
            return res.status(400).json({ success: false, message: 'El enlace de verificación ya no es válido.' });
        }

        const config = db.getConfig(tokenData.guild_id);
        const mode = config.verification_mode || 'manual';
        const initialStatus = (mode === 'auto') ? 'APROBADO' : 'PENDIENTE';

        // 1. Guardar expediente en SQLite local (aprovechando los 50GB)
        const record = db.submitVerification(
            tokenData.discord_id,
            tokenData.username,
            tokenData.avatar,
            answers,
            initialStatus
        );

        // 2. Consumir token
        db.deleteVerificationToken(token);

        // 3. Notificar o aplicar roles en Discord si el cliente está conectado
        if (discordClient && discordClient.isReady()) {
            const verificationHandler = require('../bot/handlers/verificationHandler');
            await verificationHandler.handleNewSubmission(discordClient, tokenData.guild_id, record, mode);
        }

        res.json({
            success: true,
            status: initialStatus,
            message: initialStatus === 'APROBADO' 
                ? 'Verificación completada y rango otorgado automáticamente.' 
                : 'Expediente enviado a revisión de oficiales.'
        });
    });

    // Vista del Dashboard de Administración
    app.get('/admin', (req, res) => {
        res.sendFile(path.join(__dirname, 'views/dashboard.html'));
    });

    // API Admin: Obtener datos completos
    app.get('/api/admin/data', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || 'default';
        const config = db.getConfig(guildId);
        const questions = db.getQuestions();
        const verifications = db.getAllVerifications();

        res.json({
            success: true,
            config,
            questions,
            verifications
        });
    });

    // API Admin: Obtener roles y canales del servidor de Discord en tiempo real
    app.get('/api/admin/guild-resources', requireAdmin, async (req, res) => {
        const guildId = process.env.GUILD_ID;
        if (!discordClient || !discordClient.isReady()) {
            return res.json({ success: true, connected: false, roles: [], channels: [] });
        }

        try {
            const guild = (guildId ? discordClient.guilds.cache.get(guildId) : null) || discordClient.guilds.cache.first();
            if (!guild) {
                return res.json({ success: true, connected: false, roles: [], channels: [] });
            }

            await guild.roles.fetch().catch(() => {});
            await guild.channels.fetch().catch(() => {});

            const roles = guild.roles.cache
                .filter(r => r.id !== guild.id) // excluir @everyone
                .sort((a, b) => b.position - a.position)
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    color: r.hexColor,
                    position: r.position
                }));

            const channels = guild.channels.cache
                .filter(c => c.isTextBased())
                .sort((a, b) => a.position - b.position)
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    type: c.type
                }));

            res.json({
                success: true,
                connected: true,
                guild_name: guild.name,
                guild_id: guild.id,
                roles,
                channels
            });
        } catch (err) {
            console.error('[Guild Resources Error]:', err);
            res.json({ success: true, connected: false, roles: [], channels: [] });
        }
    });

    // API Admin: Actualizar configuración
    app.post('/api/admin/config', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || 'default';
        const updated = db.updateConfig(guildId, req.body);
        res.json({ success: true, config: updated });
    });

    // API Admin: Crear pregunta
    app.post('/api/admin/questions', requireAdmin, (req, res) => {
        const { label, description, field_type, options, required } = req.body;
        if (!label) return res.status(400).json({ success: false, message: 'El enunciado es requerido.' });

        const id = db.addQuestion({ label, description, field_type, options, required });
        res.json({ success: true, id });
    });

    // API Admin: Actualizar pregunta
    app.put('/api/admin/questions/:id', requireAdmin, (req, res) => {
        const id = parseInt(req.params.id);
        const { label, description, field_type, options, required, sort_order } = req.body;
        db.updateQuestion(id, { label, description, field_type, options, required, sort_order });
        res.json({ success: true });
    });

    // API Admin: Eliminar pregunta
    app.delete('/api/admin/questions/:id', requireAdmin, (req, res) => {
        const id = parseInt(req.params.id);
        db.deleteQuestion(id);
        res.json({ success: true });
    });

    // API Admin: Acción sobre un expediente (Aprobar / Denegar)
    app.post('/api/admin/verifications/:discordId/action', requireAdmin, async (req, res) => {
        const { discordId } = req.params;
        const { action, reason } = req.body; // action: 'APROBADO' | 'RECHAZADO'

        const updated = db.updateVerificationStatus(discordId, action, 'ADMIN_WEB', reason);

        // Notificar en Discord y asignar/remover roles
        if (discordClient && discordClient.isReady()) {
            const verificationHandler = require('../bot/handlers/verificationHandler');
            const guildId = process.env.GUILD_ID || 'default';
            await verificationHandler.handleStatusChange(discordClient, guildId, updated, action, reason);
        }

        res.json({ success: true, record: updated });
    });

    // API Admin: Eliminar expediente
    app.delete('/api/admin/verifications/:discordId', requireAdmin, (req, res) => {
        const { discordId } = req.params;
        db.removeVerification(discordId);
        res.json({ success: true });
    });

    return app;
}

module.exports = { createWebServer };
