const {ActionRowBuilder,ButtonBuilder,ButtonStyle}=require('discord.js');
const eco=require('../../database/economyDb');
const {nativePanel,clip}=require('./neutralPanels');
const money=(amount,settings)=>`${settings.currency_symbol||'$'}${Number(amount).toLocaleString('es-CO')}`;
function inventoryPanel(user,guildId,page=0){
    const items=eco.getUserInventory(user.id),settings=eco.getEconomySettings(guildId),pages=Math.max(1,Math.ceil(items.length/3));
    page=Math.min(Math.max(0,Math.floor(Number(page)||0)),pages-1);
    return nativePanel({guildId,kind:'inventory',hero:true,title:`Inventario · ${clip(user.username||user.tag||user.id,60)}`,
        description:`**${items.reduce((n,row)=>n+row.quantity,0)} unidades** · ${items.length} artículos diferentes`,
        cards:items.length?items.slice(page*3,page*3+3).map(item=>({title:`${item.icon||'📦'} ${clip(item.name,80)} ×${item.quantity}`,
            text:`${clip(item.description||'Sin descripción adicional.',150)}\n**Valor de catálogo:** ${money(item.price,settings)}`,
            button:new ButtonBuilder().setCustomId(`inv_detail_${user.id}_${item.item_id}`).setLabel('Ver detalles').setStyle(ButtonStyle.Secondary)})):[{title:'Inventario vacío',text:'Los artículos que adquieras en la tienda aparecerán aquí.'}],
        footer:`Página ${page+1}/${pages} · Inventario de este servidor`,
        rows:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`inv_page_${user.id}_${page-1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page===0),
            new ButtonBuilder().setCustomId(`inv_page_${user.id}_${page+1}`).setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled(page===pages-1))]});
}
function balancePanel(user,guildId,own=true){
    const acc=eco.getAccount(user.id,guildId),settings=eco.getEconomySettings(guildId);
    const rows=own?[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('finance_deposit').setLabel('Depositar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('finance_withdraw').setLabel('Retirar').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('finance_history').setLabel('Movimientos').setStyle(ButtonStyle.Secondary))]:[];
    return nativePanel({guildId,kind:'economy',hero:true,title:`Saldo · ${clip(user.username||user.tag||user.id,60)}`,description:settings.currency_name||'Créditos',
        cards:[{title:money(acc.wallet,settings),text:'**Cartera** · Disponible para compras y transferencias.'},
            {title:money(acc.bank,settings),text:`**Banco** · Capacidad ${money(acc.bank_capacity,settings)}`},
            {title:money(acc.wallet+acc.bank,settings),text:'**Patrimonio total** · Cartera y banco.'}],rows,footer:'Consulta correspondiente a este servidor'});
}
module.exports={inventoryPanel,balancePanel,money};
