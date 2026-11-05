const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { hasAdminPermission } = require('../handlers/permissionHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-verificacion')
        .setDescription('Despliega el Panel Militar Táctico de Verificación con botón interactivo')
        .setDefaultMemberPermissions(null)
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde se publicará el panel (por defecto el actual)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!hasAdminPermission(interaction)) {
            return interaction.reply({
                content: '❌ **Acceso denegado:** Se requieren credenciales de Administrador Militar o rol autorizado en el panel web para desplegar el panel.',
                flags: MessageFlags.Ephemeral
            });
        }

        const targetChannel = interaction.options.getChannel('canal') || interaction.channel;
        const config = db.getConfig(interaction.guildId);

        await targetChannel.send(buildVerificationPanel(interaction.guild, config));
        await interaction.reply({ content: `✅ **Panel táctico de verificación desplegado exitosamente en** <#${targetChannel.id}>.`, flags: MessageFlags.Ephemeral });
    },
    buildVerificationPanel
};

function buildVerificationPanel(guild, config, presentation={}) {
    const {nativePanel}=require('../utils/neutralPanels');
    const automatic=config.verification_mode==='auto';
    const baseTitle=config.military_base_name==='USMC CLASSIFIED ACCESS TERMINAL'?'Acceso a la comunidad':config.military_base_name;
    return nativePanel({guildId:guild.id,kind:'verification',hero:true,
        title:presentation.title||baseTitle||'Acceso a la comunidad',
        description:presentation.description??'Prepara tu solicitud de ingreso y consulta el proceso de verificación.',color:presentation.color?parseInt(presentation.color.replace('#',''),16):undefined,
        cards:[{title:'01 · Completa tu solicitud',text:'Abre tu enlace personal e inicia sesión con Discord. Responde las preguntas del formulario.'},
            {title:'02 · Recibe tu acceso',text:automatic?'El acceso se concede automáticamente al enviar una solicitud válida.':'El equipo de responsables revisará tu solicitud. Recibirás el resultado por mensaje privado.'}],
        footer:automatic?'Aprobación automática · Un formulario por cuenta':'Revisión manual · Puedes consultar el estado desde el botón',
        rows:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_start_verification').setLabel('Iniciar verificación').setStyle(ButtonStyle.Primary).setEmoji('🛡️'))]});
}
