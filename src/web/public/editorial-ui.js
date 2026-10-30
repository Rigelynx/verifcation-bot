/* Visual navigation only; authorization remains in the existing modules. */
const journalSections = {
    expedientes: ['01', 'Personal', 'El control.\nEn tus manos.', 'Cada operador cuenta. Coordina el personal, el despliegue y los recursos de tu unidad desde un mismo lugar.'],
    cuestionario: ['02', 'Admisión', 'El inicio de\nalgo más grande.', 'Diseña el proceso de admisión y prepara a la próxima generación de tu unidad.'],
    'bot-config': ['03', 'Configuración', 'Tu unidad.\nTus reglas.', 'Ajusta los canales y la configuración que mantienen al equipo conectado.'],
    economia: ['04', 'Tesorería', 'Recursos para\nllegar más lejos.', 'Supervisa la economía de la unidad y reconoce el esfuerzo de tus operadores.'],
    tienda: ['05', 'Intendencia', 'Preparados para\nlo que viene.', 'Rangos, acreditaciones y suministros. Todo listo para la siguiente operación.'],
    roles: ['06', 'Rangos', 'El mérito\ntiene su lugar.', 'Gestiona las bonificaciones de servicio desde tu configuración de rangos.'],
    eventos: ['07', 'Operaciones', 'Cada equipo.\nUna misión.', 'Convoca, coordina y registra las operaciones de la unidad.'],
    comandos: ['08', 'Protocolos', 'Coordinación\nsin fricción.', 'Mantén los comandos y sus autorizaciones bajo control.'],
    auditoria: ['09', 'Auditoría', 'Cada acción\ndeja su huella.', 'Consulta los movimientos, las decisiones y la identidad de sus responsables.'],
    servidores: ['10', 'Despliegue', 'La próxima misión\nempieza aquí.', 'Consulta la disponibilidad registrada, elige un servidor privado y coordina el despliegue.']
};
function setJournalSection(key) {
    const section = journalSections[key] || journalSections.expedientes;
    document.getElementById('journal-hero-title').textContent = section[2];
    document.getElementById('journal-hero-description').textContent = section[3];
    document.getElementById('journal-breadcrumb').textContent = section[1];
    document.getElementById('journal-chapter').textContent = `FIELDNOTES / ${section[0]}`;
    document.getElementById('main-content').dataset.section = key;
    const image = document.querySelector('.command-hero .hero-scene');
    const scenes = { eventos: 'patrol-field.png', tienda: 'quartermaster.png', economia: 'quartermaster.png',
        cuestionario: 'mission-briefing.png', 'bot-config': 'mission-briefing.png', roles: 'mission-briefing.png',
        comandos: 'mission-briefing.png', auditoria: 'mission-briefing.png' };
    const source = `/media/${scenes[key] || 'coastal-command.png'}`;
    if (image.getAttribute('src') !== source) image.src = source;
    document.querySelectorAll('.nav-tab').forEach(button => button.setAttribute('aria-current', button.dataset.section === key ? 'page' : 'false'));
    document.body.classList.remove('nav-open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
}
document.addEventListener('usmc:tabchange', event => setJournalSection(event.detail));
document.addEventListener('DOMContentLoaded', () => {
    setJournalSection('expedientes');
    const menu = document.getElementById('menu-toggle');
    menu.addEventListener('click', () => {
        const open = document.body.classList.toggle('nav-open');
        menu.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { document.body.classList.remove('nav-open'); menu.setAttribute('aria-expanded', 'false'); }
    });
});
