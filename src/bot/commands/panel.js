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

        const embed = new EmbedBuilder()
            .setColor(0x1a3320)
            .setTitle(`🎖️ ${config.military_base_name || 'USMC CLASSIFIED ACCESS TERMINAL'}`)
            .setDescription(`
**[ ATENCIÓN ASPIRANTE // PROTOCOLO DE SEGURIDAD MILITAR ]**

Bienvenido a las instalaciones. Para obtener acceso completo a la base, ver canales tácticos y recibir tu rol de miembro, debes formalizar tu **Expediente de Identificación**.

> 🔹 **Paso 1:** Pulsa el botón **\`[ SOLICITAR ACCESO / VERIFICARSE ]\`** situado al pie de este mensaje.
> 🔹 **Paso 2:** El sistema te entregará un enlace militar seguro hacia tu **Dossier de Reclutamiento Web**.
> 🔹 **Paso 3:** Completa tu declaración jurada en la terminal web retro y transmite tu solicitud al Centro de Comando.

*Nota: Cualquier falsificación en tu declaración causará el rechazo inmediato y sanción disciplinaria.*
            `)
            .addFields(
                { name: '🔒 Nivel de Seguridad', value: '`CLASSIFIED // NIVEL 4`', inline: true },
                { name: '📡 Modo Operativo', value: `\`${config.verification_mode === 'auto' ? 'AUTÓNOMO (INMEDIATO)' : 'REVISIÓN DE ESTADO MAYOR'}\``, inline: true }
            )
            .setImage('https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1000&q=80')
            .setFooter({ text: 'Sistema Autónomo de Verificación Táctica • USMC Defense', iconURL: interaction.guild.iconURL() });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_start_verification')
                .setLabel('SOLICITAR ACCESO / VERIFICARSE')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🛡️')
        );

        await targetChannel.send({ embeds: [embed], components: [row] });

        await interaction.reply({
            content: `✅ **Panel táctico de verificación desplegado exitosamente en** <#${targetChannel.id}>.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
