const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getAssistant } = require('../../assistant/service');
module.exports = {
    data: new SlashCommandBuilder().setName('asistente').setDescription('Asistente privado para consultar y gestionar el servidor')
        .addSubcommand(sub => sub.setName('preguntar').setDescription('Conversa, consulta actividad y gestiona canales, roles y permisos')
            .addStringOption(option => option.setName('peticion').setDescription('Qué necesitas que haga el asistente').setRequired(true).setMaxLength(4000)))
        .addSubcommand(sub => sub.setName('web').setDescription('Abre tu chat privado con el asistente en la web'))
        .addSubcommand(sub => sub.setName('nuevo').setDescription('Empieza un chat sin el contexto anterior; conserva tus otras conversaciones')),
    async execute(interaction) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const assistant = getAssistant(interaction.client);
        try {
            if (interaction.options.getSubcommand() === 'nuevo') {
                await assistant.newChat(interaction.guildId, interaction.user.id, interaction.id);
                return interaction.editReply({ content: '✨ Nuevo chat listo. Usa `/asistente preguntar` para empezar con el contexto vacío. Las conversaciones anteriores siguen disponibles en la web. El cambio también se aplica allí.', allowedMentions: { parse: [] } });
            }
            if (interaction.options.getSubcommand() === 'web') {
                await assistant.access(interaction.guildId, interaction.user.id);
                const base = (process.env.WEB_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
                return interaction.editReply({ content: 'Tu asistente privado: entra con tu cuenta de Discord. Web y Discord comparten la conversación activa. Puedes empezar otra con Nuevo chat o `/asistente nuevo`.',
                    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir asistente').setURL(`${base}/asistente?guild=${interaction.guildId}`))] });
            }
            await interaction.editReply({ content: '🧠 Consultando el asistente… El proveedor puede tardar en responder. Te avisaré aquí al terminar.', allowedMentions: { parse: [] } });
            const result = await assistant.run({ guildId: interaction.guildId, userId: interaction.user.id,
                prompt: interaction.options.getString('peticion'), requestId: interaction.id });
            const summary = result.trace.length ? `\n\nHerramientas: ${result.trace.length} · Cambios: ${result.trace.filter(row => row.changed || row.created).length} · Creaciones: ${result.trace.filter(row => row.created).length} · Borrados: ${result.trace.filter(row => row.deleted).length}.` : '';
            return interaction.editReply({ content: result.answer.slice(0, 1750) + (result.answer.length > 1750 ? '\nRespuesta completa en el archivo adjunto.' : '') + summary,
                allowedMentions: { parse: [] }, files: result.answer.length > 1750 ? [new AttachmentBuilder(Buffer.from(result.answer), { name: 'respuesta-asistente.txt' })] : [] });
        } catch (error) { return interaction.editReply({ content: error.status ? error.message : 'No pude completar la consulta del asistente.', allowedMentions: { parse: [] } }); }
    }
};
