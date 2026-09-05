# 🎖️ Bot de Discord USMC - Verificación Militar Retro & Moderación

Sistema integral de verificación táctica y moderación militar para Discord, con **Terminal Web Táctica Retro (estética de los 90s/2000s)**, cuestionario dinámico configurable por administradores, persistencia en base de datos local **SQLite** (aprovechando tus 50 GB de hosting) y consulta directa de expedientes clasificados desde Discord.

---

## 📑 Características Principales

1. **Terminal Web Táctica Retro (90s / 2000s):**
   - Estética auténtica de centro de mando militar: scanlines CRT sutiles, sellos dinámicos (*TOP SECRET*, *AUTORIZADO*, *DENEGADO*), ventanas biseladas 3D retro y sintetizador de audio táctico (Web Audio API).
   - Enlace cifrado efímero de 30 minutos generado exclusivamente para cada usuario que pulsa el botón de verificación.

2. **Base de Datos SQLite Local (`database.sqlite`):**
   - Sin límites de 500MB de bases de datos gratuitas externas: aprovecha el espacio de 50GB de tu propio host.
   - Modo WAL de alta concurrencia y velocidad.
   - Respaldos instantáneos (basta con copiar el archivo `database.sqlite`).

3. **Cuestionario 100% Dinámico:**
   - Los administradores pueden añadir, editar, ordenar o eliminar preguntas desde el **Dashboard Web** sin tocar código.
   - Tipos de campos: texto corto, número, texto largo (área) y menú desplegable (select).

4. **Modos de Verificación Flexibles:**
   - **Automático:** Asigna el rol inmediatamente tras completar el formulario web.
   - **Manual (Revisión de Mando):** Envía el expediente al canal de oficiales en Discord con botones `[ APROBAR ]` y `[ DENEGAR ]` (con modal para indicar motivo).

5. **Expedientes Clasificados en Discord:**
   - Comando `/datos-usuario @usuario`: Muestra todo el expediente militar del recluta con todas sus respuestas del formulario web.

6. **Comandos de Moderación Militar:**
   - `/mod ban`, `/mod kick`, `/mod timeout`, `/mod purge` con registro en canal de auditoría.

---

## 🚀 Puesta en Marcha

