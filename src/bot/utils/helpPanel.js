const {ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle,PermissionFlagsBits:P}=require('discord.js');
const eco=require('../../database/economyDb');
const {nativePanel}=require('./neutralPanels');
const {hasOfficerPermission,hasAdminPermission}=require('../handlers/permissionHandler');
const sections=[
    {name:'Inicio',description:'Accesos rápidos de tu comunidad.',entries:[['help','Centro de ayuda','Consulta las funciones disponibles para tu cuenta.'],['tienda:panel','Abrir tienda','Explora los artículos y revisa las condiciones de compra.'],['patrulla','Portal de operaciones','Abre el portal web con tus eventos y participantes.','officer']]},
    {name:'Acceso y expedientes',description:'Verificación y administración de acceso.',entries:[['panel-verificacion','Publicar verificación','Publica el acceso al formulario de ingreso.','admin'],['datos-usuario','Consultar expediente','Revisa un expediente de este servidor.','officer'],['admin:verificar-manual','Aprobar acceso','Acredita a la persona indicada.','officer'],['admin:desverificar','Revocar acceso','Retira una acreditación con un motivo.','officer']]},
    {name:'Economía y bonos',description:'Tus fondos, movimientos y recompensas.',entries:[['economia:balance','Consultar saldo','Abre tu cartera, banco y movimientos.'],['economia:depositar','Depositar','Mueve dinero de tu cartera al banco.'],['economia:retirar','Retirar','Mueve dinero del banco a tu cartera.'],['economia:pagar','Transferir','Envía un importe a otro miembro.'],['economia:trabajar','Trabajar','Consulta si puedes recibir tu siguiente paga.'],['bono:reclamar','Reclamar bono','Solicita un bono disponible para tu cuenta.']]},
    {name:'Tienda y operaciones',description:'Equipo, servidores, convocatorias y reportes.',entries:[['tienda:panel','Catálogo','Selecciona un artículo para abrir su ficha.'],['tienda:inventario','Inventario','Consulta tus artículos y cantidades.'],['servidor:lista','Servidores','Consulta disponibilidad y gestiona una reserva.','officer'],['evento:convocar','Convocar evento','Publica la inscripción de una operación.','officer'],['evento:entrenamiento','Crear entrenamiento','Configura una actividad y su rol de recompensa.','officer'],['evento:lista','Participantes','Abre la asistencia y los equipos.','officer'],['evento:finalizar','Finalizar evento','Revisa el reporte y procesa las recompensas.','officer']]},
    {name:'Administración',description:'Herramientas disponibles según tus permisos.',entries:[['admin:panel-web','Dashboard','Abre la configuración de esta comunidad.','admin'],['admin:configurar','Configuración','Administra roles, canales y verificación.','admin'],['mod:timeout','Aislar temporalmente','Aplica un aislamiento por duración.',P.ModerateMembers],['mod:kick','Expulsar','Retira a una persona del servidor.',P.KickMembers],['mod:ban','Banear','Bloquea el ingreso de una persona.',P.BanMembers],['mod:purge','Limpiar mensajes','Elimina una cantidad de mensajes.',P.ManageMessages]]}
];
function buildHelpPanel(page=1,guildId='GLOBAL',member=null,guild=null){
    page=Math.min(Math.max(1,Math.floor(Number(page)||1)),sections.length);
    const section=sections[page-1],context={member,guild:guild||{id:guildId},guildId,user:{id:member?.id}};
    const entries=section.entries.filter(([key,,,gate])=>{
        const permission=eco.isCommandAllowed(key,member);if(!permission.allowed)return false;
        if(!member||!gate)return true;
        if(typeof gate==='bigint')return Boolean(member.permissions?.has?.(gate));
        return permission.grantedByRole||(gate==='admin'?hasAdminPermission(context):hasOfficerPermission(context));
    });
    return nativePanel({guildId,kind:'help',hero:true,title:section.name,description:section.description,
        cards:entries.length?entries.map(([key,title,text])=>({title,text:`${text}\n\`/${key.replaceAll(':',' ')}\``})):[{title:'Sin acciones disponibles',text:'Tu rol no tiene acciones habilitadas en esta sección. Consulta con administración si necesitas acceso.'}],
        footer:`Sección ${page}/${sections.length} · Se comprueban tus permisos al ejecutar cada comando`,rows:[
            new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help_category_select').setPlaceholder('Elegir sección').addOptions(sections.map((section,index)=>({label:section.name,value:String(index+1),default:index+1===page})))),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`help_page_${page-1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page===1),
                new ButtonBuilder().setCustomId(`help_page_${page+1}`).setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled(page===sections.length),new ButtonBuilder().setCustomId('help_refresh_1').setLabel('Inicio').setStyle(ButtonStyle.Secondary))]});
}
module.exports={buildHelpPanel};
