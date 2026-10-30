const { actionPolicies } = require('./capabilities');
const { managementTools } = require('./management');
const { validateArguments } = require('./schema');
function validatePlan(actions) {
    if (!Array.isArray(actions) || !actions.length) throw new Error('Incluye los elementos de la propuesta.');
    return actions.map(action => {
        if (!action || !Object.hasOwn(actionPolicies, action.tool) || !action.args || typeof action.args !== 'object' || Array.isArray(action.args)) throw new Error('Propuesta de gestión inválida.');
        if (Object.keys(action).some(key => !['tool', 'args'].includes(key))) throw new Error('Parámetros de propuesta no permitidos.');
        if (!['create_channel', 'create_role'].includes(action.tool)) {
            const spec = managementTools.find(tool => tool.function.name === action.tool).function;
            validateArguments(spec.parameters, action.args);
            return { tool: action.tool, args: action.args };
        }
        const allowed = action.tool === 'create_channel' ? ['name', 'kind', 'parent_id'] : ['name', 'color'];
        const args = action.args;
        if (Object.keys(action).some(key => !['tool', 'args'].includes(key)) || Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Parámetros de propuesta no permitidos.');
        if (typeof args.name !== 'string' || !args.name.trim() || args.name.length > 80 || /[\r\n\x00-\x1f]/.test(args.name)) throw new Error('Nombre de propuesta inválido.');
        if (action.tool === 'create_channel' && (!['text', 'voice', 'category'].includes(args.kind) || (args.parent_id !== undefined && !/^\d{17,20}$/.test(args.parent_id)) || (args.kind === 'category' && args.parent_id))) throw new Error('Destino o tipo de propuesta inválido.');
        if (action.tool === 'create_role' && args.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(args.color)) throw new Error('Color de propuesta inválido.');
        return { tool: action.tool, args: { ...args, name: args.name.trim() } };
    });
}

function matchesPlan(plan, tool, args) {
    const same = (a, b) => a === b || (a !== null && b !== null && typeof a === 'object' && typeof b === 'object'
        && Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length
        && Object.keys(a).every(key => Object.hasOwn(b, key) && same(a[key], b[key])));
    return plan.some(action => action.tool === tool && same(action.args, args));
}

module.exports = { validatePlan, matchesPlan };
