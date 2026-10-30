# Asistente privado con DeepSeek

El asistente dispone del mismo historial privado y herramientas desde Discord y la web. La integración está implementada; para usar el modelo real hay que configurar su clave de API directa. Las pruebas automatizadas utilizan un proveedor simulado y servidores ficticios: no crean canales o roles reales.

## Activación

1. Usa `.env.assistant.example` como referencia para las variables de HolyHosting. Configura `GUILD_ID` con el servidor que administrará el bot.
2. Configura `DEEPSEEK_API_KEY` y usa el modelo automático `deepseek-flash` (`ASSISTANT_MODEL` vacío), o indica otro modelo válido de la API directa.
3. Configura hasta 10 IDs de Discord en `ASSISTANT_ALLOWED_IDS`, separados por comas. Vacío permite únicamente al propietario del servidor. Un rol de Alto Mando o una clave administrativa web no bastan para entrar al asistente.
4. Activa `ASSISTANT_ENABLED=true` y reinicia el bot con `npm start`. La clave permanece en el servidor y nunca se devuelve al navegador.
5. Para usar la web, configura además el [inicio con Discord](discord-web.md). El callback OAuth existente sirve para `/asistente`.


Referencia oficial: [API DeepSeek](https://api-docs.deepseek.com/).

## Accesos y ejemplos

- Discord: `/asistente preguntar peticion:Resume los eventos recientes`, `/asistente web` y `/asistente nuevo` para empezar sin contexto anterior.
- Web: `WEB_URL/asistente`, botón Asistente del panel principal e inicio con la propia cuenta de Discord.
- Ejemplos: «Resume los últimos mensajes de #operaciones», «Investiga qué canales de texto se usan más y dime qué muestra revisaste», «Crea un rol llamado Patrulla Alpha con color #b8cba6», «Crea un canal de voz llamado Briefing dentro de la categoría Operaciones».

El usuario y el bot deben tener los permisos nativos de Discord que exige cada acción. La lista privada concede acceso al asistente, no permisos administrativos adicionales. La matriz existente puede deshabilitar `asistente:preguntar` tanto para Discord como para la web.

## Herramientas disponibles

| Herramienta | Alcance |
| --- | --- |
| `server_inventory` | Canales visibles para el usuario y el bot, nombres e IDs de roles |
| `read_channel` | Hasta 50 mensajes recientes de un canal de texto o anuncios accesible; texto acotado, fechas y enlaces |
| `channel_usage` | Hasta 8 canales y 30 mensajes recientes por canal; muestra explícita, sin afirmar inactividad histórica ni medir voz |
| `event_summary` | Un evento por ID o los últimos 10 visibles según sus canales: estado, asistencia y datos guardados del AAR |
| `propose_creations` | Guarda una propuesta concreta cuando se piden ideas o planificación; no modifica Discord |
| `create_channel` | Texto, voz o categoría; con categoría hereda permisos, sin categoría queda privado para solicitante y bot |
| `create_role` | Rol nuevo sin permisos, sin asignación a miembros ni mención masiva |
| `propose_actions` | Plan concreto de creaciones, cambios, borrados, asignaciones y permisos; no ejecuta las acciones |
| `inspect_channel` / `inspect_role` | Configuración, posición y permisos; el rol puede consultar miembros completos con `fetch_members=true` |
| `find_members` / `member_info` | Buscar miembros y consultar sus roles dentro de la comunidad actual |
| `permission_catalog` | Nombres de los permisos reconocidos y ejemplos en español |
| `update_channel` | Nombre, tema, modo lento, NSFW y opciones de voz compatibles |
| `move_channel` / `reorder_channel` | Cambiar categoría o posición; mover conserva las excepciones de permisos |
| `delete_channel` | Borrar un canal o categoría solicitados; una categoría no borra sus hijos |
| `update_role` / `reorder_role` | Nombre, color, visibilidad, mención y posición dentro de la jerarquía permitida |
| `delete_role` | Borrar roles que el usuario y el bot pueden gestionar |
| `assign_role` / `remove_role` | Añadir o retirar un rol de un miembro, conservando los demás |
| `set_role_permissions` | Conceder/retirar flags globales del rol, incluidos los de `@everyone`, conservando los no indicados |
| `set_channel_permissions` | Excepciones para un rol o miembro: permitir, denegar o heredar por permiso |
| `sync_channel_permissions` | Sustituir las excepciones del canal por las de su categoría |

El asistente tiene instrucciones de tomar iniciativa y resolver el encargo completo: puede elegir nombres, colores, tipos y distribución cuando el usuario le delega esos detalles, consultar el inventario y ejecutar sin exigir una confirmación adicional para cada paso. También puede conversar y ayudar con temas generales. Las creaciones admiten órdenes coloquiales y autorizaciones que continúan vigentes en el historial; ya no se exige una combinación literal de «crear» y «canal/rol».

Una consulta aislada al modelo interpreta el alcance autorizado usando la conversación de esa cuenta y servidor y el plan pendiente. No recibe los resultados de herramientas de esa petición. Las creaciones comparten la interpretación general de su encargo; las demás modificaciones verifican cada combinación de herramienta, destino y argumentos concretos, para no extender una orden sobre un canal a otro distinto. Se registra el consumo de todas esas consultas. Sigue dependiendo de la interpretación del modelo; las pruebas usan decisiones simuladas y no garantizan cómo responderá en cada conversación real. Los permisos de Discord y las herramientas habilitadas se comprueban en el servidor antes de ejecutar.

La interpretación usa la [salida JSON de DeepSeek](https://api-docs.deepseek.com/guides/json_mode/), con esquema validado localmente. Una respuesta vacía o inválida no concede autorización para escribir.

`propose_actions` permite planificar todas las acciones de gestión; `propose_creations` se conserva para planes de creación. No son un requisito previo para ejecutar una tarea delegada. La aprobación de un plan estructurado conserva IDs, nombres, destinos y valores de permisos exactos, incluidas sus listas y campos anidados. El usuario puede cambiar el encargo o aprobar una propuesta antigua expresada solo en texto: el modelo interpreta ese nuevo alcance con la conversación. El historial sigue aislado por usuario y servidor.

Los cambios se registran con autor, ID de petición y motivo en Discord. Las herramientas de gestión guardan además el estado anterior y posterior en auditoría local. El recibo distingue creaciones, cambios, asignaciones y borrados; si el proveedor falla después de modificar algo, informa las acciones completadas. Un fallo de auditoría tras una acción exitosa se comunica sin ocultar que el cambio ya ocurrió.

La API comprueba permisos y jerarquía: no se borran `@everyone` ni roles de integraciones; los roles deben quedar por debajo del bot y del usuario, salvo la excepción del dueño del servidor para su propia jerarquía. No se conceden permisos que no tenga el usuario o el bot. La categoría de destino y los canales deben pertenecer a la comunidad actual y ser accesibles. Los borrados son irreversibles y requieren que el encargo incluya eliminar o limpiar; crear u organizar por sí solo no autoriza borrar. Los canales obligatorios de una comunidad no pueden eliminarse. Estas reglas siguen la [jerarquía y permisos de Discord](https://docs.discord.com/developers/topics/permissions) y las [operaciones de canales](https://docs.discord.com/developers/resources/channel).

Desde `/owner → Configurar IA` hay ocho capacidades separadas: crear canales; editar/mover/ordenar canales; borrar canales; crear roles; editar/ordenar roles; borrar roles; asignar/retirar roles; y gestionar permisos. Al actualizar una base antigua, las capacidades nuevas heredan inicialmente el permiso de creación de canales o roles correspondiente. Se guardan por comunidad; una nueva instalación sigue necesitando que el propietario habilite su IA. El asistente no puede cambiar sus propias capacidades de `/owner`.

El motor no ejecuta comandos slash arbitrarios, terminal, SQL, navegación externa, expulsiones ni publicaciones en canales. Los mensajes leídos son datos y no pueden autorizar acciones de gestión. Las protecciones se aplican aunque el modelo solicite una herramienta indebida.

Ejemplos de peticiones:

- «Mueve los canales de desarrollo a su categoría nueva conservando sus permisos».
- «Renombra este rol a Programador y ponlo azul».
- «Asigna Programador a estas dos personas».
- «Configura el canal de anuncios: todos pueden leerlo y solo Staff puede escribir».
- «Dale a Programador permiso para gestionar canales, sin tocar sus otros permisos».
- «Borra estos canales duplicados por sus IDs y conserva los demás».

Los nombres iguales se resuelven con el inventario y el contexto; si no hay un destino inequívoco, el asistente pide el ID concreto.

## Historial y límites

La web tiene un botón **＋ Nuevo chat** en la cabecera y el selector **Tus conversaciones**. Cada cuenta tiene chats separados por servidor. Web y Discord comparten la conversación activa; `/asistente nuevo` cambia esa misma selección. El título se toma de la primera petición, sin pedir al modelo que lo genere. El historial previo a esta actualización se migra a **Conversación anterior**, conservando mensajes, resultados de herramientas y recibos para no repetir acciones.

Abrir un chat nuevo no llama a DeepSeek. La siguiente petición incluye únicamente el historial de ese chat; los mensajes y planes pendientes de otros chats no se envían ni a la respuesta principal ni a la interpretación de autorizaciones. Los otros chats siguen accesibles desde el selector. Las instrucciones y definiciones de herramientas sí siguen formando parte de las peticiones al modelo, por lo que una consulta nueva tiene consumo aunque su historial esté vacío.

Se muestran y se usan como contexto los últimos 20 turnos de los últimos 30 días de la conversación elegida, con las respuestas previas acotadas a 4000 caracteres por turno. La limpieza de mensajes antiguos ocurre al recibir una consulta nueva; los títulos e identificadores de las conversaciones permanecen guardados. El consumo de las últimas 24 horas y el cupo diario, si existe, se calculan para la cuenta en ese servidor entre todos sus chats; crear otro chat no los reinicia.

Mientras una petición está ejecutándose no se cambia de chat: se espera a que quede registrado el resultado de sus acciones. Los reintentos conservan su ID y su conversación. Si otra pestaña o Discord cambia la selección, una petición web con la selección antigua se rechaza antes de llamar al modelo y la interfaz actualiza el chat activo. Los endpoints exigen la identidad del propietario de la conversación, el servidor correspondiente y CSRF para crear o seleccionar.

`ASSISTANT_DAILY_LIMIT=0` desactiva el cupo diario del bot; es el valor predeterminado. El propietario también puede guardar 0 desde `/owner` para cada comunidad, o elegir un cupo positivo por persona en una ventana móvil de 24 horas. La configuración particular de la comunidad tiene prioridad sobre el valor del alojamiento. Ya no hay cortes fijos de dos creaciones, seis herramientas o cinco rondas por petición. Se mantiene el tiempo máximo configurable de la tarea y dos consultas simultáneas en total, una por usuario, para que las peticiones terminen y no se solapen sobre la misma conversación. La disponibilidad, el contexto y las cuotas reales de DeepSeek y Discord siguen aplicando.

Con DeepSeek directo se desactiva el modo de pensamiento para estas consultas administrativas breves. Cualquier razonamiento adicional del proveedor se utiliza solamente para continuar sus herramientas y no se muestra ni se persiste en el historial.

Una petición repetida con el mismo identificador devuelve su resultado sin volver a ejecutar herramientas. El navegador conserva ese identificador si falla el transporte. Si el proveedor falla tras una creación, se comunica lo que ya se creó. No hay reintento automático de escrituras. Tras una caída del proceso en mitad de una operación, revisa Discord y auditoría antes de repetirla: una petición pendiente no se reejecuta automáticamente.

## Validación

`npm run test:tactical` incluye pruebas de aislamiento por usuario, acceso por IDs, CSRF, permisos nativos, bloqueo de instrucciones incrustadas en mensajes, herramientas y parámetros no permitidos, reintentos sin duplicados, fallos tras una creación y respuesta privada desde Discord.
