const budget=require('../database/weeklyBudget');
const db=require('../database/db');
const {withGuild}=require('../database/guildContext');
function installWeeklyBudgetRoutes(app,client,requireAdmin) {
    const route=fn=>async(req,res)=>withGuild(req.guildId,async()=>{
        res.set('Cache-Control','no-store');
        try{const data=await fn(req);res.json({success:true,...data});}catch(error){res.status(400).json({success:false,message:error.message});}
    });
    app.get('/api/admin/weekly-budget',requireAdmin,route(()=>budget.snapshot()));
    app.post('/api/admin/weekly-budget/items',requireAdmin,route(req=>{
        const result=budget.saveItem(req.body);db.addAdminAuditLog(req.adminOperator,'PRESUPUESTO_PARTIDA',String(result.id),JSON.stringify(req.body));return result;
    }));
    app.put('/api/admin/weekly-budget/schedule',requireAdmin,route(async req=>{
        const guild=client?.guilds.cache.get(req.guildId),channel=await guild?.channels.fetch(req.body.channel_id);
        if(!channel?.isTextBased()||channel.guildId!==req.guildId||!channel.permissionsFor(await guild.members.fetchMe()).has(['ViewChannel','SendMessages'])) throw new Error('El bot necesita permiso para publicar en ese canal.');
        if(req.discordIdentity?.id) {const member=await guild.members.fetch(req.discordIdentity.id);if(!channel.permissionsFor(member)?.has(['ViewChannel','SendMessages']))throw new Error('No puedes publicar en ese canal.');}
        const schedule=budget.saveSchedule(req.body);db.addAdminAuditLog(req.adminOperator,'PRESUPUESTO_PROGRAMAR',req.guildId,JSON.stringify(schedule));return {schedule};
    }));
}
module.exports={installWeeklyBudgetRoutes};
