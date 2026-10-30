const { withGuild } = require('../../database/guildContext');
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
const { hasOfficerPermission, hasAdminPermission, grantConfiguredCommandPermission } = require('./permissionHandler');
const { hasAnyRole } = require('../utils/roleUtils');
const { processShopPurchase, buildShopPanel } = require('../commands/tienda');
const {
    buildEventRosterPanel,
    buildEventFinalizationPanel,
    completeEventFinalization,
    EVENT_REPORT_TEAMS
} = require('../commands/eventos');
const { buildPrivateServersPanel, refreshPublicServerBoard } = require('../commands/servidor');
const { buildHelpPanel } = require('../commands/help');

function getFinalizationContext(interaction, eventId) {
    if (!hasOfficerPermission(interaction)) return { error: '❌ Solo oficiales y administradores pueden editar este registro.' };
    const event = economyDb.getEventById(eventId);
    if (!event || (event.guild_id !== interaction.guildId && event.guild_id !== 'GLOBAL')) {
        return { error: '❌ Evento no encontrado en este servidor.' };
    }
    const draft = economyDb.getEventFinalizationDraft(eventId);
    if (!draft) return { error: '⚠️ Este panel ya no está disponible. Ejecuta `/evento finalizar` nuevamente.' };
    if (draft.requested_by && draft.requested_by !== interaction.user.id && !interaction.memberPermissions?.has('Administrator')) {
        return { error: '⚠️ Este panel pertenece al oficial que inició la finalización.' };
    }
    return { event, draft };
}

function saveFinalizationPanel(interaction, event, draft) {
    economyDb.saveEventFinalizationDraft(event.id, draft);
    return interaction.update(buildEventFinalizationPanel(event, draft));
}

