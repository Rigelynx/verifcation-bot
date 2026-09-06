const { EmbedBuilder } = require('discord.js');
const economyDb = require('../../database/economyDb');

let discordClient = null;

function initEconomyLogger(client) {
    discordClient = client;
    if (typeof economyDb.setOnTransactionLogged === 'function') {
        economyDb.setOnTransactionLogged(sendEconomyLog);
    }
}

const ACTION_INFO = {
    'WORK': {
        title: '🛠️ [REGISTRO DE GUARDIA // SALARIO MILITAR]',
        color: 0x38e54d,
        label: 'Salario por Guardia'
    },
    'CRIME': {
        title: '🚨 [INCURSIÓN ENCUBIERTA // OPERACIÓN ILEGAL]',
        color: 0xff4444,
        label: 'Operación Clandestina'
    },
    'ROB': {
        title: '⚔️ [REPORTE DE ASALTO TÁCTICO]',
        color: 0xff8800,
        label: 'Asalto entre Reclutas'
    },
    'PAY': {
        title: '💸 [TRANSFERENCIA FINANCIERA MILITAR]',
        color: 0x33ccff,
        label: 'Transferencia Directa'
    },
    'EVENT_CLAIM': {
        title: '🎖️ [PAGA DE OPERACIÓN / EVENTO MILITAR]',
        color: 0x38e54d,
        label: 'Compensación de Evento'
    },
    'BUY_ITEM': {
        title: '🛒 [ADQUISICIÓN EN ARMERÍA / TIENDA]',
        color: 0x00ccff,
        label: 'Compra de Suministros'
    },
    'DEP': {
        title: '🏦 [DEPÓSITO EN CAJA FUERTE MILITAR]',
        color: 0xa0baa4,
        label: 'Depósito Bancario'
    },
    'WITH': {
        title: '💵 [RETIRO DE CAJA FUERTE MILITAR]',
        color: 0xa0baa4,
        label: 'Retiro a Cartera'
    },
    'ADMIN_ADJUST': {
        title: '⚙️ [AJUSTE ADMINISTRATIVO DE TESORERÍA]',
        color: 0xffaa00,
        label: 'Ajuste de Mando'
    },
    'BONUS_CLAIM': {
        title: '🎁 [RECLAMO DE BONO MILITAR // PANEL]',
        color: 0xd4af37,
        label: 'Reclamo de Bono'
    },
    'BONUS_GIVE': {
        title: '🎖️ [CONCESIÓN DE BONO POR OFICIAL]',
        color: 0xd4af37,
        label: 'Bono Directo de Mando'
    },
    'MASS_BONUS': {
        title: '📢 [GRATIFICACIÓN MASIVA DE BRIGADA]',
        color: 0xd4af37,
        label: 'Bono Masivo a Tropa'
    }
};

async function sendEconomyLog({ discordId, type, amount, details = '', guildId = null }) {
    if (!discordClient || !discordClient.isReady()) return;

    try {
        const targetGuildId = guildId || process.env.GUILD_ID || 'GLOBAL';
        const settings = economyDb.getEconomySettings(targetGuildId);
        if (!settings || !settings.log_channel_id) return;

        const channel = discordClient.channels.cache.get(settings.log_channel_id) 
            || await discordClient.channels.fetch(settings.log_channel_id).catch(() => null);

        if (!channel || !channel.isTextBased()) return;

        const sym = settings.currency_symbol || '$';
        const info = ACTION_INFO[type] || {
            title: `📜 [MOVIMIENTO FINANCIERO // ${type}]`,
            color: 0x38e54d,
            label: type
        };

        const isPositive = amount >= 0;
        const sign = isPositive ? '+' : '-';
        const formattedAmount = `${sign}${sym}${Math.abs(amount).toLocaleString()}`;

        let userMention = discordId === 'GLOBAL' ? 'Personal Militar General' : `<@${discordId}> (\`${discordId}\`)`;
        let userAvatar = null;

        if (discordId !== 'GLOBAL') {
            const user = discordClient.users.cache.get(discordId) || await discordClient.users.fetch(discordId).catch(() => null);
            if (user) {
                userAvatar = user.displayAvatarURL();
            }
        }

        const embed = new EmbedBuilder()
            .setColor(info.color)
            .setTitle(info.title)
            .addFields(
                { name: '👤 Combatiente / Destinatario', value: userMention, inline: true },
                { name: '📊 Operación', value: `\`${info.label}\``, inline: true },
                { name: '💵 Monto', value: `**\`${formattedAmount}\`**`, inline: true }
            );

        if (details && details.trim().length > 0) {
            embed.addFields({ name: '📝 Concepto / Detalles', value: details.substring(0, 1024), inline: false });
        }

        if (discordId !== 'GLOBAL') {
            const acc = economyDb.getAccount(discordId, targetGuildId);
            embed.addFields({
                name: '💼 Balance Posterior',
                value: `💵 Cartera: \`${sym}${acc.wallet.toLocaleString()}\` │ 🏦 Caja Fuerte: \`${sym}${acc.bank.toLocaleString()}\``,
                inline: false
            });
        }

        if (userAvatar) {
            embed.setThumbnail(userAvatar);
        }

        embed.setFooter({ text: 'Sistema de Tesorería y Auditoría Financiera • USMC Defense' });
        embed.setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
        console.error('[Error enviando log de economía a Discord]:', err.message);
    }
}

module.exports = {
    initEconomyLogger,
    sendEconomyLog
};
