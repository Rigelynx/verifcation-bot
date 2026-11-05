const db=require('../database/db');
const eco=require('../database/economyDb');
const community=require('../database/communityDb');
const budget=require('../database/weeklyBudget');
const {shopThemes}=require('../shared/shopThemes');
const {hasAdminPermission}=require('../bot/handlers/permissionHandler');
const {validateArguments}=require('./schema');
const text=maxLength=>({type:'string',maxLength});
const integer={type:'integer',minimum:0,maximum:1000000000};
const id={type:'string',pattern:'^\\d{17,20}$'};
const fields=properties=>({type:'object',properties,additionalProperties:false});
const definition=(name,description,properties={},required=[])=>({type:'function',function:{name,description,parameters:{...fields(properties),required}}});
const economyFields={currency_name:text(40),currency_symbol:text(12)};
for(const key of ['work_min','work_max','work_cooldown','crime_min','crime_max','crime_cooldown','rob_cooldown','starting_balance','bonus_daily_amount','bonus_daily_cooldown','bonus_max_give']) economyFields[key]=integer;
for(const key of ['crime_fail_rate','rob_fail_rate']) economyFields[key]={type:'number',minimum:0,maximum:100};
economyFields.bonus_daily_enabled={type:'integer',enum:[0,1]};
const webTools=[
    definition('configure_verification','Edita modo de verificación, textos, canales y roles del formulario web. Conserva campos no indicados. Los roles requieren Administración de Discord y jerarquía válida.',{fields:fields({verification_mode:{type:'string',enum:['auto','manual']},military_base_name:text(100),military_subtitle:text(200),review_channel_id:id,log_channel_id:id,verified_role_id:{type:'array',maxItems:10,items:id},unverified_role_id:{type:'array',maxItems:10,items:id},officer_role_id:{type:'array',maxItems:10,items:id},admin_role_id:{type:'array',maxItems:10,items:id}})},['fields']),
    definition('configure_report_template','Crea o edita una plantilla de reportes de eventos. Conserva los campos no indicados.',{template_id:{type:'integer',minimum:1},fields:fields({name:text(80),title:text(120),description:text(1000),emoji:text(16),color:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},footer:text(200),report_channel_id:id,template_kind:{type:'string',enum:['ALL','TRAINING','PATROL','OPERATION']},grouping_mode:{type:'string',enum:['LIST','STATUS','ROLES']},evidence_required:{type:'boolean'},show_payout:{type:'boolean'},is_active:{type:'boolean'}})},['fields']),
    definition('web_configuration','Consulta la configuración web, preguntas, economía, permisos de comandos y presupuesto de ESTA comunidad. Requiere administración.'),
    definition('configure_branding','Edita identidad y diseño. theme cambia el estilo de la web; shop_theme el diseño de tienda de Discord, por separado. Conserva los campos no indicados. paf selecciona Polonia.',{fields:fields({display_name:text(100),short_name:text(16),theme:{type:'string',enum:['neutral','usmc','ukaf','paf','custom']},shop_theme:{type:'string',enum:Object.keys(shopThemes)},panel_theme:{type:'string',enum:Object.keys(shopThemes)},accent:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},logo_url:text(1000),banner_url:text(1000)})},['fields']),
    definition('configure_question','Crea o edita una pregunta del cuestionario. Con question_id conserva los campos no indicados.',{question_id:{type:'integer',minimum:1},fields:fields({label:text(200),description:text(1000),field_type:{type:'string',enum:['text','textarea','select','number']},options:{type:'array',maxItems:25,items:text(100)},required:{type:'boolean'},sort_order:{type:'integer',minimum:0,maximum:10000}})},['fields']),
    definition('delete_question','Elimina una pregunta concreta del cuestionario cuando el usuario lo pide.',{question_id:{type:'integer',minimum:1}},['question_id']),
    definition('configure_economy','Edita los ajustes económicos comunes de web y Discord, conservando lo demás.',{fields:fields(economyFields)},['fields']),
    definition('configure_command','Activa/desactiva un comando o cambia sus roles autorizados. Usa el nombre real devuelto por web_configuration.',{command:text(100),enabled:{type:'boolean'},allowed_roles:{type:'array',maxItems:20,uniqueItems:true,items:id}},['command','enabled','allowed_roles']),
    definition('verification_submissions','Consulta expedientes pendientes (hasta diez). Requiere administración.'),
    definition('configure_budget_item','Crea o edita una partida de presupuesto semanal. Son importes de planificación; no descuenta cuentas.',{id:{type:'integer',minimum:1},category:{type:'string',enum:budget.categories},name:text(100),planned:integer,actual:integer,active:{type:'boolean'}},['category','name','planned','actual','active']),
    definition('configure_budget_schedule','Programa un informe semanal por código normal del bot, sin consultas recurrentes de IA. next_at es fecha ISO futura con zona horaria.',{channel_id:id,enabled:{type:'boolean'},next_at:text(40)},['channel_id','enabled','next_at'])
];
async function executeWeb(name,args,context) {
    validateArguments(webTools.find(tool=>tool.function.name===name).function.parameters,args);
    const query=['web_configuration','verification_submissions'].includes(name);
    if(!query&&(!context.assistantPolicy?.[name]||!await context.authorizeAction?.(name,args))) throw new Error('Habilita la capacidad en Owner y solicita ese cambio concreto.');
    if(context.refreshIdentity) await context.refreshIdentity();
    const {guild,member,bot}=context;
    if(!hasAdminPermission({guild,guildId:guild.id,member,user:{id:member.id}})) throw new Error('Necesitas administración de esta comunidad.');
    if(!query&&!context.assistantPolicy?.[name]) throw new Error('El propietario deshabilitó esta herramienta.');
    if(name==='web_configuration') return {branding:community.publicProfile(community.ensureCommunity(guild.id)),verification:db.getConfig(guild.id),questions:db.getQuestions(),economy:eco.getEconomySettings(guild.id),commands:eco.getCommandPermissions(),report_templates:eco.getEventReportTemplates(guild.id,true),budget:budget.snapshot()};
    if(name==='verification_submissions') return {submissions:db.getAllVerifications('PENDIENTE').slice(0,10).map(row=>({user_id:row.discord_id,username:row.username,answers:row.answers,updated_at:row.updated_at}))};
    context.webResults ||= new Map();const key=name+JSON.stringify(args);
    if(context.webResults.has(key)) return context.webResults.get(key);
    let before,after;
    if(args.fields&&!Object.keys(args.fields).length) throw new Error('Indica al menos un campo para editar.');
    if(name==='configure_verification') {
        const {PermissionFlagsBits:P}=require('discord.js');
        before=db.getConfig(guild.id);after={...args.fields};
        for(const [key,value] of Object.entries(after)) {
            if(key.endsWith('_role_id')) {
                if(member.id!==guild.ownerId&&!member.permissions.has(P.Administrator)) throw new Error('Configurar roles del sistema requiere Administración de Discord.');
                for(const roleId of value){const role=await guild.roles.fetch(roleId);
                    if(!role||role.id===guild.id||role.managed||role.position>=bot.roles.highest.position||!bot.permissions.has(P.ManageRoles)||!bot.permissions.has(role.permissions)||(member.id!==guild.ownerId&&role.position>=member.roles.highest.position)) throw new Error('No puedes configurar ese rol por jerarquía o permisos.');
                }after[key]=value.join(',');
            }else if(key.endsWith('_channel_id')) {
                const channel=await guild.channels.fetch(value);
                if(!channel?.isTextBased()||channel.guildId!==guild.id||![member,bot].every(identity=>channel.permissionsFor(identity)?.has([P.ViewChannel,P.SendMessages]))) throw new Error('No hay permiso para usar ese canal.');
            }
        }
    }else if(name==='configure_report_template') {
        before=args.template_id?eco.getEventReportTemplateById(args.template_id,guild.id):null;
        if(args.template_id&&!before) throw new Error('Plantilla no encontrada.');
        after={...before,...args.fields};
        if(after.report_channel_id){const channel=await guild.channels.fetch(after.report_channel_id);if(!channel?.isTextBased()||channel.guildId!==guild.id||![member,bot].every(identity=>channel.permissionsFor(identity)?.has(['ViewChannel','SendMessages'])))throw new Error('No puedes usar ese canal de reportes.');}
    }else if(name==='configure_branding') {before=community.publicProfile(community.ensureCommunity(guild.id));after={...before,...args.fields};}
    else if(name==='configure_question'||name==='delete_question') {
        before=args.question_id?db.getQuestions().find(row=>row.id===args.question_id):null;
        if(args.question_id&&!before) throw new Error('Pregunta no encontrada en esta comunidad.');
        after={label:'',description:'',field_type:'text',options:[],required:true,sort_order:0,...before,...args.fields};
        if(name!=='delete_question'&&(!after.label.trim()||(after.field_type==='select'&&!after.options.length))) throw new Error('Indica enunciado y opciones para las preguntas de selección.');
    }else if(name==='configure_economy') {
        before=eco.getEconomySettings(guild.id);after={...before,...args.fields};
        if(after.work_min>after.work_max||after.crime_min>after.crime_max) throw new Error('El mínimo no puede superar el máximo.');
    }else if(name==='configure_command') {
        before=eco.getCommandPermissions().find(row=>row.command_name===args.command);
        if(!before) throw new Error('Comando desconocido. Consulta web_configuration.');
        for(const roleId of args.allowed_roles) if(!await guild.roles.fetch(roleId)) throw new Error('Rol no encontrado.');
    }else if(name==='configure_budget_schedule') {
        const channel=await guild.channels.fetch(args.channel_id);
        const {PermissionFlagsBits:P}=require('discord.js');
        if(!channel?.isTextBased()||channel.guildId!==guild.id||![member,bot].every(identity=>channel.permissionsFor(identity)?.has([P.ViewChannel,P.SendMessages]))) throw new Error('Ambas cuentas necesitan acceso de escritura al canal.');
    }
    context.audit('IA_WEB_INICIO',name,JSON.stringify({request_id:context.requestId,args,before}));
    let result;
    if(name==='configure_verification') result=db.updateConfig(guild.id,after);
    else if(name==='configure_report_template') result=eco.saveEventReportTemplate(guild.id,{...after,...(args.template_id?{id:args.template_id}:{})});
    else if(name==='configure_branding') result=community.publicProfile(community.updateBranding(guild.id,after));
    else if(name==='configure_question') {if(before){db.updateQuestion(before.id,after);result={id:before.id};}else result={id:Number(db.addQuestion(after))};}
    else if(name==='delete_question') {db.deleteQuestion(args.question_id);result={id:args.question_id};}
    else if(name==='configure_economy') result=eco.updateEconomySettings(guild.id,args.fields);
    else if(name==='configure_command') result=eco.updateCommandPermission(args.command,args.enabled,args.allowed_roles);
    else if(name==='configure_budget_item') result=budget.saveItem(args);
    else result=budget.saveSchedule(args);
    const receipt={changed:true,updated:true,result,...(result.id?{id:result.id}:{}),deleted:name==='delete_question'};
    context.webResults.set(key,receipt);context.writeCount++;
    try{context.audit('IA_WEB_RESULTADO',name,JSON.stringify({request_id:context.requestId,result}));}catch{receipt.audit_warning='El cambio se guardó; falta el registro final de auditoría.';}
    return receipt;
}
module.exports={webTools,executeWeb};
