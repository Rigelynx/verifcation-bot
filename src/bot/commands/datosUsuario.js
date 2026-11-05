const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { hasOfficerPermission } = require('../handlers/permissionHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('datos-usuario')
        .setDescription('Consulta en la base de datos local el expediente comunitario y respuestas de un usuario')
        .setDefaultMemberPermissions(null)
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario comunitario a consultar')
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
                content: `❌ **No se encontró ningún expediente archivado para** <@${targetUser.id}> (\`${targetUser.id}\`) en este servidor. El usuario aún no ha iniciado ni completado su formulario web.`,
                flags: MessageFlags.Ephemeral
            });
        }

        return interaction.reply({...require('../utils/verificationReview').buildVerificationReview(dossier,interaction.guild,0,true),flags:MessageFlags.Ephemeral});
    }
};
