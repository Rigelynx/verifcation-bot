// Export sample payloads using an isolated temporary database. Never connects to Discord.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'panel-preview-'));
process.env.DB_PATH=path.join(directory,'db.sqlite');process.env.USMC_DB_PATH=process.env.DB_PATH;process.env.GUILD_ID='900000000000000001';
const db=require('../src/database/db'),community=require('../src/database/communityDb');
try{
    const id=process.env.GUILD_ID;community.ensureCommunity(id,'Tu comunidad');
    const guild={id,iconURL:()=>null};
    const server=db.createPrivateServer({guild_id:id,server_name:'Servidor Alpha',sector_map:'Zona norte',server_code:'private-preview-only'});
    db.createPrivateServer({guild_id:id,server_name:'Servidor Bravo',sector_map:'Zona sur',server_code:'private-preview-only'});
    db.occupyPrivateServer(server.id,'100000000000000001','Responsable','Patrullaje de reconocimiento',null,id);
    const examples={
        verification:require('../src/bot/commands/panel').buildVerificationPanel(guild,{military_base_name:'Acceso a la comunidad',verification_mode:'manual'}),
        bonus:require('../src/bot/commands/bono').buildBonusPanelMessage({id:1,guild_id:id,title:'Bono de servicio',description:'Una recompensa para el personal de la comunidad.',amount:1500,claim_mode:'COOLDOWN',cooldown_seconds:86400,is_active:1},{currency_symbol:'$'}),
        servers:require('../src/bot/commands/servidor').buildPrivateServersPanel(id)
    };
    for(const [name,payload] of Object.entries(examples))fs.writeFileSync(path.join(__dirname,'../assets',`${name}-panel-preview.json`),JSON.stringify({flags:payload.flags,components:payload.components.map(row=>row.toJSON())},null,2));
    console.log('Exported verification, bonus and server previews.');
}finally{
    db.db.close();
    if(!path.resolve(directory).startsWith(path.join(os.tmpdir(),'panel-preview-')))throw new Error('Unexpected temporary path');
    fs.rmSync(directory,{recursive:true,force:true});
}
