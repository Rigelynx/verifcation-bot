// =========================================================================
// MÓDULO JAVASCRIPT: OPERACIONES Y PAGOS AUTOMÁTICOS (VOZ & CHAT)
// =========================================================================
let currentActiveEvent = null;
let eventHistoryPage = 1;
let eventReportTemplates = [];
let eventTemplateEditorOpen = false;
let eventTemplateEditingId = null;

function escapeEventTemplateText(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
}

async function loadEventsData(historyPage = eventHistoryPage) {
    try {
        const resTemplates = await fetch('/api/admin/events/templates', { headers: { 'Authorization': `Bearer ${adminToken}` } });
        if (resTemplates.ok) {
            const templateData = await resTemplates.json();
            eventReportTemplates = templateData.templates || [];
            renderEventTemplateManager();
        }
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

function showEventTemplateNotice(message, type = 'success') {
    let notice = document.getElementById('event-template-notice');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'event-template-notice';
        notice.className = 'event-template-notice';
        document.body.appendChild(notice);
    }
    notice.className = `event-template-notice ${type}`;
    notice.textContent = message;
    notice.classList.add('visible');
    clearTimeout(notice.hideTimer);
    notice.hideTimer = setTimeout(() => notice.classList.remove('visible'), 3500);
}

function openEventTemplateEditor(id = null) {
    eventTemplateEditorOpen = true;
    eventTemplateEditingId = id;
    renderEventTemplateManager();
    requestAnimationFrame(() => document.getElementById('event-template-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function closeEventTemplateEditor() {
    eventTemplateEditorOpen = false;
    eventTemplateEditingId = null;
    renderEventTemplateManager();
}

function renderEventTemplateManager() {
    const container = document.getElementById('event-template-manager');
    if (!container) return;
    if (!eventReportTemplates.length && !eventTemplateEditorOpen) eventTemplateEditorOpen = true;
    const editing = eventTemplateEditingId ? eventReportTemplates.find(item => item.id === eventTemplateEditingId) : null;
    const roles = guildResources.roles || [];
    const channels = guildResources.text_channels || guildResources.channels || [];
    const stickers = guildResources.stickers || [];
    const selectedRoles = new Set((editing?.group_roles || []).map(group => String(group.role_id)));
    const selectedStickerMissing = editing?.sticker_id && !stickers.some(sticker => String(sticker.id) === String(editing.sticker_id));
    const channelName = channelId => channels.find(channel => String(channel.id) === String(channelId))?.name || 'Canal al finalizar';
    const groupingLabels = { STATUS: 'Por asistencia', LIST: 'Lista única', ROLES: 'Por unidades' };
    const cards = eventReportTemplates.map(template => `
        <article class="event-template-card" style="--template-color:${template.color || '#1a7f4b'}">
            <div class="event-template-card-head">
                <span class="event-template-card-icon">${escapeEventTemplateText(template.emoji || '🎖️')}</span>
                <div><strong>${escapeEventTemplateText(template.name)}</strong><small>PLANTILLA #${template.id}</small></div>
            </div>
            <div class="event-template-card-title">${escapeEventTemplateText(template.title)}</div>
            <div class="event-template-tags">
                <span>📌 ${escapeEventTemplateText(groupingLabels[template.grouping_mode] || template.grouping_mode)}</span>
                <span>#️⃣ ${escapeEventTemplateText(channelName(template.report_channel_id))}</span>
                <span>${template.evidence_required ? '📸 Evidencia obligatoria' : '📷 Evidencia opcional'}</span>
                ${template.sticker_id ? '<span>🎟️ Con sticker</span>' : ''}
            </div>
            <div class="event-template-card-actions">
                <button class="btn-retro primary" type="button" onclick="openEventTemplateEditor(${template.id})">✏️ EDITAR</button>
                <button class="btn-retro danger" type="button" onclick="archiveEventTemplate(${template.id})">🗃️ ARCHIVAR</button>
            </div>
        </article>`).join('') || `
        <div class="event-template-empty">
            <div>📜</div><strong>Crea tu primera plantilla</strong>
            <span>Define una sola vez el diseño del acta y reutilízalo en futuras operaciones.</span>
        </div>`;

    const editor = !eventTemplateEditorOpen ? '' : `
        <section id="event-template-editor" class="event-template-editor">
            <div class="event-template-editor-heading">
                <div>
                    <span class="event-template-step">CONFIGURACIÓN GUIADA</span>
                    <h4>${editing ? `✏️ EDITAR PLANTILLA #${editing.id}` : '➕ CREAR NUEVA PLANTILLA'}</h4>
                    <p>Completa los datos y revisa a la derecha cómo se verá el acta en Discord.</p>
                </div>
                ${eventReportTemplates.length ? '<button type="button" class="btn-retro" onclick="closeEventTemplateEditor()">✕ CERRAR</button>' : ''}
            </div>
            <div class="event-template-editor-grid">
                <form id="event-template-form" class="event-template-form">
                    <input type="hidden" id="tpl-id" value="${editing?.id || ''}">
                    <div class="event-template-form-grid two">
                        <div class="form-group"><label class="form-label">1. NOMBRE PARA IDENTIFICARLA <span class="req-star">*</span></label><input id="tpl-name" class="retro-input" maxlength="80" required value="${escapeEventTemplateText(editing?.name || '')}" placeholder="Ej: Patrullaje oficial"><p class="form-help">Solo lo verán los administradores.</p></div>
                        <div class="form-group"><label class="form-label">2. TÍTULO QUE VERÁ DISCORD <span class="req-star">*</span></label><input id="tpl-title" class="retro-input" maxlength="120" required value="${escapeEventTemplateText(editing?.title || 'REGISTRO DE OPERACIÓN')}" placeholder="REGISTRO DE OPERACIÓN"></div>
                    </div>
                    <div class="event-template-form-grid compact">
                        <div class="form-group"><label class="form-label">EMOJI</label><input id="tpl-emoji" class="retro-input" maxlength="16" value="${escapeEventTemplateText(editing?.emoji || '🎖️')}" aria-label="Emoji del acta"></div>
                        <div class="form-group"><label class="form-label">COLOR</label><input id="tpl-color" type="color" class="retro-input event-template-color" value="${editing?.color || '#1a7f4b'}" aria-label="Color del acta"></div>
                        <div class="form-group"><label class="form-label">EVIDENCIA</label><select id="tpl-evidence" class="retro-select"><option value="0">Opcional</option><option value="1" ${editing?.evidence_required ? 'selected' : ''}>Obligatoria</option></select></div>
                    </div>
                    <div class="form-group"><label class="form-label">3. MENSAJE DE INTRODUCCIÓN</label><textarea id="tpl-description" class="retro-textarea" maxlength="500" placeholder="Ej: El Estado Mayor deja constancia de la operación realizada.">${escapeEventTemplateText(editing?.description || '')}</textarea><p class="form-help"><span id="tpl-description-count">0</span>/500 caracteres</p></div>
                    <div class="event-template-form-grid two">
                        <div class="form-group"><label class="form-label">4. CANAL DONDE SE PUBLICARÁ</label><select id="tpl-channel" class="retro-select"><option value="">Usar el canal donde se finalice</option>${channels.map(c => `<option value="${c.id}" ${String(editing?.report_channel_id || '') === String(c.id) ? 'selected' : ''}># ${escapeEventTemplateText(c.name)}</option>`).join('')}</select><p class="form-help">Puedes dejarlo automático.</p></div>
                        <div class="form-group"><label class="form-label">5. CÓMO ORDENAR ASISTENTES</label><select id="tpl-grouping" class="retro-select"><option value="STATUS" ${(!editing || editing?.grouping_mode === 'STATUS') ? 'selected' : ''}>Aprobados y retirados</option><option value="LIST" ${editing?.grouping_mode === 'LIST' ? 'selected' : ''}>Una sola lista</option><option value="ROLES" ${editing?.grouping_mode === 'ROLES' ? 'selected' : ''}>Agrupar por roles / unidades</option></select></div>
                    </div>
                    <div id="tpl-role-section" class="form-group">
                        <label class="form-label">UNIDADES QUE APARECERÁN EN EL ACTA</label>
                        <p class="form-help">Marca hasta 6 roles. Una persona aparecerá en la primera unidad que coincida.</p>
                        <div id="tpl-role-options" class="event-role-grid">${roles.length ? roles.map(role => `<label class="event-role-option"><input type="checkbox" name="tpl-role" value="${role.id}" ${selectedRoles.has(String(role.id)) ? 'checked' : ''}><span style="--role-color:${role.color || '#728c75'}"></span>${escapeEventTemplateText(role.name)}</label>`).join('') : '<span class="form-help">Conecta el bot a Discord para cargar los roles del servidor.</span>'}</div>
                        <div class="event-role-counter"><strong id="tpl-role-count">0</strong>/6 seleccionados</div>
                    </div>
                    <div class="event-template-form-grid two">
                        <div class="form-group"><label class="form-label">6. STICKER DEL SERVIDOR</label><select id="tpl-sticker" class="retro-select"><option value="">Sin sticker</option>${selectedStickerMissing ? `<option value="${escapeEventTemplateText(editing.sticker_id)}" selected>Sticker guardado (${escapeEventTemplateText(editing.sticker_id)})</option>` : ''}${stickers.map(sticker => `<option value="${sticker.id}" ${String(editing?.sticker_id || '') === String(sticker.id) ? 'selected' : ''}>${escapeEventTemplateText(sticker.name)}</option>`).join('')}</select><p class="form-help">Si Discord lo rechaza, el acta se publicará igualmente sin sticker.</p></div>
                        <div class="form-group"><label class="form-label">7. FIRMA / PIE DEL ACTA</label><input id="tpl-footer" class="retro-input" maxlength="200" value="${escapeEventTemplateText(editing?.footer || 'USMC • Registro Operativo Oficial')}" placeholder="USMC • Registro Operativo Oficial"></div>
                    </div>
                    <div class="event-template-savebar">
                        ${editing ? '<button class="btn-retro" type="button" onclick="closeEventTemplateEditor()">CANCELAR CAMBIOS</button>' : ''}
                        <button id="tpl-save-button" class="btn-retro primary" type="submit">💾 ${editing ? 'GUARDAR CAMBIOS' : 'CREAR PLANTILLA'}</button>
                    </div>
                </form>
                <aside class="event-template-preview-wrap">
                    <span class="event-template-step">VISTA PREVIA</span>
                    <div id="tpl-preview" class="event-template-preview" style="--preview-color:${editing?.color || '#1a7f4b'}">
                        <div class="event-template-preview-author"><span id="tpl-preview-emoji">${escapeEventTemplateText(editing?.emoji || '🎖️')}</span> ACTA AUTOMÁTICA</div>
                        <h3 id="tpl-preview-title">${escapeEventTemplateText(editing?.title || 'REGISTRO DE OPERACIÓN')}</h3>
                        <p id="tpl-preview-description">${escapeEventTemplateText(editing?.description || 'El texto de introducción aparecerá aquí.')}</p>
                        <div class="event-template-preview-data"><b>🎖️ Operación:</b> Operación de ejemplo<br><b>📅 Fecha:</b> hoy<br><b>👤 Encargado:</b> @Oficial<br><b>⏱️ Duración:</b> 45 min</div>
                        <div id="tpl-preview-groups" class="event-template-preview-field"><b>👥 ASISTENTES — 3</b><span>@Alpha &nbsp; @Bravo &nbsp; @Charlie</span></div>
                        <div class="event-template-preview-field muted"><b>❌ RETIRADOS / NO APTOS — 1</b><span>@Ausente</span></div>
                        <div id="tpl-preview-evidence" class="event-template-preview-image">📸 EVIDENCIA DE LA OPERACIÓN</div>
                        <footer id="tpl-preview-footer">${escapeEventTemplateText(editing?.footer || 'USMC • Registro Operativo Oficial')}</footer>
                    </div>
                    <div class="event-template-preview-hint"><b id="tpl-preview-channel"># ${escapeEventTemplateText(channelName(editing?.report_channel_id))}</b><span id="tpl-preview-sticker">${editing?.sticker_id ? '🎟️ Sticker incluido' : 'Sin sticker'}</span></div>
                </aside>
            </div>
        </section>`;

    container.innerHTML = `
        <div class="retro-window event-template-manager">
            <div class="event-template-manager-head">
                <div><span class="event-template-step">ACTAS AUTOMÁTICAS</span><h4>📜 PLANTILLAS DE REGISTRO</h4><p>Crea formatos reutilizables para patrullajes, entrenamientos y operaciones. Cada evento conserva su propia copia histórica.</p></div>
                <button class="btn-retro primary" type="button" onclick="openEventTemplateEditor()">➕ CREAR PLANTILLA</button>
            </div>
            <div class="event-template-grid">${cards}</div>
            ${editor}
        </div>`;
    if (eventTemplateEditorOpen) initializeEventTemplateEditor();
}

function initializeEventTemplateEditor() {
    const form = document.getElementById('event-template-form');
    if (!form) return;
    form.addEventListener('submit', saveEventTemplate);
    form.querySelectorAll('input, textarea, select').forEach(input => {
        input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', updateEventTemplatePreview);
        if (input.tagName === 'SELECT') input.addEventListener('change', updateEventTemplatePreview);
    });
    document.querySelectorAll('input[name="tpl-role"]').forEach(checkbox => checkbox.addEventListener('change', event => {
        const checked = [...document.querySelectorAll('input[name="tpl-role"]:checked')];
        if (checked.length > 6) {
            event.target.checked = false;
            showEventTemplateNotice('Puedes seleccionar un máximo de 6 unidades.', 'warning');
        }
        updateEventTemplatePreview();
    }));
    updateEventTemplatePreview();
}

function updateEventTemplatePreview() {
    const read = id => document.getElementById(id);
    const grouping = read('tpl-grouping')?.value || 'STATUS';
    const roleSection = read('tpl-role-section');
    if (roleSection) roleSection.hidden = grouping !== 'ROLES';
    const checkedRoles = [...document.querySelectorAll('input[name="tpl-role"]:checked')];
    if (read('tpl-role-count')) read('tpl-role-count').textContent = checkedRoles.length;

    const preview = read('tpl-preview');
    if (preview) preview.style.setProperty('--preview-color', read('tpl-color')?.value || '#1a7f4b');
    if (read('tpl-preview-emoji')) read('tpl-preview-emoji').textContent = read('tpl-emoji')?.value.trim() || '🎖️';
    if (read('tpl-preview-title')) read('tpl-preview-title').textContent = (read('tpl-title')?.value.trim() || 'REGISTRO DE OPERACIÓN').toUpperCase();
    const description = read('tpl-description')?.value.trim() || '';
    if (read('tpl-preview-description')) read('tpl-preview-description').textContent = description || 'El texto de introducción aparecerá aquí.';
    if (read('tpl-description-count')) read('tpl-description-count').textContent = description.length;
    if (read('tpl-preview-footer')) read('tpl-preview-footer').textContent = read('tpl-footer')?.value.trim() || 'USMC • Registro Operativo Oficial';
    const channelSelect = read('tpl-channel');
    if (read('tpl-preview-channel')) read('tpl-preview-channel').textContent = channelSelect?.value ? `# ${channelSelect.options[channelSelect.selectedIndex].textContent.replace(/^#\s*/, '')}` : '# Canal donde finalices';
    const stickerSelect = read('tpl-sticker');
    if (read('tpl-preview-sticker')) read('tpl-preview-sticker').textContent = stickerSelect?.value ? `🎟️ ${stickerSelect.options[stickerSelect.selectedIndex].textContent}` : 'Sin sticker';
    if (read('tpl-preview-evidence')) {
        const required = read('tpl-evidence')?.value === '1';
        read('tpl-preview-evidence').textContent = required ? '📸 EVIDENCIA OBLIGATORIA' : '📷 EVIDENCIA OPCIONAL';
        read('tpl-preview-evidence').classList.toggle('required', required);
    }
    if (read('tpl-preview-groups')) {
        if (grouping === 'ROLES' && checkedRoles.length) {
            read('tpl-preview-groups').innerHTML = checkedRoles.slice(0, 3).map(role => `<b>🛡️ ${escapeEventTemplateText(role.parentElement.textContent.trim())}</b><span>@Integrante</span>`).join('');
        } else {
            read('tpl-preview-groups').innerHTML = `<b>${grouping === 'LIST' ? '📋 LISTA DE PARTICIPANTES' : '👥 ASISTENTES — 3'}</b><span>@Alpha &nbsp; @Bravo &nbsp; @Charlie</span>`;
        }
    }
}

async function saveEventTemplate(event) {
    event.preventDefault();
    const saveButton = document.getElementById('tpl-save-button');
    const selectedRoles = [...document.querySelectorAll('input[name="tpl-role"]:checked')];
    const groupRoles = selectedRoles.slice(0, 6).map(option => ({ role_id: option.value, label: option.parentElement.textContent.trim(), emoji: '🛡️' }));
    const payload = {
        id: parseInt(document.getElementById('tpl-id').value, 10) || null,
        name: document.getElementById('tpl-name').value.trim(), title: document.getElementById('tpl-title').value.trim(),
        description: document.getElementById('tpl-description').value.trim(), emoji: document.getElementById('tpl-emoji').value.trim(),
        color: document.getElementById('tpl-color').value, report_channel_id: document.getElementById('tpl-channel').value,
        grouping_mode: document.getElementById('tpl-grouping').value, group_roles: groupRoles,
        evidence_required: document.getElementById('tpl-evidence').value === '1', sticker_id: document.getElementById('tpl-sticker').value.trim(),
        footer: document.getElementById('tpl-footer').value.trim()
    };
    if (payload.grouping_mode === 'ROLES' && groupRoles.length === 0) {
        showEventTemplateNotice('Selecciona al menos una unidad o cambia la organización.', 'warning');
        return;
    }
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = '⏳ GUARDANDO...'; }
    try {
        const response = await fetch('/api/admin/events/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'No se pudo guardar la plantilla.');
        TerminalFX.playBeepSuccess();
        eventReportTemplates = data.templates || [];
        eventTemplateEditorOpen = false;
        eventTemplateEditingId = null;
        await loadEventsData();
        showEventTemplateNotice(payload.id ? 'Plantilla actualizada correctamente.' : `Plantilla creada con ID #${data.template.id}.`);
    } catch (error) {
        TerminalFX.playBeepError();
        showEventTemplateNotice(error.message, 'error');
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = payload.id ? '💾 GUARDAR CAMBIOS' : '💾 CREAR PLANTILLA'; }
    }
}

async function archiveEventTemplate(id) {
    if (!confirm('¿Archivar esta plantilla? Las actas históricas no se modificarán.')) return;
    try {
        const response = await fetch(`/api/admin/events/templates/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'No se pudo archivar la plantilla.');
        eventReportTemplates = eventReportTemplates.filter(template => template.id !== id);
        if (eventTemplateEditingId === id) closeEventTemplateEditor();
        else renderEventTemplateManager();
        showEventTemplateNotice('Plantilla archivada. Las actas anteriores se conservaron.');
    } catch (error) {
        showEventTemplateNotice(error.message, 'error');
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

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;padding:14px;border:1px dashed #355b40;background:rgba(0,0,0,.2)">
                    <div class="form-group" style="margin:0">
                        <label class="form-label">🎯 RESULTADO PARA EL ACTA (OPCIONAL)</label>
                        <input id="ev-report-result" class="retro-input" maxlength="900" placeholder="Ej: Objetivo asegurado sin bajas">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label class="form-label">📝 OBSERVACIONES (OPCIONAL)</label>
                        <input id="ev-report-notes" class="retro-input" maxlength="900" placeholder="Detalles o novedades de la operación">
                    </div>
                    <p class="form-help" style="grid-column:1/-1;margin:0">📸 Si la plantilla exige evidencia, finaliza con <code>/evento finalizar</code> en Discord para adjuntar la imagen.</p>
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
                        <div class="form-group">
                            <label class="form-label">PLANTILLA DE ACTA AL FINALIZAR:</label>
                            <select id="ev-template-id" class="retro-select">
                                <option value="">Acta general automática</option>
                                ${eventReportTemplates.map(template => `<option value="${template.id}">${escapeEventTemplateText(template.emoji || '📜')} ${escapeEventTemplateText(template.name)} (#${template.id})</option>`).join('')}
                            </select>
                            <p class="form-help">La plantilla se copia al evento; cambios futuros no alterarán su acta.</p>
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
                min_attendance_percent: parseInt(document.getElementById('ev-min-percent').value, 10),
                template_id: parseInt(document.getElementById('ev-template-id').value, 10) || null
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({
                result: document.getElementById('ev-report-result')?.value.trim() || '',
                notes: document.getElementById('ev-report-notes')?.value.trim() || ''
            })
        });
        if (res.ok) {
            const data = await res.json();
            TerminalFX.playBeepSuccess();
            const currencySymbol = globalEcoSettings.currency_symbol || '$';
            const reportStatus = data.reportWarning
                ? `\n\n⚠️ ${data.reportWarning}`
                : `\n\n📜 Acta oficial publicada${data.reportChannel ? ` en <#${data.reportChannel}>` : ''}.`;
            alert(`¡OPERACIÓN FINALIZADA Y PAGADA!\nSoldados pagados: ${data.summary?.paidCount || 0}\nTotal desembolsado: ${currencySymbol}${(data.summary?.totalDistributed || 0).toLocaleString()}${reportStatus}`);
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
