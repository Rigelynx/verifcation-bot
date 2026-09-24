// =========================================================================
// MÓDULO JAVASCRIPT: ECONOMÍA MILITAR
// =========================================================================
let allEconomyAccounts = [];
let globalEcoSettings = { currency_symbol: '$' };
let economyAccountsPage = 0;
let economyAccountsTotal = 0;
const economyAccountsPageSize = 25;

async function loadEconomyData() {
    try {
        // 1. Cargar Settings
        const resSettings = await fetch('/api/admin/economy/settings', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (resSettings.ok) {
            const data = await resSettings.json();
            if (data.settings) {
                globalEcoSettings = data.settings;
                document.getElementById('eco-currency-name').value = data.settings.currency_name || 'Créditos USMC';
                document.getElementById('eco-currency-symbol').value = data.settings.currency_symbol || '$';
                document.getElementById('eco-starting-balance').value = data.settings.starting_balance !== undefined ? data.settings.starting_balance : 100;
                document.getElementById('eco-work-min').value = data.settings.work_min || 50;
                document.getElementById('eco-work-max').value = data.settings.work_max || 250;
                document.getElementById('eco-work-cooldown').value = data.settings.work_cooldown || 3600;
                document.getElementById('eco-crime-min').value = data.settings.crime_min || 100;
                document.getElementById('eco-crime-max').value = data.settings.crime_max || 600;
                document.getElementById('eco-crime-fail').value = data.settings.crime_fail_rate || 45;
                document.getElementById('eco-crime-cooldown').value = data.settings.crime_cooldown || 7200;
                document.getElementById('eco-rob-fail').value = data.settings.rob_fail_rate || 50;
                document.getElementById('eco-rob-cooldown').value = data.settings.rob_cooldown || 14400;

                const logChan = data.settings.log_channel_id || '';
                const inpEcoLog = document.getElementById('eco-log-channel');
                if (inpEcoLog) inpEcoLog.value = logChan;
                const pickEcoLog = document.getElementById('picker-economy-log-channel');
                if (pickEcoLog) pickEcoLog.value = logChan;
                const pickAuditLog = document.getElementById('audit-log-channel-picker');
                if (pickAuditLog) pickAuditLog.value = logChan;
            }
        }

        // 2. Cargar Cuentas paginadas
        const search = document.getElementById('eco-search-input')?.value || '';
        const resAccs = await fetch(`/api/admin/economy/accounts?limit=${economyAccountsPageSize}&offset=${economyAccountsPage * economyAccountsPageSize}&search=${encodeURIComponent(search)}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (resAccs.ok) {
            const data = await resAccs.json();
            allEconomyAccounts = data.accounts || [];
            economyAccountsTotal = data.total || 0;
            renderEconomyAccounts();
        }

        // 3. Cargar Datos y Configuración de Bonos Militares
        await loadBonusData();
    } catch (err) {
        console.error('[Error cargando economía]:', err);
    }
}

function renderEconomyAccounts() {
    const tbody = document.getElementById('eco-accounts-tbody');
    const sym = globalEcoSettings.currency_symbol || '$';
    const filtered = allEconomyAccounts;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #728c75;">Sin cuentas financieras encontradas.</td></tr>`;
        renderEconomyAccountsPagination();
        return;
    }

    tbody.innerHTML = filtered.map(a => {
        const name = a.username ? a.username : `Combatiente <@${a.discord_id}>`;
        const avatar = a.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
        return `
            <tr>
                <td style="font-family: var(--font-mono); color: var(--usmc-gold);">${a.discord_id}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${avatar}" style="width: 28px; height: 28px; border-radius: 4px; border: 1px solid var(--border-light); object-fit: cover;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                        <span style="font-weight: bold; color: #fff;">${name}</span>
                    </div>
                </td>
                <td style="color: var(--usmc-green);">${sym}${a.wallet.toLocaleString()}</td>
                <td style="color: var(--usmc-blue);">${sym}${a.bank.toLocaleString()}</td>
                <td style="font-weight: bold; color: #fff;">${sym}${(a.wallet + a.bank).toLocaleString()}</td>
                <td style="text-align: right; white-space: nowrap;">
                    <button class="btn-retro" style="padding: 4px 8px; font-size: 0.8rem; border-color: var(--usmc-gold); color: var(--usmc-gold); margin-right: 4px;" 
                        onclick="openDirectBonusModal('${a.discord_id}')">
                        🎁 BONO
                    </button>
                    <button class="btn-retro amber" style="padding: 4px 8px; font-size: 0.8rem;" 
                        onclick="openBalanceModal('${a.discord_id}', '${(a.username || a.discord_id).replace(/'/g, "\\'")}')">
                        ⚙️ AJUSTAR SALDO
                    </button>
                    <button class="btn-retro danger" style="padding: 4px 8px; font-size: 0.8rem;" onclick="deleteEconomyAccount('${a.discord_id}', '${(a.username || a.discord_id).replace(/'/g, "\\'")}')" title="Eliminar cuenta e inventario">
                        🗑️ BORRAR
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    renderEconomyAccountsPagination();
}

function searchEconomyAccounts() {
    economyAccountsPage = 0;
    loadEconomyData();
}

function renderEconomyAccountsPagination() {
    const el = document.getElementById('eco-accounts-pagination');
    if (!el) return;
    const pages = Math.max(1, Math.ceil(economyAccountsTotal / economyAccountsPageSize));
    const current = economyAccountsPage + 1;
    el.innerHTML = `<button class="btn-retro" ${current <= 1 ? 'disabled' : ''} onclick="changeEconomyAccountsPage(-1)">◀ ANTERIOR</button><span style="color: var(--usmc-gold);">PÁGINA ${current} / ${pages} · ${economyAccountsTotal} CUENTAS</span><button class="btn-retro" ${current >= pages ? 'disabled' : ''} onclick="changeEconomyAccountsPage(1)">SIGUIENTE ▶</button>`;
}

function changeEconomyAccountsPage(delta) {
    const pages = Math.max(1, Math.ceil(economyAccountsTotal / economyAccountsPageSize));
    economyAccountsPage = Math.min(Math.max(economyAccountsPage + delta, 0), pages - 1);
    loadEconomyData();
}

async function deleteEconomyAccount(discordId, name) {
    TerminalFX.playKeyClick();
    if (!confirm(`¿ELIMINAR LA CUENTA DE ${name} (${discordId})?\\n\\nSe eliminará su cuenta e inventario. El historial contable se conservará. Esta acción no se puede deshacer.`)) return;
    const confirmId = prompt(`Escribe exactamente el Discord ID para confirmar:\\n${discordId}`);
    if (confirmId !== discordId) return alert('Operación cancelada: el Discord ID no coincide.');
    const res = await fetch(`/api/admin/economy/accounts/${discordId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    if (res.ok && data.success) { TerminalFX.playBeepSuccess(); economyAccountsPage = 0; loadEconomyData(); }
    else alert(data.message || 'No se pudo eliminar la cuenta.');
}

// Guardar Settings Economía
document.getElementById('economy-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        currency_name: document.getElementById('eco-currency-name').value.trim(),
        currency_symbol: document.getElementById('eco-currency-symbol').value.trim(),
        starting_balance: parseInt(document.getElementById('eco-starting-balance').value, 10),
        work_min: parseInt(document.getElementById('eco-work-min').value, 10),
        work_max: parseInt(document.getElementById('eco-work-max').value, 10),
        work_cooldown: parseInt(document.getElementById('eco-work-cooldown').value, 10),
        crime_min: parseInt(document.getElementById('eco-crime-min').value, 10),
        crime_max: parseInt(document.getElementById('eco-crime-max').value, 10),
        crime_fail_rate: parseInt(document.getElementById('eco-crime-fail').value, 10),
        crime_cooldown: parseInt(document.getElementById('eco-crime-cooldown').value, 10),
        rob_fail_rate: parseInt(document.getElementById('eco-rob-fail').value, 10),
        rob_cooldown: parseInt(document.getElementById('eco-rob-cooldown').value, 10),
        log_channel_id: document.getElementById('eco-log-channel').value.trim() || null
    };

    try {
        const res = await fetch('/api/admin/economy/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const data = await res.json();
            globalEcoSettings = data.settings;
            TerminalFX.playBeepSuccess();
            alert("PARÁMETROS DE ECONOMÍA MILITAR ACTUALIZADOS CON ÉXITO.");
            renderEconomyAccounts();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL GUARDAR PARÁMETROS DE ECONOMÍA.");
        }
    } catch (err) {
        alert(err.message);
    }
});

// Modal Ajustar Saldo
function openBalanceModal(discordId, name) {
    TerminalFX.playKeyClick();
    document.getElementById('bal-target-id').value = discordId || '';
    document.getElementById('bal-target-name').value = name ? `${name} (${discordId})` : (discordId ? discordId : 'Ingreso manual por ID');
    document.getElementById('bal-amount').value = '';
    document.getElementById('balance-modal').style.display = 'flex';
}

function closeBalanceModal() {
    document.getElementById('balance-modal').style.display = 'none';
}

document.getElementById('balance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const discordId = document.getElementById('bal-target-id').value.trim();
    const action = document.getElementById('bal-action').value;
    const target = document.getElementById('bal-target').value;
    const amount = parseInt(document.getElementById('bal-amount').value, 10);

    if (!discordId) {
        alert("Debes indicar un Discord ID válido.");
        return;
    }
    if (!Number.isInteger(amount) || amount < 0) {
        alert("El monto debe ser un número entero igual o mayor que 0.");
        return;
    }
    if (!confirm(`¿CONFIRMAS ${action.toUpperCase()} ${globalEcoSettings.currency_symbol || '$'}${amount.toLocaleString()} en ${target === 'bank' ? 'BANCO' : 'CARTERA'} para ${discordId}?`)) return;

    try {
        const res = await fetch('/api/admin/economy/accounts/quick-adjust', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ discordId, action, target, amount })
        });
        if (res.ok) {
            TerminalFX.playBeepSuccess();
            closeBalanceModal();
            loadEconomyData();
        } else {
            TerminalFX.playBeepError();
            const err = await res.json().catch(() => ({}));
            alert("ERROR AL AJUSTAR SALDO: " + (err.message || 'Fallo en la operación contable.'));
        }
    } catch (err) {
        alert(err.message);
    }
});

