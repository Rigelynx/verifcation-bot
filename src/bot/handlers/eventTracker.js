const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const economyDb = require('../../database/economyDb');

// Intervalo en segundos para el latido de presencia en voz
const VOICE_HEARTBEAT_INTERVAL = 15;
let heartbeatTimer = null;

/**
 * Inicia el temporizador de sondeo de presencia para eventos de voz activos
 */
function initEventMonitoring(client) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(async () => {
        try {
            if (!client || !client.isReady()) return;

            // Recorrer todos los servidores donde está el bot
            for (const guild of client.guilds.cache.values()) {
                const activeEvent = economyDb.getActiveEvent(guild.id);
                if (!activeEvent) continue;

                if (activeEvent.event_type === 'VOICE' || activeEvent.event_type === 'HYBRID') {
                    const channel = guild.channels.cache.get(activeEvent.target_channel_id);
                    if (channel && channel.isVoiceBased()) {
                        // Miembros actualmente conectados en la sala de voz
                        for (const [memberId, member] of channel.members) {
                            if (member.user.bot) continue;
                            economyDb.recordAttendanceHeartbeat(
                                activeEvent.id,
                                memberId,
                                member.user.tag,
                                VOICE_HEARTBEAT_INTERVAL
                            );
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[Event Tracker Heartbeat Error]:', err.message);
        }
    }, VOICE_HEARTBEAT_INTERVAL * 1000);
}

/**
 * Listener para eventos de voz (voiceStateUpdate)
 */
function handleVoiceStateUpdate(oldState, newState) {
    try {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        const activeEvent = economyDb.getActiveEvent(guild.id);
        if (!activeEvent) return;

        if (activeEvent.event_type !== 'VOICE' && activeEvent.event_type !== 'HYBRID') return;

        const member = newState.member;
        if (!member || member.user.bot) return;

        // Entró al canal objetivo del evento
        if (newState.channelId === activeEvent.target_channel_id) {
            economyDb.recordAttendanceHeartbeat(activeEvent.id, member.id, member.user.tag, 5);
        }
    } catch (err) {
        console.error('[VoiceStateUpdate Handler Error]:', err.message);
    }
}

/**
 * Listener para eventos de chat en texto (messageCreate)
 */
function handleChatMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;

        const activeEvent = economyDb.getActiveEvent(message.guild.id);
        if (!activeEvent) return;

        if (activeEvent.event_type !== 'TEXT' && activeEvent.event_type !== 'HYBRID') return;

        if (message.channel.id === activeEvent.target_channel_id) {
            economyDb.recordChatActivity(activeEvent.id, message.author.id, message.author.tag);
        }
    } catch (err) {
        console.error('[Event MessageCreate Error]:', err.message);
    }
}

/**
 * Finaliza un evento activo y publica el mensaje con botón de cobro en Discord
 */
async function finishAndPublishEvent(client, eventId) {

    const event = economyDb.getEventById(eventId);
    if (!event) throw new Error('Evento no encontrado');

    const guild = client.guilds.cache.get(event.guild_id);
    if (!guild) throw new Error('Servidor de Discord no encontrado');

    const payoutChannel = guild.channels.cache.get(event.payout_channel_id) || guild.channels.cache.first();
    if (!payoutChannel || !payoutChannel.isTextBased()) {
        throw new Error('Canal de publicación de pagos no encontrado o no es de texto.');
    }

    // Finalizar en DB y calcular elegibilidad
    const updatedEvent = economyDb.finalizeEvent(eventId);
    const attendance = economyDb.getEventAttendance(eventId);
    const eligibleCount = attendance.filter(a => a.is_eligible === 1).length;

    const settings = economyDb.getEconomySettings(event.guild_id);
    const currencySym = settings ? settings.currency_symbol : '$';

    const deadlineHours = event.claim_deadline_hours || 24;
    const expiresTimestamp = `<t:${updatedEvent.claim_expires_at}:R>`;

    const embed = new EmbedBuilder()
        .setColor(0x38e54d)
        .setTitle(`🎖️ [OPERACIÓN CONCLUIDA] // ${event.name.toUpperCase()}`)
        .setDescription(`
**La misión militar ha finalizado satisfactoriamente.**

El mando del Cuartel General ha liberado la nómina de fondos para todos los reclutas y oficiales que cumplieron con la presencia requerida de principio a fin.

> 💰 **Paga Base:** \`${currencySym}${event.base_reward.toLocaleString()}\` *(+ Bonificación por Rango Militar)*
> ⏱️ **Tolerancia a Desconexión Aplicada:** \`${event.grace_period_minutes} min\`
> 👥 **Personal Detectado:** \`${attendance.length}\` reclutas
> ✅ **Personal Elegible:** \`${eligibleCount}\` aptos para cobro
> ⏳ **Plazo Límite de Reclamo:** Expira en ${expiresTimestamp}
        `)
        .addFields(
            {
                name: '📋 Instrucciones de Cobro',
                value: 'Haz clic en el botón verde inferior **`[ RECLAMAR PAGA MILITAR ]`**. El sistema verificará tu asistencia táctica y depositará los fondos directamente en tu cartera.',
                inline: false
            }
        )
        .setFooter({ text: `Operación ID: #${event.id} • USMC Tactical Payout System`, iconURL: guild.iconURL() })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`claim_event_${event.id}`)
            .setLabel('RECLAMAR PAGA MILITAR')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💵')
    );

    const sentMessage = await payoutChannel.send({ embeds: [embed], components: [row] });

    // Guardar el message_id en la base de datos
    economyDb.finalizeEvent(eventId, sentMessage.id);

    return { event: updatedEvent, eligibleCount, totalAttendees: attendance.length };
}

module.exports = {
    initEventMonitoring,
    handleVoiceStateUpdate,
    handleChatMessage,
    finishAndPublishEvent
};
