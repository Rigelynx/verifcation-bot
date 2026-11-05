# Paneles neutrales para varias comunidades

## Apariencia y configuración

Verificación, bonos, servidores, convocatorias, ayuda, saldo e inventario usan una presentación común con tarjetas nativas de Discord. Las cabeceras generales son locales y neutrales por defecto. Al elegir explícitamente un preset de facción se aplican sus siglas y colores solo en ese servidor. Cada servidor muestra únicamente su propio nombre y sus propios datos. La tienda conserva su selector independiente.

En Dashboard → Configuración → Identidad puedes elegir la **Diseño de paneles · Discord**. Neutral es el valor inicial, incluso si la web o la tienda tiene un tema de facción. Los presets USMC, BAF y PAF cambian cabeceras y colores, con vista previa en el dashboard. La casilla Usar este diseño también en la tienda permite sincronizar los dos selectores. Editar otro campo conserva esa elección.

Los paneles se generan con código normal y SQLite. No llaman a un proveedor de IA para mostrarse, paginar o actualizarse.

## Funciones revisadas

- Verificación: título configurado correcto, pasos breves y aprobación manual o automática indicada. Los enlaces personales mantienen su caducidad de treinta minutos. Se quitaron las afirmaciones decorativas de cifrado y nivel de seguridad.
- Expedientes: respuestas divididas en páginas, controles de navegación y resolución legible. La consulta de expediente es privada. Aprobar, rechazar y navegar vuelven a comprobar los permisos; una resolución ya registrada no se tramita otra vez desde los botones. Los formularios de rechazo también comprueban permisos al enviarse.
- Bonos: un importe por persona, frecuencia, estado y botón de condiciones. Los textos predeterminados ya no nombran otra facción; los textos personalizados propios de la comunidad se conservan. El recibo muestra el importe recibido y el saldo actual.
- Servidores: tarjetas con estado, responsable, misión y tiempo de uso. Los códigos no se incluyen en la pizarra pública; Detalles los muestra en privado a responsables autorizados. Ocupar y liberar conservan las comprobaciones de autorización del servidor.
- Operaciones: convocatorias y recompensas más cortas, asistencia identificada por nombre, acciones de retirada legibles y etiquetas de equipos neutrales. Los borradores AAR y los reportes conservan el flujo existente de edición, asistencia y pagos.
- Inventario: tres artículos por página, cantidad y detalle individual. Los inventarios grandes ya no se añaden completos a un único embed. Los botones comprueban la matriz de comandos.
- Tesorería: tarjetas de cartera, banco y patrimonio. En la cuenta propia, Depositar y Retirar abren formularios; Movimientos consulta las últimas diez transacciones. Se valida la entrada y se comprueba de nuevo la matriz al enviar el formulario. Estas acciones solo afectan a la cuenta solicitante del servidor actual.
- Ayuda: categorías cortas y comandos filtrados por permisos y matriz de activación. El servidor comprueba los permisos de nuevo al ejecutar cada acción.
- Auditoría y recibos: se retiraron las firmas fijas de USMC de las presentaciones compartidas. Los importes, cuentas y expedientes mantienen su aislamiento por servidor.

## Instalación y mensajes antiguos

Requiere discord.js 14.27 o superior y permiso Adjuntar archivos para las cabeceras PNG. Instala el lockfile con `npm ci --omit=dev` si corresponde y reinicia el bot. La migración añade panel_theme con valor neutral sin reiniciar saldos, compras ni expedientes.

Reiniciar no reescribe automáticamente mensajes publicados. Para ver los cambios:

1. Abre de nuevo `/help`, `/economia balance`, `/tienda inventario` y `/patrulla`.
2. En servidores usa Actualizar o `/servidor lista fijar_panel:true`.
3. Publica el panel de verificación con `/panel-verificacion` y los bonos con `/bono panel`. También puedes editar un mensaje del bot con la herramienta publish_panel y su ID, si la IA tiene esa capacidad habilitada y se lo pides.
4. Las nuevas convocatorias y las publicadas de nuevo desde la web utilizan el diseño nuevo.

Los IDs de los controles anteriores siguen siendo compatibles. Las actualizaciones convierten mensajes antiguos al formato nativo, limpiando embeds y adjuntos previos del mismo mensaje. Los reportes históricos no se vuelven a pagar ni se regeneran por instalar este paquete.

Las imágenes `assets/*-panel-preview.png` son vistas previas locales construidas a partir de los payloads de ejemplo, no capturas de una entrega real de Discord. La apariencia final depende del tema y el ancho de su cliente.

## Validación

`npm run test:panels` comprueba los paneles, la paginación, los permisos y la compatibilidad con web y comandos. Las pruebas usan bases temporales y servicios simulados. No envían mensajes a Discord ni consumen API de IA.
