// =========================================================================
// MÓDULO JAVASCRIPT: OPERACIONES Y PAGOS AUTOMÁTICOS (VOZ & CHAT)
// =========================================================================
let currentActiveEvent = null;
let eventHistoryPage = 1;

async function loadEventsData(historyPage = eventHistoryPage) {
    try {
        // 1. Cargar Evento Activo
        const resActive = await fetch('/api/admin/events/active', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (resActive.ok) {
            const data = await resActive.json();
            renderActiveEventSection(data);
        }

        // 2. Cargar Historial
        const resHist = await fetch(`/api/admin/events/history?page=${historyPage}&limit=10`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (resHist.ok) {
            const data = await resHist.json();
            renderEventHistory(data);
        }
    } catch (err) {
        console.error('[Error cargando eventos]:', err);
    }
}

function renderActiveEventSection(data) {
    const container = document.getElementById('event-active-container');
    const sym = globalEcoSettings.currency_symbol || '$';

    if (data.has_active && data.event) {
        currentActiveEvent = data.event;
        const attendees = data.attendees || [];
        const stats = data.stats || {};
        const durationMinutes = Math.floor((Date.now() - new Date(data.event.created_at).getTime()) / 60000);

        let phaseText = '🔴 OPERACIÓN TÁCTICA EN VIVO';
        if (data.event.phase === 'REGISTRATION') {
            phaseText = '📋 FASE DE CONVOCATORIA & REGISTRO PREVIO';
        } else if (data.event.phase === 'ENDED') {
            phaseText = '✅ OPERACIÓN FINALIZADA Y LIQUIDADA';
        }

        let attendeesRows = attendees.map(a => {
            let statusBadge = data.event.event_type === 'REGISTRATION'
                ? '<span class="status-badge aprobado">✅ EN LISTA FINAL</span>'
                : '<span class="status-badge" style="background: rgba(0,180,216,0.15); color: #00b4d8; border: 1px solid #00b4d8;">📝 DETECTADO</span>';
            if (a.claimed === 1) {
                statusBadge = `<span class="status-badge aprobado">💵 COBRADO (${sym}${a.payout_amount})</span>`;
            } else if (a.attendance_confirmed === 1 || a.is_eligible === 1) {
                statusBadge = '<span class="status-badge aprobado">✅ ASISTENCIA CONFIRMADA</span>';
            }

            const avatarSrc = a.avatar ? a.avatar : 'https://cdn.discordapp.com/embed/avatars/0.png';
            return `
                <tr>
                    <td style="color: var(--usmc-gold); font-family: var(--font-mono);">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <img src="${avatarSrc}" style="width: 28px; height: 28px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                            <span>${a.discord_id}</span>
                        </div>
                    </td>
                    <td style="font-weight: bold; color: #fff;">${a.username}</td>
                    <td>${statusBadge}</td>
                    <td style="color: var(--usmc-green);">${Math.floor(a.total_seconds_present / 60)} min / ${a.message_count} msgs</td>
                    <td style="font-size: 0.8rem; color: #8fa892;">${a.attendance_confirmed_at ? new Date(a.attendance_confirmed_at).toLocaleTimeString() : (a.registered_at ? new Date(a.registered_at).toLocaleTimeString() : '--')}</td>
                    <td style="text-align: right;">
                        <button class="btn-retro danger" style="font-size: 0.75rem; padding: 4px 8px;" onclick="expelEventAttendee('${a.discord_id}')">
                            🗑️ Retirar
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (attendees.length === 0) {
            attendeesRows = `<tr><td colspan="6" style="text-align: center; color: #728c75;">Ningún combatiente registrado aún en esta operación militar.</td></tr>`;
        }

        container.innerHTML = `
            <div class="retro-window" style="border-color: var(--usmc-gold); padding: 20px; margin-bottom: 25px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                            <span class="led-indicator led-green" style="animation: blink 1s infinite;"></span>
                            <h3 style="color: #fff; font-family: var(--font-tech); font-size: 1.3rem; margin: 0;">
                                ${data.event.name.toUpperCase()} [#${data.event.id}]
                            </h3>
                        </div>
                        <span class="status-badge" style="font-size: 0.8rem; padding: 4px 10px;">${phaseText}</span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <button class="btn-retro" style="font-size: 0.8rem; padding: 6px 12px; border-color: #00b4d8;" onclick="deployRegistrationToDiscord()">
                            📢 ENVIAR REGISTRO A DISCORD
                        </button>
                        <button class="btn-retro danger" style="font-size: 0.8rem; padding: 6px 12px;" onclick="finishActiveEvent()">
                            🏁 FINALIZAR Y PAGAR
                        </button>
                    </div>
                </div>

                <div class="telemetry-grid" style="margin-bottom: 20px;">
                    <div class="telemetry-card">
                        <div class="telemetry-label">MODALIDAD / FASE</div>
                        <div class="telemetry-value" style="font-size: 1.1rem; color: #00b4d8;">${data.event.event_type} (${data.event.phase || 'ACTIVA'})</div>
                    </div>
                    <div class="telemetry-card">
                        <div class="telemetry-label">PAGA BASE PROGRAMADA</div>
                        <div class="telemetry-value green">${sym}${data.event.base_reward.toLocaleString()}</div>
                    </div>
                    <div class="telemetry-card">
                        <div class="telemetry-label">INSCRITOS / DETECTADOS</div>
                        <div class="telemetry-value amber">${attendees.length} ${data.event.max_participants > 0 ? `/ ${data.event.max_participants}` : ''}</div>
                    </div>
                    <div class="telemetry-card">
                        <div class="telemetry-label">APROBADOS EN LISTA</div>
                        <div class="telemetry-value green">${data.event.event_type === 'REGISTRATION' ? attendees.length : (stats.confirmed || attendees.filter(a => a.attendance_confirmed === 1 || a.is_eligible === 1).length)}</div>
                    </div>
                    <div class="telemetry-card">
                        <div class="telemetry-label">PAGOS COBRADOS</div>
                        <div class="telemetry-value" style="color: var(--usmc-gold);">${stats.claimed || attendees.filter(a => a.claimed === 1).length}</div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="color: var(--usmc-green); font-family: var(--font-tech); margin: 0;">
                        👥 ROSTER FINAL DE COMBATIENTES (RETIRA AUSENTES ANTES DE PAGAR):
                    </h4>
                    <button class="btn-retro" style="font-size: 0.75rem; padding: 4px 10px;" onclick="loadEventsData()">
                        🔄 REFRESCAR LISTA
                    </button>
                </div>
                <div class="retro-table-wrapper" style="max-height: 280px; overflow-y: auto;">
                    <table class="retro-table">
                        <thead>
                            <tr>
                                <th>SOLDADO / IDENTIDAD</th>
                                <th>TAG DISCORD</th>
                                <th>ESTADO EN LISTA</th>
                                <th>TIEMPO / MENSAJES</th>
                                <th>HORA REGISTRO</th>
                                <th style="text-align: right;">AJUSTE MANUAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${attendeesRows}
                        </tbody>
                </table>
            </div>
        </div>
        `;
    } else {
        currentActiveEvent = null;
        const voiceChannels = (guildResources && guildResources.voice_channels) || [];
        const textChannels = (guildResources && guildResources.text_channels) || (guildResources && guildResources.channels) || [];

        const targetChannelOptions = `
            <optgroup label="Canales de Texto (Convocatoria / Chat)">
                ${textChannels.map(c => `<option value="${c.id}"># ${c.name} (Texto)</option>`).join('')}
            </optgroup>
            <optgroup label="Canales de Voz">
                ${voiceChannels.map(c => `<option value="${c.id}">🔊 ${c.name} (Voz)</option>`).join('')}
            </optgroup>
        `;

        container.innerHTML = `
            <div class="retro-window" style="padding: 22px; margin-bottom: 25px;">
                <h4 style="color: #fff; font-family: var(--font-tech); font-size: 1.1rem; margin-bottom: 15px;">
                    🎯 CONFIGURAR Y LANZAR NUEVA OPERACIÓN MILITAR DE PAGO
                </h4>
                <form id="launch-event-form">
                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">NOMBRE DE LA OPERACIÓN O REUNIÓN:</label>
                            <input type="text" id="ev-name" class="retro-input" placeholder="Ej: Maniobras Militares Alfa - Asistencia Obligatoria" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">MODALIDAD DE OPERACIÓN:</label>
                            <select id="ev-type" class="retro-select">
                                <option value="REGISTRATION" selected>📋 CONVOCATORIA & LISTA FINAL (Pago automático)</option>
                                <option value="VOICE">🔊 CANAL DE VOZ (Permanencia de audio automatizada)</option>
                                <option value="TEXT">💬 CANAL DE CHAT (Participación en texto)</option>
                                <option value="HYBRID">🎖️ HÍBRIDO (Voz + Mensaje de confirmación)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <div class="form-group">
                            <label class="form-label">CANAL DE CONVOCATORIA / ASISTENCIA:</label>
                            <select id="ev-target-channel" class="retro-select" required>
                                <option value="">-- SELECCIONAR CANAL DE DISCORD --</option>
                                ${targetChannelOptions}
                            </select>
                            <p class="form-help">Canal de Discord donde se registrarán o estarán los soldados.</p>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px;">
                        <div class="form-group">
                            <label class="form-label">PAGA BASE ($):</label>
                            <input type="number" id="ev-base-reward" class="retro-input" value="1000" min="1" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">CUPO MÁXIMO (0 = SIN LÍMITE):</label>
                            <input type="number" id="ev-max-participants" class="retro-input" value="0" min="0" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">TOLERANCIA (MIN):</label>
                            <input type="number" id="ev-grace-minutes" class="retro-input" value="5" min="0" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">% MÍNIMO PERMANENCIA:</label>
                            <input type="number" id="ev-min-percent" class="retro-input" value="80" min="10" max="100" required>
                        </div>
                    </div>

                    <div class="btn-command-group" style="margin-top: 15px;">
                        <button type="submit" class="btn-retro primary" style="padding: 12px 24px; font-size: 1rem;">
                            🔴 INICIAR OPERACIÓN MILITAR
                        </button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('launch-event-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                name: document.getElementById('ev-name').value.trim(),
                event_type: document.getElementById('ev-type').value,
                target_channel_id: document.getElementById('ev-target-channel').value,
                registration_channel_id: document.getElementById('ev-target-channel').value,
                confirmation_channel_id: document.getElementById('ev-target-channel').value,
                base_reward: parseInt(document.getElementById('ev-base-reward').value, 10),
                max_participants: parseInt(document.getElementById('ev-max-participants').value, 10) || 0,
                grace_period_minutes: parseInt(document.getElementById('ev-grace-minutes').value, 10),
                min_attendance_percent: parseInt(document.getElementById('ev-min-percent').value, 10)
            };

            try {
                const res = await fetch('/api/admin/events/start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${adminToken}`
                    },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    TerminalFX.playBeepSuccess();
                    loadEventsData();
                } else {
                    const errData = await res.json();
                    TerminalFX.playBeepError();
                    alert(`ERROR: ${errData.message || 'No se pudo iniciar la operación'}`);
                }
            } catch (err) {
                alert(err.message);
            }
        });
    }
}

async function deployRegistrationToDiscord() {
    if (!currentActiveEvent) return;
    try {
        const res = await fetch('/api/admin/events/deploy-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ channel_id: currentActiveEvent.target_channel_id })
        });
        const data = await res.json();
        if (res.ok) {
            TerminalFX.playBeepSuccess();
            alert(`✅ ${data.message}`);
            loadEventsData();
        } else {
            alert(`❌ ${data.message}`);
        }
    } catch (e) { alert(e.message); }
}

async function expelEventAttendee(discordId) {
    if (!currentActiveEvent) return;
    if (!confirm(`¿RETIRAR A ${discordId} DEL ROSTER? No recibirá la paga al finalizar.`)) return;
    try {
        const res = await fetch(`/api/admin/events/attendance/${encodeURIComponent(discordId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            TerminalFX.playBeepSuccess();
            loadEventsData();
        } else {
            const data = await res.json();
            alert(`❌ ${data.message}`);
        }
    } catch (e) { alert(e.message); }
}

async function finishActiveEvent() {
    if (!confirm("¿CONFIRMAS FINALIZAR Y PAGAR? Todos los combatientes que permanezcan aprobados en la lista recibirán los créditos inmediatamente.")) return;
    try {
        const res = await fetch('/api/admin/events/end', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            TerminalFX.playBeepSuccess();
            const currencySymbol = globalEcoSettings.currency_symbol || '$';
            alert(`¡OPERACIÓN FINALIZADA Y PAGADA!\nSoldados pagados: ${data.summary?.paidCount || 0}\nTotal desembolsado: ${currencySymbol}${(data.summary?.totalDistributed || 0).toLocaleString()}`);
            loadEventsData();
        } else {
            const errData = await res.json();
            TerminalFX.playBeepError();
            alert(`ERROR: ${errData.message || 'Error al concluir evento'}`);
        }
    } catch (err) {
        alert(err.message);
    }
}
