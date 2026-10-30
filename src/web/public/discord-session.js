window.DiscordWeb = {
    async bootAdmin() {
        const info = document.getElementById('discord-admin-info');
        const link = document.getElementById('discord-admin-login');
        try {
            const config = await fetch('/api/auth/config?next=%2Fadmin').then(res => res.json());
            link.hidden = !config.enabled;
            document.getElementById('login-form').hidden = !config.legacy_allowed;
            const error = new URLSearchParams(location.search).get('auth_error');
            if (error) info.textContent = error;
            else info.textContent = config.enabled ? 'Entra con Discord. Tu rol determinará el acceso al centro de mando.' : 'Discord OAuth2 aún no está configurado. El acceso actual sigue disponible.';
            if (!config.enabled) return false;
            const res = await fetch('/api/auth/session');
            const data = await res.json();
            if (!res.ok) { if (data.message) info.textContent = data.message; return !config.legacy_allowed; }
            if (!data.access.admin) { info.textContent = 'Tu cuenta está identificada, pero tu rol no tiene acceso de Alto Mando. Puedes usar el portal de operaciones si tienes permiso.'; return true; }
            adminCookieSession = true; adminCsrfToken = data.csrf_token; adminToken = '';
            localStorage.removeItem('usmc_admin_key');
            updateOperatorBadge({ operator_name: data.user.name, discord_id: data.user.id });
            await loadDashboardData();
            return true;
        } catch (error) { info.textContent = 'No pude comprobar el inicio de sesión. Recarga la página.'; return true; }
    }
};
