# Guía definitiva de la actualización de RICO

Guía de uso para miembros, oficiales y administradores. Edición de lanzamiento: 29 de octubre de 2026.

Discord y la web comparten los datos de tu comunidad. Puedes iniciar una operación desde Discord y gestionarla desde la web, o al revés. Los comandos habituales siguen disponibles.

En los ejemplos, sustituye los IDs de evento, servidor y plantilla por los de tu comunidad. `TU_WEB` significa la dirección pública del bot. Para entrar sin escribir direcciones, usa los comandos que generan el enlace correspondiente.

Si vas a organizar eventos, empieza por la [guía rápida de oficiales](guia-oficiales-eventos.md). El propietario tiene aparte los [pasos para publicar esta versión](lanzamiento-actualizacion.md) y un [anuncio listo para Discord](anuncio-actualizacion-discord.md).

## 1. Dónde entra cada persona

| Acceso | Para qué sirve | Cómo abrirlo |
| --- | --- | --- |
| Presentación | Información del bot, invitación e inicio de sesión | `TU_WEB/` |
| Selector de comunidades | Elegir el servidor que vas a gestionar | `TU_WEB/portal` |
| Consola del propietario | Ver instalaciones y distribuir la IA | `TU_WEB/owner` |
| Dashboard de la comunidad | Configuración, personal, economía y tienda | `/admin panel-web` desde ese servidor |
| Portal de operaciones | Eventos, lista, equipos y AAR | `/patrulla` → **Abrir portal** |
| Asistente | Conversación privada con IA | `/asistente web` |
| Verificación | Completar el expediente de ingreso | Botón del panel de verificación |

Cada persona inicia sesión con su propia cuenta de Discord. El portal muestra las comunidades donde tiene acceso de administración u operaciones. Ser miembro de un servidor por sí solo no abre esos paneles. La consola `/owner` está reservada a los IDs configurados como propietarios del bot; ser administrador de una comunidad no concede ese acceso.

Los enlaces de Discord llevan el servidor correspondiente. Para cambiar de comunidad, vuelve a `/portal` y elige la otra. El enlace administrativo puede verse como `/admin?guild=ID_DEL_SERVIDOR`.

### La web secundaria de oficiales

Es el **Portal de Operaciones**, situado en `TU_WEB/patrullas`. Usa la misma web e instancia de HolyHosting que el panel principal. Cada comunidad conserva sus propios eventos.

La entrada recomendada es:

```text
/patrulla
```

Pulsa **Abrir portal → Continuar con Discord**. El botón ya incluye el servidor correcto. También puedes entrar desde `/portal`, elegir tu comunidad y abrir su acceso de operaciones. Si tienes acceso administrativo, ese selector puede abrir primero el dashboard; desde allí usa **Operaciones ↗** para entrar al portal.

Todos los oficiales autorizados pueden consultar los eventos activos y el historial reciente de su comunidad, con el responsable, participantes y equipos de cada actividad. El portal muestra esa información de operaciones; no incorpora un directorio independiente de todos los oficiales del servidor.

| Persona | Qué puede hacer en el portal |
| --- | --- |
| Oficial autorizado | Consultar eventos y servidores privados; crear patrullas y gestionar las propias |
| Creador/encargado del evento | Añadir/retirar participantes, organizar equipos, guardar AAR, finalizar y pasar lista de su evento activo |
| Alto Mando / administrador autorizado | Gestionar los eventos de la comunidad; pasar lista solamente de los que él mismo creó |
| Participante sin acceso de oficial | Inscribirse mediante los paneles de Discord y completar su propio expediente |

Administración configura el acceso en **Configuración → Rol de Oficiales** y asigna ese rol en Discord. También puede hacerlo con `/admin configurar rol_oficial:@Oficiales`. Un enlace por sí solo no concede acceso. Si el comando está permitido pero la web rechaza la entrada, comprueba el rol de acceso web; habilitar un comando en **Protocolos** no sustituye esa comprobación.

## 2. Editar el perfil y la decoración de cada servidor

Sí, la identidad visual se edita desde la web:

