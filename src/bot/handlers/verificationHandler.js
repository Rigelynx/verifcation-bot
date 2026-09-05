const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const { parseRoleIds } = require('../utils/roleUtils');

async function handleNewSubmission(client, guildId, record, mode) {
    try {
        const config = db.getConfig(guildId);
        const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
        if (!guild) return;

        // MODO AUTOMÁTICO: Otorga el rol inmediatamente
        if (mode === 'auto') {
            await applyVerifiedRole(guild, record.discord_id, config);
            sendDirectMessage(client, record.discord_id, `🎖️ **[COMUNICADO USMC]** Tu verificación militar ha sido aprobada de manera automática. Ya posees acceso a las instalaciones.`);
            logToChannel(guild, config.log_channel_id, createAuditEmbed(record, 'AUTOMÁTICO', 'Verificado por sistema autónomo'));
            return;
        }

        // MODO MANUAL: Envía expediente al canal de oficiales con botones interactivos
        if (config.review_channel_id) {
            const reviewChannel = guild.channels.cache.get(config.review_channel_id);
            if (reviewChannel && reviewChannel.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setColor(0x38e54d)
                    .setTitle(`🛡️ [NUEVO EXPEDIENTE DE RECLUTA] // ${record.username.toUpperCase()}`)
                    .setDescription(`Un aspirante ha completado el formulario táctico y espera resolución de mando.`)
                    .setThumbnail(record.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png')
                    .addFields(
                        { name: '👤 Aspirante', value: `<@${record.discord_id}> (\`${record.discord_id}\`)`, inline: true },
                        { name: '📅 Fecha Zulu', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                        { name: '📋 Estado', value: `\`PENDIENTE DE RESOLUCIÓN\``, inline: true }
                    );

                // Agregar respuestas del cuestionario
                for (const [preg, resp] of Object.entries(record.answers || {})) {
                    embed.addFields({
                        name: `🔹 ${preg}`,
                        value: String(resp).substring(0, 1024) || 'Sin respuesta',
                        inline: false
                    });
                }

                embed.setFooter({ text: 'USMC Military Defense Network • Terminal de Oficiales', iconURL: guild.iconURL() });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_verify_${record.discord_id}`)
                        .setLabel('APROBAR ACCESO')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId(`reject_verify_${record.discord_id}`)
                        .setLabel('DENEGAR ACCESO')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                );

                await reviewChannel.send({ embeds: [embed], components: [row] });
            }
        }

    } catch (err) {
        console.error('[VerificationHandler] Error al procesar nueva solicitud:', err);
    }
}

async function handleStatusChange(client, guildId, record, action, reason, moderatorTag = 'Oficial de Mando') {
    try {
        const config = db.getConfig(guildId);
        const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
        if (!guild) return;

        if (action === 'APROBADO') {
            await applyVerifiedRole(guild, record.discord_id, config);
            sendDirectMessage(client, record.discord_id, `🎖️ **[COMUNICADO USMC]** ¡Felicitaciones recluta! Tu expediente ha sido **APROBADO** por ${moderatorTag}. Ahora cuentas con acreditación oficial.`);
            logToChannel(guild, config.log_channel_id, createAuditEmbed(record, 'APROBADO', `Aprobado por ${moderatorTag}`));
        } else if (action === 'RECHAZADO') {
            sendDirectMessage(client, record.discord_id, `⚠️ **[COMUNICADO USMC]** Tu solicitud de verificación ha sido **DENEGADA**. Motivo: *${reason || 'No cumple requisitos mínimos'}*. Puedes contactar con un oficial si crees que es un error.`);
            logToChannel(guild, config.log_channel_id, createAuditEmbed(record, 'RECHAZADO', `Denegado por ${moderatorTag}. Motivo: ${reason || 'N/A'}`));
        }
    } catch (err) {
        console.error('[VerificationHandler] Error al actualizar estado:', err);
    }
}

async function applyVerifiedRole(guild, discordId, config) {
    try {
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (!member) return;

        // Soporte para múltiples roles de verificación otorgados al aprobarse
        for (const roleId of parseRoleIds(config.verified_role_id)) {
            await member.roles.add(roleId).catch(err => {
                console.error(`[VerificationHandler] Error asignando rol ${roleId}:`, err.message);
            });
        }

        // Soporte para remover uno o más roles no verificados
        for (const roleId of parseRoleIds(config.unverified_role_id)) {
            await member.roles.remove(roleId).catch(err => {
                console.error(`[VerificationHandler] Error removiendo rol no verificado ${roleId}:`, err.message);
            });
        }
    } catch (e) {
        console.error('[VerificationHandler] Error asignando roles:', e);
    }
}

function sendDirectMessage(client, discordId, content) {
    client.users.fetch(discordId).then(user => {
        user.send(content).catch(() => {});
    }).catch(() => {});
}

function logToChannel(guild, channelId, embed) {
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (channel && channel.isTextBased()) {
        channel.send({ embeds: [embed] }).catch(() => {});
    }
}

function createAuditEmbed(record, status, note) {
    const color = status === 'APROBADO' ? 0x38e54d : (status === 'RECHAZADO' ? 0xff3333 : 0xffaa00);
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(`📑 [REGISTRO DE AUDITORÍA MILITAR] // ${record.username}`)
        .addFields(
            { name: 'Recluta', value: `<@${record.discord_id}> (\`${record.discord_id}\`)`, inline: true },
            { name: 'Resolución', value: `\`${status}\``, inline: true },
            { name: 'Detalle', value: note, inline: false }
        )
        .setTimestamp();
}

module.exports = {
    handleNewSubmission,
    handleStatusChange,
    applyVerifiedRole
};
