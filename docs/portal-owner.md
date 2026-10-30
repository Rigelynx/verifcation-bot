# Presentación y consola del propietario

Implementación inicial para la web Express del bot en HolyHosting.

## Accesos

- `/`: presentación pública, capacidades, explicación del acceso e invitación del bot.
- `/portal`: inicio con Discord y comunidades donde el usuario tiene permisos de administración u operaciones.
- `/owner`: consola privada. La página no incluye datos de instalaciones; su API exige sesión OAuth válida y un ID incluido en `BOT_OWNER_IDS`.
- `/admin`, `/patrullas`, `/verify`: accesos anteriores conservados.

## Configuración en HolyHosting

Mantener `CLIENT_ID`, `DISCORD_CLIENT_SECRET` y `WEB_URL` del OAuth actual. En Discord Developer Portal, la URL de retorno es `https://TU_DOMINIO/auth/discord/callback`. Añadir `BOT_OWNER_IDS=TU_ID_DISCORD` a las variables del host; no es un rol, un ID de servidor ni la clave maestra. `BOT_PUBLIC_NAME` personaliza el nombre visible; su valor inicial es RICO. Reiniciar el proceso con `npm start` después de cambiar variables.

La cuenta de propietario puede autenticarse desde `/owner` aunque no pertenezca a la comunidad principal. La sesión de identidad no concede permisos de comunidad: estos se comprueban contra Discord al abrir cada acceso. No hay clave maestra ni excepción por ser administrador de un servidor en la API del propietario.

## Funciones incluidas

La consola consulta la conexión y latencia del gateway, muestra las instalaciones y su estado, permite buscarlas por nombre/ID y filtrar activas/inactivas. La nueva tabla `bot_installations` conserva nombre, ID, icono y fechas; se actualiza cuando el bot conecta, entra, cambia datos o sale de un servidor. No borra automáticamente información de la comunidad. La portada usa las imágenes locales del proyecto, diseño adaptable, transiciones y preferencia de movimiento reducido.

El portal comprueba membresía y permisos con el bot. Los usuarios normales no reciben la lista global de instalaciones. La consola privada muestra solamente la presencia de credenciales de IA, nunca sus valores. El enlace de invitación no solicita permiso de Administrador; los permisos necesarios para las funciones utilizadas deben configurarse en Discord.

## Alcance actual

El portal ya abre dashboards aislados para cada comunidad autorizada. La consola permite distribuir IA por instalación y el dashboard comunitario permite guardar la identidad visual. Ver [operación multiserver](multiserver-operacion.md) para migración, backups, configuración y evidencias. Las comprobaciones de Discord, OAuth y proveedores contra los servicios reales siguen pendientes del despliegue en HolyHosting.
