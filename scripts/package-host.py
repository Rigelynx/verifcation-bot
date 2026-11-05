"""Build a manual host update without credentials, databases or installed modules."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'releases' / 'verificationbot-host-sesion-persistente-2026-11-04.zip'
INSTRUCTIONS = '''ACTUALIZACION DEL BOT - 04/11/2026

1. DETEN el bot en el panel del host.
2. Haz una copia de seguridad de tu .env, database.sqlite y archivos asociados,
   y de las carpetas guilds, data y backups que existan en el host.
3. Sube este ZIP a /home/container y descomprimelo EN ESA MISMA CARPETA.
   Acepta reemplazar archivos del codigo. src y package.json deben quedar
   directamente dentro de /home/container, sin una carpeta adicional encima.
4. Conserva tu .env, bases de datos, guilds, data, backups y node_modules.
   Este ZIP no contiene ninguno de esos datos del host.
5. Si el panel usa "Bot js file", establece startup.js. Tambien puedes usar
   npm start, node startup.js o bash start.sh. Los lanzadores incluidos
   ejecutan esta copia local y no descargan otra version desde GitHub.
6. IMPORTANTE: esta tienda requiere discord.js 14.27 o superior. Ejecuta
   npm ci --omit=dev desde /home/container antes de iniciar, o activa la
   instalacion de dependencias npm del panel. El ZIP incluye el lockfile.
7. INICIA el bot y revisa la consola. El registro de comandos de Discord y
   las migraciones de SQLite se realizan al arrancar. No borres la base de datos.

PANELES NEUTRALES
En Configuracion > Identidad > Diseno de paneles - Discord puedes elegir
USMC, BAF o PAF con vista previa. Neutral es el valor inicial.
La casilla Usar este diseno tambien en la tienda permite sincronizarlos.
Cada servidor guarda su propia eleccion.
El bot necesita Adjuntar archivos para enviar las cabeceras.
Los paneles antiguos no se cambian automaticamente al reiniciar:
- Verificacion: publica con /panel-verificacion o actualiza el mensaje del bot
  mediante la herramienta publish_panel y su message_id.
- Bonos: publica con /bono panel o actualiza su mensaje con publish_panel.
- Servidores: pulsa Actualizar o usa /servidor lista fijar_panel:true.
- Eventos: las nuevas convocatorias usan el diseno nuevo.
- Ayuda, saldo e inventario: abre de nuevo sus comandos.
Guia completa: docs/paneles-neutrales.md

TIENDA
Pulsa Actualizar en el panel de tienda existente o abre /tienda panel.
Los mensajes ya publicados se convierten a las tarjetas nuevas cuando usas
Actualizar. El bot necesita Adjuntar archivos para mostrar la cabecera.
Los articulos se organizan de tres en tres, con botones Ver ficha.
En el dashboard de CADA servidor: Configuracion > Identidad >
Diseno de tienda - Discord. Elige Neutral, USMC, BAF, PAF o UKAF.
Guarda y pulsa Actualizar en la tienda de Discord de ese servidor.
Neutral es el valor inicial; las elecciones son independientes.

P.A.F. Y HERRAMIENTAS DE IA
En Configuracion > Identidad selecciona P.A.F. y guarda.
En Owner > Configurar IA habilita las nuevas capacidades que quieras usar.
El presupuesto semanal se administra en Economia. Empieza sin informes
programados; solo publica despues de que configures y actives un horario.

SESION DEL DASHBOARD
El acceso se recuerda en el mismo navegador durante 30 dias de inactividad.
WEB_SESSION_DAYS permite configurar de 1 a 90 dias (opcional).
El enlace /admin panel-web abre directamente el dashboard y reutiliza la
sesion existente. Los enlaces viejos tambien reconocen una sesion valida.
Cerrar sesion sigue revocando el acceso y los roles se comprueban en vivo.

TIEMPOS DE RESPUESTA
Si tu .env conserva los valores anteriores, cambia solo estas variables:
ASSISTANT_REQUEST_TIMEOUT_SECONDS=180
ASSISTANT_TOTAL_TIMEOUT_SECONDS=600
ASSISTANT_MAX_OUTPUT_TOKENS=3072
Conserva tus claves, IDs y demas configuracion. El modelo para analizar
imagenes es deepseek-flash. El chat admite imagenes y archivos de texto;
PDF y Office requieren conversion previa.

Este paquete incluye todo el codigo local actualizado: tienda, P.A.F.,
herramientas bajo demanda, adjuntos y presupuesto semanal.
Las pruebas usan servicios simulados; verifica el arranque en tu host.
Guia detallada: docs/paf-asistente-presupuesto.md
'''

def main():
    OUTPUT.parent.mkdir(exist_ok=True)
    entries = {}
    for folder in ('src', 'assets', 'scripts', 'docs', 'test'):
        for path in (ROOT / folder).rglob('*'):
            if not path.is_file() or path.is_symlink():
                continue
            relative = path.relative_to(ROOT)
            if any(part in ('__pycache__', 'node_modules', '.git') for part in relative.parts):
                continue
            if path.suffix.lower() in ('.pyc', '.sqlite', '.db', '.zip') or path.name.startswith('.env'):
                continue
            entries[relative.as_posix()] = path.read_bytes()
    for name in ('package.json', 'package-lock.json', 'README.md', 'test-integration.js', 'test-economy.js'):
        entries[name] = (ROOT / name).read_bytes()
    entries['startup.js'] = b"// Manual host release: run the uploaded local code.\nrequire('./src/index.js');\n"
    entries['start.sh'] = b'#!/usr/bin/env bash\nset -euo pipefail\ncd -- "$(dirname -- "$0")"\nexec node src/index.js\n'
    entries['ACTUALIZAR-HOST.txt'] = INSTRUCTIONS.encode('utf-8')
    manifest = {name: hashlib.sha256(content).hexdigest() for name, content in sorted(entries.items())}
    entries['MANIFEST-SHA256.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, content in sorted(entries.items()):
            archive.writestr(name, content)
    with zipfile.ZipFile(OUTPUT) as archive:
        assert archive.testzip() is None, 'Archive integrity failure'
        names = set(archive.namelist())
        assert {'src/index.js', 'startup.js', 'start.sh', 'src/bot/utils/shopPresentation.js', 'src/assistant/webTools.js', 'src/database/weeklyBudget.js'} <= names
        for name in names:
            path = Path(name)
            assert not path.is_absolute() and '..' not in path.parts
            assert not any(part in ('node_modules', 'data', 'guilds', 'backups', '.git') for part in path.parts)
            assert not path.name.startswith('.env') and not path.name.startswith('database.sqlite')
        for name, digest in manifest.items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == digest
    print(json.dumps({'zip': str(OUTPUT), 'files': len(entries), 'bytes': OUTPUT.stat().st_size, 'sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(), 'verified': True}))

if __name__ == '__main__':
    main()