1. Entra con Discord en `/portal` y abre el dashboard de la comunidad que quieres personalizar.
2. Abre **Configuración**.
3. Busca **IDENTIDAD DE TU COMUNIDAD**, con el título **Un espacio con tu nombre.**
4. Cambia **Nombre visible**, **Siglas**, **Estilo** y **Color principal**.
5. Elige el estilo **Neutro**, **USMC · Clásico**, **UKAF · Azul y rojo** o **Personalizado**.
6. Para el **Logo** y la **Portada**, puedes pegar una URL HTTPS o subir una imagen PNG, JPG o WebP de hasta 2 MB.
7. Si subes una imagen, espera el mensaje **Imagen subida** y después pulsa **Guardar identidad**. Subir el archivo no lo selecciona definitivamente por sí solo.
8. Recarga el panel para aplicar todas las imágenes y textos.

Por ejemplo: en USMC guarda sus siglas, insignia y colores; después entra al dashboard de UKAF y guarda su propia identidad. Los cambios pertenecen a cada comunidad.

Esto personaliza la web de esa comunidad. No cambia el nombre, el avatar o el banner reales de la cuenta del bot en Discord. Tampoco es un editor libre para mover todos los componentes de la página: **Personalizado** permite guardar esos campos de identidad sobre la interfaz existente.

## 3. Editar el nombre o callsign de un expediente

Para Alto Mando o administradores autorizados:

1. Abre el dashboard de la comunidad.
2. Entra a **Personal** y busca a la persona por nombre o ID.
3. Abre su expediente.
4. Usa **EDITAR NOMBRE / CALLSIGN DEL EXPEDIENTE**.
5. Escribe el nuevo nombre y pulsa **GUARDAR NOMBRE**.

El sistema guarda el cambio con el operador identificado. La auditoría registra el nombre anterior, el nuevo y quién hizo la modificación. El cambio es del expediente de esa comunidad: no renombra la cuenta de Discord ni cambia automáticamente su apodo en el servidor.

La consulta por Discord continúa disponible:

```text
/datos-usuario usuario:@Persona
```

Los cambios de configuración, operaciones y economía también dejan registros de auditoría según la acción. Configura los canales de logs desde **Configuración** y revisa **Auditoría** para los movimientos económicos.

## 4. Configurar una comunidad nueva

1. Invita el mismo bot al segundo servidor desde la presentación pública o usando tu invitación.
2. El bot registra su instalación automáticamente al conectarse o unirse.
3. Inicia sesión en `/portal` con una cuenta autorizada en esa comunidad.
4. Abre su dashboard y configura sus roles de administración, oficiales, verificados y no verificados.
5. Elige sus canales de revisión y logs.
6. En **Admisión**, configura sus preguntas; en **Tesorería**, su economía; en **Intendencia**, sus productos.
7. Personaliza su identidad desde **Configuración**.

También existe `/admin configurar` para establecer roles y canales desde Discord. **Protocolos** permite configurar el acceso a los comandos.

Los saldos, bancos, inventarios, tienda, expedientes, preguntas, eventos, servidores privados y ajustes pertenecen a cada servidor. La misma persona puede tener un saldo y un expediente diferentes en USMC y UKAF.

Conserva el `GUILD_ID` original al incorporar otra comunidad: se utiliza para identificar los datos anteriores. Para tu bot de pruebas, mantén el registro de comandos por servidor mientras pruebas; en el bot que quieras distribuir, usa el registro global. Los detalles de despliegue están en [Operación multiserver](multiserver-operacion.md).

## 5. Registrar servidores privados y publicar la pizarra

Desde **Servidores privados** del dashboard puedes registrar, editar, ocupar y liberar los servidores de esa comunidad. Desde Discord, un administrador puede añadirlos así:

```text
/servidor agregar nombre:Alpha codigo_id:CODIGO_VIP sector_mapa:Ronograd
```

Para consultar sin publicar al canal:

```text
/servidor lista
```

Para dejar una pizarra visible en el canal de operaciones:

```text
/servidor lista fijar_panel:true
```

La pizarra muestra código VIP, sector, responsable, misión y tiempo de uso. El bot intenta anclarla; necesita el permiso correspondiente para hacerlo. Se guarda una referencia de pizarra activa por comunidad.

Los oficiales autorizados pueden usar su selector para ocupar un servidor, indicando la misión en el modal, o liberarlo con los permisos correspondientes. También funcionan los comandos directos:

