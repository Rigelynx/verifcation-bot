function parseRoleIds(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(/[,\s]+/);
    return source
        .flatMap(roleId => typeof roleId === 'string' ? roleId.split(/[,\s]+/) : [roleId])
        .map(roleId => typeof roleId === 'string' ? roleId.trim() : (roleId?.id || String(roleId || '')))
        .filter(Boolean);
}

function getMemberRoleIds(member) {
    if (!member?.roles) return [];

    if (Array.isArray(member.roles)) {
        return member.roles
            .map(role => typeof role === 'string' ? role : role?.id)
            .filter(Boolean);
    }

    const cache = member.roles.cache;
    if (!cache) return [];
    if (Array.isArray(cache)) {
        return cache.map(role => typeof role === 'string' ? role : role?.id).filter(Boolean);
    }
    if (typeof cache.keys === 'function') return Array.from(cache.keys());
    if (typeof cache.map === 'function') {
        return cache.map(role => typeof role === 'string' ? role : role?.id).filter(Boolean);
    }

    return [];
}

function hasAnyRole(member, roleIds) {
    const memberRoleIds = new Set(getMemberRoleIds(member));
    return parseRoleIds(roleIds).some(roleId => memberRoleIds.has(roleId));
}

function formatRoleMentions(roleIds, fallback = '*Sin asignar*') {
    const ids = parseRoleIds(roleIds);
    if (ids.length === 0) return fallback;
    return ids.map(id => `<@&${id}>`).join(', ');
}

module.exports = {
    parseRoleIds,
    getMemberRoleIds,
    hasAnyRole,
    formatRoleMentions
};
