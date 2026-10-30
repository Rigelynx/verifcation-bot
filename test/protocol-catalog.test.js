const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const catalog = require('../src/database/commandCatalog');
const script = fs.readFileSync(path.join(__dirname, '../src/web/public/dashboard-commands.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/web/views/dashboard.html'), 'utf8');
function panel() {
    const select = html.match(/<select id="cmd-filter-category"[\s\S]*?<\/select>/)[0];
    const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)]
        .map(([, value, textContent]) => ({ value, textContent, dataset: {} }));
    const nodes = Object.fromEntries(['cmd-stat-total', 'cmd-stat-enabled', 'cmd-stat-disabled', 'cmd-stat-restricted'].map(id => [id, {}]));
    nodes['cmd-filter-category'] = { options };
    const sandbox = vm.createContext({ adminToken: null, document: { getElementById: id => nodes[id] || null },
        inputRows: catalog.map(command_name => ({ command_name, is_enabled: true, allowed_roles: [] })) });
    vm.runInContext(script, sandbox);
    vm.runInContext('allCommandPerms = inputRows;', sandbox);
    return { sandbox, nodes, options, meta: vm.runInContext('COMMAND_METAS', sandbox) };
}
test('every canonical protocol has a searchable label, description and selectable category', () => {
    const { meta, options } = panel();
    assert.deepEqual(Object.keys(meta).sort(), [...catalog].sort());
    for (const command of catalog) {
        assert.equal(meta[command].label, `/${command.replaceAll(':', ' ')}`);
        assert.ok(meta[command].desc.trim());
        assert.ok(options.some(option => option.value === meta[command].category), `Falta categoría para ${command}`);
    }
});
test('new protocol categories and report editing are found by filters and search', () => {
    const { sandbox } = panel();
    for (const group of ['servidor', 'asistente']) {
        sandbox.group = group;
        const actual = vm.runInContext('commandFilterCategory = group; getFilteredCommands().map(row => row.command_name)', sandbox);
        assert.deepEqual(Array.from(actual).sort(), catalog.filter(key => key.startsWith(`${group}:`)).sort());
    }
    const report = vm.runInContext('commandFilterCategory = "evento"; commandSearchQuery = "editar-reporte"; getFilteredCommands().map(row => row.command_name)', sandbox);
    assert.deepEqual(Array.from(report), ['evento:editar-reporte']);
    const patrol = vm.runInContext('commandSearchQuery = "patrulla"; getFilteredCommands().map(row => row.command_name)', sandbox);
    assert.deepEqual(Array.from(patrol), ['patrulla']);
});
test('category counts follow loaded protocols and refresh without duplicating numbers', () => {
    const { sandbox, nodes, options, meta } = panel();
    for (const pass of [0, 1]) {
        if (pass) vm.runInContext('allCommandPerms.pop(); allCommandPerms[0].is_enabled = false; allCommandPerms[1].allowed_roles = ["role"];', sandbox);
        vm.runInContext('updateCommandStats(); updateCommandStats();', sandbox);
        const rows = vm.runInContext('allCommandPerms', sandbox);
        assert.equal(nodes['cmd-stat-total'].innerText, rows.length);
        assert.equal(nodes['cmd-stat-disabled'].innerText, pass);
        assert.equal(nodes['cmd-stat-restricted'].innerText, pass);
        for (const option of options) {
            const count = option.value === 'ALL' ? rows.length : rows.filter(row => meta[row.command_name].category === option.value).length;
            assert.equal(option.textContent, `${option.dataset.label} (${count})`);
        }
    }
});
