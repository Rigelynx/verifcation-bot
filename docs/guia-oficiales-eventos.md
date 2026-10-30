# Portal de Operaciones: guía para oficiales

Con esta actualización puedes organizar patrullas, revisar participantes, pasar lista y preparar el reporte desde la web. Los comandos de Discord siguen disponibles y comparten los mismos datos.

## 1. Cómo entrar a la web secundaria

Dentro del servidor de Discord donde vas a hacer el evento, escribe:

```text
/patrulla
```

1. El bot te responde de forma privada con el botón **Abrir portal**.
2. Pulsa el botón y después **Continuar con Discord**.
3. Usa tu propia cuenta de Discord, con el rol de oficial autorizado en esa comunidad.
4. Verás **Eventos de la unidad** y los servidores privados registrados.

No necesitas una contraseña compartida. La web usa tus roles actuales de Discord. El botón incluye la comunidad correcta, por eso es la forma más fácil de entrar.

También puedes abrir `TU_WEB/patrullas?guild=ID_DEL_SERVIDOR` o elegir la comunidad en `TU_WEB/portal`. `TU_WEB` es la dirección pública que usa el bot en HolyHosting; cambia estos marcadores por los valores reales si compartes el enlace manualmente.

## 2. Qué puedes consultar y gestionar

Los oficiales autorizados ven los eventos activos y el historial reciente de su comunidad. Cada ficha muestra la actividad, su encargado y el número de participantes. Pulsa **Ver detalles ↗** para abrir su lista y reporte.

- Puedes crear patrullas y gestionar las que creaste.
- Los eventos de otros oficiales se muestran como consulta, salvo que tengas acceso de Alto Mando/administración.
- **Solo quien creó el evento puede pasar su lista**, incluso cuando otro administrador puede gestionar el resto de sus datos.
- La web muestra los encargados y participantes de los eventos; no tiene un directorio separado de todos los oficiales del servidor.

## 3. Crear una patrulla y publicarla

1. Pulsa **＋ Nueva patrulla**.
2. Escribe el nombre o misión.
3. Elige un canal de convocatoria donde puedas publicar y una plantilla de reporte.
4. Indica la paga base y, si vas a usar uno, elige un servidor privado disponible.
5. Pulsa **Crear patrulla**.
6. Entra en su detalle y pulsa **Publicar / actualizar convocatoria**.

**Crear** guarda la patrulla y su reserva; **Publicar / actualizar convocatoria** lleva el panel de inscripción a Discord. Son dos pasos distintos.

Los entrenamientos y eventos con rastreo de voz/chat se crean con `/evento entrenamiento` o `/evento iniciar` en Discord. Después puedes consultar y gestionar el evento desde este portal según tus permisos. La creación web de **Nueva patrulla** utiliza inscripción por registro.

## 4. Añadir a quien olvidó registrarse

En **Ajustar lista de asistencia**:

1. Pega uno o varios IDs o menciones de Discord, separados por comas o espacios.
2. Selecciona **Añadir participantes**.
3. Pulsa **Actualizar lista**.

Para retirar a alguien, usa los mismos campos y selecciona **Retirar participantes**. Añadirlo al registro no equivale a marcarlo presente: el encargado revisa su asistencia por separado.

## 5. Pasar lista

El encargado abre el detalle de su evento y marca a cada persona:

| Estado | Uso |
| --- | --- |
| **Presente** | Confirmaste que está participando |
| **Ausente** | No está en la actividad |
| **No responde** | Está identificado en la actividad, pero no responde al pase de lista |

El cambio se guarda al pulsar. Puedes corregirlo mientras el evento esté activo. **Ausente** y **No responde** conservan a la persona en el registro, pero la excluyen del pago o acreditación mientras mantenga ese estado. La elegibilidad final también depende de las reglas y modalidad del evento.

**Sin revisar** significa que aún no la marcaste; conserva el comportamiento anterior de esa modalidad. Revisa la lista completa antes de cerrar. La confirmación del propio participante en Discord no anula lo marcado por el encargado.

