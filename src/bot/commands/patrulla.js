const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { hasOfficerPermission } = require('../handlers/permissionHandler');
module.exports = {
    data: new SlashCommandBuilder().setName('patrulla').setDescription('Abre el portal web de operaciones, participantes y reportes AAR'),
    async execute(interaction) {
        if (!hasOfficerPermission(interaction)) return interaction.reply({ content: 'El portal de operaciones está reservado a responsables autorizados.', flags: MessageFlags.Ephemeral });
        const base = (process.env.WEB_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
        const {nativePanel}=require('../utils/neutralPanels');
        const payload=nativePanel({guildId:interaction.guildId,kind:'events',hero:true,title:'Portal de operaciones',description:'Consulta tus eventos, participantes y reportes con tu cuenta de Discord.',
            rows:[new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Abrir portal').setStyle(ButtonStyle.Link).setURL(`${base}/patrullas?guild=${interaction.guildId}`))]});
        return interaction.reply({...payload,flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
    }
};