// =========================================================================
// MÓDULO JAVASCRIPT: PANEL Y DISTRIBUCIÓN DE BONOS MILITARES
// =========================================================================
let currentBonusData = null;

async function loadBonusData() {
    try {
        const res = await fetch('/api/admin/economy/bonus', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            currentBonusData = data;
            renderBonusSettings(data.panel, data.stats);
            renderBonusPanelsTable();
        }
    } catch (err) {
        console.error('[Error cargando bonos]:', err);
    }
}

function renderBonusSettings(panel, stats) {
    if (!panel) return;
    const elId = document.getElementById('bonus-panel-id');
    if (elId) elId.value = panel.id || '';

    const elTitle = document.getElementById('bonus-panel-title');
    if (elTitle) elTitle.value = panel.title || '';
    const elAmt = document.getElementById('bonus-panel-amount');
    if (elAmt) elAmt.value = panel.amount || 500;
    const elDesc = document.getElementById('bonus-panel-desc');
    if (elDesc) elDesc.value = panel.description || '';
    const elMode = document.getElementById('bonus-panel-mode');
    if (elMode) elMode.value = panel.claim_mode || 'ONCE';
    const elCd = document.getElementById('bonus-panel-cooldown-hours');
    if (elCd) elCd.value = Math.round((panel.cooldown_seconds || 86400) / 3600);
    const elLbl = document.getElementById('bonus-panel-btn-label');
    if (elLbl) elLbl.value = panel.button_label || 'RECLAMAR BONO MILITAR';
    const elEmj = document.getElementById('bonus-panel-btn-emoji');
    if (elEmj) elEmj.value = panel.button_emoji || '🎁';

    const elChan = document.getElementById('bonus-panel-channel');
    if (elChan && panel.channel_id) {
        elChan.value = panel.channel_id;
    }

    toggleBonusCooldownInput();

    if (stats) {
        const elClaims = document.getElementById('stat-bonus-claims');
        if (elClaims) elClaims.textContent = stats.totalClaims || 0;
        const elDist = document.getElementById('stat-bonus-distributed');
        if (elDist) elDist.textContent = `$${(stats.totalDistributed || 0).toLocaleString()}`;
        const elModeLbl = document.getElementById('stat-bonus-mode-label');
        if (elModeLbl) {
            elModeLbl.textContent = panel.claim_mode === 'ONCE' 
                ? 'UNA SOLA VEZ' 
                : `CADA ${Math.round((panel.cooldown_seconds || 86400) / 3600)} HORAS`;
        }
    }
}

