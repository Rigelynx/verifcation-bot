// =========================================================================
// MÓDULO JAVASCRIPT: CONTROL DE DIRECTIVAS Y PERMISOS DE COMANDOS
// =========================================================================
let allCommandPerms = [];
let commandPermissionsPage = 1;
let commandsPerPage = 10;
let commandFilterCategory = 'ALL';
let commandFilterStatus = 'ALL';
let commandSearchQuery = '';

const COMMAND_METAS = {
    // ⚙️ ADMINISTRACIÓN MILITAR
    'admin:verificar-manual': { label: '/admin verificar-manual', desc: 'Aprueba y acredita manualmente a un recluta sin formulario web.', category: 'admin', catName: 'ADMIN', catColor: '#d4af37' },
    'admin:desverificar': { label: '/admin desverificar', desc: 'Revoca la acreditación militar y retira roles asignados a un usuario.', category: 'admin', catName: 'ADMIN', catColor: '#d4af37' },
    'admin:panel-web': { label: '/admin panel-web', desc: 'Muestra credenciales tácticas y enlace del Centro de Mando Web.', category: 'admin', catName: 'ADMIN', catColor: '#d4af37' },
    'admin:configurar': { label: '/admin configurar', desc: 'Ajusta roles militares, canales de revisión/auditoría y modo auto/manual.', category: 'admin', catName: 'ADMIN', catColor: '#d4af37' },

    // 🪪 VERIFICACIÓN Y EXPEDIENTES
    'panel-verificacion': { label: '/panel-verificacion', desc: 'Despliega el panel de bienvenida con botón táctico hacia la terminal web.', category: 'verif', catName: 'VERIF', catColor: '#00cc66' },
    'datos-usuario': { label: '/datos-usuario', desc: 'Consulta clasificada del expediente militar y respuestas de un usuario.', category: 'verif', catName: 'VERIF', catColor: '#00cc66' },

    // 💰 ECONOMÍA MILITAR
    'economia:balance': { label: '/economia balance', desc: 'Consulta el estado de cuenta militar (cartera, banco y patrimonio total).', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },
    'economia:depositar': { label: '/economia depositar', desc: 'Deposita dinero en efectivo a la caja fuerte bancaria militar.', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },
    'economia:retirar': { label: '/economia retirar', desc: 'Retira fondos de la caja fuerte militar hacia la cartera.', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },
    'economia:pagar': { label: '/economia pagar', desc: 'Transfiere créditos militares en efectivo a otro combatiente.', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },
    'economia:trabajar': { label: '/economia trabajar', desc: 'Cumple guardias y turnos de servicio militar para cobrar salario.', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },
    'economia:crimen': { label: '/economia crimen', desc: 'Operación clandestina de alto riesgo con posibilidad de recompensa o sanción.', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },
    'economia:robar': { label: '/economia robar', desc: 'Intenta asaltar la cartera de otro recluta arriesgando multas.', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },
    'economia:ranking': { label: '/economia ranking', desc: 'Despliega el escalafón de los 10 combatientes más acaudalados.', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },
    'economia:admin:dar': { label: '/economia admin dar', desc: 'Acreditar fondos extraordinarios a un recluta (Oficiales/Mando).', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },
    'economia:admin:quitar': { label: '/economia admin quitar', desc: 'Decomiso disciplinario de fondos a un recluta (Oficiales/Mando).', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },
    'economia:admin:fijar': { label: '/economia admin fijar', desc: 'Fijación directa del saldo exacto a un recluta (Oficiales/Mando).', category: 'eco', catName: 'ECONOMÍA', catColor: '#38e54d' },

    // 🎁 ASIGNACIONES Y BONOS
    'bono:panel': { label: '/bono panel', desc: 'Publica el panel militar con botón interactivo de cobro de bono.', category: 'bono', catName: 'BONOS', catColor: '#ffbb00' },
    'bono:crear': { label: '/bono crear', desc: 'Crea una nueva asignación o gratificación militar con ID único.', category: 'bono', catName: 'BONOS', catColor: '#ffbb00' },
    'bono:eliminar': { label: '/bono eliminar', desc: 'Elimina un bono militar y su historial de dispersión.', category: 'bono', catName: 'BONOS', catColor: '#ffbb00' },
    'bono:reset_reclamos': { label: '/bono reset_reclamos', desc: 'Reinicia los reclamos de un bono para permitir un nuevo cobro.', category: 'bono', catName: 'BONOS', catColor: '#ffbb00' },
    'bono:lista': { label: '/bono lista', desc: 'Listado completo de bonos militares creados con sus montos y estado.', category: 'bono', catName: 'BONOS', catColor: '#ffbb00' },
    'bono:reclamar': { label: '/bono reclamar', desc: 'Reclama la asignación militar disponible directamente por comando.', category: 'bono', catName: 'BONOS', catColor: '#ffbb00' },
    'bono:dar': { label: '/bono dar', desc: 'Otorga un bono o recompensa financiera directa a un combatiente.', category: 'bono', catName: 'BONOS', catColor: '#ffbb00' },
    'bono:masivo': { label: '/bono masivo', desc: 'Asignación masiva extraordinaria de bonos para todo el batallón.', category: 'bono', catName: 'BONOS', catColor: '#ffbb00' },
    'bono:estado': { label: '/bono estado', desc: 'Consulta la vigencia y cooldown de tu próxima asignación de bono.', category: 'bono', catName: 'BONOS', catColor: '#ffbb00' },

    // ⚔️ OPERACIONES Y EVENTOS
    'evento:convocar': { label: '/evento convocar', desc: 'Abre la lista de alistamiento previo y publica el panel de inscripción.', category: 'evento', catName: 'EVENTOS', catColor: '#00b4d8' },
    'evento:entrenamiento': { label: '/evento entrenamiento', desc: 'Abre un entrenamiento y entrega el rol configurado a quienes permanezcan aprobados.', category: 'evento', catName: 'EVENTOS', catColor: '#00b4d8' },
    'evento:lista': { label: '/evento lista', desc: 'Valida la asistencia: revisa el roster y retira ausentes antes del pago.', category: 'evento', catName: 'EVENTOS', catColor: '#00b4d8' },
    'evento:iniciar': { label: '/evento iniciar', desc: 'Inicia el monitoreo automático de permanencia en canales de voz o chat.', category: 'evento', catName: 'EVENTOS', catColor: '#00b4d8' },
    'evento:finalizar': { label: '/evento finalizar', desc: 'Concluye la operación y paga inmediatamente a todos los asistentes aprobados.', category: 'evento', catName: 'EVENTOS', catColor: '#00b4d8' },
    'evento:estado': { label: '/evento estado', desc: 'Verifica los soldados presentes y estado en vivo de la operación activa.', category: 'evento', catName: 'EVENTOS', catColor: '#00b4d8' },

    // 🛒 ARMERÍA Y SUMINISTROS
    'tienda:panel': { label: '/tienda panel', desc: 'Abre el panel táctico con catálogo de ítems y selector de compra instantánea.', category: 'shop', catName: 'ARMERÍA', catColor: '#9d4edd' },
    'tienda:comprar': { label: '/tienda comprar', desc: 'Adquiere directamente un suministro militar o rango por ID.', category: 'shop', catName: 'ARMERÍA', catColor: '#9d4edd' },
    'tienda:inventario': { label: '/tienda inventario', desc: 'Inspecciona los pertrechos y mochilas tácticas de un soldado.', category: 'shop', catName: 'ARMERÍA', catColor: '#9d4edd' },

    // 🛡️ DISCIPLINA Y MODERACIÓN
    'mod:ban': { label: '/mod ban', desc: 'Corte marcial: expulsa y veta permanentemente de las instalaciones militares.', category: 'mod', catName: 'MODERACIÓN', catColor: '#e63946' },
    'mod:kick': { label: '/mod kick', desc: 'Expulsa de inmediato a un miembro de las instalaciones militares.', category: 'mod', catName: 'MODERACIÓN', catColor: '#e63946' },
    'mod:timeout': { label: '/mod timeout', desc: 'Aísla a un miembro en celda de castigo privándolo de transmisiones.', category: 'mod', catName: 'MODERACIÓN', catColor: '#e63946' },
    'mod:purge': { label: '/mod purge', desc: 'Purga táctica: elimina entre 1 y 100 mensajes indisciplinados del canal.', category: 'mod', catName: 'MODERACIÓN', catColor: '#e63946' },

    // 📖 MANUAL Y ASISTENCIA
    'help': { label: '/help', desc: 'Abre el Manual Táctico Militar USMC interactivo con selector de secciones.', category: 'help', catName: 'MANUAL', catColor: '#52b788' }
};

