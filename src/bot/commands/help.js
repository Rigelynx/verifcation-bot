const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');
const economyDb = require('../../database/economyDb');

const TOTAL_PAGES = 5;

function buildHelpPanel(page = 1, guildId = 'GLOBAL') {
    const settings = economyDb.getEconomySettings(guildId);
    const sym = settings?.currency_symbol || '$';
    const currentPage = Math.min(Math.max(1, page), TOTAL_PAGES);
    const embed = new EmbedBuilder().setTimestamp();

    switch (currentPage) {
        case 1:
            embed.setColor(0x00b4d8)
                .setTitle('🎖️ [MANUAL TÁCTICO // CUARTEL DE MANDO USMC]')
                .setDescription(`**SISTEMA CENTRAL DE OPERACIONES, VERIFICACIÓN Y ECONOMÍA**\nEste bot centraliza el acceso al servidor, los expedientes, la economía, las operaciones y la moderación.\n\n> 🛡️ **Base:** USMC Tactical Operations\n> ⚡ **Tecnología:** Discord.js, SQLite local y Dashboard Web Retro\n> 🔐 **Seguridad:** permisos por rango y registros de auditoría\n\n### 📑 SECCIONES\n• **Página 1/5:** Inicio rápido y funcionamiento general\n• **Página 2/5:** Verificación y expedientes\n• **Página 3/5:** Economía, bonos y transferencias\n• **Página 4/5:** Tienda, inventario y operaciones\n• **Página 5/5:** Moderación, permisos y panel web`)
                .addFields(
                    { name: '🚀 Inicio rápido para reclutas', value: '1. Pulsa el botón de verificación del canal de bienvenida.\n2. Completa el formulario web y espera la resolución si la revisión es manual.\n3. Consulta tu saldo con `/economia balance` y la armería con `/tienda panel`.', inline: false },
                    { name: '🧭 Cómo usar este manual', value: 'Utiliza los botones de navegación o el selector inferior. Esta ayuda se muestra de forma privada para no llenar el canal.', inline: false }
                );
            break;
        case 2:
            embed.setColor(0x2d6a4f)
                .setTitle('🎖️ [MANUAL // VERIFICACIÓN Y EXPEDIENTES]')
                .setDescription('**CONTROL DE IDENTIDAD Y ACCESO**\nEl sistema registra las respuestas del aspirante, conserva su estado y aplica los roles configurados. La aprobación puede ser automática o manual.')
                .addFields(
                    { name: '📋 `/panel-verificacion [canal]`', value: 'Publica el panel de bienvenida con el botón para solicitar acceso y abrir la terminal web.', inline: false },
                    { name: '🔍 `/datos-usuario <usuario>`', value: '*(Oficiales)* Consulta el expediente completo: estado, respuestas, fechas, motivo y oficial resolutor.', inline: false },
                    { name: '✅ `/admin verificar-manual <usuario> [motivo]`', value: '*(Oficiales)* Aprueba manualmente a un usuario y sincroniza los roles configurados.', inline: false },
                    { name: '❌ `/admin desverificar <usuario> [motivo]`', value: '*(Oficiales)* Revoca la acreditación y retira los roles de verificado.', inline: false },
                    { name: '🌐 `/admin panel-web`', value: 'Muestra el acceso al Centro de Mando Web. La clave maestra debe mantenerse privada.', inline: false },
                    { name: '⚙️ `/admin configurar [...]`', value: 'Configura roles, canales de revisión y auditoría, y el modo manual o automático.', inline: false }
                );
            break;
        case 3:
            embed.setColor(0xffb703)
                .setTitle('💰 [MANUAL // ECONOMÍA MILITAR Y BONOS]')
                .setDescription(`**SISTEMA MONETARIO DEL BATALLÓN**\nLos créditos (**${sym}**) se guardan por usuario y sirven para transferencias, compras y recompensas.`)
                .addFields(
                    { name: '💵 `/economia balance [usuario]`', value: 'Consulta cartera, banco y patrimonio total.', inline: false },
                    { name: '🛡️ `/economia trabajar`', value: 'Realiza un turno de servicio y recibe una recompensa respetando el cooldown configurado.', inline: false },
                    { name: '🥷 `/economia crimen`', value: 'Participa en una acción de riesgo con posibilidad de ganar o perder créditos.', inline: false },
                    { name: '🚨 `/economia robar <usuario>`', value: 'Intenta sustraer fondos de la cartera de otro usuario según las reglas configuradas.', inline: false },
                    { name: '🏦 `/economia depositar <monto/all>` · `/economia retirar <monto/all>`', value: 'Mueve créditos entre la cartera y el banco.', inline: false },
                    { name: '🤝 `/economia pagar <usuario> <monto>`', value: 'Transfiere créditos desde tu cartera a otro miembro.', inline: false },
                    { name: '🏆 `/economia ranking`', value: 'Consulta el escalafón económico del servidor.', inline: false },
                    { name: '🎁 `/bono reclamar` · `/bono panel [canal] [id]`', value: 'Reclama una asignación o publica el panel interactivo de cobro.', inline: false },
                    { name: '➕ `/bono crear <monto> <titulo> [modo] [horas]`', value: '*(Oficiales)* Crea bonos de una sola reclamación o con cooldown.', inline: false },
                    { name: '📋 `/bono lista` · `/bono eliminar <id>` · `/bono reset_reclamos <id>`', value: '*(Oficiales)* Consulta y administra los bonos existentes.', inline: false },
                    { name: '⚡ `/bono dar <usuario> <monto>` · `/bono masivo <monto>`', value: '*(Oficiales)* Entrega créditos a un miembro o a todo el batallón.', inline: false }
                );
            break;
        case 4:
            embed.setColor(0x38e54d)
                .setTitle('🛒 [MANUAL // TIENDA Y OPERACIONES]')
                .setDescription('**INTENDENCIA Y GESTIÓN DE MISIONES**\nLa tienda administra artículos e inventarios. El módulo de eventos organiza participantes, asistencia y pagos.')
                .addFields(
                    { name: '🛒 `/tienda panel`', value: 'Abre el catálogo interactivo con paginación, saldo actualizado y compra rápida.', inline: false },
                    { name: '📦 `/tienda comprar <id>` · `/tienda inventario`', value: 'Compra un artículo por su ID y revisa tu inventario y beneficios obtenidos.', inline: false },
                    { name: '📢 `/evento convocar <nombre> <paga_base> [...]`', value: '*(Oficiales)* Crea una operación con paga, cupo, plazo y canales configurables.', inline: false },
                    { name: '📍 `/evento confirmar [canal]`', value: '*(Oficiales)* Publica un pase de lista para confirmar asistencia.', inline: false },
                    { name: '📋 `/evento lista` · `/evento estado`', value: '*(Oficiales)* Consulta el roster y el estado actual de la operación.', inline: false },
                    { name: '📡 `/evento iniciar` · `/evento finalizar`', value: '*(Oficiales)* Registra actividad en voz, chat o modalidad híbrida y calcula la permanencia.', inline: false },
                    { name: '💵 `/evento panel_pago [canal]`', value: '*(Oficiales)* Publica el panel para que los participantes elegibles reclamen su paga.', inline: false },
                    { name: '⚡ `/evento pagar_todos`', value: '*(Oficiales)* Liquida de forma masiva a los participantes confirmados.', inline: false }
                );
            break;
        case 5:
            embed.setColor(0xe63946)
                .setTitle('🛡️ [MANUAL // MODERACIÓN, PERMISOS Y PANEL WEB]')
                .setDescription('**ORDEN, SEGURIDAD Y ADMINISTRACIÓN**\nLos comandos sensibles están protegidos por permisos de Discord, roles configurados y directivas individuales.')
                .addFields(
                    { name: '🔇 `/mod timeout <usuario> <minutos> [motivo]`', value: 'Aísla temporalmente a un miembro.', inline: false },
                    { name: '🥾 `/mod kick <usuario> [motivo]`', value: 'Expulsa a un miembro del servidor.', inline: false },
                    { name: '🚨 `/mod ban <usuario> [motivo]`', value: 'Expulsa permanentemente a un miembro.', inline: false },
                    { name: '🧹 `/mod purge <cantidad>`', value: 'Elimina entre 1 y 100 mensajes del canal.', inline: false },
                    { name: '🖥️ Centro de Mando Web', value: 'Permite revisar expedientes, editar preguntas, configurar roles y canales, gestionar economía, artículos, bonos, permisos y operaciones.', inline: false },
                    { name: '📑 Auditoría y permisos', value: 'Las verificaciones, moderaciones y transacciones pueden registrarse en canales de auditoría. Cada comando puede habilitarse, deshabilitarse o limitarse por rol desde el panel web.', inline: false },
                    { name: '🆘 `/help`', value: 'Vuelve a abrir este manual interactivo cuando necesites consultar un protocolo.', inline: false }
                );
            break;
    }

    embed.setFooter({ text: `Página ${currentPage} de ${TOTAL_PAGES} • Cuartel General USMC • /help` });

    const categoryMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder(`📑 Saltar a sección (${currentPage}/${TOTAL_PAGES})...`)
        .addOptions([
            { label: '1. Inicio y visión general', description: 'Primeros pasos y funcionamiento del bot.', value: '1', emoji: '📋', default: currentPage === 1 },
            { label: '2. Verificación y expedientes', description: 'Acceso, revisión y configuración.', value: '2', emoji: '🎖️', default: currentPage === 2 },
            { label: '3. Economía y bonos', description: 'Saldos, trabajos, pagos y recompensas.', value: '3', emoji: '💰', default: currentPage === 3 },
            { label: '4. Tienda y operaciones', description: 'Inventario, eventos, asistencia y pagos.', value: '4', emoji: '🛒', default: currentPage === 4 },
            { label: '5. Moderación y panel web', description: 'Disciplina, permisos y auditoría.', value: '5', emoji: '🛡️', default: currentPage === 5 }
        ]);

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`help_page_${currentPage - 1}`).setLabel('◀️ Anterior').setStyle(ButtonStyle.Primary).setDisabled(currentPage <= 1),
        new ButtonBuilder().setCustomId('help_page_curr').setLabel(`Página ${currentPage} / ${TOTAL_PAGES}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`help_page_${currentPage + 1}`).setLabel('Siguiente ▶️').setStyle(ButtonStyle.Primary).setDisabled(currentPage >= TOTAL_PAGES),
        new ButtonBuilder().setCustomId('help_refresh_1').setLabel('🏠 Inicio').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(categoryMenu), navRow] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Abre el Manual Táctico USMC y consulta todos los comandos'),
    buildHelpPanel,
    async execute(interaction) {
        return interaction.reply({ ...buildHelpPanel(1, interaction.guildId), flags: MessageFlags.Ephemeral });
    }
};