Desde Discord también puedes localizar el evento con:

```text
/evento lista evento_id:44
```

Sustituye `44` por su ID y pulsa **Pasar lista en la web** para abrir directamente ese evento.

## 6. Organizar varios equipos

1. Asegúrate de que todos estén en la lista de participantes.
2. En **Equipos y escuadras**, elige el equipo que vas a editar.
3. Pega los IDs de sus integrantes. **El primer ID será el líder.**
4. Pulsa **Guardar equipo** y repite con los demás equipos.

Un integrante movido a otro equipo se retira del anterior. Guardar el campo vacío limpia el equipo seleccionado.

## 7. Preparar el AAR y finalizar

Completa los datos que correspondan a tu actividad:

- **Mapa / sector (AO)** y servidor utilizado.
- **Calificación / resultado** y bajas o estadísticas.
- **Segundo al mando** y **MVP**.
- **Objetivos y análisis táctico**, observaciones y URL HTTPS de la imagen de evidencia.

Pulsa **Guardar borrador AAR**. Después revisa participantes, lista y equipos y pulsa **Finalizar y publicar AAR**.

Guardar el borrador no termina la actividad. Finalizar aplica el flujo de pagos o acreditaciones del evento, publica su reporte y libera el servidor privado asociado. Si la plantilla exige evidencia, añádela antes de publicar.

## 8. Corregir el reporte después

1. Cambia **Eventos activos** por **Historial reciente**.
2. Abre el evento finalizado.
3. Corrige los datos del AAR y pulsa **Guardar borrador AAR**.
4. Pulsa **Publicar corrección del AAR**.

Se actualiza el mensaje original de Discord sin repetir pagos. La lista cerrada y los pagos anteriores no se recalculan por una corrección documental. Si el mensaje original se eliminó o no es accesible, el bot informa el problema y no crea un reemplazo duplicado automáticamente.

También puedes hacerlo desde Discord con `/evento editar-reporte evento_id:44`.

## 9. Consultar y reservar servidores privados

La sección **Servidores privados** muestra código VIP, misión, responsable y disponibilidad registrada. Puedes copiar el código desde su ficha y reservar uno libre al crear la patrulla.

Para ocuparlo o liberarlo desde Discord:

```text
/servidor ocupar servidor_id:1 mision:Patrullaje por Ronograd
/servidor liberar servidor_id:1
```

Sustituye `1` por el ID real del servidor. Solo el responsable o Administración puede liberarlo. Si se vinculó a un evento, se libera al finalizarlo. La pizarra de Discord actualiza el mismo mensaje cuando cambia el estado.

**Disponible / En uso** corresponde a las reservas de oficiales y eventos; no mide jugadores conectados a Roblox.

## 10. Si no te deja entrar o actuar

| Lo que ocurre | Qué revisar |
| --- | --- |
| No puedes entrar al portal | Que estés usando tu cuenta correcta, que tengas el rol de oficial configurado y que el bot esté conectado |
| No aparece tu comunidad en `/portal` | Membresía, rol de acceso y presencia del bot en ese servidor |
| Ves un evento, pero no puedes editarlo | Que seas su encargado o tengas acceso administrativo de la comunidad |
| Puedes gestionar el evento, pero no marcar asistencia | El pase de lista es exclusivo de su creador y de eventos activos |
| La acción dice que el protocolo está desactivado | Administración debe revisar **Protocolos** |
| No aparece un canal al crear la patrulla | Tu cuenta debe poder verlo y enviar mensajes allí |
| No hay plantillas o servidores para elegir | Administración debe configurarlos en el dashboard de esa comunidad |
| El formulario de inicio muestra `redirect_uri` inválido | Administración debe revisar la dirección pública y el retorno OAuth del bot |

La [guía completa de la actualización](tutorial-novedades.md) explica también perfiles, verificación, tienda y asistente.