async function loadCommandsData() {
    try {
        const res = await fetch('/api/admin/economy/commands', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            allCommandPerms = data.commands || [];
            commandPermissionsPage = 1;
            updateCommandStats();
            renderCommandPermissions();
        }
    } catch (err) {
        console.error('[Error cargando directivas de comandos]:', err);
    }
}

function updateCommandStats() {
    const totalEl = document.getElementById('cmd-stat-total');
    const enabledEl = document.getElementById('cmd-stat-enabled');
    const disabledEl = document.getElementById('cmd-stat-disabled');
    const restrictedEl = document.getElementById('cmd-stat-restricted');

    if (!totalEl) return;

    const total = allCommandPerms.length;
    const enabled = allCommandPerms.filter(c => c.is_enabled).length;
    const disabled = total - enabled;
    const restricted = allCommandPerms.filter(c => Array.isArray(c.allowed_roles) && c.allowed_roles.length > 0).length;

    totalEl.innerText = total;
    if (enabledEl) enabledEl.innerText = enabled;
    if (disabledEl) disabledEl.innerText = disabled;
    if (restrictedEl) restrictedEl.innerText = restricted;
}

function getFilteredCommands() {
    let filtered = allCommandPerms.slice();

    // Filtro por categoría
    if (commandFilterCategory && commandFilterCategory !== 'ALL') {
        filtered = filtered.filter(cmd => {
            const meta = COMMAND_METAS[cmd.command_name];
            return meta && meta.category === commandFilterCategory;
        });
    }

    // Filtro por estado
    if (commandFilterStatus === 'ENABLED') {
        filtered = filtered.filter(cmd => cmd.is_enabled);
    } else if (commandFilterStatus === 'DISABLED') {
        filtered = filtered.filter(cmd => !cmd.is_enabled);
    } else if (commandFilterStatus === 'RESTRICTED') {
        filtered = filtered.filter(cmd => Array.isArray(cmd.allowed_roles) && cmd.allowed_roles.length > 0);
    }

    // Filtro por buscador de texto
    if (commandSearchQuery && commandSearchQuery.trim() !== '') {
        const q = commandSearchQuery.trim().toLowerCase();
        filtered = filtered.filter(cmd => {
            const meta = COMMAND_METAS[cmd.command_name] || { label: cmd.command_name, desc: '' };
            const label = (meta.label || '').toLowerCase();
            const desc = (meta.desc || '').toLowerCase();
            const rawName = (cmd.command_name || '').toLowerCase();
            return label.includes(q) || desc.includes(q) || rawName.includes(q);
        });
    }

    return filtered;
}

