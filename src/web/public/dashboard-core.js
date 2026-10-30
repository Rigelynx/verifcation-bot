let adminToken = localStorage.getItem('usmc_admin_key') || '';
let adminOperatorName = localStorage.getItem('usmc_operator_name') || '';
let adminOperatorId = localStorage.getItem('usmc_operator_id') || '';
let allVerifications = [];
let verificationPage = 0;
const verificationPageSize = 25;
let allQuestions = [];
let activeFilter = 'TODOS';
let adminCookieSession = false, adminCsrfToken = '';

document.addEventListener('DOMContentLoaded', async () => {
    if (window.DiscordWeb && await DiscordWeb.bootAdmin()) return;
    if (adminToken && adminOperatorName) loadDashboardData();
});

// Capturar sesión directa desde /admin panel-web si viene en la URL
(function checkUrlSession() {
    try {
        const params = new URLSearchParams(window.location.search);
        const urlSession = params.get('session');
        const urlOpName = params.get('op_name');
        const urlOpId = params.get('op_id');
        if (urlSession) {
            adminToken = urlSession;
            localStorage.setItem('usmc_admin_key', urlSession);
        }
        if (urlOpName) {
            adminOperatorName = urlOpName;
            localStorage.setItem('usmc_operator_name', urlOpName);
        }
        if (urlOpId) {
            adminOperatorId = urlOpId;
            localStorage.setItem('usmc_operator_id', urlOpId);
        }
        if (urlSession || urlOpName) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } catch (e) {}
})();

// Interceptor de fetch para inyectar siempre la identidad del Operador en llamadas /api/admin
const originalFetch = window.fetch.bind(window);
window.fetch = function(input, init = {}) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (url.startsWith('/api/admin')) {
        const headers = new Headers(init.headers || {});
        if (adminCookieSession && adminCsrfToken) headers.set('X-CSRF-Token', adminCsrfToken);
        if (adminOperatorName && !headers.has('X-Operator-Name')) {
            headers.set('X-Operator-Name', encodeURIComponent(adminOperatorName));
        }
        if (adminOperatorId && !headers.has('X-Operator-Id')) {
            headers.set('X-Operator-Id', encodeURIComponent(adminOperatorId));
        }
        init.headers = headers;
    }
    return originalFetch(input, init);
};

function updateOperatorBadge(opData = null) {
    if (opData && opData.operator_name && opData.operator_name !== 'ADMIN_WEB') {
        adminOperatorName = opData.operator_name;
        localStorage.setItem('usmc_operator_name', adminOperatorName);
    }
    if (opData && opData.discord_id) {
        adminOperatorId = opData.discord_id;
        localStorage.setItem('usmc_operator_id', adminOperatorId);
    }
    const badge = document.getElementById('active-operator-badge');
    if (badge) {
        badge.textContent = adminOperatorName || 'Alto Mando';
        badge.title = adminOperatorId ? `Operador · Discord ID ${adminOperatorId}` : 'Operador de Alto Mando';
    }
    const nameInput = document.getElementById('admin-operator-name');
    if (nameInput && adminOperatorName && !nameInput.value) nameInput.value = adminOperatorName;
    const idInput = document.getElementById('admin-operator-id');
    if (idInput && adminOperatorId && !idInput.value) idInput.value = adminOperatorId;
}

// Reloj Zulu en vivo
function updateClock() {
    const now = new Date();
    const zulu = now.toUTCString().split(' ')[4] + ' UTC';
    const clk = document.getElementById('utc-clock');
    if (clk) clk.textContent = 'RELOJ ZULU: ' + zulu;
}
setInterval(updateClock, 1000);
updateClock();
updateOperatorBadge();

// Control de Login Nominal
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const opName = (document.getElementById('admin-operator-name')?.value || '').trim();
    const opId = (document.getElementById('admin-operator-id')?.value || '').trim();
    const pass = document.getElementById('admin-pass').value.trim();

    if (!opName) {
        TerminalFX.playBeepError();
        alert("DEBES INGRESAR TU NOMBRE O INDICATIVO DE OFICIAL PARA REGISTRAR LA TRAZABILIDAD.");
        return;
    }

    try {
        const loginRes = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: pass, operator_name: opName, operator_id: opId })
        });
        const loginData = await loginRes.json();

        if (loginRes.ok && loginData.success && loginData.session) {
            adminToken = loginData.session.token;
            adminOperatorName = loginData.session.operator_name;
            adminOperatorId = loginData.session.discord_id || opId || '';

            localStorage.setItem('usmc_admin_key', adminToken);
            localStorage.setItem('usmc_operator_name', adminOperatorName);
            localStorage.setItem('usmc_operator_id', adminOperatorId);

            updateOperatorBadge(loginData.session);
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('main-content').style.display = 'block';
            TerminalFX.playBeepSuccess();
            loadDashboardData();
        } else {
            TerminalFX.playBeepError();
            alert(loginData.message || "CLAVE DE ACCESO MILITAR INCORRECTA. ACCESO DENEGADO.");
        }
    } catch (err) {
        TerminalFX.playBeepError();
        alert("ERROR DE CONEXIÓN AL SERVIDOR MILITAR.");
    }
});

