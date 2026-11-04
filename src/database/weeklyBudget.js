const {db}=require('./db');
const {currentGuild,withGuild}=require('./guildContext');
const WEEK=7*86400000;
db.exec(`CREATE TABLE IF NOT EXISTS weekly_budget_items(id INTEGER PRIMARY KEY, guild_id TEXT NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL, planned INTEGER NOT NULL, actual INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS weekly_budget_schedule(guild_id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS weekly_budget_reports(id INTEGER PRIMARY KEY,guild_id TEXT NOT NULL,scheduled_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'CLAIMED',snapshot TEXT NOT NULL,message_id TEXT,error TEXT,UNIQUE(guild_id,scheduled_at));`);
const categories=['armamento','infanteria','logistica','entrenamiento','sanidad','reserva','otros'];
function snapshot() {
    const items=db.prepare('SELECT * FROM weekly_budget_items WHERE guild_id=? ORDER BY category,id').all(currentGuild());
    const schedule=db.prepare('SELECT * FROM weekly_budget_schedule WHERE guild_id=?').get(currentGuild())||null;
    const reports=db.prepare('SELECT * FROM weekly_budget_reports WHERE guild_id=? ORDER BY id DESC LIMIT 8').all(currentGuild()).map(row=>({...row,snapshot:JSON.parse(row.snapshot)}));
    return {categories,items,schedule,reports,mode:'planning',note:'Importes de planificación; no modifican cuentas de miembros.'};
}
function saveItem(input) {
    const {id,category,name,planned,actual=0,active=true}=input;
    if(!categories.includes(category)||typeof name!=='string'||!name.trim()||name.length>100||![planned,actual].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000)||typeof active!=='boolean') throw new Error('Partida inválida: revisa categoría, nombre e importes.');
    if(id!==undefined) {
        if(!Number.isSafeInteger(id)||id<1) throw new Error('ID de partida inválido.');
        const result=db.prepare('UPDATE weekly_budget_items SET category=?,name=?,planned=?,actual=?,active=? WHERE guild_id=? AND id=?').run(category,name.trim(),planned,actual,Number(active),currentGuild(),id);
        if(!result.changes) throw new Error('Partida no encontrada en esta comunidad.');
        return {id};
    }
    if(db.prepare('SELECT count(*) AS n FROM weekly_budget_items WHERE guild_id=?').get(currentGuild()).n>=200) throw new Error('Se admiten hasta 200 partidas por comunidad.');
    return {id:Number(db.prepare('INSERT INTO weekly_budget_items(guild_id,category,name,planned,actual,active) VALUES(?,?,?,?,?,?)').run(currentGuild(),category,name.trim(),planned,actual,Number(active)).lastInsertRowid)};
}
function saveSchedule({channel_id,enabled,next_at}) {
    const timestamp=typeof next_at==='string'?Date.parse(next_at):next_at;
    if(!/^\d{17,20}$/.test(channel_id||'')||typeof enabled!=='boolean'||!Number.isSafeInteger(timestamp)||timestamp<=0||(enabled&&timestamp<=Date.now())||timestamp>Date.now()+366*86400000) throw new Error('Elige un canal y una fecha futura válida para el primer informe.');
    db.prepare('INSERT INTO weekly_budget_schedule VALUES(?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,enabled=excluded.enabled,next_at=excluded.next_at').run(currentGuild(),channel_id,Number(enabled),timestamp);
    return snapshot().schedule;
}
async function tick(client,now=Date.now()) {
    for(const schedule of db.prepare('SELECT * FROM weekly_budget_schedule WHERE enabled=1 AND next_at<=?').all(now)) await withGuild(schedule.guild_id,async()=>{
        const data=snapshot(),items=data.items.filter(row=>row.active),totals=items.reduce((sum,row)=>({planned:sum.planned+row.planned,actual:sum.actual+row.actual}),{planned:0,actual:0});
        const report={items,totals,period_at:schedule.next_at};
        const claimed=db.transaction(()=>{
            const next=schedule.next_at+(Math.floor((now-schedule.next_at)/WEEK)+1)*WEEK;
            if(!db.prepare('UPDATE weekly_budget_schedule SET next_at=? WHERE guild_id=? AND next_at=? AND enabled=1').run(next,schedule.guild_id,schedule.next_at).changes) return false;
            return db.prepare('INSERT OR IGNORE INTO weekly_budget_reports(guild_id,scheduled_at,snapshot) VALUES(?,?,?)').run(schedule.guild_id,schedule.next_at,JSON.stringify(report)).changes>0;
        })();
        if(!claimed) return;
        try {
            const guild=client.guilds.cache.get(schedule.guild_id);
            if(!guild) throw new Error('Bot no disponible en la comunidad.');
            const channel=await guild.channels.fetch(schedule.channel_id);
            if(!channel?.isTextBased()||channel.guildId!==guild.id) throw new Error('Canal del informe no disponible.');
            const breakdown=categories.map(category=>{const rows=items.filter(row=>row.category===category);return rows.length?`${category}: previsto ${rows.reduce((n,r)=>n+r.planned,0)} · registrado ${rows.reduce((n,r)=>n+r.actual,0)}`:null;}).filter(Boolean);
            const message=await channel.send({content:`📋 **PRESUPUESTO SEMANAL**\n${breakdown.join('\n')||'Sin partidas activas.'}\n\nTotal previsto: **${totals.planned}** · Registrado: **${totals.actual}**\nDiferencia: **${totals.planned-totals.actual}**\nInforme de planificación. Los importes se repiten mientras las partidas estén activas.`,allowedMentions:{parse:[]}});
            db.prepare("UPDATE weekly_budget_reports SET status='SENT',message_id=? WHERE guild_id=? AND scheduled_at=?").run(message.id,schedule.guild_id,schedule.next_at);
        }catch(error){db.prepare("UPDATE weekly_budget_reports SET status='ERROR',error=? WHERE guild_id=? AND scheduled_at=?").run(String(error.message).slice(0,300),schedule.guild_id,schedule.next_at);}
    });
}
function start(client) {
    let running=false;
    const run=async()=>{if(running||!client.isReady())return;running=true;try{await tick(client);}catch(error){console.error('[Weekly budget]',error.message);}finally{running=false;}};
    const timer=setInterval(run,60000);timer.unref();run();return ()=>clearInterval(timer);
}
module.exports={categories,snapshot,saveItem,saveSchedule,tick,start};
