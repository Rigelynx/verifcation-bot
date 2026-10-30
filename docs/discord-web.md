# Acceso con Discord y portal de patrullas

## Activación en HolyHosting

El código está implementado. Introduce `CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `GUILD_ID` y `WEB_URL` en las variables del alojamiento o en `.env`. Usa `.env.discord.example` como referencia. `WEB_URL` debe ser el origen público con HTTPS, sin `/admin` ni `/patrullas`. HTTP solo se permite en localhost/127.0.0.1 para desarrollo. No compartas secretos en el chat.

En Discord Developer Portal → aplicación del bot → OAuth2 → Redirects, registra exactamente `https://tu-dominio-publico/auth/discord/callback`. El flujo solicita `identify` y `guilds.members.read`. El bot debe estar conectado al servidor configurado y poder consultar miembros. Se utilizan los roles de Oficial y Alto Mando ya configurados.

Reinicia con `npm start`. `/patrulla` abre el nuevo portal; los comandos existentes siguen disponibles. `/admin panel-web` ofrece inicio con Discord cuando OAuth2 está configurado.

## Cómo entran los oficiales

1. Ejecutan `/patrulla` en Discord y pulsan **Abrir portal** en la respuesta privada del bot.
2. También pueden abrir directamente `WEB_URL/patrullas`, o el enlace **Operaciones ↗** de la barra del panel principal.
3. Pulsan **Continuar con Discord**. Cada persona utiliza su propia cuenta; el backend comprueba sus roles antes de mostrar los datos.

Los enlaces no conceden permisos por sí solos. La sesión de un oficial permite consultar eventos y gestionar los propios; Alto Mando conserva su acceso adicional. OAuth2 debe estar configurado para que el botón de inicio con Discord funcione.

## Tres accesos

| Dirección | Identidad y permiso | Uso |
| --- | --- | --- |
| `/verify` o `/verify/:token` | Cuenta de Discord del propio recluta | Completar su expediente; un enlace ajeno no permite consultar ni enviar sus respuestas |
| `/patrullas` | Oficiales / administradores según la autorización existente | Ver eventos activos y recientes, gestionar operaciones propias |
| `/admin` | Alto Mando / administrador autorizado | Panel administrativo completo |

Las sesiones duran cuatro horas. Las cookies son HttpOnly, SameSite=Lax y Secure con HTTPS. La base guarda un hash de la sesión, no el token OAuth de Discord. Los permisos se comprueban con el bot en cada solicitud protegida; las mutaciones requieren CSRF y rechazan orígenes ajenos.

Si OAuth2 no está configurado, la verificación por enlace personal y el acceso administrativo anterior siguen funcionando. Una vez configurado, la verificación exige la cuenta dueña del enlace y se deshabilita el acceso administrativo anterior. `ADMIN_LEGACY_LOGIN=true` permite habilitarlo expresamente como recuperación.

## Operaciones disponibles

Los oficiales pueden consultar eventos de la comunidad y modificar los que crearon. Alto Mando puede gestionar cualquiera. La API aplica estos permisos, no solo los botones.

- Crear patrullas por registro con plantilla, canal, paga y reserva opcional de servidor.
- Publicar o actualizar su convocatoria en Discord.
- Añadir por IDs o menciones a quienes no se inscribieron y retirar participantes, incluso si salieron de Discord.
- Pasar lista con **Presente / Ausente / No responde**. Solo el creador/encargado del evento puede cambiar estos estados, incluso si otro usuario tiene acceso administrativo. Los demás consultan la lista.
- Abrir directamente el evento con **Pasar lista en la web** desde `/evento lista`; tras identificarse en Discord, se abre el detalle correspondiente.
- Consultar el roster paginado, sin saldos personales de sus integrantes.
- Organizar equipos y designar al líder como primer ID de cada equipo.
- Guardar AO, resultado, bajas, XO, MVP, objetivos, notas y URL de imagen de evidencia.
- Finalizar mediante el mismo flujo que `/evento finalizar`.
- Publicar o editar un AAR terminado sin nuevos pagos.

La web y los comandos comparten datos. Guardar AAR guarda un borrador; Publicar o Finalizar lo envía a Discord. Si el cierre se completa pero el reporte falla, se puede reintentar su publicación. Si fallan parcialmente los roles de entrenamiento, el comando de Discord existente conserva su función de reintento.

El pase de lista guarda estado, encargado y fecha, y registra cada cambio en auditoría. Los estados **Ausente** y **No responde** conservan al participante en la lista, pero lo excluyen de pagos, roles de entrenamiento y aprobados del reporte. El encargado puede corregirlos antes de finalizar; después la lista queda cerrada. Los participantes no pueden anular esta revisión confirmándose desde Discord. **Sin revisar** significa que el encargado aún no marcó a esa persona; conserva el comportamiento anterior de cada tipo de evento. `/evento lista` muestra los estados guardados al actualizar el panel.

Las rutas reutilizan Express y el puerto actual. Como el formulario ya abre públicamente según lo confirmado por el usuario, no se necesita otra instancia. Hace falta el enlace HTTPS definitivo para registrar el callback.

## Validación

`npm run test:tactical` usa bases temporales y Discord simulado. Cubre OAuth, revocación de roles, CSRF, propiedad de formularios y eventos, aislamiento de comunidades y pagos sin duplicados. El acceso contra Discord real se comprueba después de configurar las variables y el callback.

Referencias: [OAuth2 oficial de Discord](https://docs.discord.com/developers/topics/oauth2), [HolyHosting para Node.js/bots](https://www.holy.gg/discord-bot).