```text
/servidor ocupar servidor_id:1 mision:Patrullaje por Ronograd
/servidor liberar servidor_id:1
```

Solo el responsable o Administración puede liberar un servidor ocupado. Para eliminar uno del catálogo, primero debe estar libre:

```text
/servidor eliminar servidor_id:1
```

Al ocupar o liberar se actualiza el mismo mensaje de pizarra; no se manda un aviso público nuevo cada vez. **Disponible / En uso** describe la reserva registrada por los oficiales o eventos. No consulta si Roblox está conectado ni cuántos jugadores hay dentro.

## 6. Crear una patrulla y pasar lista desde la web

1. Ejecuta `/patrulla`, pulsa **Abrir portal** e inicia sesión con Discord.
2. Pulsa **＋ Nueva patrulla**.
3. Completa nombre, canal de convocatoria, plantilla, paga y servidor privado opcional.
4. Pulsa **Crear patrulla**. Si elegiste servidor, queda reservado para esa actividad.
5. Abre **Ver detalles ↗** y pulsa **Publicar / actualizar convocatoria** para llevarla a Discord. Crear la patrulla no publica por sí solo la convocatoria.
6. En **Ajustar lista de asistencia**, pega IDs o menciones separados por comas o espacios. Elige **Añadir participantes** o **Retirar participantes** y pulsa **Actualizar lista**.
7. Así puedes añadir a quien olvidó inscribirse sin pedirle que vuelva a usar el botón de registro.
8. El encargado marca **Presente**, **Ausente** o **No responde** en la lista; cada cambio se guarda al pulsarlo.

**Solo el creador/encargado del evento puede pasar lista**, incluso si otra persona tiene acceso administrativo. Otros usuarios autorizados pueden consultarla. Alto Mando puede gestionar otros aspectos de los eventos según sus permisos.

**Ausente** y **No responde** mantienen a la persona en el registro, pero la excluyen de pagos y acreditaciones mientras tenga ese estado. Corrige la asistencia antes de cerrar. **Sin revisar** indica que aún no la marcaste; conserva las reglas anteriores de elegibilidad de cada tipo de evento, por lo que conviene revisar la lista completa.

Para abrir la lista de un evento desde Discord:

```text
/evento lista evento_id:44
```

El botón **Pasar lista en la web** lleva al detalle del evento después de iniciar sesión.

## 7. Equipos, datos BRM5 y cierre del evento

En el detalle web de la operación:

1. En **Equipos y escuadras**, selecciona el equipo.
2. Pega los IDs de sus integrantes. Deben estar añadidos a la lista del evento; el **primer ID será el líder**.
3. Pulsa **Guardar equipo** y repite para las otras escuadras. Guardar el campo vacío limpia ese equipo. Un integrante movido a otro equipo se retira del anterior.
4. Completa el AAR: mapa/sector, servidor utilizado, calificación, bajas, XO, MVP, objetivos, notas y evidencia.
5. Pulsa **Guardar borrador AAR**. Si la plantilla exige evidencia, añade su imagen antes de publicar.
6. Revisa participantes y asistencia; pulsa **Finalizar y publicar AAR**.

Ejemplo de contenido:

```text
AO: Ronograd — FOB
Calificación: Extracción exitosa
Bajas: 0 KIA, 2 WIA, 35 hostiles neutralizados
Objetivos: Recuperar el objetivo y evacuar a todos los equipos.
Análisis: Mejorar la cobertura durante el embarque.
```

El cierre usa el mismo flujo de Discord para pagos o roles de entrenamiento y libera el servidor privado asociado. Guardar el borrador no publica el reporte ni finaliza el evento.

Si prefieres Discord, usa `/evento convocar`, `/evento entrenamiento` o `/evento iniciar`; agrega `servidor_id` para reservar el servidor automáticamente. Elige una `plantilla_id` real de tu comunidad y completa las opciones obligatorias que muestra Discord. `convocar` usa inscripción, `entrenamiento` permite acreditar un rol y `iniciar` ofrece rastreo por voz, chat o modo híbrido.

Para cerrar desde Discord:

```text
/evento finalizar evento_id:44
```

La consola incluye los selectores clásicos, **Por IDs** para ajustar personal y **Datos BRM5** para los apartados tácticos. Selecciona primero el equipo que deseas editar antes de abrir el modal por IDs.

