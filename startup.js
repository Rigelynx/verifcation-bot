// Lanzador para el arranque Node.js predeterminado de HolyHosting.
// En el panel: Bot js file = startup.js.
const { spawn } = require('node:child_process');
const path = require('node:path');

console.log('[BOOTSTRAP] Ejecutando start.sh para descargar la versión de GitHub antes de iniciar el bot.');
const child = spawn('bash', [path.join(__dirname, 'start.sh')], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, APP_DIR: process.env.APP_DIR || __dirname }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        if (!child.killed) child.kill(signal);
    });
}

child.on('error', error => {
    console.error('[BOOTSTRAP] No se pudo ejecutar start.sh:', error.message);
    console.error('[BOOTSTRAP] Comprueba que start.sh esté junto a startup.js y que la imagen de Holy incluya Bash.');
    process.exitCode = 1;
});
child.on('exit', (code, signal) => {
    if (signal) console.error(`[BOOTSTRAP] El proceso terminó con ${signal}.`);
    process.exitCode = code ?? (signal === 'SIGTERM' ? 143 : signal === 'SIGINT' ? 130 : 1);
});
