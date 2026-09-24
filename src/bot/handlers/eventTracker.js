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
                const activeEvents = economyDb.getActiveEvents(guild.id);
                for (const activeEvent of activeEvents) {
                    if (activeEvent.event_type !== 'VOICE' && activeEvent.event_type !== 'HYBRID') continue;
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

        const member = newState.member;
        if (!member || member.user.bot) return;

        for (const activeEvent of economyDb.getActiveEvents(guild.id)) {
            if (activeEvent.event_type !== 'VOICE' && activeEvent.event_type !== 'HYBRID') continue;
            // Entró al canal objetivo del evento
            if (newState.channelId === activeEvent.target_channel_id) {
                economyDb.recordAttendanceHeartbeat(activeEvent.id, member.id, member.user.tag, 5);
            }
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

        for (const activeEvent of economyDb.getActiveEvents(message.guild.id)) {
            if (activeEvent.event_type !== 'TEXT' && activeEvent.event_type !== 'HYBRID') continue;
            if (message.channel.id === activeEvent.target_channel_id) {
                economyDb.recordChatActivity(activeEvent.id, message.author.id, message.author.tag);
            }
        }
    } catch (err) {
        console.error('[Event MessageCreate Error]:', err.message);
    }
}

module.exports = {
    initEventMonitoring,
    handleVoiceStateUpdate,
    handleChatMessage
};
