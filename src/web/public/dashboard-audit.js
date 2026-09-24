// =========================================================================
// MÓDULO JAVASCRIPT: AUDITORÍA CONTABLE Y RASTREO DE USO DE DINERO
// =========================================================================
let auditDebounceTimer = null;
function filterAuditoriaDebounced() {
    if (auditDebounceTimer) clearTimeout(auditDebounceTimer);
    auditDebounceTimer = setTimeout(() => {
        window.auditPage = 0;
        loadAuditoriaData();
    }, 300);
}

async function loadAuditoriaData() {
    const sym = globalEcoSettings.currency_symbol || '$';
    try {
        // 1. Cargar estadísticas de tesorería
        const resStats = await fetch('/api/admin/economy/treasury/stats', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (resStats.ok) {
            const data = await resStats.json();
            const s = data.stats || {};
            const elEvents = document.getElementById('audit-stat-events');
            const elBonuses = document.getElementById('audit-stat-bonuses');
            const elShop = document.getElementById('audit-stat-shop');
            const elTransfers = document.getElementById('audit-stat-transfers');
            const elCirculating = document.getElementById('audit-stat-circulating');

            if (elEvents) elEvents.textContent = `${sym}${(s.totalEventPaid || 0).toLocaleString()}`;
            if (elBonuses) elBonuses.textContent = `${sym}${(s.totalBonusPaid || 0).toLocaleString()}`;
            if (elShop) elShop.textContent = `${sym}${(s.totalShopSpent || 0).toLocaleString()}`;
            if (elTransfers) elTransfers.textContent = `${sym}${(s.totalTransfers || 0).toLocaleString()}`;
            if (elCirculating) elCirculating.textContent = `${sym}${(s.totalCirculating || 0).toLocaleString()}`;
        }

        // 2. Cargar transacciones filtradas
        const search = document.getElementById('audit-search-input')?.value || '';
        const type = document.getElementById('audit-type-select')?.value || 'ALL';
        const from = document.getElementById('audit-date-from')?.value || '';
        const to = document.getElementById('audit-date-to')?.value || '';
        const auditPage = window.auditPage || 0;

        const query = new URLSearchParams({ type, search, from, to, limit: 25, offset: auditPage * 25 });
        const resTx = await fetch(`/api/admin/economy/transactions?${query.toString()}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (resTx.ok) {
            const data = await resTx.json();
            renderAuditoriaTable(data.transactions || []);
            window.auditTotal = data.total || 0;
            renderAuditPagination();
        }

        // 3. Cargar y sincronizar canal de logs de auditoría
        const resEcoSettings = await fetch('/api/admin/economy/settings', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (resEcoSettings.ok) {
            const sData = await resEcoSettings.json();
            if (sData.settings) {
                globalEcoSettings = sData.settings;
                const pAudit = document.getElementById('audit-log-channel-picker');
                if (pAudit) pAudit.value = sData.settings.log_channel_id || '';
                const pEco = document.getElementById('picker-economy-log-channel');
                if (pEco) pEco.value = sData.settings.log_channel_id || '';
                const inpEco = document.getElementById('eco-log-channel');
                if (inpEco) inpEco.value = sData.settings.log_channel_id || '';
            }
        }

        // Resetear estado de selección al recargar datos
        const masterCheck = document.getElementById('audit-select-all');
        if (masterCheck) masterCheck.checked = false;
        updateAuditSelectedState();
    } catch (err) {
        console.error('[Error Auditoría]:', err);
    }
}

function renderAuditPagination() {
    const el = document.getElementById('audit-pagination');
    if (!el) return;
    const page = window.auditPage || 0;
    const pages = Math.max(1, Math.ceil((window.auditTotal || 0) / 25));
    el.innerHTML = `<button class="btn-retro" ${page <= 0 ? 'disabled' : ''} onclick="changeAuditPage(-1)">◀ ANTERIOR</button><span style="color: var(--usmc-gold);">PÁGINA ${page + 1} / ${pages} · ${window.auditTotal || 0} REGISTROS</span><button class="btn-retro" ${page + 1 >= pages ? 'disabled' : ''} onclick="changeAuditPage(1)">SIGUIENTE ▶</button>`;
}

function changeAuditPage(delta) {
    const pages = Math.max(1, Math.ceil((window.auditTotal || 0) / 25));
    window.auditPage = Math.min(Math.max((window.auditPage || 0) + delta, 0), pages - 1);
    loadAuditoriaData();
}

async function loadAdminAuditLogs() {
    const tbody = document.getElementById('admin-audit-logs-tbody');
    if (!tbody) return;
    const res = await fetch('/api/admin/audit-logs?limit=50', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    if (!res.ok) return;
    const data = await res.json();
    tbody.innerHTML = (data.logs || []).map(log => `<tr><td style="font-size:0.8rem;color:#728c75;">${log.created_at}</td><td style="color:#a8c7ad;">${log.actor}</td><td style="color:var(--usmc-gold);">${log.action}</td><td style="font-family:var(--font-mono);">${log.target_id || '—'}</td><td>${log.details || '—'}</td></tr>`).join('') || '<tr><td colspan="5">No hay acciones administrativas registradas.</td></tr>';
}

async function saveEconomyLogChannel() {
    TerminalFX.playKeyClick();
    const select = document.getElementById('audit-log-channel-picker');
    const channelId = select ? select.value.trim() : '';

    try {
        const res = await fetch('/api/admin/economy/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ log_channel_id: channelId || null })
        });
        if (res.ok) {
            const data = await res.json();
            globalEcoSettings = data.settings;
            TerminalFX.playBeepSuccess();

            const ecoInput = document.getElementById('eco-log-channel');
            if (ecoInput) ecoInput.value = channelId;
            const ecoPicker = document.getElementById('picker-economy-log-channel');
            if (ecoPicker) ecoPicker.value = channelId;

            if (channelId) {
                alert("✅ CANAL DE DISCORD PARA LOGS DE ECONOMÍA VINCULADO CON ÉXITO.");
            } else {
                alert("ℹ️ CANAL DESVINCULADO: Los logs contables solo se registrarán en el Panel Web.");
            }
        } else {
            TerminalFX.playBeepError();
            alert("Error al vincular el canal de logs en Discord.");
        }
    } catch (err) {
        alert(err.message);
    }
}

function renderAuditoriaTable(transactions) {
    const tbody = document.getElementById('audit-transactions-tbody');
    if (!tbody) return;
    const sym = globalEcoSettings.currency_symbol || '$';

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #728c75;">No se encontraron movimientos contables coincidentes.</td></tr>`;
        updateAuditSelectedState();
        return;
    }

    const TYPE_TAGS = {
        'EVENT_CLAIM': { label: '🎖️ PAGA EVENTO', color: '#38e54d', isPositive: true },
        'BUY_ITEM': { label: '🛒 COMPRA TIENDA', color: '#00ccff', isPositive: false },
        'PAY': { label: '💸 TRANSFERENCIA', color: '#ff99ff', isPositive: null },
        'BONUS_CLAIM': { label: '🎁 BONO PANEL', color: '#d4af37', isPositive: true },
        'BONUS_GIVE': { label: '🎖️ BONO OFICIAL', color: '#d4af37', isPositive: true },
        'MASS_BONUS': { label: '📢 BONO MASIVO', color: '#d4af37', isPositive: true },
        'DEP': { label: '🏦 DEPÓSITO BANCO', color: '#a0baa4', isPositive: null },
        'WITH': { label: '💵 RETIRO BANCO', color: '#a0baa4', isPositive: null },
        'WORK': { label: '🛠️ SALARIO TRABAJO', color: '#38e54d', isPositive: true },
        'CRIME': { label: '🚨 OPERACIÓN NEGRA', color: '#ff4444', isPositive: null },
        'ROB': { label: '⚔️ ASALTO TÁCTICO', color: '#ff8800', isPositive: null },
        'ADMIN_ADJUST': { label: '⚙️ AJUSTE MANDO', color: '#ffffff', isPositive: null }
    };

    tbody.innerHTML = transactions.map(t => {
        const tagInfo = TYPE_TAGS[t.type] || { label: t.type, color: '#ffffff', isPositive: null };
        const isPos = tagInfo.isPositive !== null ? tagInfo.isPositive : (t.amount >= 0);
        const sign = isPos ? '+' : '-';
        const amountColor = isPos ? 'var(--usmc-green)' : 'var(--usmc-red)';
        const avatarSrc = t.avatar ? t.avatar : 'https://cdn.discordapp.com/embed/avatars/0.png';
        const dateStr = new Date(t.timestamp).toLocaleString();

        return `
            <tr>
                <td style="text-align: center;">
                    <input type="checkbox" class="audit-row-checkbox" value="${t.id}" style="cursor: pointer; accent-color: var(--usmc-green); width: 16px; height: 16px;" onchange="updateAuditSelectedState()">
                </td>
                <td style="font-family: var(--font-mono); color: #728c75;">#${t.id}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${avatarSrc}" style="width: 26px; height: 26px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                        <div>
                            <div style="font-weight: bold; color: #fff; font-size: 0.85rem;">${t.username}</div>
                            <div style="font-size: 0.75rem; color: #728c75; font-family: var(--font-mono);">${t.discord_id}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="status-badge" style="background: rgba(255,255,255,0.06); color: ${tagInfo.color}; border: 1px solid ${tagInfo.color}; font-size: 0.75rem;">
                        ${tagInfo.label}
                    </span>
                </td>
                <td style="font-weight: bold; font-family: var(--font-mono); font-size: 0.95rem; color: ${amountColor};">
                    ${sign}${sym}${Math.abs(t.amount).toLocaleString()}
                </td>
                <td style="color: #c0d8c4; font-size: 0.85rem;">${t.details || 'Sin detalle complementario'}</td>
                <td style="font-size: 0.8rem; color: #728c75; font-family: var(--font-mono);">${dateStr}</td>
                <td style="text-align: right;">
                    <div style="display: inline-flex; gap: 6px; justify-content: flex-end;">
                        <button class="btn-retro" style="font-size: 0.75rem; padding: 3px 8px;" onclick="viewSoldierFinancialProfile('${t.discord_id}')">
                            🔍 INSPECCIONAR
                        </button>
                        <button class="btn-retro danger" style="font-size: 0.75rem; padding: 3px 8px;" title="Eliminar registro #${t.id}" onclick="deleteSingleAuditLog(${t.id})">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    updateAuditSelectedState();
}

function toggleSelectAllAudit(masterCheckbox) {
    TerminalFX.playKeyClick();
    const checkboxes = document.querySelectorAll('.audit-row-checkbox');
    checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
    updateAuditSelectedState();
}

function updateAuditSelectedState() {
    const checkboxes = document.querySelectorAll('.audit-row-checkbox');
    const checkedBoxes = document.querySelectorAll('.audit-row-checkbox:checked');
    const btnDelete = document.getElementById('btn-delete-selected-audit');
    const countSpan = document.getElementById('selected-audit-count');
    const masterCheck = document.getElementById('audit-select-all');

    const count = checkedBoxes.length;
    if (countSpan) countSpan.textContent = count;

    if (btnDelete) {
        btnDelete.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    if (masterCheck && checkboxes.length > 0) {
        masterCheck.checked = (count === checkboxes.length);
    }
}

async function deleteSingleAuditLog(id) {
    TerminalFX.playKeyClick();
    if (!confirm(`¿CONFIRMAS ELIMINAR EL REGISTRO CONTABLE #${id}?\nEsta acción no se puede deshacer.`)) return;

    try {
        const res = await fetch(`/api/admin/economy/transactions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            TerminalFX.playBeepSuccess();
            loadAuditoriaData();
        } else {
            alert(data.message || 'Error al eliminar el registro contable.');
        }
    } catch (err) {
        console.error('[Error al borrar log]:', err);
        alert('Fallo de conexión al eliminar el registro.');
    }
}

async function deleteSelectedAuditLogs() {
    TerminalFX.playKeyClick();
    const checkedBoxes = Array.from(document.querySelectorAll('.audit-row-checkbox:checked'));
    const ids = checkedBoxes.map(cb => parseInt(cb.value, 10)).filter(id => !isNaN(id));

    if (ids.length === 0) {
        alert('No hay registros seleccionados para eliminar.');
        return;
    }

    if (!confirm(`¿CONFIRMAS ELIMINAR LOS ${ids.length} REGISTROS CONTABLES SELECCIONADOS?\nEsta acción es irreversible.`)) return;

    try {
        const res = await fetch('/api/admin/economy/transactions/delete-batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ ids })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            TerminalFX.playBeepSuccess();
            loadAuditoriaData();
        } else {
            alert(data.message || 'Error al eliminar los registros seleccionados.');
        }
    } catch (err) {
        console.error('[Error al borrar seleccionados]:', err);
        alert('Fallo de conexión al eliminar los registros seleccionados.');
    }
}

async function clearAllAuditLogs() {
    TerminalFX.playKeyClick();
    const confirmMsg = "⚠️ ¡ADVERTENCIA MILITAR DE PURGA!\n\n¿Estás completamente seguro de que deseas VACIAR y ELIMINAR TODOS los registros contables del libro de auditoría?\n\nEsta operación borrará el historial de transacciones de forma permanente.";
    if (!confirm(confirmMsg)) return;

    const doubleConfirm = prompt("Escribe 'ELIMINAR' para confirmar la purga completa del libro de auditoría:");
    if (doubleConfirm !== 'ELIMINAR') {
        alert("Operación cancelada. No se ha modificado ningún registro.");
        return;
    }

    try {
        const res = await fetch('/api/admin/economy/transactions', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            TerminalFX.playBeepSuccess();
            alert(`✅ ${data.message || 'Libro de auditoría vaciado correctamente.'}`);
            loadAuditoriaData();
        } else {
            alert(data.message || 'Error al vaciar el libro contable.');
        }
    } catch (err) {
        console.error('[Error al vaciar libro]:', err);
        alert('Fallo de conexión al vaciar los registros.');
    }
}

async function viewSoldierFinancialProfile(discordId) {
    try {
        const res = await fetch(`/api/admin/economy/user/${discordId}/financial-profile`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (!res.ok) throw new Error('No se pudo cargar el perfil financiero.');

        const data = await res.json();
        const p = data.profile;
        const sym = globalEcoSettings.currency_symbol || '$';
        const avatarSrc = p.account.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const modalContent = document.getElementById('financial-modal-content');
        let txRows = (p.recentTransactions || []).map(t => {
            const isPos = t.amount >= 0;
            const sign = isPos ? '+' : '-';
            const col = isPos ? 'var(--usmc-green)' : 'var(--usmc-red)';
            return `
                <tr>
                    <td style="font-size: 0.8rem; color: #728c75;">${new Date(t.timestamp).toLocaleDateString()} ${new Date(t.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                    <td style="font-size: 0.8rem; font-weight: bold; color: #fff;">${t.type}</td>
                    <td style="font-weight: bold; color: ${col}; font-family: var(--font-mono);">${sign}${sym}${Math.abs(t.amount).toLocaleString()}</td>
                    <td style="font-size: 0.8rem; color: #a0baa4;">${t.details}</td>
                </tr>
            `;
        }).join('');

        if (!txRows || txRows.length === 0) txRows = `<tr><td colspan="4" style="text-align: center; color: #728c75;">Sin transacciones recientes registradas.</td></tr>`;

        modalContent.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;">
                <img src="${avatarSrc}" style="width: 55px; height: 55px; border-radius: 8px; border: 2px solid var(--usmc-gold);" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                <div>
                    <h3 style="color: #fff; margin: 0; font-family: var(--font-tech); font-size: 1.2rem;">${p.account.username || 'Combatiente USMC'}</h3>
                    <div style="font-size: 0.8rem; color: var(--usmc-gold); font-family: var(--font-mono);">${p.account.discord_id}</div>
                </div>
            </div>

            <div class="telemetry-grid" style="margin-bottom: 20px;">
                <div class="telemetry-card">
                    <div class="telemetry-label">CARTERA ACTUAL (EFECTIVO)</div>
                    <div class="telemetry-value green">${sym}${(p.account.wallet || 0).toLocaleString()}</div>
                </div>
                <div class="telemetry-card">
                    <div class="telemetry-label">CAJA FUERTE (BANCO)</div>
                    <div class="telemetry-value amber">${sym}${(p.account.bank || 0).toLocaleString()}</div>
                </div>
                <div class="telemetry-card">
                    <div class="telemetry-label">TOTAL HISTÓRICO GANADO</div>
                    <div class="telemetry-value" style="color: #00ccff;">${sym}${(p.totalEarned || 0).toLocaleString()}</div>
                </div>
                <div class="telemetry-card">
                    <div class="telemetry-label">TOTAL HISTÓRICO GASTADO</div>
                    <div class="telemetry-value" style="color: var(--usmc-red);">${sym}${(p.totalSpent || 0).toLocaleString()}</div>
                </div>
                <div class="telemetry-card">
                    <div class="telemetry-label">ÍTEMS EN MOCHILA</div>
                    <div class="telemetry-value">${p.itemsCount || 0}</div>
                </div>
            </div>

            <h4 style="color: var(--usmc-gold); font-family: var(--font-tech); margin-bottom: 8px;">
                📜 CÓMO HA USADO SU DINERO (ÚLTIMOS MOVIMIENTOS):
            </h4>
            <div class="retro-table-wrapper" style="max-height: 250px; overflow-y: auto;">
                <table class="retro-table">
                    <thead>
                        <tr>
                            <th>FECHA</th>
                            <th>OPERACIÓN</th>
                            <th>IMPORTE</th>
                            <th>DETALLE / DESTINO</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${txRows}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('financial-profile-modal').style.display = 'block';
        TerminalFX.playBeepSuccess();
    } catch (err) {
        alert(err.message);
    }
}

function closeFinancialModal() {
    document.getElementById('financial-profile-modal').style.display = 'none';
}

function renderEventHistory(data) {
    const tbody = document.getElementById('event-history-tbody');
    const pagination = document.getElementById('event-history-pagination');
    const history = data.history || [];
    eventHistoryPage = data.page || 1;
    const sym = globalEcoSettings.currency_symbol || '$';

    if (history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #728c75;">Sin operaciones en los archivos históricos.</td></tr>`;
    } else {
        tbody.innerHTML = history.map(ev => {
            const dateStr = new Date(ev.created_at).toLocaleString();
            return `
                <tr>
                    <td style="font-family: var(--font-mono); color: var(--usmc-gold);">#${ev.id}</td>
                    <td style="font-weight: bold; color: #fff;">${escapeEventText(ev.name)}</td>
                    <td><span class="status-badge" style="background: rgba(0,204,255,0.15); color: var(--usmc-blue);">${escapeEventText(ev.event_type)}</span></td>
                    <td><span class="status-badge" style="background: ${ev.status === 'ACTIVE' ? 'rgba(56,229,77,0.15)' : 'rgba(212,175,55,0.15)'}; color: ${ev.status === 'ACTIVE' ? 'var(--usmc-green)' : 'var(--usmc-gold)'};">${escapeEventText(ev.status)}</span></td>
                    <td style="font-size: 0.8rem; color: #8fa892;">${dateStr}</td>
                    <td style="text-align: center;">${ev.total_attendees}</td>
                    <td style="text-align: center; color: var(--usmc-green); font-weight: bold;">${ev.eligible_count}</td>
                    <td style="text-align: center; color: var(--usmc-gold);">${ev.claimed_count}</td>
                    <td style="font-weight: bold; color: #fff;">${sym}${(ev.total_paid || 0).toLocaleString()}</td>
                    <td style="text-align: right;">
                        <div style="display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap;">
                            <button class="btn-retro" style="font-size: 0.72rem; padding: 4px 8px;" onclick="showEventRoster(${ev.id})">👥 VER ROSTER</button>
                            ${ev.status === 'ACTIVE'
                                ? '<span style="color: #728c75; font-size: 0.75rem; align-self: center;">EN CURSO</span>'
                                : `<button class="btn-retro danger" style="font-size: 0.72rem; padding: 4px 8px;" onclick="deleteEventRecord(${ev.id})">🗑️ BORRAR</button>`}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const totalPages = data.totalPages || 1;
    pagination.innerHTML = `
        <button class="btn-retro" style="min-width: 110px;" onclick="loadEventsData(${eventHistoryPage - 1})" ${eventHistoryPage <= 1 ? 'disabled' : ''}>◀ ANTERIOR</button>
        <span style="min-width: 190px; text-align: center; color: var(--usmc-gold); font-family: var(--font-mono);">PÁGINA ${eventHistoryPage} / ${totalPages} &bull; ${data.total || 0} EVENTOS</span>
        <button class="btn-retro" style="min-width: 110px;" onclick="loadEventsData(${eventHistoryPage + 1})" ${eventHistoryPage >= totalPages ? 'disabled' : ''}>SIGUIENTE ▶</button>
    `;
}

function escapeEventText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[char]);
}

function formatEventRecordDate(value, unixFallback = null) {
    const date = value ? new Date(value) : (unixFallback ? new Date(unixFallback * 1000) : null);
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '--';
}

async function showEventRoster(eventId, page = 1) {
    const modal = document.getElementById('event-roster-modal');
    const content = document.getElementById('event-roster-modal-content');
    modal.style.display = 'block';
    content.innerHTML = `<div style="padding: 30px; text-align: center; color: #728c75;">Cargando página ${page} del roster...</div>`;

    try {
        const res = await fetch(`/api/admin/events/${eventId}/attendees?page=${page}&limit=10`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'No se pudo cargar el roster.');

        const event = data.event;
        const attendees = data.attendees || [];
        const currentPage = data.page || 1;
        const totalPages = data.totalPages || 1;
        const totalRecords = data.total || 0;
        const sym = globalEcoSettings.currency_symbol || '$';
        const rows = attendees.map(attendee => {
            const statusColors = {
                CONFIRMED: 'var(--usmc-green)',
                REGISTERED: '#00ccff',
                EXPELLED: '#ff5555',
                CANCELLED: '#9aa79c',
                PRESENT: 'var(--usmc-amber)'
            };
            const status = attendee.status || 'PRESENT';
            const paid = attendee.claimed === 1
                ? `${sym}${(attendee.payout_amount || 0).toLocaleString()}`
                : '--';
            return `
                <tr>
                    <td style="font-weight: bold; color: #fff;">${escapeEventText(attendee.username || 'Sin nombre')}</td>
                    <td style="font-family: var(--font-mono); font-size: 0.78rem;">${escapeEventText(attendee.discord_id)}</td>
                    <td><span class="status-badge" style="color: ${statusColors[status] || '#fff'};">${escapeEventText(status)}</span></td>
                    <td style="text-align: center;">${attendee.attendance_confirmed === 1 ? '✅ SÍ' : '—'}</td>
                    <td style="text-align: center;">${Math.floor((attendee.total_seconds_present || 0) / 60)} min / ${attendee.message_count || 0} msgs</td>
                    <td style="font-size: 0.78rem; color: #8fa892;">${formatEventRecordDate(attendee.registered_at, attendee.first_seen)}</td>
                    <td style="font-weight: bold; color: ${attendee.claimed === 1 ? 'var(--usmc-gold)' : '#728c75'};">${paid}</td>
                </tr>
            `;
        }).join('');

        content.innerHTML = `
            <div style="margin-bottom: 16px; border-left: 3px solid var(--usmc-gold); padding-left: 12px;">
                <h3 style="margin: 0 0 5px; color: #fff; font-family: var(--font-tech);">${escapeEventText(event.name)} [#${event.id}]</h3>
                <div style="font-size: 0.8rem; color: #8fa892;">${escapeEventText(event.event_type)} &bull; ${escapeEventText(event.status)} &bull; ${totalRecords} registro(s), incluidos retirados y cancelados</div>
            </div>
            <div class="retro-table-wrapper" style="max-height: 60vh; overflow: auto;">
                <table class="retro-table">
                    <thead><tr><th>USUARIO</th><th>DISCORD ID</th><th>ESTADO</th><th>CONFIRMÓ</th><th>PRESENCIA</th><th>REGISTRO</th><th>PAGO</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="7" style="text-align:center; color:#728c75;">Este evento no tiene participantes registrados.</td></tr>'}</tbody>
                </table>
            </div>
            <div style="display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 14px;">
                <button class="btn-retro" style="min-width: 110px;" onclick="showEventRoster(${event.id}, ${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>◀ ANTERIOR</button>
                <span style="min-width: 120px; text-align: center; color: var(--usmc-gold); font-family: var(--font-mono);">PÁGINA ${currentPage} / ${totalPages}</span>
                <button class="btn-retro" style="min-width: 110px;" onclick="showEventRoster(${event.id}, ${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>SIGUIENTE ▶</button>
            </div>
        `;
    } catch (err) {
        TerminalFX.playBeepError();
        content.innerHTML = `<div style="padding: 25px; color: #ff5555; text-align: center;">${escapeEventText(err.message)}</div>`;
    }
}

function closeEventRosterModal() {
    document.getElementById('event-roster-modal').style.display = 'none';
}

async function deleteEventRecord(eventId) {
    const confirmed = confirm(`¿BORRAR PERMANENTEMENTE EL EVENTO #${eventId}?\n\nTambién se eliminarán todos sus registros de asistencia. Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/admin/events/${eventId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (!res.ok) {
            TerminalFX.playBeepError();
            return alert(`❌ ${data.message || 'No se pudo borrar el evento.'}`);
        }

        TerminalFX.playBeepSuccess();
        alert(`✅ ${data.message}`);
        loadEventsData();
    } catch (err) {
        TerminalFX.playBeepError();
        alert(`❌ ${err.message}`);
    }
}
