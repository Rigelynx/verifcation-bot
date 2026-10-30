(() => {
    'use strict';
    const assistantPolicies = { create_channels: 'Crear canales y categorías', edit_channels: 'Editar, mover y ordenar canales', delete_channels: 'Borrar canales y categorías',
        create_roles: 'Crear roles', edit_roles: 'Editar y ordenar roles', delete_roles: 'Borrar roles', assign_roles: 'Asignar y retirar roles a miembros', manage_permissions: 'Configurar permisos de roles y canales' };
    const page = document.body.dataset.page;
    let csrf = '', installations = [], filter = 'all';
    const $ = selector => document.querySelector(selector);
    const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
    const date = value => new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(value));
    function safeImage(value) { try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'cdn.discordapp.com' ? url.href : null; } catch { return null; } }
    function image(src, className) { const img = make('img', className); img.src = src; img.alt = ''; img.loading = 'lazy'; img.addEventListener('error', () => img.remove()); return img; }
    function account(user) {
        document.querySelectorAll('[data-account]').forEach(node => { node.replaceChildren(); const avatar = safeImage(user.avatar); if (avatar) node.append(image(avatar, 'avatar')); node.append(make('span', '', user.name)); });
        document.querySelectorAll('[data-logout]').forEach(node => { node.hidden = false; });
    }
    async function request(url) { const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' }); const data = await response.json(); if (!response.ok) { const error = new Error(data.message || 'No se pudo cargar la información.'); error.status = response.status; throw error; } return data; }
    function gate(error) {
        $('#access-gate').hidden = false;
        $('#gate-message').textContent = error.message;
        $('#gate-login').hidden = error.status !== 401;
        let retry = $('#gate-retry');
        if (!retry) { retry = make('button', 'button outline', 'Volver a intentar ↻'); retry.id = 'gate-retry'; retry.addEventListener('click', () => location.reload()); $('#access-gate').append(retry); }
        retry.hidden = error.status === 401 || error.status === 403;
        if (error.status === 403) { $('#gate-message').append(' Puedes continuar desde Mi espacio con los accesos de tu comunidad.'); }
    }
    function guildCard(row, owner) {
        const card = make('article', 'guild-card'), top = make('div', 'guild-top'), icon = make('div', 'guild-icon', row.name.slice(0, 1).toUpperCase());
        const url = safeImage(row.icon); if (url) { icon.textContent = ''; icon.append(image(url)); }
        const active = !row.left_at, pending = owner ? !row.dashboard_url : !row.ready;
        top.append(icon, make('span', `badge${!active ? ' offline' : pending ? ' pending' : ''}`, !active ? 'INACTIVA' : pending ? 'EN PREPARACIÓN' : 'CONECTADA'));
        card.append(top, make('h3', '', row.name), make('div', 'guild-id', row.guild_id || row.id));
        const details = make('div', 'guild-details'); details.append(make('span', '', owner ? (row.available ? 'Discord disponible' : 'Sin conexión actual') : row.access), make('span', '', owner ? date(row.joined_at) : 'Discord ↗')); card.append(details);
        const dashboard = owner ? row.dashboard_url : row.url;
        if (dashboard && /^\/(admin|patrullas)(?:\?guild=\d{17,20})?$/.test(dashboard)) { const link = make('a', 'text-link', 'Abrir dashboard ↗'); link.href = dashboard; card.append(link); }
        else card.append(make('p', 'pending-note', active ? 'Dashboard pendiente de integración multiserver.' : 'El bot ya no está en esta comunidad.'));
        if (owner && active) {
            const label = row.assistant?.assistant_enabled ? (row.assistant_key_present ? 'IA habilitada' : 'IA pendiente de clave') : 'IA desactivada';
            const button = make('button', 'text-link', `${label} · Configurar →`); button.addEventListener('click', () => configureAssistant(row)); card.append(button);
            if (row.usage) {
                const number = value => value === null ? 'sin informar' : new Intl.NumberFormat('es').format(value);
                card.append(make('p', 'pending-note', `IA · últimas 24 h: ${number(row.usage.input_tokens)} tokens de entrada · ${number(row.usage.output_tokens)} de salida · ${number(row.usage.cache_hit_tokens)} de entrada cacheada.`));
            }
        }
        return card;
    }
    function renderInstallations() {
        const list = $('#installation-list'), query = $('#guild-search').value.toLocaleLowerCase();
        const rows = installations.filter(row => (filter === 'all' || (filter === 'inactive' ? Boolean(row.left_at) : !row.left_at)) && `${row.name} ${row.guild_id}`.toLocaleLowerCase().includes(query));
        list.replaceChildren(...rows.map(row => guildCard(row, true)));
        if (!rows.length) list.append(make('p', 'empty-state', installations.length ? 'No hay instalaciones que coincidan con esta búsqueda.' : 'Todavía no hay instalaciones registradas. Se detectarán cuando el bot se conecte a Discord.'));
    }
    async function loadOwner() {
        const refresh = $('#refresh-owner'); refresh.disabled = true;
        try {
            const data = await request('/api/owner/overview'); csrf = data.csrf_token; account(data.user);
            $('#access-gate').hidden = true; $('#owner-content').hidden = false;
            installations = data.installations; const active = installations.filter(row => !row.left_at);
            $('#metric-active').textContent = active.length;
            $('#metric-inactive').textContent = installations.length - active.length;
            $('#metric-ready').textContent = active.filter(row => row.dashboard_url).length;
            $('#metric-status').textContent = data.bot.connected ? 'En línea' : 'Offline';
            $('#metric-ping').textContent = data.bot.ping === null ? 'Sin latencia disponible' : `Latencia del gateway · ${data.bot.ping} ms`;
            $('#connection-caption').textContent = data.bot.connected ? 'Discord conectado · instalaciones sincronizadas' : 'Discord desconectado · mostrando el último registro';
            const setup = $('#setup-list'); setup.replaceChildren();
            for (const [label, ready] of [['Inicio de sesión Discord', data.setup.oauth], ['Acceso exclusivo de propietario', data.setup.owner], ['Comunidad principal', data.setup.community], ['Credencial del proveedor IA', data.setup.provider], ['Dashboards multiserver', data.setup.multiserver_dashboards]]) {
                const row = make('div', 'setup-row'); row.append(make('span', '', label), make('span', `badge${ready ? '' : ' pending'}`, ready ? 'CONFIGURADO' : 'PENDIENTE')); setup.append(row);
            }
            renderInstallations(); $('#updated-at').textContent = `Última sincronización · ${new Intl.DateTimeFormat('es', { timeStyle: 'medium' }).format(new Date())}`;
        } catch (error) { $('#owner-content').hidden = true; gate(error); }
        finally { refresh.disabled = false; }
    }
    async function loadPortal() {
        try {
            const data = await request('/api/portal/communities'); csrf = data.csrf_token; account(data.user);
            $('#access-gate').hidden = true; $('#community-content').hidden = false; $('#owner-link').hidden = !data.owner;
            $('#portal-notice').textContent = data.partial ? 'No se pudieron comprobar todas las comunidades. Recarga para reintentar.' : 'Estos son los espacios donde tienes permisos de gestión.';
            const list = $('#community-list'); list.replaceChildren(...data.communities.map(row => guildCard(row, false)));
            if (!data.communities.length) list.append(make('p', 'empty-state', 'No encontramos comunidades con permisos de gestión para tu cuenta. Comprueba que el bot esté instalado y que tengas el rol correspondiente.'));
        } catch (error) { gate(error); }
    }
    function configureAssistant(row) {
        let dialog = $('#assistant-policy');
        if (!dialog) {
            dialog = make('dialog', 'policy-dialog'); dialog.id = 'assistant-policy';
            dialog.innerHTML = `<form><p class="eyebrow">CONTROL DEL PROPIETARIO</p><h2>IA de la comunidad</h2><p data-policy-name></p><label class="policy-check"><input name="enabled" type="checkbox"> Habilitar asistente</label><div class="policy-fields"><label>Proveedor<input type="hidden" name="provider" value="deepseek"><input value="DeepSeek de pago" readonly></label><label>Modelo opcional<input name="model" maxlength="150" placeholder="Modelo predeterminado"></label><label>Consultas por persona / 24 h · 0 = sin cupo<input name="daily_limit" type="number" min="0" step="1" required></label><label>IDs autorizados · máximo 10<textarea name="allowed_ids" rows="3" placeholder="IDs separados por comas o espacios"></textarea></label></div><fieldset class="assistant-policy-tools"><legend>Herramientas de gestión</legend>${Object.entries(assistantPolicies).map(([key, label]) => `<label class="policy-check"><input name="${key}" type="checkbox"> ${label}</label>`).join('')}</fieldset><p class="muted">Las herramientas exigen los permisos y la jerarquía de Discord de la persona y del bot. Las claves se configuran en el host.</p><p role="status" data-policy-feedback></p><div class="policy-actions"><button class="button dark" type="submit">Guardar cambios</button><button class="button outline" type="button" data-policy-close>Cancelar</button></div></form>`;
            document.body.append(dialog); dialog.querySelector('[data-policy-close]').addEventListener('click', () => dialog.close());
            dialog.querySelector('form').addEventListener('submit', async event => {
                event.preventDefault(); const form = event.target, button = form.querySelector('[type=submit]'), feedback = form.querySelector('[data-policy-feedback]');
                button.disabled = true;
                try {
                    const payload = Object.fromEntries(new FormData(form));
                    for (const key of ['enabled', ...Object.keys(assistantPolicies)]) payload[key] = form.elements.namedItem(key).checked;
                    payload.allowed_ids = payload.allowed_ids.split(/[\s,]+/).filter(Boolean); payload.daily_limit = Number(payload.daily_limit);
                    const response = await fetch(`/api/owner/installations/${dialog.dataset.guildId}/assistant`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(payload) });
                    const data = await response.json(); if (!response.ok) throw new Error(data.message);
                    dialog.close(); await loadOwner();
                } catch (error) { feedback.textContent = error.message; } finally { button.disabled = false; }
            });
        }
        const profile = row.assistant || {}, form = dialog.querySelector('form');
        dialog.dataset.guildId = row.guild_id; dialog.querySelector('[data-policy-name]').textContent = row.name; dialog.querySelector('[data-policy-feedback]').textContent = '';
        form.elements.enabled.checked = profile.assistant_enabled === 1;
        form.elements.provider.value = 'deepseek'; form.elements.model.value = profile.assistant_model || '';
        form.elements.daily_limit.value = profile.assistant_daily_limit ?? 0; form.elements.allowed_ids.value = profile.assistant_allowed_ids ? JSON.parse(profile.assistant_allowed_ids).join('\n') : '';
        for (const key of Object.keys(assistantPolicies)) form.elements.namedItem(key).checked = profile[`assistant_${key}`] === 1;
        dialog.showModal();
    }
    async function setupBrand() {
        try {
            const data = await request('/api/public/bot');
            document.querySelectorAll('[data-brand]').forEach(node => { node.textContent = data.name; });
            document.querySelectorAll('[data-invite]').forEach(link => {
                if (data.invite_url) link.href = data.invite_url;
                else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); link.textContent = 'Invitación pendiente de configuración'; }
            });
            if (data.support_url && $('[data-support-link]')) { $('[data-support-link]').href = data.support_url; $('[data-support-link]').hidden = false; }
            if (!data.login_enabled && $('#gate-login')) { $('#gate-login').hidden = true; $('#gate-message').textContent = 'El acceso con Discord todavía está pendiente de configuración en el host.'; }
        } catch { /* The presentation remains usable without live metadata. */ }
    }
    document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', async () => {
        button.disabled = true;
        try { const response = await fetch('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); if (!response.ok) throw new Error('Recarga la página antes de cerrar sesión.'); window.location.assign('/'); }
        catch (error) { button.disabled = false; window.alert(error.message); }
    }));
    if (page === 'owner') {
        $('#guild-search').addEventListener('input', renderInstallations);
        document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
            filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(tab => { const selected = tab === button; tab.classList.toggle('active', selected); tab.setAttribute('aria-pressed', String(selected)); }); renderInstallations();
        }));
        $('#refresh-owner').addEventListener('click', loadOwner);
    }
    async function init() {
        if (page === 'owner') await loadOwner();
        if (page === 'portal') await loadPortal();
        await setupBrand();
        const authError = new URLSearchParams(location.search).get('auth_error');
        if (authError && $('#gate-message')) $('#gate-message').textContent = authError;
    }
    init();
    if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); observer.unobserve(entry.target); } }), { threshold: .08 });
        document.querySelectorAll('.reveal').forEach(node => observer.observe(node)); document.body.classList.add('motion-ready');
    }
})();
