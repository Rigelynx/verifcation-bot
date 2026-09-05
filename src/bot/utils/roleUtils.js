function parseRoleIds(value) {
    return String(value || '')
        .split(/[,\s]+/)
        .map(roleId => roleId.trim())
        .filter(Boolean);
}

function hasAnyRole(member, roleIds) {
    if (!member?.roles?.cache) return false;
    return parseRoleIds(roleIds).some(roleId => member.roles.cache.has(roleId));
}

function formatRoleMentions(roleIds, fallback = '*Sin asignar*') {
    const ids = parseRoleIds(roleIds);
    if (ids.length === 0) return fallback;
    return ids.map(id => `<@&${id}>`).join(', ');
}

module.exports = {
    parseRoleIds,
    hasAnyRole,
    formatRoleMentions
};
