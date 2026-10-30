# Publicar la actualización del bot oficial

Documento para el propietario y los administradores del despliegue. La guía para compartir con los usuarios es [Tutorial de la actualización](tutorial-novedades.md); los oficiales tienen su [guía de eventos](guia-oficiales-eventos.md).

## 1. Preparar el bot oficial

1. Conserva una copia de los datos y las imágenes del oficial antes de sustituir su versión. `npm run backup` está disponible en esta versión; si lo ejecutas en el bot de pruebas, respalda los datos de pruebas, no los del oficial.
2. Detén el proceso oficial, sube el código y los archivos públicos de la actualización y conserva sus variables y su base de datos.
3. Mantén el token, `CLIENT_ID`, secreto OAuth, `WEB_URL`, `DB_PATH` y `GUILD_ID` que correspondan al **oficial**. El `.env` de esta carpeta se configuró para el **bot de pruebas**; no lo copies sobre el oficial. Conserva el `GUILD_ID` original para asociar sus datos previos.
4. Si distribuirás el oficial a varias comunidades, usa `COMMAND_SCOPE=global`. El bot de pruebas puede mantener `COMMAND_SCOPE=guild` y su propio `COMMAND_TEST_GUILD_ID`.
5. Ejecuta `npm start` desde el panel de HolyHosting. El arranque registra los comandos y realiza las migraciones necesarias.

## 2. Comprobar la dirección pública y los accesos

`WEB_URL` debe ser el origen público que abrirán los usuarios, con su dominio, HTTPS y puerto si corresponde; no debe terminar en `/admin` o `/patrullas`. En la aplicación de Discord del **bot oficial**, el retorno OAuth debe coincidir exactamente con:

```text
TU_WEB/auth/discord/callback
```

La web secundaria usa la misma instancia de Express y el mismo puerto de HolyHosting. Sus accesos son:

| Dirección | Uso |
| --- | --- |
| `TU_WEB/` | Presentación pública |
| `TU_WEB/portal` | Iniciar sesión y elegir una comunidad autorizada |
| `TU_WEB/admin?guild=ID_DEL_SERVIDOR` | Dashboard administrativo de esa comunidad |
| `TU_WEB/patrullas?guild=ID_DEL_SERVIDOR` | Portal de Operaciones para oficiales |
| `TU_WEB/asistente?guild=ID_DEL_SERVIDOR` | Asistente para las cuentas autorizadas |
| `TU_WEB/owner` | Consola privada del propietario del bot |

Para compartir accesos de operaciones, recomienda **`/patrulla`**: genera la dirección con el servidor correcto y evita repartir enlaces del bot de pruebas.

## 3. Habilitar el acceso de los oficiales

En el dashboard de cada comunidad, entra en **Configuración**, elige su **Rol de Oficiales** y guarda. También puedes usar:

```text
/admin configurar rol_oficial:@Oficiales rol_admin:@AltoMando
```

Sustituye esos roles por los reales de la comunidad y asígnalos a las personas correspondientes. El rol de Oficial forma parte de la autorización operativa existente del bot, que también se usa en comandos y revisión; revisa **Protocolos** para delimitar qué comandos utilizará cada rol.

El acceso web se comprueba con los roles actuales del servidor. Una concesión de comandos en **Protocolos** no da por sí sola un rol de acceso al portal.

Configura además los canales de convocatoria, revisión y logs, y al menos una plantilla compatible con patrullas. Los servidores VIP se registran por comunidad desde **Servidores privados** o `/servidor agregar`.

## 4. Configurar la IA cuando corresponda

1. Guarda la clave real de DeepSeek solamente en el alojamiento del oficial.
2. Habilita `ASSISTANT_ENABLED` e identifica al propietario en `BOT_OWNER_IDS`.
3. Entra en `/owner`, selecciona la instalación y usa **Configurar IA**.
4. Define las cuentas autorizadas, capacidades de gestión y cupo diario; **0** desactiva el cupo del bot.
5. Comprueba que el usuario y el bot tengan permisos y jerarquía para las acciones que vas a utilizar.

El asistente es privado y su habilitación es independiente del acceso ordinario de oficiales al portal de eventos. Un oficial no recibe acceso a la IA automáticamente por tener ese rol.

## 5. Ensayo de lanzamiento

Antes de publicar el anuncio, comprueba en la instalación oficial actualizada:

- Un administrador entra con `/admin panel-web` y un oficial con `/patrulla`, cada uno usando su cuenta.
- El oficial ve las actividades de su comunidad y puede crear y publicar una patrulla pequeña.
- Puede añadir participantes, pasar su propia lista, organizar equipos y guardar el AAR.
- Al finalizar, el reporte aparece, se aplican los pagos/acreditaciones que correspondan y se libera la reserva del servidor.
- Una corrección modifica el mensaje original sin otra paga.
- Los usuarios de IA autorizados pueden iniciar **Nuevo chat** y volver al anterior desde el selector.
- Si utilizas dos comunidades, sus saldos, eventos, expedientes y configuraciones aparecen separados.

Las **100 pruebas locales** comprueban el código con bases temporales, Discord e IA simulados. Ese resultado no sustituye este ensayo con el bot oficial conectado a Discord y su dirección pública.

## 6. Compartir la actualización

Publica el primer bloque de [Anuncio para Discord](anuncio-actualizacion-discord.md) en el canal de novedades y fija el segundo en el canal de oficiales. Los dos usan comandos, por lo que no requieren publicar una dirección inventada.

Comparte también la [guía de oficiales](guia-oficiales-eventos.md) con el personal que organizará eventos y la [guía completa](tutorial-novedades.md) con los administradores. Estos archivos están en el proyecto; para que los lean desde Discord debes adjuntarlos o copiar el texto del anuncio. No se publican automáticamente como páginas de la web.
