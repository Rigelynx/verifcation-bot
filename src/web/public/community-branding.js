(() => {
    let profile;
    const originalTitle = document.title;
    const $ = id => document.getElementById(id);
    async function applyProfile(givenProfile) {
        if (givenProfile) profile = givenProfile;
        else { const response = await fetch('/api/community/profile', { cache: 'no-store' }); if (!response.ok) return; profile = (await response.json()).profile; }
        document.body.dataset.communityTheme = profile.theme;
        document.documentElement.style.setProperty('--community-accent', profile.accent);
        document.title = `${profile.display_name} · ${originalTitle.replace(/^USMC\s*[·/]*\s*/, '')}`;
        for (const node of document.querySelectorAll('.journal-wordmark strong')) {
            const caption = node.querySelector('span'); node.replaceChildren(document.createTextNode(profile.short_name || profile.display_name)); if (caption) node.append(caption);
        }
        document.querySelectorAll('[data-community-label]').forEach(node => { node.textContent = `${profile.short_name || profile.display_name} / OPERACIONES`; });
        const logo = profile.logo_url || (profile.theme === 'ukaf' ? '/media/ukaf-crest.svg' : '/media/unit-crest.svg');
        document.documentElement.style.setProperty('--community-mark', `url("${logo.replace(/["\\]/g, '')}")`);
        document.querySelectorAll('img[src="/media/unit-crest.svg"]').forEach(img => { img.src = logo; img.alt = profile.display_name; });
        if (profile.banner_url) document.querySelectorAll('.hero-scene,.login-visual>img:first-child').forEach(img => { img.src = profile.banner_url; });
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) { const node = walker.currentNode; if (!['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName) && /USMC/.test(node.textContent)) node.textContent = node.textContent.replace(/USMC/g, profile.short_name || profile.display_name); }
        const config = $('bot-config-form');
        if (!config || $('community-branding-form')) return;
        const form = document.createElement('form'); form.id = 'community-branding-form'; form.className = 'community-branding-form';
        form.innerHTML = `<p class="journal-eyebrow">IDENTIDAD DE TU COMUNIDAD</p><h3>Un espacio con tu nombre.</h3><p>El tema, las imágenes y los colores pertenecen únicamente a este servidor.</p><div class="branding-fields">
            <label>Nombre visible<input name="display_name" maxlength="100" required></label><label>Siglas<input name="short_name" maxlength="16"></label>
            <label>Estilo<select name="theme"><option value="neutral">Neutro</option><option value="usmc">USMC · Clásico</option><option value="ukaf">UKAF · Azul y rojo</option><option value="custom">Personalizado</option></select></label><label>Color principal<input type="color" name="accent"></label>
            <label>Logo · URL HTTPS<input name="logo_url" type="text"><input type="file" data-image="logo" accept="image/png,image/jpeg,image/webp" aria-label="Subir logo"></label>
            <label>Portada · URL HTTPS<input name="banner_url" type="text"><input type="file" data-image="banner" accept="image/png,image/jpeg,image/webp" aria-label="Subir portada"></label></div><button type="submit" class="btn-retro">Guardar identidad</button><p class="branding-feedback" role="status"></p>`;
        config.parentElement.insertBefore(form, config);
        for (const key of ['display_name', 'short_name', 'theme', 'accent', 'logo_url', 'banner_url']) form.elements.namedItem(key).value = profile[key] || '';
        form.elements.theme.addEventListener('change', () => { const colors = { neutral: '#b8cba6', usmc: '#ddc9a2', ukaf: '#b84048' }; if (colors[form.elements.theme.value]) form.elements.accent.value = colors[form.elements.theme.value]; });
        const feedback = form.querySelector('[role=status]');
        async function csrf() { const res = await fetch('/api/auth/session'); if (!res.ok) throw new Error('Inicia sesión con Discord para editar la identidad.'); return (await res.json()).csrf_token; }
        form.addEventListener('submit', async event => {
            event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
            try {
                const response = await fetch('/api/admin/branding', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrf() }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
                const data = await response.json(); if (!response.ok) throw new Error(data.message);
                feedback.textContent = 'Identidad guardada. Recarga el panel para aplicar todas las imágenes y textos.';
                document.body.dataset.communityTheme = data.profile.theme; document.documentElement.style.setProperty('--community-accent', data.profile.accent);
            } catch (error) { feedback.textContent = error.message; } finally { button.disabled = false; }
        });
        form.querySelectorAll('[data-image]').forEach(input => input.addEventListener('change', async () => {
            const file = input.files[0]; if (!file) return;
            if (file.size > 2 * 1024 * 1024) { feedback.textContent = 'La imagen debe pesar menos de 2 MB.'; return; }
            input.disabled = true;
            try {
                const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
                const response = await fetch('/api/admin/branding/image', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrf() }, body: JSON.stringify({ kind: input.dataset.image, content }) });
                const data = await response.json(); if (!response.ok) throw new Error(data.message);
                form.elements.namedItem(input.dataset.image === 'logo' ? 'logo_url' : 'banner_url').value = data.url;
                feedback.textContent = 'Imagen subida. Pulsa Guardar identidad para usarla.';
            } catch (error) { feedback.textContent = error.message || 'No se pudo subir la imagen.'; } finally { input.disabled = false; }
        }));
    }
    window.applyCommunityProfile = applyProfile;
    document.addEventListener('DOMContentLoaded', () => applyProfile().catch(() => {}));
})();