async function handleInteraction(interaction, client, commands) {
    // 1. Manejo de Comandos Slash
    if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;

        try {
            // La matriz del panel web funciona como una compuerta general y
            // permite controlar también cada subcomando individualmente.
            const subcommand = typeof interaction.options.getSubcommand === 'function'
                ? interaction.options.getSubcommand(false)
                : null;
            const subcommandGroup = typeof interaction.options.getSubcommandGroup === 'function'
                ? interaction.options.getSubcommandGroup(false)
                : null;
            const commandPermissionKey = subcommand
                ? `${interaction.commandName}:${subcommandGroup ? `${subcommandGroup}:` : ''}${subcommand}`
                : interaction.commandName;

            const effectivePermission = economyDb.isCommandAllowed(commandPermissionKey, interaction.member);
            // Cada comando conserva además sus validaciones específicas
            // (oficial, administrador o permisos nativos de Discord).
            if (!effectivePermission.allowed) {
                const denial = {
                    content: effectivePermission.reason === 'DISABLED'
                        ? `🔒 **Protocolo Inactivo:** El comando \`/${commandPermissionKey.replaceAll(':', ' ')}\` se encuentra temporalmente deshabilitado por el Estado Mayor.`
                        : `🔒 **Acceso Denegado:** Tu rango militar actual no cuenta con la autorización requerida para ejecutar \`/${commandPermissionKey.replaceAll(':', ' ')}\`.`,
                    flags: MessageFlags.Ephemeral
                };
                return interaction.deferred ? interaction.editReply({ content: denial.content, allowedMentions: { parse: [] } }) : interaction.reply(denial);
            }

            // El rol configurado para esta clave exacta satisface las barreras
            // internas de oficial/admin durante esta interacción solamente.
            if (effectivePermission.grantedByRole) {
                grantConfiguredCommandPermission(interaction);
            }

            await command.execute(interaction);
        } catch (error) {
            console.error(`[Comando Error: ${interaction.commandName}]`, { code: error.code, message: error.message, ageMs: Date.now() - interaction.createdTimestamp });
            const msg = { content: '❌ Error en la ejecución del protocolo militar.', flags: MessageFlags.Ephemeral };
            if (interaction.deferred) {
                await interaction.editReply({ content: msg.content, allowedMentions: { parse: [] } }).catch(() => {});
            } else if (interaction.replied) {
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
        const serverPage = customId.match(/^srv_page_(-?\d+)$/);
        if (serverPage) return interaction.update(buildPrivateServersPanel(interaction.guildId || 'GLOBAL', Number(serverPage[1])));
        const shopConfirm = customId.match(/^shop_confirm_(\d+)_(\d+)_(\d+)$/);
        if (shopConfirm) {
            if (shopConfirm[2] !== interaction.user.id) return interaction.reply({ content: 'Esta compra pertenece a otro usuario.', flags: MessageFlags.Ephemeral });
            return processShopPurchase(interaction, Number(shopConfirm[1]), true, Number(shopConfirm[3]));
        }
        if (customId === 'shop_cancel_purchase') return interaction.update({ content: 'Compra cancelada.', embeds: [], components: [] });

        if (customId === 'srv_board_refresh') {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({ content: '❌ Solo oficiales pueden actualizar el panel.', flags: MessageFlags.Ephemeral });
            }
            const panel = buildPrivateServersPanel(interaction.guildId || 'GLOBAL');
            return interaction.update(panel);
        }

        if (customId === 'srv_release_all_mine') {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({ content: '❌ Solo oficiales pueden usar este control.', flags: MessageFlags.Ephemeral });
            }
            const guildId = interaction.guildId || 'GLOBAL';
            const servers = db.getPrivateServers(guildId);
            const mine = servers.filter(s => s.status === 'EN_USO' && s.current_officer_id === interaction.user.id);
            if (mine.length === 0) {
                return interaction.reply({ content: 'ℹ️ No tienes ningún servidor privado marcado como en uso en este momento.', flags: MessageFlags.Ephemeral });
            }
            for (const s of mine) {
                db.releasePrivateServer(s.id);
            }
            await interaction.deferUpdate();
            await refreshPublicServerBoard(interaction.client, guildId);
            const panel = buildPrivateServersPanel(guildId);
            return interaction.editReply(panel);
        }

        const finalizationButton = customId.match(/^event_finalize_(prev|next|clear|confirm|cancel|tactical|ids)_(\d+)$/);
        if (finalizationButton) {
            const action = finalizationButton[1];
            const eventId = Number(finalizationButton[2]);
            const context = getFinalizationContext(interaction, eventId);
            if (context.error) return interaction.reply({ content: context.error, flags: MessageFlags.Ephemeral });
            const { event, draft } = context;

            if (action === 'cancel') {
                economyDb.saveEventFinalizationDraft(eventId, null);
                return interaction.update({
                    content: `🛑 Edición/finalización del evento **#${eventId}** cancelada.`,
                    embeds: [],
                    components: []
                });
            }
            if (action === 'confirm') {
                if (event.status !== 'ACTIVE' && event.event_type !== 'TRAINING' && !draft.is_editing_report) {
                    return interaction.reply({ content: '⚠️ Este evento ya fue finalizado. Usa `/evento editar-reporte` si deseas modificar su acta.', flags: MessageFlags.Ephemeral });
                }
                await interaction.deferUpdate();
                return completeEventFinalization(interaction, event);
            }
            if (action === 'tactical') {
                const modal = new ModalBuilder()
                    .setCustomId(`event_finalize_tactical_modal_${eventId}`)
                    .setTitle(`APARTADOS TÁCTICOS BRM 5 // #${eventId}`);

                const sectorInput = new TextInputBuilder()
                    .setCustomId('sector_ao')
                    .setLabel('SECTOR / ZONA DE OPERACIÓN (AO):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ej: Ronograd Naval Base / Bunker / FOB')
                    .setValue(String(draft.sector_ao || 'Ronograd Island').slice(0, 100))
                    .setRequired(false);

                const serverRatingVal = [draft.server_used || '', draft.mission_rating || '✅ OPERACIÓN EXITOSA'].filter(Boolean).join(' | ');
                const serverRatingInput = new TextInputBuilder()
                    .setCustomId('server_and_rating')
                    .setLabel('SERVIDOR PRIVADO | CALIFICACIÓN (Separar |):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ej: Servidor Alpha-1 | 🌟 ÉXITO TOTAL (S+)')
                    .setValue(serverRatingVal.slice(0, 120))
                    .setRequired(false);

                const casualtiesInput = new TextInputBuilder()
                    .setCustomId('casualties_stats')
                    .setLabel('BAJAS Y ESTADÍSTICAS DE COMBATE:')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ej: Hostiles abatidos: 45 | Bajas aliadas: 0 | VIP extraído')
                    .setValue(String(draft.casualties_stats || '').slice(0, 150))
                    .setRequired(false);

                const resultInput = new TextInputBuilder()
                    .setCustomId('result')
                    .setLabel('OBJETIVOS Y ANÁLISIS DE LA OPERACIÓN:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Describe los objetivos cumplidos, maniobras y desarrollo táctico...')
                    .setValue(String(draft.result || '').slice(0, 900))
                    .setRequired(false);

                const notesInput = new TextInputBuilder()
                    .setCustomId('notes')
                    .setLabel('OBSERVACIONES DEL MANDO / NOTAS:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Observaciones disciplinarias, menciones o notas finales...')
                    .setValue(String(draft.notes || '').slice(0, 900))
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(sectorInput),
                    new ActionRowBuilder().addComponents(serverRatingInput),
                    new ActionRowBuilder().addComponents(casualtiesInput),
                    new ActionRowBuilder().addComponents(resultInput),
                    new ActionRowBuilder().addComponents(notesInput)
                );
                return interaction.showModal(modal);
            }
            if (action === 'ids') {
                const activeTeamObj = EVENT_REPORT_TEAMS.find(t => t.key === draft.active_team) || EVENT_REPORT_TEAMS[0];
                const currentTeamIds = (draft.teams?.[activeTeamObj.key]?.members || []).join(', ');

                const modal = new ModalBuilder()
                    .setCustomId(`event_finalize_ids_modal_${eventId}_${draft.active_team || 'alpha'}`)
                    .setTitle(`CONFIGURAR POR IDs // #${eventId}`);

                const addIdsInput = new TextInputBuilder()
                    .setCustomId('add_ids')
                    .setLabel('AÑADIR APROBADOS / PARTICIPANTES (IDs):')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Pega IDs o menciones separados por coma o espacio para añadirlos a la lista')
                    .setRequired(false);

                const removeIdsInput = new TextInputBuilder()
                    .setCustomId('remove_ids')
                    .setLabel('RETIRAR / NO APROBADOS (IDs):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Pega IDs de quienes reprobaron o deben ser retirados')
                    .setRequired(false);

                const teamIdsInput = new TextInputBuilder()
                    .setCustomId('team_ids')
                    .setLabel(`IDs PARA ${activeTeamObj.label.toUpperCase()} (1° = Líder):`)
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Pega los IDs de esta escuadra (el primer ID quedará como Líder)')
                    .setValue(currentTeamIds.slice(0, 4000))
                    .setRequired(false);

                const coHostInput = new TextInputBuilder()
                    .setCustomId('co_host_id')
                    .setLabel('SEGUNDO AL MANDO / XO / PILOTO (ID o Nombre):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ID de Discord del Segundo al Mando')
                    .setValue(String(draft.co_host_id || '').slice(0, 80))
                    .setRequired(false);

                const mvpInput = new TextInputBuilder()
                    .setCustomId('mvp_id')
                    .setLabel('MENCIÓN HONORÍFICA / SOLDADO DESTACADO (ID):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ID de Discord del combatiente más destacado')
                    .setValue(String(draft.mvp_id || '').slice(0, 80))
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(addIdsInput),
                    new ActionRowBuilder().addComponents(removeIdsInput),
                    new ActionRowBuilder().addComponents(teamIdsInput),
                    new ActionRowBuilder().addComponents(coHostInput),
                    new ActionRowBuilder().addComponents(mvpInput)
                );
                return interaction.showModal(modal);
            }
            if (action === 'prev' || action === 'next') {
                const roster = economyDb.getEventRegistrations(event.id);
                const totalPages = Math.max(1, Math.ceil(roster.length / 25));
                if (action === 'next') {
                    draft.member_page = ((Number(draft.member_page) || 0) + 1) % totalPages;
                } else {
                    draft.member_page = Math.max(0, (Number(draft.member_page) || 0) - 1);
                }
            }
            if (action === 'clear') {
                draft.teams ||= {};
                draft.teams[draft.active_team] = { members: [], leader_id: null };
            }
            return saveFinalizationPanel(interaction, event, draft);
        }

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
                .setTitle(res.event?.event_type === 'TRAINING' ? '🎓 [INSCRIPCIÓN A ENTRENAMIENTO REGISTRADA]' : '🎖️ [INSCRIPCIÓN A OPERACIÓN REGISTRADA]')
                .setDescription(`
¡Atención combatiente! Has sido incorporado en la lista oficial de la operación militar.

> 📍 **Misión:** \`${res.event ? res.event.name : `#${eventId}`}\`
> 👤 **Recluta:** <@${interaction.user.id}> (\`${username}\`)
> 🛡️ **Estado:** \`${res.event?.event_type === 'TRAINING' ? 'REGISTRADO EN ENTRENAMIENTO' : 'REGISTRADO EN CONVOCATORIA (LISTO PARA EL DESPLIEGUE)'}\`

*${res.event?.event_type === 'TRAINING' ? 'Si apruebas y permaneces en la lista final, recibirás el rol configurado.' : 'Si permaneces en la lista final, recibirás tu paga automáticamente al cerrar la operación.'}*
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
            const consequence = event.event_type === 'TRAINING'
                ? 'No recibirá el rol al finalizar.'
                : 'No será incluido en la liquidación automática.';
            return interaction.followUp({
                content: `🗑️ **Soldado Dado de Baja:** <@${targetDiscordId}> (\`${expelRes.username}\`) ha sido retirado del evento #${eventId}. ${consequence}`,
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
            const panel = buildShopPanel(guildId, page, customId.split('_')[3] || 'all');
            return interaction.update(panel);
        }

        // BOTÓN: Actualizar Catálogo de la Tienda
        if (customId === 'btn_refresh_shop' || customId.startsWith('shop_refresh_')) {
            const guildId = interaction.guildId || 'GLOBAL';
            const page = customId.startsWith('shop_refresh_') ? parseInt(customId.replace('shop_refresh_', ''), 10) : 1;
            const panel = buildShopPanel(guildId, page, customId.split('_')[3] || 'all');
            return interaction.update(panel);
        }

        // BOTÓN: Paginación e Inicio de /help
        if (customId.startsWith('help_page_') || customId.startsWith('help_refresh_')) {
            const page = parseInt(customId.replace('help_page_', '').replace('help_refresh_', ''), 10) || 1;
            const panel = buildHelpPanel(page, interaction.guildId);
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
            const updated = db.updateVerificationStatus(targetDiscordId, 'APROBADO', interaction.user.id, 'Aprobado vía Discord por oficial', interaction.user.tag);
            
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
        if (interaction.customId === 'shop_category') return interaction.update(buildShopPanel(interaction.guildId || 'GLOBAL', 1, interaction.values[0]));
        const finalizationSelect = interaction.customId.match(/^event_finalize_(team|members|leader)_(\d+)$/);
        if (finalizationSelect) {
            const action = finalizationSelect[1];
            const eventId = Number(finalizationSelect[2]);
            const context = getFinalizationContext(interaction, eventId);
            if (context.error) return interaction.reply({ content: context.error, flags: MessageFlags.Ephemeral });
            const { event, draft } = context;
            draft.teams ||= {};

            if (action === 'team') {
                if (interaction.values[0] === '__clear_team') {
                    draft.teams ||= {};
                    draft.teams[draft.active_team || 'alpha'] = { members: [], leader_id: null };
                    return saveFinalizationPanel(interaction, event, draft);
                }
                draft.active_team = interaction.values[0];
                draft.member_page = 0;
                draft.teams[draft.active_team] ||= { members: [], leader_id: null };
            }

            if (action === 'members') {
                const activeKey = draft.active_team || 'alpha';
                const roster = economyDb.getEventRegistrations(eventId);
                const page = Math.max(0, Number(draft.member_page) || 0);
                const pageIds = new Set(roster.slice(page * 25, (page + 1) * 25).map(member => String(member.discord_id)));
                const selectedIds = interaction.values.map(String);
                const selectedSet = new Set(selectedIds);
                const current = draft.teams[activeKey] || { members: [], leader_id: null };
                const preserved = (current.members || []).map(String).filter(memberId => !pageIds.has(memberId));
                const nextMembers = [...new Set([...preserved, ...selectedIds])];

                for (const [teamKey, team] of Object.entries(draft.teams)) {
                    if (teamKey === activeKey) continue;
                    team.members = (team.members || []).map(String).filter(memberId => !selectedSet.has(memberId));
                    if (team.leader_id && !team.members.includes(String(team.leader_id))) team.leader_id = null;
                }
                draft.teams[activeKey] = {
                    members: nextMembers,
                    leader_id: current.leader_id && nextMembers.includes(String(current.leader_id)) ? String(current.leader_id) : null
                };
            }

            if (action === 'leader') {
                const activeKey = draft.active_team || 'alpha';
                draft.teams[activeKey] ||= { members: [], leader_id: null };
                const selectedLeader = String(interaction.values[0]);
                draft.teams[activeKey].leader_id = draft.teams[activeKey].members.map(String).includes(selectedLeader)
                    ? selectedLeader
                    : null;
            }

            return saveFinalizationPanel(interaction, event, draft);
        }

        if (interaction.customId === 'srv_quick_toggle_select') {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({ content: '❌ Solo oficiales pueden gestionar servidores privados.', flags: MessageFlags.Ephemeral });
            }
            const serverId = parseInt(interaction.values[0], 10);
            const srv = db.getPrivateServerById(serverId, interaction.guildId || 'GLOBAL');
            if (!srv) {
                return interaction.reply({ content: '❌ Servidor no encontrado.', flags: MessageFlags.Ephemeral });
            }

            if (srv.status === 'EN_USO') {
                if (srv.current_officer_id && srv.current_officer_id !== interaction.user.id && !hasAdminPermission(interaction)) {
                    return interaction.reply({
                        content: `🔴 **${srv.server_name}** está siendo usado por <@${srv.current_officer_id}> (*${srv.current_mission}*). Solo ese oficial o un Administrador puede liberarlo.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                db.releasePrivateServer(serverId, interaction.guildId || 'GLOBAL');
                await interaction.deferUpdate();
                await refreshPublicServerBoard(interaction.client, interaction.guildId || 'GLOBAL');
                const panel = buildPrivateServersPanel(interaction.guildId || 'GLOBAL');
                return interaction.editReply(panel);
            }

            const modal = new ModalBuilder()
                .setCustomId(`srv_occupy_modal_${serverId}`)
                .setTitle(`OCUPAR: ${srv.server_name}`.slice(0, 45));

            const missionInput = new TextInputBuilder()
                .setCustomId('mission_name')
                .setLabel('OPERACIÓN / PATRULLAJE A REALIZAR:')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ej: Patrullaje Sector Ronograd / Entrenamiento CQB')
                .setValue('Operación / Patrullaje BRM 5')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(missionInput));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'event_roster_select') {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({ content: '❌ Solo oficiales y administradores pueden consultar este roster.', flags: MessageFlags.Ephemeral });
            }
            const eventId = parseInt(interaction.values[0], 10);
            const event = economyDb.getEventById(eventId);
            if (!event || (event.guild_id !== interaction.guildId && event.guild_id !== 'GLOBAL')) {
                return interaction.reply({ content: '❌ Evento no encontrado en este servidor.', flags: MessageFlags.Ephemeral });
            }
            const settings = economyDb.getEconomySettings(interaction.guildId);
            return interaction.update(buildEventRosterPanel(event, 1, settings));
        }

        if (interaction.customId === 'select_buy_shop') {
            const itemId = parseInt(interaction.values[0], 10);
            return processShopPurchase(interaction, itemId);
        }

        if (interaction.customId === 'help_category_select') {
            const page = parseInt(interaction.values[0], 10) || 1;
            const panel = buildHelpPanel(page, interaction.guildId);
            return interaction.update(panel);
        }
    }

    if (interaction.isUserSelectMenu()) {
        const teamLeader = interaction.customId.match(/^event_finalize_leader_(\d+)$/);
        if (teamLeader) {
            const context = getFinalizationContext(interaction, Number(teamLeader[1]));
            if (context.error) return interaction.reply({ content: context.error, flags: MessageFlags.Ephemeral });
            const { event, draft } = context;
            const team = draft.teams?.[draft.active_team || 'alpha'];
            const selected = String(interaction.values[0]);
            if (!team?.members.map(String).includes(selected)) return interaction.reply({ content: 'El líder debe ser integrante del equipo seleccionado.', flags: MessageFlags.Ephemeral });
            team.leader_id = selected;
            return saveFinalizationPanel(interaction, event, draft);
        }
        const directorSelect = interaction.customId.match(/^event_finalize_director_(\d+)$/);
        if (directorSelect) {
            const eventId = Number(directorSelect[1]);
            const context = getFinalizationContext(interaction, eventId);
            if (context.error) return interaction.reply({ content: context.error, flags: MessageFlags.Ephemeral });
            const { event, draft } = context;
            const directorId = String(interaction.values[0]);
            const selectedMember = interaction.members?.get?.(directorId)
                || await interaction.guild.members.fetch(directorId).catch(() => null);
            const selectedUser = interaction.users?.get?.(directorId);
            draft.director_id = directorId;
            draft.director_name = selectedMember?.displayName || selectedUser?.globalName || selectedUser?.username || directorId;
            return saveFinalizationPanel(interaction, event, draft);
        }
    }

    // 3. Manejo de Respuestas de Modal
    if (interaction.isModalSubmit()) {
        const srvOccupyModal = interaction.customId.match(/^srv_occupy_modal_(\d+)$/);
        if (srvOccupyModal) {
            const serverId = Number(srvOccupyModal[1]);
            const missionName = interaction.fields.getTextInputValue('mission_name') || 'Operación BRM 5';
            const officerName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
            if (!hasOfficerPermission(interaction)) return interaction.reply({ content: 'No tienes permiso para ocupar servidores.', flags: MessageFlags.Ephemeral });
            const result = db.occupyPrivateServer(serverId, interaction.user.id, officerName, missionName, null, interaction.guildId || 'GLOBAL');
            if (!result.success) return interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
            if (interaction.message) await interaction.deferUpdate();
            else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await refreshPublicServerBoard(interaction.client, interaction.guildId || 'GLOBAL');
            const panel = buildPrivateServersPanel(interaction.guildId || 'GLOBAL');
            if (interaction.message) {
                return interaction.editReply(panel);
            }
            return interaction.editReply({ content: `☑️ Servidor #${serverId} marcado como **ESTÁ USADO** (${missionName}).`, flags: MessageFlags.Ephemeral });
        }

        const tacticalModal = interaction.customId.match(/^event_finalize_tactical_modal_(\d+)$/);
        if (tacticalModal) {
            const eventId = Number(tacticalModal[1]);
            const context = getFinalizationContext(interaction, eventId);
            if (context.error) return interaction.reply({ content: context.error, flags: MessageFlags.Ephemeral });
            const { event, draft } = context;

            const sectorAo = interaction.fields.getTextInputValue('sector_ao').trim();
            const serverAndRating = interaction.fields.getTextInputValue('server_and_rating').trim();
            const casualtiesStats = interaction.fields.getTextInputValue('casualties_stats').trim();
            const resultText = interaction.fields.getTextInputValue('result').trim();
            const notesText = interaction.fields.getTextInputValue('notes').trim();

            if (sectorAo) draft.sector_ao = sectorAo;
            if (serverAndRating) {
                const parts = serverAndRating.split('|').map(s => s.trim()).filter(Boolean);
                if (parts.length >= 2) {
                    draft.server_used = parts[0];
                    draft.mission_rating = parts.slice(1).join(' | ');
                } else if (parts.length === 1) {
                    if (/servidor|alpha|bravo|charlie|vip|brm/i.test(parts[0])) {
                        draft.server_used = parts[0];
                    } else {
                        draft.mission_rating = parts[0];
                    }
                }
            } else {
                draft.server_used = '';
            }

            draft.casualties_stats = casualtiesStats;
            draft.result = resultText;
            draft.notes = notesText;

            economyDb.saveEventFinalizationDraft(event.id, draft);
            if (interaction.message) {
                return interaction.update(buildEventFinalizationPanel(event, draft));
            }
            return interaction.reply({ ...buildEventFinalizationPanel(event, draft), flags: MessageFlags.Ephemeral });
        }

        const idsModal = interaction.customId.match(/^event_finalize_ids_modal_(\d+)(?:_([a-z_]+))?$/);
        if (idsModal) {
            const eventId = Number(idsModal[1]);
            const context = getFinalizationContext(interaction, eventId);
            if (context.error) return interaction.reply({ content: context.error, flags: MessageFlags.Ephemeral });
            const { event, draft } = context;
            if (interaction.message) await interaction.deferUpdate();
            else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const rawAddIds = interaction.fields.getTextInputValue('add_ids') || '';
            const rawRemoveIds = interaction.fields.getTextInputValue('remove_ids') || '';
            const rawTeamIds = interaction.fields.getTextInputValue('team_ids') || '';
            const coHostVal = (interaction.fields.getTextInputValue('co_host_id') || '').trim();
            const mvpVal = (interaction.fields.getTextInputValue('mvp_id') || '').trim();

            const extractDiscordIds = (text) => [...new Set((String(text).match(/\d{15,22}/g) || []).map(String))];
            const addIds = extractDiscordIds(rawAddIds);
            const removeIds = extractDiscordIds(rawRemoveIds);
            const teamIds = extractDiscordIds(rawTeamIds);

            // Asegurar que todos los IDs de equipo también estén como aprobados en el evento
            const allIdsToEnsure = [...new Set([...addIds, ...teamIds])];
            const usernamesMap = {};
            if (interaction.guild) {
                for (const id of allIdsToEnsure) {
                    const member = interaction.guild.members.cache.get(id) || await interaction.guild.members.fetch(id).catch(() => null);
                    if (member) {
                        usernamesMap[id] = member.displayName || member.user.username;
                    }
                }
            }

            if (allIdsToEnsure.length > 0 || removeIds.length > 0) {
                economyDb.syncEventParticipantsByIds(eventId, allIdsToEnsure, removeIds, usernamesMap);
            }

            if (rawTeamIds.trim().length > 0) {
                const activeKey = idsModal[2] || draft.active_team || 'alpha';
                draft.teams ||= {};
                const selectedSet = new Set(teamIds);
                for (const [tKey, tData] of Object.entries(draft.teams)) {
                    if (tKey === activeKey) continue;
                    tData.members = (tData.members || []).map(String).filter(mId => !selectedSet.has(mId));
                    if (tData.leader_id && !tData.members.includes(String(tData.leader_id))) tData.leader_id = null;
                }
                draft.teams[activeKey] = {
                    members: teamIds,
                    leader_id: teamIds[0] || null
                };
            }

            const removed = new Set(removeIds);
            for (const team of Object.values(draft.teams || {})) {
                team.members = (team.members || []).map(String).filter(id => !removed.has(id));
                if (!team.members.includes(String(team.leader_id))) team.leader_id = null;
            }
            draft.co_host_id = coHostVal;
            draft.mvp_id = mvpVal;

            economyDb.saveEventFinalizationDraft(event.id, draft);
            return interaction.editReply(buildEventFinalizationPanel(event, draft));
        }

        if (interaction.customId.startsWith('modal_reject_')) {
            const targetDiscordId = interaction.customId.replace('modal_reject_', '');
            const reason = interaction.fields.getTextInputValue('reject_reason');

            const updated = db.updateVerificationStatus(targetDiscordId, 'RECHAZADO', interaction.user.id, reason, interaction.user.tag);

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

async function dispatchInteraction(interaction, ...args) {
    if (!interaction.guildId) return interaction.reply({ content: 'Usa este comando dentro de un servidor.', flags: 64 });
    const receivedAgeMs = Date.now() - interaction.createdTimestamp;
    if (receivedAgeMs > 2500) console.warn('[Late interaction]', { id: interaction.id, command: interaction.commandName,
        customId: interaction.customId, receivedAgeMs, phase: 'received-before-bootstrap' });
    // An assistant invocation never opens a modal. Acknowledge it before any
    // database bootstrapping, permission checks or provider work can delay it.
    if (interaction.commandName === 'asistente' && interaction.isChatInputCommand?.() && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    return withGuild(interaction.guildId, () => {
        require('../../database/communityDb').ensureCommunity(interaction.guildId, interaction.guild?.name);
        return handleInteraction(interaction, ...args);
    });
}
module.exports = { handleInteraction: dispatchInteraction };
