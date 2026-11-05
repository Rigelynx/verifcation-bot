# Tienda de Discord con tarjetas nativas

El catálogo utiliza Components V2: cabecera gráfica, una tarjeta por artículo con botón Ver ficha, controles de categorías y navegación. Se muestran tres artículos por página. La selección de ficha abre una respuesta privada con la información de compra y conserva el flujo de confirmación existente.

## Instalación

- Instala las dependencias del lockfile con `npm ci --omit=dev`. Se requiere discord.js 14.27 o superior.
- El bot necesita Adjuntar archivos en el canal para enviar la cabecera PNG. Conserva sus permisos de ver y enviar mensajes.
- Reinicia y pulsa Actualizar en el panel existente o ejecuta `/tienda panel`. Los paneles antiguos se convierten al nuevo formato al actualizar; la conversión limpia el contenido, los embeds y los adjuntos anteriores del mismo mensaje.

## Presentación

Cada servidor tiene un selector independiente en Dashboard > Configuración > Identidad de tu comunidad > Diseño de tienda · Discord. Las opciones son Neutral (predeterminado), USMC (Estados Unidos), BAF (Reino Unido), PAF (Polonia) y UKAF. La vista previa cambia al seleccionar. Pulsa Guardar identidad y luego Actualizar en la tienda de Discord para aplicar la cabecera. El diseño de la tienda es independiente del estilo de la web y no cambia el nombre, la moneda ni los artículos. No se detectan facciones por el nombre del servidor. El texto alternativo de la cabecera es genérico. No se llama a la IA para generar ni actualizar el catálogo. Cada artículo conserva precio, descripción, stock y restricciones; el resumen elimina encabezados y formato pesado de la descripción para mantener las tarjetas legibles. La ficha privada muestra los requisitos y efectos completos.

Un límite por persona de 0 o -1 significa sin límite. Los valores positivos mantienen la restricción real de inventario. El saldo y el stock se vuelven a comprobar al confirmar la compra.

La vista `assets/shop-v2-preview.png` es una representación local del diseño generada a partir del mismo payload de componentes; no es una captura enviada por Discord. Las fuentes, el ancho y el tema dependen del cliente de Discord.

Las cabeceras están incluidas como PNG. `scripts/render-shop-banners.py` permite regenerarlas con Pillow, que solo se requiere para esa tarea de desarrollo. El host ejecuta únicamente el código Node y sirve los PNG ya generados.

Referencia de Discord: https://github.com/discord/discord-api-docs/blob/main/developers/components/overview.mdx