function cancelEditingBonus() {
    TerminalFX.playKeyClick();
    const elId = document.getElementById('bonus-panel-id');
    if (elId) elId.value = '';

    const banner = document.getElementById('bonus-panel-editing-banner');
    if (banner) banner.style.display = 'none';

    const btnSave = document.getElementById('btn-save-bonus-config');
    if (btnSave) btnSave.innerHTML = '💾 GUARDAR PANEL';

    if (currentBonusData && currentBonusData.panel) {
        renderBonusSettings(currentBonusData.panel, currentBonusData.stats);
    }
}

function toggleBonusCooldownInput() {
    const modeEl = document.getElementById('bonus-panel-mode');
    if (!modeEl) return;
    const mode = modeEl.value;
    const grp = document.getElementById('group-bonus-cooldown');
    if (grp) {
        grp.style.display = mode === 'COOLDOWN' ? 'block' : 'none';
    }
}

async function saveBonusConfig() {
    const panelId = document.getElementById('bonus-panel-id')?.value;
    const title = document.getElementById('bonus-panel-title').value.trim();
    const amount = parseInt(document.getElementById('bonus-panel-amount').value, 10);
    const description = document.getElementById('bonus-panel-desc').value.trim();
    const claim_mode = document.getElementById('bonus-panel-mode').value;
    const hours = parseInt(document.getElementById('bonus-panel-cooldown-hours').value, 10) || 24;
    const cooldown_seconds = hours * 3600;
    const button_label = document.getElementById('bonus-panel-btn-label').value.trim();
    const button_emoji = document.getElementById('bonus-panel-btn-emoji').value.trim();
    const channel_id = document.getElementById('bonus-panel-channel').value;

    const payload = {
        title,
        amount,
        description,
        claim_mode,
        cooldown_seconds,
        button_label,
        button_emoji,
        channel_id
    };
    if (panelId) {
        payload.id = parseInt(panelId, 10);
    }

    try {
        const res = await fetch('/api/admin/economy/bonus/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            TerminalFX.playBeepSuccess();
            alert(`CONFIGURACIÓN DEL PANEL DE BONO ${panelId ? '#' + panelId : ''} ACTUALIZADA CON ÉXITO.`);
            await loadBonusData();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL GUARDAR CONFIGURACIÓN DE BONOS.");
        }
    } catch (err) {
        alert(err.message);
    }
}

