/**
 * ============================================================
 * js/calendar.js — Calendario e Historial de Entrenos
 * ============================================================
 * Funcionalidades:
 * · Grid mensual navegable con marcadores de días entrenados
 * · Panel de detalle del día seleccionado
 * · Flujo de registro de entreno:
 *     1. Seleccionar rutina
 *     2. Rellenar series por ejercicio (diseño uniforme)
 *     3. Guardar en Firestore
 * ============================================================
 */

'use strict';

const CalendarModule = (() => {

  // ── Estado interno ────────────────────────────────────────
  let _year       = new Date().getFullYear();
  let _month      = new Date().getMonth();   // 0-indexed
  let _selectedDay = null;
  let _monthWorkouts = {};  // { 'YYYY-MM-DD': workout }
  let _loggerState = null;  // Estado del formulario de registro activo

  // ════════════════════════════════════════════════════════════
  // INICIALIZACIÓN
  // ════════════════════════════════════════════════════════════

  async function init() {
    updateMonthTitle();
    await loadMonthWorkouts();
    renderGrid();
    resetDetailPanel();
  }

  document.addEventListener('section:enter', e => {
    if (e.detail.section === 'calendar' && auth.currentUser) init();
  });

  // ── Navegación de mes ─────────────────────────────────────
  document.getElementById('cal-prev')?.addEventListener('click', async () => {
    _month--;
    if (_month < 0) { _month = 11; _year--; }
    _selectedDay = null;
    await init();
  });

  document.getElementById('cal-next')?.addEventListener('click', async () => {
    _month++;
    if (_month > 11) { _month = 0; _year++; }
    _selectedDay = null;
    await init();
  });

  // ════════════════════════════════════════════════════════════
  // CARGA DE DATOS DEL MES
  // ════════════════════════════════════════════════════════════

  async function loadMonthWorkouts() {
    try {
      const workouts = await getWorkoutsByMonth(_year, _month);
      _monthWorkouts = {};
      workouts.forEach(w => { _monthWorkouts[w.date] = w; });
    } catch (err) {
      console.error('Error cargando entrenamientos del mes:', err);
    }
  }

  // ════════════════════════════════════════════════════════════
  // RENDER DEL GRID MENSUAL
  // ════════════════════════════════════════════════════════════

  function updateMonthTitle() {
    const el = document.getElementById('cal-month-title');
    if (el) el.textContent = `${MESES[_month]} ${_year}`;
  }

  function renderGrid() {
    const grid  = document.getElementById('calendar-grid');
    if (!grid) return;

    const today        = new Date();
    const firstDay     = new Date(_year, _month, 1);
    // Convertir a Lunes=0 … Domingo=6 (formato europeo)
    const startDow     = (firstDay.getDay() + 6) % 7;
    const daysInMonth  = new Date(_year, _month + 1, 0).getDate();

    grid.innerHTML = '';

    // Celdas vacías de alineación
    for (let i = 0; i < startDow; i++) {
      const el = document.createElement('div');
      el.className = 'cal-day cal-day--empty';
      grid.appendChild(el);
    }

    // Celdas de días reales
    for (let d = 1; d <= daysInMonth; d++) {
      const mm      = String(_month + 1).padStart(2, '0');
      const dd      = String(d).padStart(2, '0');
      const dateKey = `${_year}-${mm}-${dd}`;

      const hasWorkout = !!_monthWorkouts[dateKey];
      const isToday    = d === today.getDate() && _month === today.getMonth() && _year === today.getFullYear();
      const isSelected = _selectedDay === dateKey;

      const cell = document.createElement('div');
      cell.className = [
        'cal-day',
        hasWorkout ? 'cal-day--workout'  : '',
        isToday    ? 'cal-day--today'    : '',
        isSelected ? 'cal-day--selected' : ''
      ].filter(Boolean).join(' ');

      cell.innerHTML = `
        <span class="cal-day__num">${d}</span>
        ${hasWorkout ? '<span class="cal-day__dot"></span>' : ''}`;

      cell.addEventListener('click', () => selectDay(dateKey));
      grid.appendChild(cell);
    }
  }

  // ════════════════════════════════════════════════════════════
  // SELECCIÓN DE DÍA
  // ════════════════════════════════════════════════════════════

  async function selectDay(dateKey) {
    _selectedDay  = dateKey;
    _loggerState  = null;
    renderGrid(); // Re-renderizar para marcar el día seleccionado

    const workout = _monthWorkouts[dateKey];

    if (workout) {
      renderWorkoutDetail(workout);
    } else {
      renderDayEmpty(dateKey);
    }
  }

  function resetDetailPanel() {
    document.getElementById('day-detail-empty').hidden  = false;
    document.getElementById('day-detail-content').hidden = true;
  }

  function showDetailContent(html) {
    document.getElementById('day-detail-empty').hidden  = true;
    const content = document.getElementById('day-detail-content');
    content.hidden   = false;
    content.innerHTML = html;
  }

  // ════════════════════════════════════════════════════════════
  // VISTA — Entreno YA REGISTRADO
  // ════════════════════════════════════════════════════════════

  /**
   * Muestra el resumen de un entreno con el diseño uniforme de series:
   * "1ª · 80 kg — 8 reps — RIR 2"
   */
  function renderWorkoutDetail(workout) {
    const exercisesHTML = (workout.exercises || []).map(ex => {
      const setsHTML = (ex.sets || []).map((set, i) =>
        renderSeriesRow(i + 1, set, false)
      ).join('');

      return `
        <div class="workout-exercise">
          <div class="workout-exercise__header">
            <span class="workout-exercise__name">${ex.name}</span>
            <span class="workout-exercise__sets">${ex.sets?.length || 0} series</span>
          </div>
          <div class="workout-exercise__sets-list">${setsHTML}</div>
        </div>`;
    }).join('');

    showDetailContent(`
      <div class="day-detail-header">
        <div>
          <p class="day-detail-date">${formatDate(workout.date)}</p>
          <h4 class="day-detail-routine">${workout.routineName || 'Entreno libre'}</h4>
        </div>
        <div class="day-detail-actions">
          <button class="btn btn--secondary btn--sm" id="btn-edit-workout">
            <i class="ph ph-pencil"></i> Editar
          </button>
          <button class="btn btn--ghost btn--sm" id="btn-delete-workout" data-id="${workout.id}">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </div>

      <div class="workout-summary">${exercisesHTML || '<p style="color:var(--text-muted)">Sin ejercicios</p>'}</div>

      <div class="workout-summary__footer">
        <span class="workout-stat">
          <i class="ph-fill ph-barbell"></i> Vol: ${(workout.totalVolume || 0).toLocaleString('es-ES')} kg
        </span>
        <span class="workout-stat">
          <i class="ph-fill ph-stack"></i> ${workout.totalSets || 0} series
        </span>
      </div>`);

    // Botón editar → abrir el logger con los datos existentes
    document.getElementById('btn-edit-workout')?.addEventListener('click', () => {
      renderWorkoutLogger(workout.date, workout);
    });

    // Botón eliminar
    document.getElementById('btn-delete-workout')?.addEventListener('click', async () => {
      const ok = await showConfirm('¿Eliminar este entreno?', 'Se borrará permanentemente.');
      if (!ok) return;
      try {
        await deleteWorkout(workout.id);
        delete _monthWorkouts[workout.date];
        _selectedDay = null;
        renderGrid();
        resetDetailPanel();
        showToast('Entreno eliminado', 'success');
      } catch (err) {
        showToast('Error al eliminar el entreno', 'error');
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // VISTA — Día sin entreno
  // ════════════════════════════════════════════════════════════

  function renderDayEmpty(dateKey) {
    showDetailContent(`
      <div class="day-detail-header">
        <div>
          <p class="day-detail-date">${formatDate(dateKey)}</p>
          <h4 class="day-detail-routine">Sin entreno registrado</h4>
        </div>
      </div>
      <div class="day-no-workout">
        <i class="ph ph-calendar-plus day-no-workout__icon"></i>
        <p>No hay entreno para este día.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--s3);margin-top:var(--s5)">
        <button class="btn btn--primary btn--full" id="btn-start-log">
          <i class="ph-fill ph-lightning"></i> Registrar entreno
        </button>
      </div>`);

    document.getElementById('btn-start-log')?.addEventListener('click', () => {
      renderRoutineSelector(dateKey);
    });
  }

  // ════════════════════════════════════════════════════════════
  // PASO 1 — Selección de rutina
  // ════════════════════════════════════════════════════════════

  function renderRoutineSelector(dateKey) {
    const routines = RoutinesModule.getRoutines();

    const routineCards = routines.length
      ? routines.map(r => `
          <div class="routine-pick-card" data-routine-id="${r.id}">
            <div class="routine-pick-card__color" style="background:${r.color}"></div>
            <div>
              <span class="routine-pick-card__name">${r.name}</span>
              <span class="routine-pick-card__meta">${r.exercises?.length || 0} ejercicios</span>
            </div>
            <i class="ph ph-caret-right"></i>
          </div>`).join('')
      : `<p style="color:var(--text-muted);padding:var(--s4)">
           No tienes rutinas creadas. Ve a <strong>Rutinas</strong> para crear una.
         </p>`;

    showDetailContent(`
      <div class="day-detail-header">
        <div>
          <p class="day-detail-date">${formatDate(dateKey)}</p>
          <h4 class="day-detail-routine">Selecciona una rutina</h4>
        </div>
        <button class="btn btn--ghost btn--sm" id="btn-cancel-log">
          <i class="ph ph-x"></i> Cancelar
        </button>
      </div>
      <div class="routine-pick-list">${routineCards}</div>
      <button class="btn btn--ghost btn--full" id="btn-free-log" style="margin-top:var(--s4)">
        <i class="ph ph-pencil-simple"></i> Registrar sin rutina
      </button>`);

    document.getElementById('btn-cancel-log')?.addEventListener('click', () => {
      const workout = _monthWorkouts[dateKey];
      workout ? renderWorkoutDetail(workout) : renderDayEmpty(dateKey);
    });

    document.querySelectorAll('.routine-pick-card').forEach(card => {
      card.addEventListener('click', () => {
        const routine = RoutinesModule.getRoutines().find(r => r.id === card.dataset.routineId);
        if (routine) renderWorkoutLogger(dateKey, null, routine);
      });
    });

    document.getElementById('btn-free-log')?.addEventListener('click', () => {
      renderWorkoutLogger(dateKey, null, null);
    });
  }

  // ════════════════════════════════════════════════════════════
  // PASO 2 — Formulario de registro de series
  // ════════════════════════════════════════════════════════════

  /**
   * Renderiza el formulario principal de registro.
   * Si se edita un workout existente, precarga sus series.
   * Si hay una rutina seleccionada, usa sus ejercicios como plantilla.
   *
   * @param {string}      dateKey  - Fecha "YYYY-MM-DD"
   * @param {Object|null} existing - Workout existente (para edición)
   * @param {Object|null} routine  - Rutina seleccionada como plantilla
   */
  function renderWorkoutLogger(dateKey, existing = null, routine = null) {
    // Decidir qué ejercicios mostrar:
    // 1. Si editamos, usar los ejercicios ya guardados
    // 2. Si hay rutina, usar sus ejercicios como plantilla
    // 3. Si no, empezar con un ejercicio vacío
    let exercises = [];
    if (existing?.exercises?.length) {
      exercises = existing.exercises;
    } else if (routine?.exercises?.length) {
      // Convertir ejercicios de la rutina en estructura de workout
      exercises = routine.exercises.map(ex => ({
        name:   ex.name,
        muscle: ex.muscle,
        sets:   [] // El usuario añadirá las series
      }));
    } else {
      exercises = [{ name: '', muscle: '', sets: [] }];
    }

    const routineName = existing?.routineName || routine?.name || 'Entreno libre';
    const workoutId   = existing?.id || null;

    // Guardar estado del logger (para saveWorkout más tarde)
    _loggerState = { dateKey, workoutId, routineName, routineId: routine?.id || existing?.routineId || null };

    // Generar HTML de cada ejercicio con sus series
    const exercisesHTML = exercises.map((ex, exIdx) =>
      buildLoggerExercise(ex, exIdx)
    ).join('');

    showDetailContent(`
      <div class="day-detail-header">
        <div>
          <p class="day-detail-date">${formatDate(dateKey)}</p>
          <h4 class="day-detail-routine">${routineName}</h4>
        </div>
        <button class="btn btn--ghost btn--sm" id="btn-cancel-logger">
          <i class="ph ph-x"></i>
        </button>
      </div>

      <div class="workout-logger" id="workout-logger">
        ${exercisesHTML}

        <!-- Añadir ejercicio extra -->
        <button class="btn-add-exercise" id="btn-add-logger-exercise">
          <i class="ph ph-plus-circle"></i> Añadir ejercicio
        </button>
      </div>

      <div class="logger-footer">
        <button class="btn btn--primary btn--full" id="btn-save-workout">
          <i class="ph ph-floppy-disk"></i> Guardar entreno
        </button>
      </div>`);

    // Conectar eventos de las series existentes
    bindLoggerEvents();

    document.getElementById('btn-cancel-logger')?.addEventListener('click', () => {
      const w = _monthWorkouts[dateKey];
      w ? renderWorkoutDetail(w) : renderDayEmpty(dateKey);
    });

    document.getElementById('btn-save-workout')?.addEventListener('click', () => {
      handleSaveWorkout();
    });

    document.getElementById('btn-add-logger-exercise')?.addEventListener('click', () => {
      const logger = document.getElementById('workout-logger');
      const addBtn = document.getElementById('btn-add-logger-exercise');
      const exCount = logger.querySelectorAll('.logger-exercise').length;
      const div = document.createElement('div');
      div.innerHTML = buildLoggerExercise({ name: '', muscle: '', sets: [] }, exCount);
      logger.insertBefore(div.firstElementChild, addBtn);
      bindLoggerEvents();
    });
  }

  // ── Ejercicio dentro del logger ───────────────────────────

  /**
   * Genera el HTML de un bloque de ejercicio en el formulario de registro.
   * Incluye: nombre, músculo, lista de series y botón "Añadir serie".
   */
  function buildLoggerExercise(ex, exIdx) {
    const muscleOptions = MUSCULOS.map(m =>
      `<option value="${m}" ${ex.muscle === m ? 'selected' : ''}>${m}</option>`
    ).join('');

    const setsHTML = (ex.sets || []).map((set, i) =>
      buildLoggerSeriesRow(exIdx, i, set)
    ).join('');

    return `
      <div class="logger-exercise" data-ex-idx="${exIdx}">
        <div class="logger-exercise__header">
          <input class="input input--inline logger-ex-name"
            value="${ex.name}" placeholder="Nombre del ejercicio..." />
          <select class="input input--sm logger-ex-muscle">
            <option value="">Músculo…</option>
            ${muscleOptions}
          </select>
          <button class="btn-icon-sm btn-icon-sm--danger logger-remove-ex" title="Quitar ejercicio">
            <i class="ph ph-x"></i>
          </button>
        </div>

        <!-- Cabecera de columnas de la tabla de series -->
        <div class="series-cols-header">
          <span>Serie</span>
          <span>Peso</span>
          <span>Reps</span>
          <span>Intensidad</span>
          <span></span>
        </div>

        <!-- Series registradas -->
        <div class="logger-series-list">
          ${setsHTML}
        </div>

        <!-- Botón añadir serie -->
        <button class="btn-add-series" data-ex-idx="${exIdx}">
          <i class="ph ph-plus"></i> Añadir serie
        </button>
      </div>`;
  }

  /**
   * Genera una fila de entrada de serie con diseño uniforme.
   * Todos los inputs tienen el mismo tamaño y estilo.
   * Formato: [1ª] [_10_ kg] [_11_ reps] [RIR ▼] [_2_] [✗]
   */
  function buildLoggerSeriesRow(exIdx, setIdx, set = {}) {
    const weight   = set.weight   ?? '';
    const reps     = set.reps     ?? '';
    const intType  = set.intensityType  || 'RIR';
    const intValue = set.intensityValue ?? '';

    return `
      <div class="series-row series-row--input" data-ex-idx="${exIdx}" data-set-idx="${setIdx}">
        <span class="series-num">${setIdx + 1}ª</span>
        <span class="series-sep">·</span>
        <input class="series-field series-input" type="number"
          step="0.5" min="0" value="${weight}" placeholder="0" title="Peso (kg)" />
        <span class="series-field series-unit">kg</span>
        <span class="series-sep">—</span>
        <input class="series-field series-input" type="number"
          min="1" value="${reps}" placeholder="0" title="Repeticiones" />
        <span class="series-field series-unit">reps</span>
        <span class="series-sep">—</span>
        <select class="series-field series-select" title="Tipo de intensidad">
          <option ${intType === 'RIR'  ? 'selected' : ''}>RIR</option>
          <option ${intType === 'RPE'  ? 'selected' : ''}>RPE</option>
          <option ${intType === '%1RM' ? 'selected' : ''}>%1RM</option>
        </select>
        <input class="series-field series-input" type="number"
          step="0.5" min="0" value="${intValue}" placeholder="0" title="Valor intensidad" />
        <button class="series-remove btn-icon-sm btn-icon-sm--danger" title="Eliminar serie">
          <i class="ph ph-x"></i>
        </button>
      </div>`;
  }

  // ── Conectar todos los eventos del logger ─────────────────

  function bindLoggerEvents() {
    const logger = document.getElementById('workout-logger');
    if (!logger) return;

    // Botón "Añadir serie" por ejercicio
    logger.querySelectorAll('.btn-add-series').forEach(btn => {
      // Evitar duplicar listeners
      btn.replaceWith(btn.cloneNode(true));
    });
    logger.querySelectorAll('.btn-add-series').forEach(btn => {
      btn.addEventListener('click', () => {
        const exEl   = btn.closest('.logger-exercise');
        const exIdx  = parseInt(exEl.dataset.exIdx);
        const list   = exEl.querySelector('.logger-series-list');
        const setIdx = list.querySelectorAll('.series-row').length;
        const div    = document.createElement('div');
        div.innerHTML = buildLoggerSeriesRow(exIdx, setIdx);
        list.appendChild(div.firstElementChild);

        // Enfocar el campo de peso de la nueva serie
        list.lastElementChild?.querySelector('.series-input')?.focus();
        bindLoggerEvents();
      });
    });

    // Botón eliminar serie
    logger.querySelectorAll('.series-remove').forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
    logger.querySelectorAll('.series-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const row   = btn.closest('.series-row');
        const list  = row.closest('.logger-series-list');
        row.remove();
        // Renumerar las series restantes
        list.querySelectorAll('.series-row').forEach((r, i) => {
          r.dataset.setIdx = i;
          const numEl = r.querySelector('.series-num');
          if (numEl) numEl.textContent = (i + 1) + 'ª';
        });
      });
    });

    // Botón eliminar ejercicio
    logger.querySelectorAll('.logger-remove-ex').forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
    logger.querySelectorAll('.logger-remove-ex').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ex   = btn.closest('.logger-exercise');
        const name = ex.querySelector('.logger-ex-name')?.value || 'este ejercicio';
        const ok   = await showConfirm(`¿Quitar "${name}"?`, 'Se eliminará del registro.');
        if (ok) ex.remove();
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // GUARDAR ENTRENO
  // ════════════════════════════════════════════════════════════

  async function handleSaveWorkout() {
    if (!_loggerState) return;
    const { dateKey, workoutId, routineName, routineId } = _loggerState;

    // Recoger todos los datos del formulario
    const exercises = [];
    document.querySelectorAll('.logger-exercise').forEach(exEl => {
      const name   = exEl.querySelector('.logger-ex-name')?.value.trim() || '';
      const muscle = exEl.querySelector('.logger-ex-muscle')?.value || '';
      const sets   = [];

      exEl.querySelectorAll('.series-row--input').forEach(row => {
        const inputs  = row.querySelectorAll('.series-input');
        const selects = row.querySelectorAll('.series-select');
        const weight  = parseFloat(inputs[0]?.value);
        const reps    = parseInt(inputs[1]?.value);
        const intVal  = parseFloat(inputs[2]?.value);

        // Solo guardar series que tengan al menos peso o reps
        if (!isNaN(weight) || !isNaN(reps)) {
          sets.push({
            weight:         isNaN(weight) ? 0 : weight,
            reps:           isNaN(reps)   ? 0 : reps,
            intensityType:  selects[0]?.value || 'RIR',
            intensityValue: isNaN(intVal) ? 0 : intVal
          });
        }
      });

      if (name || sets.length > 0) {
        exercises.push({ name, muscle, sets });
      }
    });

    if (exercises.length === 0) {
      showToast('Añade al menos un ejercicio con series', 'warning');
      return;
    }

    // Calcular métricas resumen
    const totalVolume = calcTotalVolume(exercises);
    const totalSets   = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);

    const workoutData = {
      date:        dateKey,
      routineId:   routineId || null,
      routineName: routineName,
      exercises,
      totalVolume,
      totalSets,
      ...(workoutId ? { id: workoutId } : {})
    };

    try {
      const savedId = await saveWorkout(workoutData);
      workoutData.id = savedId;

      // Actualizar caché local del mes
      _monthWorkouts[dateKey] = workoutData;
      _selectedDay = dateKey;

      renderGrid();
      renderWorkoutDetail(workoutData);

      showToast('Entreno guardado ✓', 'success');

      // Refrescar el home también
      await refreshHome();
    } catch (err) {
      console.error('Error guardando entreno:', err);
      showToast('Error al guardar el entreno', 'error');
    }
  }

  return { init };

})();
