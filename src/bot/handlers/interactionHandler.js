const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    MessageFlags
} = require('discord.js');
const db = require('../../database/db');
const economyDb = require('../../database/economyDb');
const { handleStatusChange } = require('./verificationHandler');
const { hasOfficerPermission } = require('./permissionHandler');
const { hasAnyRole } = require('../utils/roleUtils');
const { processShopPurchase, buildShopPanel } = require('../commands/tienda');
const { buildEventRosterPanel } = require('../commands/eventos');

async function handleInteraction(interaction, client, commands) {
    // Sincronización automática de identidad del combatiente en el sistema contable
    if (interaction.user) {
        try {
            economyDb.syncAccountUser(
                interaction.user.id,
                interaction.user.tag || interaction.user.username,
                interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
            );
        } catch (e) {}
    }

    // 1. Manejo de Comandos Slash
    if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`[Comando Error: ${interaction.commandName}]`, error);
            const msg = { content: '❌ Error en la ejecución del protocolo militar.', flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(msg).catch(() => {});
            } else {
                await interaction.reply(msg).catch(() => {});
            }
        }
        return;
    }

    // 2. Manejo de Botones Interactivos
    if (interaction.isButton()) {
        const customId = interaction.customId;

        // BOTÓN: Iniciar Verificación desde el Panel
        if (customId === 'btn_start_verification') {
            const user = interaction.user;
            const guild = interaction.guild;
            const config = db.getConfig(guild.id);

            // 1. Comprobar si ya tiene alguno de los roles de verificado en Discord
            const member = interaction.member;
            const hasVerifiedRole = hasAnyRole(member, config.verified_role_id);
            
            // 2. Comprobar si su expediente en base de datos figura como APROBADO
            const existing = db.getVerificationByDiscordId(user.id);
            const isApproved = existing && existing.status === 'APROBADO';

            if (hasVerifiedRole || isApproved) {
                const verifiedEmbed = new EmbedBuilder()
                    .setColor(0x38e54d)
                    .setTitle('🎖️ [CREDENCIALES ACTIVAS // YA ESTÁS VERIFICADO]')
                    .setDescription(`
**¡Atención, soldado!** Tu identidad ya figura como **VALIDADA Y APROBADA** en el Cuartel General.

> 🔹 **Estado:** \`ACREDITACIÓN ACTIVA (CLEARANCE NIVEL 4)\`
> 🔹 **Identidad:** <@${user.id}> (\`${user.tag}\`)
> 🔹 **Permisos:** Ya cuentas con acceso completo a los canales e instalaciones de la base.

*No es necesario que vuelvas a llenar el cuestionario ni que abras la terminal.*
                    `)
                    .setFooter({ text: 'Sistema Autónomo de Verificación Táctica • USMC Defense', iconURL: guild.iconURL() });

                return interaction.reply({
                    embeds: [verifiedEmbed],
                    flags: MessageFlags.Ephemeral
                });
            }

            // 3. Comprobar si su expediente está pendiente de revisión
            if (existing && existing.status === 'PENDIENTE') {
                const pendingEmbed = new EmbedBuilder()
                    .setColor(0xffb000)
                    .setTitle('⏳ [EXPEDIENTE EN TRÁMITE // PENDIENTE DE REVISIÓN]')
                    .setDescription(`
**Aspirante:** Tu declaración jurada ya fue transmitida y está en la mesa de deliberación de los oficiales.

> 🔹 **Estado actual:** \`PENDIENTE DE DICTAMEN DE MANDO\`
> 🔹 **Aviso:** No reenvíes solicitudes duplicadas. Recibirás un mensaje privado (MD) cuando se apruebe.
                    `)
                    .setFooter({ text: 'USMC Defense • No reenvíes formularios duplicados.', iconURL: guild.iconURL() });

                return interaction.reply({
                    embeds: [pendingEmbed],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Generar token efímero y URL militar
            const token = db.createVerificationToken(user.id, user.tag, user.displayAvatarURL(), guild.id);
            const webUrl = process.env.WEB_URL || `http://localhost:${process.env.PORT || 3000}`;
            const verifyLink = `${webUrl}/verify/${token}`;

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('📟 [TERMINAL TÁCTICA DE VERIFICACIÓN ASIGNADA]')
                .setDescription(`
Se ha generado un canal de enlace cifrado de **30 minutos de vigencia**.

Para formalizar tu ingreso a la base militar:
1. Haz clic en el botón de abajo **\`[ INGRESAR A LA TERMINAL ]\`**.
2. Llena con sinceridad las preguntas de tu expediente de servicio.
3. Transmite tu formulario para que el comando evalúe tu rango.
                `)
                .addFields(
                    { name: '👤 Aspirante', value: `${user.tag}`, inline: true },
                    { name: '⏱️ Caducidad de Enlace', value: '30 Minutos', inline: true },
                    { name: '🛡️ Estado de Seguridad', value: '`ENCRIPTACIÓN SHA-256 ACTIVA`', inline: false }
                )
                .setFooter({ text: 'No compartas este enlace con otros usuarios.' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('INGRESAR A LA TERMINAL MILITAR')
                    .setStyle(ButtonStyle.Link)
                    .setURL(verifyLink)
                    .setEmoji('🌐')
            );

            return interaction.reply({
                embeds: [embed],
                components: [row],
                flags: MessageFlags.Ephemeral
            });
        }

        // =====================================================
        // BOTÓN: Registrarse en Convocatoria de Operación
        // =====================================================
        if (customId.startsWith('event_register_')) {
            const eventId = parseInt(customId.replace('event_register_', ''), 10);
            const username = interaction.user.tag || interaction.user.username;
            const res = economyDb.registerUserForEvent(eventId, interaction.user.id, username);

            if (!res.success) {
                return interaction.reply({
                    content: res.message,
                    flags: MessageFlags.Ephemeral
                });
            }

            const regEmbed = new EmbedBuilder()
                .setColor(0x00b4d8)
                .setTitle('🎖️ [INSCRIPCIÓN A OPERACIÓN REGISTRADA]')
                .setDescription(`
¡Atención combatiente! Has sido incorporado en la lista oficial de la operación militar.

> 📍 **Misión:** \`${res.event ? res.event.name : `#${eventId}`}\`
> 👤 **Recluta:** <@${interaction.user.id}> (\`${username}\`)
> 🛡️ **Estado:** \`REGISTRADO EN CONVOCATORIA (LISTO PARA EL DESPLIEGUE)\`

*Permanece atento para confirmar tu asistencia cuando el oficial abra el Pase de Lista.*
                `)
                .setFooter({ text: `Operación ID: #${eventId} • USMC Roster System` })
                .setTimestamp();

            return interaction.reply({
                embeds: [regEmbed],
                flags: MessageFlags.Ephemeral
            });
        }

        // =====================================================
        // BOTÓN: Anular Registro de Convocatoria
        // =====================================================
        if (customId.startsWith('event_unregister_')) {
            const eventId = parseInt(customId.replace('event_unregister_', ''), 10);
            const res = economyDb.unregisterUserFromEvent(eventId, interaction.user.id);

            return interaction.reply({
                content: res.message,
                flags: MessageFlags.Ephemeral
            });
        }

        // =====================================================
        // BOTÓN: Confirmar Asistencia Presencial (Pase de Lista)
        // =====================================================
        if (customId.startsWith('event_confirm_')) {
            const eventId = parseInt(customId.replace('event_confirm_', ''), 10);
            const username = interaction.user.tag || interaction.user.username;
            const res = economyDb.confirmAttendanceForEvent(eventId, interaction.user.id, username);

            if (!res.success) {
                return interaction.reply({
                    content: res.message,
                    flags: MessageFlags.Ephemeral
                });
            }

            const confEmbed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('✅ [ASISTENCIA CONFIRMADA // CLEARANCE DE PAGO]')
                .setDescription(`
¡Excelente trabajo, combatiente! Tu presencia en la operación militar ha sido validada.

> 📍 **Operación:** \`${res.event ? res.event.name : `#${eventId}`}\`
> 👤 **Soldado:** <@${interaction.user.id}>
> 🛡️ **Estado:** \`ASISTENCIA PRESENCIAL CONFIRMADA (APTO PARA PAGO)\`

*Podrás formalizar tu cobro tan pronto se libere la nómina militar.*
                `)
                .setFooter({ text: `Operación ID: #${eventId} • USMC Attendance System` })
                .setTimestamp();

            return interaction.reply({
                embeds: [confEmbed],
                flags: MessageFlags.Ephemeral
            });
        }

        // BOTÓN: Reclamar Paga Militar de Evento / Operación
        if (customId.startsWith('claim_event_')) {
            const eventId = parseInt(customId.replace('claim_event_', ''), 10);
            const userRoleIds = interaction.member.roles.cache.map(r => r.id);
            const res = economyDb.claimEventPayout(eventId, interaction.user.id, userRoleIds);

            if (!res.success) {
                return interaction.reply({
                    content: res.message,
                    flags: MessageFlags.Ephemeral
                });
            }

            const settings = economyDb.getEconomySettings(interaction.guildId);
            const sym = settings ? settings.currency_symbol : '$';

            const claimEmbed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('🎖️ [PAGA MILITAR ACREDITADA EXITOSAMENTE]')
                .setDescription(`
¡Enhorabuena, combatiente! Tu asistencia a la operación militar ha sido verificada y acreditada.

> 💰 **Paga Base:** \`${sym}${res.baseReward.toLocaleString()}\`
> 🎖️ **Escalafón Aplicado:** \`${res.bonusRole}\` (Multiplicador: x${res.multiplier})
> 💵 **Total Cobrado:** \`${sym}${res.amount.toLocaleString()}\`
> 💼 **Nuevo Saldo en Cartera:** \`${sym}${res.account.wallet.toLocaleString()}\`

*El registro de haberes ha sido archivado en la tesorería militar.*
                `)
                .setFooter({ text: 'Sistema Autónomo de Pagos de Operaciones USMC' })
                .setTimestamp();

            return interaction.reply({
                embeds: [claimEmbed],
                flags: MessageFlags.Ephemeral
            });
        }

        // =====================================================
        // BOTÓN: Paginación de Roster de Operación Convocada
        // =====================================================
        if (customId.startsWith('event_roster_page_')) {
            const parts = customId.replace('event_roster_page_', '').split('_');
            const eventId = parseInt(parts[0], 10);
            const page = parseInt(parts[1], 10) || 1;
            const event = economyDb.getEventById(eventId);
            if (!event) {
                return interaction.reply({ content: '❌ Operación militar no encontrada o ya finalizada.', flags: MessageFlags.Ephemeral });
            }
            const settings = economyDb.getEconomySettings(interaction.guildId);
            const panel = buildEventRosterPanel(event, page, settings);
            return interaction.update(panel);
        }

        // =====================================================
        // BOTÓN: Actualizar Roster de Operación Convocada
        // =====================================================
        if (customId.startsWith('event_roster_refresh_')) {
            const parts = customId.replace('event_roster_refresh_', '').split('_');
            const eventId = parseInt(parts[0], 10);
            const page = parseInt(parts[1], 10) || 1;
            const event = economyDb.getEventById(eventId);
            if (!event) {
                return interaction.reply({ content: '❌ Operación militar no encontrada o ya finalizada.', flags: MessageFlags.Ephemeral });
            }
            const settings = economyDb.getEconomySettings(interaction.guildId);
            const panel = buildEventRosterPanel(event, page, settings);
            return interaction.update(panel);
        }

        // =====================================================
        // BOTÓN: Expulsar / Dar de baja a recluta del pase de lista
        // =====================================================
        if (customId.startsWith('event_expel_')) {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({
                    content: '❌ **Acceso Denegado:** Solo el cuerpo de oficiales y administradores puede retirar soldados de la operación.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const parts = customId.replace('event_expel_', '').split('_');
            const eventId = parseInt(parts[0], 10);
            const targetDiscordId = parts[1];
            const page = parseInt(parts[2], 10) || 1;

            const expelRes = economyDb.expelUserFromEvent(eventId, targetDiscordId, interaction.user.id);
            if (!expelRes.success) {
                return interaction.reply({
                    content: `⚠️ ${expelRes.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const event = economyDb.getEventById(eventId);
            const settings = economyDb.getEconomySettings(interaction.guildId);
            const panel = buildEventRosterPanel(event, page, settings);

            await interaction.update(panel);
            return interaction.followUp({
                content: `🗑️ **Soldado Dado de Baja:** <@${targetDiscordId}> (\`${expelRes.username}\`) ha sido expulsado de la operación #${eventId}. No podrá confirmar asistencia ni recibir cobros.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // =====================================================
        // BOTÓN: Reclamar Bono Militar desde Panel Táctico
        // =====================================================
        if (customId.startsWith('claim_bonus_panel_')) {
            const panelId = parseInt(customId.replace('claim_bonus_panel_', ''), 10);
            const userRoleIds = interaction.member ? interaction.member.roles.cache.map(r => r.id) : [];
            const res = economyDb.claimPanelBonus(panelId, interaction.user.id, userRoleIds);

            if (!res.success) {
                return interaction.reply({
                    content: res.message,
                    flags: MessageFlags.Ephemeral
                });
            }

            const settings = economyDb.getEconomySettings(interaction.guildId || 'GLOBAL');
            const sym = settings ? settings.currency_symbol : '$';

            const claimEmbed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('🎖️ [ASIGNACIÓN DE BONO MILITAR ACREDITADA]')
                .setDescription(`
¡Enhorabuena, combatiente! Tu solicitud de cobro ha sido validada y transferida.

> 💰 **Asignación Acreditada:** \`${sym}${res.amount.toLocaleString()}\`
> 💼 **Nuevo Saldo en Cartera:** \`${sym}${res.account.wallet.toLocaleString()}\`
> 🏦 **Patrimonio Total:** \`${sym}${(res.account.wallet + res.account.bank).toLocaleString()}\`
> 📜 **Panel Militar:** \`${res.panel.title}\`
> ⏱️ **Modalidad:** \`${res.panel.claim_mode === 'ONCE' ? 'Asignación Única' : 'Concesión Periódica'}\`

*Firma de auditoría contable USMC generada.*
                `)
                .setFooter({ text: 'Tesorería Militar USMC • Asignaciones Extraordinarias' })
                .setTimestamp();

            return interaction.reply({
                embeds: [claimEmbed],
                flags: MessageFlags.Ephemeral
            });
        }

        // =====================================================
        // BOTONES DE TIENDA: Compra directa con 1 clic
        // =====================================================
        if (customId.startsWith('buy_shop_')) {
            const itemId = parseInt(customId.replace('buy_shop_', ''), 10);
            return processShopPurchase(interaction, itemId);
        }

        // BOTÓN: Ver Mi Inventario desde el panel de la tienda
        if (customId === 'btn_view_my_inventory') {
            const guildId = interaction.guildId || 'GLOBAL';
            const settings = economyDb.getEconomySettings(guildId);
            const sym = settings.currency_symbol || '$';
            const inventory = economyDb.getUserInventory(interaction.user.id);

            if (inventory.length === 0) {
                return interaction.reply({
                    content: '🎒 Tu mochila táctica está vacía. Usa los botones o el menú desplegable de arriba para comprar equipamiento.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const invEmbed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle(`🎒 [EQUIPAMIENTO E INVENTARIO // ${interaction.user.tag.toUpperCase()}]`)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setDescription('Lista de pertrechos, suministros e insignias en posesión:')
                .setFooter({ text: 'Logística USMC' })
                .setTimestamp();

            for (const row of inventory) {
                let extra = '';
                if (row.roles_to_give && row.roles_to_give.length > 0) {
                    extra += ` • Rango: ${row.roles_to_give.map(r => `<@&${r}>`).join(' ')}`;
                }
                invEmbed.addFields({
                    name: `${row.icon || '🎖️'} ${row.name} (x${row.quantity})`,
                    value: `*${row.description || 'Sin descripción'}*\n> 🏷️ Valor de catálogo: \`${sym}${row.price.toLocaleString()}\`${extra}`,
                    inline: false
                });
            }

            return interaction.reply({ embeds: [invEmbed], flags: MessageFlags.Ephemeral });
        }

        // BOTÓN: Ver Mi Saldo desde la tienda
        if (customId === 'btn_view_shop_balance') {
            const guildId = interaction.guildId || 'GLOBAL';
            const settings = economyDb.getEconomySettings(guildId);
            const sym = settings ? settings.currency_symbol : '$';
            const acc = economyDb.getAccount(interaction.user.id, guildId);

            const balEmbed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle(`💵 [ESTADO DE CUENTA // ${interaction.user.tag.toUpperCase()}]`)
                .setDescription(`
> 💵 **Cartera (Efectivo):** \`${sym}${acc.wallet.toLocaleString()}\`
> 🏦 **Caja Fuerte (Banco):** \`${sym}${acc.bank.toLocaleString()}\`
> 💎 **Patrimonio Neto:** \`${sym}${(acc.wallet + acc.bank).toLocaleString()}\`
                `)
                .setFooter({ text: 'Tesorería Militar USMC' });

            return interaction.reply({ embeds: [balEmbed], flags: MessageFlags.Ephemeral });
        }

        // BOTÓN: Navegación de Páginas en Tienda Militar
        if (customId.startsWith('shop_page_')) {
            const page = parseInt(customId.replace('shop_page_', ''), 10) || 1;
            const guildId = interaction.guildId || 'GLOBAL';
            const panel = buildShopPanel(guildId, page);
            return interaction.update(panel);
        }

        // BOTÓN: Actualizar Catálogo de la Tienda
        if (customId === 'btn_refresh_shop' || customId.startsWith('shop_refresh_')) {
            const guildId = interaction.guildId || 'GLOBAL';
            const page = customId.startsWith('shop_refresh_') ? parseInt(customId.replace('shop_refresh_', ''), 10) : 1;
            const panel = buildShopPanel(guildId, page);
            return interaction.update(panel);
        }

        // BOTÓN: Aprobar Solicitud en Canal de Oficiales
        if (customId.startsWith('approve_verify_')) {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({ 
                    content: '❌ **Acceso denegado:** Solo oficiales con el rol autorizado en el panel web o administradores pueden dictaminar expedientes.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const targetDiscordId = customId.replace('approve_verify_', '');
            const updated = db.updateVerificationStatus(targetDiscordId, 'APROBADO', interaction.user.id, 'Aprobado vía Discord por oficial');
            
            await handleStatusChange(client, interaction.guildId, updated, 'APROBADO', null, interaction.user.tag);

            // Actualizar mensaje de oficiales
            const currentEmbed = interaction.message.embeds[0];
            const newEmbed = EmbedBuilder.from(currentEmbed)
                .setColor(0x38e54d)
                .setTitle(`✅ [EXPEDIENTE APROBADO] // ${updated.username.toUpperCase()}`)
                .addFields({ name: '🎖️ Dictamen', value: `Aprobado por <@${interaction.user.id}>`, inline: false });

            await interaction.update({ embeds: [newEmbed], components: [] });
            return;
        }

        // BOTÓN: Denegar Solicitud (Abre Modal de Motivo)
        if (customId.startsWith('reject_verify_')) {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({ 
                    content: '❌ **Acceso denegado:** Solo oficiales con el rol autorizado en el panel web o administradores pueden dictaminar expedientes.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const targetDiscordId = customId.replace('reject_verify_', '');

            const modal = new ModalBuilder()
                .setCustomId(`modal_reject_${targetDiscordId}`)
                .setTitle('DENEGACIÓN DE EXPEDIENTE MILITAR');

            const reasonInput = new TextInputBuilder()
                .setCustomId('reject_reason')
                .setLabel('MOTIVO DEL RECHAZO:')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Ej: Respuestas insuficientes, sospecha de cuenta secundaria, etc.')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            return interaction.showModal(modal);
        }
    }

    // =====================================================
    // 2.5. Manejo de Menú Desplegable de la Tienda
    // =====================================================
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_buy_shop') {
            const itemId = parseInt(interaction.values[0], 10);
            return processShopPurchase(interaction, itemId);
        }
    }

    // 3. Manejo de Respuestas de Modal (Rechazo con motivo)
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('modal_reject_')) {
            const targetDiscordId = interaction.customId.replace('modal_reject_', '');
            const reason = interaction.fields.getTextInputValue('reject_reason');

            const updated = db.updateVerificationStatus(targetDiscordId, 'RECHAZADO', interaction.user.id, reason);

            await handleStatusChange(client, interaction.guildId, updated, 'RECHAZADO', reason, interaction.user.tag);

            // Actualizar mensaje original de oficiales si está disponible
            if (interaction.message) {
                const currentEmbed = interaction.message.embeds[0];
                const newEmbed = EmbedBuilder.from(currentEmbed)
                    .setColor(0xff3333)
                    .setTitle(`❌ [EXPEDIENTE DENEGADO] // ${updated.username.toUpperCase()}`)
                    .addFields(
                        { name: '🎖️ Dictamen', value: `Denegado por <@${interaction.user.id}>`, inline: true },
                        { name: '📋 Motivo', value: reason, inline: false }
                    );

                await interaction.update({ embeds: [newEmbed], components: [] });
            } else {
                await interaction.reply({ content: `❌ **Expediente de <@${targetDiscordId}> denegado.** Se notificó al usuario.`, flags: MessageFlags.Ephemeral });
            }
        }
    }
}

module.exports = { handleInteraction };