async function deployBonusPanel() {
    const channelId = document.getElementById('bonus-panel-channel').value;
    if (!channelId) {
        alert("Debes seleccionar un canal de Discord para publicar el panel.");
        return;
    }

    const panelId = document.getElementById('bonus-panel-id')?.value || (currentBonusData?.panel?.id);

    try {
        TerminalFX.playKeyClick();
        await saveBonusConfig();

        const res = await fetch('/api/admin/economy/bonus/deploy-panel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ channelId, panelId: panelId ? parseInt(panelId, 10) : undefined })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            TerminalFX.playBeepSuccess();
            alert(`¡PANEL DE BONO MILITAR ${panelId ? '#' + panelId : ''} DESPLEGADO EXITOSAMENTE EN DISCORD!`);
            await loadBonusData();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL DESPLEGAR PANEL: " + (data.message || 'Error desconocido.'));
        }
    } catch (err) {
        alert(err.message);
    }
}

function openDirectBonusModal(discordId = '') {
    TerminalFX.playKeyClick();
    document.getElementById('direct-bonus-user-id').value = discordId;
    document.getElementById('direct-bonus-target-type').value = 'USER';
    toggleDirectBonusTargetInput();
    document.getElementById('direct-bonus-modal').style.display = 'flex';
}

function closeDirectBonusModal() {
    document.getElementById('direct-bonus-modal').style.display = 'none';
}

function toggleDirectBonusTargetInput() {
    const type = document.getElementById('direct-bonus-target-type').value;
    const grp = document.getElementById('group-direct-bonus-user');
    if (grp) {
        grp.style.display = type === 'USER' ? 'block' : 'none';
    }
}

async function submitDirectBonus() {
    const type = document.getElementById('direct-bonus-target-type').value;
    const target = type === 'ALL' ? 'ALL' : document.getElementById('direct-bonus-user-id').value.trim();
    const amount = parseInt(document.getElementById('direct-bonus-amount').value, 10);
    const destination = document.getElementById('direct-bonus-destination').value;
    const reason = document.getElementById('direct-bonus-reason').value.trim();

    if (type === 'USER' && !target) {
        alert("Debes ingresar el Discord ID del combatiente.");
        return;
    }

    try {
        const res = await fetch('/api/admin/economy/bonus/distribute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                target,
                amount,
                destination,
                reason
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            TerminalFX.playBeepSuccess();
            alert(data.message || "BONO CONCEDIDO CON ÉXITO.");
            closeDirectBonusModal();
            loadEconomyData();
            loadBonusData();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL EMITIR BONIFICACIÓN: " + (data.message || 'Fallo contable.'));
        }
    } catch (err) {
        alert(err.message);
    }
}

// =========================================================================
// MÓDULO JAVASCRIPT: GESTIÓN DE BONOS (CREAR / ELIMINAR / RESETEAR)
// =========================================================================

