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
const { hasOfficerPermission, hasAdminPermission } = require('../handlers/permissionHandler');

/**
 * Construye el mensaje completo del Panel Táctico de Bono Militar con Embed y Botón interactivo
 */
function buildBonusPanelMessage(panel, settings = null) {
    const sym = settings ? settings.currency_symbol : '$';
    const amount = panel.amount || 500;
    const modeText = panel.claim_mode === 'ONCE' 
        ? '🔒 Reclamo Único (1 vez por combatiente)' 
        : `⏱️ Periódico (Cooldown de ${Math.round((panel.cooldown_seconds || 86400) / 3600)} horas)`;

    const embed = new EmbedBuilder()
        .setColor(0xd4af37) // USMC Gold
        .setTitle(panel.title || '🎖️ [BONO MILITAR EXTRAORDINARIO // ASIGNACIÓN DE MANDO]')
        .setDescription(`
${panel.description || 'El Estado Mayor de la Base USMC ha autorizado una asignación financiera especial para el personal militar en servicio activo.'}

> 💰 **Asignación Financiera:** \`${sym}${amount.toLocaleString()}\`
> 📡 **Modalidad de Concesión:** \`${modeText}\`
> 🛡️ **Estado:** \`${panel.is_active ? 'AUTORIZADO Y DISPONIBLE' : 'SUSPENDIDO'}\`

Pulsa el botón táctico inferior para formalizar el cobro inmediato a tu cartera militar.
        `)
        .addFields(
            { name: '🎖️ Fondo Militar', value: `\`${sym}${amount.toLocaleString()}\``, inline: true },
            { name: '📋 Modalidad', value: `\`${panel.claim_mode === 'ONCE' ? 'ÚNICA VEZ' : 'FRECUENCIA RECURRENTE'}\``, inline: true }
        )
        .setFooter({ text: 'Tesorería Militar y Mando de Fuerzas Especiales USMC' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`claim_bonus_panel_${panel.id}`)
            .setLabel(panel.button_label || 'RECLAMAR BONO MILITAR')
            .setStyle(ButtonStyle.Success)
            .setEmoji(panel.button_emoji || '🎁')
            .setDisabled(!panel.is_active)
    );

    return { embeds: [embed], components: [row] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bono')
        .setDescription('Sistema de bonos, asignaciones extraordinarias y gratificaciones militares USMC')
        .addSubcommand(sub =>
            sub.setName('panel')
                .setDescription('Despliega el panel de reclamo de bonos militares con botón interactivo (Oficiales)')
                .addChannelOption(opt =>
                    opt.setName('canal')
                        .setDescription('Canal donde publicar el panel (por defecto este canal)')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('ID del bono a desplegar (por defecto el más reciente o activo)')
                        .setMinValue(1)
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('crear')
                .setDescription('Crea un nuevo bono militar con ID único para que todos puedan reclamar (Oficiales)')
                .addIntegerOption(opt => opt.setName('monto').setDescription('Monto en créditos').setMinValue(1).setRequired(true))
                .addStringOption(opt => opt.setName('titulo').setDescription('Título táctico del bono').setRequired(true))
                .addStringOption(opt => opt.setName('descripcion').setDescription('Descripción o comunicado').setRequired(false))
                .addStringOption(opt => opt.setName('modo').setDescription('Modalidad de reclamo').addChoices(
                    { name: 'Una sola vez (ONCE)', value: 'ONCE' },
                    { name: 'Con Cooldown periódico', value: 'COOLDOWN' }
                ).setRequired(false))
                .addIntegerOption(opt => opt.setName('horas_cooldown').setDescription('Horas de espera si es con cooldown (default: 24h)').setMinValue(1).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('eliminar')
                .setDescription('Elimina un bono militar y su historial de reclamos (Oficiales)')
                .addIntegerOption(opt => opt.setName('id').setDescription('ID del bono militar a eliminar').setMinValue(1).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('reset_reclamos')
                .setDescription('Reinicia los reclamos de un bono para que todos los soldados puedan volver a cobrarlo (Oficiales)')
                .addIntegerOption(opt => opt.setName('id').setDescription('ID del bono militar a reiniciar').setMinValue(1).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('lista')
                .setDescription('Muestra la lista de todos los bonos militares creados con sus IDs y estado (Oficiales)')
        )
        .addSubcommand(sub =>
            sub.setName('reclamar')
                .setDescription('Reclama tu asignación de bono militar disponible')
        )
        .addSubcommand(sub =>
            sub.setName('dar')
                .setDescription('Otorgar un bono financiero militar a un combatiente (Oficiales/Mando)')
                .addUserOption(opt =>
                    opt.setName('usuario')
                        .setDescription('Combatiente que recibirá el bono militar')
                        .setRequired(true)
                )
                .addIntegerOption(opt =>
                    opt.setName('monto')
                        .setDescription('Cantidad a otorgar')
                        .setMinValue(1)
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('motivo')
                        .setDescription('Cita militar o motivo de la condecoración/bono')
                        .setRequired(false)
                )
                .addStringOption(opt =>
                    opt.setName('destino')
                        .setDescription('Destino del saldo')
                        .addChoices(
                            { name: 'Cartera (Efectivo)', value: 'wallet' },
                            { name: 'Banco (Caja Fuerte)', value: 'bank' }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('masivo')
                .setDescription('Conceder un bono militar a todo el personal militar registrado (Comando)')
                .addIntegerOption(opt =>
                    opt.setName('monto')
                        .setDescription('Cantidad individual para cada combatiente')
                        .setMinValue(1)
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('motivo')
                        .setDescription('Motivo de la condecoración general')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('estado')
                .setDescription('Consulta el estado de tu próximo bono y configuración de brigada')
        ),

    buildBonusPanelMessage,

    async execute(interaction) {
        const guildId = interaction.guildId || 'GLOBAL';
        const settings = economyDb.getEconomySettings(guildId);
        const sym = settings.currency_symbol || '$';
        const sub = interaction.options.getSubcommand();

        // Sincronizar datos de usuario
        economyDb.syncAccountUser(
            interaction.user.id,
            interaction.user.tag || interaction.user.username,
            interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
            interaction.guildId
        );

        // =========================================================================
        // 1. SUBCOMANDO: PANEL INTERACTIVO CON BOTÓN
        // =========================================================================
        if (sub === 'panel') {
            const isAuthorized = hasOfficerPermission(interaction) || hasAdminPermission(interaction);
            if (!isAuthorized) {
                return interaction.reply({
                    content: '🔒 **Acceso Denegado:** Se requieren credenciales de Oficial o Comandante para desplegar paneles de tesorería.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const targetChannel = interaction.options.getChannel('canal') || interaction.channel;
            const panelIdOpt = interaction.options.getInteger('id');
            const panel = panelIdOpt ? economyDb.getBonusPanelById(panelIdOpt) : economyDb.getBonusPanel(guildId);
            if (!panel) {
                return interaction.reply({
                    content: `❌ **Bono No Encontrado:** No existe un bono militar con ID \`#${panelIdOpt}\`. Usa \`/bono lista\` para ver los disponibles.`,
                    flags: MessageFlags.Ephemeral
                });
            }
            const msgPayload = buildBonusPanelMessage(panel, settings);

            try {
                const sentMsg = await targetChannel.send(msgPayload);
                economyDb.saveBonusPanel(guildId, {
                    id: panel.id,
                    channel_id: targetChannel.id,
                    message_id: sentMsg.id
                });

                return interaction.reply({
                    content: `🎖️ **Panel de Bono Militar #${panel.id} desplegado exitosamente en** <#${targetChannel.id}>.`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (err) {
                return interaction.reply({
                    content: `❌ **Error al publicar panel:** No se pudo enviar el mensaje a <#${targetChannel.id}>. Verifica los permisos de envío del bot.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // =========================================================================
        // 2. SUBCOMANDO: DAR BONO DIRECTO A UN COMBATIENTE
        // =========================================================================
        if (sub === 'dar') {
            const permCheck = economyDb.isCommandAllowed('bono', interaction.member);
            const isOfficer = hasOfficerPermission(interaction);

            if (!permCheck.allowed && !isOfficer) {
                return interaction.reply({
                    content: '🔒 **Acceso Denegado:** Tu rango militar actual no cuenta con autorización para otorgar bonificaciones financieras.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const targetUser = interaction.options.getUser('usuario');
            const amount = interaction.options.getInteger('monto');
            const reason = interaction.options.getString('motivo') || 'Gratificación por mérito militar';
            const target = interaction.options.getString('destino') || 'wallet';

            // Validar tope máximo salvo administradores
            const maxGive = settings.bonus_max_give || 50000;
            const isAdmin = interaction.member && interaction.member.permissions && interaction.member.permissions.has(8n);
            if (!isAdmin && amount > maxGive) {
                return interaction.reply({
                    content: `⚠️ **Tope Superado:** El monto excede el límite máximo por bono autorizado de **${sym}${maxGive.toLocaleString()}**. Contacta al Mando Supremo si se requiere una dotación mayor.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const issuerTag = interaction.user.tag || interaction.user.username;
            const updatedAccount = economyDb.giveBonus(targetUser.id, amount, reason, target, issuerTag);

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('🎖️ [BONO MILITAR CONCEDIDO // ORDEN OFICIAL]')
                .setDescription(`
Se ha formalizado la concesión de una bonificación económica militar.

> 👤 **Beneficiario:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\`)
> 💰 **Monto Concedido:** \`${sym}${amount.toLocaleString()}\` (${target === 'bank' ? 'Caja Fuerte' : 'Cartera'})
> 📜 **Cita / Motivo:** *"${reason}"*
> 👮 **Oficial Otorgante:** <@${interaction.user.id}>
                `)
                .addFields(
                    { name: '💵 Patrimonio Actualizado', value: `\`${sym}${(updatedAccount.wallet + updatedAccount.bank).toLocaleString()}\``, inline: true }
                )
                .setFooter({ text: 'Registro Contable Militar USMC' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // =========================================================================
        // 3. SUBCOMANDO: BONO MASIVO AL PELOTÓN
        // =========================================================================
        if (sub === 'masivo') {
            const isOfficer = hasOfficerPermission(interaction) || (interaction.member && interaction.member.permissions && interaction.member.permissions.has(8n));
            if (!isOfficer) {
                return interaction.reply({
                    content: '🔒 **Acceso Restringido:** Solo el Estado Mayor puede emitir pagos de bonos masivos a todo el pelotón.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const amount = interaction.options.getInteger('monto');
            const reason = interaction.options.getString('motivo') || 'Gratificación general de la comandancia';
            const issuerTag = interaction.user.tag || interaction.user.username;

            const res = economyDb.giveMassBonus(amount, reason, issuerTag);

            const embed = new EmbedBuilder()
                .setColor(0xd4af37)
                .setTitle('📢 [BONO GENERAL EXTRAORDINARIO // DECRETO DE BRIGADA]')
                .setDescription(`
¡Atención a todo el personal de la base! Se ha dispersado un bono financiero general.

> 💰 **Monto por Soldado:** \`${sym}${amount.toLocaleString()}\`
> 👥 **Combatientes Beneficiados:** \`${res.count} reclutas\`
> 📜 **Motivo Militar:** *"${reason}"*
> 🎖️ **Decretado por:** <@${interaction.user.id}>
                `)
                .setFooter({ text: 'Tesorería Central USMC • Los fondos han sido depositados en las carteras.' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // =========================================================================
        // 4. SUBCOMANDO: RECLAMAR BONO DIRECTO
        // =========================================================================
        if (sub === 'reclamar') {
            // Verificar si el comando bono está habilitado y rol autorizado
            const permCheck = economyDb.isCommandAllowed('bono', interaction.member);
            if (!permCheck.allowed) {
                return interaction.reply({
                    content: permCheck.reason === 'DISABLED'
                        ? '🔒 **Protocolo Inactivo:** El comando de bonos se encuentra temporalmente deshabilitado.'
                        : '🔒 **Acceso Denegado:** Tu rango actual no cuenta con autorización para solicitar este bono militar.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const userRoleIds = interaction.member ? interaction.member.roles.cache.map(r => r.id) : [];
            const panel = economyDb.getBonusPanel(guildId);
            const claimRes = economyDb.claimPanelBonus(panel.id, interaction.user.id, userRoleIds);

            if (!claimRes.success) {
                return interaction.reply({
                    content: claimRes.message,
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('🎖️ [BONO MILITAR COBRADO EXITOSAMENTE]')
                .setDescription(`
¡Enhorabuena, combatiente! Se ha tramitado tu asignación financiera.

> 💰 **Monto Acreditado:** \`${sym}${claimRes.amount.toLocaleString()}\`
> 💼 **Nuevo Saldo en Cartera:** \`${sym}${claimRes.account.wallet.toLocaleString()}\`
> 🏦 **Patrimonio Total:** \`${sym}${(claimRes.account.wallet + claimRes.account.bank).toLocaleString()}\`
> 📋 **Modalidad:** \`${claimRes.panel.claim_mode === 'ONCE' ? 'Asignación Única' : 'Bono Periódico'}\`

*La transacción ha sido sellada y archivada en los libros de tesorería.*
                `)
                .setFooter({ text: 'Tesorería Militar USMC' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // =========================================================================
        // 5. SUBCOMANDO: ESTADO
        // =========================================================================
        if (sub === 'estado') {
            const panel = economyDb.getBonusPanel(guildId);
            const stats = economyDb.getBonusStats(guildId);
            const userClaims = economyDb.getRecentTransactions(interaction.user.id, 50).filter(t => t.type === 'BONUS_CLAIM');

            const embed = new EmbedBuilder()
                .setColor(0x1a3320)
                .setTitle('📊 [SISTEMA DE BONOS // ESTADO DE SERVICIO]')
                .setDescription(`
Parámetros actuales del programa de bonificaciones militares de la base:

> 🎖️ **Panel Activo:** \`${panel.title}\`
> 💰 **Monto Vigente:** \`${sym}${panel.amount.toLocaleString()}\`
> 🔄 **Modo:** \`${panel.claim_mode === 'ONCE' ? 'Única vez' : `Periódico (${Math.round(panel.cooldown_seconds / 3600)}h)`}\`
> 👥 **Total Reclamos Globales:** \`${stats.totalClaims}\`
> 💵 **Total Concedido:** \`${sym}${stats.totalDistributed.toLocaleString()}\`
> 👤 **Tus Cobros Registrados:** \`${userClaims.length}\`
                `)
                .setFooter({ text: 'USMC Command Center' });

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // =========================================================================
        // 6. SUBCOMANDO: CREAR NUEVO BONO MILITAR
        // =========================================================================
        if (sub === 'crear') {
            const isAuthorized = hasOfficerPermission(interaction) || hasAdminPermission(interaction);
            if (!isAuthorized) {
                return interaction.reply({
                    content: '🔒 **Acceso Denegado:** Se requieren credenciales de Oficial o Comandante para crear bonos militares.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const monto = interaction.options.getInteger('monto');
            const titulo = interaction.options.getString('titulo');
            const descripcion = interaction.options.getString('descripcion') || 'Asignación financiera especial autorizada por el Estado Mayor USMC.';
            const modo = interaction.options.getString('modo') || 'ONCE';
            const horasCooldown = interaction.options.getInteger('horas_cooldown') || 24;

            const newPanel = economyDb.createBonusPanel(guildId, {
                title: titulo,
                description: descripcion,
                amount: monto,
                claim_mode: modo,
                cooldown_seconds: horasCooldown * 3600,
                is_active: true
            });

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('🎖️ [NUEVO BONO MILITAR CREADO // ORDEN DE TESORERÍA]')
                .setDescription(`
Se ha creado exitosamente un nuevo bono militar con ID único.

> 🆔 **ID del Bono:** \`#${newPanel.id}\`
> 📋 **Título:** \`${newPanel.title}\`
> 💰 **Monto:** \`${sym}${monto.toLocaleString()}\`
> 🔄 **Modalidad:** \`${modo === 'ONCE' ? 'Única vez por soldado' : `Periódico (cada ${horasCooldown}h)`}\`
> 🟢 **Estado:** \`ACTIVO\`

**Para desplegar este bono en un canal:**
\`/bono panel id:${newPanel.id}\` o \`/bono panel id:${newPanel.id} canal:#canal\`

*Cada bono tiene su propio ID y historial de reclamos independiente.*
                `)
                .setFooter({ text: 'Tesorería Militar USMC • Sistema de Bonos Independientes' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // =========================================================================
        // 7. SUBCOMANDO: ELIMINAR BONO MILITAR
        // =========================================================================
        if (sub === 'eliminar') {
            const isAuthorized = hasOfficerPermission(interaction) || hasAdminPermission(interaction);
            if (!isAuthorized) {
                return interaction.reply({
                    content: '🔒 **Acceso Denegado:** Se requieren credenciales de Oficial o Comandante para eliminar bonos militares.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const panelId = interaction.options.getInteger('id');
            const panel = economyDb.getBonusPanelById(panelId);

            if (!panel) {
                return interaction.reply({
                    content: `❌ **Bono No Encontrado:** No existe un bono militar con ID \`#${panelId}\`. Usa \`/bono lista\` para ver los existentes.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const stats = economyDb.getBonusStats(guildId, panelId);
            economyDb.deleteBonusPanel(panelId);

            const embed = new EmbedBuilder()
                .setColor(0xff4444)
                .setTitle('🗑️ [BONO MILITAR ELIMINADO // BAJA DE TESORERÍA]')
                .setDescription(`
El bono militar ha sido eliminado permanentemente del sistema junto con todo su historial de reclamos.

> 🆔 **ID Eliminado:** \`#${panelId}\`
> 📋 **Título:** \`${panel.title}\`
> 💰 **Monto que otorgaba:** \`${sym}${panel.amount.toLocaleString()}\`
> 👥 **Reclamos eliminados:** \`${stats.totalClaims}\`
> 💵 **Total que fue distribuido:** \`${sym}${stats.totalDistributed.toLocaleString()}\`
> 👮 **Eliminado por:** <@${interaction.user.id}>

*Los fondos ya concedidos a los soldados NO se revierten.*
                `)
                .setFooter({ text: 'Tesorería Militar USMC • Baja Contable' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // =========================================================================
        // 8. SUBCOMANDO: RESET DE RECLAMOS DE UN BONO
        // =========================================================================
        if (sub === 'reset_reclamos') {
            const isAuthorized = hasOfficerPermission(interaction) || hasAdminPermission(interaction);
            if (!isAuthorized) {
                return interaction.reply({
                    content: '🔒 **Acceso Denegado:** Se requieren credenciales de Oficial o Comandante para reiniciar reclamos.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const panelId = interaction.options.getInteger('id');
            const panel = economyDb.getBonusPanelById(panelId);

            if (!panel) {
                return interaction.reply({
                    content: `❌ **Bono No Encontrado:** No existe un bono militar con ID \`#${panelId}\`. Usa \`/bono lista\` para ver los existentes.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const result = economyDb.resetBonusClaims(panelId);

            const embed = new EmbedBuilder()
                .setColor(0xffa500)
                .setTitle('🔄 [RECLAMOS REINICIADOS // RESET DE TESORERÍA]')
                .setDescription(`
Se han borrado todos los registros de reclamo del bono seleccionado. Ahora todos los soldados pueden volver a reclamarlo.

> 🆔 **Bono:** \`#${panelId}\` — \`${panel.title}\`
> 💰 **Monto:** \`${sym}${panel.amount.toLocaleString()}\`
> 🗑️ **Reclamos borrados:** \`${result.deletedClaims}\`
> 👮 **Reiniciado por:** <@${interaction.user.id}>

*Todos los combatientes pueden reclamar este bono nuevamente.*
                `)
                .setFooter({ text: 'Tesorería Militar USMC • Reset Contable' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // =========================================================================
        // 9. SUBCOMANDO: LISTA DE BONOS MILITARES
        // =========================================================================
        if (sub === 'lista') {
            const isAuthorized = hasOfficerPermission(interaction) || hasAdminPermission(interaction);
            if (!isAuthorized) {
                return interaction.reply({
                    content: '🔒 **Acceso Denegado:** Se requieren credenciales de Oficial o Comandante para ver la lista de bonos.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const panels = economyDb.getAllBonusPanels(guildId);

            if (panels.length === 0) {
                return interaction.reply({
                    content: '📋 **Sin Bonos:** No hay bonos militares registrados en el sistema. Usa `/bono crear` para crear uno nuevo.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0xd4af37)
                .setTitle('📋 [REGISTRO DE BONOS MILITARES // TESORERÍA USMC]')
                .setDescription('Lista completa de bonos militares creados en el sistema. Cada bono tiene su propio ID y reclamos independientes.')
                .setFooter({ text: `Total: ${panels.length} bono(s) • Tesorería Militar USMC` })
                .setTimestamp();

            for (const p of panels.slice(0, 15)) {
                const statusIcon = p.is_active ? '🟢' : '🔴';
                const modeIcon = p.claim_mode === 'ONCE' ? '🔒' : '⏱️';
                embed.addFields({
                    name: `${statusIcon} #${p.id} — ${p.title}`,
                    value: [
                        `> 💰 Monto: \`${sym}${p.amount.toLocaleString()}\` | ${modeIcon} \`${p.claim_mode === 'ONCE' ? 'Única vez' : 'Periódico'}\``,
                        `> 👥 Reclamos: \`${p.total_claims}\` | 💵 Distribuido: \`${sym}${p.total_distributed.toLocaleString()}\``,
                        `> 📌 Comandos: \`/bono panel id:${p.id}\` · \`/bono eliminar id:${p.id}\` · \`/bono reset_reclamos id:${p.id}\``
                    ].join('\n'),
                    inline: false
                });
            }

            if (panels.length > 15) {
                embed.addFields({
                    name: '⚠️ Lista truncada',
                    value: `Mostrando 15 de ${panels.length} bonos. Elimina bonos antiguos con \`/bono eliminar\`.`,
                    inline: false
                });
            }

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
};
