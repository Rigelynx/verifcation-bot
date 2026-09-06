const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    MessageFlags 
} = require('discord.js');
const economyDb = require('../../database/economyDb');
const { hasOfficerPermission } = require('../handlers/permissionHandler');
const { finishAndPublishEvent } = require('../handlers/eventTracker');

/**
 * Genera el mensaje táctico del Panel de Registro / Convocatoria Militar
 */
function buildRegistrationPanel(event, settings = null) {
    const sym = settings ? settings.currency_symbol : '$';
    const maxRecruitsText = event.max_participants > 0 ? `\`${event.max_participants} soldados\`` : '`Sin Límite (Ilimitado)`';

    const embed = new EmbedBuilder()
        .setColor(0x00b4d8) // Tactical Blue
        .setTitle(`📋 [CONVOCATORIA MILITAR DE OPERACIÓN // ${event.name.toUpperCase()}]`)
        .setDescription(`
**El Mando Supremo de la Base USMC ha abierto la lista de alistamiento para la misión.**

Todos los combatientes interesados en participar y hacerse acreedores a la asignación presupuestaria deben formalizar su inscripción pulsando el botón táctico inferior.

> 🎖️ **Misión:** \`${event.name}\`
> 💰 **Paga de Misión:** \`${sym}${event.base_reward.toLocaleString()}\` *(+ Bonificación por Rango Militar)*
> 👥 **Cupo de Escuadrón:** ${maxRecruitsText}
> ⏱️ **Vigencia de Cobro:** \`${event.claim_deadline_hours || 24} horas\` tras finalizar
> 🛡️ **Fase Actual:** \`CONVOCATORIA Y ALISTAMIENTO ACTIVO\`
        `)
        .addFields(
            { 
                name: '📌 Instrucciones Tácticas', 
                value: '1. Pulsa **`[ 📝 REGISTRARSE EN LA OPERACIÓN ]`** para entrar en la lista previa.\n2. Al concluir el evento, el oficial abrirá el **Pase de Lista** para confirmar tu presencia.\n3. Una vez confirmada tu asistencia, podrás cobrar tus créditos.', 
                inline: false 
            }
        )
        .setFooter({ text: `Operación ID: #${event.id} • USMC Tactical Roster System` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`event_register_${event.id}`)
            .setLabel('REGISTRARSE EN LA OPERACIÓN')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📝'),
        new ButtonBuilder()
            .setCustomId(`event_unregister_${event.id}`)
            .setLabel('ANULAR REGISTRO')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
    );

    return { embeds: [embed], components: [row] };
}

/**
 * Genera el mensaje táctico del Panel de Confirmación de Asistencia (Pase de Lista)
 */
function buildConfirmationPanel(event, settings = null) {
    const embed = new EmbedBuilder()
        .setColor(0xffb000) // Tactical Amber / Warning
        .setTitle(`📍 [PASE DE LISTA // CONFIRMAR ASISTENCIA // ${event.name.toUpperCase()}]`)
        .setDescription(`
**¡Atención personal militar convocado!**
La operación ha concluido o se encuentra en fase de verificación de presencia en el terreno.

Pulsa de inmediato el botón inferior para formalizar tu **asistencia táctica**. Solo los combatientes que confirmen su presencia serán acreditados para recibir sus haberes militares.

> 🎖️ **Operación:** \`${event.name}\`
> 🛡️ **Estado:** \`VERIFICACIÓN DE ASISTENCIA EN VIVO\`
> ⚡ **Aviso:** No demores tu confirmación. Los registros cerrarán al liquidar la nómina.
        `)
        .setFooter({ text: `Operación ID: #${event.id} • Pase de Lista USMC` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`event_confirm_${event.id}`)
            .setLabel('CONFIRMAR MI ASISTENCIA')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅')
    );

    return { embeds: [embed], components: [row] };
}

/**
 * Genera el mensaje táctico del Panel de Cobro / Reclamo de Paga Militar
 */