async function testAdminAuth(key) {
    try {
        const res = await fetch('/api/admin/data', {
            headers: { 'Authorization': `Bearer ${key}` }
        });
        return res.ok;
    } catch (err) {
        return false;
    }
}

async function logoutAdmin() {
    if (adminCookieSession) {
        const res = await fetch('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': adminCsrfToken } });
        if (!res.ok) { alert('No pude cerrar la sesión. Recarga y reintenta.'); return; }
    }
    localStorage.removeItem('usmc_admin_key');
    localStorage.removeItem('usmc_operator_name');
    localStorage.removeItem('usmc_operator_id');
    location.reload();
}

// Cambio de Pestañas
function switchTab(tabName) {
    TerminalFX.playKeyClick();
    document.dispatchEvent(new CustomEvent('usmc:tabchange', { detail: tabName }));
    document.getElementById('personnel-telemetry').style.display = tabName === 'expedientes' ? 'grid' : 'none';
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');

    const tabMap = {
        'expedientes': 0,
        'cuestionario': 1,
        'bot-config': 2,
        'economia': 3,
        'tienda': 4,
        'roles': 5,
        'eventos': 6,
        'comandos': 7,
        'auditoria': 8,
        'servidores': 9
    };

    const idx = tabMap[tabName];
    if (idx !== undefined && document.querySelectorAll('.nav-tab')[idx]) {
        document.querySelectorAll('.nav-tab')[idx].classList.add('active');
    }
    const pane = document.getElementById('tab-' + tabName);
    if (pane) pane.style.display = 'block';

    if (tabName === 'servidores') loadOperationServers();
    if (tabName === 'economia') loadEconomyData();
    if (tabName === 'tienda') loadShopData();
    if (tabName === 'roles') loadRoleRewards();
    if (tabName === 'eventos') loadEventsData();
    if (tabName === 'comandos') loadCommandsData();
    if (tabName === 'auditoria') {
        loadAuditoriaData();
        if (typeof loadAdminAuditLogs === 'function') loadAdminAuditLogs();
    }
}

