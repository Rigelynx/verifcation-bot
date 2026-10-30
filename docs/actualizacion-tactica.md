# Actualización táctica BRM5

La interfaz Field Journal combina una portada cinematográfica, navegación lateral, insignia propia de la unidad y fichas visuales de servidores e intendencia. Las imágenes decorativas se sirven desde `src/web/public/media`; los textos y acciones siguen siendo HTML accesible. El menú móvil conserva las mismas secciones y las preferencias de movimiento reducido se respetan.

La capa Field Motion añade entradas al cambiar de sección, aparición progresiva de fichas y preguntas, interacciones de botones, apertura de menús/modales y un desplazamiento leve de la imagen principal con el puntero en escritorio. Las actualizaciones periódicas del catálogo no repiten la entrada de las mismas fichas. El contenido permanece visible si JavaScript o las animaciones no están disponibles y el modo de movimiento reducido desactiva los efectos.

Las capturas actuales del diseño están en `assets/web-editorial-servidores.png`, `assets/web-editorial-tienda.png`, `assets/web-editorial-login.png`, `assets/web-editorial-movil.png` y `assets/web-editorial-verificacion.png`. Usan datos temporales de demostración. La insignia es una composición original para la interfaz de la unidad.

La decoración del portal incorpora escenas de patrullaje y planificación en eventos, AAR y participantes, avatares con insignia de respaldo y fichas de servidores con botón de copia del código. Las nuevas capturas están en `assets/portal-decorado.png`, `assets/portal-acceso-decorado.png`, `assets/portal-aar-decorado.png` y `assets/portal-decorado-movil.png`. La portada del panel principal cambia de escena según la sección. El acceso de oficiales se encuentra en `/patrulla`, `WEB_URL/patrullas` y **Operaciones ↗** en la barra del panel.

Ocupar un servidor actualiza la pizarra pública si fue desplegada con `/servidor lista fijar_panel:true`. No publica un aviso nuevo con cada ocupación. La disponibilidad corresponde a los registros de los oficiales y eventos; no es una consulta de jugadores o estado de conexión de Roblox.

La configuración existente de roles y permisos sigue siendo la fuente de autorización.

El portal `/patrullas` y el acceso con Discord para reclutas y Alto Mando están implementados. Su activación requiere las variables OAuth2 y el callback HTTPS descritos en [Acceso con Discord](discord-web.md). La web y los comandos comparten operaciones, participantes y AAR.

## Uso

- Reinicia con `npm start` para cargar los cambios y registrar los comandos.
- `/servidor lista fijar_panel:true` crea o actualiza la pizarra del canal. Intenta anclarla e informa si faltan permisos. La pizarra tiene páginas de cuatro servidores y marcas de tiempo relativas de Discord.
- La web incluye **Servidores privados** para registrar, editar, ocupar y liberar. Se sincroniza cada 30 segundos mientras la sección está visible; los cambios actualizan también la pizarra de Discord.
- Los servidores ocupados no se pueden eliminar. La reserva de un servidor y la creación de su evento se guardan juntas; una convocatoria que no consigue publicar su mensaje se cancela y libera su reserva.
- El editor de reportes muestra los equipos configurados y el personal sin asignar. El líder se elige entre miembros de la escuadra; el menú de equipos permite vaciar la escuadra activa. El formulario por IDs conserva el equipo elegido al abrirlo y responde antes de consultar miembros en Discord.
- `/evento editar-reporte` requiere un evento finalizado con un reporte publicado. Si el mensaje original se eliminó o no es accesible, la edición informa el problema y no publica un duplicado.
- La tienda tiene filtros de rangos/suministros y confirmación del precio. Los fallos detectados al entregar roles revierten los cambios posibles y reembolsan saldo, stock e inventario; si no se pueden restaurar todos los roles, el recibo indica que Alto Mando debe revisarlos.

## Persistencia y diagnóstico

Las migraciones añaden referencias de pizarra independientes del catálogo y pedidos contables. Conservan los datos existentes. Los servidores antiguos marcados `GLOBAL` se asignan al `GUILD_ID` configurado al arrancar; después, las consultas y acciones de servidores se limitan a esa comunidad. No se generan servidores de ejemplo por defecto.

`USMC_DB_PATH` permite usar una base separada. `USMC_SEED_DEMO_SERVERS=true` habilita explícitamente los servidores de ejemplo en una base vacía. Los pedidos `PENDING` de `shop_orders` permiten identificar una entrega interrumpida por un cierre abrupto del proceso; requieren revisión del operador antes de resolver su estado.

Los errores de botones y modales se capturan en el límite de la interacción. Una interacción que llega después del plazo de Discord no puede recuperarse: se registra su antigüedad e identificador de acción, sin registrar el token. Los formularios que abren modales deben responder directamente con `showModal`; no se debe añadir un `deferReply` antes de abrirlos.

## Comprobación local

`npm run test:tactical` usa una base temporal independiente y cubre reservas, creación de eventos, reembolsos, permisos de API, identidad de auditoría, formularios de IDs y edición sin duplicados. No requiere conectar el bot a Discord.

Las capturas `assets/panel-servidores-preview.png`, `assets/panel-tienda-preview.png` y `assets/panel-movil-preview.png` muestran datos de demostración. La interacción con Discord en vivo necesita comprobarse después del reinicio del bot.
