/**
 * ============================================================
 * js/routines.js — Gestión de Rutinas
 * ============================================================
 * CRUD completo de rutinas con editor de ejercicios.
 * Cada ejercicio tiene: nombre, músculo, tipo, series target,
 * reps target, tipo de intensidad, valor intensidad, notas.
 *
 * Flujo:
 *  1. init()         → carga y renderiza la lista de rutinas
 *  2. selectRoutine()→ carga el editor con los datos de esa rutina
 *  3. saveRoutine()  → recoge el formulario y escribe en Firestore
 *  4. deleteRoutine()→ confirma y borra
 * ============================================================
 */

'use strict';

// Estado interno del módulo
const RoutinesModule = (() => {

  // Cache local de rutinas para no recargar cada vez
  let _routines = [];
  // ID de la rutina actualmente seleccionada/en edición
  let _currentRoutineId = null;
  // ¿Es la rutina actual nueva (aún no guardada)?
  let _isNew = false;

  // ── Colores disponibles para rutinas ─────────────────────
  const COLORS = [
    '#FFD600','#FF6F00','#22C55E','#3B82F6',
    '#A855F7','#EC4899','#EF4444','#14B8A6'
  ];

  // ── Días de la semana ─────────────────────────────────────
  const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  // ════════════════════════════════════════════════════════════
  // INICIALIZACIÓN
  // ════════════════════════════════════════════════════════════

  /**
   * Carga las rutinas de Firestore y renderiza la lista.
   * Se llama al entrar en la sección y desde app.js al arrancar.
   */
  async function init() {
    try {
      _routines = await getRoutines();
      renderList();

      // Actualizar contador en el home
      const vals = document.querySelectorAll('.stat-card__value');
      if (vals[2]) vals[2].textContent = _routines.length;

      // Si hay rutinas, seleccionar la primera por defecto
      if (_routines.length > 0 && !_currentRoutineId) {
        selectRoutine(_routines[0].id);
      } else if (_routines.length === 0) {
        renderEmptyEditor();
      }
    } catch (err) {
      console.error('Error cargando rutinas:', err);
      showToast('Error al cargar las rutinas', 'error');
    }
  }

  // ── Escuchar el evento de navegación ─────────────────────
  document.addEventListener('section:enter', e => {
    if (e.detail.section === 'routines' && auth.currentUser) init();
  });

  // ════════════════════════════════════════════════════════════
  // RENDERIZADO — Lista de rutinas (panel izquierdo)
  // ════════════════════════════════════════════════════════════

  function renderList() {
    const list = document.getElementById('routines-list');
    if (!list) return;

    if (_routines.length === 0) {
      list.innerHTML = `
        <div class="routines-empty">
          <i class="ph ph-lightning"></i>
          <p>Aún no tienes rutinas.<br/>Crea la primera.</p>
        </div>`;
      return;
    }

    list.innerHTML = _routines.map(r => `
      <div class="routine-card ${r.id === _currentRoutineId ? 'routine-card--active' : ''}"
           data-routine-id="${r.id}">
        <div class="routine-card__color" style="background:${r.color || COLORS[0]}"></div>
        <div class="routine-card__info">
          <span class="routine-card__name">${r.name || 'Sin nombre'}</span>
          <span class="routine-card__meta">${r.exercises?.length || 0} ejercicios · ${(r.days || []).join(' / ') || 'Sin días'}</span>
        </div>
        <div class="routine-card__actions">
          <button class="btn-icon-sm btn-icon-sm--danger js-delete-routine"
            data-id="${r.id}" title="Eliminar rutina">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </div>`).join('');

    // Click en tarjeta → seleccionar
    list.querySelectorAll('.routine-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.js-delete-routine')) return;
        selectRoutine(card.dataset.routineId);
      });
    });

    // Click en borrar
    list.querySelectorAll('.js-delete-routine').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id       = btn.dataset.id;
        const routine  = _routines.find(r => r.id === id);
        const ok       = await showConfirm(
          `¿Eliminar "${routine?.name}"?`,
          'Se borrará la rutina y todos sus ejercicios permanentemente.'
        );
        if (!ok) return;
        try {
          await deleteRoutine(id);
          showToast(`Rutina "${routine?.name}" eliminada`, 'success');
          if (_currentRoutineId === id) {
            _currentRoutineId = null;
            _isNew = false;
          }
          await init();
        } catch (err) {
          showToast('Error al eliminar la rutina', 'error');
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // SELECCIÓN — Cargar rutina en el editor (panel derecho)
  // ════════════════════════════════════════════════════════════

  function selectRoutine(id) {
    const routine = _routines.find(r => r.id === id);
    if (!routine) return;
    _currentRoutineId = id;
    _isNew = false;

    // Actualizar visual de la lista
    document.querySelectorAll('.routine-card').forEach(c =>
      c.classList.toggle('routine-card--active', c.dataset.routineId === id)
    );

    renderEditor(routine);
  }

  // ════════════════════════════════════════════════════════════
  // EDITOR — Panel derecho con formulario de la rutina
  // ════════════════════════════════════════════════════════════

  /**
   * Renderiza el editor completo de una rutina:
   * · Nombre, color, días de la semana
   * · Lista de ejercicios con todos sus campos
   * · Botón añadir ejercicio + guardar
   */
  function renderEditor(routine) {
    const panel = document.querySelector('.routine-detail-panel');
    if (!panel) return;

    // Selector de color
    const colorSwatches = COLORS.map(c => `
      <button type="button" class="color-swatch ${c === (routine.color || COLORS[0]) ? 'color-swatch--active' : ''}"
        data-color="${c}" style="background:${c}" title="${c}"></button>
    `).join('');

    // Selector de días
    const dayBtns = DIAS.map(d => `
      <button type="button" class="day-btn ${(routine.days || []).includes(d) ? 'day-btn--active' : ''}"
        data-day="${d}">${d}</button>
    `).join('');

    panel.innerHTML = `
      <div class="panel-header">
        <h3 class="panel-title" id="routine-detail-title">
          ${_isNew ? 'Nueva Rutina' : routine.name}
        </h3>
        <button class="btn btn--primary btn--sm" id="btn-save-routine">
          <i class="ph ph-floppy-disk"></i> Guardar
        </button>
      </div>

      <!-- Nombre de la rutina -->
      <div class="routine-field">
        <label class="input-label">Nombre de la rutina</label>
        <input id="routine-name" class="input input--full"
          value="${routine.name || ''}" placeholder="Ej: Torso A, Pierna B..." />
      </div>

      <!-- Color identificador -->
      <div class="routine-field">
        <label class="input-label">Color identificador</label>
        <div class="color-picker" id="color-picker">${colorSwatches}</div>
        <input type="hidden" id="routine-color" value="${routine.color || COLORS[0]}" />
      </div>

      <!-- Días de la semana -->
      <div class="routine-field">
        <label class="input-label">Días de entrenamiento</label>
        <div class="day-selector" id="day-selector">${dayBtns}</div>
      </div>

      <!-- Lista de ejercicios -->
      <div class="routine-field">
        <label class="input-label">Ejercicios</label>
        <div class="exercises-list" id="exercises-list">
          ${(routine.exercises || []).map(ex => buildExerciseRow(ex)).join('')}
          <button class="btn-add-exercise" id="btn-add-exercise">
            <i class="ph ph-plus-circle"></i> Añadir ejercicio
          </button>
        </div>
      </div>`;

    // ── Conectar interacciones ───────────────────────────────

    // Toggle de colores
    panel.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        panel.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('color-swatch--active'));
        swatch.classList.add('color-swatch--active');
        document.getElementById('routine-color').value = swatch.dataset.color;
      });
    });

    // Toggle de días
    panel.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('day-btn--active'));
    });

    // Añadir ejercicio
    document.getElementById('btn-add-exercise')?.addEventListener('click', () => {
      const list   = document.getElementById('exercises-list');
      const addBtn = document.getElementById('btn-add-exercise');
      const row    = document.createElement('div');
      row.innerHTML = buildExerciseRow(null);
      const item   = row.firstElementChild;
      list.insertBefore(item, addBtn);
      bindExerciseRowEvents(item);
      item.querySelector('.input--inline')?.focus();
    });

    // Botones de eliminar en ejercicios existentes
    panel.querySelectorAll('.exercise-item').forEach(item => bindExerciseRowEvents(item));

    // Guardar
    document.getElementById('btn-save-routine')?.addEventListener('click', handleSave);
  }

  /** Renderiza el estado vacío cuando no hay rutinas */
  function renderEmptyEditor() {
    const panel = document.querySelector('.routine-detail-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="panel-header">
        <h3 class="panel-title">Editor de Rutina</h3>
      </div>
      <div class="routines-empty" style="min-height:200px">
        <i class="ph ph-arrow-left"></i>
        <p>Crea tu primera rutina con<br/>el botón "Nueva"</p>
      </div>`;
  }

  // ════════════════════════════════════════════════════════════
  // EJERCICIO ROW — Fila de ejercicio en el editor
  // ════════════════════════════════════════════════════════════

  /**
   * Genera el HTML de una fila de ejercicio con todos sus campos:
   * nombre, músculo, tipo (compuesto/aislamiento),
   * series × reps, tipo intensidad, valor intensidad, notas.
   * @param {Object|null} ex - Datos del ejercicio o null si es nuevo
   */
  function buildExerciseRow(ex) {
    const muscleOptions = MUSCULOS.map(m =>
      `<option value="${m}" ${ex?.muscle === m ? 'selected' : ''}>${m}</option>`
    ).join('');

    return `
      <div class="exercise-item">
        <div class="exercise-item__drag" title="Arrastrar para reordenar">
          <i class="ph ph-dots-six-vertical"></i>
        </div>
        <div class="exercise-item__body">

          <!-- Fila 1: Nombre + Músculo + Tipo -->
          <div class="exercise-item__row exercise-item__row--top">
            <input class="input input--inline" value="${ex?.name || ''}"
              placeholder="Nombre del ejercicio..." />
            <select class="input input--sm" title="Músculo principal">
              <option value="">Músculo…</option>
              ${muscleOptions}
            </select>
            <select class="input input--sm" title="Tipo de ejercicio">
              <option value="Compuesto" ${ex?.type === 'Compuesto' ? 'selected' : ''}>Compuesto</option>
              <option value="Aislamiento" ${ex?.type === 'Aislamiento' ? 'selected' : ''}>Aislamiento</option>
            </select>
          </div>

          <!-- Fila 2: Series × Reps + Tipo/Valor Intensidad -->
          <div class="exercise-item__row exercise-item__row--targets">
            <span class="input-label-inline">Objetivo:</span>
            <input class="input input--xs" value="${ex?.targetSets || 3}"
              type="number" min="1" title="Series objetivo" />
            <span class="input-sep">series ×</span>
            <input class="input input--xs" value="${ex?.targetReps || 10}"
              type="number" min="1" title="Reps objetivo" />
            <span class="input-sep">reps</span>
            <select class="input input--xs" title="Tipo de intensidad">
              <option ${ex?.intensityType === 'RIR'  ? 'selected' : ''}>RIR</option>
              <option ${ex?.intensityType === 'RPE'  ? 'selected' : ''}>RPE</option>
              <option ${ex?.intensityType === '%1RM' ? 'selected' : ''}>%1RM</option>
            </select>
            <input class="input input--xs" value="${ex?.intensityValue ?? 2}"
              type="number" step="0.5" min="0" title="Valor de intensidad" />
          </div>

          <!-- Fila 3: Notas de técnica -->
          <input class="input input--full" value="${ex?.notes || ''}"
            placeholder="Notas de técnica (opcional)..." />
        </div>
        <button class="btn-icon-sm btn-icon-sm--danger exercise-item__remove"
          title="Eliminar ejercicio">
          <i class="ph ph-x"></i>
        </button>
      </div>`;
  }

  /** Conecta el botón de eliminar de una fila de ejercicio */
  function bindExerciseRowEvents(item) {
    item.querySelector('.exercise-item__remove')?.addEventListener('click', async () => {
      const name = item.querySelector('.input--inline')?.value || 'este ejercicio';
      const ok   = await showConfirm(`¿Eliminar "${name}"?`, 'Se quitará de la rutina.');
      if (ok) {
        item.remove();
        showToast('Ejercicio eliminado', 'success');
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // GUARDAR
  // ════════════════════════════════════════════════════════════

  /**
   * Recoge todos los datos del formulario y los guarda en Firestore.
   * Valida que el nombre no esté vacío.
   */
  async function handleSave() {
    const name  = document.getElementById('routine-name')?.value.trim();
    const color = document.getElementById('routine-color')?.value || COLORS[0];
    const days  = [...document.querySelectorAll('.day-btn--active')].map(b => b.dataset.day);

    if (!name) {
      showToast('El nombre de la rutina es obligatorio', 'warning');
      document.getElementById('routine-name')?.focus();
      return;
    }

    // Recoger todos los ejercicios del editor
    const exercises = [...document.querySelectorAll('.exercise-item')].map(item => {
      const inputs  = item.querySelectorAll('input');
      const selects = item.querySelectorAll('select');
      return {
        name:           inputs[0]?.value.trim() || '',
        muscle:         selects[0]?.value || '',
        type:           selects[1]?.value || 'Compuesto',
        targetSets:     parseInt(inputs[1]?.value) || 3,
        targetReps:     parseInt(inputs[2]?.value) || 10,
        intensityType:  selects[2]?.value || 'RIR',
        intensityValue: parseFloat(inputs[3]?.value) ?? 2,
        notes:          inputs[4]?.value.trim() || ''
      };
    }).filter(ex => ex.name); // Descartar filas vacías

    const routineData = {
      name, color, days, exercises,
      ...((_currentRoutineId && !_isNew) ? { id: _currentRoutineId } : {})
    };

    try {
      const savedId = await saveRoutine(routineData);
      showToast(`Rutina "${name}" guardada ✓`, 'success');
      _currentRoutineId = savedId;
      _isNew = false;
      await init(); // Recargar lista para reflejar cambios
    } catch (err) {
      console.error('Error guardando rutina:', err);
      showToast('Error al guardar la rutina', 'error');
    }
  }

  // ════════════════════════════════════════════════════════════
  // NUEVA RUTINA
  // ════════════════════════════════════════════════════════════

  document.getElementById('btn-new-routine')?.addEventListener('click', () => {
    _currentRoutineId = null;
    _isNew = true;

    // Limpiar selección en la lista
    document.querySelectorAll('.routine-card').forEach(c =>
      c.classList.remove('routine-card--active')
    );

    // Abrir editor con rutina vacía
    renderEditor({
      name: '', color: COLORS[0], days: [], exercises: []
    });
  });

  // ════════════════════════════════════════════════════════════
  // API PÚBLICA del módulo
  // ════════════════════════════════════════════════════════════

  return {
    init,
    getRoutines: () => _routines  // Para que calendar.js pueda leer las rutinas en caché
  };

})();
