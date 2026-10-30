/* Shared by command center and recruit form; native Web Animations, no dependency. */
(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const active = new Set(), effects = new WeakMap(), observed = new WeakSet(), seenKeys = new Set();
    const counts = new WeakMap();
    const ease = 'cubic-bezier(.22, 1, .36, 1)';
    const cardSelector = '.ops-card, .product-card, .telemetry-card, #questions-container > .form-group';
    let scanFrame = null, tabFrame = null;

    function play(element, frames, duration = 500, delay = 0) {
        if (!element || reduceMotion.matches || typeof element.animate !== 'function') return;
        effects.get(element)?.cancel();
        const effect = element.animate(frames, { duration, delay, easing: ease, fill: 'backwards' });
        effects.set(element, effect); active.add(effect);
        const clean = () => { active.delete(effect); if (effects.get(element) === effect) effects.delete(element); };
        effect.onfinish = clean; effect.oncancel = clean;
    }
    function enter(element, delay = 0) {
        play(element, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], 520, delay);
    }
    function shown(element) { return !!element.getClientRects().length; }
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
        let index = 0;
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const element = entry.target, key = element.dataset.motionKey;
            if (!key || !seenKeys.has(key)) enter(element, Math.min(index++ * 55, 165));
            if (key) { if (seenKeys.size > 1000) seenKeys.clear(); seenKeys.add(key); }
            observer.unobserve(element);
        }
    }, { threshold: .08 }) : null;

    function reveal(root = document) {
        const cards = [...root.querySelectorAll(cardSelector)];
        if (root.matches?.(cardSelector)) cards.unshift(root);
        for (const card of cards) {
            if (observed.has(card)) continue;
            observed.add(card);
            if (observer && !reduceMotion.matches) observer.observe(card);
        }
        document.querySelectorAll('.telemetry-value').forEach(counter => {
            const value = counter.textContent.trim(), previous = counts.get(counter);
            counts.set(counter, value);
            if (shown(counter) && previous !== undefined && previous !== value)
                play(counter, [{ opacity: .45, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], 380);
        });
    }
    function scheduleReveal() {
        if (scanFrame !== null) return;
        scanFrame = requestAnimationFrame(() => { scanFrame = null; reveal(); });
    }
    function sectionChanged(event) {
        if (tabFrame !== null) cancelAnimationFrame(tabFrame);
        tabFrame = requestAnimationFrame(() => {
            tabFrame = null;
            const section = document.getElementById(`tab-${event.detail}`);
            if (section && shown(section)) enter(section);
            document.querySelectorAll('#journal-hero-title, #journal-hero-description').forEach((element, index) => enter(element, index * 55));
            scheduleReveal();
        });
    }
    function init() {
        const mutationObserver = new MutationObserver(scheduleReveal);
        mutationObserver.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('usmc:tabchange', sectionChanged);
        document.querySelectorAll('.login-box, .hero-copy, .verification-portal .military-header').forEach((element, index) => enter(element, index * 60));
        // Hidden recruit status screens and dossier dialogs can appear without adding nodes.
        document.querySelectorAll('.dossier-modal, #success-screen, #already-verified-screen, #pending-review-screen').forEach(element => {
            new MutationObserver(() => { if (shown(element)) enter(element.querySelector('.dossier-modal-content') || element); })
                .observe(element, { attributes: true, attributeFilter: ['style'] });
        });
        const hero = document.querySelector('.command-hero'), image = hero?.querySelector('.hero-scene');
        if (hero && image) {
            let pointerFrame = null, point = null;
            const reset = () => {
                if (pointerFrame !== null) cancelAnimationFrame(pointerFrame);
                pointerFrame = null; point = null; image.style.transform = '';
            };
            hero.addEventListener('pointermove', event => {
                if (reduceMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
                point = { x: event.clientX, y: event.clientY };
                if (pointerFrame !== null) return;
                pointerFrame = requestAnimationFrame(() => {
                    pointerFrame = null;
                    const box = hero.getBoundingClientRect();
                    const x = Math.max(-1, Math.min(1, (point.x - box.left) / box.width * 2 - 1));
                    const y = Math.max(-1, Math.min(1, (point.y - box.top) / box.height * 2 - 1));
                    image.style.transform = `scale(1.035) translate3d(${x * -4}px, ${y * -3}px, 0)`;
                });
            }, { passive: true });
            hero.addEventListener('pointerleave', reset);
            document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
            reduceMotion.addEventListener('change', reset);
        }
        reduceMotion.addEventListener('change', () => {
            if (reduceMotion.matches) { for (const effect of active) effect.cancel(); observer?.disconnect(); }
        });
        reveal();
    }
    window.FieldMotion = Object.freeze({ reveal });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
