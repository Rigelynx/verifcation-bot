const { createWebServer } = require('./src/web/server');
const db = require('./src/database/db');

async function runFullVerificationTest() {
    console.log('====================================================');
    console.log('🛠️ INICIANDO PRUEBA DE INTEGRACIÓN Y VALIDACIÓN TOTAL');
    console.log('====================================================\n');

    // 1. Iniciar servidor Express de prueba en puerto 3001
    const app = createWebServer(null); // Sin cliente discord en vivo para el mock
    const testPort = 3001;
    const server = app.listen(testPort);
    const baseUrl = `http://localhost:${testPort}`;

    try {
        console.log('1. Probando inicialización de base de datos SQLite...');
        const questions = db.getQuestions();
        console.log(`   -> Total preguntas iniciales en SQLite: ${questions.length}`);
        if (questions.length === 0) throw new Error('No se inicializaron las preguntas por defecto.');

        const config = db.getConfig('test_guild_123');
        console.log(`   -> Configuración obtenida para guild test: base_name = "${config.military_base_name}"`);

        // 2. Probando API Admin Data
        console.log('\n2. Probando autenticación del Dashboard Admin...');
        const adminRes = await fetch(`${baseUrl}/api/admin/data`, {
            headers: { 'Authorization': 'Bearer USMC-COMMAND-2026' }
        }).then(r => r.json());
        if (!adminRes.success) throw new Error('Fallo al obtener datos de admin.');
        console.log('   -> Autenticación de oficial con ADMIN_KEY: OK');

        // 3. Probar agregar y actualizar preguntas dinámicas
        console.log('\n3. Probando creación y edición de preguntas dinámicas...');
        const newQRes = await fetch(`${baseUrl}/api/admin/questions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer USMC-COMMAND-2026'
            },
            body: JSON.stringify({
                label: '¿Experiencia previa en batallones tácticos?',
                description: 'Indica años o meses de servicio previo.',
                field_type: 'text',
                options: [],
                required: 1
            })
        }).then(r => r.json());
        console.log(`   -> Nueva pregunta creada con ID #${newQRes.id}`);

        // 4. Probar flujo de recluta: Creación de Token militar
        console.log('\n4. Probando generación de token de verificación militar...');
        const testDiscordId = '987654321098765432';
        const testUsername = 'Sgt_Morrison';
        const token = db.createVerificationToken(
            testDiscordId,
            testUsername,
            'https://cdn.discordapp.com/embed/avatars/2.png',
            'test_guild_123'
        );
        console.log(`   -> Token militar generado: ${token}`);

        // 5. Probar carga de datos del formulario con el token
        console.log('\n5. Recluta abre la web con su token (/api/verify-data/:token)...');
        const recruitData = await fetch(`${baseUrl}/api/verify-data/${token}`).then(r => r.json());
        if (!recruitData.success) throw new Error('Token inválido en el endpoint de verificación.');
        console.log(`   -> Formulario cargado correctamente para: ${recruitData.user.username}`);

        // 6. Enviar formulario de verificación
        console.log('\n6. Recluta transmite su declaración jurada (/api/verify/:token)...');
        const submitRes = await fetch(`${baseUrl}/api/verify/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                answers: {
                    'Nombre de Usuario / Indicativo en Roblox': 'Morrison_Ghost',
                    'Edad del Aspirante': 22,
                    'Especialidad o División de Interés': 'División de Aviación Táctica (Naval Aviation)',
                    '¿Cómo supiste de nuestro destacamento?': 'Convocatoria oficial en Discord',
                    'Confirmación del Código de Honor y Disciplina': 'Afirmativo: Acepto los protocolos y la disciplina del cuartel.',
                    '¿Experiencia previa en batallones tácticos?': '2 años en escuadrón aéreo'
                }
            })
        }).then(r => r.json());
        console.log(`   -> Respuesta del servidor: ${submitRes.message} (Estado: ${submitRes.status})`);

        // 7. Validar persistencia en la base de datos local SQLite
        console.log('\n7. Verificando expediente guardado en SQLite local (para /datos-usuario)...');
        const savedDossier = db.getVerificationByDiscordId(testDiscordId);
        if (!savedDossier) throw new Error('No se guardó el expediente en la base de datos.');
        console.log(`   -> Expediente encontrado: ID #${savedDossier.id}, Recluta: ${savedDossier.username}`);
        console.log(`   -> Respuestas almacenadas: ${Object.keys(savedDossier.answers).length} campos.`);
        console.log(`   -> Estado inicial: ${savedDossier.status}`);

        // 8. Probar resolución de oficial desde el panel web
        console.log('\n8. Oficial aprueba el expediente desde el Centro de Mando...');
        const actionRes = await fetch(`${baseUrl}/api/admin/verifications/${testDiscordId}/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer USMC-COMMAND-2026'
            },
            body: JSON.stringify({
                action: 'APROBADO',
                reason: 'Apto para el escuadrón de combate'
            })
        }).then(r => r.json());
        console.log(`   -> Estado actualizado a: ${actionRes.record.status}`);
        console.log(`   -> Observación del oficial: "${actionRes.record.reason}"`);

        // 9. PROBAR NUEVA FUNCIÓN: Detección de "Ya verificado" en el portal web
        console.log('\n9. Probando detección de recluta YA VERIFICADO en /api/verify-data/:token...');
        const verifiedUserToken = db.createVerificationToken(
            testDiscordId,
            testUsername,
            'https://cdn.discordapp.com/embed/avatars/2.png',
            'test_guild_123'
        );
        const checkVerifiedRes = await fetch(`${baseUrl}/api/verify-data/${verifiedUserToken}`).then(r => r.json());
        if (!checkVerifiedRes.already_verified || checkVerifiedRes.verification_status !== 'APROBADO') {
            throw new Error(`Se esperaba already_verified: true y status APROBADO, pero se obtuvo: ${JSON.stringify(checkVerifiedRes)}`);
        }
        console.log('   -> Detección de ya verificado en portal web: ¡CORRECTO! (already_verified: true)');

        // 10. PROBAR NUEVOS TIPOS: Radio y Checkbox dinámicos
        console.log('\n10. Probando creación de preguntas tipo RADIO y CHECKBOX...');
        const radioQ = await fetch(`${baseUrl}/api/admin/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer USMC-COMMAND-2026' },
            body: JSON.stringify({
                label: '¿Tienes micrófono activo?',
                description: 'Requerido para operativos de voz.',
                field_type: 'radio',
                options: ['Sí / Operativo', 'No / Fuera de servicio'],
                required: 1
            })
        }).then(r => r.json());
        console.log(`   -> Pregunta RADIO creada con ID #${radioQ.id}`);

        const checkQ = await fetch(`${baseUrl}/api/admin/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer USMC-COMMAND-2026' },
            body: JSON.stringify({
                label: 'Divisiones secundarias de apoyo',
                description: 'Marca todas las que te interesen.',
                field_type: 'checkbox',
                options: ['Logística', 'Primeros Auxilios', 'Comunicaciones'],
                required: 0
            })
        }).then(r => r.json());
        console.log(`   -> Pregunta CHECKBOX creada con ID #${checkQ.id}`);

        // 11. Limpiar datos de prueba
        console.log('\n11. Limpieza de datos de prueba...');
        db.removeVerification(testDiscordId);
        db.deleteQuestion(newQRes.id);
        db.deleteQuestion(radioQ.id);
        db.deleteQuestion(checkQ.id);
        console.log('   -> Datos de prueba limpiados correctamente.');

        console.log('\n====================================================');
        console.log('✅ TODAS LAS PRUEBAS DE INTEGRACIÓN PASARON AL 100%');
        console.log('====================================================\n');
    } catch (err) {
        console.error('❌ Error durante la prueba de validación:', err);
    } finally {
        server.close();
    }
}

runFullVerificationTest();