function renderBonusPanelsTable() {
    const tbody = document.getElementById('bonus-panels-tbody');
    if (!tbody || !currentBonusData) return;
    const panels = currentBonusData.panels || [];
    const sym = globalEcoSettings.currency_symbol || '$';

    if (panels.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #728c75;">No hay bonos militares creados. Usa el botón <strong>"➕ CREAR NUEVO BONO"</strong> para comenzar.</td></tr>';
        return;
    }

    tbody.innerHTML = panels.map(p => {
        const statusBtn = p.is_active
            ? `<button type="button" class="btn-retro" style="padding: 2px 7px; font-size: 0.72rem; border-color: #38e54d; color: #38e54d;" onclick="toggleBonusActive(${p.id}, true)" title="Haz clic para suspender este bono">🟢 ACTIVO</button>`
            : `<button type="button" class="btn-retro" style="padding: 2px 7px; font-size: 0.72rem; border-color: #ff4444; color: #ff4444;" onclick="toggleBonusActive(${p.id}, false)" title="Haz clic para activar este bono">🔴 PAUSADO</button>`;
        const modeLabel = p.claim_mode === 'ONCE' ? '🔒 Única vez' : `⏱️ Cada ${Math.round((p.cooldown_seconds || 86400) / 3600)}h`;
        const channelLabel = p.channel_id ? `<span style="color: #afffba; font-family: monospace;">#${p.channel_id}</span>` : '<span style="color: #728c75;">Sin canal</span>';
        const safeTitle = (p.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return `
            <tr>
                <td style="color: var(--usmc-gold); font-weight: bold;">#${p.id}</td>
                <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${p.title}">${p.title}</td>
                <td style="color: #38e54d; font-weight: bold;">${sym}${(p.amount || 0).toLocaleString()}</td>
                <td>${modeLabel}</td>
                <td style="text-align: center; font-weight: bold;">${p.total_claims || 0}</td>
                <td style="color: #ffa500;">${sym}${(p.total_distributed || 0).toLocaleString()}</td>
                <td>${channelLabel}</td>
                <td>${statusBtn}</td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
                        <button type="button" class="btn-retro" style="padding: 3px 7px; font-size: 0.72rem;" onclick="editBonusInForm(${p.id})" title="Cargar en el editor superior">
                            ✏️ EDITAR
                        </button>
                        <button type="button" class="btn-retro primary" style="padding: 3px 7px; font-size: 0.72rem;" onclick="openDeployBonusModal(${p.id}, '${safeTitle}')" title="Desplegar directamente en un canal de Discord">
                            🚀 DESPLEGAR
                        </button>
                        <button type="button" class="btn-retro" style="padding: 3px 7px; font-size: 0.72rem; border-color: #ffa500; color: #ffa500;" onclick="resetBonusClaims(${p.id}, '${safeTitle}')"
                            title="Reiniciar reclamos para que todos puedan volver a cobrar">
                            🔄 RESET
                        </button>
                        <button type="button" class="btn-retro danger" style="padding: 3px 7px; font-size: 0.72rem;" onclick="deleteBonus(${p.id}, '${safeTitle}')" title="Eliminar bono y todo su historial permanentemente">
                            🗑️ BORRAR
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openCreateBonusModal() {
    TerminalFX.playKeyClick();
    document.getElementById('create-bonus-title').value = '';
    document.getElementById('create-bonus-amount').value = 500;
    document.getElementById('create-bonus-mode').value = 'ONCE';
    document.getElementById('create-bonus-cooldown').value = 24;
    document.getElementById('create-bonus-desc').value = '';
    const elChan = document.getElementById('create-bonus-channel');
    if (elChan) elChan.value = '';
    toggleCreateBonusCooldown();
    document.getElementById('create-bonus-modal').style.display = 'flex';
}

function closeCreateBonusModal() {
    document.getElementById('create-bonus-modal').style.display = 'none';
}

function toggleCreateBonusCooldown() {
    const mode = document.getElementById('create-bonus-mode').value;
    document.getElementById('group-create-bonus-cooldown').style.display = mode === 'COOLDOWN' ? 'block' : 'none';
}

async function submitCreateBonus() {
    const title = document.getElementById('create-bonus-title').value.trim();
    const amount = parseInt(document.getElementById('create-bonus-amount').value, 10);
    const claim_mode = document.getElementById('create-bonus-mode').value;
    const hours = parseInt(document.getElementById('create-bonus-cooldown').value, 10) || 24;
    const description = document.getElementById('create-bonus-desc').value.trim();
    const channelId = document.getElementById('create-bonus-channel')?.value;

    if (!title) { alert('Debes ingresar un título para el bono.'); return; }
    if (!amount || amount < 1) { alert('El monto debe ser mayor a 0.'); return; }

    try {
        const res = await fetch('/api/admin/economy/bonus/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                title,
                amount,
                claim_mode,
                cooldown_seconds: hours * 3600,
                description: description || 'Asignación financiera especial autorizada por el Estado Mayor USMC.',
                is_active: true
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            TerminalFX.playBeepSuccess();

            // Si se seleccionó canal para desplegar de inmediato
            if (channelId) {
                const depRes = await fetch('/api/admin/economy/bonus/deploy-panel', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${adminToken}`
                    },
                    body: JSON.stringify({ channelId, panelId: data.panel.id })
                });
                const depData = await depRes.json().catch(() => ({}));
                if (depRes.ok && depData.success) {
                    alert(`¡BONO MILITAR #${data.panel.id} CREADO Y PUBLICADO EN DISCORD EXITOSAMENTE!`);
                } else {
                    alert(`¡BONO MILITAR #${data.panel.id} CREADO!\n\nAviso: No se pudo publicar automáticamente en Discord: ${depData.message || 'Error de canal'}`);
                }
            } else {
                alert(`¡BONO MILITAR #${data.panel.id} CREADO CON ÉXITO!\n\nCada soldado puede cobrarlo de forma independiente sin conflicto con bonos anteriores.\nPuedes desplegarlo usando el botón "🚀 DESPLEGAR" de la lista.`);
            }

            closeCreateBonusModal();
            await loadBonusData();
        } else {
            TerminalFX.playBeepError();
            alert('ERROR AL CREAR BONO: ' + (data.message || 'Error desconocido.'));
        }
    } catch (err) {
        alert(err.message);
    }
}

function openDeployBonusModal(panelId, title) {
    TerminalFX.playKeyClick();
    document.getElementById('deploy-bonus-modal-panel-id').value = panelId;
    const desc = document.getElementById('deploy-bonus-modal-desc');
    if (desc) desc.textContent = `Desplegar el bono #${panelId} ("${title}") con botón interactivo de cobro en el canal seleccionado:`;
    document.getElementById('deploy-bonus-modal').style.display = 'flex';
}

function closeDeployBonusModal() {
    document.getElementById('deploy-bonus-modal').style.display = 'none';
}

async function submitDeployBonusModal() {
    const panelId = document.getElementById('deploy-bonus-modal-panel-id').value;
    const channelId = document.getElementById('deploy-bonus-modal-channel').value;

    if (!channelId) {
        alert("Debes seleccionar un canal militar de texto.");
        return;
    }

    try {
        TerminalFX.playKeyClick();
        const res = await fetch('/api/admin/economy/bonus/deploy-panel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ channelId, panelId: parseInt(panelId, 10) })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            TerminalFX.playBeepSuccess();
            alert(`¡PANEL DE BONO MILITAR #${panelId} DESPLEGADO EXITOSAMENTE EN DISCORD!`);
            closeDeployBonusModal();
            await loadBonusData();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL DESPLEGAR PANEL: " + (data.message || 'Error desconocido.'));
        }
    } catch (err) {
        alert(err.message);
    }
}

