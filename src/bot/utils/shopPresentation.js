const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,escapeMarkdown}=require('discord.js');
const {ContainerBuilder,SectionBuilder,TextDisplayBuilder,MediaGalleryBuilder,MediaGalleryItemBuilder,AttachmentBuilder,MessageFlags}=require('discord.js');
const path=require('node:path');
const {shopThemes}=require('../../shared/shopThemes');
const PAGE_SIZE=3;
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
function renderShopPanel(allItems,settings={},profile={},page=1,category='all',presentation={}){
    if(!Object.hasOwn(categories,category))category='all';
    const hasRoles=item=>(item.roles_to_give||[]).length>0;
    const counts={all:allItems.length,ranks:allItems.filter(hasRoles).length,supplies:allItems.filter(item=>!hasRoles(item)).length};
    const items=allItems.filter(item=>category==='all'||(category==='ranks'?hasRoles(item):!hasRoles(item)));
    const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
    const currentPage=Math.min(pages,Math.max(1,Number.isFinite(Number(page))?Math.floor(Number(page)):1));
    const selected=items.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
    const brand=identity(profile),symbol=settings.currency_symbol||'$';
    const shopTheme=typeof profile.shop_theme==='string'&&Object.hasOwn(shopThemes,profile.shop_theme)?profile.shop_theme:'neutral';
    const accent=presentation.color?parseInt(presentation.color.replace('#',''),16):shopThemes[shopTheme].color;
    const name=brand.name;
    const imageName=`shop-header-${shopTheme}.png`;
    const header=new ContainerBuilder().setAccentColor(accent).addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${imageName}`).setDescription('Cabecera de Intendencia')))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${label(name)}  /  ${categories[category].toUpperCase()}
${presentation.title?'## '+clip(label(presentation.title),150)+'\n':''}${presentation.description?clip(presentation.description,350):'Tu próximo equipo, a un paso. Consulta la ficha antes de adquirirlo.'}`));
    const cards=selected.map(item=>{
        const price=item.price===0?'GRATIS':money(item.price,symbol);
        const description=String(item.description||'Consulta los detalles y requisitos en la ficha.').replace(/[*_~`#>|]/g,'').replace(/\s+/g,' ').trim();
        const meta=[item.stock===0?'Agotado':item.stock===-1?'Stock ilimitado':`${item.stock} en stock`,item.max_per_user<=0?'Sin límite de compra':`Máx. ${item.max_per_user} por persona`];
        if(item.required_roles?.length)meta.push('Requiere acreditación');
        const section=new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### ${clip(item.icon||'📦',40)} ${clip(label(item.name),85)}\n**${price}**${item.stock>0&&item.stock<=3?'  ·  Últimas unidades':''}\n${clip(label(description),180)}\n-# ${meta.join(' · ')}`))
            .setButtonAccessory(new ButtonBuilder().setCustomId(`buy_shop_${item.id}`).setLabel(item.stock===0?'Agotado':'Ver ficha').setStyle(item.stock===0?ButtonStyle.Secondary:ButtonStyle.Primary).setDisabled(item.stock===0));
        return new ContainerBuilder().setAccentColor(item.stock===0?0x5a606b:accent).addSectionComponents(section);
    });
    if(!cards.length)cards.push(new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(
        allItems.length?'### Esta sección está vacía\nPrueba con otra categoría para seguir explorando.':'### Estamos preparando el almacén\nLos nuevos artículos aparecerán aquí cuando Intendencia los publique.')));
    const controls=new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${items.length} ${items.length===1?'ARTÍCULO':'ARTÍCULOS'}  ·  PÁGINA ${currentPage} / ${pages}  ·  ${label(clip(settings.currency_name||'Créditos',60)).toUpperCase()}`));
    if(allItems.length)controls.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('shop_category').setPlaceholder('Explorar el almacén').addOptions(
        Object.entries(categories).map(([value,title])=>({label:`${title} (${counts[value]})`,value,default:value===category})))));
    if(pages>1)controls.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`shop_page_${currentPage-1}_${category}`).setLabel('Anterior').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage===1),
        new ButtonBuilder().setCustomId('shop_indicator').setLabel(`${currentPage} / ${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`shop_page_${currentPage+1}_${category}`).setLabel('Siguiente').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage===pages)));
    controls.addActionRowComponents(utilities(currentPage,category));
    return {flags:MessageFlags.IsComponentsV2,components:[header,...cards,controls],files:[new AttachmentBuilder(path.join(__dirname,'../../web/public/media',imageName),{name:imageName})],allowedMentions:{parse:[]}};
}
function asShopUpdate(payload){return {...payload,content:null,embeds:[],attachments:[]};}
function buildPurchasePreview(item,account,settings={},profile={},owned=0,priceChanged=false){
    const brand=identity(profile),symbol=settings.currency_symbol||'$',enough=account.wallet>=item.price;
    const limitReached=item.max_per_user>0&&owned>=item.max_per_user;
    const canPurchase=item.stock!==0&&enough&&!limitReached;
    const embed=new EmbedBuilder().setColor(canPurchase?brand.color:0xd89d55).setAuthor({name:`${brand.name} · FICHA DE ARTÍCULO`})
        .setTitle(clip(`${item.icon||'📦'} ${item.name}`,256)).setDescription(clip(item.description||'Sin descripción adicional.',1800))
        .addFields({name:'Precio',value:money(item.price,symbol),inline:true},{name:'Tu cartera',value:money(account.wallet,symbol),inline:true},
            {name:enough?'Saldo después':'Te faltan',value:money(Math.abs(account.wallet-item.price),symbol),inline:true},
            {name:'Disponibilidad',value:availability(item),inline:true},{name:'Límite por persona',value:item.max_per_user<=0?'Sin límite':`${owned} de ${item.max_per_user} adquiridos`,inline:true});
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
module.exports={renderShopPanel,buildPurchasePreview,identity,asShopUpdate};
