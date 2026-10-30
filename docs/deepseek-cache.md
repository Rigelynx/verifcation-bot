# DeepSeek de pago y uso de caché

## Configuración actual

El `.env` real selecciona `ASSISTANT_PROVIDER=deepseek`. El modelo automático es `deepseek-flash`. Completar `DEEPSEEK_API_KEY` en el editor local y reiniciar el bot. El asistente utiliza exclusivamente la API directa de DeepSeek. No hay selector ni cambio automático a otro proveedor.

`ASSISTANT_MAX_OUTPUT_TOKENS=1536` limita la salida de cada paso del modelo y puede ajustarse en el alojamiento. Una petición que use herramientas puede requerir varios pasos; se eliminaron los cortes fijos de rondas, herramientas y creaciones. `ASSISTANT_DAILY_LIMIT=0` desactiva el cupo diario del bot, salvo que la comunidad tenga un cupo propio. Se mantiene un tiempo máximo configurable por tarea. El modo de razonamiento de la API directa continúa desactivado para las consultas del asistente.

## Qué se optimizó

DeepSeek activa su caché automáticamente. Se reutilizan las instrucciones y las definiciones de herramientas sin cambios entre peticiones. La fecha variable se añade después del historial para conservar el prefijo común. La caché real depende de la coincidencia de los prefijos y de la persistencia que haga el proveedor: no hay garantía de acierto en cada petición.

El bot continúa consultando permisos y ejecutando las herramientas solicitadas. No guarda una respuesta por texto para reutilizarla con otra persona ni evita comprobar el estado actual de Discord. La reutilización de una respuesta ya procesada solo ocurre por el mismo identificador de petición, como protección ante reenvíos de transporte.

Cada respuesta que informa `usage` guarda sus tokens de entrada, salida y caché. La web del asistente muestra los últimos 24 h del propio usuario; la consola `/owner` muestra un resumen por instalación. Si el proveedor no informa un contador, aparece como desconocido. Los errores que no devuelven consumo tampoco permiten conocer una eventual facturación: las métricas locales no sustituyen el saldo o factura del proveedor.

## Cómo interpretar los $8

Tarifas verificadas el 29 de octubre de 2026 para Flash, por millón de tokens:

| Tipo | Horario valle | Horario pico |
|---|---:|---:|
| Entrada con caché | USD 0,003 | USD 0,006 |
| Entrada nueva | USD 0,15 | USD 0,30 |
| Salida | USD 0,60 | USD 1,20 |

Fuente: [tarifas oficiales de DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/).

La cuenta `8 / 0,003 × 1.000.000` equivale aproximadamente a 2.666.666.667 tokens, pero describe únicamente entrada completamente cacheada en horario valle. Una conversación real mezcla entrada cacheada, entrada nueva y salida. No es una cantidad garantizada de tokens totales ni un número prometido de consultas.

La tarifa de horario valle la aplica DeepSeek según la hora de uso. El bot responde de inmediato y no difiere consultas a otro horario ni intenta simular un precio diferente. Las tarifas pueden cambiar; revisar la página oficial al estimar el presupuesto.

Documentación técnica: [caché de contexto](https://api-docs.deepseek.com/guides/kv_cache/). La verificación local usa respuestas simuladas con contadores de caché. La medición de aciertos reales requiere completar la clave y usar el asistente con el proveedor real; no se envían consultas extra para “calentar” la caché.
