const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requestCompletion, timeouts, ProviderError, normalizeUsage } = require('../src/assistant/providerTransport');
const config = { provider: 'deepseek', url: 'https://provider.invalid/completions', key: 'private-test-key' };
function delay(signal, ms) {
    return new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
        if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    });
}
test('provider budget allows 90-second requests, bounds configuration and preserves total time', () => {
    assert.deepEqual(timeouts({}), { requestMs: 90000, totalMs: 180000 });
    assert.deepEqual(timeouts({ ASSISTANT_REQUEST_TIMEOUT_SECONDS: '150', ASSISTANT_TOTAL_TIMEOUT_SECONDS: '20' }), { requestMs: 150000, totalMs: 150000 });
    assert.deepEqual(timeouts({ ASSISTANT_REQUEST_TIMEOUT_SECONDS: 'NaN', ASSISTANT_TOTAL_TIMEOUT_SECONDS: '-4' }), timeouts({}));
});
test('deadline covers a delayed response body and returns a Spanish error without retrying', async () => {
    let calls = 0;
    await assert.rejects(requestCompletion(config, {}, { timeoutMs: 20, fetch: async (_url, { signal }) => {
        calls++;
        return { ok: true, json: async () => { await delay(signal, 200); return { choices: [{ message: { content: 'Late' } }] }; } };
    } }), error => error instanceof ProviderError && error.code === 'TIMEOUT' && error.message.includes('DeepSeek no respondió') && !error.message.includes(config.key));
    assert.equal(calls, 1);
});
test('transport aborts and network failures do not expose raw exception text or keys', async () => {
    for (const [failure, expected] of [[new DOMException('The operation was aborted due to timeout', 'TimeoutError'), 'TIMEOUT'], [new Error(config.key), 'CONNECTION']]) {
        await assert.rejects(requestCompletion(config, {}, { timeoutMs: 100, fetch: async () => { throw failure; } }), error => {
            assert.equal(error.code, expected); assert.ok(!error.message.includes('The operation')); assert.ok(!error.message.includes(config.key)); return true;
        });
    }
});
test('provider authentication, quota and model failures are actionable and do not read private error bodies', async () => {
    for (const status of [401, 403, 404, 429, 503]) {
        await assert.rejects(requestCompletion(config, {}, { timeoutMs: 100, fetch: async () => ({ ok: false, status,
            json: async () => { throw new Error('The private provider body must not be read'); } }) }), error => error.code === 'HTTP' && error.httpStatus === status && error.message.includes('DeepSeek'));
    }
});
test('valid provider replies pass through unchanged and invalid reply shapes are rejected', async () => {
    const message = { content: 'Respuesta', tool_calls: [] };
    assert.deepEqual(await requestCompletion(config, {}, { timeoutMs: 100, fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message }] }) }) }), message);
    await assert.rejects(requestCompletion(config, {}, { timeoutMs: 100, fetch: async () => ({ ok: true, json: async () => ({ choices: [] }) }) }), error => error.code === 'INVALID_RESPONSE');
});

test('usage distinguishes unreported cache counts from zero and records provider counters', async () => {
    assert.equal(normalizeUsage({}).cache_hit_tokens, null);
    assert.equal(normalizeUsage({ prompt_cache_hit_tokens: 0 }).cache_hit_tokens, 0);
    assert.equal(normalizeUsage({ completion_tokens: -1 }).completion_tokens, null);
    let reported;
    const message = { content: 'OK' };
    const result = await requestCompletion(config, {}, { timeoutMs: 100, onUsage: value => { reported = value; },
        fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 512, completion_tokens: 12, total_tokens: 524,
            prompt_cache_hit_tokens: 384, prompt_cache_miss_tokens: 128 } }) }) });
    assert.deepEqual(result, message);
    assert.deepEqual(reported, { prompt_tokens: 512, completion_tokens: 12, total_tokens: 524, cache_hit_tokens: 384, cache_miss_tokens: 128 });
});