function buildPayoutPanel(event, settings = null, claimExpiresAt = null) {
    const sym = settings ? settings.currency_symbol : '$';
    const expiresUnix = claimExpiresAt || event.claim_expires_at || (Math.floor(Date.now() / 1000) + ((event.claim_deadline_hours || 24) * 3600));
    const expiresTimestamp = `<t:${expiresUnix}:R>`;

    const embed = new EmbedBuilder()
        .setColor(0x38e54d) // Emerald Green
        .setTitle(`🎖️ [NÓMINA MILITAR LIBERADA // ${event.name.toUpperCase()}]`)
        .setDescription(`
**La misión militar ha concluido y el Mando ha autorizado la dispersión de fondos.**

Todos los combatientes cuya asistencia fue confirmada pueden transferir su paga directamente a su cartera militar pulsando el botón inferior.

> 💰 **Paga Base Asignada:** \`${sym}${event.base_reward.toLocaleString()}\` *(+ Escalafón de Rango)*
> ⏳ **Plazo Límite de Cobro:** Expira en ${expiresTimestamp}
> 🛡️ **Destino:** Cartera Militar Táctica (Efectivo)
        `)
        .addFields(
            {
                name: '📋 Requisitos de Cobro',
                value: 'El sistema validará automáticamente que hayas confirmado tu asistencia o cumplido la permanencia mínima requerida.',
                inline: false
            }
        )
        .setFooter({ text: `Operación ID: #${event.id} • Tesorería de Operaciones USMC` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`claim_event_${event.id}`)
            .setLabel('RECLAMAR PAGA MILITAR')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💵')
    );

    return { embeds: [embed], components: [row] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('evento')
        .setDescription('Gestión táctica de operaciones militares, registro previo, asistencia y pagos')
        .addSubcommand(sub =>
            sub.setName('convocar')
                .setDescription('Inicia una operación militar por registro previo y publica el panel de alistamiento')
                .addStringOption(opt => opt.setName('nombre').setDescription('Nombre de la operación').setRequired(true))
                .addIntegerOption(opt => opt.setName('paga_base').setDescription('Recompensa base en créditos').setMinValue(1).setRequired(true))
                .addChannelOption(opt => opt.setName('canal_registro').setDescription('Canal donde publicar el panel de inscripción').addChannelTypes(ChannelType.GuildText).setRequired(false))
                .addChannelOption(opt => opt.setName('canal_pago').setDescription('Canal donde se publicará el cobro').addChannelTypes(ChannelType.GuildText).setRequired(false))
                .addIntegerOption(opt => opt.setName('cupo_maximo').setDescription('Límite de soldados (opcional, por defecto sin límite)').setMinValue(1).setRequired(false))
                .addIntegerOption(opt => opt.setName('plazo_horas').setDescription('Horas límite para cobrar tras finalizar (default: 24h)').setMinValue(1).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('confirmar')
                .setDescription('Publica el panel interactivo para que los reclutas confirmen su asistencia presencial')
                .addChannelOption(opt => opt.setName('canal').setDescription('Canal donde publicar el botón de confirmación').addChannelTypes(ChannelType.GuildText).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('panel_pago')
                .setDescription('Publica el panel con botón de reclamo de paga militar para los asistentes confirmados')
                .addChannelOption(opt => opt.setName('canal').setDescription('Canal donde publicar el cobro (por defecto canal de pago)').addChannelTypes(ChannelType.GuildText).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('pagar_todos')
                .setDescription('Liquidación directa e inmediata: deposita la paga a todos los confirmados sin esperar que pulsen')
        )
        .addSubcommand(sub =>
            sub.setName('lista')
                .setDescription('Visualiza el pase de lista en tiempo real (inscritos, confirmados y cobrados)')
        )
        .addSubcommand(sub =>
            sub.setName('iniciar')
                .setDescription('Inicia el rastreo automático de presencia para operaciones en canales de voz/chat')
                .addStringOption(opt => opt.setName('nombre').setDescription('Nombre de la operación o evento').setRequired(true))
                .addStringOption(opt => opt.setName('tipo').setDescription('Modalidad de rastreo').addChoices(
                    { name: 'Canal de Voz (Voice Attendance)', value: 'VOICE' },
                    { name: 'Canal de Chat (Text Activity)', value: 'TEXT' },
                    { name: 'Híbrido (Voz + Chat)', value: 'HYBRID' }
                ).setRequired(true))
                .addChannelOption(opt => opt.setName('canal_objetivo').setDescription('Canal de voz o chat donde se medirá la presencia').setRequired(true))
                .addChannelOption(opt => opt.setName('canal_pago').setDescription('Canal de texto donde se publicará el botón de reclamo').addChannelTypes(ChannelType.GuildText).setRequired(true))
                .addIntegerOption(opt => opt.setName('paga_base').setDescription('Recompensa base en créditos').setMinValue(1).setRequired(true))
                .addIntegerOption(opt => opt.setName('plazo_horas').setDescription('Horas límite para reclamar el pago tras finalizar (default: 24h)').setMinValue(1).setRequired(false))
                .addIntegerOption(opt => opt.setName('gracia_minutos').setDescription('Tolerancia en minutos si sufren desconexión (default: 5 min)').setMinValue(0).setRequired(false))
                .addIntegerOption(opt => opt.setName('asistencia_minima').setDescription('Porcentaje mínimo de permanencia requerido (default: 80%)').setMinValue(10).setMaxValue(100).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('finalizar')
                .setDescription('Concluye la operación activa y emite el botón de cobro para los asistentes')
        )
        .addSubcommand(sub =>
            sub.setName('estado')
                .setDescription('Verifica los participantes y estado en tiempo real de la operación activa')
        ),

    buildRegistrationPanel,
    buildConfirmationPanel,
    buildPayoutPanel,

    async execute(interaction) {
        if (!hasOfficerPermission(interaction)) {
            return interaction.reply({
                content: '❌ **Acceso Restringido:** Solo el cuerpo de oficiales y administradores puede comandar eventos de pago.',
                flags: MessageFlags.Ephemeral
            });
        }

        const guildId = interaction.guildId || 'GLOBAL';
        const sub = interaction.options.getSubcommand();
        const settings = economyDb.getEconomySettings(guildId);
        const sym = settings.currency_symbol || '$';

        // ==========================================
        // 1. /evento convocar (NUEVO: Panel de Registro)
        // ==========================================
        if (sub === 'convocar') {
            const name = interaction.options.getString('nombre');
            const baseReward = interaction.options.getInteger('paga_base');
            const regChannel = interaction.options.getChannel('canal_registro') || interaction.channel;
            const payoutChannel = interaction.options.getChannel('canal_pago') || interaction.channel;
            const maxParticipants = interaction.options.getInteger('cupo_maximo') || 0;
            const claimDeadlineHours = interaction.options.getInteger('plazo_horas') || 24;

            if (!regChannel.isTextBased()) {
                return interaction.reply({
                    content: '❌ El canal de registro debe ser un canal de texto.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const result = economyDb.createEvent({
                guild_id: guildId,
                name,
                event_type: 'REGISTRATION',
                target_channel_id: regChannel.id,
                payout_channel_id: payoutChannel.id,
                registration_channel_id: regChannel.id,
                confirmation_channel_id: regChannel.id,
                base_reward: baseReward,
                claim_deadline_hours: claimDeadlineHours,
                max_participants: maxParticipants,
                phase: 'REGISTRATION'
            });

            if (!result.success) {
                return interaction.reply({ content: `⚠️ ${result.message}`, flags: MessageFlags.Ephemeral });
            }

            const panelData = buildRegistrationPanel(result.event, settings);

            try {
                const sentMsg = await regChannel.send(panelData);
                economyDb.setEventPhase(result.event.id, 'REGISTRATION', {
                    registration_channel_id: regChannel.id,
                    registration_message_id: sentMsg.id
                });

                return interaction.reply({
                    content: `🎖️ **Convocatoria Militar activada.** Panel de registro desplegado exitosamente en <#${regChannel.id}>. (Operación #${result.event.id}: **${name}**)`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (err) {
                return interaction.reply({
                    content: `❌ Error al enviar el panel a <#${regChannel.id}>: ${err.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // ==========================================
        // 2. /evento confirmar (NUEVO: Confirmar Asistencia)
        // ==========================================
        if (sub === 'confirmar') {
            const active = economyDb.getActiveEvent(guildId);
            if (!active) {
                return interaction.reply({
                    content: '⚠️ No hay ninguna operación militar activa en este momento.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const targetChannel = interaction.options.getChannel('canal') || 
                                  (active.confirmation_channel_id ? interaction.guild.channels.cache.get(active.confirmation_channel_id) : null) || 
                                  interaction.channel;

            if (!targetChannel.isTextBased()) {
                return interaction.reply({ content: '❌ El canal debe ser de texto.', flags: MessageFlags.Ephemeral });
            }

            const confirmData = buildConfirmationPanel(active, settings);

            try {
                const sentMsg = await targetChannel.send(confirmData);
                economyDb.setEventPhase(active.id, 'CONFIRMING', {
                    confirmation_channel_id: targetChannel.id,
                    confirmation_message_id: sentMsg.id
                });

                return interaction.reply({
                    content: `📍 **Pase de Lista desplegado exitosamente en** <#${targetChannel.id}>. Los soldados pueden confirmar su asistencia ahora.`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (err) {
                return interaction.reply({
                    content: `❌ Error al enviar el pase de lista a <#${targetChannel.id}>: ${err.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // ==========================================
        // 3. /evento panel_pago (NUEVO: Publicar Botón de Cobro)
        // ==========================================
        if (sub === 'panel_pago') {
            const active = economyDb.getActiveEvent(guildId);
            if (!active) {
                return interaction.reply({
                    content: '⚠️ No hay ninguna operación militar activa para liquidar.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const targetChannel = interaction.options.getChannel('canal') || 
                                  (active.payout_channel_id ? interaction.guild.channels.cache.get(active.payout_channel_id) : null) || 
                                  interaction.channel;

            if (!targetChannel.isTextBased()) {
                return interaction.reply({ content: '❌ El canal de pago debe ser de texto.', flags: MessageFlags.Ephemeral });
            }

            // Marcar en DB como finalizado para habilitar reclamos
            const finalized = economyDb.finalizeEvent(active.id);
            const payoutData = buildPayoutPanel(finalized, settings, finalized.claim_expires_at);

            try {
                const sentMsg = await targetChannel.send(payoutData);
                economyDb.setEventPhase(active.id, 'ENDED', {
                    payout_channel_id: targetChannel.id,
                    discord_message_id: sentMsg.id
                });

                const roster = economyDb.getEventRegistrations(active.id);
                const eligible = roster.filter(r => r.is_eligible === 1).length;

                return interaction.reply({
                    content: `💵 **Panel de Cobro Militar publicado en** <#${targetChannel.id}>.\nSe detectaron **${roster.length}** soldados en lista, de los cuales **${eligible}** están acreditados con asistencia confirmada para cobrar.`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (err) {
                return interaction.reply({
                    content: `❌ Error al enviar el panel de pago: ${err.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // ==========================================
        // 4. /evento pagar_todos (NUEVO: Pago Masivo Directo)
        // ==========================================
        if (sub === 'pagar_todos') {
            const active = economyDb.getActiveEvent(guildId);
            if (!active) {
                return interaction.reply({
                    content: '⚠️ No hay ninguna operación militar activa para liquidar.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const result = economyDb.massPayoutEvent(active.id, interaction.client, interaction.user.id);
            if (!result.success) {
                return interaction.editReply({ content: `⚠️ ${result.message}` });
            }

            let previewPaid = result.paidList.slice(0, 10).map(p => `• <@${p.discord_id}> (\`${p.username}\`): **${sym}${p.amount.toLocaleString()}** [${p.role || 'Estándar'}]`).join('\n');
            if (result.paidList.length > 10) previewPaid += `\n*...y ${result.paidList.length - 10} soldados más.*`;

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle(`⚡ [LIQUIDACIÓN DIRECTA COMPLETADA // #${active.id}]`)
                .setDescription(`
Se ha realizado el depósito directo a la cartera militar de todos los soldados con asistencia confirmada.

> 🎖️ **Operación:** \`${active.name}\`
> 👥 **Combatientes Liquidados:** \`${result.paidCount}\`
> 💰 **Total Fondos Desembolsados:** \`${sym}${result.totalDistributed.toLocaleString()}\`
> 🛡️ **Oficial Pagador:** <@${interaction.user.id}>

**Detalle de Haberes Transferidos:**
${previewPaid}
                `)
                .setFooter({ text: 'Tesorería Militar USMC • Operación Finalizada' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // ==========================================
        // 5. /evento lista (NUEVO: Reporte de Registrados y Confirmados)
        // ==========================================
        if (sub === 'lista') {
            const active = economyDb.getActiveEvent(guildId);
            if (!active) {
                return interaction.reply({
                    content: 'ℹ️ No hay ninguna operación militar activa en este momento.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const roster = economyDb.getEventRegistrations(active.id);
            const registeredCount = roster.length;
            const confirmedCount = roster.filter(r => r.attendance_confirmed === 1 || r.is_eligible === 1).length;
            const claimedCount = roster.filter(r => r.claimed === 1).length;

            let listText = 'Ningún combatiente registrado aún.';
            if (roster.length > 0) {
                listText = roster.slice(0, 20).map((r, i) => {
                    let statusBadge = '📝 Inscrito';
                    if (r.claimed === 1) statusBadge = `💵 Cobrado ($${r.payout_amount})`;
                    else if (r.attendance_confirmed === 1 || r.is_eligible === 1) statusBadge = '✅ Asistencia Confirmada';

                    return `\`${i + 1}.\` <@${r.discord_id}> — **${statusBadge}**`;
                }).join('\n');
                if (roster.length > 20) listText += `\n*...y ${roster.length - 20} combatientes más.*`;
            }

            const embed = new EmbedBuilder()
                .setColor(0x00b4d8)
                .setTitle(`📋 [LISTA DE ASISTENCIA MILITAR // #${active.id}]`)
                .setDescription(`
**Operación:** ${active.name} (\`${active.event_type}\`)
> 🛡️ **Fase Actual:** \`${active.phase || active.status}\`
> 👥 **Total Inscritos:** \`${registeredCount}\` ${active.max_participants > 0 ? `/ ${active.max_participants}` : ''}
> ✅ **Asistencia Confirmada:** \`${confirmedCount}\`
> 💵 **Haberes Cobrados:** \`${claimedCount}\`
> 💰 **Paga Base:** \`${sym}${active.base_reward.toLocaleString()}\`

**Roster de Combatientes:**
${listText}
                `)
                .setFooter({ text: 'Usa /evento confirmar para pase de lista o /evento panel_pago para cobro.' });

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ==========================================
        // 6. /evento iniciar (Existente: Voz/Chat Auto)
        // ==========================================
        if (sub === 'iniciar') {
            const name = interaction.options.getString('nombre');
            const eventType = interaction.options.getString('tipo');
            const targetChannel = interaction.options.getChannel('canal_objetivo');
            const payoutChannel = interaction.options.getChannel('canal_pago');
            const baseReward = interaction.options.getInteger('paga_base');
            const claimDeadlineHours = interaction.options.getInteger('plazo_horas') || 24;
            const graceMinutes = interaction.options.getInteger('gracia_minutos') !== null ? interaction.options.getInteger('gracia_minutos') : 5;
            const minPercent = interaction.options.getInteger('asistencia_minima') || 80;

            if (eventType === 'VOICE' && !targetChannel.isVoiceBased()) {
                return interaction.reply({
                    content: '❌ Para una operación de **Voz**, el `canal_objetivo` debe ser un canal de voz.',
                    flags: MessageFlags.Ephemeral
                });
            }
            if (eventType === 'TEXT' && !targetChannel.isTextBased()) {
                return interaction.reply({
                    content: '❌ Para una operación de **Chat**, el `canal_objetivo` debe ser un canal de texto.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const result = economyDb.createEvent({
                guild_id: guildId,
                name,
                event_type: eventType,
                target_channel_id: targetChannel.id,
                payout_channel_id: payoutChannel.id,
                base_reward: baseReward,
                claim_deadline_hours: claimDeadlineHours,
                grace_period_minutes: graceMinutes,
                min_attendance_percent: minPercent
            });

            if (!result.success) {
                return interaction.reply({ content: `⚠️ ${result.message}`, flags: MessageFlags.Ephemeral });
            }

            if (eventType === 'VOICE' || eventType === 'HYBRID') {
                if (targetChannel.isVoiceBased()) {
                    for (const [mId, member] of targetChannel.members) {
                        if (!member.user.bot) {
                            economyDb.recordAttendanceHeartbeat(result.event.id, mId, member.user.tag, 10);
                        }
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle(`🔴 [OPERACIÓN INICIADA] // ${name.toUpperCase()}`)
                .setDescription(`
El rastreo de presencia militar ha sido activado exitosamente.

> 📍 **Canal Objetivo:** <#${targetChannel.id}> (\`${eventType}\`)
> 📢 **Canal de Paga:** <#${payoutChannel.id}>
> 💰 **Recompensa Base:** \`${sym}${baseReward.toLocaleString()}\`
> 🛡️ **Tolerancia a Desconexión:** \`${graceMinutes} minutos\`
> 📊 **Permanencia Requerida:** \`${minPercent}%\`
> ⏱️ **Vigencia de Cobro:** \`${claimDeadlineHours} horas\` tras concluir
                `)
                .setFooter({ text: `Operación ID: #${result.event.id} • Ejecuta /evento finalizar al terminar.` });

            return interaction.reply({ embeds: [embed] });
        }

        // ==========================================
        // 7. /evento estado (Existente: Monitor en vivo)
        // ==========================================
        if (sub === 'estado') {
            const active = economyDb.getActiveEvent(guildId);
            if (!active) {
                return interaction.reply({
                    content: 'ℹ️ No hay ninguna operación militar activa en este momento.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const attendees = economyDb.getEventAttendance(active.id);
            const durationMinutes = Math.floor((Date.now() - new Date(active.created_at).getTime()) / 60000);

            let previewAttendees = 'Ningún recluta registrado aún.';
            if (attendees.length > 0) {
                previewAttendees = attendees.slice(0, 15).map(a => {
                    const mins = Math.floor(a.total_seconds_present / 60);
                    let badge = '';
                    if (a.attendance_confirmed) badge = ' [✅ Confirmado]';
                    else if (a.status === 'REGISTERED') badge = ' [📝 Inscrito]';

                    return `• <@${a.discord_id}> — ${mins} min ${a.message_count > 0 ? `(${a.message_count} msgs)` : ''}${badge}`;
                }).join('\n');
                if (attendees.length > 15) previewAttendees += `\n*...y ${attendees.length - 15} reclutas más.*`;
            }

            const embed = new EmbedBuilder()
                .setColor(0xffb000)
                .setTitle(`📡 [MONITOREO DE OPERACIÓN EN VIVO // #${active.id}]`)
                .setDescription(`
**Misión:** ${active.name}
> 📍 **Modalidad:** \`${active.event_type}\` (Fase: \`${active.phase || active.status}\`)
> ⏱️ **Tiempo Transcurrido:** \`${durationMinutes} minutos\`
> 👥 **Reclutas Registrados:** \`${attendees.length}\`
> 💰 **Paga Base:** \`${sym}${active.base_reward.toLocaleString()}\`

**Personal en Registro:**
${previewAttendees}
                `)
                .setFooter({ text: 'Usa /evento confirmar para pase de lista o /evento finalizar cuando concluya.' });

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ==========================================
        // 8. /evento finalizar (Existente: Auto tracker)
        // ==========================================
        if (sub === 'finalizar') {
            const active = economyDb.getActiveEvent(guildId);
            if (!active) {
                return interaction.reply({
                    content: '⚠️ No hay ninguna operación militar en curso para finalizar.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const summary = await finishAndPublishEvent(interaction.client, active.id);

                return interaction.editReply({
                    content: `✅ **Operación #${active.id} finalizada exitosamente.**\nSe detectaron **${summary.totalAttendees}** participantes, de los cuales **${summary.eligibleCount}** calificaron para cobrar. El botón de pago fue publicado en <#${active.payout_channel_id}>.`
                });
            } catch (err) {
                return interaction.editReply({
                    content: `❌ Error al finalizar la operación: ${err.message}`
                });
            }
        }
    }
};
