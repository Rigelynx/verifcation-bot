const economy = require('../database/economyDb');
const { grantConfiguredCommandPermission } = require('./handlers/permissionHandler');

// Both Discord and the assistant use the same command permission gate.
async function executeCommand(command, context) {
    const sub = context.options.getSubcommand(false);
    const group = context.options.getSubcommandGroup(false);
    const key = [context.commandName, group, sub].filter(Boolean).join(':');
    const permission = economy.isCommandAllowed(key, context.member);
    if (!permission.allowed) throw new Error(permission.reason === 'DISABLED'
        ? `El comando /${key.replaceAll(':', ' ')} está deshabilitado.`
        : `Tu cuenta no tiene permiso para /${key.replaceAll(':', ' ')}.`);
    if (permission.grantedByRole) grantConfiguredCommandPermission(context);
    return command.execute(context);
}

module.exports = { executeCommand };
