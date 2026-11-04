const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,escapeMarkdown}=require('discord.js');
const PAGE_SIZE=4;
const categories={all:'Todo el catálogo',ranks:'Artículos con roles',supplies:'Artículos sin roles'};
const clip=(value,max)=>{const text=String(value||'');return text.length>max?text.slice(0,max-1)+'…':text;};
const label=value=>escapeMarkdown(String(value||'').replace(/[\r\n]+/g,' '));
const money=(amount,symbol)=>`${symbol}${Number(amount).toLocaleString('es-CO')}`;
const roles=ids=>(ids||[]).filter(id=>/^\d{17,20}$/.test(String(id))).slice(0,20).map(id=>`<@&${id}>`).join(' ');
function identity(profile={}){return {name:clip(profile.short_name||profile.display_name||'Comunidad',80),color:/^#[a-f\d]{6}$/i.test(profile.accent||'')?parseInt(profile.accent.slice(1),16):0xdcb96c};}
function availability(item){return item.stock===0?'Agotado':item.stock>0&&item.stock<=3?`Últimas ${item.stock} unidades`:item.stock===-1?'Stock ilimitado':`${item.stock} disponibles`;}
function utilities(page,category){return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_view_shop_balance').setLabel('Mi saldo').setEmoji('💳').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_view_my_inventory').setLabel('Mi inventario').setEmoji('🎒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`shop_refresh_${page}_${category}`).setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary));}
function renderShopPanel(allItems,settings={},profile={},page=1,category='all'){
    if(!Object.hasOwn(categories,category))category='all';
    const hasRoles=item=>(item.roles_to_give||[]).length>0;
    const counts={all:allItems.length,ranks:allItems.filter(hasRoles).length,supplies:allItems.filter(item=>!hasRoles(item)).length};
    const items=allItems.filter(item=>category==='all'||(category==='ranks'?hasRoles(item):!hasRoles(item)));
    const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
    const currentPage=Math.min(pages,Math.max(1,Number.isFinite(Number(page))?Math.floor(Number(page)):1));
    const selected=items.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
    const brand=identity(profile),symbol=settings.currency_symbol||'$';
    const embed=new EmbedBuilder().setColor(brand.color).setAuthor({name:`${brand.name} · INTENDENCIA`}).setTitle('Catálogo de suministros')
        .setDescription(items.length?`**${categories[category]}** · ${items.length} ${items.length===1?'artículo':'artículos'}\nElige un artículo para consultar sus requisitos y revisar la compra.`
            :allItems.length?'Esta categoría todavía no tiene artículos. Cambia el filtro para seguir explorando.':'Todavía no hay artículos a la venta. Vuelve cuando Intendencia actualice el catálogo.')
        .setFooter({text:`Página ${currentPage} de ${pages} · ${settings.currency_name||'Créditos'} · Compra con confirmación`});
    for(const item of selected){
        const detail=[`**${money(item.price,symbol)}** · ${availability(item)}`];
        if(item.description)detail.push(clip(String(item.description).replace(/\s+/g,' ').trim(),150));
        const notes=[item.max_per_user===-1?'Sin límite por persona':`${item.max_per_user} por persona`];
        if(item.required_roles?.length)notes.push('Requiere rol');
        if(item.blocked_roles?.length)notes.push('Tiene restricciones');
        if(item.roles_to_give?.length)notes.push('Incluye rol');
        detail.push(`-# ${notes.join(' · ')}`);
        embed.addFields({name:clip(`${item.icon||'📦'} ${label(item.name)}`,256),value:clip(detail.join('\n'),1024),inline:false});
    }
    const filters=new StringSelectMenuBuilder().setCustomId('shop_category').setPlaceholder('Explorar categorías').addOptions(
        Object.entries(categories).map(([value,name])=>({label:`${name} (${counts[value]})`,value,default:value===category})));
    const components=[];
    if(allItems.length)components.push(new ActionRowBuilder().addComponents(filters));
    if(selected.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_buy_shop')
        .setPlaceholder('Seleccionar un artículo…').addOptions(selected.map(item=>({label:clip(item.name,100),value:String(item.id),
            description:clip(`${money(item.price,symbol)} · ${availability(item)}`,100)})))));
    if(pages>1)components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`shop_page_${currentPage-1}_${category}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(currentPage===1),
        new ButtonBuilder().setCustomId('shop_indicator').setLabel(`${currentPage} / ${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`shop_page_${currentPage+1}_${category}`).setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled(currentPage===pages)));
    components.push(utilities(currentPage,category));
    return {embeds:[embed],components,allowedMentions:{parse:[]}};
}
function buildPurchasePreview(item,account,settings={},profile={},owned=0,priceChanged=false){
    const brand=identity(profile),symbol=settings.currency_symbol||'$',enough=account.wallet>=item.price;
    const limitReached=item.max_per_user!==-1&&owned>=item.max_per_user;
    const canPurchase=item.stock!==0&&enough&&!limitReached;
    const embed=new EmbedBuilder().setColor(canPurchase?brand.color:0xd89d55).setAuthor({name:`${brand.name} · FICHA DE ARTÍCULO`})
        .setTitle(clip(`${item.icon||'📦'} ${item.name}`,256)).setDescription(clip(item.description||'Sin descripción adicional.',1800))
        .addFields({name:'Precio',value:money(item.price,symbol),inline:true},{name:'Tu cartera',value:money(account.wallet,symbol),inline:true},
            {name:enough?'Saldo después':'Te faltan',value:money(Math.abs(account.wallet-item.price),symbol),inline:true},
            {name:'Disponibilidad',value:availability(item),inline:true},{name:'Límite por persona',value:item.max_per_user===-1?'Sin límite':`${owned} de ${item.max_per_user} adquiridos`,inline:true});
    for(const [title,ids]of [['Roles que recibirás',item.roles_to_give],['Roles que se retirarán',item.roles_to_remove],['Requiere uno de estos roles',item.required_roles],['Incompatible con estos roles',item.blocked_roles]]){
        const mentions=roles(ids);if(mentions)embed.addFields({name:title,value:mentions,inline:false});
    }
    const notices=[];
    if(priceChanged)notices.push('El precio cambió. Revisa el importe actualizado antes de confirmar.');
    if(item.stock===0)notices.push('Este artículo está agotado.');
    if(!enough)notices.push('Necesitas más dinero en la cartera. Puedes retirar fondos del banco con /economia retirar.');
    if(limitReached)notices.push('Ya alcanzaste el límite de este artículo.');
    if(notices.length)embed.addFields({name:'Antes de comprar',value:notices.join('\n')});
    embed.setFooter({text:'Se compra una unidad. El saldo, el stock y los requisitos se comprueban al confirmar.'});
    return {embed,canPurchase};
}
module.exports={renderShopPanel,buildPurchasePreview,identity};