// Cargar Datos del Dashboard
async function loadDashboardData() {
    try {
        if ((!adminToken && !adminCookieSession) || !adminOperatorName) {
            throw new Error('Identificación nominal requerida');
        }
        const res = await fetch('/api/admin/data', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (!res.ok) throw new Error('No autorizado');

        const data = await res.json();
        if (data.operator) updateOperatorBadge(data.operator);
        document.getElementById('login-modal').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

        // Telemetría
        allVerifications = data.verifications;
        allQuestions = data.questions;

        document.getElementById('stat-total').textContent = allVerifications.length;
        document.getElementById('count-total').textContent = allVerifications.length;
        document.getElementById('stat-pending').textContent = allVerifications.filter(v => v.status === 'PENDIENTE').length;
        document.getElementById('stat-approved').textContent = allVerifications.filter(v => v.status === 'APROBADO').length;
        document.getElementById('stat-rejected').textContent = allVerifications.filter(v => v.status === 'RECHAZADO').length;

        renderVerificationsTable();
        renderQuestionsList();
        populateConfigForm(data.config);
        fetchGuildResources();

    } catch (err) {
        console.error(err);
        document.getElementById('login-modal').style.display = 'flex';
        document.getElementById('main-content').style.display = 'none';
    }
}

// Renderizado de la Tabla de Verificaciones
function renderVerificationsTable() {
    const tbody = document.getElementById('verifications-tbody');
    const searchVal = (document.getElementById('search-input').value || '').toLowerCase();

    let filtered = allVerifications;
    if (activeFilter !== 'TODOS') {
        filtered = filtered.filter(v => v.status === activeFilter);
    }
    if (searchVal) {
        filtered = filtered.filter(v => 
            v.username.toLowerCase().includes(searchVal) || 
            v.discord_id.includes(searchVal)
        );
    }

    const totalFiltered = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / verificationPageSize));
    verificationPage = Math.min(verificationPage, totalPages - 1);
    const pageStart = verificationPage * verificationPageSize;
    filtered = filtered.slice(pageStart, pageStart + verificationPageSize);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 25px; color: #728c75;">NO SE ENCONTRARON EXPEDIENTES EN ESTA CATEGORÍA.</td></tr>`;
        renderVerificationsPagination(totalFiltered, totalPages);
        return;
    }

    tbody.innerHTML = filtered.map(v => {
        const badgeClass = v.status.toLowerCase();
        return `
            <tr>
                <td style="color: #88a38c;">${v.updated_at || v.created_at}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${v.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 26px; height: 26px; border: 1px solid var(--usmc-green); object-fit: cover;">
                        <strong>${v.username}</strong>
                    </div>
                </td>
                <td style="font-family: var(--font-mono); color: var(--usmc-gold);">${v.discord_id}</td>
                <td><span class="status-badge ${badgeClass}">${v.status}</span></td>
                <td style="color: #a8c7ad; font-size: 0.8rem;">${v.reviewer_name ? `${v.reviewer_name}<br><small style="color:#728c75;">ID: ${v.reviewer_id}</small>` : (v.reviewer_id || (v.status === 'PENDIENTE' ? 'PENDIENTE' : 'NO REGISTRADO'))}</td>
                <td>
                    <button class="action-icon-btn" onclick="openDossierModal('${v.discord_id}')">👁️ VER EXPEDIENTE</button>
                    ${v.status === 'PENDIENTE' ? `
                        <button class="action-icon-btn" style="color: #7aff8d;" onclick="takeAction('${v.discord_id}', 'APROBADO')">✔ APROBAR</button>
                        <button class="action-icon-btn" style="color: #ff7a7a;" onclick="takeAction('${v.discord_id}', 'RECHAZADO')">✕ DENEGAR</button>
                    ` : ''}
                    <button class="action-icon-btn" style="color: #ff5555;" onclick="deleteDossier('${v.discord_id}')">🗑</button>
                </td>
            </tr>
        `;
    }).join('');
    renderVerificationsPagination(totalFiltered, totalPages);
}

function renderVerificationsPagination(total, totalPages) {
    const el = document.getElementById('verifications-pagination');
    if (!el) return;
    const current = verificationPage + 1;
    el.innerHTML = `<button class="btn-retro" ${current <= 1 ? 'disabled' : ''} onclick="changeVerificationPage(-1)">◀ ANTERIOR</button><span style="color: var(--usmc-gold);">PÁGINA ${current} / ${totalPages} · ${total} EXPEDIENTES</span><button class="btn-retro" ${current >= totalPages ? 'disabled' : ''} onclick="changeVerificationPage(1)">SIGUIENTE ▶</button>`;
}

function changeVerificationPage(delta) {
    const searchVal = (document.getElementById('search-input').value || '').toLowerCase();
    let filtered = allVerifications;
    if (activeFilter !== 'TODOS') filtered = filtered.filter(v => v.status === activeFilter);
    if (searchVal) filtered = filtered.filter(v => v.username.toLowerCase().includes(searchVal) || v.discord_id.includes(searchVal));
    const totalPages = Math.max(1, Math.ceil(filtered.length / verificationPageSize));
    verificationPage = Math.min(Math.max(verificationPage + delta, 0), totalPages - 1);
    renderVerificationsTable();
}

function filterVerifications(filter) {
    activeFilter = filter;
    verificationPage = 0;
    TerminalFX.playKeyClick();
    renderVerificationsTable();
}

function searchTable() {
    verificationPage = 0;
    renderVerificationsTable();
}

