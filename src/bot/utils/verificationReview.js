const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle}=require('discord.js');
const {clip,panelProfile}=require('./neutralPanels');
function buildVerificationReview(record,guild,page=0,readOnly=false){
    const entries=Object.entries(record.answers||{}),pages=Math.max(1,Math.ceil(entries.length/6));
    page=Math.min(Math.max(0,Math.floor(Number(page)||0)),pages-1);
    const pending=record.status==='PENDIENTE',status=pending?'Pendiente':record.status==='APROBADO'?'Aprobado':'Rechazado';
    const embed=new EmbedBuilder().setColor(pending?panelProfile(guild.id).color:record.status==='APROBADO'?0x59c9a5:0xe36f75)
        .setTitle(`${status} · ${clip(record.username,90)}`).setDescription(`<@${record.discord_id}> · Expediente de verificación`)
        .addFields(entries.slice(page*6,page*6+6).map(([name,value])=>({name:clip(name,140)||'Pregunta',value:clip(value,600)||'Sin respuesta'})))
        .setFooter({text:`${panelProfile(guild.id).name} · Respuestas ${page+1}/${pages}`});
    if(!pending)embed.addFields({name:'Resolución',value:clip(`${record.reviewer_name||record.reviewer_id||'Responsable'} · ${record.reason||status}`,700)});
    const components=readOnly?[]:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_verify_${record.discord_id}`).setLabel('Aprobar').setStyle(ButtonStyle.Success).setDisabled(!pending),
        new ButtonBuilder().setCustomId(`reject_verify_${record.discord_id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger).setDisabled(!pending))];
    if(pages>1)components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${readOnly?'dossier':'verification'}_page_${record.discord_id}_${page-1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page===0),
        new ButtonBuilder().setCustomId(`${readOnly?'dossier':'verification'}_page_${record.discord_id}_${page+1}`).setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled(page===pages-1)));
    return {embeds:[embed],components,allowedMentions:{parse:[]}};
}
module.exports={buildVerificationReview};
