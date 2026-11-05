const {SlashCommandBuilder,MessageFlags}=require('discord.js');
const {buildHelpPanel}=require('../utils/helpPanel');
module.exports={data:new SlashCommandBuilder().setName('help').setDescription('Consulta las funciones y accesos de esta comunidad'),buildHelpPanel,
    async execute(interaction){return interaction.reply({...buildHelpPanel(1,interaction.guildId,interaction.member,interaction.guild),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});}};