// Modal de Expediente Individual
function openDossierModal(discordId) {
    TerminalFX.playKeyClick();
    const dossier = allVerifications.find(v => v.discord_id === discordId);
    if (!dossier) return;

    const modalBody = document.getElementById('modal-dossier-body');
    let answersHtml = '';

    for (const [q, a] of Object.entries(dossier.answers || {})) {
        answersHtml += `
            <div class="answer-card">
                <div class="q-title">${q}</div>
                <div class="q-val">${a}</div>
            </div>
        `;
    }

    const safeUsername = String(dossier.username || '').replace(/"/g, '&quot;');

    modalBody.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px; border-bottom: 1px dashed var(--border-light); padding-bottom: 15px;">
            <img src="${dossier.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 60px; height: 60px; border: 2px solid var(--usmc-gold);">
            <div style="flex: 1;">
                <h2 style="color: #fff; font-family: var(--font-tech); font-size: 1.4rem;">${dossier.username}</h2>
                <p style="color: var(--usmc-gold);">DISCORD ID: ${dossier.discord_id}</p>
                <p style="font-size: 0.8rem; color: #8fa892;">ESTADO: <span class="status-badge ${dossier.status.toLowerCase()}">${dossier.status}</span></p>
                ${dossier.reviewer_id ? `<p style="font-size: 0.8rem; color: #a8c7ad; margin-top: 4px;">RESUELTO POR: ${dossier.reviewer_name || 'Discord'}<br><span style="color:#728c75;">ID: ${dossier.reviewer_id}</span></p>` : ''}
                ${dossier.reason ? `<p style="font-size: 0.8rem; color: #ff7a7a; margin-top: 4px;">MOTIVO: ${dossier.reason}</p>` : ''}
            </div>
        </div>
        <div style="background: rgba(212, 175, 55, 0.06); border: 1px solid var(--border-light); padding: 12px; margin-bottom: 15px;">
            <label style="display:block; color: var(--usmc-gold); font-size: 0.8rem; margin-bottom: 6px; font-family: var(--font-tech);">✏️ EDITAR NOMBRE / CALLSIGN DEL EXPEDIENTE (CON TRAZABILIDAD NOMINAL):</label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <input type="text" id="edit-dossier-username" value="${safeUsername}" class="input-retro" style="flex: 1; min-width: 180px; margin: 0;" placeholder="Nuevo nombre o callsign">
                <button class="btn-retro" onclick="saveDossierChanges('${dossier.discord_id}')">💾 GUARDAR NOMBRE</button>
            </div>
            <p style="font-size: 0.72rem; color: #728c75; margin-top: 5px;">Quedará registrado en Auditoría Forense que <strong>${adminOperatorName || 'el operador actual'}</strong> realizó esta modificación.</p>
        </div>
        <h4 style="color: var(--usmc-green); margin-bottom: 10px; font-family: var(--font-tech);">DECLARACIÓN DEL RECLUTA:</h4>
        ${answersHtml || '<p style="color: #728c75;">Sin respuestas registradas.</p>'}
    `;

    document.getElementById('modal-btn-approve').onclick = () => { takeAction(dossier.discord_id, 'APROBADO'); closeDossierModal(); };
    document.getElementById('modal-btn-reject').onclick = () => { takeAction(dossier.discord_id, 'RECHAZADO'); closeDossierModal(); };

    document.getElementById('dossier-modal').style.display = 'flex';
}

async function saveDossierChanges(discordId) {
    const newUsername = document.getElementById('edit-dossier-username')?.value.trim();
    if (!newUsername) {
        alert("El nombre del usuario no puede estar vacío.");
        return;
    }

    try {
        const res = await fetch(`/api/admin/verifications/${discordId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ username: newUsername })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            TerminalFX.playBeepSuccess();
            await loadDashboardData();
            openDossierModal(discordId);
            alert(`✅ Nombre actualizado a "${newUsername}". Acción registrada en Auditoría a nombre de ${adminOperatorName}.`);
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL ACTUALIZAR: " + (data.message || 'Error desconocido'));
        }
    } catch (err) {
        alert("ERROR DE CONEXIÓN: " + err.message);
    }
}

function closeDossierModal() {
    document.getElementById('dossier-modal').style.display = 'none';
}

async function takeAction(discordId, action) {
    let reason = '';
    if (action === 'APROBADO' && !confirm('¿Confirmas aprobar este expediente y otorgar acceso militar al recluta?')) return;
    if (action === 'RECHAZADO') {
        reason = prompt("INGRESE EL MOTIVO DE DENEGACIÓN / RECHAZO:") || 'No cumple los requisitos mínimos.';
    }

    try {
        const res = await fetch(`/api/admin/verifications/${discordId}/action`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ action, reason })
        });

        if (res.ok) {
            TerminalFX.playBeepSuccess();
            loadDashboardData();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL PROCESAR LA ACCIÓN.");
        }
    } catch (err) {
        alert("ERROR EN LA CONEXIÓN: " + err.message);
    }
}

