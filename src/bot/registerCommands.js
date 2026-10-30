const { Routes } = require('discord.js');
async function registerCommands(rest, clientId, commands, env = process.env) {
    const body = commands.map(command => ({ ...command, integration_types: [0], contexts: [0] }));
    if (env.COMMAND_SCOPE === 'guild') {
        const guildId = env.COMMAND_TEST_GUILD_ID;
        if (!guildId) throw new Error('COMMAND_TEST_GUILD_ID es obligatorio para probar comandos por servidor.');
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands.map(({ contexts, integration_types, ...command }) => command) });
        return { scope: 'guild', guildId };
    }
    if (env.COMMAND_SCOPE && env.COMMAND_SCOPE !== 'global') throw new Error('COMMAND_SCOPE debe ser global o guild.');
    await rest.put(Routes.applicationCommands(clientId), { body });
    // Old guild definitions shadow commands of the same name. Clear only this app's
    // previous single-guild catalog, after the global registration succeeds.
    if (env.GUILD_ID) await rest.put(Routes.applicationGuildCommands(clientId, env.GUILD_ID), { body: [] });
    return { scope: 'global' };
}
module.exports = { registerCommands };
