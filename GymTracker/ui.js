/**
 * ============================================================
 * js/ui.js — Núcleo de interfaz de usuario
 * ============================================================
 * Gestiona la infraestructura de UI compartida por todos
 * los módulos. No contiene lógica de negocio ni datos demo.
 *
 * Módulos:
 *  1. Temas          → Claro / Oscuro con persistencia
 *  2. Navegación     → Cambio entre secciones
 *  3. Sidebar Mobile → Abrir/cerrar con overlay
 *  4. Toasts         → Notificaciones emergentes
 *  5. Modal          → Confirmación de acciones destructivas
 *  6. renderSeriesRow → Fila de serie con diseño uniforme
 * ============================================================
 */

'use strict';


// ════════════════════════════════════════════════════════════
// 1. SISTEMA DE TEMAS
// ════════════════════════════════════════════════════════════

/**
 * Aplica un tema y lo guarda en localStorage.
 * Las variables CSS en style.css reaccionan al atributo data-theme.
 * @param {string} theme - 'dark' | 'light'
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const label = document.querySelector('.theme-toggle__label');
  if (label) label.textContent = theme === 'dark' ? 'Tema Oscuro' : 'Tema Claro';
  localStorage.setItem('gymtracker-theme', theme);
  // Si hay un gráfico activo, actualizarlo
  if (window.mainChart) refreshChartColors();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// Aplicar tema guardado o el oscuro por defecto
applyTheme(localStorage.getItem('gymtracker-theme') || 'dark');
document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);


// ════════════════════════════════════════════════════════════
// 2. NAVEGACIÓN ENTRE SECCIONES
// ════════════════════════════════════════════════════════════

/** Título que aparece en el header al navegar a cada sección */
const SECTION_TITLES = {
  home:       'Inicio',
  calendar:   'Calendario',
  routines:   'Mis Rutinas',
  analytics:  'Analíticas',
  comparison: 'Comparativa',
  backup:     'Backup'
};

/**
 * Navega a la sección indicada:
 * · Oculta todas las secciones y muestra la destino con animación
 * · Actualiza el estado activo en sidebar y bottom nav
 * · Actualiza el título del header
 * · Dispara el evento 'section:enter' para que cada módulo
 *   pueda inicializarse solo cuando se necesita (lazy init)
 * @param {string} name - Nombre de la sección
 */
function navigateTo(name) {
  // Ocultar todas las secciones
  document.querySelectorAll('.content-section').forEach(s => {
    s.hidden = true;
    s.classList.remove('active');
  });

  // Mostrar la sección destino con animación CSS
  const target = document.getElementById(`section-${name}`);
  if (target) {
    target.hidden = false;
    requestAnimationFrame(() => target.classList.add('active'));
  }

  // Marcar el link activo en sidebar y bottom nav
  document.querySelectorAll('.nav-link, .bottom-nav__item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === name);
  });

  // Actualizar título del header
  const titleEl = document.getElementById('section-title');
  if (titleEl) titleEl.textContent = SECTION_TITLES[name] || '';

  // Cerrar sidebar mobile si estuviera abierto
  closeSidebar();

  // Disparar evento para que el módulo correspondiente se inicialice
  document.dispatchEvent(new CustomEvent('section:enter', { detail: { section: name } }));
}

// Delegación de clicks: captura tanto [data-section] como [data-target]
document.addEventListener('click', e => {
  const navEl = e.target.closest('[data-section]');
  if (navEl && !navEl.classList.contains('content-section')) {
    e.preventDefault();
    navigateTo(navEl.dataset.section);
    return;
  }
  const tgtEl = e.target.closest('[data-target]');
  if (tgtEl) navigateTo(tgtEl.dataset.target);
});

// Exponer para uso desde otros módulos
window.navigateTo = navigateTo;


// ════════════════════════════════════════════════════════════
// 3. SIDEBAR MOBILE
// ════════════════════════════════════════════════════════════

function openSidebar() {
  document.getElementById('sidebar').classList.add('sidebar--open');
  document.getElementById('sidebar-overlay').hidden = false;
  document.body.classList.add('no-scroll');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('sidebar--open');
  document.getElementById('sidebar-overlay').hidden = true;
  document.body.classList.remove('no-scroll');
}

document.getElementById('btn-sidebar-open')?.addEventListener('click', openSidebar);
document.getElementById('btn-sidebar-close')?.addEventListener('click', closeSidebar);
document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);


// ════════════════════════════════════════════════════════════
// 4. TOASTS — Notificaciones emergentes
// ════════════════════════════════════════════════════════════

const TOAST_ICONS = {
  success: { icon: 'ph-check-circle', cls: 'toast--success' },
  error:   { icon: 'ph-x-circle',     cls: 'toast--error'   },
  warning: { icon: 'ph-warning',      cls: 'toast--warning' },
  info:    { icon: 'ph-info',         cls: 'toast--info'    }
};

