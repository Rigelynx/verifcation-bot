const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('../database/db');
const economyDb = require('../database/economyDb');
const { hasAnyRole } = require('../bot/utils/roleUtils');
const { finishAndPublishEvent } = require('../bot/handlers/eventTracker');
const { buildBonusPanelMessage } = require('../bot/commands/bono');
const { buildRegistrationPanel, buildConfirmationPanel, buildPayoutPanel } = require('../bot/commands/eventos');

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
                .filter(c => c.isTextBased() || c.isVoiceBased())
                .sort((a, b) => a.position - b.position)
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    type: c.isVoiceBased() ? 'voice' : 'text'
                }));

            const textChannels = channels.filter(c => c.type === 'text');
            const voiceChannels = channels.filter(c => c.type === 'voice');

            res.json({
                success: true,
                connected: true,
                guild_name: guild.name,
                guild_id: guild.id,
                roles,
                channels,
                text_channels: textChannels,
                voice_channels: voiceChannels
            });
        } catch (err) {
            console.error('[Guild Resources Error]:', err);
            res.json({ success: true, connected: false, roles: [], channels: [], text_channels: [], voice_channels: [] });
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
        if (!['APROBADO', 'RECHAZADO'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Acción de verificación inválida.' });
        }

        const reviewer = process.env.ADMIN_NAME || 'ADMIN_WEB';
        const updated = db.updateVerificationStatus(discordId, action, reviewer, reason);
        db.addAdminAuditLog(reviewer, `VERIFICACION_${action}`, discordId, reason || 'Sin motivo adicional');

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
        db.addAdminAuditLog(process.env.ADMIN_NAME || 'ADMIN_WEB', 'ELIMINAR_EXPEDIENTE', discordId);
        res.json({ success: true });
    });

    // =========================================================================
    // ENDPOINTS DE ECONOMÍA MILITAR
    // =========================================================================

    // Obtener configuración de economía
    app.get('/api/admin/economy/settings', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const settings = economyDb.getEconomySettings(guildId);
        res.json({ success: true, settings });
    });

    // Actualizar configuración de economía
    app.post('/api/admin/economy/settings', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
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
                                economyDb.syncAccountUser(acc.discord_id, acc.username, acc.avatar, process.env.GUILD_ID || 'GLOBAL');
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
                        economyDb.syncAccountUser(discordId, user.tag || user.username, user.displayAvatarURL({ extension: 'png', size: 128 }), process.env.GUILD_ID || 'GLOBAL');
                    }
                } catch (e) {}
            }

            const acc = economyDb.adminAdjustBalance(discordId, action, parseInt(amount, 10), target || 'wallet');
            db.addAdminAuditLog(process.env.ADMIN_NAME || 'ADMIN_WEB', `AJUSTE_CUENTA_${action.toUpperCase()}`, discordId, `${amount} en ${target || 'wallet'}`);
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
        db.addAdminAuditLog(process.env.ADMIN_NAME || 'ADMIN_WEB', `AJUSTE_CUENTA_${action.toUpperCase()}`, discordId, `${amount} en ${target || 'wallet'}`);
        res.json({ success: true, account: acc });
    });

    app.delete('/api/admin/economy/accounts/:discordId', requireAdmin, (req, res) => {
        const { discordId } = req.params;
        const deleted = economyDb.deleteEconomyAccount(discordId);
        if (deleted) db.addAdminAuditLog(process.env.ADMIN_NAME || 'ADMIN_WEB', 'ELIMINAR_CUENTA', discordId, 'Cuenta e inventario eliminados; historial contable conservado.');
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

    // =========================================================================
    // ENDPOINTS DE BONOS MILITARES (PANEL INTERACTIVO Y DISTRIBUCIÓN)
    // =========================================================================

    // Obtener estadísticas y configuración del panel de bonos
    app.get('/api/admin/economy/bonus', requireAdmin, (req, res) => {
        try {
            const guildId = process.env.GUILD_ID || 'GLOBAL';
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
            const guildId = process.env.GUILD_ID || 'GLOBAL';
            const created = economyDb.createBonusPanel(guildId, req.body);
            res.json({ success: true, panel: created, message: 'Nuevo bono militar creado con éxito.' });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Guardar/Actualizar configuración del panel de bonos
    app.post('/api/admin/economy/bonus/config', requireAdmin, (req, res) => {
        try {
            const guildId = process.env.GUILD_ID || 'GLOBAL';
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
            const guildId = process.env.GUILD_ID || 'GLOBAL';
            const { channelId, panelId } = req.body;
            const targetChannelId = channelId || req.body.channel_id;

            if (!targetChannelId) {
                return res.status(400).json({ success: false, message: 'Debe especificar el canal de Discord.' });
            }

            if (!discordClient || !discordClient.isReady()) {
                return res.status(503).json({ success: false, message: 'El cliente de Discord no está conectado.' });
            }

            const channel = await discordClient.channels.fetch(targetChannelId).catch(() => null);
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
                            economyDb.syncAccountUser(target, user.tag || user.username, user.displayAvatarURL({ extension: 'png', size: 128 }), process.env.GUILD_ID || 'GLOBAL');
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
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const items = economyDb.getShopItems(guildId, false);
        res.json({ success: true, items });
    });

    // Crear ítem de armería
    app.post('/api/admin/shop/items', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
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
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const rewards = economyDb.getRoleRewards(guildId);
        res.json({ success: true, rewards });
    });

    // Crear o actualizar bonificación por rol
    app.post('/api/admin/economy/roles', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
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

    // Obtener evento activo y participantes en tiempo real con datos enriquecidos
    app.get('/api/admin/events/active', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const active = economyDb.getActiveEvent(guildId);
        if (!active) {
            return res.json({ success: true, has_active: false, event: null, attendees: [], stats: {} });
        }
        const attendees = economyDb.getEventRegistrations(active.id);
        const stats = {
            total: attendees.length,
            registered: attendees.filter(a => a.status === 'REGISTERED').length,
            confirmed: attendees.filter(a => a.attendance_confirmed === 1 || a.is_eligible === 1).length,
            claimed: attendees.filter(a => a.claimed === 1).length,
            totalPaid: attendees.reduce((acc, a) => acc + (a.payout_amount || 0), 0)
        };
        res.json({ success: true, has_active: true, event: active, attendees, stats });
    });

    // Iniciar evento o convocatoria desde la web
    app.post('/api/admin/events/start', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || (discordClient && discordClient.guilds.cache.first() ? discordClient.guilds.cache.first().id : 'GLOBAL');
        const {
            name, event_type, target_channel_id, payout_channel_id,
            registration_channel_id, confirmation_channel_id,
            base_reward, claim_deadline_hours, grace_period_minutes, min_attendance_percent,
            max_participants
        } = req.body;

        if (!name || !base_reward) {
            return res.status(400).json({ success: false, message: 'El nombre y la paga base son requeridos.' });
        }

        const type = event_type || 'VOICE';
        const targetChan = target_channel_id || registration_channel_id || payout_channel_id || '';
        const payoutChan = payout_channel_id || targetChan;

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
            phase: type === 'REGISTRATION' ? 'REGISTRATION' : 'ACTIVE'
        });

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message });
        }

        // Snapshot inicial de miembros en voz si aplica
        if ((type === 'VOICE' || type === 'HYBRID') && discordClient && discordClient.isReady()) {
            const guild = discordClient.guilds.cache.get(guildId) || discordClient.guilds.cache.first();
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
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const active = economyDb.getActiveEvent(guildId);
        if (!active) {
            return res.status(404).json({ success: false, message: 'No hay operación militar activa.' });
        }

        const channelId = req.body.channel_id || active.registration_channel_id || active.target_channel_id;
        if (!discordClient || !discordClient.isReady()) {
            return res.status(500).json({ success: false, message: 'Bot de Discord no conectado.' });
        }

        const guild = discordClient.guilds.cache.get(active.guild_id) || discordClient.guilds.cache.first();
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

    // Desplegar Panel de Confirmación de Asistencia a Discord
    app.post('/api/admin/events/deploy-confirmation', requireAdmin, async (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const active = economyDb.getActiveEvent(guildId);
        if (!active) {
            return res.status(404).json({ success: false, message: 'No hay operación militar activa.' });
        }

        const channelId = req.body.channel_id || active.confirmation_channel_id || active.target_channel_id;
        if (!discordClient || !discordClient.isReady()) {
            return res.status(500).json({ success: false, message: 'Bot de Discord no conectado.' });
        }

        const guild = discordClient.guilds.cache.get(active.guild_id) || discordClient.guilds.cache.first();
        const channel = guild ? guild.channels.cache.get(channelId) : null;
        if (!channel || !channel.isTextBased()) {
            return res.status(400).json({ success: false, message: 'Canal de texto no válido.' });
        }

        try {
            const settings = economyDb.getEconomySettings(active.guild_id);
            const panelData = buildConfirmationPanel(active, settings);
            const sentMsg = await channel.send(panelData);

            economyDb.setEventPhase(active.id, 'CONFIRMING', {
                confirmation_channel_id: channel.id,
                confirmation_message_id: sentMsg.id
            });

            res.json({ success: true, message: `Pase de Lista publicado en #${channel.name}`, messageId: sentMsg.id });
        } catch (err) {
            console.error('[Deploy Confirm Error]:', err);
            res.status(500).json({ success: false, message: `Error al desplegar confirmación: ${err.message}` });
        }
    });

    // Desplegar Panel de Cobro a Discord (finaliza evento y publica botón de reclamo)
    app.post('/api/admin/events/deploy-payout', requireAdmin, async (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const active = economyDb.getActiveEvent(guildId);
        if (!active) {
            return res.status(404).json({ success: false, message: 'No hay operación militar activa.' });
        }

        const channelId = req.body.channel_id || active.payout_channel_id || active.target_channel_id;
        if (!discordClient || !discordClient.isReady()) {
            return res.status(500).json({ success: false, message: 'Bot de Discord no conectado.' });
        }

        const guild = discordClient.guilds.cache.get(active.guild_id) || discordClient.guilds.cache.first();
        const channel = guild ? guild.channels.cache.get(channelId) : null;
        if (!channel || !channel.isTextBased()) {
            return res.status(400).json({ success: false, message: 'Canal de texto de pago no válido.' });
        }

        try {
            const finalized = economyDb.finalizeEvent(active.id);
            const settings = economyDb.getEconomySettings(active.guild_id);
            const panelData = buildPayoutPanel(finalized, settings, finalized.claim_expires_at);
            const sentMsg = await channel.send(panelData);

            economyDb.setEventPhase(active.id, 'ENDED', {
                payout_channel_id: channel.id,
                discord_message_id: sentMsg.id
            });

            res.json({ success: true, message: `Panel de Cobro publicado en #${channel.name}`, messageId: sentMsg.id });
        } catch (err) {
            console.error('[Deploy Payout Error]:', err);
            res.status(500).json({ success: false, message: `Error al desplegar cobro: ${err.message}` });
        }
    });

    // Pago Masivo Directo desde la web a todos los confirmados
    app.post('/api/admin/events/mass-payout', requireAdmin, async (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const active = economyDb.getActiveEvent(guildId);
        if (!active) {
            return res.status(404).json({ success: false, message: 'No hay operación militar activa para liquidar.' });
        }

        try {
            const summary = economyDb.massPayoutEvent(active.id, discordClient, 'COMANDO_WEB');
            res.json({ success: true, summary });
        } catch (err) {
            console.error('[Mass Payout Error]:', err);
            res.status(500).json({ success: false, message: `Error en liquidación masiva: ${err.message}` });
        }
    });

    // Ajuste manual de asistencia / confirmación desde la tabla web
    app.post('/api/admin/events/attendance/manual', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const active = economyDb.getActiveEvent(guildId);
        if (!active) {
            return res.status(404).json({ success: false, message: 'No hay operación militar activa.' });
        }

        const { discord_id, is_eligible, is_confirmed } = req.body;
        if (!discord_id) {
            return res.status(400).json({ success: false, message: 'discord_id es requerido.' });
        }

        const result = economyDb.manualToggleAttendance(active.id, discord_id, {
            isEligible: is_eligible,
            isConfirmed: is_confirmed
        });

        res.json(result);
    });

    // Finalizar evento activo y publicar botón de cobro (retrocompatible)
    app.post('/api/admin/events/end', requireAdmin, async (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const active = economyDb.getActiveEvent(guildId);

        if (!active) {
            return res.status(404).json({ success: false, message: 'No hay ninguna operación militar activa para concluir.' });
        }

        try {
            if (!discordClient || !discordClient.isReady()) {
                economyDb.finalizeEvent(active.id);
                return res.json({ success: true, message: 'Operación finalizada en base de datos (bot desconectado de Discord).' });
            }

            const summary = await finishAndPublishEvent(discordClient, active.id);
            res.json({ success: true, summary });
        } catch (err) {
            console.error('[Finish Event Error]:', err);
            res.status(500).json({ success: false, message: `Error al concluir evento: ${err.message}` });
        }
    });

    // Historial de eventos concluidos
    app.get('/api/admin/events/history', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
        const limit = parseInt(req.query.limit, 10) || 15;
        const history = economyDb.getEventHistory(guildId, limit);
        res.json({ success: true, history });
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
        if (success) db.addAdminAuditLog(process.env.ADMIN_NAME || 'ADMIN_WEB', 'ELIMINAR_TRANSACCION', String(id));
        res.json({ success, message: success ? 'Registro contable eliminado exitosamente.' : 'No se encontró el registro.' });
    });

    // Eliminar un lote de registros contables seleccionados
    app.post('/api/admin/economy/transactions/delete-batch', requireAdmin, (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No se enviaron identificadores válidos para eliminar.' });
        }
        const count = economyDb.deleteTransactions(ids);
        if (count) db.addAdminAuditLog(process.env.ADMIN_NAME || 'ADMIN_WEB', 'ELIMINAR_TRANSACCIONES_LOTE', null, `${count} registros`);
        res.json({ success: true, count, message: `Se eliminaron ${count} registro(s) contable(s).` });
    });

    // Vaciar / Eliminar todos los registros contables del libro
    app.delete('/api/admin/economy/transactions', requireAdmin, (req, res) => {
        const count = economyDb.clearAllTransactions();
        if (count) db.addAdminAuditLog(process.env.ADMIN_NAME || 'ADMIN_WEB', 'VACIAR_LIBRO_CONTABLE', null, `${count} registros`);
        res.json({ success: true, count, message: `Se han purgado todos los registros contables (${count} eliminados).` });
    });

    // Estadísticas globales de tesorería militar
    app.get('/api/admin/economy/treasury/stats', requireAdmin, (req, res) => {
        const guildId = process.env.GUILD_ID || 'GLOBAL';
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

    return app;
}

module.exports = { createWebServer };
