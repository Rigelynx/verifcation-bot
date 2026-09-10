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

/**
 * Función central de procesamiento de compra para comandos, botones y select menus
 */
async function processShopPurchase(interaction, itemId) {
    const guildId = interaction.guildId || 'GLOBAL';
    const settings = economyDb.getEconomySettings(guildId);
    const sym = settings.currency_symbol || '$';
    const userRoleIds = interaction.member.roles.cache.map(r => r.id);

    // Sincronizar datos de usuario
    economyDb.syncAccountUser(
        interaction.user.id,
        interaction.user.tag || interaction.user.username,
        interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
        interaction.guildId
    );

    const result = economyDb.purchaseShopItem(interaction.user.id, itemId, userRoleIds);

    if (!result.success) {
        return interaction.reply({
            content: result.message,
            flags: MessageFlags.Ephemeral
        });
    }

    const item = result.item;
    const rolesAddedLog = [];
    const rolesRemovedLog = [];

    // Otorgar roles automáticos en Discord
    if (result.rolesToGive && result.rolesToGive.length > 0) {
        for (const rId of result.rolesToGive) {
            try {
                const roleObj = interaction.guild.roles.cache.get(rId);
                if (roleObj) {
                    await interaction.member.roles.add(rId);
                    rolesAddedLog.push(roleObj.name);
                }
            } catch (e) {
                console.error(`[Shop Role Add Error]:`, e.message);
            }
        }
    }

    // Remover roles automáticos en Discord (ascenso de rango)
    if (result.rolesToRemove && result.rolesToRemove.length > 0) {
        for (const rId of result.rolesToRemove) {
            try {
                const roleObj = interaction.guild.roles.cache.get(rId);
                if (roleObj && interaction.member.roles.cache.has(rId)) {
                    await interaction.member.roles.remove(rId);
                    rolesRemovedLog.push(roleObj.name);
                }
            } catch (e) {
                console.error(`[Shop Role Remove Error]:`, e.message);
            }
        }
    }

    const acc = economyDb.getAccount(interaction.user.id, guildId);

    let actionSummary = '';
    if (rolesAddedLog.length > 0) {
        actionSummary += `\n🎖️ **Rango Otorgado:** \`+ ${rolesAddedLog.join(', ')}\``;
    }
    if (rolesRemovedLog.length > 0) {
        actionSummary += `\n🔄 **Rango Reemplazado:** \`- ${rolesRemovedLog.join(', ')}\``;
    }

    const embed = new EmbedBuilder()
        .setColor(0x38e54d)
        .setTitle(`🛍️ [ADQUISICIÓN CONFIRMADA // ${item.name.toUpperCase()}]`)
        .setDescription(`
${result.customReply || '¡Transacción formalizada con éxito en la intendencia militar!'}

> 💰 **Precio Pagado:** \`${sym}${item.price.toLocaleString()}\`
> 💵 **Efectivo Restante:** \`${sym}${acc.wallet.toLocaleString()}\`${actionSummary}
        `)
        .setFooter({ text: 'Intendencia de Armería USMC • Cuartel General' })
        .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/**
 * Filtra y da formato seguro a menciones de roles en Discord
 */
function formatRoleMentions(roles) {
    if (!Array.isArray(roles) || roles.length === 0) return '';
    const valid = roles.filter(r => /^\d{17,20}$/.test(String(r).trim()));
    if (valid.length === 0) return '';
    return valid.map(r => `<@&${r}>`).join(' ');
}

/**
 * Genera el panel visual táctico interactivo de la tienda
 */
/**
 * Genera el panel visual táctico interactivo de la tienda con paginación
 */
function buildShopPanel(guildId, page = 1) {
    const items = economyDb.getShopItems(guildId, true);
    const settings = economyDb.getEconomySettings(guildId);
    const sym = settings.currency_symbol || '$';

    if (items.length === 0) {
        const emptyEmbed = new EmbedBuilder()
            .setColor(0xffb000)
            .setTitle('🛒 [ARMERÍA Y TIENDA MILITAR // USMC LOGISTICS]')
            .setDescription(`
**La armería táctica se encuentra en inventario cero.**
El Estado Mayor no ha suministrado equipamiento ni rangos activos en este momento.

*Visita el panel web para registrar nuevos pertrechos militares.*
            `)
            .setFooter({ text: 'Intendencia Militar USMC' })
            .setTimestamp();

        const emptyRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_view_my_inventory')
                .setLabel('🎒 Mi Inventario')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('btn_view_shop_balance')
                .setLabel('💵 Ver Saldo')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('btn_refresh_shop')
                .setLabel('🔄 Actualizar')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [emptyEmbed], components: [emptyRow] };
    }

    const ITEMS_PER_PAGE = 4;
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const pageItems = items.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setColor(0x38e54d)
        .setTitle('🎖️ [ARMERÍA TÁCTICA Y CATÁLOGO DE RANGOS // USMC]')
        .setDescription(`
**BIENVENIDO AL ALMACÉN MILITAR DEL BATALLÓN**
*Adquiere rangos oficiales, insignias de servicio y pertrechos de intendencia.*

Selecciona cualquier artículo en el **menú desplegable inferior** para adquirirlo en 1 clic.
        `)
        .setFooter({ text: `Página ${currentPage}/${totalPages} • Total: ${items.length} artículos en armería • USMC Logistics` })
        .setTimestamp();

    for (const item of pageItems) {
        let roleInfo = '';
        const giveRoles = formatRoleMentions(item.roles_to_give);
        const remRoles = formatRoleMentions(item.roles_to_remove);
        const reqRoles = formatRoleMentions(item.required_roles);
        const blkRoles = formatRoleMentions(item.blocked_roles);

        if (giveRoles) roleInfo += `\n> ➕ **Otorga Rol:** ${giveRoles}`;
        if (remRoles) roleInfo += `\n> ➖ **Reemplaza Rol:** ${remRoles}`;
        if (reqRoles) roleInfo += `\n> 🔒 **Requiere Rango:** ${reqRoles}`;
        if (blkRoles) roleInfo += `\n> ⛔ **Incompatible con:** ${blkRoles}`;

        let statusBadge = '🟢 `DISPONIBLE`';
        if (item.stock === 0) {
            statusBadge = '🔴 `AGOTADO`';
        } else if (item.stock > 0 && item.stock <= 3) {
            statusBadge = `🟡 \`ÚLTIMAS ${item.stock} UNIDADES\``;
        }

        const stockText = item.stock === -1 ? 'Ilimitado' : `${item.stock} u.`;
        const maxUserText = item.max_per_user === -1 ? 'Sin límite' : `${item.max_per_user}/soldado`;

        embed.addFields({
            name: `${item.icon || '🎖️'} ${item.name} ── \`${sym}${item.price.toLocaleString()}\`  ${statusBadge}`,
            value: `${item.description ? `*${item.description}*\n` : ''}> 📦 **Stock:** \`${stockText}\` │ 👤 **Límite:** \`${maxUserText}\`${roleInfo}`,
            inline: false
        });
    }

    const components = [];

    // 1. Selector táctico desplegable para comprar ítems de la página actual
    const selectOptions = pageItems.map(item => {
        let desc = `${sym}${item.price.toLocaleString()}`;
        if (item.roles_to_give && item.roles_to_give.length > 0) {
            desc += ' • Otorga Rol Militar';
        } else {
            desc += ' • Suministro Táctico';
        }
        if (item.stock !== -1) {
            desc += ` (${item.stock} disp.)`;
        }

        return {
            label: item.name.slice(0, 100),
            description: desc.slice(0, 100),
            value: String(item.id),
            emoji: item.icon && item.icon.length <= 4 ? item.icon : '🎖️'
        };
    });

    if (selectOptions.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_buy_shop')
            .setPlaceholder(`🛒 Comprar artículo de esta página (${currentPage}/${totalPages})...`)
            .addOptions(selectOptions);

        components.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    // 2. Fila de botones de navegación por páginas
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`shop_page_${currentPage - 1}`)
            .setLabel('◀️ Anterior')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId('shop_indicator')
            .setLabel(`Página ${currentPage} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`shop_page_${currentPage + 1}`)
            .setLabel('Siguiente ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages)
    );
    components.push(navRow);

    // 3. Fila de botones utilitarios limpios y compactos
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_view_my_inventory')
            .setLabel('🎒 Mi Inventario')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_view_shop_balance')
            .setLabel('💵 Ver Mi Saldo')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`shop_refresh_${currentPage}`)
            .setLabel('🔄 Actualizar')
            .setStyle(ButtonStyle.Secondary)
    );
    components.push(actionRow);

    return { embeds: [embed], components };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tienda')
        .setDescription('Panel interactivo de la Armería y Compra de Rangos Militares')
        .addSubcommand(sub =>
            sub.setName('panel')
                .setDescription('Abre el panel táctico de la tienda con selector interactivo de compra instantánea')
        )
        .addSubcommand(sub =>
            sub.setName('comprar')
                .setDescription('Adquiere directamente un suministro o rol militar por ID')
                .addIntegerOption(opt => opt.setName('id').setDescription('ID numérico del ítem en la armería').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('inventario')
                .setDescription('Revisa tu mochila de suministros o la de otro recluta')
                .addUserOption(opt => opt.setName('usuario').setDescription('Recluta a inspeccionar').setRequired(false))
        ),

    processShopPurchase,
    buildShopPanel,

    async execute(interaction) {
        const guildId = interaction.guildId || 'GLOBAL';
        const settings = economyDb.getEconomySettings(guildId);
        const sym = settings.currency_symbol || '$';

        // Sincronizar datos del usuario que ejecuta el comando
        economyDb.syncAccountUser(
            interaction.user.id,
            interaction.user.tag || interaction.user.username,
            interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
            interaction.guildId
        );

        // Verificación de permisos y activación del comando
        const permCheck = economyDb.isCommandAllowed('tienda', interaction.member);
        if (!permCheck.allowed) {
            return interaction.reply({
                content: permCheck.reason === 'DISABLED'
                    ? '🔒 **Protocolo Inactivo:** La armería y tienda militar se encuentra temporalmente cerrada por orden del Estado Mayor.'
                    : '🔒 **Acceso Denegado:** Tu rango militar actual no cuenta con autorización para acceder a la armería.',
                flags: MessageFlags.Ephemeral
            });
        }

        const sub = interaction.options.getSubcommand(false) || 'panel';

        // ==========================================
        // /tienda panel (o /tienda por defecto)
        // ==========================================
        if (sub === 'panel') {
            const panel = buildShopPanel(guildId);
            return interaction.reply(panel);
        }

        // ==========================================
        // /tienda comprar (opción manual por comando)
        // ==========================================
        if (sub === 'comprar') {
            const itemId = interaction.options.getInteger('id');
            return processShopPurchase(interaction, itemId);
        }

        // ==========================================
        // /tienda inventario
        // ==========================================
        if (sub === 'inventario') {
            const targetUser = interaction.options.getUser('usuario') || interaction.user;
            const inventory = economyDb.getUserInventory(targetUser.id);

            if (inventory.length === 0) {
                return interaction.reply({
                    content: targetUser.id === interaction.user.id 
                        ? '🎒 Tu mochila táctica está vacía. Escribe `/tienda panel` para ver el catálogo y ascender de rango.'
                        : `🎒 La mochila táctica de <@${targetUser.id}> no contiene suministros adquiridos.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle(`🎒 [EQUIPAMIENTO E INVENTARIO // ${targetUser.tag.toUpperCase()}]`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setDescription(`Lista de pertrechos, suministros e insignias en posesión:`)
                .setFooter({ text: 'Logística USMC' })
                .setTimestamp();

            for (const row of inventory) {
                let extra = '';
                const gives = formatRoleMentions(row.roles_to_give);
                if (gives) {
                    extra += ` • Rango: ${gives}`;
                }

                embed.addFields({
                    name: `${row.icon || '🎖️'} ${row.name} (x${row.quantity})`,
                    value: `*${row.description || 'Sin especificaciones'}*\n> 🏷️ Valor de catálogo: \`${sym}${row.price.toLocaleString()}\`${extra}`,
                    inline: false
                });
            }

            return interaction.reply({ embeds: [embed] });
        }
    }
};