/**
 * Muestra un mensaje emergente en la esquina inferior derecha.
 * Se auto-elimina tras 'duration' ms.
 * @param {string} message  - Texto a mostrar
 * @param {string} type     - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - Ms antes de desaparecer (default 3500)
 */
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const cfg       = TOAST_ICONS[type] || TOAST_ICONS.info;

  const toast = document.createElement('div');
  toast.className = `toast ${cfg.cls}`;
  toast.innerHTML = `
    <i class="ph-fill ${cfg.icon} toast__icon"></i>
    <span class="toast__message">${message}</span>
    <button class="toast__close" aria-label="Cerrar"><i class="ph ph-x"></i></button>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  const remove = () => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  };
  toast.querySelector('.toast__close').addEventListener('click', remove);
  setTimeout(remove, duration);
}

window.showToast = showToast;


// ════════════════════════════════════════════════════════════
// 5. MODAL DE CONFIRMACIÓN
// ════════════════════════════════════════════════════════════

/**
 * Muestra un modal de confirmación y devuelve una Promesa.
 * Uso: const ok = await showConfirm('¿Borrar?', 'No se puede deshacer.');
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
function showConfirm(title = '¿Estás seguro?', message = 'Esta acción no se puede deshacer.') {
  return new Promise(resolve => {
    const modal  = document.getElementById('confirm-modal');
    const btnOk  = document.getElementById('modal-btn-confirm');
    const btnNo  = document.getElementById('modal-btn-cancel');

    document.getElementById('modal-title').textContent   = title;
    document.getElementById('modal-message').textContent = message;

    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('modal-overlay--visible'));

    const close = result => {
      modal.classList.remove('modal-overlay--visible');
      modal.addEventListener('transitionend', () => { modal.hidden = true; }, { once: true });
      btnOk.removeEventListener('click', onOk);
      btnNo.removeEventListener('click', onNo);
      resolve(result);
    };

    const onOk = () => close(true);
    const onNo = () => close(false);
    btnOk.addEventListener('click', onOk);
    btnNo.addEventListener('click', onNo);
  });
}

window.showConfirm = showConfirm;


// ════════════════════════════════════════════════════════════
// 6. RENDER SERIES ROW — Diseño uniforme de series
// ════════════════════════════════════════════════════════════

/**
 * Genera el HTML de una fila de serie con diseño 100% uniforme.
 * Formato: "1ª · 80 kg — 8 reps — RIR 2"
 *
 * Todos los campos (peso, reps, intensidad) tienen:
 * · El mismo font-size
 * · El mismo font-weight
 * · El mismo color
 * · Separados por · y — con el mismo estilo
 *
 * @param {number}  seriesNum   - Número de la serie (1, 2, 3…)
 * @param {Object}  set         - { weight, reps, intensityType, intensityValue }
 * @param {boolean} isPR        - ¿Es un récord personal?
 * @returns {string} HTML string
 */
function renderSeriesRow(seriesNum, set, isPR = false) {
  return `
    <div class="series-row ${isPR ? 'series-row--pr' : ''}">
      <span class="series-num">${seriesNum}ª</span>
      <span class="series-sep">·</span>
      <span class="series-field">${set.weight} kg</span>
      <span class="series-sep">—</span>
      <span class="series-field">${set.reps} reps</span>
      <span class="series-sep">—</span>
      <span class="series-field">${set.intensityType} ${set.intensityValue}</span>
      ${isPR ? '<span class="series-pr">★ PR</span>' : ''}
    </div>`;
}

window.renderSeriesRow = renderSeriesRow;

/**
 * Detecta si una serie es un récord personal comparando
 * con el historial previo del mismo ejercicio.
 *
 * @param {Object} set      - Serie actual { weight, reps }
 * @param {Array}  history  - Historial previo [{ maxWeight }]
 * @returns {boolean}
 */
function isPersonalRecord(set, history) {
  if (!history || history.length === 0) return false;
  const prevMax = Math.max(...history.map(h => h.maxWeight || 0));
  return set.weight > prevMax;
}

window.isPersonalRecord = isPersonalRecord;


// ════════════════════════════════════════════════════════════
// 7. HELPERS GLOBALES
// ════════════════════════════════════════════════════════════

/** Nombres de los meses en español */
const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];
window.MESES = MESES;

/** Lista de músculos principales para el selector */
const MUSCULOS = [
  'Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps',
  'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Pantorrillas',
  'Abdominales', 'Trapecios', 'Core'
];
window.MUSCULOS = MUSCULOS;

/**
 * Formatea una fecha "YYYY-MM-DD" como texto legible en español.
 * @param {string} dateStr
 * @returns {string} ej: "7 de Marzo de 2025"
 */
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} de ${MESES[parseInt(m) - 1]} de ${y}`;
}
window.formatDate = formatDate;

/**
 * Formatea una fecha "YYYY-MM-DD" con etiqueta relativa.
 * @param {string} dateStr
 * @returns {string} "Hoy" | "Ayer" | "7 mar"
 */
function formatDateRelative(dateStr) {
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today - 86400000);
  const todayStr  = today.toISOString().split('T')[0];
  const yesterStr = yesterday.toISOString().split('T')[0];
  if (dateStr === todayStr)  return 'Hoy';
  if (dateStr === yesterStr) return 'Ayer';
  const [, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MESES[parseInt(m)-1].slice(0,3).toLowerCase()}`;
}
window.formatDateRelative = formatDateRelative;

/**
 * Calcula el volumen total de un entrenamiento.
 * Volumen = suma(peso × reps) de todas las series de todos los ejercicios.
 * @param {Array} exercises - Lista de ejercicios con sus sets
 * @returns {number}
 */
function calcTotalVolume(exercises) {
  return (exercises || []).reduce((total, ex) =>
    total + (ex.sets || []).reduce((sum, s) =>
      sum + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0), 0);
}
window.calcTotalVolume = calcTotalVolume;
