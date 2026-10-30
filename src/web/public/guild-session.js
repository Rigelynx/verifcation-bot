(() => {
    const params = new URLSearchParams(location.search), guild = params.get('guild');
    const selected = /^\d{17,20}$/.test(guild || '') ? guild : sessionStorage.getItem('community_guild');
    if (selected) sessionStorage.setItem('community_guild', selected);
    window.communityGuild = selected;
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
        if (selected && url.origin === location.origin && /^\/api\/(admin(?:\/|$)|patrol(?:\/|$)|assistant(?:\/|$)|community(?:\/|$)|auth\/(session|config)$)/.test(url.pathname)) {
            const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
            headers.set('X-Guild-Id', selected); init = { ...init, headers };
        }
        return fetchOriginal(input, init);
    };
    document.addEventListener('DOMContentLoaded', () => {
        if (!selected) return;
        document.querySelectorAll('a[href]').forEach(link => {
            const url = new URL(link.href, location.origin);
            if (url.origin === location.origin && /^\/(admin|patrullas|asistente|verify)$/.test(url.pathname)) { url.searchParams.set('guild', selected); link.href = url.pathname + url.search; }
            if (url.origin === location.origin && url.pathname === '/auth/discord') {
                const next = new URL(url.searchParams.get('next') || '/portal', location.origin);
                next.searchParams.set('guild', selected); url.searchParams.set('next', next.pathname + next.search); link.href = url.pathname + url.search;
            }
        });
    });
})();
