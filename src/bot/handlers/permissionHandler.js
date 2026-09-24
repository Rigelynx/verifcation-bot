const { PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { hasAnyRole } = require('../utils/roleUtils');

// Una concesión vive solo durante la interacción cuyo comando fue autorizado
// por la matriz web. Los botones y futuras interacciones no heredan el permiso.
const configuredCommandGrants = new WeakSet();

function grantConfiguredCommandPermission(interaction) {
    if (interaction && typeof interaction === 'object') configuredCommandGrants.add(interaction);
}

function hasConfiguredCommandPermission(interaction) {
    return !!interaction && configuredCommandGrants.has(interaction);
}

function hasNativePermission(member, permission) {
    const permissions = member?.permissions;
    if (permissions && typeof permissions.has === 'function') return permissions.has(permission);
    try {
        return (BigInt(permissions || 0) & permission) === permission;
    } catch {
        return false;
    }
}

/**
 * Comprueba si un miembro posee credenciales de Oficial para:
 * - Consultar expedientes con /datos-usuario
 * - Dictaminar resoluciones (botones Aprobar / Denegar en Discord)
 * - Ejecutar sanciones disciplinarias con /mod
 */
function hasOfficerPermission(interaction) {
    if (!interaction.guild || !interaction.member) return false;

    if (hasConfiguredCommandPermission(interaction)) return true;

    // 1. Propietario del servidor o Administrador nativo siempre autorizados
    if (interaction.guild.ownerId === interaction.user.id || 
        hasNativePermission(interaction.member, PermissionFlagsBits.Administrator)) {
        return true;
    }

    const config = db.getConfig(interaction.guildId);

    // 2. Comprobar roles de Oficial configurados desde el panel web
    if (config && hasAnyRole(interaction.member, config.officer_role_id)) {
        return true;
    }

    // 3. Comprobar roles de Administrador Militar configurados desde el panel web
    if (config && hasAnyRole(interaction.member, config.admin_role_id)) {
        return true;
    }

    // 4. Permiso nativo de moderación en Discord (Moderador)
    if (hasNativePermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
        return true;
    }

    return false;
}

/**
 * Comprueba si un miembro posee rango de Comandante / Administrador para:
 * - Desplegar paneles de verificación (/panel-verificacion)
 * - Reconfigurar parámetros del bot (/admin configurar)
 * - Ver credenciales maestras (/admin panel-web)
 */
function hasAdminPermission(interaction) {
    if (!interaction.guild || !interaction.member) return false;

    if (hasConfiguredCommandPermission(interaction)) return true;

    // 1. Propietario del servidor o Administrador nativo siempre autorizados
    if (interaction.guild.ownerId === interaction.user.id || 
        hasNativePermission(interaction.member, PermissionFlagsBits.Administrator)) {
        return true;
    }

    const config = db.getConfig(interaction.guildId);

    // 2. Rol de Administrador configurado desde el panel web
    if (config && hasAnyRole(interaction.member, config.admin_role_id)) {
        return true;
    }

    return false;
}

module.exports = {
    hasOfficerPermission,
    hasAdminPermission,
    grantConfiguredCommandPermission,
    hasConfiguredCommandPermission,
    hasNativePermission
};
