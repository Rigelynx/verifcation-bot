const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { hasOfficerPermission } = require('../handlers/permissionHandler');
module.exports = {
    data: new SlashCommandBuilder().setName('patrulla').setDescription('Abre el portal web de operaciones, participantes y reportes AAR'),
    async execute(interaction) {
        if (!hasOfficerPermission(interaction)) return interaction.reply({ content: 'El portal de operaciones está reservado a responsables autorizados.', flags: MessageFlags.Ephemeral });
        const base = (process.env.WEB_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
        const embed = new EmbedBuilder().setColor(0xb8cba6)
            .setTitle('🛰️ PORTAL DE OPERACIONES')
            .setDescription(`**Tu unidad. Tus operaciones.**\n\n1. Pulsa **Abrir portal**.\n2. Inicia sesión con tu cuenta de **Discord**.\n3. Consulta los eventos y gestiona las operaciones a tu cargo.\n\nLos comandos habituales siguen disponibles.`)
            .setFooter({ text: 'Comunidad · Acceso reservado al personal autorizado' });
        if (base.startsWith('https://')) embed.setImage(`${base}/media/patrol-field.png`);
        return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Abrir portal').setEmoji('🛰️').setStyle(ButtonStyle.Link).setURL(`${base}/patrullas?guild=${interaction.guildId}`))] });
    }
};
