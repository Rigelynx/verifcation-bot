(() => {
    const el = id => document.getElementById(id);
    let session, activeConversation = null, ready = false, pending = false, changingChat = false, retry = null, newChatRequest = null;
    let selectedImages = [], uploadingImage = false;
    function clearImage() { selectedImages = []; el('assistant-image').value = ''; el('assistant-image-name').textContent = ''; el('assistant-image-clear').hidden = true; }
    function imageUrl(id) { return `/api/assistant/attachments/${encodeURIComponent(id)}?conversation_id=${encodeURIComponent(activeConversation)}&guild=${encodeURIComponent(session.guild.id)}`; }
    const names = { server_inventory: 'Consultó canales y roles', read_channel: 'Leyó una muestra de mensajes', channel_usage: 'Analizó actividad reciente', event_summary: 'Consultó eventos', create_channel: 'Creación de canal', create_role: 'Creación de rol',
        web_configuration:'Consultó la web',configure_branding:'Editó identidad',configure_question:'Editó el cuestionario',delete_question:'Eliminó una pregunta',configure_economy:'Configuró economía',configure_command:'Configuró un comando',verification_submissions:'Consultó expedientes',configure_budget_item:'Guardó una partida',configure_budget_schedule:'Programó informes',web_search:'Buscó fuentes',web_open:'Leyó una página',bot_command_catalog: 'Consultó los comandos del bot', run_bot_command: 'Invocó un comando del bot',
        shop_configuration: 'Consultó la configuración de tienda y bonos', configure_shop_item: 'Configuró un producto', configure_bonus_panel: 'Configuró un panel de bonos', publish_panel: 'Publicó o editó un panel',
        propose_creations: 'Preparó una propuesta', propose_actions: 'Preparó un plan de gestión', permission_catalog: 'Consultó el catálogo de permisos', inspect_channel: 'Consultó configuración del canal', inspect_role: 'Consultó el rol y sus miembros', find_members: 'Buscó miembros', member_info: 'Consultó un miembro',
        update_channel: 'Edición de canal', move_channel: 'Traslado de canal', reorder_channel: 'Orden de canal', delete_channel: 'Eliminación de canal', update_role: 'Edición de rol', reorder_role: 'Orden de rol', delete_role: 'Eliminación de rol', assign_role: 'Asignación de rol', remove_role: 'Retirada de rol',
        set_role_permissions: 'Permisos del rol', set_channel_permissions: 'Permisos del canal', sync_channel_permissions: 'Sincronización de permisos', send_message: 'Envío de mensaje a Discord' };
    function message(role, content, trace = [], attachments = []) {
        const article = document.createElement('article'); article.className = `assistant-message ${role}`;
        const heading = document.createElement('h3'); heading.textContent = role === 'user' ? 'Tú' : 'Asistente';
        const paragraph = document.createElement('p'); paragraph.textContent = content;
        article.append(heading, paragraph);
        for (const image of attachments) {
            const caption = document.createElement('p'); caption.textContent = `📎 ${image.name}`;
            if (image.mime?.startsWith('image/')) {
                const preview = document.createElement('img'); preview.className = 'assistant-upload-preview'; preview.src = imageUrl(image.id); preview.alt = image.name; preview.loading = 'lazy';
                article.append(preview, caption);
            }else {const link=document.createElement('a');link.href=imageUrl(image.id);link.download=image.name;link.textContent=caption.textContent;article.append(link);}
        }
        if (trace.length) {
            const details = document.createElement('details'); details.className = 'assistant-tools';
            const summary = document.createElement('summary'); summary.textContent = `Herramientas ejecutadas · ${trace.length}`; details.append(summary);
            for (const row of trace) {
                const line = document.createElement('p');
                line.textContent = `${row.ok ? '✓' : '×'} ${names[row.tool] || 'Herramienta'}${row.name ? ` · ${row.name}` : ''}${row.id ? ` · ID ${row.id}` : ''}${row.user_id ? ` · Miembro ${row.user_id}` : ''}${row.sent ? ' · Enviado' : row.created ? ' · Creado' : row.deleted ? ' · Borrado' : row.changed ? ' · Modificado' : ''}${row.error ? ` · ${row.error}` : ''}${row.audit_warning ? ` · ${row.audit_warning}` : ''}`;
                if (row.sent && row.url) {
                    const link = document.createElement('a');
                    if (/^https:\/\/discord\.com\/channels\/\d{17,20}\/\d{17,20}\/\d{17,20}$/.test(row.url)) {
                        link.href = row.url; link.textContent = ' Abrir mensaje ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer'; line.append(link);
                    }
                }
                details.append(line);
                if (row.command) {
                    const receipt = document.createElement('p');
                    receipt.textContent = row.execution_status === 'UNCERTAIN' ? 'Resultado incierto. Revisa antes de repetir.' : 'Respuesta del comando (puede contener un error o un panel pendiente):';
                    details.append(receipt);
                    for (const response of row.responses || []) {
                        const body = document.createElement('p');
                        body.textContent = [response.content, ...(response.embeds || []).flatMap(embed => [embed.title, embed.description,
                            ...(embed.fields || []).map(field => `${field.name}: ${field.value}`)])].filter(Boolean).join('\n');
                        details.append(body);
                    }
                }
            }
            article.append(details);
        }
        el('assistant-messages').append(article); article.scrollIntoView({ block: 'nearest' });
    }
    async function api(path, init = {}) {
        const response = await fetch(`/api/assistant${path}`, { ...init, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session?.csrf_token || '' } });
        const result = await response.json();
        if (!response.ok || !result.success) { const error = new Error(result.message || 'No se pudo completar la consulta.'); error.status = response.status; throw error; }
        return result;
    }
    function lockControls() {
        const locked = pending || changingChat || uploadingImage;
        el('assistant-send').disabled = locked || !ready;
        el('assistant-prompt').disabled = locked || !ready;
        el('assistant-new-chat').disabled = locked;
        el('assistant-conversation-select').disabled = locked;
        el('assistant-messages').setAttribute('aria-busy', String(locked));
        el('assistant-image').disabled = locked || !ready; el('assistant-image-clear').disabled = locked;
    }
    async function refreshConversations() {
        const data = await api('/conversations');
        const changed = activeConversation !== data.active_conversation_id;
        activeConversation = data.active_conversation_id;
        const select = el('assistant-conversation-select'); select.replaceChildren();
        for (const chat of data.conversations) {
            const option = document.createElement('option'); option.value = chat.id;
            option.textContent = `${chat.title} · ${chat.turn_count} ${chat.turn_count === 1 ? 'consulta' : 'consultas'}`;
            select.append(option);
        }
        select.value = activeConversation;
        return changed;
    }
    async function showConversation() {
        const data = await api(`/history?conversation_id=${encodeURIComponent(activeConversation)}`);
        if (data.conversation_id !== activeConversation) return;
        el('assistant-messages').replaceChildren();
        for (const turn of data.history) { message('user', turn.prompt, [], turn.attachments || []); message('assistant', turn.answer, turn.trace); }
        if (!data.history.length) message('assistant', 'Nuevo chat, contexto vacío. Dime qué necesitas: podemos conversar, revisar tu comunidad o gestionar canales, roles y permisos.');
        el('assistant-messages').scrollTop = el('assistant-messages').scrollHeight;
    }
    async function changeConversation(id = null) {
        if (pending || changingChat || uploadingImage) return;
        changingChat = true; lockControls();
        el('assistant-feedback').textContent = id ? 'Abriendo conversación…' : 'Preparando un chat sin contexto anterior…';
        try {
            if (id) await api(`/conversations/${encodeURIComponent(id)}/activate`, { method: 'POST', body: '{}' });
            else {
                newChatRequest ||= crypto.randomUUID();
                await api('/conversations', { method: 'POST', body: JSON.stringify({ conversation_id: newChatRequest }) });
                newChatRequest = null;
            }
            retry = null; clearImage(); el('assistant-prompt').value = '';
            await refreshConversations(); await showConversation();
            el('assistant-feedback').textContent = id ? 'Conversación abierta. Solo se usará su contexto.' : 'Chat nuevo listo. Las otras conversaciones se conservaron y no se enviarán al modelo.';
        } catch (error) {
            el('assistant-conversation-select').value = activeConversation || '';
            el('assistant-feedback').textContent = error.message;
        } finally { changingChat = false; lockControls(); if (ready) el('assistant-prompt').focus(); }
    }
    async function refreshUsage() {
        const target = el('assistant-usage');
        try {
            const { usage } = await api('/usage');
            if (!usage.provider_calls) { target.textContent = 'Consumo de las últimas 24 h: todavía no hay uso informado por el proveedor.'; return; }
            const number = value => value === null ? 'sin informar' : new Intl.NumberFormat('es').format(value);
            target.textContent = `Últimas 24 h · Entrada: ${number(usage.input_tokens)} · Salida: ${number(usage.output_tokens)} · Entrada cacheada: ${number(usage.cache_hit_tokens)} · Entrada nueva: ${number(usage.cache_miss_tokens)}${usage.cache_hit_percent === null ? '' : ` · Cache hit: ${usage.cache_hit_percent}%`}`;
        } catch { target.textContent = 'No se pudo actualizar el consumo. Se comprobará tras la siguiente consulta.'; }
    }
    async function boot() {
        try {
            const config = await fetch('/api/auth/config?next=%2Fasistente').then(response => response.json());
            if (!config.enabled) { el('assistant-feedback').textContent = 'Falta activar el inicio con Discord en el alojamiento.'; return; }
            const response = await fetch('/api/auth/session'); session = await response.json();
            if (!response.ok) return;
            el('assistant-user').textContent = session.user.name;
            el('assistant-login').hidden = true;
            const assistant = await api('/config');
            el('assistant-model').textContent = `${assistant.model} · ${assistant.daily_limit === 0 ? 'Sin cupo diario de consultas' : `${assistant.daily_limit} consultas por persona cada 24 h`} · Hasta ${assistant.max_output_tokens} tokens de salida por paso.`;
            await refreshUsage();
            await refreshConversations(); await showConversation();
            el('assistant-new-chat').hidden = false; el('assistant-conversations').hidden = false;
            if (!assistant.ready) { el('assistant-feedback').textContent = 'El asistente está preparado. Falta activarlo y configurar la clave del proveedor en el servidor.'; return; }
            ready = true; lockControls();
            el('assistant-form').hidden = false;
        } catch (error) { el('assistant-feedback').textContent = error.message; }
    }
    el('assistant-form').onsubmit = async event => {
        event.preventDefault();
        const prompt = el('assistant-prompt').value.trim();
        if (pending || changingChat || uploadingImage || !ready || !activeConversation || !prompt) return;
        pending = true; lockControls();
        // Un reintento de transporte usa el mismo ID para no duplicar creaciones.
        if (!retry || retry.prompt !== prompt || retry.conversation_id !== activeConversation || JSON.stringify(retry.attachment_ids) !== JSON.stringify(selectedImages.map(file => file.id))) {
            retry = { prompt, request_id: crypto.randomUUID(), conversation_id: activeConversation, attachment_ids: selectedImages.map(file => file.id) }; message('user', prompt, [], selectedImages);
        }
        const started=Date.now();
        const progress=setInterval(()=>{el('assistant-feedback').textContent=`Procesando tu petición · ${Math.floor((Date.now()-started)/1000)} s. Puedes mantener esta pestaña abierta.`;},5000);
        el('assistant-feedback').textContent = 'Preparando tu respuesta…';
        try {
            const result = await api('/ask', { method: 'POST', body: JSON.stringify(retry) });
            message('assistant', result.answer, result.trace); el('assistant-prompt').value = ''; retry = null; clearImage();
            el('assistant-feedback').textContent = result.failed ? 'La consulta terminó con un error. Revisa las herramientas ejecutadas antes de repetir una creación.' : 'Consulta completada.';
            try { if (await refreshConversations()) await showConversation(); } catch { /* La respuesta ya quedó visible; se actualizará el selector al recargar. */ }
        } catch (error) {
            el('assistant-feedback').textContent = `${error.message} Si reenvías esta misma petición, se conservará su identificador.`;
            if (error.status === 409) {
                try {
                    if (await refreshConversations()) {
                        retry = null; el('assistant-prompt').value = ''; await showConversation();
                        el('assistant-feedback').textContent = 'La conversación activa cambió desde otro acceso. Ya estás en ese chat; puedes volver al anterior desde el selector.';
                    }
                } catch { /* Conserva el error y el identificador para reintentar. */ }
            }
        }
        finally { clearInterval(progress); pending = false; lockControls(); await refreshUsage(); }
    };
    el('assistant-prompt').addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!el('assistant-form').hidden) el('assistant-form').requestSubmit(); }
    });
    el('assistant-new-chat').onclick = () => changeConversation();
    el('assistant-image-clear').onclick = () => { clearImage(); retry = null; };
    el('assistant-image').onchange = async () => {
        const files = [...el('assistant-image').files]; if (!files.length) return;
        clearImage(); retry = null;
        if (files.length > 4 || files.some(file => file.size > 2 * 1024 * 1024)) { el('assistant-feedback').textContent = 'Adjunta hasta cuatro archivos de 2 MB cada uno.'; return; }
        uploadingImage = true; lockControls();
        try {
            for (const file of files) {
            const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
            const result = await api('/attachments', { method: 'POST', body: JSON.stringify({ conversation_id: activeConversation, name: file.name, content }) });
            if(!selectedImages.some(file=>file.id===result.attachment.id)) selectedImages.push(result.attachment); } retry = null;
            el('assistant-image-name').textContent = selectedImages.map(file => file.name).join(', '); el('assistant-image-clear').hidden = false;
            el('assistant-feedback').textContent = 'Archivos listos para analizar o publicar. Admite imágenes y TXT, MD, CSV, JSON y LOG.';
        } catch (error) { clearImage(); el('assistant-feedback').textContent = error.message; }
        finally { uploadingImage = false; lockControls(); }
    };
    el('assistant-conversation-select').onchange = event => changeConversation(event.target.value);
    window.addEventListener('focus', async () => {
        if (!session || !activeConversation || pending || changingChat || el('assistant-prompt').value.trim()) return;
        changingChat = true; lockControls();
        try { if (await refreshConversations()) { retry = null; await showConversation(); } } catch { /* La próxima petición vuelve a comprobar la sesión. */ }
        finally { changingChat = false; lockControls(); }
    });
    document.querySelectorAll('[data-prompt]').forEach(button => { button.onclick = () => { if (pending || changingChat) return; el('assistant-prompt').value = button.dataset.prompt; el('assistant-prompt').focus(); }; });
    boot();
})();
