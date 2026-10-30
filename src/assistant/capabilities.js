const actionPolicies = Object.freeze({
    create_channel: 'create_channels', update_channel: 'edit_channels', move_channel: 'edit_channels', reorder_channel: 'edit_channels',
    delete_channel: 'delete_channels', create_role: 'create_roles', update_role: 'edit_roles', reorder_role: 'edit_roles',
    delete_role: 'delete_roles', assign_role: 'assign_roles', remove_role: 'assign_roles',
    set_role_permissions: 'manage_permissions', set_channel_permissions: 'manage_permissions', sync_channel_permissions: 'manage_permissions',
    send_message: 'send_messages'
});
const policySeeds = Object.freeze({ edit_channels: 'assistant_create_channels', delete_channels: 'assistant_create_channels',
    edit_roles: 'assistant_create_roles', delete_roles: 'assistant_create_roles', assign_roles: 'assistant_create_roles', manage_permissions: 'assistant_create_roles', send_messages: '0' });
function policyFor(profile) {
    return Object.fromEntries(Object.entries(actionPolicies).map(([action, policy]) => [action, profile[`assistant_${policy}`] === 1]));
}
module.exports = { actionPolicies, policySeeds, policyFor };
