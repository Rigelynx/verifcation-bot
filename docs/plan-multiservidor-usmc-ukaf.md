# Plan: USMC + UKAF en una plataforma multiserver

**Estado:** implementación local de los módulos del plan completada y comprobada con 100 pruebas y un ensayo sobre una copia de la base real. Pendientes: despliegue en HolyHosting, piloto real USMC/UKAF y decisión de publicación pública. Ver [operación y evidencias](multiserver-operacion.md).

**Alcance de distribución:** se prepara la arquitectura para que el bot pueda invitarse a más servidores; publicarlo en un directorio o abrir el alta a cualquiera sigue siendo una decisión posterior. El panel del propietario seguirá siendo privado.

## Objetivo

El bot atenderá los servidores USMC y UKAF con comandos globales. Cada servidor tendrá su propia economía, configuración, comunidad y dashboard web. El dueño del bot controlará desde un panel central qué servidores se habilitan para la IA y qué capacidades se distribuyen. USMC conserva el estilo web actual; UKAF tendrá su identidad visual y ambos perfiles podrán personalizarse desde la web.

## Decisiones acordadas

- Mantener **una base SQLite compartida**, con aislamiento estricto por `guild_id` en cada consulta y escritura. No crear un archivo SQLite por servidor.
- Identificar cuentas y saldos por `(guild_id, discord_id)`. La misma persona podrá tener saldos e inventarios separados entre USMC y UKAF.
- Usar el ID inmutable de Discord como clave del servidor. Los nombres visibles y siglas pueden cambiar.
- Registrar comandos globales para producción. Probar cambios primero como comandos limitados al servidor de pruebas, que Discord actualiza al instante; los comandos globales pueden tardar en reflejar cambios. Discord también documenta que el cliente puede rechazar una versión antigua y recargar el comando. [Guía oficial de comandos](https://docs.discord.com/developers/docs/interactions/slash-commands)
- Conservar el diseño USMC como perfil inicial y sumar UKAF como segundo perfil; cambiar de perfil no cambia datos ni permisos.
- Guardar las claves de IA en el servidor. El propietario controla el alta, activación, proveedor y capacidades de cada servidor desde el panel central.
- Verificar identidad y permisos dentro del servidor seleccionado. Pertenecer a USMC no concede acceso al dashboard de UKAF, ni al revés.
- Preparar el bot para instalaciones en otros servidores, pero mantener la decisión de listado público como una fase opcional. Que el bot sea instalable públicamente **no** hace público el panel del propietario.
- Mantener una consola central privada, accesible solo a IDs de Discord autorizados del propietario. Los administradores de una comunidad solo acceden al dashboard de su propio servidor.
- Mantener **un solo catálogo de comandos, neutral y común a todos los servidores**. No crear comandos exclusivos de USMC o UKAF. Si un comando o texto actual está demasiado ligado a una facción, renombrarlo y adaptarlo; los nombres, etiquetas, imágenes, mapas y plantillas se configuran por servidor. Los roles se configuran por ID dentro de cada comunidad.
- Crear una web pública de presentación del bot con inicio de sesión por Discord. Tras iniciar sesión, cada persona verá únicamente las comunidades en las que pertenece y tiene permisos; desde ahí abrirá la dashboard correspondiente. Esta web pública no expone la consola privada del propietario.

## Situación técnica inicial y solución implementada

Las cuentas, los expedientes y los permisos tenían claves globales. Ahora las cuentas y expedientes usan claves compuestas con `guild_id`, las consultas de datos quedan acotadas a la comunidad activa y SQLite comprueba las relaciones entre eventos/participantes, artículos/inventarios y bonos/reclamos. El contexto de una petición se mantiene mediante AsyncLocalStorage, incluso cuando se solapa con otra comunidad. La web selecciona el servidor mediante un enlace y una cabecera que siempre se validan contra membresía y roles de Discord. `GUILD_ID` conserva el significado de comunidad original para migración y compatibilidad.

## Arquitectura propuesta

### 1. Datos separados por servidor

Añadir y hacer cumplir `guild_id` en economía, inventario, compras, transacciones, recompensas, permisos de comandos, configuración, preguntas, expedientes, plantillas, registros de administración, sesiones de la web, reservas de servidores y ajustes de IA. Las claves que hoy identifican un usuario, producto o comando de forma global deberán incluir `guild_id` cuando sus valores pertenezcan a un servidor.

En cada operación de Discord, el servidor activo será `interaction.guildId`. En la web, vendrá de una sesión autenticada y autorizada. Ninguna petición del navegador podrá elegir libremente otro `guild_id` sin comprobar que el usuario pertenece a esa comunidad y tiene el rol de acceso correspondiente.

### 2. Economía aislada

- Cuentas: clave compuesta `(guild_id, discord_id)`.
- Inventario, órdenes, pagos, transacciones, recompensas por rol y límites de tienda: consultar por servidor de principio a fin.
- Ajustes de economía y permisos de comandos: una fila por servidor y comando.
- Historial y auditoría: incluir el servidor y el operador que inició el cambio.
- Todas las operaciones de pago, devolución y reclamación deben conservar su comportamiento de una sola ejecución dentro de cada servidor.

### 3. Portal web y dashboards

**Web central de presentación:** sitio público con identidad visual del bot, explicación de funciones, invitación/instalación, soporte y botón de inicio de sesión con Discord. Después del login muestra una página de acceso con las comunidades donde el usuario puede entrar al dashboard, además del estado de configuración básico que necesite para continuar. Si no tiene permisos en una comunidad, esa comunidad no se ofrece como destino.

**Dashboard de comunidad:** tras elegir una comunidad autorizada, el usuario ve exclusivamente su economía, roles, preguntas, expedientes, operaciones, canales y registros. Si solo tiene una comunidad disponible, puede entrar directamente. Los roles se comprueban contra ese servidor al acceder y al ejecutar cada acción; no confiar solo en el resultado inicial del login.

**Consola privada del propietario del bot:** ruta separada y cerrada por allowlist de ID de Discord, autenticación reforzada y sesiones cortas. Lista las instalaciones detectadas, estado de configuración, activación de capacidades/IA y enlace al dashboard de cada comunidad. No se muestra en el dashboard comunitario ni se habilita por tener un rol de administrador en un servidor. Las claves de proveedor se guardan en variables seguras del servidor y no se vuelven a mostrar en pantalla.

### 4. Instalación multiserver y posible distribución pública

- Discord ya informa al cliente de discord.js cuando el bot entra o sale de un servidor (`guildCreate` / `guildDelete`). Usar esos eventos para registrar o actualizar una fila de instalación por `guild_id`; al iniciar, reconciliar la lista de instalaciones con los servidores que el bot tiene disponibles. [Eventos de discord.js](https://discord.js.org/docs/packages/discord.js/main/Client%3Aclass)
- Una instalación nueva queda en estado **pendiente de configuración**: mostrar un mensaje de bienvenida/setup y registrar nombre e ID del servidor, fecha y estado. No habilitar IA ni operaciones que requieran datos/configuración hasta que estén preparados. El propietario controla capacidades globales y el administrador local termina la configuración.
- Si el bot sale de un servidor, marcar la instalación como inactiva y bloquear su dashboard. Definir antes del lanzamiento el periodo de conservación y el mecanismo para exportar/eliminar sus datos; no borrar registros de inmediato, porque puede haber auditoría o una salida accidental.
- Registrar comandos globales comunes para que estén disponibles en cada servidor que instale la app; Discord recomienda comandos de servidor durante pruebas y comandos globales al estar listos para producción. [Comandos de aplicación de Discord](https://docs.discord.com/developers/docs/interactions/slash-commands)
- Antes de invitarlo ampliamente, revisar el alcance de permisos solicitado, los intents privilegiados activados y la necesidad real de `GuildMembers` y `MessageContent`. El código actual solicita ambos; Discord recomienda pedir un intent privilegiado solo cuando una función realmente lo requiera. [Intents privilegiados](https://support-dev.discord.com/hc/en-us/articles/6207308062871-What-are-Privileged-Intents)
- La disponibilidad para muchas comunidades y el proceso de verificación/aprobación dependen de los límites y requisitos vigentes en Discord Developer Portal. Confirmarlos allí al acercarse al lanzamiento; no asumir que aparecer en un directorio como Top.gg equivale a verificación o aprobación de Discord.
- Lista pública/directorio, textos de privacidad, soporte, invitación con permisos mínimos y proceso de eliminación de datos pertenecen a una fase de lanzamiento aparte, después de probar aislamiento con comunidades piloto.

### 5. Catálogo de comandos neutral y configuración por servidor

El mismo catálogo y los mismos nombres de comandos estarán disponibles en todos los servidores. La comunidad configura cómo se llaman sus rangos, moneda, operaciones, mapas, artículos y reportes; no se crean variantes como `/usmc ...` o `/ukaf ...`. Si una capacidad no aplica a una comunidad, se configura, oculta o muestra como no disponible desde el mismo comando según su configuración, sin convertirla en propiedad exclusiva de una facción.

| Área | Comando/capacidad común | Ajustes propios de cada servidor |
|---|---|---|
| Ayuda y moderación | `/help`, `/mod`: lenguaje neutral y permisos locales | reglas, mensajes y plantillas de moderación |
| Verificación y expedientes | `/panel`, `/datos`: procesos configurables | preguntas, rangos, insignias y estilo visual |
| Eventos y asistencia | `/evento`: convocar, iniciar, lista, cierre y reporte AAR | términos, mapas/AO, equipos, campos y diseño del reporte |
| Reservas de servidores | `/servidor`: registrar, ocupar, liberar y consultar recursos reservables | tipos de recurso, códigos, sectores, capacidad y duración; en BRM5 se configura como servidor privado VIP |
| Economía y tienda | comandos y motor económicos comunes, aislados por `guild_id` | nombre de moneda, bonos, catálogo, precios y estética |
| Asistente | interfaz y permisos comunes | proveedor, capacidades aprobadas por el propietario y contexto del servidor |
| Administración | comandos para administrar la comunidad actual | nombres de opciones y roles; consola del propietario separada y privada |

Antes del lanzamiento público, revisar nombres y textos existentes como “Fondo Militar”, “batallón”, “Ronograd”, `S-RANK` o etiquetas USMC. Reescribirlos con términos neutrales cuando formen parte de la interfaz común, o hacerlos configurables cuando representen vocabulario local. El código no debe asumir que un servidor usa rangos militares, BRM5, Ronograd ni una economía temática. Los comandos que dependan de datos todavía no configurados deben explicar qué falta o mostrar una configuración inicial.

### 6. Perfil visual por servidor

Guardar por servidor nombre visible, siglas, paleta de color, emblema, portada e imágenes propias. Incluir como opciones iniciales:

- **USMC:** conservar el tema y las imágenes actuales.
- **UKAF:** tema propio basado en la referencia que compartió el usuario, con emblema, portada y textos UKAF.
- **Personalizado:** ajustar colores, nombre e imágenes desde el dashboard.

El editor de identidad solo será visible para quienes tengan el rol administrativo autorizado en ese servidor. Los assets subidos se guardan en la carpeta de ese `guild_id`.

### 7. IA para ambos servidores

El dueño habilita UKAF y USMC desde el panel central y decide las herramientas disponibles en cada uno. La IA compartirá una integración y un proveedor configurables, pero se ejecutará con el `guild_id`, permisos y datos de la comunidad activa.

Capacidades iniciales acordadas: resumir eventos y conversaciones accesibles, revisar actividad reciente de canales indicando el tamaño de la muestra, consultar roles/canales visibles y crear canales o roles usando los permisos reales de la persona y del bot. Cada acción queda auditada. Las peticiones no pueden cruzar datos entre comunidades.

Proveedor implementado: API directa de DeepSeek, con modelo automático deepseek-flash y medición de tokens de caché. [API DeepSeek](https://api-docs.deepseek.com/)

## Organización sugerida en el host

```text
data/
  database.sqlite
  guilds/
    <GUILD_ID_USMC>/
      branding/
      uploads/
    <GUILD_ID_UKAF>/
      branding/
      uploads/
  backups/
```

La economía y los ajustes van en SQLite, aislados por `guild_id`. Emblemas, portadas y cargas grandes van en la carpeta del servidor correspondiente. Confirmar que el directorio `data/` persiste al reiniciar o actualizar HolyHosting; programar copias de respaldo de SQLite y de los assets. No guardar claves del proveedor en esos assets ni en archivos servidos al navegador.

## Migración sin perder USMC

1. Hacer una copia comprobable de la base de datos y assets actuales.
2. Asociar toda fila antigua que representa datos de USMC al ID real de USMC; no inferir el servidor a partir del nombre de usuario.
3. Separar los saldos duplicados o ambiguos por `discord_id` antes de cambiar la clave. No duplicar automáticamente saldos globales en UKAF.
4. Crear configuración vacía e independiente de UKAF: economía, roles, canales, tienda, preguntas, dashboard y permisos.
5. Mantener durante una fase de comprobación la capacidad de regresar a la copia anterior.

## Fases de trabajo

1. **Inventario y diseño de migración:** revisar cada tabla, ruta web, comando y logger. Definir para cada dato si es global del bot o propio de un servidor.
2. **Aislamiento de base de datos:** migrar datos USMC y añadir partición por servidor para economía y configuración.
3. **Contexto y autenticación multiserver:** comandos leen el servidor de la interacción; la web deja elegir solo servidores autorizados.
4. **Panel central y perfil UKAF:** distribuir la IA por servidor y personalizar la identidad visual de UKAF sin alterar USMC.
5. **Validación en un segundo servidor:** instalar en UKAF con datos vacíos y comprobar funciones sin tocar producción USMC.
6. **Catálogo neutral:** revisar nombres, descripciones, respuestas y opciones para que un mismo catálogo sirva a cualquier servidor; convertir supuestos de facción en ajustes.
7. **Instalación multiserver y portal:** detección de entrada/salida, alta pendiente, web de presentación, login Discord, selección segura de comunidad y consola privada del propietario.
8. **Piloto controlado:** probar USMC y UKAF con el mismo catálogo de comandos y sus configuraciones separadas; después probar un servidor adicional con datos vacíos y permisos mínimos.
9. **Comandos globales:** publicar el catálogo global después de aprobar la prueba limitada al servidor. La publicación en directorios queda opcional y posterior.

## Pruebas de aceptación con evidencia

- La misma cuenta de Discord tiene saldo e inventario distintos en USMC y UKAF.
- Un evento, compra, asistencia, recompensa, reporte o servidor privado de UKAF no aparece en USMC.
- Cambiar permisos de `/tienda` o `/evento` en UKAF no cambia los de USMC.
- La web rechaza el acceso a un servidor donde el usuario perdió su rol; cambiar el selector o alterar la petición HTTP no permite acceder.
- La auditoría registra el `guild_id` y operador correctos.
- Activar la IA para UKAF no la habilita en otros servidores; cada consulta usa únicamente canales y datos visibles en el servidor activo.
- La clave del proveedor no aparece en HTML, JavaScript, respuestas de la API ni logs.
- Cambiar el perfil visual de UKAF no modifica USMC. El panel y los assets continúan disponibles tras reiniciar el host.
- Los reintentos de pago y compra no duplican saldos, inventario ni auditoría.
- Las pruebas de comandos de servidor pasan antes de publicar los globales.
- Una instalación nueva se detecta y queda aislada y pendiente de configuración; salir del servidor bloquea el acceso comunitario sin borrar datos auditables prematuramente.
- Ningún administrador comunitario puede abrir la consola privada del propietario; un administrador local solo puede gestionar su comunidad.
- Los comandos globales tienen nombres, descripciones y flujos neutrales; ningún comando se reserva para USMC o UKAF. Cambiar la configuración visual de una comunidad no altera las demás.
- Una comunidad sin configuración BRM5 no recibe supuestos como Ronograd, VIP o rangos USMC; sus administradores pueden configurar vocabulario y recursos desde el flujo común.
- El portal público muestra presentación e inicio de sesión, pero solo permite abrir dashboards de comunidades autorizadas; la consola privada de propietario no aparece como dashboard comunitario.
- La invitación solicita solo permisos necesarios, y cada intent privilegiado se justifica por una función documentada.
- El propietario puede ver las instalaciones activas; el nombre, ID y estado de una instalación no permiten a un usuario elegir otro `guild_id` para leer o cambiar sus datos.

**Pendiente operativo:** desplegar y completar el piloto con los servidores reales. El registro global y la migración se ejecutarán al arrancar esta versión en el host. La revisión de publicación/intents y la decisión de listar el bot siguen siendo posteriores al piloto.
