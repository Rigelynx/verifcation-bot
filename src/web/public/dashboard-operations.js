/* Server operations use the same nominal session as the rest of the dashboard. */
let operationServers = [];
const opsText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
async function serverRequest(path = '', options = {}) {
    const response = await fetch(`/api/admin/servers${path}`, {
        ...options, headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'No se pudo completar la operación.');
    return data;
}
async function loadOperationServers() {
    const feedback = document.getElementById('servers-feedback');
    try {
        const data = await serverRequest();
        operationServers = data.servers;
        feedback.textContent = '';
        renderOperationServers();
        document.getElementById('servers-sync').textContent = `Sincronizado ${new Date().toLocaleTimeString('es')}`;
    } catch (error) { feedback.textContent = error.message; }
}
function renderOperationServers() {
    const search = document.getElementById('servers-search').value.toLowerCase();
    const status = document.getElementById('servers-status').value;
    const visible = operationServers.filter(server => (!status || server.status === status) &&
        `${server.server_name} ${server.sector_map} ${server.current_mission || ''}`.toLowerCase().includes(search));
    const used = operationServers.filter(server => server.status === 'EN_USO').length;
    document.getElementById('servers-free').textContent = operationServers.length - used;
    document.getElementById('servers-used').textContent = used;
    document.getElementById('servers-total').textContent = operationServers.length;
    document.getElementById('servers-grid').innerHTML = visible.length ? visible.map(server => {
        const busy = server.status === 'EN_USO';
        const start = server.started_at ? new Date(server.started_at.replace(' ', 'T') + 'Z') : null;
        const minutes = start && !Number.isNaN(start.getTime()) ? Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000)) : 0;
        return `<article class="ops-card ${busy ? 'busy' : 'free'}" data-motion-key="server-${server.id}">
            <div class="server-art"><span class="server-grid"></span><span class="server-art-index">${String(server.id).padStart(2, '0')}</span><span class="server-art-label">PRIVATE DEPLOYMENT / BRM5</span></div>
            <div class="server-card-content"><span class="ops-badge">${busy ? '● EN USO' : '● DISPONIBLE'}</span>
            <h3>${opsText(server.server_name)}</h3><p class="ops-muted">SRV-${String(server.id).padStart(3, '0')} · ${opsText(server.sector_map)}</p>
            <dl><dt>Código VIP</dt><dd><code>${opsText(server.server_code || 'Sin configurar')}</code></dd>
            <dt>Responsable</dt><dd>${opsText(server.current_officer_name || 'Sin asignar')}</dd>
            <dt>Actividad</dt><dd>${opsText(server.current_mission || 'Listo para desplegar')}</dd>
            <dt>Tiempo</dt><dd>${busy ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : '—'}${server.current_event_id ? ` · Evento #${server.current_event_id}` : ''}</dd></dl>
            ${server.notes ? `<p class="ops-muted">${opsText(server.notes)}</p>` : ''}
            <footer><button class="btn-retro ${busy ? 'amber' : 'primary'}" onclick="openServerAction(${server.id})">${busy ? 'Liberar servidor' : 'Ocupar servidor'}</button>
            <button class="btn-retro" onclick="openServerEditor(${server.id})">Editar</button>
            <button class="btn-retro danger" onclick="deleteOperationServer(${server.id})" ${busy ? 'disabled title="Libera el servidor antes de eliminarlo"' : ''}>Eliminar</button></footer></div></article>`;
    }).join('') : '<div class="ops-empty">No hay servidores para esta vista. Registra uno o ajusta los filtros.</div>';
}
function openServerEditor(id = null) {
    const form = document.getElementById('server-editor-form');
    form.reset();
    const server = operationServers.find(item => item.id === id);
    form.elements.id.value = id || '';
    for (const name of ['server_name', 'server_code', 'sector_map', 'notes']) form.elements[name].value = server?.[name] || '';
    document.getElementById('server-editor-title').textContent = server ? 'Editar servidor privado' : 'Registrar servidor privado';
    document.getElementById('server-editor-feedback').textContent = '';
    document.getElementById('server-editor').showModal();
}
function openServerAction(id) {
    const server = operationServers.find(item => item.id === id);
    const form = document.getElementById('server-action-form');
    form.reset(); form.elements.id.value = id; form.elements.expected_status.value = server.status;
    document.getElementById('server-action-title').textContent = `${server.status === 'EN_USO' ? 'Liberar' : 'Ocupar'} · ${server.server_name}`;
    document.getElementById('server-mission-group').hidden = server.status === 'EN_USO';
    document.getElementById('server-action-description').textContent = server.status === 'EN_USO'
        ? `Responsable: ${server.current_officer_name || 'Sin asignar'}. Confirma que la actividad terminó antes de liberarlo.`
        : 'Indica la misión para que otros oficiales sepan quién está usando el servidor.';
    document.getElementById('server-action-feedback').textContent = '';
    document.getElementById('server-action').showModal();
}
async function deleteOperationServer(id) {
    if (!confirm('¿Eliminar este servidor privado del catálogo?')) return;
    try { await serverRequest(`/${id}`, { method: 'DELETE' }); await loadOperationServers(); }
    catch (error) { document.getElementById('servers-feedback').textContent = error.message; }
}
for (const kind of ['editor', 'action']) {
    document.getElementById(`server-${kind}-form`).addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.target, body = Object.fromEntries(new FormData(form));
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await serverRequest(kind === 'action' ? `/${body.id}/toggle` : body.id ? `/${body.id}` : '', {
                method: kind === 'editor' && body.id ? 'PUT' : 'POST', body: JSON.stringify(body)
            });
            document.getElementById(`server-${kind}`).close();
            await loadOperationServers();
        } catch (error) { document.getElementById(`server-${kind}-feedback`).textContent = error.message; }
        finally { button.disabled = false; }
    });
}
setInterval(() => {
    if (!document.hidden && document.getElementById('main-content').style.display !== 'none' &&
        document.getElementById('tab-servidores').style.display !== 'none') loadOperationServers();
}, 30000);
