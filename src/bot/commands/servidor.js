const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');
const db = require('../../database/db');
const { hasOfficerPermission, hasAdminPermission } = require('../handlers/permissionHandler');

/**
 * Calcula el tiempo transcurrido en formato comunitario legible
 */
function formatElapsedTime(startedAt) {
    if (!startedAt) return 'Recién iniciado';
    const startMs = new Date(startedAt + (String(startedAt).endsWith('Z') ? '' : 'Z')).getTime() || new Date(startedAt).getTime();
    if (Number.isNaN(startMs)) return 'En curso';
    const diffMins = Math.max(1, Math.floor((Date.now() - startMs) / 60000));
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `Hace ${hours}h ${mins}m`;
}

/**
 * Construye el Panel Táctico de Servidores privados
 */
function buildPrivateServersPanel(guildId = 'GLOBAL', page = 0) {
    const servers = db.getPrivateServers(guildId);
    const used = servers.filter(s => s.status === 'EN_USO').length;
    const pages = Math.max(1, Math.ceil(servers.length / 4));
    page = Math.min(Math.max(0, Number(page) || 0), pages - 1);
    const visible = servers.slice(page * 4, page * 4 + 4);
    const embed = new EmbedBuilder().setColor(used === servers.length && used ? 0xe56868 : 0x59c9a5)
        .setTitle('🛰️ CENTRO DE DESPLIEGUE · EVENTOS')
        .setDescription(`**${servers.length - used} disponibles**  ·  **${used} en uso**  ·  ${servers.length} registrados\nSelecciona un servidor de esta página para gestionar su despliegue.`)
        .setFooter({ text: `Comunidad • Página ${page + 1}/${pages} • Estado registrado por los responsables` }).setTimestamp();
    for (const srv of visible) {
        const busy = srv.status === 'EN_USO';
        const since = srv.started_at ? Math.floor(new Date(srv.started_at.replace(' ', 'T') + (srv.started_at.endsWith('Z') ? '' : 'Z')).getTime() / 1000) : null;
        embed.addFields({ name: `${busy ? '🔴 EN USO' : '🟢 DISPONIBLE'}  ┃  #${srv.id} · ${srv.server_name}`.slice(0, 256),
            value: [`**AO:** ${String(srv.sector_map || 'Sin asignar').slice(0, 120)}`,
                `**Código VIP:** \`${String(srv.server_code || 'Sin configurar').replace(/`/g, '').slice(0, 150)}\``,
                busy ? `**Mando:** ${srv.current_officer_id ? `<@${srv.current_officer_id}>` : srv.current_officer_name || 'Administración'}` : null,
                busy ? `**Misión:** ${String(srv.current_mission || 'Despliegue').slice(0, 180)}` : String(srv.notes || 'Listo para desplegar.').slice(0, 160),
                busy && since ? `**Inicio:** <t:${since}:R>${srv.current_event_id ? ` · Evento #${srv.current_event_id}` : ''}` : null].filter(Boolean).join('\n'), inline: false });
    }
    if (!visible.length) embed.addFields({ name: 'Sin servidores registrados', value: 'Administración puede registrar el primer servidor con `/servidor agregar` o desde la web.' });
    const components = [];
    if (visible.length) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId('srv_quick_toggle_select').setPlaceholder('Gestionar servidor…')
        .addOptions(visible.map(s => ({ label: `#${s.id} · ${s.server_name}`.slice(0, 100), value: String(s.id),
            description: s.status === 'EN_USO' ? 'Ver ocupación / liberar con autorización' : 'Ocupar para una misión', emoji: s.status === 'EN_USO' ? '🔴' : '🟢' })))));
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`srv_page_${page - 1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('srv_board_refresh').setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`srv_page_${page + 1}`).setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1),
        new ButtonBuilder().setCustomId('srv_release_all_mine').setLabel('Liberar mis servidores').setStyle(ButtonStyle.Success)));
    return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

/**
 * Actualiza el panel público de servidores si fue publicado en algún canal
 */
async function refreshPublicServerBoard(client, guildId = 'GLOBAL') {
    if (!client) return false;
    try {
        const ref = db.getServerBoardMessage(guildId);
        if (!ref) return false;

        const channel = client.channels.cache.get(ref.board_channel_id) || await client.channels.fetch(ref.board_channel_id).catch(() => null);
        if (!channel || !channel.isTextBased()) return false;

        const message = await channel.messages.fetch(ref.board_message_id).catch(() => null);
        if (!message) return false;

        const panel = buildPrivateServersPanel(guildId);
        await message.edit(panel);
        return true;
    } catch (e) {
        console.error('[Server board]', e.message);
        return false;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servidor')
        .setDescription('Control táctico de servidores privados (Disponibles vs En Uso)')
        .addSubcommand(sub =>
            sub.setName('lista')
                .setDescription('Muestra la lista de servidores privados y cuáles tienen la casilla "Está usado"')
                .addBooleanOption(opt =>
                    opt.setName('fijar_panel')
                        .setDescription('Si es True, publica el panel en el canal actual para que todos vean el estado en vivo')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('ocupar')
                .setDescription('Marca un servidor privado con la casilla [🔴 ESTÁ USADO] para tu patrullaje u operación')
                .addIntegerOption(opt => opt.setName('servidor_id').setDescription('ID del servidor (Ej: 1, 2, 3)').setMinValue(1).setRequired(true))
                .addStringOption(opt => opt.setName('mision').setDescription('Motivo de uso (Ej: Patrullaje Sector de actividad, Entrenamiento CQB)').setMaxLength(180).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('liberar')
                .setDescription('Desmarca la casilla de uso y deja el servidor [🟢 DISPONIBLE / LIBRE]')
                .addIntegerOption(opt => opt.setName('servidor_id').setDescription('ID del servidor a liberar').setMinValue(1).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('agregar')
                .setDescription('Registra un nuevo servidor privado en la base de datos de la facción')
                .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del servidor (Ej: Servidor Alpha-1)').setRequired(true))
                .addStringOption(opt => opt.setName('codigo_id').setDescription('ID o Código del servidor privado de Roblox').setRequired(true))
                .addStringOption(opt => opt.setName('sector_mapa').setDescription('Mapa o uso principal (Ej: Sin especificar)').setRequired(false))
                .addStringOption(opt => opt.setName('notas').setDescription('Instrucciones o notas adicionales').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('eliminar')
                .setDescription('Elimina un servidor privado del listado')
                .addIntegerOption(opt => opt.setName('servidor_id').setDescription('ID del servidor a eliminar').setMinValue(1).setRequired(true))
        ),

    buildPrivateServersPanel,
    refreshPublicServerBoard,

    async execute(interaction) {
        if (!hasOfficerPermission(interaction)) {
            return interaction.reply({
                content: '❌ **Acceso Restringido:** Solo responsables, líderes de patrulla y administradores pueden gestionar los servidores privados.',
                flags: MessageFlags.Ephemeral
            });
        }

        const guildId = interaction.guildId || 'GLOBAL';
        const sub = interaction.options.getSubcommand();
        const officerName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;

        if (sub === 'lista') {
            const pinBoard = interaction.options.getBoolean('fijar_panel') || false;
            const panel = buildPrivateServersPanel(guildId);

            if (pinBoard) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const ref = db.getServerBoardMessage(guildId);
                const existing = ref?.board_channel_id === interaction.channelId
                    ? await interaction.channel.messages.fetch(ref.board_message_id).catch(() => null) : null;
                const sent = existing ? await existing.edit(panel) : await interaction.channel.send(panel);
                db.saveServerBoardMessage(guildId, interaction.channel.id, sent.id);
                let pinWarning = '';
                if (!sent.pinned) await sent.pin().catch(() => { pinWarning = '\nNo pude anclarlo; revisa mi permiso para fijar mensajes.'; });
                return interaction.editReply({
                    content: `🛰️ **Pizarra activa en <#${interaction.channel.id}>.** Se actualizará con los cambios de disponibilidad.${pinWarning}`
                });
            }

            return interaction.reply({ ...panel, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'ocupar') {
            const serverId = interaction.options.getInteger('servidor_id');
            const mission = interaction.options.getString('mision') || 'Patrullaje / Operación';

            const existing = db.getPrivateServerById(serverId, guildId);
            if (!existing) {
                return interaction.reply({
                    content: `⚠️ No existe el servidor privado con ID **#${serverId}**. Consulta \`/servidor lista\`.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (existing.status === 'EN_USO' && existing.current_officer_id !== interaction.user.id && !hasAdminPermission(interaction)) {
                return interaction.reply({
                    content: `🔴 **¡Servidor Ocupado!** El servidor **${existing.server_name}** ya está marcado como **ESTÁ USADO** por <@${existing.current_officer_id}> (*${existing.current_mission}*). Coordina con el oficial o elige otro servidor libre.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const res = db.occupyPrivateServer(serverId, interaction.user.id, officerName, mission, null, guildId);
            if (!res.success) return interaction.reply({ content: res.message, flags: MessageFlags.Ephemeral });
            db.addAdminAuditLog(
                { operator_name: officerName, discord_id: interaction.user.id, operator_rank: 'Oficial Discord' },
                'OCUPAR_SERVIDOR_PRIVADO',
                `SRV #${serverId}`,
                `${existing.server_name} marcado EN USO para: ${mission}`
            );

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await refreshPublicServerBoard(interaction.client, guildId);

            return interaction.editReply({
                content: `☑️ **Casilla \`[ 🔴 ESTÁ USADO ]\` activada** para **${res.server.server_name}** (\`${res.server.server_code || 'Sin ID'}\`).\n> 🎯 **Misión:** \`${mission}\`\n> 👤 **Responsable:** <@${interaction.user.id}>\n*Recuerda usar \`/servidor liberar servidor_id:${serverId}\` al terminar.*`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'liberar') {
            const serverId = interaction.options.getInteger('servidor_id');
            const existing = db.getPrivateServerById(serverId, guildId);
            if (!existing) {
                return interaction.reply({
                    content: `⚠️ No existe el servidor privado con ID **#${serverId}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (existing.current_officer_id !== interaction.user.id && !hasAdminPermission(interaction)) {
                return interaction.reply({ content: 'Solo el responsable o Administración puede liberar este servidor.', flags: MessageFlags.Ephemeral });
            }
            const res = db.releasePrivateServer(serverId, guildId);
            db.addAdminAuditLog(
                { operator_name: officerName, discord_id: interaction.user.id, operator_rank: 'Oficial Discord' },
                'LIBERAR_SERVIDOR_PRIVADO',
                `SRV #${serverId}`,
                `${existing.server_name} liberado a DISPONIBLE`
            );

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await refreshPublicServerBoard(interaction.client, guildId);

            return interaction.editReply({
                content: `🟢 **Servidor Liberado:** **${res.server.server_name}** ahora figura como **\`[ 🟢 DISPONIBLE / LIBRE ]\`**.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'agregar') {
            if (!hasAdminPermission(interaction)) {
                return interaction.reply({
                    content: '❌ Solo el Administración / Administradores pueden agregar o eliminar servidores de la lista.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const name = interaction.options.getString('nombre');
            const code = interaction.options.getString('codigo_id');
            const sector = interaction.options.getString('sector_mapa') || 'Sin especificar';
            const notes = interaction.options.getString('notas') || '';

            const created = db.createPrivateServer({
                guild_id: guildId,
                server_name: name,
                server_code: code,
                sector_map: sector,
                notes
            });

            db.addAdminAuditLog(
                { operator_name: officerName, discord_id: interaction.user.id, operator_rank: 'Administración' },
                'CREAR_SERVIDOR_PRIVADO',
                `SRV #${created.id}`,
                `Nuevo servidor: ${created.server_name} (ID: ${created.server_code})`
            );

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await refreshPublicServerBoard(interaction.client, guildId);

            return interaction.editReply({
                content: `✅ **Servidor Privado #${created.id} registrado:** **${created.server_name}** (\`${created.server_code}\`) — Estado inicial: \`[ 🟢 LIBRE ]\`.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'eliminar') {
            if (!hasAdminPermission(interaction)) {
                return interaction.reply({
                    content: '❌ Solo el Administración / Administradores pueden eliminar servidores privados.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const serverId = interaction.options.getInteger('servidor_id');
            const existing = db.getPrivateServerById(serverId, guildId);
            if (!existing) {
                return interaction.reply({
                    content: `⚠️ No existe el servidor privado con ID **#${serverId}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!db.deletePrivateServer(serverId, guildId)) return interaction.reply({ content: 'Libera el servidor antes de eliminarlo.', flags: MessageFlags.Ephemeral });
            db.addAdminAuditLog(
                { operator_name: officerName, discord_id: interaction.user.id, operator_rank: 'Administración' },
                'ELIMINAR_SERVIDOR_PRIVADO',
                `SRV #${serverId}`,
                `Eliminado: ${existing.server_name}`
            );

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await refreshPublicServerBoard(interaction.client, guildId);

            return interaction.editReply({
                content: `🗑️ **Servidor Privado #${serverId} (${existing.server_name}) eliminado del sistema.**`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
