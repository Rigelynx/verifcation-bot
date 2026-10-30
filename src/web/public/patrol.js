let patrolSession, patrolResources = {}, selectedEvent = null, rosterPage = 1;
const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const label = value => ({ REGISTRATION: 'Registro abierto', ACTIVE: 'En curso', ENDED: 'Finalizado', TRAINING: 'Entrenamiento', VOICE: 'Actividad por voz', TEXT: 'Actividad por chat', HYBRID: 'Voz y chat', CONFIRMED: 'Confirmado', REGISTERED: 'Inscrito', EXPELLED: 'Retirado', CANCELLED: 'Cancelado' }[value] || value);
const rollStates = [{ value: 'PRESENT', label: 'Presente', symbol: '✓' }, { value: 'ABSENT', label: 'Ausente', symbol: '×' }, { value: 'NO_RESPONSE', label: 'No responde', symbol: '…' }];
function rosterAvatar(value) {
    try { const url = new URL(value); if (url.protocol === 'https:' && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) return url.href; } catch {}
    return '/media/unit-crest.svg';
}
const status = message => { for (const id of ['patrol-feedback', 'detail-feedback', 'create-patrol-error']) $(id).textContent = message || ''; };
async function request(path, init = {}) {
    const res = await fetch(`/api/patrol${path}`, { ...init, headers: { 'Content-Type': 'application/json',
        'X-CSRF-Token': patrolSession?.csrf_token || '' }, credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo completar la acción.');
    return data;
}
async function task(button, work) {
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try { status(''); await work(); } catch (error) { status(error.message); }
    finally { if (button) button.disabled = false; }
}
function options(select, items, label) {
    select.replaceChildren();
    for (const item of items) select.add(new Option(label(item), item.id ?? item.key));
}
async function loadResources() {
    const selectedTeam = $('team-select').value;
    patrolResources = await request('/resources');
    options($('patrol-channel'), patrolResources.channels, channel => `#${channel.name}`);
    options($('patrol-template'), patrolResources.templates.filter(template => template.template_kind !== 'TRAINING'), template => template.name);
    options($('team-select'), patrolResources.teams.map(team => ({ ...team, id: team.key })), team => team.label);
    if (selectedTeam) $('team-select').value = selectedTeam;
    if (selectedEvent) updateTeam();
    options($('patrol-server'), [{ id: '', server_name: 'Sin reserva' }, ...patrolResources.servers.filter(server => server.status === 'LIBRE')], server => server.server_name);
    $('patrol-servers').innerHTML = patrolResources.servers.length ? patrolResources.servers.map(server => `<article class="ops-card portal-art-card" data-motion-key="patrol-server-${server.id}"><div class="mission-card-art"><img src="/media/coastal-command.png" alt="" loading="lazy"><span>PRIVATE DEPLOYMENT / ${String(server.id).padStart(2, '0')}</span></div><div class="mission-card-body"><span class="ops-badge">${server.status === 'LIBRE' ? 'DISPONIBLE' : 'EN USO'}</span><h3>${safe(server.server_name)}</h3><p class="ops-muted">${safe(server.sector_map)}</p><p>${safe(server.current_mission || 'Disponible para desplegar')}</p><p class="ops-muted">${safe(server.current_officer_name || '')}</p><div class="server-code-row"><code>${safe(server.server_code || 'Sin configurar')}</code><button class="btn-retro" data-copy-server="${server.id}" ${server.server_code ? '' : 'disabled'}>Copiar código</button></div></div></article>`).join('') : '<div class="ops-empty">Aún no hay servidores registrados por Alto Mando.</div>';
}
async function loadEvents() {
    const data = await request(`/events?history=${$('patrol-filter').value === 'history'}`);
    $('patrol-events').replaceChildren();
    for (const event of data.events) {
        const card = document.createElement('article'); card.className = 'ops-card portal-art-card'; card.dataset.motionKey = `patrol-event-${event.id}`;
        card.innerHTML = `<div class="mission-card-art"><img src="/media/${event.type === 'TRAINING' ? 'mission-briefing.png' : 'patrol-field.png'}" alt="" loading="lazy"><span>OPERATION / ${String(event.id).padStart(3, '0')}</span><img class="mission-card-crest" src="/media/unit-crest.svg" alt="" width="35" height="42"></div><div class="mission-card-body"><span class="ops-badge">${event.status === 'ACTIVE' ? 'ACTIVA' : 'FINALIZADA'}</span><h3>${safe(event.name)}</h3><p class="ops-muted">Mando: ${safe(event.officer_name || event.officer_id || 'Sin asignar')}</p><div class="mission-card-meta"><span><svg class="ui-icon"><use href="/media/interface-icons.svg#users"/></svg>${event.participants} participantes</span><span>${safe(label(event.type))}</span></div><p class="ops-muted">${event.can_manage ? 'Bajo tu gestión' : 'Consulta de operación'}</p></div>`;
        const button = document.createElement('button'); button.className = 'btn-retro primary'; button.textContent = 'Ver detalles ↗';
        button.onclick = () => task(button, () => openEvent(event.id)); card.querySelector('.mission-card-body').append(button); $('patrol-events').append(card);
    }
    if (!data.events.length) $('patrol-events').innerHTML = '<div class="ops-empty">No hay eventos en esta vista.</div>';
}
function updateTeam() {
    $('team-ids').value = (selectedEvent?.report?.teams?.[$('team-select').value]?.members || []).join(', ');
}
async function openEvent(id, page = 1, focus = true) {
    const data = await request(`/events/${id}?page=${page}`);
    selectedEvent = data; rosterPage = data.roster.page;
    const { event, report, roster } = data;
    $('patrol-detail').hidden = false;
    $('detail-id').textContent = `OPERACIÓN #${event.id} / ${event.status}`;
    $('detail-name').textContent = event.name;
    $('detail-summary').textContent = `${event.officer_name || event.officer_id || 'Sin mando'} · ${label(event.type)} · ${label(event.phase)}`;
    $('detail-access').textContent = event.can_manage ? 'Puedes gestionar esta operación. Los cambios se comparten con los comandos de Discord.' : 'Vista de consulta. El responsable de esta operación puede gestionar sus participantes y reporte.';
    const active = event.status === 'ACTIVE';
    $('publish-registration').hidden = !event.can_manage || !active;
    $('finalize-patrol').hidden = !event.can_manage || !active;
    $('publish-aar').hidden = !event.can_manage || active;
    $('participant-form').hidden = !event.can_manage || !active;
    $('patrol-report-form').querySelector('fieldset').disabled = !event.can_manage;
    $('patrol-team-form').querySelector('fieldset').disabled = !event.can_manage;
    $('roster-count').textContent = `${roster.total} registros de asistencia`;
    $('roll-call-access').textContent = event.can_take_roll ? 'Tú eres el encargado. Marca el estado de cada participante; se guarda al pulsar.' : active ? 'Solo el encargado de este evento puede marcar la asistencia. Tu vista es de consulta.' : 'Evento finalizado. El pase de lista está cerrado.';
    const totals = data.roll_call;
    $('roll-call-summary').innerHTML = [['present', 'Presentes'], ['absent', 'Ausentes'], ['no_response', 'No responden'], ['pending', 'Sin revisar']].map(([key, title]) => `<div class="roll-total ${key}"><b>${totals[key]}</b><span>${title}</span></div>`).join('');
    $('roster-page').textContent = `${roster.page} / ${roster.totalPages}`;
    $('roster-prev').disabled = roster.page <= 1; $('roster-next').disabled = roster.page >= roster.totalPages;
    $('patrol-roster').innerHTML = roster.attendees.length ? roster.attendees.map(member => {
        const removed = ['EXPELLED', 'CANCELLED'].includes(member.status);
        const state = rollStates.find(item => item.value === member.roll_call_status);
        const controls = event.can_take_roll && !removed && !member.claimed ? `<div class="roll-controls" role="group" aria-label="Asistencia de ${safe(member.username || member.discord_id)}">${rollStates.map(item => `<button type="button" class="roll-choice ${item.value.toLowerCase()}" data-roll-member="${safe(member.discord_id)}" data-roll-state="${item.value}" aria-pressed="${item.value === member.roll_call_status}"><span aria-hidden="true">${item.symbol}</span> ${item.label}</button>`).join('')}</div>` : '';
        return `<div class="patrol-roster-row"><img class="roster-avatar" src="${safe(rosterAvatar(member.avatar))}" alt="" width="42" height="42" loading="lazy"><div class="roster-person"><strong>${safe(member.username || member.discord_id)}</strong><small>${safe(member.discord_id)} · ${safe(removed ? label(member.status) : state?.label || 'Sin revisar')}</small>${controls}</div></div>`;
    }).join('') : '<div class="roster-empty"><img src="/media/unit-crest.svg" alt="" width="40" height="48"><p class="ops-muted">El equipo aún no tiene participantes registrados.</p></div>';
    for (const input of $('patrol-report-form').elements) if (input.name) input.value = input.name === 'evidence_url' ? report.evidence?.url || report.evidence_url || '' : report[input.name] || '';
    updateTeam();
    if (focus) { $('patrol-detail').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); $('patrol-detail').focus({ preventScroll: true }); }
}
async function eventAction(action, confirmText) {
    if (!selectedEvent || (confirmText && !confirm(confirmText))) return;
    const id = selectedEvent.event.id;
    const data = await request(`/events/${id}/${action}`, { method: 'POST', body: '{}' });
    await openEvent(id, rosterPage, false); await loadEvents(); await loadResources();
    status(data.warning || data.message || 'Acción completada.');
}
async function boot() {
    try {
        const requestedEvent = new URLSearchParams(location.search).get('evento');
        if (/^\d+$/.test(requestedEvent || '')) sessionStorage.setItem('patrol-open-event', requestedEvent);
        const config = await fetch('/api/auth/config?next=%2Fpatrullas').then(res => res.json());
        if (!config.enabled) { status('El inicio con Discord requiere configurar el acceso OAuth2 en el alojamiento.'); $('patrol-login').hidden = true; return; }
        const res = await fetch('/api/auth/session');
        const session = await res.json();
        const error = new URLSearchParams(location.search).get('auth_error');
        if (error) status(error);
        if (!res.ok) { if (session.message) status(session.message); return; }
        patrolSession = session;
        $('patrol-user').textContent = session.user.name;
        $('patrol-logout').hidden = false;
        if (!session.access.patrol) { status('Tu cuenta está identificada, pero tu rol no tiene acceso al portal de operaciones.'); $('patrol-login').hidden = true; return; }
        $('patrol-auth').hidden = true; $('patrol-app').hidden = false;
        await loadResources(); await loadEvents();
        const eventToOpen = sessionStorage.getItem('patrol-open-event');
        if (/^\d+$/.test(eventToOpen || '')) { sessionStorage.removeItem('patrol-open-event'); await openEvent(eventToOpen); }
    } catch (error) { status(error.message); }
}
$('new-patrol').onclick = () => task($('new-patrol'), async () => { await loadResources(); $('create-patrol').showModal(); });
$('create-patrol-cancel').onclick = () => $('create-patrol').close();
$('create-patrol-form').onsubmit = event => {
    event.preventDefault(); const button = event.target.querySelector('button[type=submit]');
    task(button, async () => {
        const data = await request('/events', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
        $('create-patrol').close(); await loadEvents(); await loadResources(); await openEvent(data.event.id);
        status('Patrulla creada. Ya puedes publicar su convocatoria en Discord.');
    });
};
$('participant-form').onsubmit = event => {
    event.preventDefault(); const button = event.target.querySelector('button[type=submit]');
    task(button, async () => { await request(`/events/${selectedEvent.event.id}/participants`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); await openEvent(selectedEvent.event.id, rosterPage, false); await loadEvents(); event.target.reset(); status('Lista de participantes actualizada.'); });
};
for (const id of ['patrol-report-form', 'patrol-team-form']) $(id).onsubmit = event => {
    event.preventDefault(); const button = event.target.querySelector('button[type=submit]');
    task(button, async () => { await request(`/events/${selectedEvent.event.id}/report`, { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); await openEvent(selectedEvent.event.id, rosterPage, false); status('Borrador guardado. Publica o finaliza cuando esté listo.'); });
};
$('publish-registration').onclick = () => task($('publish-registration'), () => eventAction('registration'));
$('finalize-patrol').onclick = () => task($('finalize-patrol'), () => eventAction('finalize', '¿Finalizar la operación y entregar los pagos o acreditaciones correspondientes? Guarda primero el AAR y revisa la lista de participantes.'));
$('publish-aar').onclick = () => task($('publish-aar'), () => eventAction('report/publish', '¿Publicar el AAR guardado o actualizar el mensaje original? Esta acción no vuelve a pagar.'));
$('team-select').onchange = updateTeam;
$('detail-close').onclick = () => { $('patrol-detail').hidden = true; selectedEvent = null; };
$('roster-prev').onclick = () => task(null, () => openEvent(selectedEvent.event.id, rosterPage - 1, false));
$('roster-next').onclick = () => task(null, () => openEvent(selectedEvent.event.id, rosterPage + 1, false));
$('patrol-refresh').onclick = () => task($('patrol-refresh'), async () => { await loadEvents(); await loadResources(); if (selectedEvent) await openEvent(selectedEvent.event.id, rosterPage, false); });
$('patrol-filter').onchange = () => task(null, loadEvents);
$('patrol-servers').addEventListener('click', event => {
    const button = event.target.closest('[data-copy-server]');
    if (!button) return;
    task(button, async () => {
        const server = patrolResources.servers.find(row => String(row.id) === button.dataset.copyServer);
        if (!server?.server_code) return;
        if (!navigator.clipboard) throw new Error('Selecciona el código para copiarlo manualmente.');
        await navigator.clipboard.writeText(server.server_code);
        status('Código VIP copiado.');
    });
});
let rollBusy = false;
$('patrol-roster').addEventListener('click', event => {
    const button = event.target.closest('[data-roll-member]');
    if (!button || rollBusy || !selectedEvent?.event.can_take_roll) return;
    const eventId = selectedEvent.event.id, page = rosterPage;
    rollBusy = true;
    $('patrol-roster').querySelectorAll('button').forEach(item => { item.disabled = true; });
    task(null, async () => {
        await request(`/events/${eventId}/roll-call`, { method: 'PUT', body: JSON.stringify({ discord_id: button.dataset.rollMember, state: button.dataset.rollState }) });
        if (selectedEvent?.event.id === eventId) await openEvent(eventId, page, false);
        status('Asistencia guardada. También aparece al actualizar /evento lista en Discord.');
    }).finally(() => { rollBusy = false; $('patrol-roster').querySelectorAll('button').forEach(item => { item.disabled = false; }); });
});
$('patrol-roster').addEventListener('error', event => {
    if (event.target.matches('img.roster-avatar') && !event.target.src.endsWith('/media/unit-crest.svg')) event.target.src = '/media/unit-crest.svg';
}, true);
$('patrol-logout').onclick = () => task($('patrol-logout'), async () => {
    const res = await fetch('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': patrolSession.csrf_token } });
    if (!res.ok) throw new Error('No pude cerrar la sesión. Reintenta.'); location.reload();
});
boot();
