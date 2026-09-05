require('dotenv').config();
const { createDiscordBot } = require('./bot/client');
const { createWebServer } = require('./web/server');

const PORT = process.env.PORT || 3000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

console.log('---------------------------------------------------------');
console.log('🎖️  INICIANDO SISTEMA DE VERIFICACIÓN MILITAR RETRO USMC');
console.log('---------------------------------------------------------');

// 1. Iniciar Cliente de Discord
const client = createDiscordBot();

// 2. Iniciar Servidor Web Táctico (Express)
const app = createWebServer(client);

const server = app.listen(PORT, () => {
    console.log(`🌐 [TERMINAL WEB ACTIVA]: http://localhost:${PORT}`);
    console.log(`🛡️ [PANEL DE CONTROL ADMIN]: http://localhost:${PORT}/admin`);
    console.log(`🔑 [CLAVE MAESTRA ADMIN]: ${process.env.ADMIN_KEY || 'USMC-COMMAND-2026'}`);
    console.log('---------------------------------------------------------');
});

// 3. Conectar Bot a Discord
if (DISCORD_TOKEN && DISCORD_TOKEN.trim().length > 10) {
    console.log('[Discord] Conectando bot al cuartel general...');
    client.login(DISCORD_TOKEN).catch(err => {
        console.error('❌ [Discord Error de Login]:', err.message);
        console.log('ℹ️  Revisa tu DISCORD_TOKEN en el archivo .env');
    });
} else {
    console.log('⚠️  [AVISO]: DISCORD_TOKEN no configurado en el archivo .env.');
    console.log('ℹ️  El servidor web ya está activo. Puedes abrir http://localhost:' + PORT + '/admin en tu navegador para configurar las preguntas y probar la interfaz.');
    console.log('ℹ️  Para conectar el bot a Discord, añade tu token en el archivo .env y reinicia.');
}

// Cierre elegante
process.on('SIGINT', () => {
    console.log('\n[USMC] Desconectando terminales y cerrando base de datos...');
    server.close(() => {
        client.destroy();
        process.exit(0);
    });
});
