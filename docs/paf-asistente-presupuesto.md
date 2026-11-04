# P.A.F., herramientas bajo demanda y presupuesto semanal

## Activación

Reinicia el bot para cargar los nuevos comandos slash y las migraciones. En **Owner → Configurar IA**, habilita por comunidad las capacidades que quieras usar: **Editar identidad, cuestionario y comandos**, **Configurar economía y presupuesto semanal** e **Investigar en Internet**. Empiezan deshabilitadas. Los permisos nativos y los roles de administración se siguen comprobando en cada operación.

La IA solo consulta el proveedor cuando una cuenta autorizada envía una petición. Interpretar una orden con herramientas puede requerir varios pasos y llamadas de autorización; no se promete una sola llamada API por mensaje. No hay consultas periódicas al modelo. Una capacidad deshabilitada tampoco se puede utilizar a través de otra herramienta.

## Identidad P.A.F.

En **Configuración → Identidad de tu comunidad**, selecciona **P.A.F. · Polish Armed Forces** y guarda. El preset prepara nombre, siglas, rojo polaco, escudo ilustrado y portada propios. Puedes sustituir las imágenes por las de tu comunidad. Se guarda solo en el servidor seleccionado; el formulario de verificación también recibe esta identidad.

La IA puede aplicar el mismo cambio con configure_branding si se lo pides. Puede modificar opciones y contenido compatibles con las herramientas, no reescribir código fuente del servidor ni hojas de estilo arbitrarias desde el chat.

## Herramientas

- web_configuration consulta identidad, configuración de verificación, preguntas, economía, comandos, plantillas de reporte y presupuesto.
- configure_branding configura nombre, siglas, tema, color, logo y portada.
- configure_question y delete_question administran el cuestionario. configure_verification cambia textos, modo, roles y canales. La configuración de roles exige Administración de Discord y jerarquía válida.
- verification_submissions consulta hasta diez expedientes pendientes. Los comandos existentes permiten dictaminar verificaciones bajo una orden explícita y con permisos; una aprobación manual conserva las respuestas originales.
- configure_economy edita parámetros económicos; configure_command administra activación y roles de comandos; configure_report_template configura plantillas operativas.
- Las herramientas existentes gestionan productos, bonos, paneles, eventos, servidores, canales, roles y mensajes.
- web_search busca hasta cinco enlaces y web_open lee páginas HTTPS públicas. La búsqueda pública puede fallar si el buscador bloquea solicitudes o presenta un captcha. La lectura limita tamaño y tiempo, comprueba cada redirección y conecta a la dirección pública que validó. No inicia sesión ni envía formularios externos.

Las propuestas se pueden guardar con propose_actions para aprobarlas después. Las escrituras guardan trazabilidad por actor y petición. Una orden ya autorizada no necesita otra confirmación de la misma acción.

## Archivos y tiempos

Web y Discord admiten cuatro archivos por consulta, con 2 MB por archivo: PNG, JPG, WebP, TXT, MD, CSV, JSON y LOG. Para visión usa deepseek-flash. Los textos deben ser UTF-8. PDF y documentos de Office todavía requieren conversión a texto o imagen. Los adjuntos privados mantienen su aislamiento por usuario, servidor y conversación; los límites de almacenamiento existentes siguen vigentes.

El presupuesto predeterminado es de 180 segundos por respuesta del proveedor y 600 segundos por tarea, con 3072 tokens de salida por paso. Se puede ajustar con ASSISTANT_REQUEST_TIMEOUT_SECONDS (5–300), ASSISTANT_TOTAL_TIMEOUT_SECONDS (10–900) y ASSISTANT_MAX_OUTPUT_TOKENS (128–8192). Un proxy del alojamiento puede tener límites propios. El chat muestra el tiempo transcurrido sin hacer consultas adicionales al proveedor.

## Presupuesto semanal

En **Economía → Presupuesto semanal** puedes crear, editar o pausar partidas de armamento, infantería, logística, entrenamiento, sanidad, reserva y otros. Cada partida tiene importe previsto y gasto registrado por semana. Las partidas activas se repiten en cada informe hasta que las edites o pauses.

Para programar informes, indica el ID de un canal, la fecha del primer envío en la hora de tu dispositivo y activa la casilla. El bot enviará un informe cada siete días, conservando la hora UTC elegida. Las semanas perdidas durante una desconexión se consolidan en un único informe al volver a conectarse. Cada informe guarda una copia de sus importes para conservar el histórico.

El planificador funciona con código normal y SQLite, sin uso de API de IA. Por defecto registra y reporta planificación: no descuenta saldos de miembros ni crea un fondo común. Los informes fallidos aparecen como ERROR en el panel y no se reintentan automáticamente para evitar duplicados cuando la entrega es incierta. Se puede reprogramar un envío futuro desde el panel.

Ejemplos para la IA: «Crea una partida semanal de logística de 500 créditos, sin programar publicaciones»; «Programa el informe en el canal indicado para el viernes a las 18:00 de Colombia». El canal y la fecha deben resolverse antes de guardar una programación.
