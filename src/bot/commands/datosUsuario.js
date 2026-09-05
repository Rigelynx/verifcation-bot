const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { hasOfficerPermission } = require('../handlers/permissionHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('datos-usuario')
        .setDescription('Consulta en la base de datos local el expediente militar y respuestas de un usuario')
        .setDefaultMemberPermissions(null)
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario militar a consultar')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!hasOfficerPermission(interaction)) {
            return interaction.reply({
                content: '❌ **Acceso denegado:** Se requieren credenciales de Oficial autorizadas en el panel web o permisos de moderación para consultar expedientes.',
                flags: MessageFlags.Ephemeral
            });
        }

        const targetUser = interaction.options.getUser('usuario');
        const dossier = db.getVerificationByDiscordId(targetUser.id);

        if (!dossier) {
            return interaction.reply({
                content: `❌ **No se encontró ningún expediente archivado para** <@${targetUser.id}> (\`${targetUser.id}\`) en la base de datos local de 50GB. El usuario aún no ha iniciado ni completado su formulario web.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const statusColor = dossier.status === 'APROBADO' ? 0x38e54d : (dossier.status === 'RECHAZADO' ? 0xff3333 : 0xffaa00);

        const embed = new EmbedBuilder()
            .setColor(statusColor)
            .setTitle(`📂 [EXPEDIENTE DE INTELIGENCIA] // ${dossier.username.toUpperCase()}`)
            .setDescription(`Consulta extraída directamente del archivo central local (\`database.sqlite\`).`)
            .setThumbnail(dossier.avatar || targetUser.displayAvatarURL())
            .addFields(
                { name: '👤 Identidad', value: `<@${dossier.discord_id}>`, inline: true },
                { name: '🆔 Discord ID', value: `\`${dossier.discord_id}\``, inline: true },
                { name: '📊 Estado', value: `\`${dossier.status}\``, inline: true },
                { name: '📅 Fecha de Radicación', value: `${dossier.created_at || 'No registrada'}`, inline: true },
                { name: '🔄 Última Actualización', value: `${dossier.updated_at || 'No registrada'}`, inline: true },
                { name: '🎖️ Oficial Resolutor', value: `${dossier.reviewer_id ? `<@${dossier.reviewer_id}>` : 'Sistema / Pendiente'}`, inline: true }
            );

        if (dossier.reason) {
            embed.addFields({ name: '⚠️ Motivo / Observaciones', value: `*${dossier.reason}*`, inline: false });
        }

        // Listar todas las respuestas del cuestionario web
        embed.addFields({ name: '━━━━━━━━━ DECLARACIÓN DEL FORMULARIO WEB ━━━━━━━━━', value: 'Respuestas completadas por el aspirante:', inline: false });

        for (const [pregunta, respuesta] of Object.entries(dossier.answers || {})) {
            embed.addFields({
                name: `🔹 ${pregunta}`,
                value: String(respuesta).substring(0, 1024) || '*Sin respuesta*',
                inline: false
            });
        }

        embed.setFooter({ text: `Base de Datos Local Host • USMC Intelligence • ID #${dossier.id}`, iconURL: interaction.guild.iconURL() });

        await interaction.reply({ embeds: [embed] });
    }
};