## 8. Corregir un reporte ya publicado

En Discord:

```text
/evento editar-reporte evento_id:44
```

Modifica los datos en la consola y confirma la actualización del registro.

En la web: cambia a **Historial reciente**, abre el evento, edita el AAR, guarda el borrador y pulsa **Publicar corrección del AAR**.

La corrección edita el mensaje original y no vuelve a pagar. La lista de asistencia ya está cerrada; una corrección documental del reporte no recalcula pagos anteriores. Si el mensaje original fue eliminado o el bot ya no puede acceder a él, se informa el problema y no se publica un duplicado como reemplazo automático.

## 9. Economía y tienda

Administración configura los productos desde **Intendencia**, los ajustes económicos desde **Tesorería** y las opciones de roles desde **Rangos**. Estas configuraciones se guardan por comunidad.

Los miembros siguen usando:

```text
/economia balance
/tienda panel
/tienda comprar id:1
/tienda inventario
```

El panel de tienda permite filtrar rangos y suministros y confirmar el precio antes de comprar. El producto puede tener stock y requisitos de roles. Si falla la entrega de un rol, el flujo intenta restaurar lo modificado y devolver saldo, stock e inventario; si queda algo por resolver, el recibo lo indica para revisión de Administración.

Usa el bot de pruebas para verificar una compra y su entrega antes de cargar el catálogo del oficial.

## 10. Usar y distribuir la IA

Como propietario del bot:

1. Abre `/owner` e inicia sesión con tu cuenta autorizada.
2. Busca la instalación de USMC o UKAF y pulsa **Configurar IA**.
3. Habilita el asistente y añade los IDs de quienes podrán usarlo, hasta diez por comunidad. Si la lista queda vacía, el acceso se limita al propietario de ese servidor.
4. Elige sus capacidades: crear, editar/mover u ordenar y borrar canales; crear, editar u ordenar y borrar roles; asignarlos/retirarlos; configurar permisos de roles o canales; y **Enviar mensajes y embeds a canales**. El envío comienza desactivado hasta que lo habilites para esa comunidad.
5. Guarda **Consultas por persona / 24 h = 0** si quieres quitar el cupo diario del bot, o un número positivo si prefieres establecerlo para esa comunidad.
6. La clave de DeepSeek se guarda en el alojamiento o `.env`; no se pega en el chat ni en este formulario.

En Discord:

```text
/asistente preguntar peticion:Resume los eventos recientes.
/asistente preguntar peticion:Organiza tú los canales de soporte del bot; elige los nombres y crea la estructura.
/asistente preguntar peticion:Continúa con lo que falta.
/asistente preguntar peticion:Redacta y envía a #operaciones un anuncio de patrulla con negritas y la ubicación en spoiler.
/asistente preguntar peticion:Publica esta imagen en #anuncios como spoiler. imagen:[adjunta tu archivo]
/asistente web
/asistente nuevo
```

Para continuar, vuelve a usar `/asistente preguntar`; la respuesta privada del bot no es un chat de mensajes normales. En la web puedes escribir mensajes seguidos cómodamente. Ambos accesos usan la conversación activa de tu cuenta dentro de ese servidor.

En la web, **Adjuntar imagen** permite añadir PNG, JPG o WebP de hasta 2 MB y pedir que se publique en un canal. Las imágenes son privadas hasta que solicites enviarlas a Discord; puedes pedir que se publiquen como spoiler. DeepSeek recibe sus metadatos para compartirlas, sin interpretar su contenido visual. Para consultar el servidor puedes pedir «Muéstrame los canales y roles» o «Lee los últimos mensajes de #operaciones y dime qué adjuntos tienen».

Para cambiar de tema sin arrastrar todo el historial, pulsa **＋ Nuevo chat**, arriba en la web, o usa `/asistente nuevo`. Empieza con el contexto vacío y conserva los chats anteriores. El selector **Tus conversaciones** permite volver a abrirlos y continuar donde estabas. El cambio se comparte con Discord; por ejemplo, puedes separar una conversación para tienda y otra para reorganizar canales.

Abrir un chat no consulta DeepSeek ni consume tokens del proveedor. Al enviar una petición se usa solo el historial del chat elegido, además de las instrucciones y herramientas del asistente. Los planes de otros chats tampoco se arrastran. El consumo ya acumulado sigue visible: cambiar de chat no borra gastos ni reinicia el cupo diario. Si hay una tarea en curso, espera a que termine antes de cambiar.

