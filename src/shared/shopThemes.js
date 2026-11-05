// Stable keys stored per guild. Never infer a shop theme from a server name.
const shopThemes=Object.freeze({
    neutral:{label:'Neutral · Predeterminado',color:0x87a6ab},
    usmc:{label:'USMC · Estados Unidos',color:0xc1a16b},
    baf:{label:'BAF · Reino Unido',color:0xa64251},
    paf:{label:'PAF · Polonia',color:0xcf3b50},
    ukaf:{label:'UKAF · Reino Unido',color:0xa64251}
});
module.exports={shopThemes};
