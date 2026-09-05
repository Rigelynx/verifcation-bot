const { PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { hasAnyRole } = require('../utils/roleUtils');

/**
 * Comprueba si un miembro posee credenciales de Oficial para:
 * - Consultar expedientes con /datos-usuario
 * - Dictaminar resoluciones (botones Aprobar / Denegar en Discord)
 * - Ejecutar sanciones disciplinarias con /mod
 */
function hasOfficerPermission(interaction) {
    if (!interaction.guild || !interaction.member) return false;

    // 1. Propietario del servidor o Administrador nativo siempre autorizados
    if (interaction.guild.ownerId === interaction.user.id || 
        interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
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
    if (interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
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

    // 1. Propietario del servidor o Administrador nativo siempre autorizados
    if (interaction.guild.ownerId === interaction.user.id || 
        interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
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
    hasAdminPermission
};
