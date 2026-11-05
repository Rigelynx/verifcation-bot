const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {renderShopPanel,buildPurchasePreview}=require('../src/bot/utils/shopPresentation');
const settings={currency_symbol:'$',currency_name:'Créditos'},profile={short_name:'P.A.F.',accent:'#df5266'};
const item=(id,extra={})=>({id,name:`Artículo ${id}`,description:'Equipo para las operaciones de la unidad.',price:5000,stock:-1,max_per_user:1,icon:'📦',roles_to_give:[],roles_to_remove:[],required_roles:[],blocked_roles:[],...extra});
const components=payload=>{const visit=node=>[node,...(node.components||[]).flatMap(visit),...(node.accessory?visit(node.accessory):[])];return payload.components.map(row=>row.toJSON()).flatMap(visit);};
const contents=payload=>components(payload).filter(row=>row.type===10).map(row=>row.content).join('\n');
test('native cards include neutral graphic header, community label and a detail button per product',()=>{
    const payload=renderShopPanel([item(1)],settings,profile);
    assert.equal(payload.flags,32768);assert.equal(payload.embeds,undefined);
    assert.match(contents(payload),/P.A.F./);assert.match(contents(payload),/\$5\.000/);
    assert.ok(components(payload).some(row=>row.type===12));
    assert.ok(components(payload).some(row=>row.custom_id==='buy_shop_1'));
    assert.deepEqual(payload.allowedMentions,{parse:[]});assert.equal(components(payload).some(row=>row.custom_id==='shop_indicator'),false);
    assert.equal(payload.files[0].name,'shop-header-neutral.png');
});
test('all factions receive the same neutral art while keeping their own community labels',()=>{
    for(const profile of [{theme:'paf',display_name:'Polish Armed Forces'},{theme:'usmc',short_name:'USMC'},{theme:'ukaf',short_name:'UKAF'},{theme:'custom',display_name:'Mi comunidad'},{display_name:'P.A.F.'}]){
        const payload=renderShopPanel([item(1)],settings,profile);
        assert.equal(payload.files[0].name,'shop-header-neutral.png');
        assert.equal(payload.components[0].toJSON().accent_color,0x87a6ab);
        assert.ok(contents(payload).includes(profile.short_name||profile.display_name));
        if(profile.theme!=='paf'&&profile.display_name!=='P.A.F.')assert.ok(!contents(payload).includes('P.A.F.'));
    }
});
test('shop selector chooses the requested header and keeps accessible text generic for all designs',()=>{
    for(const shop_theme of ['neutral','usmc','baf','paf','ukaf']){
        const payload=renderShopPanel([item(1)],settings,{display_name:'Unidad de prueba',shop_theme});
        assert.equal(payload.files[0].name,`shop-header-${shop_theme}.png`);
        const gallery=components(payload).find(row=>row.type===12);
        assert.equal(gallery.items[0].description,'Cabecera de Intendencia');
        assert.ok(require('node:fs').existsSync(payload.files[0].attachment));
    }
    assert.equal(renderShopPanel([],settings,{shop_theme:'../paf'}).files[0].name,'shop-header-neutral.png');
});

test('three-card pages preserve filters, counts and refresh targets',()=>{
    const items=Array.from({length:9},(_,i)=>item(i+1,{roles_to_give:i<5?['123456789012345678']:[]}));
    const payload=renderShopPanel(items,settings,profile,99,'ranks'),controls=components(payload);
    assert.equal(controls.filter(row=>row.type===9).length,2);
    assert.ok(controls.some(row=>row.custom_id==='shop_refresh_2_ranks'));
    assert.equal(controls.find(row=>row.custom_id==='shop_page_3_ranks').disabled,true);
    assert.equal(controls.find(row=>row.custom_id==='shop_category').options.find(option=>option.value==='ranks').label,'Artículos con roles (5)');
    assert.ok(controls.some(row=>row.custom_id==='buy_shop_4'));
});
test('empty categories remain navigable; legacy embeds are cleared when migrating a message to V2',()=>{
    const filtered=renderShopPanel([item(1)],settings,profile,1,'ranks');
    assert.ok(components(filtered).some(row=>row.custom_id==='shop_category'));assert.match(contents(filtered),/sección está vacía/);
    const empty=renderShopPanel([],settings,profile);assert.match(contents(empty),/preparando el almacén/);
    const {asShopUpdate}=require('../src/bot/utils/shopPresentation');const update=asShopUpdate(empty);
    assert.equal(update.content,null);assert.deepEqual(update.embeds,[]);assert.deepEqual(update.attachments,[]);assert.equal(update.flags,32768);
    assert.ok(components(renderShopPanel([item(1)],settings,profile,NaN,'bad')).some(row=>row.custom_id==='shop_refresh_1_all'));
});
test('native layout fits component and text budgets; descriptions cannot inject headings or extra controls',()=>{
    const payload=renderShopPanel(Array.from({length:9},(_,i)=>item(i+1,{name:'N'.repeat(300),description:'**Huge**\n## heading '+ 'D'.repeat(4000),icon:'📦'})),settings,profile);
    assert.ok(components(payload).length<=40);assert.ok(contents(payload).length<=4000);
    assert.equal(components(payload).filter(row=>row.type===9).length,3);
    assert.doesNotThrow(()=>payload.components.map(row=>row.toJSON()));
});
test('zero and minus-one limits are unlimited; stock, funds and positive limits still block confirmation',()=>{
    const ready=buildPurchasePreview(item(1,{roles_to_give:['123456789012345678'],required_roles:['223456789012345678']}),{wallet:6000},settings,profile);
    assert.equal(ready.canPurchase,true);assert.equal(ready.embed.toJSON().fields.find(row=>row.name==='Saldo después').value,'$1.000');
    assert.match(ready.embed.toJSON().fields.find(row=>row.name==='Requiere uno de estos roles').value,/<@&223456789012345678>/);
    assert.equal(buildPurchasePreview(item(1),{wallet:20},settings,profile).canPurchase,false);
    assert.equal(buildPurchasePreview(item(1,{stock:0}),{wallet:6000},settings,profile).canPurchase,false);
    assert.equal(buildPurchasePreview(item(1),{wallet:6000},settings,profile,1).canPurchase,false);
    for(const limit of [-1,0]) {assert.equal(buildPurchasePreview(item(1,{max_per_user:limit}),{wallet:6000},settings,profile,10).canPurchase,true);assert.ok(!contents(renderShopPanel([item(1,{max_per_user:limit})],settings,profile)).includes('0 por persona'));}
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
    assert.equal(components(replies[0]).find(row=>row.custom_id?.startsWith('shop_confirm_')).disabled,false);
    await processShopPurchase(interaction,article.id,true,5000);
    assert.equal(eco.getAccount(userId).wallet,1000);assert.equal(eco.getUserInventory(userId)[0].quantity,1);
    assert.equal(eco.getShopItemById(article.id).stock,1);
});

test('real zero-limit products can be purchased repeatedly',()=>{
    const userId='100000000000000002';eco.adminAdjustBalance(userId,'set',100);
    const article=eco.createShopItem({guild_id:process.env.GUILD_ID,name:'Suministro',price:10,stock:-1,max_per_user:0});
    assert.equal(eco.purchaseShopItem(userId,article.id).success,true);assert.equal(eco.purchaseShopItem(userId,article.id).success,true);assert.equal(eco.getAccount(userId).wallet,80);
});
