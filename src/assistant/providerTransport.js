class ProviderError extends Error {
    constructor(code, message, status = null) { super(message); this.name = 'ProviderError'; this.code = code; this.httpStatus = status; }
}
function seconds(value, fallback, min, max) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function timeouts(env = process.env) {
    const requestMs = seconds(env.ASSISTANT_REQUEST_TIMEOUT_SECONDS, 90, 5, 180) * 1000;
    const totalMs = Math.max(requestMs, seconds(env.ASSISTANT_TOTAL_TIMEOUT_SECONDS, 180, 10, 600) * 1000);
    return { requestMs, totalMs };
}
function normalizeUsage(usage) {
    const number = key => Number.isSafeInteger(usage?.[key]) && usage[key] >= 0 ? usage[key] : null;
    return { prompt_tokens: number('prompt_tokens'), completion_tokens: number('completion_tokens'),
        total_tokens: number('total_tokens'), cache_hit_tokens: number('prompt_cache_hit_tokens'), cache_miss_tokens: number('prompt_cache_miss_tokens') };
}
async function requestCompletion(config, payload, { fetch: httpFetch = globalThis.fetch, timeoutMs, onUsage }) {
    const provider = 'DeepSeek';
    const started = Date.now();
    const signal = AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs)));
    try {
        const response = await httpFetch(config.url, { method: 'POST', signal,
            headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
            await response.body?.cancel?.().catch(() => {});
            const messages = {
                401: `La clave API de ${provider} fue rechazada. Comprueba la clave del proveedor seleccionado y reinicia el bot.`,
                403: `${provider} no permite usar esta clave o este modelo. Revisa los permisos de tu cuenta.`,
                402: `${provider} requiere saldo disponible para esta consulta.`,
                404: `El modelo configurado no está disponible en ${provider}. Revisa el modelo en la configuración de IA.`,
                429: `${provider} alcanzó su límite de solicitudes o cuota. Espera antes de volver a intentarlo.`
            };
            throw new ProviderError('HTTP', messages[response.status] || `${provider} no pudo completar la consulta (HTTP ${response.status || 'desconocido'}). Inténtalo más tarde.`, response.status);
        }
        const body = await response.json();
        if (!body?.choices?.[0]?.message) throw new ProviderError('INVALID_RESPONSE', `${provider} devolvió una respuesta no válida. Inténtalo más tarde.`);
        if (onUsage && body.usage) onUsage(normalizeUsage(body.usage));
        return body.choices[0].message;
    } catch (error) {
        let failure = error;
        if (signal.aborted || ['TimeoutError', 'AbortError'].includes(error?.name)) {
            failure = new ProviderError('TIMEOUT', `${provider} no respondió dentro de ${Math.ceil(timeoutMs / 1000)} segundos. La consulta se detuvo; puedes volver a intentarlo.`);
        } else if (!(error instanceof ProviderError)) {
            failure = new ProviderError('CONNECTION', `No pude completar la conexión con ${provider}. Comprueba la conexión del host y vuelve a intentarlo.`);
        }
        // No headers, keys, prompts or provider response bodies enter diagnostic logs.
        console.warn('[Assistant provider]', { provider: config.provider, code: failure.code,
            httpStatus: failure.httpStatus, elapsedMs: Date.now() - started });
        throw failure;
    }
}
module.exports = { ProviderError, requestCompletion, timeouts, normalizeUsage };
