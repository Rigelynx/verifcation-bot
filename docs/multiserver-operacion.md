# Operación multiserver

## Estado de la entrega

Implementación local: aislamiento por comunidad, portal con selección de servidor, identidad visual editable, controles de IA por instalación, comandos neutrales/globales y respaldo de SQLite más imágenes. El piloto contra Discord y HolyHosting reales requiere desplegar esta versión; los tests usan clientes y proveedores simulados.

## Actualizar HolyHosting

1. Conservar el `GUILD_ID` original de USMC. Identifica los datos anteriores durante la migración; no se sustituye al añadir UKAF.
2. Detener el proceso actual y conservar una copia de la base, sus archivos WAL/SHM y los assets antes de sustituir la versión. También se puede ejecutar `npm run backup` con esta versión: genera una instantánea consistente mediante SQLite, incluyendo WAL, y copia `guilds/`.
3. Subir los archivos de código y assets. Conservar la base y las variables de entorno actuales.
4. Añadir `BOT_OWNER_IDS` con tu ID personal y `COMMAND_SCOPE=global`. Mantener `CLIENT_ID`, `DISCORD_CLIENT_SECRET` y `WEB_URL`. El origen de `WEB_URL` debe coincidir exactamente con la dirección que abres en el navegador: protocolo HTTP o HTTPS, host y puerto. Puedes usar la dirección proporcionada por el alojamiento. No publicar claves en Discord ni incluirlas en capturas.
5. Ejecutar `npm start`. La migración genera respaldos previos, conserva los saldos y cambia las claves de cuentas y expedientes para incluir la comunidad. Si no puede resolver la comunidad original o completar la migración, el inicio se detiene.
6. Abrir `/owner`, entrar con Discord y comprobar las instalaciones. Invitar el mismo bot a UKAF. Desde `/portal`, abrir cada dashboard y configurar roles, canales, preguntas y economía propios.
7. En **Configuración**, editar identidad, siglas, tema, color, logo y portada. PNG, JPG y WebP de hasta 2 MB se guardan en la carpeta del servidor. También se aceptan URLs HTTPS para las imágenes. USMC conserva su perfil; UKAF tiene su propio preset y emblema inicial sustituible.
8. Para la IA, configurar DEEPSEEK_API_KEY en el host y `ASSISTANT_ENABLED=true`. En `/owner`, elegir la instalación y pulsar **Configurar IA**: activación, modelo de DeepSeek opcional, cupo diario (0 lo desactiva), hasta diez usuarios y ocho capacidades para crear, editar, mover/ordenar o borrar canales/roles, asignar/retirar roles y configurar permisos. Las herramientas siguen exigiendo permisos y jerarquía de Discord. Los controles nuevos se migran inicialmente desde la autorización previa de creación correspondiente y luego se guardan de forma independiente por comunidad.

## Ubicación de los datos

Las nuevas instalaciones sin base anterior utilizan `data/database.sqlite`. Si ya existe `database.sqlite` en la raíz, se sigue utilizando para preservar el arranque actual. `DB_PATH` permite elegir otra ubicación tras trasladar la base de forma controlada. `USMC_DB_PATH` continúa admitido por compatibilidad.

Junto al archivo SQLite se crean `guilds/<guild_id>/branding/` y `backups/`. Cada respaldo periódico contiene `database.sqlite`, una copia de las imágenes `guilds/` y un `manifest.json`. Un respaldo fallido contiene `INCOMPLETE.txt` y no debe restaurarse. Las copias previas a migración conservan el prefijo `before-guild-partition-...`. El host debe conservar estos directorios al reiniciar y actualizar. Copiar los respaldos fuera del mismo host para cubrir una pérdida del almacenamiento.

Por defecto se realiza un respaldo cada 24 horas mientras el proceso está funcionando. `BACKUP_INTERVAL_HOURS=0` desactiva el temporizador. El comando `npm run backup` permite hacer una copia inmediata. No se eliminan automáticamente los respaldos: revisa periódicamente su tamaño y conservación. Para restaurar, detener el proceso y recuperar conjuntamente la base y las imágenes del mismo respaldo; evitar mezclar el archivo restaurado con WAL/SHM de una ejecución diferente.

## Comandos

