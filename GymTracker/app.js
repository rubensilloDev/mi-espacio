/**
 * ============================================================
 * js/app.js — Orquestador principal
 * ============================================================
 * Se ejecuta una vez que el usuario está autenticado.
 * Coordina la inicialización de todos los módulos y
 * gestiona la sección Home con datos reales.
 * ============================================================
 */

'use strict';

// ════════════════════════════════════════════════════════════
// ARRANQUE DE LA APP
// ════════════════════════════════════════════════════════════

/**
 * Inicializa la app completa para el usuario autenticado.
 * Llamado por auth.js cuando onAuthStateChanged detecta sesión.
 * @param {firebase.User} user
 */
async function initApp(user) {
  try {
    // 1. Cargar el home con datos reales
    await refreshHome();

    // 2. Pre-cargar rutinas (necesarias para el calendario y el home)
    await RoutinesModule.init();

    showToast(`¡Hola, ${user.displayName?.split(' ')[0] || 'atleta'}! 💪`, 'success');

  } catch (err) {
    console.error('Error al inicializar la app:', err);
    showToast('Error al cargar los datos. Comprueba tu conexión.', 'error');
  }
}

// ════════════════════════════════════════════════════════════
// HOME — Dashboard con datos reales
// ════════════════════════════════════════════════════════════

/**
 * Carga y renderiza todos los elementos del Home:
 * · 4 tarjetas de estadísticas
 * · Último entreno registrado
 */
async function refreshHome() {
  try {
    const recentWorkouts = await getRecentWorkouts(30);
    updateStatCards(recentWorkouts);
    renderLastWorkoutCard(recentWorkouts[0] || null);
  } catch (err) {
    console.error('Error al cargar el home:', err);
  }
}

/**
 * Actualiza las 4 tarjetas de estadísticas del Home.
 * · Días entrenados este mes
 * · Volumen total esta semana (kg)
 * · Número de rutinas (lo actualiza RoutinesModule)
 * · Racha actual de días consecutivos
 */
function updateStatCards(workouts) {
  const now       = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Días entrenados en el mes actual
  const daysThisMonth = workouts.filter(w => w.date?.startsWith(thisMonth)).length;

  // Volumen de los últimos 7 días
  const weekAgo      = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const weekAgoStr   = weekAgo.toISOString().split('T')[0];
  const weekVolume   = workouts
    .filter(w => w.date >= weekAgoStr)
    .reduce((sum, w) => sum + (w.totalVolume || 0), 0);

  // Racha de días consecutivos entrenados
  const streak = calculateStreak(workouts);

  // Actualizar el DOM
  const vals = document.querySelectorAll('.stat-card__value');
  if (vals[0]) vals[0].textContent = daysThisMonth;
  if (vals[1]) vals[1].textContent = weekVolume.toLocaleString('es-ES') + ' kg';
  // vals[2] = rutinas → lo actualiza RoutinesModule.init()
  if (vals[3]) vals[3].textContent = streak > 0 ? `${streak} 🔥` : '0';
}

/**
 * Calcula la racha actual de días consecutivos entrenando.
 * Para cada día del historial, comprueba si fue el día anterior al último.
 * @param {Array} workouts - Ordenados por fecha descendente
 * @returns {number} días de racha
 */
function calculateStreak(workouts) {
  if (!workouts.length) return 0;

  // Fechas únicas ordenadas desc
  const dates = [...new Set(workouts.map(w => w.date))].sort().reverse();

  let streak    = 0;
  let checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);

  for (const dateStr of dates) {
    const wDate   = new Date(dateStr + 'T00:00:00');
    const diffDays = Math.round((checkDate - wDate) / 86400000);
    if (diffDays <= 1) {
      streak++;
      checkDate = wDate;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Renderiza el último entrenamiento en la tarjeta del Home.
 * Usa el diseño uniforme de series: "1ª · 80 kg — 8 reps — RIR 2"
 * @param {Object|null} workout
 */
function renderLastWorkoutCard(workout) {
  const container = document.querySelector('.last-workout');
  if (!container) return;

  if (!workout) {
    container.innerHTML = `
      <h3 class="last-workout__title">
        <i class="ph-fill ph-clock-counter-clockwise"></i>
        Último Entreno
      </h3>
      <div class="last-workout__empty">
        <i class="ph ph-barbell"></i>
        <p>Aún no has registrado ningún entreno.</p>
        <button class="btn btn--primary" data-target="calendar">
          <i class="ph ph-plus"></i> Registrar primer entreno
        </button>
      </div>`;
    return;
  }

  // Renderizar hasta 3 ejercicios del último entreno
  const exercisesHTML = (workout.exercises || []).slice(0, 3).map(ex => {
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

  const dateLabel = formatDateRelative(workout.date);

  container.innerHTML = `
    <h3 class="last-workout__title">
      <i class="ph-fill ph-clock-counter-clockwise"></i>
      Último Entreno — ${workout.routineName || 'Entreno libre'}
      <span class="last-workout__date">${dateLabel}</span>
    </h3>
    <div class="workout-summary">${exercisesHTML || '<p style="color:var(--text-muted);padding:var(--s4)">Sin ejercicios registrados</p>'}</div>
    <div class="workout-summary__footer">
      <span class="workout-stat"><i class="ph-fill ph-barbell"></i> Vol: ${(workout.totalVolume || 0).toLocaleString('es-ES')} kg</span>
      <span class="workout-stat"><i class="ph-fill ph-calendar"></i> ${dateLabel}</span>
      ${workout.totalSets ? `<span class="workout-stat"><i class="ph-fill ph-stack"></i> ${workout.totalSets} series</span>` : ''}
    </div>`;
}

// ── Recargar Home al volver a la sección ────────────────────
document.addEventListener('section:enter', async e => {
  if (e.detail.section === 'home' && auth.currentUser) {
    await refreshHome();
    // También actualizar el contador de rutinas
    const routineCount = await getRoutines().then(r => r.length).catch(() => 0);
    const vals = document.querySelectorAll('.stat-card__value');
    if (vals[2]) vals[2].textContent = routineCount;
  }
});
