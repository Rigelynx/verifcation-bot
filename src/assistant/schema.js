function validateArguments(schema, value) {
    const bad = () => { throw new Error('Herramienta o argumentos inválidos: revisa los campos, tipos y valores admitidos.'); };
    const matches = type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value)
        : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
        : type === 'integer' ? Number.isSafeInteger(value) : typeof value === type;
    if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(matches)) bad();
    if (schema.enum && !schema.enum.includes(value)) bad();
    if (value === null) return;
    if (typeof value === 'string' && ((schema.minLength !== undefined && value.length < schema.minLength)
        || (schema.maxLength !== undefined && value.length > schema.maxLength) || (schema.pattern && !new RegExp(schema.pattern).test(value)))) bad();
    if (typeof value === 'number' && (!Number.isFinite(value) || (schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) bad();
    if (Array.isArray(value)) {
        if ((schema.minItems !== undefined && value.length < schema.minItems) || (schema.maxItems !== undefined && value.length > schema.maxItems)
            || (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length)) bad();
        if (schema.items) for (const item of value) validateArguments(schema.items, item);
    } else if (typeof value === 'object') {
        if ((schema.required || []).some(key => !Object.hasOwn(value, key))) bad();
        for (const [key, item] of Object.entries(value)) {
            if (schema.properties && Object.hasOwn(schema.properties, key)) validateArguments(schema.properties[key], item);
            else if (schema.additionalProperties === false) throw new Error('La herramienta recibió parámetros no permitidos.');
        }
    }
}
module.exports = { validateArguments };
