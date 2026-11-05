const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags 
} = require('discord.js');
const economyDb = require('../../database/economyDb');
const community = require('../../database/communityDb');
const {renderShopPanel,buildPurchasePreview,identity,asShopUpdate}=require('../utils/shopPresentation');

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
        const owned=economyDb.getUserInventory(interaction.user.id).filter(row=>row.item_id===item.id).reduce((sum,row)=>sum+row.quantity,0);
        const preview=buildPurchasePreview(item,acc,settings,community.ensureCommunity(guildId),owned,confirmed);
        return interaction.reply({flags:MessageFlags.Ephemeral,embeds:[preview.embed],
            components:[new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`shop_confirm_${item.id}_${interaction.user.id}_${item.price}`).setLabel('Confirmar compra').setStyle(ButtonStyle.Success).setDisabled(!preview.canPurchase),
                new ButtonBuilder().setCustomId('shop_cancel_purchase').setLabel('Cerrar ficha').setStyle(ButtonStyle.Secondary))],allowedMentions:{parse:[]}});
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
            .setTitle('✅ Compra completada')
            .setDescription(`**${item.name}**\n${result.customReply}\n\n**Pagado:** ${sym}${item.price.toLocaleString()}\n**Saldo:** ${sym}${account.wallet.toLocaleString()}`)
            .setFooter({ text: `${identity(community.ensureCommunity(guildId)).name} · Pedido #${result.orderId}` })], components: [], allowedMentions: { parse: [] } });
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

/** Catálogo compacto con identidad de la comunidad, filtros y paginación. */
function buildShopPanel(guildId, page = 1, category = 'all', presentation={}) {
    return renderShopPanel(economyDb.getShopItems(guildId,true),economyDb.getEconomySettings(guildId),community.ensureCommunity(guildId),page,category,presentation);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tienda')
        .setDescription('Panel interactivo de la Armería y Compra de Rangos Militares')
        .addSubcommand(sub =>
            sub.setName('panel')
                .setDescription('Abre el panel táctico de la tienda con fichas de artículo y confirmación de compra')
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
    asShopUpdate,

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
            return interaction.reply({ ...require('../utils/personalPanels').inventoryPanel(targetUser,guildId),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral });
        }
    }
};
