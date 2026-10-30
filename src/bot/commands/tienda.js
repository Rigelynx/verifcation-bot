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
const pendingPurchases = new Set();
async function processShopPurchase(interaction, itemId, confirmed = false, expectedPrice = null) {
    const guildId = interaction.guildId || 'GLOBAL';
    const permission = economyDb.isCommandAllowed('tienda:comprar', interaction.member);
    if (!permission.allowed) return interaction.reply({ content: 'La compra de artículos está restringida para tu usuario.', flags: MessageFlags.Ephemeral });
    economyDb.syncAccountUser(interaction.user.id, interaction.user.tag || interaction.user.username || '',
        interaction.user.displayAvatarURL?.({ extension: 'png', size: 128 }) || '', guildId);
    const item = economyDb.getShopItemById(itemId);
    if (!item || !item.is_active || ![guildId, 'GLOBAL'].includes(item.guild_id)) {
        return interaction.reply({ content: 'Este artículo ya no está disponible.', flags: MessageFlags.Ephemeral });
    }
    const settings = economyDb.getEconomySettings(guildId);
    const sym = settings.currency_symbol || '$';
    if (!confirmed || (expectedPrice !== null && item.price !== expectedPrice)) {
        const acc = economyDb.getAccount(interaction.user.id, guildId);
        return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(0xdcb96c)
            .setTitle('🛒 CONFIRMAR ADQUISICIÓN')
            .setDescription(`**${item.name}**\n${String(item.description || 'Suministro de intendencia.').slice(0, 600)}\n\n**Precio:** ${sym}${item.price.toLocaleString()}\n**Tu saldo:** ${sym}${acc.wallet.toLocaleString()}\n**Stock:** ${item.stock === -1 ? 'Ilimitado' : item.stock}${item.required_roles.length ? `\n**Requiere:** ${formatRoleMentions(item.required_roles)}` : ''}`)
            .setFooter({ text: 'Confirma para descontar el importe y entregar el artículo.' })],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`shop_confirm_${item.id}_${interaction.user.id}_${item.price}`).setLabel('Confirmar compra').setStyle(ButtonStyle.Success).setDisabled(item.stock === 0),
                new ButtonBuilder().setCustomId('shop_cancel_purchase').setLabel('Cancelar').setStyle(ButtonStyle.Secondary))], allowedMentions: { parse: [] } });
    }
    const key = `${interaction.user.id}:${itemId}`;
    if (pendingPurchases.has(key)) return interaction.reply({ content: 'Tu compra se está procesando.', flags: MessageFlags.Ephemeral });
    pendingPurchases.add(key);
    let result, delivered = false;
    const added = [], removed = [];
    try {
        await interaction.deferUpdate();
        await interaction.editReply({ content: 'Procesando adquisición…', embeds: [], components: [] });
        const member = await interaction.guild.members.fetch(interaction.user.id);
        for (const id of [...item.roles_to_give, ...item.roles_to_remove]) {
            const role = interaction.guild.roles.cache.get(id);
            if (!role || role.managed || !role.editable) throw new Error('No puedo gestionar uno de los roles de este artículo. Administración debe revisar mi jerarquía.');
        }
        result = economyDb.purchaseShopItem(interaction.user.id, itemId, [...member.roles.cache.keys()], guildId, item.price);
        if (!result.success) return interaction.editReply({ content: result.message });
        for (const id of result.rolesToGive || []) {
            if (!member.roles.cache.has(id)) { await member.roles.add(id); added.push(id); }
        }
        for (const id of result.rolesToRemove || []) {
            if (member.roles.cache.has(id)) { await member.roles.remove(id); removed.push(id); }
        }
        economyDb.completeShopOrder(result.orderId);
        delivered = true;
        const account = economyDb.getAccount(interaction.user.id, guildId);
        return interaction.editReply({ content: '', embeds: [new EmbedBuilder().setColor(0x59c9a5)
            .setTitle('✅ ADQUISICIÓN COMPLETADA')
            .setDescription(`**${item.name}**\n${result.customReply}\n\n**Pagado:** ${sym}${item.price.toLocaleString()}\n**Saldo:** ${sym}${account.wallet.toLocaleString()}`)
            .setFooter({ text: `Comunidad · Intendencia · Pedido #${result.orderId}` })], components: [], allowedMentions: { parse: [] } });
    } catch (error) {
        if (delivered) {
            console.error('[Shop receipt]', { orderId: result.orderId, error: error.message });
            return;
        }
        let restored = true;
        for (const id of removed.reverse()) await interaction.member.roles.add(id).catch(() => { restored = false; });
        for (const id of added.reverse()) await interaction.member.roles.remove(id).catch(() => { restored = false; });
        if (result?.orderId) economyDb.refundShopOrder(result.orderId);
        console.error('[Shop delivery]', { orderId: result?.orderId, restored, error: error.message });
        const content = `⚠️ ${error.message}${result?.orderId ? '\nEl importe se ha reembolsado y el inventario fue restaurado.' : '\nNo se ha realizado ningún cobro.'}${!restored ? '\nAdministración debe revisar tus roles: no pude revertir todos los cambios.' : ''}`;
        if (interaction.deferred) return interaction.editReply({ content, embeds: [], components: [] });
        throw error;
    } finally { pendingPurchases.delete(key); }
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
function buildShopPanel(guildId, page = 1, category = 'all') {
    const allItems = economyDb.getShopItems(guildId, true);
    const items = allItems.filter(item => category === 'all' || (category === 'ranks' ? item.roles_to_give.length > 0 : item.roles_to_give.length === 0));
    const settings = economyDb.getEconomySettings(guildId);
    const sym = settings.currency_symbol || '$';

    if (items.length === 0) {
        const emptyEmbed = new EmbedBuilder()
            .setColor(0xffb000)
            .setTitle('🛒 [ARMERÍA Y TIENDA MILITAR // Comunidad LOGISTICS]')
            .setDescription(`
**La armería táctica se encuentra en inventario cero.**
El Administración no ha suministrado equipamiento ni rangos activos en este momento.

*Visita el panel web para registrar nuevos pertrechos comunitarios.*
            `)
            .setFooter({ text: 'Intendencia Militar Comunidad' })
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

        if (allItems.length) emptyRow.addComponents(new ButtonBuilder().setCustomId('shop_page_1_all').setLabel('Todo el catálogo').setStyle(ButtonStyle.Primary));
        return { embeds: [emptyEmbed], components: [emptyRow] };
    }

    const ITEMS_PER_PAGE = 4;
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const pageItems = items.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setColor(0x38e54d)
        .setTitle('📦 INTENDENCIA · Comunidad LOGISTICS')
        .setDescription(`
**BIENVENIDO AL ALMACÉN MILITAR DEL BATALLÓN**
*Adquiere rangos responsables, insignias de servicio y pertrechos de intendencia.*

Selecciona un artículo para ver su ficha y confirmar la compra. Consulta tu saldo e inventario desde los botones inferiores.
        `)
        .setFooter({ text: `Página ${currentPage}/${totalPages} • Total: ${items.length} artículos en armería • Comunidad Logistics` })
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

    components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId('shop_category').setPlaceholder('Filtrar catálogo…').addOptions([
            { label: 'Todo el catálogo', value: 'all', default: category === 'all' },
            { label: 'Rangos y acreditaciones', value: 'ranks', default: category === 'ranks' },
            { label: 'Suministros', value: 'supplies', default: category === 'supplies' }])));
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
            .setPlaceholder(`🛒 Ver artículo de esta página (${currentPage}/${totalPages})...`)
            .addOptions(selectOptions);

        components.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    // 2. Fila de botones de navegación por páginas
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`shop_page_${currentPage - 1}_${category}`)
            .setLabel('◀️ Anterior')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId('shop_indicator')
            .setLabel(`Página ${currentPage} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`shop_page_${currentPage + 1}_${category}`)
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
                .setDescription('Adquiere directamente un suministro o rol comunitario por ID')
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

        const sub = interaction.options.getSubcommand(false) || 'panel';

        // Verificación de permisos y activación del comando
        const permCheck = economyDb.isCommandAllowed(`tienda:${sub}`, interaction.member);
        if (!permCheck.allowed) {
            return interaction.reply({
                content: permCheck.reason === 'DISABLED'
                    ? `🔒 **Protocolo Inactivo:** El protocolo \`/tienda ${sub}\` se encuentra temporalmente cerrado por orden del Administración.`
                    : '🔒 **Acceso Denegado:** Tu rango comunitario actual no cuenta con autorización para acceder a este módulo de la armería.',
                flags: MessageFlags.Ephemeral
            });
        }

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
                .setFooter({ text: 'Logística Comunidad' })
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