El asistente puede conversar, redactar, explicar, consultar mensajes y eventos, analizar actividad, gestionar canales y roles, asignarlos o retirarlos y configurar permisos. Puede renombrar, mover, ordenar y borrar los elementos incluidos en tu encargo. Tiene instrucciones de tomar iniciativa y no pedir cada detalle cuando se lo delegas. Se quitaron los topes fijos de dos creaciones, seis herramientas y cinco rondas. Conserva los permisos reales de Discord y un tiempo máximo configurable por tarea.

Los roles empiezan sin permisos y sin asignarse, y el asistente puede configurarlos o asignarlos después si se lo encargaste. Un canal sin categoría queda privado; dentro de una categoría hereda sus permisos. Moverlo conserva sus excepciones; puedes pedir que las sincronice con su categoría. Borrar una categoría no borra sus canales hijos. Los roles de integraciones y `@everyone` no pueden borrarse.

Ejemplos para continuar tu conversación:

```text
/asistente preguntar peticion:Mueve los canales de desarrollo a la categoría DESARROLLO conservando sus permisos.
/asistente preguntar peticion:Configura anuncios para que todos puedan verlo y solo Staff pueda escribir.
/asistente preguntar peticion:Renombra el rol Dev Bot a Desarrollador y ponlo morado.
/asistente preguntar peticion:Asigna el rol Desarrollador a @Persona.
/asistente preguntar peticion:Borra estos canales duplicados por sus IDs y deja los demás intactos.
```

El rol más alto del bot debe estar por encima de los roles que quieres gestionar. También se comprueba tu jerarquía, salvo la excepción propia del dueño del servidor. El bot no concede permisos que no tenga. Puedes pedir primero un plan; aprobarlo ejecuta sus elementos concretos. Los borrados solicitados no vuelven a pedir la misma confirmación. Las herramientas no incluyen sanciones ni ejecución de comandos arbitrarios.

La web muestra tu consumo informado de tokens y caché; `/owner` agrega el consumo por instalación. La caché de DeepSeek es automática y no garantiza un precio fijo para toda la conversación. Más detalles en [Asistente privado](asistente-privado.md) y [DeepSeek y caché](deepseek-cache.md).

## 11. Verificación de nuevos miembros

Administración publica el acceso con:

```text
/panel-verificacion canal:#verificacion
```

El miembro pulsa **SOLICITAR ACCESO / VERIFICARSE**, abre su enlace personal, inicia sesión con su Discord cuando OAuth está configurado, completa las preguntas y envía el expediente. Se aplicará el modo automático o de revisión elegido para esa comunidad. El Alto Mando revisa desde Discord o **Personal**.

El formulario web conserva la decoración y adapta la identidad de la comunidad. Un enlace personal ajeno no permite completar el expediente usando otra cuenta cuando está activo el acceso con Discord.

## 12. Orden recomendado para estrenar la actualización

1. Administración configura el rol de oficiales y los canales de convocatoria, revisión y logs.
2. Cada comunidad guarda su identidad visual, preguntas, economía y plantillas.
3. Se registra un servidor privado y se publica su pizarra en el canal elegido.
4. El encargado abre `/patrulla`, crea una actividad pequeña y publica la convocatoria.
5. Añade participantes, pasa lista y organiza los equipos.
6. Guarda el AAR y finaliza; comprueba el reporte y los pagos o acreditaciones correspondientes.
7. Prueba una corrección del AAR para conocer el flujo de edición del mensaje original.
8. Los usuarios autorizados prueban el asistente y **Nuevo chat**; los miembros pueden explorar la tienda y su expediente.

El propietario sigue los [pasos de lanzamiento](lanzamiento-actualizacion.md) para actualizar el bot oficial, conservar sus datos y comprobar el acceso público antes de publicar el anuncio.

Si el acceso con Discord muestra **redirect_uri no válido**, revisa que la URL configurada de retorno coincida exactamente con `TU_WEB/auth/discord/callback`. Si no aparece una comunidad en `/portal`, comprueba que el bot está conectado allí y que tu cuenta tiene los permisos de administración u operaciones configurados.
