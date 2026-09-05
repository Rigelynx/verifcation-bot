const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { hasOfficerPermission } = require('../handlers/permissionHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mod')
        .setDescription('Comandos de moderación militar y orden en la base')
        .setDefaultMemberPermissions(null)
        .addSubcommand(sub =>
            sub.setName('ban')
                .setDescription('Expulsa y veta permanentemente a un miembro')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a sancionar').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('Motivo de la corte marcial / baneo').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('kick')
                .setDescription('Expulsa a un miembro de las instalaciones')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a expulsar').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('Motivo de la expulsión').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('timeout')
                .setDescription('Aisla a un miembro en celda de castigo (Timeout)')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a aislar').setRequired(true))
                .addIntegerOption(opt => opt.setName('minutos').setDescription('Duración del aislamiento en minutos').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('Motivo del aislamiento').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('purge')
                .setDescription('Purga de transmisiones (elimina mensajes masivos)')
                .addIntegerOption(opt => opt.setName('cantidad').setDescription('Cantidad de transmisiones a eliminar (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
        ),

    async execute(interaction) {
        if (!hasOfficerPermission(interaction)) {
            return interaction.reply({
                content: '❌ **Acceso denegado:** Solo oficiales con el rol autorizado en el panel web o administradores pueden ejecutar protocolos disciplinarios.',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const config = db.getConfig(guildId);

        if (subcommand === 'ban') {
            const targetUser = interaction.options.getUser('usuario');
            const reason = interaction.options.getString('motivo') || 'Violación de directivas militares';

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (member && !member.bannable) {
                return interaction.reply({ content: '❌ No es posible sancionar a este miembro (jerarquía superior o permisos insuficientes).', flags: MessageFlags.Ephemeral });
            }

            targetUser.send(`🚨 **[CORTE MARCIAL USMC]** Has sido vetado de **${interaction.guild.name}**. Motivo: *${reason}*.`).catch(() => {});

            await interaction.guild.bans.create(targetUser.id, { reason: `${reason} | Por: ${interaction.user.tag}` });

            const embed = new EmbedBuilder()
                .setColor(0xff3333)
                .setTitle('⚖️ [SANCIÓN DISCIPLINARIA // VETO PERMANENTE]')
                .addFields(
                    { name: '👤 Miembro Sancionado', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
                    { name: '🎖️ Oficial a Cargo', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📋 Motivo', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            sendAuditLog(interaction.guild, config.log_channel_id, embed);
        }

        if (subcommand === 'kick') {
            const targetUser = interaction.options.getUser('usuario');
            const reason = interaction.options.getString('motivo') || 'Expulsión ordenada por el mando';

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member || !member.kickable) {
                return interaction.reply({ content: '❌ No se puede expulsar a este usuario (no está en la base o tiene jerarquía superior).', flags: MessageFlags.Ephemeral });
            }

            targetUser.send(`⚠️ **[DESPACHO DISCIPLINARIO]** Has sido expulsado de **${interaction.guild.name}**. Motivo: *${reason}*.`).catch(() => {});

            await member.kick(`${reason} | Por: ${interaction.user.tag}`);

            const embed = new EmbedBuilder()
                .setColor(0xffaa00)
                .setTitle('🚪 [DESPACHO DISCIPLINARIO // EXPULSIÓN]')
                .addFields(
                    { name: '👤 Recluta / Miembro', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
                    { name: '🎖️ Oficial', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📋 Motivo', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            sendAuditLog(interaction.guild, config.log_channel_id, embed);
        }

        if (subcommand === 'timeout') {
            const targetUser = interaction.options.getUser('usuario');
            const minutes = interaction.options.getInteger('minutos');
            const reason = interaction.options.getString('motivo') || 'Aislamiento preventivo';

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member || !member.moderatable) {
                return interaction.reply({ content: '❌ No se puede aislar a este miembro.', flags: MessageFlags.Ephemeral });
            }

            const durationMs = minutes * 60 * 1000;
            await member.timeout(durationMs, `${reason} | Por: ${interaction.user.tag}`);

            const embed = new EmbedBuilder()
                .setColor(0xe5b338)
                .setTitle('⏳ [AISLAMIENTO PREVENTIVO // CELDA DE CASTIGO]')
                .addFields(
                    { name: '👤 Recluta', value: `<@${targetUser.id}>`, inline: true },
                    { name: '⏱️ Duración', value: `${minutes} minutos`, inline: true },
                    { name: '🎖️ Oficial', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📋 Motivo', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            sendAuditLog(interaction.guild, config.log_channel_id, embed);
        }

        if (subcommand === 'purge') {
            const amount = interaction.options.getInteger('cantidad');
            const deleted = await interaction.channel.bulkDelete(amount, true);

            await interaction.reply({
                content: `🧹 **Purga táctica completada:** Se han eliminado \`${deleted.size}\` transmisiones del canal.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

function sendAuditLog(guild, channelId, embed) {
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (channel && channel.isTextBased()) {
        channel.send({ embeds: [embed] }).catch(() => {});
    }
}
