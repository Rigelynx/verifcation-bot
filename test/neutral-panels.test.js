const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'neutral-panels-'));
const G='900000000000000001',B='900000000000000002',OWNER='100000000000000001',MEMBER='100000000000000002';
Object.assign(process.env,{USMC_DB_PATH:path.join(directory,'db.sqlite'),GUILD_ID:G});
const db=require('../src/database/db'),eco=require('../src/database/economyDb'),community=require('../src/database/communityDb');
const {withGuild}=require('../src/database/guildContext');
const {PermissionsBitField,MessageFlags}=require('discord.js');
const {nativePanel,normalizePanelUpdate,installPanelTransport}=require('../src/bot/utils/neutralPanels');
const {handleInteraction}=require('../src/bot/handlers/interactionHandler');
const nodes=payload=>{const walk=node=>[node,...(node.components||[]).flatMap(walk),...(node.accessory?walk(node.accessory):[])];return(payload.components||[]).map(row=>row.toJSON?.()||row).flatMap(walk);};
const text=payload=>nodes(payload).map(row=>row.content||'').join('\n');
community.ensureCommunity(G,'Comunidad Alpha');community.ensureCommunity(B,'Comunidad Beta');
const guild={id:G,ownerId:OWNER,name:'Comunidad Alpha',iconURL:()=>null};
function interaction(id,officer=false,modal=false){const answers=[];return {answers,guildId:G,guild,createdTimestamp:Date.now(),customId:id,user:{id:officer?OWNER:MEMBER,username:'Miembro'},member:{id:officer?OWNER:MEMBER,roles:{cache:new Map()},permissions:new PermissionsBitField(officer?8n:0n)},isChatInputCommand:()=>false,isButton:()=>!modal,isStringSelectMenu:()=>false,isUserSelectMenu:()=>false,isModalSubmit:()=>modal,reply:async payload=>answers.push(payload),update:async payload=>answers.push(payload),editReply:async payload=>answers.push(payload)};}
after(()=>{db.db.close();if(!path.resolve(directory).startsWith(path.join(os.tmpdir(),'neutral-panels-')))throw new Error('Unexpected path');fs.rmSync(directory,{recursive:true,force:true});});
test('verification uses the configured title and neutral local art without inferring another faction',()=>{
    community.updateBranding(G,{...community.publicProfile(community.ensureCommunity(G)),theme:'paf'});
    const payload=require('../src/bot/commands/panel').buildVerificationPanel(guild,{military_base_name:'Acceso Alpha',verification_mode:'manual'});
    assert.match(text(payload),/Acceso Alpha/);assert.match(text(payload),/revisará/);assert.ok(!text(payload).includes('PAF'));
    assert.equal(payload.components[0].toJSON().accent_color,0x87a6ab);assert.equal(payload.flags,32768);
    assert.ok(nodes(payload).some(row=>row.custom_id==='btn_start_verification'));assert.ok(fs.existsSync(payload.files[0].attachment));
});
test('panel palettes are independent per community and default to neutral',()=>{
    const original=community.publicProfile(community.ensureCommunity(G));
    community.updateBranding(G,{...original,panel_theme:'paf'});
    assert.equal(nativePanel({guildId:G,title:'Prueba'}).components[0].toJSON().accent_color,0xcf3b50);
    assert.equal(nativePanel({guildId:B,title:'Prueba'}).components[0].toJSON().accent_color,0x87a6ab);
    community.updateBranding(G,{...original,panel_theme:'neutral'});
});
test('dashboard presets select complete local headers for every panel kind and remain guild scoped',()=>{
    const original=community.publicProfile(community.ensureCommunity(G));
    for(const theme of ['usmc','baf','paf']){
        community.updateBranding(G,{...original,panel_theme:theme});
        for(const kind of ['verification','bonus','servers','events','help','inventory','economy']){
            const payload=nativePanel({guildId:G,title:'Prueba',kind,hero:true});
            assert.equal(payload.files[0].name,`panel-header-${kind}-${theme}.png`);assert.ok(fs.existsSync(payload.files[0].attachment));
            assert.equal(nativePanel({guildId:B,title:'Prueba',kind,hero:true}).files[0].name,`panel-header-${kind}.png`);
        }
    }
    community.updateBranding(G,{...original,panel_theme:'neutral'});
});
test('long panels respect native component and text limits',()=>{
    const payload=nativePanel({guildId:G,title:'T'.repeat(300),description:'D'.repeat(3000),footer:'F'.repeat(800),cards:Array.from({length:7},()=>({title:'N'.repeat(200),text:'X'.repeat(3000)}))});
    assert.ok(nodes(payload).length<=40);assert.ok(text(payload).length<=4000);payload.components.forEach(row=>row.toJSON());
});
test('legacy messages migrate to native cards and native messages retain legal flags for edits',async()=>{
    const value=normalizePanelUpdate({content:'Terminado',components:[]},true);assert.equal(value.flags,32768);assert.equal(value.content,null);assert.deepEqual(value.embeds,[]);assert.match(text(value),/Terminado/);
    const answers=[];const source={message:{flags:new PermissionsBitField(32768n)},editReply:async payload=>answers.push(payload)};
    installPanelTransport(source);await source.editReply({content:'Listo',flags:MessageFlags.Ephemeral});
    assert.equal(answers[0].flags,32768);assert.equal(answers[0].attachments.length,0);
});
test('bonuses present a single amount, accurate frequency and real claim controls',()=>{
    const payload=require('../src/bot/commands/bono').buildBonusPanelMessage({id:1,guild_id:G,amount:700,title:'Bono semanal',claim_mode:'ONCE',is_active:0},{currency_symbol:'$'});
    assert.match(text(payload),/700/);assert.match(text(payload),/Una vez por persona/);
    assert.equal(nodes(payload).find(row=>row.custom_id==='claim_bonus_panel_1').disabled,true);
    const legacy=require('../src/bot/commands/bono').buildBonusPanelMessage({id:1,guild_id:G,amount:700,claim_mode:'ONCE',is_active:1,description:'El Estado Mayor de la Base USMC ha autorizado una asignación financiera especial para el personal militar en servicio activo.'});
    assert.ok(!text(legacy).includes('USMC'));
    assert.ok(!eco.createBonusPanel(G,{amount:200}).description.includes('USMC'));
});
test('server access codes are excluded from public panels and available only to authorized private details',async()=>withGuild(G,async()=>{
    const server=db.createPrivateServer({guild_id:G,server_name:'Servidor Alpha',server_code:'private-code-123'});
    const publicPanel=require('../src/bot/commands/servidor').buildPrivateServersPanel(G);
    assert.ok(!JSON.stringify(publicPanel.components.map(row=>row.toJSON())).includes(server.server_code));
    const denied=interaction(`srv_details_${server.id}`);await handleInteraction(denied,{},new Map());assert.equal(denied.answers[0].flags,64);assert.ok(!JSON.stringify(denied.answers).includes(server.server_code));
    const allowed=interaction(`srv_details_${server.id}`,true);await handleInteraction(allowed,{},new Map());assert.equal(allowed.answers[0].flags,64);assert.ok(JSON.stringify(allowed.answers).includes(server.server_code));
    const foreign=withGuild(B,()=>db.createPrivateServer({guild_id:B,server_name:'Beta',server_code:'foreign-code'}));
    const blocked=interaction(`srv_details_${foreign.id}`,true);await handleInteraction(blocked,{},new Map());assert.ok(!JSON.stringify(blocked.answers).includes('foreign-code'));
}));
test('large inventories paginate and remain isolated by guild',()=>withGuild(G,()=>{
    eco.adminAdjustBalance(MEMBER,'set',100);
    for(let n=0;n<31;n++){const item=eco.createShopItem({guild_id:G,name:'Artículo '+n,price:0,stock:-1,max_per_user:0});assert.equal(eco.purchaseShopItem(MEMBER,item.id,[],G).success,true);}
    const {inventoryPanel}=require('../src/bot/utils/personalPanels');
    const first=inventoryPanel({id:MEMBER,username:'Persona'},G),last=inventoryPanel({id:MEMBER},G,999);
    assert.equal(nodes(first).filter(row=>row.type===9).length,3);assert.match(text(last),/11\/11/);
    const other=withGuild(B,()=>inventoryPanel({id:MEMBER},B));assert.match(text(other),/Inventario vacío/);
}));
test('long verification dossiers paginate, respect embed limits and read-only views have no approval actions',()=>{
    const record={discord_id:MEMBER,username:'Persona',status:'PENDIENTE',answers:Object.fromEntries(Array.from({length:35},(_,n)=>['Pregunta '+n,'X'.repeat(4000)]))};
    const {buildVerificationReview}=require('../src/bot/utils/verificationReview');
    const first=buildVerificationReview(record,guild),last=buildVerificationReview(record,guild,99,true);
    assert.equal(first.embeds[0].toJSON().fields.length,6);assert.ok(first.embeds[0].length<=6000);assert.match(last.embeds[0].toJSON().footer.text,/6\/6/);
    assert.ok(!nodes(last).some(row=>row.custom_id?.startsWith('approve_verify_')));
});
test('modal rejection rechecks reviewer permission instead of trusting an opened form',async()=>withGuild(G,async()=>{
    db.submitVerification(MEMBER,'Persona','',{},'PENDIENTE');
    const denied=interaction('modal_reject_'+MEMBER,false,true);denied.fields={getTextInputValue:()=> 'Rechazado'};
    await handleInteraction(denied,{},new Map());assert.equal(db.getVerificationByDiscordId(MEMBER).status,'PENDIENTE');
}));
test('finance modals validate input, use the actor account and recheck the command matrix',async()=>withGuild(G,async()=>{
    eco.adminAdjustBalance(MEMBER,'set',1000);const before=eco.getAccount(MEMBER).bank;
    const submit=interaction('finance_deposit_modal',false,true);submit.fields={getTextInputValue:()=> '100'};await handleInteraction(submit,{},new Map());
    assert.equal(eco.getAccount(MEMBER).wallet,900);assert.equal(eco.getAccount(MEMBER).bank,before+100);
    eco.updateCommandPermission('economia:depositar',false,[]);
    const denied=interaction('finance_deposit_modal',false,true);denied.fields={getTextInputValue:()=> '100'};await handleInteraction(denied,{},new Map());assert.equal(eco.getAccount(MEMBER).wallet,900);
    eco.updateCommandPermission('economia:depositar',true,[]);
    const invalid=interaction('finance_deposit_modal',false,true);invalid.fields={getTextInputValue:()=> '10abc'};await handleInteraction(invalid,{},new Map());assert.equal(eco.getAccount(MEMBER).wallet,900);
}));
test('help filters administration actions for a regular member',()=>{
    const payload=require('../src/bot/utils/helpPanel').buildHelpPanel(5,G,{id:MEMBER,roles:{cache:new Map()},permissions:new PermissionsBitField(0n)},guild);
    assert.ok(!text(payload).includes('/mod ban'));assert.ok(!text(payload).includes('/admin configurar'));
});
test('a cold start can initialize community data before any command modules are loaded',()=>{
    const file=path.join(directory,'cold.sqlite');
    const child=require('node:child_process').spawnSync(process.execPath,['-e',"const c=require('./src/database/communityDb'); c.ensureCommunity(process.env.GUILD_ID,'Cold start'); require('./src/database/db').db.close();"],{cwd:path.join(__dirname,'..'),env:{...process.env,DB_PATH:file,USMC_DB_PATH:file,GUILD_ID:G},encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
});