El catálogo se registra globalmente. `GUILD_ID` ya no determina el alcance de los comandos. Tras registrar los globales, el bot elimina su catálogo antiguo del servidor original para que este no oculte las versiones globales. Para pruebas inmediatas, usar `COMMAND_SCOPE=guild` y `COMMAND_TEST_GUILD_ID`. Esto no cambia dónde se guardan los datos.

Los nombres y descripciones son comunes a cualquier comunidad; no hay comandos exclusivos USMC/UKAF. Los botones y enlaces de Discord incluyen el servidor desde el que se abren. El inicio OAuth pide identidad; la membresía y los roles se comprueban con el bot en cada acceso protegido.

## Evidencia local

`npm run test:multiserver` ejecuta 100 pruebas de acceso, migración, contexto de comunidad, cuentas, inventarios, devoluciones, permisos, eventos, asistencia, reportes, sesión, branding, uploads, IA y registro de comandos. Incluye la interpretación de autorizaciones con respuestas simuladas, tareas de ocho creaciones a través de más de seis herramientas y cinco rondas, cupo diario desactivable, permisos actuales y conversaciones separadas. Se comprueba que Nuevo chat no llama al modelo, no arrastra mensajes ni planes anteriores, mantiene el cupo y conserva recibos y datos migrados. Se verificó también un ensayo anterior sobre una copia de la base real: un saldo conservado exactamente, una fila de inventario, nueve eventos, tres asistencias, tres servidores privados y cinco preguntas conservados; `PRAGMA quick_check` devolvió `ok`. La base original no se migró durante ese ensayo.

La revisión en navegador comprobó el guardado de IA para UKAF sin activarla en USMC y el guardado de identidad UKAF desde su dashboard. Se utilizaron datos de vista previa, sin conexiones reales a Discord ni a proveedores de IA.

## Piloto y publicación

Después del despliegue, comprobar con la misma cuenta en USMC y UKAF que cambian saldo, tienda, preguntas y roles; publicar un evento y un reporte de prueba en cada uno; probar pérdida de rol, retirada del bot y un reinicio del host. Este piloto real sigue pendiente y no se sustituye por los mocks.

Antes de un listado público, configurar el enlace `SUPPORT_URL`, revisar la página `/privacidad`, concretar la conservación y gestión de solicitudes de datos, y comprobar permisos/intents y requisitos actuales de Discord Developer Portal. El bot utiliza GuildMembers para gestión de miembros y MessageContent para las funciones que necesitan contenido de mensajes; esos accesos pueden requerir aprobación de Discord. Publicar en un directorio sigue siendo opcional.

## Esperas del asistente

El comando `/asistente` reconoce la interacción antes de inicializar la comunidad o comprobar permisos. La consulta muestra un mensaje privado de espera y edita ese mismo mensaje al terminar. El proveedor dispone de 90 segundos por petición y de un presupuesto total de 180 segundos para los pasos de la consulta. Los límites se ajustan mediante `ASSISTANT_REQUEST_TIMEOUT_SECONDS` (5–180) y `ASSISTANT_TOTAL_TIMEOUT_SECONDS` (10–600, nunca menor que una petición). Un timeout no inicia reintentos automáticos ni repite creaciones de canales o roles.

Los errores distinguen espera agotada, conexión, credencial rechazada, modelo no disponible y cuota. El diagnóstico de consola incluye proveedor, código y tiempo transcurrido; omite claves, preguntas y cuerpos de respuestas. Si vuelve a aparecer `[Late interaction]`, el campo `receivedAgeMs` se mide antes de preparar la comunidad: puede reflejar retraso de entrega, carga del proceso o diferencia entre el reloj local y Discord. Ampliar la espera del proveedor no cambia el plazo inicial que establece Discord.


## DeepSeek de pago y caché

La configuración local selecciona la API directa de DeepSeek. Ver [configuración, contadores y límites del ahorro](deepseek-cache.md). Se registran tokens informados por el proveedor sin mezclar usuarios ni comunidades; la consola del propietario agrega el consumo por instalación.

El asistente utiliza únicamente la API directa de DeepSeek. Se retiraron el proveedor anterior, su credencial local y el selector de proveedores; los ajustes anteriores se normalizan al arrancar, conservando permisos y consumo histórico. La comprobación real anterior recibió HTTP 401 con una clave deliberadamente ficticia, según confirmó el propietario. La generación con una clave real y el nuevo comportamiento autónomo aún necesitan validación en Discord.
