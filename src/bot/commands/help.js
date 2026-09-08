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

/**
 * Genera el panel táctico del manual de ayuda con páginas y navegación
 */
function buildHelpPanel(page = 1, guildId = 'GLOBAL') {
    const settings = economyDb.getEconomySettings(guildId);
    const sym = settings ? settings.currency_symbol : '$';

    const currentPage = Math.min(Math.max(1, page), TOTAL_PAGES);
    let embed = new EmbedBuilder().setTimestamp();

    switch (currentPage) {
        case 1:
            // PÁGINA 1: GENERAL & ÍNDICE
            embed
                .setColor(0x00b4d8)
                .setTitle('🎖️ [MANUAL TÁCTICO GENERAL // CUARTEL DE MANDO USMC]')
                .setDescription(`
**SISTEMA CENTRAL AUTÓNOMO DE OPERACIONES, VERIFICACIÓN Y ECONOMÍA**
Bienvenido al centro de transmisiones del batallón. Este bot administra de forma integral la seguridad, acreditaciones de miembros, economía militar, intendencia de rangos y operaciones en combate.

> 🛡️ **Base Militar:** \`USMC Tactical Operations\`
> ⚡ **Arquitectura:** SQLite Local de Alta Velocidad + Dashboard Web Retro
> 📜 **Secciones del Manual:** Navega con los botones inferiores o el selector táctico.

---
### 📑 ÍNDICE DE SECCIONES
• **\`[Pág 1/5]\`** 📋 **Visión General e Instrucciones de la Base**
• **\`[Pág 2/5]\`** 🎖️ **Sistema de Verificación Militar & Expedientes**
• **\`[Pág 3/5]\`** 💰 **Economía Militar, Cartera, Banco y Bonos**
• **\`[Pág 4/5]\`** 🛒 **Armería Táctica, Rangos y Operaciones de Asistencia**
• **\`[Pág 5/5]\`** 🛡️ **Disciplina, Moderación & Centro de Mando Web**
                `)
                .addFields(
                    {
                        name: '🚀 Inicio Rápido para Reclutas',
                        value: '1. Usa `/panel-verificacion` o pulsa el botón del canal de bienvenida para obtener tu acceso web.\n2. Completa tu expediente para recibir tu rol de combatiente.\n3. Consulta tu saldo con `/economia balance` y visita la armería con `/tienda panel`.',
                        inline: false
                    },
                    {
                        name: '🧭 Navegación Táctica',
                        value: 'Usa los botones **`[◀️ Anterior]`** y **`[Siguiente ▶️]`** o despliega el menú inferior para saltar a cualquier categoría de comandos.',
                        inline: false
                    }
                )
                .setFooter({ text: `Página 1 de ${TOTAL_PAGES} • Cuartel General USMC • /help` });
            break;

        case 2:
            // PÁGINA 2: VERIFICACIÓN Y EXPEDIENTES
            embed
                .setColor(0x2d6a4f)
                .setTitle('🎖️ [MANUAL // PROTOCOLOS DE VERIFICACIÓN Y EXPEDIENTES]')
                .setDescription(`
**CONTROL DE IDENTIDAD Y ACCESO A LAS INSTALACIONES**
Todos los aspirantes deben formalizar su expediente militar en la terminal web retro para recibir el rol de combatiente y acceder a los canales clasificados.
                `)
                .addFields(
                    {
                        name: '📋 `/panel-verificacion [canal]`',
                        value: 'Despliega en el canal indicado el panel interactivo de bienvenida con el botón militar **`[ SOLICITAR ACCESO / VERIFICARSE ]`**.',
                        inline: false
                    },
                    {
                        name: '🔍 `/datos-usuario <usuario>`',
                        value: '*(Oficiales)* Inspecciona el expediente militar completo de un recluta: estado de aprobación, usuario de Roblox, fecha de solicitud y oficial dictaminador.',
                        inline: false
                    },
                    {
                        name: '✅ `/admin verificar-manual <usuario> [motivo]`',
                        value: '*(Oficiales)* Otorga la verificación inmediata y asigna los roles militares a un recluta sin exigirle completar el formulario web.',
                        inline: false
                    },
                    {
                        name: '❌ `/admin desverificar <usuario> [motivo]`',
                        value: '*(Oficiales)* Revoca la acreditación militar de un usuario y retira los roles de verificado.',
                        inline: false
                    },
                    {
                        name: '🌐 `/admin panel-web`',
                        value: 'Genera el enlace seguro de acceso y credenciales maestras para el Centro de Mando Web.',
                        inline: false
                    },
                    {
                        name: '⚙️ `/admin configurar [...]`',
                        value: 'Configura los roles de verificado/no verificado, canales de revisión para oficiales, canal de auditoría y modalidad (manual o automática).',
                        inline: false
                    }
                )
                .setFooter({ text: `Página 2 de ${TOTAL_PAGES} • Sección de Verificación Militar • /help` });
            break;

        case 3:
            // PÁGINA 3: ECONOMÍA MILITAR & BONOS
            embed
                .setColor(0xffb703)
                .setTitle('💰 [MANUAL // SISTEMA FINANCIERO Y ASIGNACIONES MILITARES]')
                .setDescription(`
**SISTEMA MONETARIO DEL BATALLÓN USMC**
Los créditos militares (**${sym}**) te permiten adquirir pertrechos, ascender de rango y acceder a privilegios exclusivos en la base.
                `)
                .addFields(
                    {
                        name: '💵 `/economia balance [usuario]`',
                        value: 'Consulta tu estado contable personal o el de otro recluta: efectivo en cartera, caja fuerte en banco y patrimonio neto.',
                        inline: false
                    },
                    {
                        name: '🛡️ `/economia trabajar`',
                        value: 'Cumple con guardias perimetrales y labores tácticas para recibir tu haber regular con bonos de rango militar.',
                        inline: false
                    },
                    {
                        name: '🥷 `/economia crimen`',
                        value: 'Ejecuta operaciones encubiertas de alto riesgo. Gran recompensa en créditos o fuerte multa disciplinaria si eres descubierto.',
                        inline: false
                    },
                    {
                        name: '🚨 `/economia robar <usuario>`',
                        value: 'Intenta sustraer dinero de la cartera no asegurada de otro soldado. ¡Cuidado con el contraataque!',
                        inline: false
                    },
                    {
                        name: '🏦 `/economia depositar <monto/all>` y `/economia retirar <monto/all>`',
                        value: 'Transfiere créditos entre tu cartera táctica y la caja fuerte bancaria protegida contra asaltos.',
                        inline: false
                    },
                    {
                        name: '🤝 `/economia pagar <usuario> <monto>`',
                        value: 'Realiza una transferencia directa de créditos desde tu cartera a otro soldado.',
                        inline: false
                    },
                    {
                        name: '🏆 `/economia ranking`',
                        value: 'Muestra el escalafón con los 10 soldados con mayor capital financiero del servidor.',
                        inline: false
                    },
                    {
                        name: '🎁 `/bono reclamar` y `/bono panel [canal] [id]`',
                        value: 'Reclama tu asignación militar o despliega el panel oficial de cobro interactivo con botón táctico (admite especificar ID de bono).',
                        inline: false
                    },
                    {
                        name: '➕ `/bono crear <monto> <titulo> [modo] [horas]`',
                        value: '*(Oficiales)* Crea un nuevo bono militar con ID único y cobros independientes para que no haya conflictos con bonos anteriores.',
                        inline: false
                    },
                    {
                        name: '📋 `/bono lista` · `/bono eliminar <id>` · `/bono reset_reclamos <id>`',
                        value: '*(Oficiales)* Administra los bonos: consulta la lista con sus IDs, da de baja bonos obsoletos o reinicia sus reclamos para permitir un nuevo cobro.',
                        inline: false
                    },
                    {
                        name: '⚡ `/bono dar <usuario> <monto>` y `/bono masivo <monto>`',
                        value: '*(Oficiales)* Acredita fondos directos a un soldado específico o emite una asignación económica a todo el batallón.',
                        inline: false
                    }
                )
                .setFooter({ text: `Página 3 de ${TOTAL_PAGES} • Finanzas Militares • /help` });
            break;

        case 4:
            // PÁGINA 4: ARMERÍA Y OPERACIONES MILITARES
            embed
                .setColor(0x38e54d)
                .setTitle('🛒 [MANUAL // ARMERÍA TÁCTICA Y OPERACIONES MILITARES]')
                .setDescription(`
**ADQUISICIÓN DE RANGOS Y GESTIÓN DE MISIONES DE COMBATE**
Conquista nuevos rangos en la armería y participa en operaciones convocadas para recibir pagos masivos por presencia presencial o en voz.
                `)
                .addFields(
                    {
                        name: '🛒 `/tienda panel`',
                        value: 'Abre el catálogo interactivo de la armería **con paginación táctica**, selector de compra en 1 clic y consulta de saldo en vivo.',
                        inline: false
                    },
                    {
                        name: '📦 `/tienda comprar <id>` y `/tienda inventario`',
                        value: 'Adquiere directamente un suministro por su ID militar o revisa tu mochila táctica y rangos otorgados.',
                        inline: false
                    },
                    {
                        name: '📢 `/evento convocar <nombre> <paga_base> [...]`',
                        value: '*(Oficiales)* Inicia una operación militar por registro previo. Publica el panel táctico con botón **`[ 📝 REGISTRARSE ]`**, cupo y plazo.',
                        inline: false
                    },
                    {
                        name: '📍 `/evento confirmar [canal]`',
                        value: '*(Oficiales)* Abre el **Pase de Lista** interactivo donde los reclutas convocados pulsan para formalizar su asistencia presencial.',
                        inline: false
                    },
                    {
                        name: '📋 `/evento lista`',
                        value: '*(Oficiales)* Muestra el roster militar **por páginas** con botones rojos individuales **`[🗑️ #]`** para expulsar soldados y bloquear su asistencia.',
                        inline: false
                    },
                    {
                        name: '💵 `/evento panel_pago [canal]`',
                        value: '*(Oficiales)* Publica el panel táctico de cobro para que los soldados confirmados reclamen su paga con bono de rango militar.',
                        inline: false
                    },
                    {
                        name: '⚡ `/evento pagar_todos`',
                        value: '*(Oficiales)* Liquidación masiva instantánea: abona los haberes directamente a la cartera de todos los confirmados sin esperar.',
                        inline: false
                    },
                    {
                        name: '📡 `/evento iniciar` y `/evento finalizar`',
                        value: '*(Oficiales)* Rastreo autónomo de presencia en canales de voz o chat militar y cálculo de permanencia para pagos.',
                        inline: false
                    }
                )
                .setFooter({ text: `Página 4 de ${TOTAL_PAGES} • Armería y Operaciones • /help` });
            break;

        case 5:
            // PÁGINA 5: DISCIPLINA Y MODERACIÓN
            embed
                .setColor(0xe63946)
                .setTitle('🛡️ [MANUAL // DISCIPLINA MILITAR Y CENTRO DE MANDO]')
                .setDescription(`
**ORDEN, SEGURIDAD EN LA BASE Y GESTIÓN INTEGRAL**
Protocolos disciplinarios para mantener la cadena de mando y herramientas del Estado Mayor.
                `)
                .addFields(
                    {
                        name: '🔇 `/mod timeout <usuario> <minutos> [motivo]`',
                        value: 'Aisla temporalmente a un miembro en celda de castigo privándolo de enviar transmisiones.',
                        inline: false
                    },
                    {
                        name: '🥾 `/mod kick <usuario> [motivo]`',
                        value: 'Expulsa de inmediato a un miembro de las instalaciones militares.',
                        inline: false
                    },
                    {
                        name: '🚨 `/mod ban <usuario> [motivo]`',
                        value: 'Dictamina corte marcial y expulsa permanentemente a un miembro con baja deshonrosa.',
                        inline: false
                    },
                    {
                        name: '🧹 `/mod purge <cantidad>`',
                        value: 'Elimina de forma masiva transmisiones e indisciplina en el canal táctico (1-100 mensajes).',
                        inline: false
                    },
                    {
                        name: '🖥️ Centro de Mando Táctico Web',
                        value: 'Panel de administración completo con interfaz retro CRT para configurar la armería, supervisar la tesorería militar, ajustar balances, dictaminar verificaciones y monitorear operaciones militares.',
                        inline: false
                    }
                )
                .setFooter({ text: `Página 5 de ${TOTAL_PAGES} • Disciplina y Seguridad • /help` });
            break;
    }

    const components = [];

    // 1. Selector desplegable de categorías
    const categoryMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder(`📑 Salto rápido a sección (Página actual: ${currentPage}/${TOTAL_PAGES})...`)
        .addOptions([
            {
                label: '1. Visión General e Índice',
                description: 'Resumen de la base, inicio rápido y arquitectura.',
                value: '1',
                emoji: '📋',
                default: currentPage === 1
            },
            {
                label: '2. Verificación y Expedientes',
                description: 'Panel de acceso, datos de usuario y configuración.',
                value: '2',
                emoji: '🎖️',
                default: currentPage === 2
            },
            {
                label: '3. Economía Militar y Bonos',
                description: 'Balances, sueldos, robos, crímenes y pagos masivos.',
                value: '3',
                emoji: '💰',
                default: currentPage === 3
            },
            {
                label: '4. Armería y Operaciones Militares',
                description: 'Catálogo de rangos, convocatorias, listas y eventos.',
                value: '4',
                emoji: '🛒',
                default: currentPage === 4
            },
            {
                label: '5. Disciplina y Moderación',
                description: 'Corte marcial, purgas, timeouts y mando web.',
                value: '5',
                emoji: '🛡️',
                default: currentPage === 5
            }
        ]);

    components.push(new ActionRowBuilder().addComponents(categoryMenu));

    // 2. Fila de botones de navegación táctica
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`help_page_${currentPage - 1}`)
            .setLabel('◀️ Anterior')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId('help_page_curr')
            .setLabel(`Página ${currentPage} / ${TOTAL_PAGES}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`help_page_${currentPage + 1}`)
            .setLabel('Siguiente ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= TOTAL_PAGES),
        new ButtonBuilder()
            .setCustomId('help_refresh_1')
            .setLabel('🏠 Inicio')
            .setStyle(ButtonStyle.Secondary)
    );

    components.push(navRow);

    return { embeds: [embed], components };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Despliega el Manual Táctico Militar USMC y guía interactiva de comandos'),

    buildHelpPanel,

    async execute(interaction) {
        const panel = buildHelpPanel(1, interaction.guildId);
        return interaction.reply({ ...panel, flags: MessageFlags.Ephemeral });
    }
};