async function deleteDossier(discordId) {
    if (!confirm(`¿CONFIRMAR ELIMINACIÓN PERMANENTE DEL EXPEDIENTE ${discordId}?`)) return;

    try {
        const res = await fetch(`/api/admin/verifications/${discordId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (res.ok) {
            TerminalFX.playBeepSuccess();
            loadDashboardData();
        }
    } catch (err) {
        alert(err.message);
    }
}

// Renderizado del Configurador de Preguntas
function renderQuestionsList() {
    const container = document.getElementById('questions-list');
    if (!allQuestions || allQuestions.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #728c75;">No hay preguntas configuradas actualmente.</div>';
        return;
    }

    const typeBadges = {
        text: '<span class="status-badge" style="border-color: #38e54d; color: #38e54d;">📝 TEXTO</span>',
        textarea: '<span class="status-badge" style="border-color: #00ccff; color: #00ccff;">📄 PÁRRAFO</span>',
        number: '<span class="status-badge" style="border-color: #e5b338; color: #e5b338;">🔢 NÚMERO</span>',
        select: '<span class="status-badge" style="border-color: #ffaa00; color: #ffaa00;">📜 DESPLEGABLE</span>',
        radio: '<span class="status-badge" style="border-color: #38e54d; color: #38e54d; background: rgba(56,229,77,0.15);">🔘 RADIO (MARCAR 1)</span>',
        checkbox: '<span class="status-badge" style="border-color: #ffaa00; color: #ffaa00; background: rgba(255,170,0,0.15);">☑️ CASILLAS (MARCAR)</span>'
    };

    container.innerHTML = allQuestions.map((q, idx) => `
        <div class="form-group" style="display: flex; justify-content: space-between; align-items: center; gap: 15px; margin-bottom: 12px;">
            <div style="flex: 1;">
                <div style="font-family: var(--font-tech); color: #fff; font-size: 1rem; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>#${idx + 1} &bull; ${q.label}</span>
                    ${q.required ? '<span style="color: var(--usmc-red); font-size: 0.75rem; font-weight: bold;">[OBLIGATORIO]</span>' : '<span style="color: #728c75; font-size: 0.75rem;">[OPCIONAL]</span>'}
                    ${typeBadges[q.field_type] || `<span class="status-badge">${q.field_type.toUpperCase()}</span>`}
                </div>
                <div style="font-size: 0.8rem; color: #728c75; margin-top: 4px;">
                    ${q.description ? `<span>${q.description}</span>` : '<em>Sin descripción adicional</em>'}
                </div>
                ${q.options && q.options.length > 0 ? `
                    <div style="font-size: 0.75rem; color: #9bb59f; margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
                        <span style="color: var(--usmc-gold);">Opciones:</span>
                        ${q.options.map(opt => `<span style="background: #09100a; border: 1px solid #233825; padding: 2px 6px; color: #d1ecd4;">${opt}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button class="btn-retro" style="padding: 6px 10px; font-size: 0.8rem;" onclick="openEditQuestionModal(${q.id})">✏️ EDITAR</button>
                <button class="btn-retro danger" style="padding: 6px 10px; font-size: 0.8rem;" onclick="deleteQuestion(${q.id})">🗑 BORRAR</button>
            </div>
        </div>
    `).join('');
}

function handleFieldTypeChange() {
    const type = document.getElementById('q-type').value;
    const optionsGroup = document.getElementById('q-options-group');
    const help = document.getElementById('q-options-help');
    const label = document.getElementById('q-options-label');

    if (type === 'select') {
        optionsGroup.style.display = 'block';
        label.textContent = 'OPCIONES DEL MENÚ DESPLEGABLE:';
        help.textContent = 'Escribe las opciones separadas por comas o saltos de línea. El usuario elegirá una del menú desplegable.';
    } else if (type === 'radio') {
        optionsGroup.style.display = 'block';
        label.textContent = 'OPCIONES PARA MARCAR (SELECCIÓN ÚNICA - RADIO):';
        help.textContent = 'Escribe las opciones que aparecerán con botones para marcar. El recluta solo podrá seleccionar UNA.';
    } else if (type === 'checkbox') {
        optionsGroup.style.display = 'block';
        label.textContent = 'CASILLAS PARA MARCAR (SELECCIÓN MÚLTIPLE O CONFIRMACIÓN):';
        help.textContent = 'Puedes poner varias opciones para que el recluta marque una o varias, o poner solo 1 para una casilla de confirmación/términos.';
    } else {
        optionsGroup.style.display = 'none';
    }

    updateOptionPreview();
}

function applyPreset(type) {
    TerminalFX.playKeyClick();
    let opts = '';
    if (type === 'yesno') {
        document.getElementById('q-type').value = 'radio';
        opts = 'Sí / Afirmativo, No / Negativo';
    } else if (type === 'rules') {
        document.getElementById('q-type').value = 'checkbox';
        opts = 'He leído y acepto cumplir estrictamente el código militar y la jerarquía';
    } else if (type === 'divisions') {
        opts = 'Infantería de Marina, Policía Militar, Aviación Táctica, Inteligencia y Comunicaciones';
    } else if (type === 'schedules') {
        opts = 'Horario Mañana (08:00 - 14:00 UTC), Horario Tarde (14:00 - 20:00 UTC), Horario Noche (20:00 - 02:00 UTC)';
    }
    document.getElementById('q-options').value = opts;
    handleFieldTypeChange();
}

function updateOptionPreview() {
    const type = document.getElementById('q-type').value;
    const preview = document.getElementById('q-preview-content');
    if (!preview) return;

    const rawText = document.getElementById('q-options').value;
    const items = rawText.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);

    if (items.length === 0) {
        preview.innerHTML = '<span style="color: #728c75;">Ingresa opciones arriba para visualizar los controles tácticos...</span>';
        return;
    }

    if (type === 'radio') {
        preview.innerHTML = `
            <div class="retro-options-list">
                ${items.map(opt => `
                    <label class="retro-option-item" style="padding: 6px 10px;">
                        <input type="radio" name="preview_radio" value="${opt}" onchange="TerminalFX.playKeyClick()">
                        <span class="retro-option-text">${opt}</span>
                    </label>
                `).join('')}
            </div>
        `;
    } else if (type === 'checkbox') {
        preview.innerHTML = `
            <div class="retro-options-list">
                ${items.map(opt => `
                    <label class="retro-option-item" style="padding: 6px 10px;">
                        <input type="checkbox" name="preview_check" value="${opt}" onchange="TerminalFX.playKeyClick()">
                        <span class="retro-option-text">${opt}</span>
                    </label>
                `).join('')}
            </div>
        `;
    } else if (type === 'select') {
        preview.innerHTML = `
            <select class="retro-select" style="padding: 6px 10px;">
                <option value="">-- SELECCIONE UNA DIRECTIVA --</option>
                ${items.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
            </select>
        `;
    } else {
        preview.innerHTML = '<span style="color: #728c75;">Este tipo de pregunta usa un campo directo de texto.</span>';
    }
}

function openNewQuestionModal() {
    TerminalFX.playKeyClick();
    document.getElementById('q-modal-title').textContent = 'AGREGAR NUEVA PREGUNTA';
    document.getElementById('q-id').value = '';
    document.getElementById('q-label').value = '';
    document.getElementById('q-desc').value = '';
    document.getElementById('q-type').value = 'text';
    document.getElementById('q-required').value = '1';
    document.getElementById('q-options').value = '';
    handleFieldTypeChange();
    document.getElementById('question-modal').style.display = 'flex';
}

function openEditQuestionModal(id) {
    TerminalFX.playKeyClick();
    const q = allQuestions.find(item => item.id === id);
    if (!q) return;

    document.getElementById('q-modal-title').textContent = 'EDITAR PREGUNTA #' + q.id;
    document.getElementById('q-id').value = q.id;
    document.getElementById('q-label').value = q.label;
    document.getElementById('q-desc').value = q.description || '';
    document.getElementById('q-type').value = q.field_type;
    document.getElementById('q-required').value = q.required ? '1' : '0';
    document.getElementById('q-options').value = (q.options || []).join(', ');
    handleFieldTypeChange();
    document.getElementById('question-modal').style.display = 'flex';
}

function closeQuestionModal() {
    document.getElementById('question-modal').style.display = 'none';
}

document.getElementById('question-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('q-id').value;
    const label = document.getElementById('q-label').value.trim();
    const description = document.getElementById('q-desc').value.trim();
    const field_type = document.getElementById('q-type').value;
    const required = parseInt(document.getElementById('q-required').value);
    const options = document.getElementById('q-options').value
        .split(/[,\n]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    const payload = { label, description, field_type, required, options };
    const url = id ? `/api/admin/questions/${id}` : '/api/admin/questions';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            TerminalFX.playBeepSuccess();
            closeQuestionModal();
            loadDashboardData();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL GUARDAR PREGUNTA.");
        }
    } catch (err) {
        alert(err.message);
    }
});

async function deleteQuestion(id) {
    if (!confirm(`¿CONFIRMAR ELIMINACIÓN DE LA PREGUNTA #${id}?`)) return;

    try {
        const res = await fetch(`/api/admin/questions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (res.ok) {
            TerminalFX.playBeepSuccess();
            loadDashboardData();
        }
    } catch (err) {
        alert(err.message);
    }
}

// Recursos del Servidor Discord (Roles y Canales)
let guildResources = { connected: false, roles: [], channels: [], stickers: [] };

async function fetchGuildResources() {
    try {
        const res = await fetch('/api/admin/guild-resources', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (data.success && data.connected) {
            guildResources = data;
            const led = document.getElementById('guild-led');
            if (led) led.className = 'led-indicator led-green';
            const txt = document.getElementById('guild-status-text');
            if (txt) txt.innerHTML = `🛰️ <strong>DISCORD CONECTADO:</strong> Servidor <em>${data.guild_name}</em> (${data.roles.length} roles, ${data.channels.length} canales sincronizados)`;
            
            populatePickers(data.roles, data.channels);
        } else {
            const led = document.getElementById('guild-led');
            if (led) led.className = 'led-indicator led-amber';
            const txt = document.getElementById('guild-status-text');
            if (txt) txt.innerHTML = `⚠️ <strong>DISCORD NO CONECTADO AÚN:</strong> Puedes escribir o pegar los IDs de roles y canales manualmente.`;
        }
    } catch (e) {
        console.error('Error fetching guild resources:', e);
    }
}

function populatePickers(roles, channels) {
    // Pickers de Roles
    const rolePickers = [
        { id: 'picker-verified-role', defaultText: '-- SELECCIONAR UN ROL DEL SERVIDOR PARA AÑADIR --' },
        { id: 'picker-unverified-role', defaultText: '-- SELECCIONAR ROL DEL SERVIDOR --' },
        { id: 'picker-officer-role', defaultText: '-- SELECCIONAR ROL DE OFICIAL --' },
        { id: 'picker-admin-role', defaultText: '-- SELECCIONAR ROL ADMIN --' }
    ];

    rolePickers.forEach(p => {
        const el = document.getElementById(p.id);
        if (!el) return;
        el.innerHTML = `<option value="">${p.defaultText}</option>` +
            roles.map(r => `<option value="${r.id}">${r.name} (ID: ${r.id})</option>`).join('');
    });

    // Pickers de Canales
    const channelPickers = [
        { id: 'picker-review-channel', defaultText: '-- SELECCIONAR CANAL DE TEXTO --' },
        { id: 'picker-log-channel', defaultText: '-- SELECCIONAR CANAL DE TEXTO --' },
        { id: 'bonus-panel-channel', defaultText: '-- SELECCIONAR CANAL DE TEXTO --' },
        { id: 'create-bonus-channel', defaultText: '-- NO PUBLICAR AHORA (SOLO GUARDAR EN EL REGISTRO) --' },
        { id: 'deploy-bonus-modal-channel', defaultText: '-- SELECCIONAR CANAL DE TEXTO --' },
        { id: 'picker-economy-log-channel', defaultText: '-- DESACTIVADO (SOLO PANEL WEB) --' },
        { id: 'audit-log-channel-picker', defaultText: '-- DESACTIVADO (SOLO PANEL WEB) --' }
    ];

    channelPickers.forEach(p => {
        const el = document.getElementById(p.id);
        if (!el) return;
        el.innerHTML = `<option value="">${p.defaultText}</option>` +
            channels.map(c => `<option value="${c.id}">#${c.name} (ID: ${c.id})</option>`).join('');
    });

    // Poblar selector de rol para multiplicadores de rango
    const rewardSelect = document.getElementById('reward-role-select');
    if (rewardSelect) {
        rewardSelect.innerHTML = '<option value="">-- SELECCIONAR ROL DEL SERVIDOR --</option>' +
            roles.map(r => `<option value="${r.id}">${r.name} (ID: ${r.id})</option>`).join('');
    }

    // Poblar selectores de roles de la armería / tienda
    const shopPickers = [
        { id: 'shop-role-give', defaultText: '-- NINGUNO (SOLO ÍTEM) --' },
        { id: 'shop-role-remove', defaultText: '-- NINGUNO (NO RETIRAR) --' },
        { id: 'shop-role-required', defaultText: '-- NINGUNO (CUALQUIERA PUEDE) --' },
        { id: 'shop-role-blocked', defaultText: '-- NINGUNO --' }
    ];

    shopPickers.forEach(p => {
        const el = document.getElementById(p.id);
        if (el) {
            el.innerHTML = `<option value="">${p.defaultText}</option>` +
                roles.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        }
    });

    syncPickersFromConfigInputs();
    renderVerifiedRoleTags();
    if (typeof renderCommandPermissions === 'function' && allCommandPerms && allCommandPerms.length > 0) {
        renderCommandPermissions();
    }
}

function syncPickersFromConfigInputs() {
    const mappings = [
        ['picker-unverified-role', 'cfg-unverified-role'],
        ['picker-officer-role', 'cfg-officer-role'],
        ['picker-admin-role', 'cfg-admin-role'],
        ['picker-review-channel', 'cfg-review-channel'],
        ['picker-log-channel', 'cfg-log-channel'],
        ['picker-economy-log-channel', 'eco-log-channel']
    ];

    mappings.forEach(([pickerId, inputId]) => {
        const picker = document.getElementById(pickerId);
        const input = document.getElementById(inputId);
        if (picker && input) picker.value = input.value.trim();
    });

    const auditPicker = document.getElementById('audit-log-channel-picker');
    const ecoInput = document.getElementById('eco-log-channel');
    if (auditPicker && ecoInput) auditPicker.value = ecoInput.value.trim();
}

function addVerifiedRoleFromPicker(roleId) {
    if (!roleId) return;
    const input = document.getElementById('cfg-verified-role');
    const currentIds = input.value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    if (!currentIds.includes(roleId)) {
        currentIds.push(roleId);
        input.value = currentIds.join(', ');
        renderVerifiedRoleTags();
        TerminalFX.playKeyClick();
    }
}

function removeVerifiedRoleId(roleId) {
    const input = document.getElementById('cfg-verified-role');
    const currentIds = input.value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    const filtered = currentIds.filter(id => id !== roleId);
    input.value = filtered.join(', ');
    renderVerifiedRoleTags();
    TerminalFX.playKeyClick();
}

function renderVerifiedRoleTags() {
    const container = document.getElementById('verified-roles-tags');
    if (!container) return;
    const input = document.getElementById('cfg-verified-role');
    const currentIds = input.value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);

    if (currentIds.length === 0) {
        container.innerHTML = '<span style="color: #728c75; font-size: 0.8rem;">Ningún rol asignado todavía. Puedes añadir roles arriba.</span>';
        return;
    }

    container.innerHTML = currentIds.map(id => {
        const found = guildResources.roles.find(r => r.id === id);
        const roleName = found ? found.name : `Rol #${id}`;
        return `
            <span style="background: #0d1e10; border: 1px solid var(--usmc-green); color: #d1ecd4; padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-tech); box-shadow: 0 0 5px rgba(56,229,77,0.2);">
                <span>🎖️ ${roleName}</span>
                <button type="button" style="background: transparent; border: none; color: var(--usmc-red); cursor: pointer; font-weight: bold; font-size: 0.9rem;" onclick="removeVerifiedRoleId('${id}')" title="Quitar rol">✕</button>
            </span>
        `;
    }).join('');
}

// Configuración del Servidor y Bot
function populateConfigForm(cfg) {
    if (!cfg) return;
    document.getElementById('cfg-verification-mode').value = cfg.verification_mode || 'manual';
    document.getElementById('cfg-verified-role').value = cfg.verified_role_id || '';
    document.getElementById('cfg-unverified-role').value = cfg.unverified_role_id || '';
    document.getElementById('cfg-officer-role').value = cfg.officer_role_id || '';
    document.getElementById('cfg-admin-role').value = cfg.admin_role_id || '';
    document.getElementById('cfg-review-channel').value = cfg.review_channel_id || '';
    document.getElementById('cfg-log-channel').value = cfg.log_channel_id || '';
    document.getElementById('cfg-base-name').value = cfg.military_base_name || '';
    document.getElementById('cfg-base-subtitle').value = cfg.military_subtitle || '';

    syncPickersFromConfigInputs();
    renderVerifiedRoleTags();
}

document.getElementById('bot-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const configPayload = {
        verification_mode: document.getElementById('cfg-verification-mode').value,
        verified_role_id: document.getElementById('cfg-verified-role').value.trim() || null,
        unverified_role_id: document.getElementById('cfg-unverified-role').value.trim() || null,
        officer_role_id: document.getElementById('cfg-officer-role').value.trim() || null,
        admin_role_id: document.getElementById('cfg-admin-role').value.trim() || null,
        review_channel_id: document.getElementById('cfg-review-channel').value.trim() || null,
        log_channel_id: document.getElementById('cfg-log-channel').value.trim() || null,
        military_base_name: document.getElementById('cfg-base-name').value.trim(),
        military_subtitle: document.getElementById('cfg-base-subtitle').value.trim()
    };

    try {
        const res = await fetch('/api/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(configPayload)
        });

        if (res.ok) {
            const data = await res.json();
            populateConfigForm(data.config);
            TerminalFX.playBeepSuccess();
            alert("PARÁMETROS MILITARES, ROLES Y PERMISOS GUARDADOS CON ÉXITO EN SQLITE.");
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL ACTUALIZAR PARÁMETROS.");
        }
    } catch (err) {
        alert(err.message);
    }
});
