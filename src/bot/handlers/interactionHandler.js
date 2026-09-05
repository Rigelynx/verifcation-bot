const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    MessageFlags
} = require('discord.js');
const db = require('../../database/db');
const { handleStatusChange } = require('./verificationHandler');
const { hasOfficerPermission } = require('./permissionHandler');
const { hasAnyRole } = require('../utils/roleUtils');

async function handleInteraction(interaction, client, commands) {
    // 1. Manejo de Comandos Slash
    if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`[Comando Error: ${interaction.commandName}]`, error);
            const msg = { content: '❌ Error en la ejecución del protocolo militar.', flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(msg).catch(() => {});
            } else {
                await interaction.reply(msg).catch(() => {});
            }
        }
        return;
    }

    // 2. Manejo de Botones Interactivos
    if (interaction.isButton()) {
        const customId = interaction.customId;

        // BOTÓN: Iniciar Verificación desde el Panel
        if (customId === 'btn_start_verification') {
            const user = interaction.user;
            const guild = interaction.guild;
            const config = db.getConfig(guild.id);

            // 1. Comprobar si ya tiene alguno de los roles de verificado en Discord
            const member = interaction.member;
            const hasVerifiedRole = hasAnyRole(member, config.verified_role_id);
            
            // 2. Comprobar si su expediente en base de datos figura como APROBADO
            const existing = db.getVerificationByDiscordId(user.id);
            const isApproved = existing && existing.status === 'APROBADO';

            if (hasVerifiedRole || isApproved) {
                const verifiedEmbed = new EmbedBuilder()
                    .setColor(0x38e54d)
                    .setTitle('🎖️ [CREDENCIALES ACTIVAS // YA ESTÁS VERIFICADO]')
                    .setDescription(`
**¡Atención, soldado!** Tu identidad ya figura como **VALIDADA Y APROBADA** en el Cuartel General.

> 🔹 **Estado:** \`ACREDITACIÓN ACTIVA (CLEARANCE NIVEL 4)\`
> 🔹 **Identidad:** <@${user.id}> (\`${user.tag}\`)
> 🔹 **Permisos:** Ya cuentas con acceso completo a los canales e instalaciones de la base.

*No es necesario que vuelvas a llenar el cuestionario ni que abras la terminal.*
                    `)
                    .setFooter({ text: 'Sistema Autónomo de Verificación Táctica • USMC Defense', iconURL: guild.iconURL() });

                return interaction.reply({
                    embeds: [verifiedEmbed],
                    flags: MessageFlags.Ephemeral
                });
            }

            // 3. Comprobar si su expediente está pendiente de revisión
            if (existing && existing.status === 'PENDIENTE') {
                const pendingEmbed = new EmbedBuilder()
                    .setColor(0xffb000)
                    .setTitle('⏳ [EXPEDIENTE EN TRÁMITE // PENDIENTE DE REVISIÓN]')
                    .setDescription(`
**Aspirante:** Tu declaración jurada ya fue transmitida y está en la mesa de deliberación de los oficiales.

> 🔹 **Estado actual:** \`PENDIENTE DE DICTAMEN DE MANDO\`
> 🔹 **Aviso:** No reenvíes solicitudes duplicadas. Recibirás un mensaje privado (MD) cuando se apruebe.
                    `)
                    .setFooter({ text: 'USMC Defense • No reenvíes formularios duplicados.', iconURL: guild.iconURL() });

                return interaction.reply({
                    embeds: [pendingEmbed],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Generar token efímero y URL militar
            const token = db.createVerificationToken(user.id, user.tag, user.displayAvatarURL(), guild.id);
            const webUrl = process.env.WEB_URL || `http://localhost:${process.env.PORT || 3000}`;
            const verifyLink = `${webUrl}/verify/${token}`;

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('📟 [TERMINAL TÁCTICA DE VERIFICACIÓN ASIGNADA]')
                .setDescription(`
Se ha generado un canal de enlace cifrado de **30 minutos de vigencia**.

Para formalizar tu ingreso a la base militar:
1. Haz clic en el botón de abajo **\`[ INGRESAR A LA TERMINAL ]\`**.
2. Llena con sinceridad las preguntas de tu expediente de servicio.
3. Transmite tu formulario para que el comando evalúe tu rango.
                `)
                .addFields(
                    { name: '👤 Aspirante', value: `${user.tag}`, inline: true },
                    { name: '⏱️ Caducidad de Enlace', value: '30 Minutos', inline: true },
                    { name: '🛡️ Estado de Seguridad', value: '`ENCRIPTACIÓN SHA-256 ACTIVA`', inline: false }
                )
                .setFooter({ text: 'No compartas este enlace con otros usuarios.' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('INGRESAR A LA TERMINAL MILITAR')
                    .setStyle(ButtonStyle.Link)
                    .setURL(verifyLink)
                    .setEmoji('🌐')
            );

            return interaction.reply({
                embeds: [embed],
                components: [row],
                flags: MessageFlags.Ephemeral
            });
        }

        // BOTÓN: Aprobar Solicitud en Canal de Oficiales
        if (customId.startsWith('approve_verify_')) {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({ 
                    content: '❌ **Acceso denegado:** Solo oficiales con el rol autorizado en el panel web o administradores pueden dictaminar expedientes.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const targetDiscordId = customId.replace('approve_verify_', '');
            const updated = db.updateVerificationStatus(targetDiscordId, 'APROBADO', interaction.user.id, 'Aprobado vía Discord por oficial');
            
            await handleStatusChange(client, interaction.guildId, updated, 'APROBADO', null, interaction.user.tag);

            // Actualizar mensaje de oficiales
            const currentEmbed = interaction.message.embeds[0];
            const newEmbed = EmbedBuilder.from(currentEmbed)
                .setColor(0x38e54d)
                .setTitle(`✅ [EXPEDIENTE APROBADO] // ${updated.username.toUpperCase()}`)
                .addFields({ name: '🎖️ Dictamen', value: `Aprobado por <@${interaction.user.id}>`, inline: false });

            await interaction.update({ embeds: [newEmbed], components: [] });
            return;
        }

        // BOTÓN: Denegar Solicitud (Abre Modal de Motivo)
        if (customId.startsWith('reject_verify_')) {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({ 
                    content: '❌ **Acceso denegado:** Solo oficiales con el rol autorizado en el panel web o administradores pueden dictaminar expedientes.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const targetDiscordId = customId.replace('reject_verify_', '');

            const modal = new ModalBuilder()
                .setCustomId(`modal_reject_${targetDiscordId}`)
                .setTitle('DENEGACIÓN DE EXPEDIENTE MILITAR');

            const reasonInput = new TextInputBuilder()
                .setCustomId('reject_reason')
                .setLabel('MOTIVO DEL RECHAZO:')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Ej: Respuestas insuficientes, sospecha de cuenta secundaria, etc.')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            return interaction.showModal(modal);
        }
    }

    // 3. Manejo de Respuestas de Modal (Rechazo con motivo)
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('modal_reject_')) {
            const targetDiscordId = interaction.customId.replace('modal_reject_', '');
            const reason = interaction.fields.getTextInputValue('reject_reason');

            const updated = db.updateVerificationStatus(targetDiscordId, 'RECHAZADO', interaction.user.id, reason);

            await handleStatusChange(client, interaction.guildId, updated, 'RECHAZADO', reason, interaction.user.tag);

            // Actualizar mensaje original de oficiales si está disponible
            if (interaction.message) {
                const currentEmbed = interaction.message.embeds[0];
                const newEmbed = EmbedBuilder.from(currentEmbed)
                    .setColor(0xff3333)
                    .setTitle(`❌ [EXPEDIENTE DENEGADO] // ${updated.username.toUpperCase()}`)
                    .addFields(
                        { name: '🎖️ Dictamen', value: `Denegado por <@${interaction.user.id}>`, inline: true },
                        { name: '📋 Motivo', value: reason, inline: false }
                    );

                await interaction.update({ embeds: [newEmbed], components: [] });
            } else {
                await interaction.reply({ content: `❌ **Expediente de <@${targetDiscordId}> denegado.** Se notificó al usuario.`, flags: MessageFlags.Ephemeral });
            }
        }
    }
}

module.exports = { handleInteraction };