async function toggleBonusActive(id, currentActive) {
    try {
        TerminalFX.playKeyClick();
        const res = await fetch('/api/admin/economy/bonus/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ id, is_active: !currentActive })
        });

        if (res.ok) {
            TerminalFX.playBeepSuccess();
            await loadBonusData();
        } else {
            TerminalFX.playBeepError();
            alert('No se pudo cambiar el estado del bono.');
        }
    } catch (err) {
        alert(err.message);
    }
}

async function deleteBonus(id, title) {
    if (!confirm(`⚠️ ¿ELIMINAR BONO #${id} "${title}"?\n\nEsto eliminará el bono Y todo su historial de reclamos permanentemente.\nLos fondos ya concedidos NO se revierten.`)) return;

    try {
        TerminalFX.playKeyClick();
        const res = await fetch(`/api/admin/economy/bonus/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        const data = await res.json();
        if (res.ok && data.success) {
            TerminalFX.playBeepSuccess();
            alert(data.message || `Bono #${id} eliminado.`);
            // Si estábamos editando este bono, salir del modo edición
            if (document.getElementById('bonus-panel-id')?.value == id) {
                cancelEditingBonus();
            }
            await loadBonusData();
        } else {
            TerminalFX.playBeepError();
            alert('ERROR: ' + (data.message || 'No se pudo eliminar.'));
        }
    } catch (err) {
        alert(err.message);
    }
}

