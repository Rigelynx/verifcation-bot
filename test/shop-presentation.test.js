const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {renderShopPanel,buildPurchasePreview}=require('../src/bot/utils/shopPresentation');
const settings={currency_symbol:'$',currency_name:'Créditos'},profile={short_name:'P.A.F.',accent:'#df5266'};
const item=(id,extra={})=>({id,name:`Artículo ${id}`,description:'Equipo para las operaciones de la unidad.',price:5000,stock:-1,max_per_user:1,icon:'📦',roles_to_give:[],roles_to_remove:[],required_roles:[],blocked_roles:[],...extra});
const components=payload=>payload.components.map(row=>row.toJSON()).flatMap(row=>row.components);
test('compact catalogue uses community identity and separates titles, price and availability',()=>{
    const payload=renderShopPanel([item(1)],settings,profile),embed=payload.embeds[0].toJSON();
    assert.equal(embed.author.name,'P.A.F. · INTENDENCIA');assert.equal(embed.color,0xdf5266);
    assert.ok(!embed.fields[0].name.includes('$'));assert.match(embed.fields[0].value,/\$5\.000/);
    assert.match(embed.fields[0].value,/Stock ilimitado/);assert.ok(!embed.description.includes('BIENVENIDO'));
    assert.deepEqual(payload.allowedMentions,{parse:[]});assert.equal(components(payload).some(row=>row.custom_id==='shop_indicator'),false);
});
test('page boundaries, filter counts and refresh preserve the selected category',()=>{
    const items=Array.from({length:9},(_,i)=>item(i+1,{roles_to_give:i<5?['123456789012345678']:[]}));
    const payload=renderShopPanel(items,settings,profile,99,'ranks');
    assert.equal(payload.embeds[0].toJSON().fields.length,1);
    const controls=components(payload);
    assert.ok(controls.some(row=>row.custom_id==='shop_refresh_2_ranks'));
    assert.equal(controls.find(row=>row.custom_id==='shop_page_3_ranks').disabled,true);
    assert.equal(controls.find(row=>row.custom_id==='shop_category').options.find(option=>option.value==='ranks').label,'Artículos con roles (5)');
    const option=controls.find(row=>row.custom_id==='select_buy_shop').options[0];assert.equal(option.value,'5');
});
test('empty filters can return to the catalogue and invalid page/filter values are normalized',()=>{
    const filtered=renderShopPanel([item(1)],settings,profile,1,'ranks');
    assert.equal(filtered.embeds[0].toJSON().fields,undefined);assert.ok(components(filtered).some(row=>row.custom_id==='shop_category'));
    assert.ok(!components(filtered).some(row=>row.custom_id==='select_buy_shop'));
    const empty=renderShopPanel([],settings,profile);assert.match(empty.embeds[0].toJSON().description,/Todavía no hay/);
    assert.ok(components(renderShopPanel([item(1)],settings,profile,NaN,'bad')).some(row=>row.custom_id==='shop_refresh_1_all'));
});
test('long user content fits Discord limits and invalid decorative emoji does not break select menus',()=>{
    const payload=renderShopPanel(Array.from({length:4},(_,i)=>item(i+1,{name:'N'.repeat(300),description:'D'.repeat(4000),icon:'invalid emoji text'})),settings,profile);
    const embed=payload.embeds[0];assert.ok(embed.length<=6000);
    for(const field of embed.toJSON().fields){assert.ok(field.name.length<=256);assert.ok(field.value.length<=1024);}
    for(const option of components(payload).find(row=>row.custom_id==='select_buy_shop').options)assert.ok(option.label.length<=100);
    assert.doesNotThrow(()=>payload.components.map(row=>row.toJSON()));
});
test('purchase preview shows funds, ownership and role effects; unavailable purchases are disabled',()=>{
    const ready=buildPurchasePreview(item(1,{roles_to_give:['123456789012345678'],required_roles:['223456789012345678']}),{wallet:6000},settings,profile);
    assert.equal(ready.canPurchase,true);assert.equal(ready.embed.toJSON().fields.find(row=>row.name==='Saldo después').value,'$1.000');
    assert.match(ready.embed.toJSON().fields.find(row=>row.name==='Requiere uno de estos roles').value,/<@&223456789012345678>/);
    assert.equal(buildPurchasePreview(item(1),{wallet:20},settings,profile).canPurchase,false);
    assert.equal(buildPurchasePreview(item(1,{stock:0}),{wallet:6000},settings,profile).canPurchase,false);
    assert.equal(buildPurchasePreview(item(1),{wallet:6000},settings,profile,1).canPurchase,false);
    assert.equal(buildPurchasePreview(item(1,{max_per_user:-1}),{wallet:6000},settings,profile,10).canPurchase,true);
    assert.match(buildPurchasePreview(item(1),{wallet:6000},settings,profile,0,true).embed.toJSON().fields.at(-1).value,/precio cambió/);
});

const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shop-ui-'));
Object.assign(process.env,{USMC_DB_PATH:path.join(directory,'db.sqlite'),GUILD_ID:'900000000000000001'});
const db=require('../src/database/db'),eco=require('../src/database/economyDb');
const {processShopPurchase}=require('../src/bot/commands/tienda');
after(()=>{db.db.close();if(!path.resolve(directory).startsWith(path.join(os.tmpdir(),'shop-ui-')))throw new Error('Unexpected temporary path');fs.rmSync(directory,{recursive:true,force:true});});
test('opening a real purchase sheet never debits funds and confirmation still completes the existing order flow',async()=>{
    const guildId=process.env.GUILD_ID,userId='100000000000000001';
    eco.adminAdjustBalance(userId,'set',6000);
    const article=eco.createShopItem({guild_id:guildId,name:'Licencia de piloto',price:5000,stock:2,max_per_user:1});
    const replies=[];const member={roles:{cache:new Map()}};
    const interaction={guildId,user:{id:userId,username:'Piloto'},member,guild:{members:{fetch:async()=>member},roles:{cache:new Map()}},reply:async payload=>replies.push(payload),
        deferUpdate:async()=>{interaction.deferred=true;},editReply:async payload=>replies.push(payload)};
    await processShopPurchase(interaction,article.id);
    assert.equal(eco.getAccount(userId).wallet,6000);assert.equal(eco.getShopItemById(article.id).stock,2);
    assert.equal(components(replies[0])[0].disabled,false);
    await processShopPurchase(interaction,article.id,true,5000);
    assert.equal(eco.getAccount(userId).wallet,1000);assert.equal(eco.getUserInventory(userId)[0].quantity,1);
    assert.equal(eco.getShopItemById(article.id).stock,1);
});
