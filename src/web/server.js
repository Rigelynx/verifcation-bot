const { currentGuild, withGuild } = require('../database/guildContext');
const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('../database/db');
const economyDb = require('../database/economyDb');
const { hasAnyRole } = require('../bot/utils/roleUtils');
const { buildBonusPanelMessage } = require('../bot/commands/bono');
const { buildRegistrationPanel, publishEventReport } = require('../bot/commands/eventos');
const { refreshPublicServerBoard } = require('../bot/commands/servidor');
const { installDiscordAuth } = require('./discordAuth');
const { installPatrolRoutes } = require('./patrolRoutes');
const { installAssistantRoutes } = require('./assistantRoutes');
const { installPortalRoutes } = require('./portalRoutes');

function createWebServer(discordClient, options = {}) {
    const app = express();
    if (!options.disableBackups) require('../../scripts/backup').scheduleBackups(db.db, db.dbPath);

    app.use((req, res, next) => {
        res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
        next();
    });

    app.use(cors());
    app.use('/api/admin/branding/image', express.json({ limit: '3mb' }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Servir estáticos (CSS, scripts de efectos, imágenes)
    app.use(express.static(path.join(__dirname, 'public')));
    const discordAuth = installDiscordAuth(app, discordClient, options);
    installPortalRoutes(app, discordClient, discordAuth);
    require('./communityRoutes').installCommunityRoutes(app, discordAuth);
    installPatrolRoutes(app, discordClient, discordAuth);
    installAssistantRoutes(app, discordClient, discordAuth, options);

    for (const route of ['/api/verify-data/:token', '/api/verify/:token']) app.use(route, (req, _res, next) => {
        const token = db.getVerificationToken(req.params.token);
        if (!token) return next();
        req.guildId = token.guild_id;
        withGuild(token.guild_id, next);
    });

    // Middleware de autenticación de admin con ADMIN_KEY o Token de Sesión Nominal
    function requireAdmin(req, res, next) {
        res.set('Cache-Control', 'no-store');
        req.guildId = process.env.GUILD_ID || 'GLOBAL';
        if (!discordAuth.hasCookie(req) && req.headers['x-guild-id'] && req.headers['x-guild-id'] !== req.guildId) return res.status(403).json({ success: false, message: 'El acceso anterior solo funciona en la comunidad original. Usa Discord.' });
        if (discordAuth.hasCookie(req)) return discordAuth.requireAccess('admin')(req, res, next);
        if (!discordAuth.config().legacyAllowed) return res.status(401).json({ success: false, message: 'Inicia sesión con Discord.', login_url: discordAuth.loginUrl('/admin') });
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        const masterKey = process.env.ADMIN_KEY || 'USMC-COMMAND-2026';
        const headerOpName = req.headers['x-operator-name'] ? decodeURIComponent(req.headers['x-operator-name']) : '';
        const headerOpId = req.headers['x-operator-id'] ? decodeURIComponent(req.headers['x-operator-id']) : '';

        if (token) {
            const session = db.getAdminSession(token);
            if (session) {
                req.adminOperator = {
                    operator_name: session.operator_name || 'Alto Mando',
                    discord_id: session.discord_id || null,
                    operator_rank: session.operator_rank || 'ALTO MANDO',
                    ip_address: req.ip
                };
                return next();
            }
            if (token === masterKey) {
                req.adminOperator = {
                    operator_name: headerOpName || 'ADMIN_WEB',
                    discord_id: headerOpId || null,
                    operator_rank: 'ALTO MANDO WEB',
                    ip_address: req.ip
                };
                return next();
            }
        }
        return res.status(401).json({ success: false, message: 'No autorizado / Clave incorrecta' });
    }

    function resolveRequestedActiveEvent(guildId, rawEventId) {
        if (rawEventId === undefined || rawEventId === null || rawEventId === '') return economyDb.getActiveEvent(guildId);
        const eventId = parseInt(rawEventId, 10);
        if (!Number.isInteger(eventId) || eventId <= 0) return null;
        const event = economyDb.getEventById(eventId);
        if (!event || (event.guild_id !== guildId && event.guild_id !== 'GLOBAL') || event.status !== 'ACTIVE') return null;
        return event;
    }

    // Vista de verificación por token
    app.get('/verify', async (req, res) => {
        if (!discordAuth.config().enabled) return res.status(503).send('El inicio con Discord aún no está configurado. Abre tu enlace personal desde Discord.');
        try {
            const user = await discordAuth.identity(req);
            if (!user) return res.redirect(discordAuth.loginUrl('/verify'));
            require('../database/communityDb').ensureCommunity(user.guildId, user.guild.name);
            const token = db.createVerificationToken(user.id, user.username, user.avatar, user.guildId);
            res.redirect(`/verify/${token}`);
        } catch (error) { res.status(error.status || 503).send(error.message); }
    });
    app.get('/verify/:token', (req, res) => {
        const { token } = req.params;
        const tokenData = db.getVerificationToken(token);
        if (!tokenData) {
            // Renderizamos la página igualmente, el JS del cliente mostrará la pantalla de error táctica
        }
        res.sendFile(path.join(__dirname, 'views/verify.html'));
    });

    // API para cargar preguntas y datos del usuario para el formulario
    async function recruitAccess(req, res, tokenData) {
        res.set('Cache-Control', 'no-store');
        if (!discordAuth.config().enabled) return true;
        try {
            const user = await discordAuth.identity(req, tokenData.guild_id);
            if (!user) { res.status(401).json({ success: false, message: 'Confirma tu identidad con Discord para completar el formulario.', login_url: discordAuth.loginUrl(`/verify/${req.params.token}`) }); return false; }
            if (user.id !== tokenData.discord_id || user.guildId !== tokenData.guild_id) { res.status(403).json({ success: false, message: 'Este formulario pertenece a otra cuenta. Entra con la cuenta correcta o abre /verify para crear tu expediente.' }); return false; }
            if (req.method !== 'GET' && !discordAuth.csrf(req, user)) { res.status(403).json({ success: false, message: 'Recarga el formulario para renovar la sesión antes de enviarlo.' }); return false; }
            req.discordIdentity = user;
            return true;
        } catch (error) { res.status(error.status || 503).json({ success: false, message: error.message }); return false; }
    }
    app.get('/api/verify-data/:token', async (req, res) => {
        const { token } = req.params;
        const tokenData = db.getVerificationToken(token);

        if (!tokenData) {
            return res.status(404).json({ success: false, message: 'Token militar inválido o caducado.' });
        }

        if (!await recruitAccess(req, res, tokenData)) return;

        const config = db.getConfig(tokenData.guild_id);
        const questions = db.getQuestions();

        // Comprobar si el recluta ya está verificado en base de datos
        const existing = db.getVerificationByDiscordId(tokenData.discord_id);
        let alreadyVerified = (existing && existing.status === 'APROBADO');
        let pendingReview = (existing && existing.status === 'PENDIENTE');

        // Verificar también si ya tiene el rol en Discord
        if (!alreadyVerified && config.verified_role_id && discordClient && discordClient.isReady()) {
            try {
                const guild = discordClient.guilds.cache.get(tokenData.guild_id);
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
            profile: require('../database/communityDb').publicProfile(require('../database/communityDb').ensureCommunity(tokenData.guild_id)),
            csrf_token: req.discordIdentity?.csrf || null,
            already_verified: alreadyVerified,
            pending_review: pendingReview,
            verification_status: alreadyVerified ? 'APROBADO' : (pendingReview ? 'PENDIENTE' : 'NUEVO'),
            user: {
                discord_id: tokenData.discord_id,
                username: req.discordIdentity?.username || tokenData.username,
                avatar: req.discordIdentity?.avatar || tokenData.avatar,
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
        if (!await recruitAccess(req, res, tokenData)) return;

        const config = db.getConfig(tokenData.guild_id);
        const mode = config.verification_mode || 'manual';
        const initialStatus = (mode === 'auto') ? 'APROBADO' : 'PENDIENTE';
        const existing = db.getVerificationByDiscordId(tokenData.discord_id);
        if (existing && ['APROBADO', 'PENDIENTE'].includes(existing.status)) return res.status(409).json({ success: false, message: existing.status === 'APROBADO' ? 'Tu expediente ya está aprobado.' : 'Tu expediente ya está en revisión.' });
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return res.status(400).json({ success: false, message: 'Completa las respuestas del formulario.' });
        const safeAnswers = Object.create(null);
        for (const question of db.getQuestions()) {
            const answer = answers[question.label];
            if (answer !== undefined && !['string', 'number', 'boolean'].includes(typeof answer)) return res.status(400).json({ success: false, message: 'Una respuesta tiene un formato inválido.' });
            const value = String(answer ?? '').trim();
            if (value.length > 4000) return res.status(400).json({ success: false, message: 'Una respuesta supera el límite de longitud.' });
            if (question.required && (!value || ['No proporcionado', 'No seleccionado', 'No marcado'].includes(value))) return res.status(400).json({ success: false, message: `Completa el apartado: ${question.label}` });
            if (value && question.field_type === 'number' && !Number.isFinite(Number(value))) return res.status(400).json({ success: false, message: `Introduce un número válido en: ${question.label}` });
            safeAnswers[question.label] = value;
        }

        // 1. Guardar expediente en SQLite local (aprovechando los 50GB)
        const record = db.submitVerification(
            tokenData.discord_id,
            req.discordIdentity?.username || tokenData.username,
            req.discordIdentity?.avatar || tokenData.avatar,
            safeAnswers,
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

    // API Admin: Inicio de sesión nominal individual del Alto Mando
    app.post('/api/admin/login', (req, res) => {
        if (!discordAuth.config().legacyAllowed) return res.status(403).json({ success: false, message: 'Este panel utiliza inicio de sesión con Discord.' });
        const { key, operator_name, operator_id } = req.body || {};
        const masterKey = process.env.ADMIN_KEY || 'USMC-COMMAND-2026';
        const trimmedKey = String(key || '').trim();
        const opName = String(operator_name || '').trim();
        const opId = String(operator_id || '').replace(/[<@!>]/g, '').trim();

        if (!opName) {
            return res.status(400).json({ success: false, message: 'Debes ingresar tu Nombre o Indicativo de Oficial para trazabilidad.' });
        }

        const existingSession = db.getAdminSession(trimmedKey);
        if (trimmedKey !== masterKey && !existingSession) {
            return res.status(401).json({ success: false, message: 'Clave maestra o credencial militar inválida.' });
        }

        const session = db.createAdminSession(opName, opId || existingSession?.discord_id || null, 'ALTO MANDO WEB', req.ip);
        db.addAdminAuditLog(
            { operator_name: session.operator_name, discord_id: session.discord_id, operator_rank: session.operator_rank, ip_address: req.ip },
            'INICIO_SESION_WEB',
            session.discord_id || session.operator_name,
            `Acceso autorizado al Centro de Mando Web por ${session.operator_name}`
        );

        return res.json({
            success: true,
            session,
            session_token: session.token,
            operator_name: session.operator_name
        });
    });

    // API Admin: Obtener datos completos
    app.get('/api/admin/data', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'default';
        const config = db.getConfig(guildId);
        const questions = db.getQuestions();
        const verifications = db.getAllVerifications();
        const privateServers = db.getPrivateServers(guildId);

        res.json({
            success: true,
            operator: req.adminOperator,
            config,
            questions,
            verifications,
            private_servers: privateServers
        });
    });

    // API Admin: Obtener roles y canales del servidor de Discord en tiempo real
    app.get('/api/admin/guild-resources', requireAdmin, async (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID);
        if (!discordClient || !discordClient.isReady()) {
            return res.json({ success: true, connected: false, roles: [], channels: [], stickers: [] });
        }

        try {
            const guild = discordClient.guilds.cache.get(guildId);
            if (!guild) {
                return res.json({ success: true, connected: false, roles: [], channels: [], stickers: [] });
            }

            await guild.roles.fetch().catch(() => {});
            await guild.channels.fetch().catch(() => {});
            await guild.stickers.fetch().catch(() => {});

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
                .filter(c => c.isTextBased() || c.isVoiceBased())
                .sort((a, b) => a.position - b.position)
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    type: c.isVoiceBased() ? 'voice' : 'text'
                }));

            const textChannels = channels.filter(c => c.type === 'text');
            const voiceChannels = channels.filter(c => c.type === 'voice');
            const stickers = guild.stickers.cache.map(sticker => ({
                id: sticker.id,
                name: sticker.name,
                tags: sticker.tags || ''
            }));

            res.json({
                success: true,
                connected: true,
                guild_name: guild.name,
                guild_id: guild.id,
                roles,
                channels,
                text_channels: textChannels,
                voice_channels: voiceChannels,
                stickers
            });
        } catch (err) {
            console.error('[Guild Resources Error]:', err);
            res.json({ success: true, connected: false, roles: [], channels: [], text_channels: [], voice_channels: [], stickers: [] });
        }
    });

    // API Admin: Actualizar configuración
    app.post('/api/admin/config', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'default';
        const updated = db.updateConfig(guildId, req.body);
        db.addAdminAuditLog(req.adminOperator, 'ACTUALIZAR_CONFIG_SISTEMA', guildId, 'Parámetros de configuración actualizados desde el panel web.');
        res.json({ success: true, config: updated });
    });

    // API Admin: Crear pregunta
    app.post('/api/admin/questions', requireAdmin, (req, res) => {
        const { label, description, field_type, options, required } = req.body;
        if (!label) return res.status(400).json({ success: false, message: 'El enunciado es requerido.' });

        const id = db.addQuestion({ label, description, field_type, options, required });
        db.addAdminAuditLog(req.adminOperator, 'CREAR_PREGUNTA_CUESTIONARIO', `Q#${id}`, `Nueva pregunta: ${label}`);
        res.json({ success: true, id });
    });

    // API Admin: Actualizar pregunta
    app.put('/api/admin/questions/:id', requireAdmin, (req, res) => {
        const id = parseInt(req.params.id);
        const { label, description, field_type, options, required, sort_order } = req.body;
        db.updateQuestion(id, { label, description, field_type, options, required, sort_order });
        db.addAdminAuditLog(req.adminOperator, 'EDITAR_PREGUNTA_CUESTIONARIO', `Q#${id}`, `Pregunta editada: ${label}`);
        res.json({ success: true });
    });

    // API Admin: Eliminar pregunta
    app.delete('/api/admin/questions/:id', requireAdmin, (req, res) => {
        const id = parseInt(req.params.id);
        db.deleteQuestion(id);
        db.addAdminAuditLog(req.adminOperator, 'ELIMINAR_PREGUNTA_CUESTIONARIO', `Q#${id}`, 'Pregunta eliminada del cuestionario.');
        res.json({ success: true });
    });

    // API Admin: Acción sobre un expediente (Aprobar / Denegar)
    app.post('/api/admin/verifications/:discordId/action', requireAdmin, async (req, res) => {
        const { discordId } = req.params;
        const { action, reason } = req.body; // action: 'APROBADO' | 'RECHAZADO'
        if (!['APROBADO', 'RECHAZADO'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Acción de verificación inválida.' });
        }

        const reviewerName = req.adminOperator?.operator_name || 'ADMIN_WEB';
        const reviewerId = req.adminOperator?.discord_id || reviewerName;
        const updated = db.updateVerificationStatus(discordId, action, reviewerId, reason, reviewerName);
        db.addAdminAuditLog(req.adminOperator, `VERIFICACION_${action}`, discordId, `Dictamen por ${reviewerName}: ${reason || 'Sin motivo adicional'}`);

        // Notificar en Discord y asignar/remover roles
        if (discordClient && discordClient.isReady()) {
            const verificationHandler = require('../bot/handlers/verificationHandler');
            const guildId = (req.guildId || process.env.GUILD_ID) || 'default';
            await verificationHandler.handleStatusChange(discordClient, guildId, updated, action, reason, reviewerName);
        }

        res.json({ success: true, record: updated });
    });

    // API Admin: Editar nombre de usuario y datos del expediente desde la Web (Con trazabilidad)
    app.put('/api/admin/verifications/:discordId', requireAdmin, (req, res) => {
        const { discordId } = req.params;
        const { username, answers, reason } = req.body || {};

        const result = db.updateVerificationRecord(discordId, {
            username,
            answers,
            reason,
            reviewerName: req.adminOperator?.operator_name,
            reviewerId: req.adminOperator?.discord_id
        });

        if (!result) {
            return res.status(404).json({ success: false, message: 'Expediente no encontrado.' });
        }

        const changes = [];
        if (result.before.username !== result.after.username) {
            changes.push(`Nombre modificado: "${result.before.username}" ➔ "${result.after.username}"`);
        }
        if (JSON.stringify(result.before.answers) !== JSON.stringify(result.after.answers)) {
            changes.push('Respuestas del expediente actualizadas');
        }
        const detailText = changes.length > 0
            ? `${changes.join(' | ')} (Por: ${req.adminOperator?.operator_name || 'ADMIN_WEB'})`
            : `Edición de expediente por ${req.adminOperator?.operator_name || 'ADMIN_WEB'}`;

        db.addAdminAuditLog(req.adminOperator, 'MODIFICACION_NOMBRE_USUARIO', discordId, detailText);

        return res.json({
            success: true,
            record: result.after,
            audit_details: detailText
        });
    });

    // API Admin: Eliminar expediente
    app.delete('/api/admin/verifications/:discordId', requireAdmin, (req, res) => {
        const { discordId } = req.params;
        db.removeVerification(discordId);
        db.addAdminAuditLog(req.adminOperator, 'ELIMINAR_EXPEDIENTE', discordId, `Expediente eliminado por ${req.adminOperator?.operator_name || 'ADMIN_WEB'}`);
        res.json({ success: true });
    });

    // =========================================================================
    // ENDPOINTS DE ECONOMÍA MILITAR
    // =========================================================================

    // Obtener configuración de economía
    app.get('/api/admin/economy/settings', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const settings = economyDb.getEconomySettings(guildId);
        res.json({ success: true, settings });
    });

    // Actualizar configuración de economía
    app.post('/api/admin/economy/settings', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const updated = economyDb.updateEconomySettings(guildId, req.body);
        res.json({ success: true, settings: updated });
    });

    // Listar cuentas de economía con buscador y resolución de usuarios reales
    app.get('/api/admin/economy/accounts', requireAdmin, async (req, res) => {
        try {
            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
            const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
            const search = req.query.search || '';
            const accounts = economyDb.getAllEconomyAccounts(limit, search, offset);

            // Sincronizar y enriquecer datos reales de Discord
            if (discordClient && discordClient.isReady()) {
                for (const acc of accounts) {
                    if (!acc.username || !acc.avatar) {
                        try {
                            let user = discordClient.users.cache.get(acc.discord_id);
                            if (!user) {
                                user = await discordClient.users.fetch(acc.discord_id).catch(() => null);
                            }
                            if (user) {
                                acc.username = user.tag || user.username;
                                acc.avatar = user.displayAvatarURL({ extension: 'png', size: 128 });
                                economyDb.syncAccountUser(acc.discord_id, acc.username, acc.avatar, (req.guildId || process.env.GUILD_ID) || 'GLOBAL');
                            }
                        } catch (e) {}
                    }
                }
            }

            res.json({ success: true, accounts, total: economyDb.countEconomyAccounts(search), limit, offset });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Ajuste rápido de saldo para cualquier usuario por ID
    app.post('/api/admin/economy/accounts/quick-adjust', requireAdmin, async (req, res) => {
        try {
            const { discordId, action, amount, target } = req.body;
            if (!discordId || !['add', 'remove', 'set'].includes(action) || !Number.isInteger(Number(amount)) || Number(amount) < 0) {
                return res.status(400).json({ success: false, message: 'Parámetros de ajuste inválidos.' });
            }

            if (discordClient && discordClient.isReady()) {
                try {
                    let user = discordClient.users.cache.get(discordId);
                    if (!user) {
                        user = await discordClient.users.fetch(discordId).catch(() => null);
                    }
                    if (user) {
                        economyDb.syncAccountUser(discordId, user.tag || user.username, user.displayAvatarURL({ extension: 'png', size: 128 }), (req.guildId || process.env.GUILD_ID) || 'GLOBAL');
                    }
                } catch (e) {}
            }

            const acc = economyDb.adminAdjustBalance(discordId, action, parseInt(amount, 10), target || 'wallet');
            db.addAdminAuditLog(req.adminOperator, `AJUSTE_CUENTA_${action.toUpperCase()}`, discordId, `${amount} en ${target || 'wallet'}`);
            res.json({ success: true, account: acc });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Ajustar saldo de usuario existente (dar, quitar, fijar)
    app.post('/api/admin/economy/accounts/:discordId/adjust', requireAdmin, (req, res) => {
        const { discordId } = req.params;
        const { action, amount, target } = req.body; // action: 'add'|'remove'|'set', target: 'wallet'|'bank'
        if (!['add', 'remove', 'set'].includes(action) || !Number.isInteger(Number(amount)) || Number(amount) < 0) {
            return res.status(400).json({ success: false, message: 'Parámetros de ajuste inválidos.' });
        }
        const acc = economyDb.adminAdjustBalance(discordId, action, parseInt(amount, 10), target || 'wallet');
        db.addAdminAuditLog(req.adminOperator, `AJUSTE_CUENTA_${action.toUpperCase()}`, discordId, `${amount} en ${target || 'wallet'}`);
        res.json({ success: true, account: acc });
    });

    app.delete('/api/admin/economy/accounts/:discordId', requireAdmin, (req, res) => {
        const { discordId } = req.params;
        const deleted = economyDb.deleteEconomyAccount(discordId);
        if (deleted) db.addAdminAuditLog(req.adminOperator, 'ELIMINAR_CUENTA', discordId, 'Cuenta e inventario eliminados; historial contable conservado.');
        res.json({ success: deleted, message: deleted ? 'Cuenta eliminada. El historial contable fue conservado.' : 'No se encontró la cuenta.' });
    });

    // Consultar permisos y estado de comandos económicos
    app.get('/api/admin/economy/commands', requireAdmin, (req, res) => {
        try {
            const commands = economyDb.getCommandPermissions();
            res.json({ success: true, commands });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Actualizar activación y roles permitidos de un comando económico
    app.post('/api/admin/economy/commands', requireAdmin, (req, res) => {
        try {
            const { commandName, isEnabled, allowedRoles } = req.body;
            if (!commandName) {
                return res.status(400).json({ success: false, message: 'Nombre de comando militar requerido.' });
            }
            const updated = economyDb.updateCommandPermission(commandName, isEnabled, allowedRoles);
            res.json({ success: true, command: updated, commands: economyDb.getCommandPermissions() });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Actualización masiva de permisos de comandos (habilitar/desactivar en lote)
    app.post('/api/admin/economy/commands/bulk', requireAdmin, (req, res) => {
        try {
            const { updates } = req.body;
            if (!Array.isArray(updates)) {
                return res.status(400).json({ success: false, message: 'Se requiere una lista válida de actualizaciones.' });
            }
            const commands = economyDb.bulkUpdateCommandPermissions(updates);
            if (db.addAdminAuditLog) {
                db.addAdminAuditLog(req.adminOperator, 'CONFIGURACION_COMANDOS_LOTE', 'COMANDOS', `Actualizados ${updates.length} comandos en lote.`);
            }
            res.json({ success: true, commands });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // =========================================================================
    // ENDPOINTS DE BONOS MILITARES (PANEL INTERACTIVO Y DISTRIBUCIÓN)
    // =========================================================================

    // Obtener estadísticas y configuración del panel de bonos
    app.get('/api/admin/economy/bonus', requireAdmin, (req, res) => {
        try {
            const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
            const panelId = req.query.panelId ? parseInt(req.query.panelId, 10) : null;
            const stats = economyDb.getBonusStats(guildId, panelId);
            const panels = economyDb.getAllBonusPanels(guildId);
            res.json({ success: true, stats, panel: stats.panel, panels });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Crear nuevo bono militar
    app.post('/api/admin/economy/bonus/create', requireAdmin, (req, res) => {
        try {
            const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
            const created = economyDb.createBonusPanel(guildId, req.body);
            res.json({ success: true, panel: created, message: 'Nuevo bono militar creado con éxito.' });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Guardar/Actualizar configuración del panel de bonos
    app.post('/api/admin/economy/bonus/config', requireAdmin, (req, res) => {
        try {
            const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
            const updated = economyDb.saveBonusPanel(guildId, req.body);
            res.json({ success: true, panel: updated });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Eliminar un bono militar
    app.delete('/api/admin/economy/bonus/:id', requireAdmin, (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            economyDb.deleteBonusPanel(id);
            res.json({ success: true, message: `Bono militar #${id} eliminado con éxito.` });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Reiniciar reclamos de un bono militar
    app.post('/api/admin/economy/bonus/:id/reset-claims', requireAdmin, (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const result = economyDb.resetBonusClaims(id);
            res.json({ success: true, message: `Reclamos del bono #${id} reiniciados. ${result.deletedClaims} registros limpiados.` });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Desplegar panel táctico de bonos en Discord
    app.post('/api/admin/economy/bonus/deploy-panel', requireAdmin, async (req, res) => {
        try {
            const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
            const { channelId, panelId } = req.body;
            const targetChannelId = channelId || req.body.channel_id;

            if (!targetChannelId) {
                return res.status(400).json({ success: false, message: 'Debe especificar el canal de Discord.' });
            }

            if (!discordClient || !discordClient.isReady()) {
                return res.status(503).json({ success: false, message: 'El cliente de Discord no está conectado.' });
            }

            const channel = await discordClient.guilds.cache.get(guildId)?.channels.fetch(targetChannelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                return res.status(400).json({ success: false, message: 'Canal de Discord no encontrado o no es de texto.' });
            }

            const panel = panelId ? economyDb.getBonusPanelById(parseInt(panelId, 10)) : economyDb.getBonusPanel(guildId);
            if (!panel) {
                return res.status(404).json({ success: false, message: 'Bono militar no encontrado.' });
            }
            const settings = economyDb.getEconomySettings(guildId);
            const msgPayload = buildBonusPanelMessage(panel, settings);

            const sentMsg = await channel.send(msgPayload);
            economyDb.saveBonusPanel(guildId, {
                id: panel.id,
                channel_id: channel.id,
                message_id: sentMsg.id
            });

            res.json({
                success: true,
                message: `Panel militar #${panel.id} desplegado exitosamente en #${channel.name}.`,
                messageId: sentMsg.id,
                channelId: channel.id
            });
        } catch (e) {
            res.status(500).json({ success: false, message: `Error al desplegar panel: ${e.message}` });
        }
    });

    // Distribuir bono individual o masivo desde la web
    app.post('/api/admin/economy/bonus/distribute', requireAdmin, async (req, res) => {
        try {
            const { target, amount, reason, destination } = req.body;
            const num = parseInt(amount, 10);
            if (isNaN(num) || num <= 0) {
                return res.status(400).json({ success: false, message: 'Monto de bono inválido.' });
            }

            if (target === 'ALL') {
                const massRes = economyDb.giveMassBonus(num, reason || 'Gratificación militar masiva desde el Panel Web', 'Comando Web USMC');
                return res.json({
                    success: true,
                    message: `Bono militar masivo de $${num.toLocaleString()} distribuido exitosamente a ${massRes.count} combatientes.`,
                    affected: massRes.count
                });
            } else {
                if (!target) {
                    return res.status(400).json({ success: false, message: 'Discord ID de combatiente requerido.' });
                }

                if (discordClient && discordClient.isReady()) {
                    try {
                        let user = discordClient.users.cache.get(target);
                        if (!user) user = await discordClient.users.fetch(target).catch(() => null);
                        if (user) {
                            economyDb.syncAccountUser(target, user.tag || user.username, user.displayAvatarURL({ extension: 'png', size: 128 }), (req.guildId || process.env.GUILD_ID) || 'GLOBAL');
                        }
                    } catch (e) {}
                }

                const acc = economyDb.giveBonus(target, num, reason || 'Bono concedido desde el Panel Web', destination || 'wallet', 'Comando Web USMC');
                return res.json({
                    success: true,
                    message: `Bono de $${num.toLocaleString()} acreditado exitosamente.`,
                    account: acc
                });
            }
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // =========================================================================
    // ENDPOINTS DE TIENDA (SHOP) ESTILO UNBELIEVABOAT
    // =========================================================================

    // Listar todos los ítems de la armería
    app.get('/api/admin/shop/items', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const items = economyDb.getShopItems(guildId, false);
        res.json({ success: true, items });
    });

    // Crear ítem de armería
    app.post('/api/admin/shop/items', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const {
            name, description, price, roles_to_give, roles_to_remove,
            required_roles, blocked_roles, stock, max_per_user, custom_reply, icon, is_active
        } = req.body;

        if (!name || isNaN(parseInt(price, 10))) {
            return res.status(400).json({ success: false, message: 'Nombre y precio válido son requeridos.' });
        }

        const item = economyDb.createShopItem({
            guild_id: guildId,
            name,
            description,
            price: parseInt(price, 10),
            roles_to_give: roles_to_give || [],
            roles_to_remove: roles_to_remove || [],
            required_roles: required_roles || [],
            blocked_roles: blocked_roles || [],
            stock: stock !== undefined ? parseInt(stock, 10) : -1,
            max_per_user: max_per_user !== undefined ? parseInt(max_per_user, 10) : 1,
            custom_reply: custom_reply || '',
            icon: icon || '🎖️',
            is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1
        });

        res.json({ success: true, item });
    });

    // Editar ítem de armería
    app.put('/api/admin/shop/items/:id', requireAdmin, (req, res) => {
        const id = parseInt(req.params.id, 10);
        const updated = economyDb.updateShopItem(id, req.body);
        if (!updated) return res.status(404).json({ success: false, message: 'Ítem no encontrado.' });
        res.json({ success: true, item: updated });
    });

    // Eliminar ítem de armería
    app.delete('/api/admin/shop/items/:id', requireAdmin, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const force = req.query.force === 'true' || req.body?.force === true;

        const item = economyDb.getShopItemById(id);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Ítem no encontrado.' });
        }

        const buyers = economyDb.getItemBuyers(id);
        if (buyers.length > 0 && !force) {
            // Resolver nombres desde Discord si están en caché
            const buyerDetails = buyers.map(b => {
                let name = b.username || b.discord_id;
                try {
                    const user = discordClient?.users?.cache?.get(b.discord_id);
                    if (user) name = `${user.tag || user.username} (${b.discord_id})`;
                } catch (e) {}
                return {
                    discord_id: b.discord_id,
                    name: name,
                    quantity: b.quantity,
                    acquired_at: b.acquired_at
                };
            });

            return res.json({
                success: false,
                requiresConfirmation: true,
                message: `Este ítem ya ha sido adquirido por ${buyers.length} combatiente(s).`,
                itemName: item.name,
                buyerCount: buyers.length,
                buyers: buyerDetails
            });
        }

        economyDb.deleteShopItem(id, true);
        res.json({ success: true, message: 'Ítem eliminado exitosamente de la armería y de los inventarios.' });
    });

    // =========================================================================
    // ENDPOINTS DE BONOS Y MULTIPLICADORES POR ROL
    // =========================================================================

    // Listar bonificaciones por rol
    app.get('/api/admin/economy/roles', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const rewards = economyDb.getRoleRewards(guildId);
        res.json({ success: true, rewards });
    });

    // Crear o actualizar bonificación por rol
    app.post('/api/admin/economy/roles', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const { role_id, role_name, multiplier, flat_bonus } = req.body;
        if (!role_id || !role_name) {
            return res.status(400).json({ success: false, message: 'ID y Nombre de rol requeridos.' });
        }

        const id = economyDb.setRoleReward(guildId, {
            role_id,
            role_name,
            multiplier: parseFloat(multiplier) || 1.0,
            flat_bonus: parseInt(flat_bonus, 10) || 0
        });

        res.json({ success: true, id, rewards: economyDb.getRoleRewards(guildId) });
    });

    // Eliminar bonificación por rol
    app.delete('/api/admin/economy/roles/:id', requireAdmin, (req, res) => {
        const id = parseInt(req.params.id, 10);
        economyDb.deleteRoleReward(id);
        res.json({ success: true });
    });

    // =========================================================================
    // =========================================================================
    // ENDPOINTS DE EVENTOS Y PAGOS AUTOMÁTICOS (VOZ, CHAT Y CONVOCATORIA)
    // =========================================================================

    app.get('/api/admin/events/templates', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        res.json({ success: true, templates: economyDb.getEventReportTemplates(guildId, req.query.all === '1') });
    });

    app.post('/api/admin/events/templates', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        if (!String(req.body.name || '').trim()) {
            return res.status(400).json({ success: false, message: 'El nombre de la plantilla es obligatorio.' });
        }
        const template = economyDb.saveEventReportTemplate(guildId, req.body);
        if (!template) {
            return res.status(404).json({ success: false, message: 'La plantilla que intentas editar ya no existe.' });
        }
        db.addAdminAuditLog(req.adminOperator, req.body.id ? 'EDITAR_PLANTILLA_ACTA' : 'CREAR_PLANTILLA_ACTA', String(template.id), template.name);
        return res.json({ success: true, template, templates: economyDb.getEventReportTemplates(guildId) });
    });

    app.delete('/api/admin/events/templates/:id', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const templateId = parseInt(req.params.id, 10);
        if (!Number.isInteger(templateId) || templateId <= 0) {
            return res.status(400).json({ success: false, message: 'ID de plantilla inválido.' });
        }
        const success = economyDb.archiveEventReportTemplate(templateId, guildId);
        return res.status(success ? 200 : 404).json({ success, message: success ? 'Plantilla archivada.' : 'Plantilla no encontrada.' });
    });

    // Obtener todos los eventos activos y sus participantes en tiempo real.
    app.get('/api/admin/events/active', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const events = economyDb.getActiveEvents(guildId).map(event => {
            const attendees = economyDb.getEventRegistrations(event.id);
            return {
                event,
                attendees,
                stats: {
                    total: attendees.length,
                    registered: attendees.filter(a => a.status === 'REGISTERED').length,
                    confirmed: attendees.filter(a => a.attendance_confirmed === 1 || a.is_eligible === 1).length,
                    claimed: attendees.filter(a => a.claimed === 1).length,
                    totalPaid: attendees.reduce((acc, a) => acc + (a.payout_amount || 0), 0)
                }
            };
        });
        const selected = events[0] || null;
        res.json({
            success: true,
            has_active: events.length > 0,
            events,
            // Compatibilidad con clientes anteriores.
            event: selected?.event || null,
            attendees: selected?.attendees || [],
            stats: selected?.stats || {}
        });
    });

    // Iniciar evento o convocatoria desde la web
    app.post('/api/admin/events/start', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const {
            name, event_type, target_channel_id, payout_channel_id,
            registration_channel_id, confirmation_channel_id,
            base_reward, claim_deadline_hours, grace_period_minutes, min_attendance_percent,
            max_participants, template_id
        } = req.body;

        const parsedTemplateId = parseInt(template_id, 10);
        if (!name || !base_reward || !Number.isInteger(parsedTemplateId) || parsedTemplateId <= 0) {
            return res.status(400).json({ success: false, message: 'El nombre, la paga base y una plantilla de registro son obligatorios.' });
        }

        const type = event_type || 'VOICE';
        const targetChan = target_channel_id || registration_channel_id || payout_channel_id || '';
        const payoutChan = payout_channel_id || targetChan;

        if (discordClient && discordClient.isReady()) {
            const guild = discordClient.guilds.cache.get(guildId);
            const targetChannel = guild?.channels?.cache?.get(targetChan);
            if (!targetChannel) {
                return res.status(400).json({ success: false, message: 'El canal seleccionado ya no existe o no está disponible para el bot.' });
            }
            const requiresVoice = type === 'VOICE' || type === 'HYBRID';
            if (requiresVoice && !targetChannel.isVoiceBased()) {
                return res.status(400).json({ success: false, message: 'Esta modalidad requiere seleccionar un canal de voz o escenario.' });
            }
            if (!requiresVoice && !targetChannel.isTextBased()) {
                return res.status(400).json({ success: false, message: 'Esta modalidad requiere seleccionar un canal de texto.' });
            }
        }

        const result = economyDb.createEvent({
            guild_id: guildId,
            name,
            event_type: type,
            target_channel_id: targetChan,
            payout_channel_id: payoutChan,
            registration_channel_id: registration_channel_id || targetChan,
            confirmation_channel_id: confirmation_channel_id || targetChan,
            base_reward: parseInt(base_reward, 10),
            claim_deadline_hours: parseInt(claim_deadline_hours, 10) || 24,
            grace_period_minutes: parseInt(grace_period_minutes, 10) !== undefined ? parseInt(grace_period_minutes, 10) : 5,
            min_attendance_percent: parseInt(min_attendance_percent, 10) || 80,
            max_participants: parseInt(max_participants, 10) || 0,
            phase: type === 'REGISTRATION' ? 'REGISTRATION' : 'ACTIVE',
            report_template_id: parsedTemplateId,
            created_by_id: 'WEB_ADMIN',
            created_by_name: String(process.env.ADMIN_NAME || 'Comando Web').slice(0, 100)
        });

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message });
        }

        // Snapshot inicial de miembros en voz si aplica
        if ((type === 'VOICE' || type === 'HYBRID') && discordClient && discordClient.isReady()) {
            const guild = discordClient.guilds.cache.get(guildId);
            if (guild && targetChan) {
                const channel = guild.channels.cache.get(targetChan);
                if (channel && channel.isVoiceBased()) {
                    for (const [mId, member] of channel.members) {
                        if (!member.user.bot) {
                            economyDb.recordAttendanceHeartbeat(result.event.id, mId, member.user.tag, 10);
                        }
                    }
                }
            }
        }

        res.json({ success: true, event: result.event });
    });

    // Desplegar Panel de Registro / Convocatoria a Discord
    app.post('/api/admin/events/deploy-registration', requireAdmin, async (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const active = resolveRequestedActiveEvent(guildId, req.body.event_id);
        if (!active) {
            return res.status(404).json({ success: false, message: 'No hay operación militar activa.' });
        }

        const channelId = req.body.channel_id || active.registration_channel_id || active.target_channel_id;
        if (!discordClient || !discordClient.isReady()) {
            return res.status(500).json({ success: false, message: 'Bot de Discord no conectado.' });
        }

        const guild = discordClient.guilds.cache.get(active.guild_id);
        const channel = guild ? guild.channels.cache.get(channelId) : null;
        if (!channel || !channel.isTextBased()) {
            return res.status(400).json({ success: false, message: 'Canal de texto no encontrado en el servidor de Discord.' });
        }

        try {
            const settings = economyDb.getEconomySettings(active.guild_id);
            const panelData = buildRegistrationPanel(active, settings);
            const sentMsg = await channel.send(panelData);

            economyDb.setEventPhase(active.id, 'REGISTRATION', {
                registration_channel_id: channel.id,
                registration_message_id: sentMsg.id
            });

            res.json({ success: true, message: `Panel de Convocatoria publicado en #${channel.name}`, messageId: sentMsg.id });
        } catch (err) {
            console.error('[Deploy Reg Error]:', err);
            res.status(500).json({ success: false, message: `Error al desplegar panel: ${err.message}` });
        }
    });

    // Retirar un ausente del roster antes de la liquidación automática
    app.delete('/api/admin/events/attendance/:discordId', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const active = resolveRequestedActiveEvent(guildId, req.query.event_id);
        if (!active) {
            return res.status(404).json({ success: false, message: 'No hay operación militar activa.' });
        }

        const discordId = String(req.params.discordId || '').trim();
        if (!discordId) {
            return res.status(400).json({ success: false, message: 'Discord ID requerido.' });
        }

        const result = economyDb.expelUserFromEvent(active.id, discordId, req.adminOperator);
        return res.status(result.success ? 200 : 400).json(result);
    });

    // Finalizar evento activo y liquidar inmediatamente a los asistentes aprobados
    app.post('/api/admin/events/end', requireAdmin, async (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const active = resolveRequestedActiveEvent(guildId, req.body.event_id);

        if (!active) {
            return res.status(404).json({ success: false, message: 'No hay ninguna operación militar activa para concluir.' });
        }

        try {
            let reportTemplate = {};
            try { reportTemplate = JSON.parse(active.report_template_snapshot || '{}'); } catch {}
            if (reportTemplate.evidence_required) {
                return res.status(400).json({
                    success: false,
                    message: `La plantilla "${reportTemplate.name || 'seleccionada'}" exige una imagen. Finaliza desde Discord con /evento finalizar y adjunta la evidencia.`
                });
            }

            const summary = economyDb.massPayoutEvent(active.id, discordClient, 'COMANDO_WEB');
            if (!summary.success) {
                return res.status(400).json(summary);
            }

            let reportChannel = null;
            let reportWarning = null;
            try {
                const guild = discordClient?.guilds?.cache?.get(active.guild_id);
                const fallbackChannel = guild?.channels?.cache?.get(active.registration_channel_id)
                    || guild?.channels?.cache?.get(active.payout_channel_id)
                    || guild?.channels?.cache?.get(active.target_channel_id)
                    || guild?.systemChannel;
                if (!guild || !fallbackChannel?.isTextBased()) throw new Error('No hay un canal de texto disponible para publicar el acta.');
                const report = await publishEventReport({
                    guild,
                    channel: fallbackChannel,
                    client: discordClient,
                    user: { id: discordClient.user.id },
                    reportOfficerLabel: `**Comando Web (${String(process.env.ADMIN_NAME || 'ADMIN').slice(0, 60)})**`
                }, active, summary, null, req.body.result || '', req.body.notes || '');
                reportChannel = report.channel?.id || null;
            } catch (reportError) {
                console.error('[Event Report Error]:', reportError);
                reportWarning = `El pago se completó, pero el acta no pudo publicarse: ${reportError.message}. Puedes reintentar con /evento finalizar evento_id:${active.id}.`;
            }

            res.json({ success: true, summary, reportChannel, reportWarning });
        } catch (err) {
            console.error('[Finish Event Error]:', err);
            res.status(500).json({ success: false, message: `Error al concluir evento: ${err.message}` });
        }
    });

    // Historial de eventos concluidos
    app.get('/api/admin/events/history', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
        const total = economyDb.countEventHistory(guildId);
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), totalPages);
        const history = economyDb.getEventHistory(guildId, limit, (page - 1) * limit);
        res.json({ success: true, history, total, page, totalPages, limit });
    });

    // Consultar el roster histórico completo, incluidos retirados y cancelados
    app.get('/api/admin/events/:id/attendees', requireAdmin, (req, res) => {
        const eventId = parseInt(req.params.id, 10);
        if (!Number.isInteger(eventId) || eventId <= 0) {
            return res.status(400).json({ success: false, message: 'ID de evento inválido.' });
        }

        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const event = economyDb.getEventById(eventId);
        if (!event || (event.guild_id !== guildId && event.guild_id !== 'GLOBAL')) {
            return res.status(404).json({ success: false, message: 'Evento no encontrado en este servidor.' });
        }

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
        const roster = economyDb.getEventRegistrationsPage(eventId, page, limit);
        return res.json({ success: true, event, ...roster });
    });

    // Borrado permanente de un evento histórico y sus registros de asistencia
    app.delete('/api/admin/events/:id', requireAdmin, (req, res) => {
        const eventId = parseInt(req.params.id, 10);
        if (!Number.isInteger(eventId) || eventId <= 0) {
            return res.status(400).json({ success: false, message: 'ID de evento inválido.' });
        }

        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const result = economyDb.deleteEventRecord(eventId, guildId);
        if (!result.success) {
            return res.status(result.event?.status === 'ACTIVE' ? 409 : 404).json(result);
        }

        db.addAdminAuditLog(
            req.adminOperator,
            'ELIMINAR_EVENTO',
            String(eventId),
            `${result.event.name} | ${result.attendanceCount} registros de asistencia`
        );
        return res.json(result);
    });

    // =========================================================================
    // ENDPOINTS DE AUDITORÍA CONTABLE Y RASTREO DE USO DE DINERO (LEDGER)
    // =========================================================================

    // Listado de transacciones enriquecidas con filtros y buscador
    app.get('/api/admin/economy/transactions', requireAdmin, (req, res) => {
        const { type, search, discord_id, from, to, limit, offset } = req.query;
        const filters = {
            discordId: discord_id || null,
            type: type || null,
            search: search || '',
            from: from || null,
            to: to || null,
            limit: Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100),
            offset: Math.max(parseInt(offset, 10) || 0, 0)
        };
        const transactions = economyDb.getEnrichedTransactions(filters);
        res.json({ success: true, transactions, total: economyDb.countEnrichedTransactions(filters), limit: filters.limit, offset: filters.offset });
    });

    // Eliminar un registro contable específico por ID
    app.delete('/api/admin/economy/transactions/:id', requireAdmin, (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ success: false, message: 'ID numérico inválido.' });
        }
        const success = economyDb.deleteTransaction(id);
        if (success) db.addAdminAuditLog(req.adminOperator, 'ELIMINAR_TRANSACCION', String(id));
        res.json({ success, message: success ? 'Registro contable eliminado exitosamente.' : 'No se encontró el registro.' });
    });

    // Eliminar un lote de registros contables seleccionados
    app.post('/api/admin/economy/transactions/delete-batch', requireAdmin, (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No se enviaron identificadores válidos para eliminar.' });
        }
        const count = economyDb.deleteTransactions(ids);
        if (count) db.addAdminAuditLog(req.adminOperator, 'ELIMINAR_TRANSACCIONES_LOTE', null, `${count} registros`);
        res.json({ success: true, count, message: `Se eliminaron ${count} registro(s) contable(s).` });
    });

    // Vaciar / Eliminar todos los registros contables del libro
    app.delete('/api/admin/economy/transactions', requireAdmin, (req, res) => {
        const count = economyDb.clearAllTransactions();
        if (count) db.addAdminAuditLog(req.adminOperator, 'VACIAR_LIBRO_CONTABLE', null, `${count} registros`);
        res.json({ success: true, count, message: `Se han purgado todos los registros contables (${count} eliminados).` });
    });

    // Estadísticas globales de tesorería militar
    app.get('/api/admin/economy/treasury/stats', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        const stats = economyDb.getTreasuryStats(guildId);
        res.json({ success: true, stats });
    });

    // Perfil financiero individual: cómo gana y en qué gasta su dinero un soldado
    app.get('/api/admin/economy/user/:discordId/financial-profile', requireAdmin, (req, res) => {
        const { discordId } = req.params;
        const profile = economyDb.getUserFinancialProfile(discordId);
        res.json({ success: true, profile });
    });

    app.get('/api/admin/audit-logs', requireAdmin, (req, res) => {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        res.json({ success: true, logs: db.getAdminAuditLogs(limit, offset), limit, offset });
    });

    // =========================================================================
    // ENDPOINTS DE SERVIDORES PRIVADOS (VIP SERVERS BRM 5)
    // =========================================================================
    app.get('/api/admin/servers', requireAdmin, (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL';
        res.json({ success: true, servers: db.getPrivateServers(guildId) });
    });

    function serverFields(body = {}) {
        return { server_name: String(body.server_name || '').trim().slice(0, 80),
            server_code: String(body.server_code || '').trim().slice(0, 150),
            sector_map: String(body.sector_map || 'Ronograd Island').trim().slice(0, 120),
            notes: String(body.notes || '').trim().slice(0, 500) };
    }
    app.post('/api/admin/servers', requireAdmin, async (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL', fields = serverFields(req.body);
        if (!fields.server_name || !fields.server_code) return res.status(400).json({ success: false, message: 'Indica el nombre y el código VIP real.' });
        const created = db.createPrivateServer({ guild_id: guildId, ...fields });
        db.addAdminAuditLog(req.adminOperator, 'CREAR_SERVIDOR_PRIVADO', `SRV #${created.id}`, created.server_name);
        await refreshPublicServerBoard(discordClient, guildId);
        res.json({ success: true, server: created });
    });
    app.put('/api/admin/servers/:id', requireAdmin, async (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL', id = Number(req.params.id);
        const existing = db.getPrivateServerById(id, guildId), fields = serverFields(req.body);
        if (!existing) return res.status(404).json({ success: false, message: 'Servidor no encontrado.' });
        if (!fields.server_name || !fields.server_code) return res.status(400).json({ success: false, message: 'Indica nombre y código VIP.' });
        const server = db.updatePrivateServer(id, fields);
        db.addAdminAuditLog(req.adminOperator, 'EDITAR_SERVIDOR_PRIVADO', `SRV #${id}`, JSON.stringify({ antes: serverFields(existing), despues: fields }));
        await refreshPublicServerBoard(discordClient, guildId);
        res.json({ success: true, server });
    });
    app.post('/api/admin/servers/:id/toggle', requireAdmin, async (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL', id = Number(req.params.id);
        const srv = db.getPrivateServerById(id, guildId);
        if (!srv) return res.status(404).json({ success: false, message: 'Servidor no encontrado.' });
        if (req.body?.expected_status !== srv.status) return res.status(409).json({ success: false, message: 'El estado cambió. Sincroniza la pizarra antes de confirmar.' });
        const result = srv.status === 'EN_USO' ? db.releasePrivateServer(id, guildId)
            : db.occupyPrivateServer(id, req.adminOperator.discord_id, req.adminOperator.operator_name,
                String(req.body?.mission || 'Reserva de Alto Mando').slice(0, 180), null, guildId);
        if (!result.success) return res.status(409).json(result);
        db.addAdminAuditLog(req.adminOperator, srv.status === 'EN_USO' ? 'LIBERAR_SERVIDOR_PRIVADO' : 'OCUPAR_SERVIDOR_PRIVADO', `SRV #${id}`, srv.server_name);
        await refreshPublicServerBoard(discordClient, guildId);
        res.json({ success: true, server: result.server });
    });
    app.delete('/api/admin/servers/:id', requireAdmin, async (req, res) => {
        const guildId = (req.guildId || process.env.GUILD_ID) || 'GLOBAL', id = Number(req.params.id);
        const srv = db.getPrivateServerById(id, guildId);
        if (!srv) return res.status(404).json({ success: false, message: 'Servidor no encontrado.' });
        if (!db.deletePrivateServer(id, guildId)) return res.status(409).json({ success: false, message: 'Libera el servidor antes de eliminarlo.' });
        db.addAdminAuditLog(req.adminOperator, 'ELIMINAR_SERVIDOR_PRIVADO', `SRV #${id}`, srv.server_name);
        await refreshPublicServerBoard(discordClient, guildId);
        res.json({ success: true });
    });

    return app;
}

module.exports = { createWebServer };