function onCommandFilterChange() {
    const catEl = document.getElementById('cmd-filter-category');
    const statusEl = document.getElementById('cmd-filter-status');
    const searchEl = document.getElementById('cmd-search-input');

    if (catEl) commandFilterCategory = catEl.value;
    if (statusEl) commandFilterStatus = statusEl.value;
    if (searchEl) commandSearchQuery = searchEl.value;

    commandPermissionsPage = 1;
    renderCommandPermissions();
}

function changeCommandsPerPage(val) {
    commandsPerPage = parseInt(val, 10) || 10;
    commandPermissionsPage = 1;
    renderCommandPermissions();
}

function renderCommandPermissions() {
    const tbody = document.getElementById('command-permissions-tbody');
    const showingCountEl = document.getElementById('cmd-showing-count');
    if (!tbody) return;

    const filteredCommands = getFilteredCommands();
    const rolesList = (guildResources && guildResources.roles) ? guildResources.roles : [];

    if (filteredCommands.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #728c75; padding: 25px;">No se encontraron protocolos de comando con los filtros seleccionados.</td></tr>';
        if (showingCountEl) showingCountEl.innerText = 'Mostrando 0 de ' + allCommandPerms.length + ' comandos';
        renderCommandPermissionsPagination(1, 0);
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredCommands.length / commandsPerPage));
    commandPermissionsPage = Math.min(Math.max(commandPermissionsPage, 1), totalPages);
    const pageStart = (commandPermissionsPage - 1) * commandsPerPage;
    const pageCommands = filteredCommands.slice(pageStart, pageStart + commandsPerPage);

    if (showingCountEl) {
        const endCount = Math.min(pageStart + commandsPerPage, filteredCommands.length);
        showingCountEl.innerText = `Mostrando ${pageStart + 1}-${endCount} de ${filteredCommands.length} comandos filtrados (Total en base: ${allCommandPerms.length})`;
    }

    tbody.innerHTML = pageCommands.map(cmd => {
        const meta = COMMAND_METAS[cmd.command_name] || {
            label: `/${cmd.command_name.replaceAll(':', ' ')}`,
            desc: 'Protocolo táctico de comando militar USMC.',
            category: 'gen',
            catName: 'GENERAL',
            catColor: '#728c75'
        };
        const isEnabled = cmd.is_enabled;

        const roleBadges = (cmd.allowed_roles || []).map(rId => {
            const roleName = getRoleNameById(rId);
            return `
                <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(30, 60, 35, 0.7); border: 1px solid var(--usmc-green); color: #afffba; padding: 2px 6px; font-size: 0.75rem; border-radius: 3px; margin: 2px;">
                    ${roleName}
                    <button type="button" onclick="removeRoleFromCmd('${cmd.command_name}', '${rId}')" style="background: none; border: none; color: #ff7a7a; cursor: pointer; font-weight: bold; padding: 0 2px; line-height: 1;" title="Quitar restricción de este rol">×</button>
                </span>
            `;
        }).join('');

        const rolePickerOptions = rolesList
            .filter(r => !(cmd.allowed_roles || []).includes(r.id))
            .map(r => `<option value="${r.id}">${r.name}</option>`)
            .join('');

        const statusBg = isEnabled ? 'rgba(56, 229, 77, 0.08)' : 'rgba(255, 68, 68, 0.08)';

        return `
            <tr id="row-cmd-${cmd.command_name}" style="background: ${statusBg};">
                <td>
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 0.65rem; padding: 1px 5px; border-radius: 2px; background: rgba(0,0,0,0.4); border: 1px solid ${meta.catColor}; color: ${meta.catColor}; font-weight: bold;">
                                ${meta.catName}
                            </span>
                        </div>
                        <span style="font-family: var(--font-tech); font-weight: bold; color: var(--usmc-gold); font-size: 0.95rem; word-break: break-all;">
                            ${meta.label}
                        </span>
                    </div>
                </td>
                <td style="color: #a0baa4; font-size: 0.82rem; line-height: 1.35;">
                    ${meta.desc}
                </td>
                <td>
                    <select id="cmd-status-${cmd.command_name}" class="retro-select" style="padding: 4px 8px; font-size: 0.85rem; width: 100%; border-color: ${isEnabled ? 'var(--usmc-green)' : '#ff5555'};">
                        <option value="1" ${isEnabled ? 'selected' : ''}>🟢 HABILITADO</option>
                        <option value="0" ${!isEnabled ? 'selected' : ''}>🔴 DESACTIVADO</option>
                    </select>
                </td>
                <td>
                    <div id="cmd-roles-${cmd.command_name}" style="margin-bottom: 6px; min-height: 22px;">
                        ${roleBadges || '<span style="color: #728c75; font-size: 0.78rem; font-style: italic;">Acceso General (Sin restricción de rol)</span>'}
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <select id="cmd-picker-${cmd.command_name}" class="retro-select" style="font-size: 0.78rem; padding: 3px 6px; flex: 1;" onchange="addRoleToCmd('${cmd.command_name}', this.value); this.value='';">
                            <option value="">➕ Restringir a rango específico...</option>
                            ${rolePickerOptions}
                        </select>
                    </div>
                </td>
                <td style="text-align: right;">
                    <button class="btn-retro primary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="saveCommandPermission('${cmd.command_name}')" title="Guardar cambios de este comando">
                        💾 GUARDAR
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderCommandPermissionsPagination(totalPages, filteredCommands.length);
}

function renderCommandPermissionsPagination(totalPages, totalFiltered) {
    const pagination = document.getElementById('command-permissions-pagination');
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    const pageButtons = Array.from({ length: totalPages }, (_, index) => {
        const page = index + 1;
        const activeStyle = page === commandPermissionsPage
            ? 'background: var(--usmc-gold); color: #101810; border-color: var(--usmc-gold);'
            : '';
        return `<button type="button" class="btn-retro" style="padding: 4px 9px; font-size: 0.78rem; ${activeStyle}" onclick="goToCommandPermissionsPage(${page})">${page}</button>`;
    }).join('');

    pagination.innerHTML = `
        <button type="button" class="btn-retro" style="padding: 4px 9px; font-size: 0.78rem;" ${commandPermissionsPage === 1 ? 'disabled' : ''} onclick="goToCommandPermissionsPage(${commandPermissionsPage - 1})">◀ ANTERIOR</button>
        ${pageButtons}
        <button type="button" class="btn-retro" style="padding: 4px 9px; font-size: 0.78rem;" ${commandPermissionsPage === totalPages ? 'disabled' : ''} onclick="goToCommandPermissionsPage(${commandPermissionsPage + 1})">SIGUIENTE ▶</button>
    `;
}

function goToCommandPermissionsPage(page) {
    const filtered = getFilteredCommands();
    const totalPages = Math.max(1, Math.ceil(filtered.length / commandsPerPage));
    commandPermissionsPage = Math.min(Math.max(page, 1), totalPages);
    renderCommandPermissions();
}

function addRoleToCmd(cmdName, roleId) {
    if (!roleId) return;
    const cmd = allCommandPerms.find(c => c.command_name === cmdName);
    if (!cmd) return;
    if (!cmd.allowed_roles) cmd.allowed_roles = [];
    if (!cmd.allowed_roles.includes(roleId)) {
        cmd.allowed_roles.push(roleId);
        updateCommandStats();
        renderCommandPermissions();
    }
}

function removeRoleFromCmd(cmdName, roleId) {
    const cmd = allCommandPerms.find(c => c.command_name === cmdName);
    if (!cmd || !cmd.allowed_roles) return;
    cmd.allowed_roles = cmd.allowed_roles.filter(id => id !== roleId);
    updateCommandStats();
    renderCommandPermissions();
}

async function saveCommandPermission(cmdName) {
    const cmd = allCommandPerms.find(c => c.command_name === cmdName);
    if (!cmd) return;

    const statusSelect = document.getElementById(`cmd-status-${cmdName}`);
    const isEnabled = statusSelect ? statusSelect.value === '1' : cmd.is_enabled;
    const allowedRoles = cmd.allowed_roles || [];

    try {
        const res = await fetch('/api/admin/economy/commands', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                commandName: cmdName,
                isEnabled,
                allowedRoles
            })
        });

        if (res.ok) {
            TerminalFX.playBeepSuccess();
            const data = await res.json();
            allCommandPerms = data.commands;
            updateCommandStats();
            renderCommandPermissions();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL ACTUALIZAR DIRECTIVA DEL COMANDO.");
        }
    } catch (err) {
        alert(err.message);
    }
}

async function bulkSetVisibleCommands(enable) {
    const visible = getFilteredCommands();
    if (visible.length === 0) {
        alert("No hay comandos visibles en la vista actual para aplicar la acción.");
        return;
    }

    const actionWord = enable ? 'HABILITAR' : 'DESACTIVAR';
    const actionIcon = enable ? '🟢' : '🔴';
    const confirmed = confirm(`${actionIcon} ¿Confirmas que deseas ${actionWord} los ${visible.length} comandos actualmente filtrados?`);
    if (!confirmed) return;

    const updates = visible.map(c => ({
        command_name: c.command_name,
        is_enabled: enable ? 1 : 0,
        allowed_roles: c.allowed_roles || []
    }));

    try {
        const res = await fetch('/api/admin/economy/commands/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ updates })
        });

        if (res.ok) {
            TerminalFX.playBeepSuccess();
            const data = await res.json();
            allCommandPerms = data.commands;
            updateCommandStats();
            renderCommandPermissions();
        } else {
            TerminalFX.playBeepError();
            alert("ERROR AL ACTUALIZAR COMANDOS EN LOTE.");
        }
    } catch (err) {
        alert(err.message);
    }
}

// Intentar autologin si ya tiene el token guardado
if (adminToken) {
    testAdminAuth(adminToken).then(valid => {
        if (valid) {
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('main-content').style.display = 'block';
            loadDashboardData();
        }
    });
}