async function resetBonusClaims(id, title) {
    if (!confirm(`🔄 ¿REINICIAR RECLAMOS del bono #${id} "${title}"?\n\nTodos los soldados podrán volver a reclamar este bono sin importar cuándo lo hayan cobrado antes.`)) return;

    try {
        TerminalFX.playKeyClick();
        const res = await fetch(`/api/admin/economy/bonus/${id}/reset-claims`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        const data = await res.json();
        if (res.ok && data.success) {
            TerminalFX.playBeepSuccess();
            alert(data.message || `Reclamos del bono #${id} reiniciados.`);
            await loadBonusData();
        } else {
            TerminalFX.playBeepError();
            alert('ERROR: ' + (data.message || 'No se pudieron reiniciar.'));
        }
    } catch (err) {
        alert(err.message);
    }
}

function editBonusInForm(panelId) {
    if (!currentBonusData || !currentBonusData.panels) return;
    const panel = currentBonusData.panels.find(p => p.id === panelId);
    if (!panel) { alert('Bono no encontrado.'); return; }

    TerminalFX.playKeyClick();
    renderBonusSettings(panel, {
        totalClaims: panel.total_claims || 0,
        totalDistributed: panel.total_distributed || 0
    });

    // Activar banner de edición
    const banner = document.getElementById('bonus-panel-editing-banner');
    if (banner) banner.style.display = 'flex';
    const txt = document.getElementById('bonus-panel-editing-text');
    if (txt) txt.textContent = `EDITANDO BONO MILITAR #${panel.id} — "${panel.title}"`;
    const btnSave = document.getElementById('btn-save-bonus-config');
    if (btnSave) btnSave.innerHTML = `💾 GUARDAR CAMBIOS (BONO #${panel.id})`;

    // Scroll hacia el formulario
    const form = document.getElementById('bonus-panel-form');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// =========================================================================
// MÓDULO JAVASCRIPT: ARMERÍA Y TIENDA (SHOP) ESTILO UNBELIEVABOAT
// =========================================================================
let allShopItems = [];

async function loadShopData() {
    try {
        const res = await fetch('/api/admin/shop/items', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            allShopItems = data.items || [];
            renderShopItems();
        }
    } catch (err) {
        console.error('[Error cargando tienda]:', err);
    }
}

function renderShopItems() {
    const container = document.getElementById('shop-items-list');
    const sym = globalEcoSettings.currency_symbol || '$';

    if (allShopItems.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: rgba(10, 16, 11, 0.5); border: 1px dashed var(--border-light);">
                <p style="color: #728c75; font-size: 1rem;">No hay ningún suministro ni rol registrado en la armería.</p>
                <button class="btn-retro primary" style="margin-top: 15px;" onclick="openShopModal()">➕ AGREGAR PRIMER ÍTEM</button>
            </div>
        `;
        return;
    }

    container.innerHTML = allShopItems.map(item => {
        let rolesBadges = '';
        if (item.roles_to_give && item.roles_to_give.length > 0) {
            rolesBadges += `<div style="font-size: 0.75rem; color: var(--usmc-green); margin-top: 4px;">➕ Otorga Rol: <strong>${item.roles_to_give.map(r => getRoleNameById(r)).join(', ')}</strong></div>`;
        }
        if (item.roles_to_remove && item.roles_to_remove.length > 0) {
            rolesBadges += `<div style="font-size: 0.75rem; color: var(--usmc-red); margin-top: 2px;">➖ Retira Rol: <strong>${item.roles_to_remove.map(r => getRoleNameById(r)).join(', ')}</strong></div>`;
        }
        if (item.required_roles && item.required_roles.length > 0) {
            rolesBadges += `<div style="font-size: 0.75rem; color: var(--usmc-amber); margin-top: 2px;">🔒 Requiere: <strong>${item.required_roles.map(r => getRoleNameById(r)).join(', ')}</strong></div>`;
        }

        const stockText = item.stock === -1 ? 'Ilimitado' : `${item.stock} uds`;
        const maxUserText = item.max_per_user === -1 ? 'Sin límite' : `${item.max_per_user} máx/persona`;
        const activeBadge = item.is_active ? '<span class="status-badge aprobado">ACTIVO</span>' : '<span class="status-badge rechazado">DESACTIVADO</span>';

        return `
            <div class="retro-window" style="padding: 16px; margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div style="font-size: 2rem;">${item.icon || '🎖️'}</div>
                        <div>${activeBadge}</div>
                    </div>
                    <h4 style="color: #fff; font-family: var(--font-tech); font-size: 1.1rem; margin-bottom: 4px;">[#${item.id}] ${item.name}</h4>
                    <div style="font-size: 1.2rem; font-weight: bold; color: var(--usmc-gold); margin-bottom: 8px;">
                        ${sym}${item.price.toLocaleString()}
                    </div>
                    <p style="font-size: 0.8rem; color: #8fa892; margin-bottom: 8px;">${item.description || 'Sin descripción adicional.'}</p>
                    ${rolesBadges}
                    <div style="font-size: 0.75rem; color: #728c75; margin-top: 10px; border-top: 1px dashed var(--border-light); padding-top: 6px;">
                        📦 Stock: <strong>${stockText}</strong> &bull; 👤 Límite: <strong>${maxUserText}</strong>
            </div>
        </div>
                <div style="display: flex; gap: 8px; margin-top: 15px;">
                    <button class="btn-retro" style="flex: 1; padding: 6px; font-size: 0.8rem; justify-content: center;" onclick="editShopItem(${item.id})">✏️ EDITAR</button>
                    <button class="btn-retro danger" style="padding: 6px 10px; font-size: 0.8rem;" onclick="deleteShopItem(${item.id})">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function getRoleNameById(roleId) {
    if (guildResources && guildResources.roles) {
        const found = guildResources.roles.find(r => r.id === roleId);
        if (found) return found.name;
    }
    return roleId;
}

function openShopModal(itemId = null) {
    TerminalFX.playKeyClick();
    const form = document.getElementById('shop-form');
    form.reset();
    document.getElementById('shop-item-id').value = '';

    if (itemId) {
        const item = allShopItems.find(i => i.id === itemId);
        if (item) {
            document.getElementById('shop-modal-title').textContent = `ARMERÍA // EDITAR ÍTEM #${item.id}`;
            document.getElementById('shop-item-id').value = item.id;
            document.getElementById('shop-item-icon').value = item.icon || '🎖️';
            document.getElementById('shop-item-name').value = item.name;
            document.getElementById('shop-item-price').value = item.price;
            document.getElementById('shop-item-desc').value = item.description || '';
            document.getElementById('shop-item-stock').value = item.stock;
            document.getElementById('shop-item-max-user').value = item.max_per_user;
            document.getElementById('shop-item-active').value = item.is_active ? '1' : '0';
            document.getElementById('shop-item-reply').value = item.custom_reply || '';

            document.getElementById('shop-role-give').value = (item.roles_to_give && item.roles_to_give[0]) || '';
            document.getElementById('shop-role-remove').value = (item.roles_to_remove && item.roles_to_remove[0]) || '';
            document.getElementById('shop-role-required').value = (item.required_roles && item.required_roles[0]) || '';
            document.getElementById('shop-role-blocked').value = (item.blocked_roles && item.blocked_roles[0]) || '';
        }
    } else {
        document.getElementById('shop-modal-title').textContent = 'ARMERÍA // NUEVO SUMINISTRO O RANGO';
        document.getElementById('shop-item-icon').value = '🎖️';
        document.getElementById('shop-item-stock').value = '-1';
        document.getElementById('shop-item-max-user').value = '1';
        document.getElementById('shop-item-active').value = '1';
    }

    document.getElementById('shop-modal').style.display = 'flex';
}

function closeShopModal() {
    document.getElementById('shop-modal').style.display = 'none';
}

function editShopItem(id) {
    openShopModal(id);
}

async function deleteShopItem(id) {
    if (!confirm(`¿CONFIRMAS DAR DE BAJA EL ÍTEM #${id} DE LA ARMERÍA?`)) return;
    try {
        const res = await fetch(`/api/admin/shop/items/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Error al eliminar ítem.');
        }

        if (data.requiresConfirmation) {
            const buyerListText = (data.buyers || []).map(b => `• ${b.name} (Cant: ${b.quantity})`).join('\n');
            const warningMsg = `⚠️ ¡ADVERTENCIA DE INTENDENCIA MILITAR!\n\n` +
                `El ítem [${data.itemName || '#' + id}] ya ha sido adquirido por ${data.buyerCount} soldado(s):\n\n` +
                `${buyerListText}\n\n` +
                `¿Estás COMPLETAMENTE SEGURO de que deseas eliminarlo de la armería y retirarlo de las mochilas de los reclutas?`;

            if (!confirm(warningMsg)) return;

            const forceRes = await fetch(`/api/admin/shop/items/${id}?force=true`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            const forceData = await forceRes.json();
            if (forceData.success) {
                TerminalFX.playBeepSuccess();
                alert('✅ Ítem dado de baja e inventarios actualizados correctamente.');
                loadShopData();
            } else {
                alert(forceData.message || 'Error al forzar la baja del ítem.');
            }
            return;
        }

        if (data.success) {
            TerminalFX.playBeepSuccess();
            loadShopData();
        }
    } catch (err) {
        alert(`❌ ${err.message}`);
    }
}

document.getElementById('shop-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('shop-item-id').value;
    
    const roleGive = document.getElementById('shop-role-give').value;
    const roleRemove = document.getElementById('shop-role-remove').value;
    const roleRequired = document.getElementById('shop-role-required').value;
    const roleBlocked = document.getElementById('shop-role-blocked').value;

    const payload = {
        icon: document.getElementById('shop-item-icon').value.trim() || '🎖️',
        name: document.getElementById('shop-item-name').value.trim(),
        price: parseInt(document.getElementById('shop-item-price').value, 10),
        description: document.getElementById('shop-item-desc').value.trim(),
        roles_to_give: roleGive ? [roleGive] : [],
        roles_to_remove: roleRemove ? [roleRemove] : [],
        required_roles: roleRequired ? [roleRequired] : [],
        blocked_roles: roleBlocked ? [roleBlocked] : [],
        stock: parseInt(document.getElementById('shop-item-stock').value, 10),
        max_per_user: parseInt(document.getElementById('shop-item-max-user').value, 10),
        is_active: document.getElementById('shop-item-active').value === '1' ? 1 : 0,
        custom_reply: document.getElementById('shop-item-reply').value.trim()
    };

    const url = id ? `/api/admin/shop/items/${id}` : '/api/admin/shop/items';
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
            closeShopModal();
            loadShopData();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL GUARDAR ÍTEM EN LA ARMERÍA.");
        }
    } catch (err) {
        alert(err.message);
    }
});

// =========================================================================
// MÓDULO JAVASCRIPT: BONIFICACIONES Y MULTIPLICADORES POR ROL
// =========================================================================
let allRoleRewards = [];

async function loadRoleRewards() {
    try {
        const res = await fetch('/api/admin/economy/roles', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            allRoleRewards = data.rewards || [];
            renderRoleRewards();
        }
    } catch (err) {
        console.error('[Error cargando roles rewards]:', err);
    }
}

function renderRoleRewards() {
    const tbody = document.getElementById('role-rewards-tbody');
    const sym = globalEcoSettings.currency_symbol || '$';

    if (allRoleRewards.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #728c75;">Sin roles bonificadores registrados. Todos reciben la paga base estándar (1.0x).</td></tr>`;
        return;
    }

    tbody.innerHTML = allRoleRewards.map(r => `
        <tr>
            <td style="font-weight: bold; color: #fff;">
                <span class="status-badge pendiente" style="margin-right: 6px;">🎖️</span>
                ${r.role_name} <span style="color: #728c75; font-size: 0.8rem;">(ID: ${r.role_id})</span>
            </td>
            <td style="color: var(--usmc-green); font-weight: bold;">${r.multiplier}x</td>
            <td style="color: var(--usmc-gold); font-weight: bold;">+${sym}${r.flat_bonus.toLocaleString()}</td>
            <td style="text-align: right;">
                <button class="btn-retro danger" style="padding: 4px 8px; font-size: 0.8rem;" onclick="deleteRoleReward(${r.id})">
                    🗑️ ELIMINAR
                </button>
            </td>
        </tr>
    `).join('');
}

document.getElementById('role-reward-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const select = document.getElementById('reward-role-select');
    const roleId = select.value;
    const roleName = select.options[select.selectedIndex]?.text.split(' (ID:')[0] || 'Rol Militar';

    if (!roleId) {
        alert("DEBES SELECCIONAR UN ROL DE DISCORD.");
        return;
    }

    const payload = {
        role_id: roleId,
        role_name: roleName,
        multiplier: parseFloat(document.getElementById('reward-multiplier').value) || 1.0,
        flat_bonus: parseInt(document.getElementById('reward-flat-bonus').value, 10) || 0
    };

    try {
        const res = await fetch('/api/admin/economy/roles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            TerminalFX.playBeepSuccess();
            loadRoleRewards();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL ASIGNAR BONIFICACIÓN POR ROL.");
        }
    } catch (err) {
        alert(err.message);
    }
});

async function deleteRoleReward(id) {
    if (!confirm("¿ELIMINAR ESTA BONIFICACIÓN DE ROL?")) return;
    try {
        const res = await fetch(`/api/admin/economy/roles/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            TerminalFX.playBeepSuccess();
            loadRoleRewards();
        }
    } catch (err) {
        alert(err.message);
    }
}