### 1. Requisitos Previos
- **Node.js** v18 o superior (recomendado v20 o v24).
- Un bot creado en el [Discord Developer Portal](https://discord.com/developers/applications).

### 2. Configurar Variables de Entorno (`.env`)
Edita el archivo `.env` en la raíz del proyecto:

```env
# CONFIGURACIÓN DEL BOT DE DISCORD
DISCORD_TOKEN=tu_token_de_bot_aqui
CLIENT_ID=tu_client_id_aqui
GUILD_ID=tu_servidor_id_aqui

# CONFIGURACIÓN DEL SERVIDOR WEB MILITAR RETRO
PORT=3000
WEB_URL=http://tu-dominio-o-ip:3000

# CLAVE MAESTRA DE ACCESO AL PANEL DE ADMINISTRACIÓN WEB
ADMIN_KEY=USMC-COMMAND-2026
```

> **Nota:** Si pruebas en tu PC local, mantén `WEB_URL=http://localhost:3000`. Si despliegas en tu host de 50GB, pon la IP pública o dominio de tu servidor.

### 3. Configuración en Discord Developer Portal
Asegúrate de activar los siguientes **Privileged Gateway Intents** en la pestaña **Bot**:
- ✅ **Server Members Intent** (Necesario para asignar roles y expulsar/banear).
- ✅ **Message Content Intent**.

Para invitar el bot a tu servidor, ve a **OAuth2 > URL Generator**:
- Scopes: `bot`, `applications.commands`
- Permisos: `Administrator` (o `Manage Roles`, `Manage Channels`, `Kick Members`, `Ban Members`, `Moderate Members`, `Send Messages`, `Embed Links`).

### 4. Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Ejecutar pruebas de verificación completas
npm test

# Iniciar servidor y bot en producción
npm start

# Modo desarrollo con recarga en caliente
npm run dev
```

---

## 🛡️ Uso de Comandos Slash en Discord

| Comando | Permiso Requerido | Descripción |
| :--- | :--- | :--- |
| `/panel-verificacion [canal]` | Administrador | Despliega el panel militar táctico con el botón interactivo de verificación. |
| `/datos-usuario @usuario` | Moderador / Admin | Imprime en Discord el expediente clasificado y todas las respuestas del formulario web. |
| `/admin configurar` | Administrador | Configura roles (verificado, no verificado), canales (revisión, logs) y modo (auto/manual). |
| `/admin verificar-manual @usuario` | Administrador | Acredita manualmente a un usuario sin requerir formulario web. |
| `/admin desverificar @usuario` | Administrador | Revoca la acreditación militar y retira roles. |
| `/admin panel-web` | Administrador | Muestra el enlace y clave maestra del Centro de Mando Web. |
| `/mod ban @usuario [motivo]` | Ban Members | Corte marcial: veta permanentemente al usuario. |
| `/mod kick @usuario [motivo]` | Kick Members | Despacho disciplinario: expulsa al usuario del servidor. |
| `/mod timeout @usuario <minutos>` | Moderate Members | Celda de castigo: aísla temporalmente al miembro. |
| `/mod purge <cantidad>` | Manage Messages | Purga táctica: elimina hasta 100 mensajes del canal. |

---

## 🌐 Centro de Mando Web (Dashboard de Administración)

1. Abre en tu navegador: `http://localhost:3000/admin` (o la URL de tu host).
2. Ingresa la clave maestra (`ADMIN_KEY`) definida en tu `.env` (por defecto `USMC-COMMAND-2026`).
3. En el Dashboard podrás:
   - **Revisar Expedientes:** Ver la lista de reclutas, filtrar por estado (Pendientes, Aprobados, Rechazados), inspeccionar respuestas y dictaminar aprobación o denegación.
   - **Configurar Cuestionario:** Crear nuevas preguntas, editar enunciados, cambiar el orden o eliminar preguntas existentes.
   - **Parámetros del Bot:** Cambiar en tiempo real el modo de verificación, roles y canales asociados.

---

## 📂 Estructura del Proyecto

```
verificationbotusmc/
├── database.sqlite                 # Base de datos local SQLite (aprovecha tus 50GB)
├── package.json                    # Dependencias y scripts
├── .env                            # Credenciales y configuración sensible
├── .env.example                    # Plantilla de entorno
├── test-integration.js             # Pruebas automatizadas de integración
├── src/
│   ├── index.js                    # Punto de entrada principal
│   ├── database/
│   │   └── db.js                   # Módulo SQLite, schemas y funciones CRUD
│   ├── web/
│   │   ├── server.js               # Servidor Express y APIs REST
│   │   ├── views/
│   │   │   ├── verify.html         # Terminal táctica de reclutamiento (cuestionario)
│   │   │   └── dashboard.html      # Centro de Mando Web de Administración
│   │   └── public/
│   │       ├── military-retro.css  # Estilos retro tácticos 90s/2000s
│   │       └── terminal-effects.js # Efectos sonoros y CRT
│   └── bot/
│       ├── client.js               # Cliente de Discord y registro de comandos
│       ├── commands/
│       │   ├── panel.js            # Despliegue del botón de verificación
│       │   ├── datosUsuario.js     # Consulta de expediente de recluta
│       │   ├── admin.js            # Comandos de administración y configuración
│       │   └── moderacion.js       # Comandos de moderación militar
│       └── handlers/
│           ├── interactionHandler.js # Manejo de clics en botones, modales y slash
│           └── verificationHandler.js # Gestión de roles, DMs y auditoría
```

---
*USMC Defense Network • Sistema Desarrollado para Máxima Eficiencia y Rendimiento.*
