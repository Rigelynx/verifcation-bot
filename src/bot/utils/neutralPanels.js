const {ContainerBuilder,TextDisplayBuilder,SectionBuilder,MediaGalleryBuilder,MediaGalleryItemBuilder,AttachmentBuilder,MessageFlags,EmbedBuilder}=require('discord.js');
const path=require('node:path');
const {shopThemes}=require('../../shared/shopThemes');
const clip=(value,max=1000)=>{const text=String(value??'');return text.length>max?text.slice(0,max-1)+'…':text;};
function durationText(seconds){const count=seconds%86400===0?seconds/86400:seconds%3600===0?seconds/3600:Math.ceil(seconds/60);const unit=seconds%86400===0?(count===1?'día':'días'):seconds%3600===0?(count===1?'hora':'horas'):(count===1?'minuto':'minutos');return `${count} ${unit}`;}
function panelProfile(guildId){
    const profile=require('../../database/communityDb').ensureCommunity(guildId||require('../../database/guildContext').currentGuild());
    const theme=typeof profile.panel_theme==='string'&&Object.hasOwn(shopThemes,profile.panel_theme)?profile.panel_theme:'neutral';
    return {name:clip(profile.short_name||profile.display_name||'Comunidad',80),color:shopThemes[theme].color,theme};
}
function nativePanel({title,description='',cards=[],rows=[],footer='',guildId,kind,color,hero=false}){
    const brand=panelProfile(guildId),accent=color??brand.color;
    const header=new ContainerBuilder().setAccentColor(accent),files=[];
    if(hero&&['verification','bonus','servers','events','help','inventory','economy'].includes(kind)){
        const name=`panel-header-${kind}${brand.theme==='neutral'?'':'-'+brand.theme}.png`;files.push(new AttachmentBuilder(path.join(__dirname,'../../web/public/media',name),{name}));
        header.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`).setDescription('Cabecera del panel')));
    }
    header.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${brand.name}\n## ${clip(title,160)}${description?'\n'+clip(description,900):''}`));
    const components=[header];let textBudget=3600-header.components.filter(node=>node.data?.content).reduce((sum,node)=>sum+node.data.content.length,0)-String(footer).length;
    for(const card of cards.slice(0,7)){
        if(textBudget<40)break;
        const cardTitle=clip(card.title,120),cardText=clip(card.text,Math.max(1,Math.min(650,textBudget-cardTitle.length-6)));
        const content=new TextDisplayBuilder().setContent(`### ${cardTitle}\n${cardText}`);textBudget-=cardTitle.length+cardText.length+6;
        const container=new ContainerBuilder().setAccentColor(card.color??accent);
        if(card.button)container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(content).setButtonAccessory(card.button));
        else container.addTextDisplayComponents(content);
        components.push(container);
    }
    if(footer||rows.length){const controls=new ContainerBuilder();if(footer)controls.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${clip(footer,300)}`));controls.addActionRowComponents(...rows.slice(0,5));components.push(controls);}
    return {flags:MessageFlags.IsComponentsV2,components,allowedMentions:{parse:[]},...(files.length?{files}:{})};
}
function isNative(payload){return Boolean((Number(payload?.flags||0)&MessageFlags.IsComponentsV2)||(payload?.components||[]).some(row=>[9,10,12,17].includes(row.type??row.data?.type)));}
function normalizePanelUpdate(payload,sourceNative=false){
    if(typeof payload==='string')payload={content:payload};
    if(!payload)return payload;
    if(!isNative(payload)&&!sourceNative)return payload;
    if(!isNative(payload)){
        const parts=[payload.content,...(payload.embeds||[]).flatMap(raw=>{const embed=raw.toJSON?.()||raw;return [embed.title,embed.description,...(embed.fields||[]).map(field=>`**${field.name}**\n${field.value}`),embed.footer?.text];})].filter(Boolean);
        const display=new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(clip(parts.join('\n\n')||'Actualizado.',3500)));
        if(payload.components?.length)display.addActionRowComponents(...payload.components);
        payload={...payload,components:[display]};
    }
    return {...payload,flags:(Number(payload.flags||0)|MessageFlags.IsComponentsV2)&~MessageFlags.Ephemeral,content:null,embeds:[],attachments:[]};
}
function installPanelTransport(interaction){
    if(interaction.__neutralPanelTransport)return;interaction.__neutralPanelTransport=true;
    let sourceNative=Boolean(Number(interaction.message?.flags?.bitfield??interaction.message?.flags??0)&MessageFlags.IsComponentsV2);
    for(const name of ['reply','followUp','update','editReply'])if(typeof interaction[name]==='function'){
        const original=interaction[name].bind(interaction);
        interaction[name]=async payload=>{
            const editing=name==='update'||name==='editReply';
            const value=editing?normalizePanelUpdate(payload,sourceNative):isNative(payload)?{...payload,flags:Number(payload.flags||0)|MessageFlags.IsComponentsV2}:payload;
            const result=await original(value);if(editing&&isNative(value))sourceNative=true;return result;
        };
    }
}
function receipt(title,fields,guildId,color=0x59c9a5){return new EmbedBuilder().setColor(color).setTitle(title).addFields(fields.map(field=>({name:clip(field.name,120),value:clip(field.value,900)||'—',inline:field.inline??true}))).setFooter({text:`${panelProfile(guildId).name} · Registro de la operación`});}
module.exports={clip,panelProfile,nativePanel,isNative,normalizePanelUpdate,installPanelTransport,receipt,durationText};
