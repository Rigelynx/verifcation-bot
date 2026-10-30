const { AsyncLocalStorage } = require('node:async_hooks');
const storage = new AsyncLocalStorage();
function currentGuild() { return storage.getStore()?.guildId || process.env.GUILD_ID || 'GLOBAL'; }
function withGuild(guildId, work) {
    if (typeof guildId !== 'string' || !guildId.trim() || guildId.length > 100) throw new Error('Se requiere una comunidad válida.');
    return storage.run({ guildId }, work);
}
function bindExports(api, explicit = {}) {
    const bound = {};
    for (const [name, value] of Object.entries(api)) {
        if (typeof value !== 'function') { bound[name] = value; continue; }
        bound[name] = (...args) => {
            const resolve = explicit[name];
            const guildId = typeof resolve === 'function' ? resolve(args) : Number.isInteger(resolve) ? args[resolve] : null;
            return guildId ? withGuild(String(guildId), () => value(...args)) : value(...args);
        };
    }
    bound.forGuild = guildId => new Proxy(bound, { get(target, name) {
        const value = target[name];
        return typeof value === 'function' ? (...args) => withGuild(guildId, () => value(...args)) : value;
    } });
    return bound;
}
module.exports = { currentGuild, withGuild, bindExports };
