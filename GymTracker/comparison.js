/**
 * ============================================================
 * js/comparison.js — Comparativa histórica mes vs mes
 * ============================================================
 * Carga dos meses de Firestore, cruza los datos por ejercicio
 * y genera la tabla cara a cara con indicadores de diferencia.
 * ============================================================
 */

'use strict';

const ComparisonModule = (() => {

  document.addEventListener('section:enter', async e => {
    if (e.detail.section === 'comparison' && auth.currentUser) {
      init();
    }
  });

  /**
   * Inicializa los selectores con los últimos 12 meses
   * y dispara la comparativa por defecto (mes actual vs anterior).
   */
  async function init() {
    populateMonthSelectors();
    // Seleccionar por defecto: mes actual (A) vs mes anterior (B)
    const selA = document.getElementById('comp-select-a');
    const selB = document.getElementById('comp-select-b');
    if (selA) selA.selectedIndex = 0;
    if (selB) selB.selectedIndex = 1;
    populateRoutineSelector();
  }

  /**
   * Rellena los <select> de mes con los últimos 12 meses
   * en formato "YYYY-MM" con etiqueta legible.
   */
  function populateMonthSelectors() {
    const selA = document.getElementById('comp-select-a');
    const selB = document.getElementById('comp-select-b');
    if (!selA || !selB) return;

    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
      options.push(`<option value="${val}">${label}</option>`);
    }

    selA.innerHTML = options.join('');
    selB.innerHTML = options.join('');
    if (selB.options[1]) selB.selectedIndex = 1;
  }

  /** Rellena el <select> de rutinas con las rutinas del usuario */
  function populateRoutineSelector() {
    const sel = document.getElementById('comparison-routine');
    if (!sel) return;
    const routines = RoutinesModule.getRoutines();
    sel.innerHTML = `<option value="">Todos los ejercicios</option>` +
      routines.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  }

  // ── Botón comparar ────────────────────────────────────────
  document.getElementById('btn-compare')?.addEventListener('click', handleCompare);

  async function handleCompare() {
    const selA      = document.getElementById('comp-select-a')?.value;  // "YYYY-MM"
    const selB      = document.getElementById('comp-select-b')?.value;
    const routineId = document.getElementById('comparison-routine')?.value;

    if (!selA || !selB) return;
    if (selA === selB) {
      showToast('Selecciona dos meses diferentes para comparar', 'warning');
      return;
    }

    const btn = document.getElementById('btn-compare');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner"></i> Cargando…'; }

    try {
      const [yearA, monthA] = selA.split('-').map(Number);
      const [yearB, monthB] = selB.split('-').map(Number);

      const [workoutsA, workoutsB] = await Promise.all([
        getWorkoutsByMonth(yearA, monthA - 1),
        getWorkoutsByMonth(yearB, monthB - 1)
      ]);

      // Si hay filtro de rutina, quedarse solo con los workouts de esa rutina
      const filterByRoutine = wks => routineId
        ? wks.filter(w => w.routineId === routineId)
        : wks;

      renderComparison(
        filterByRoutine(workoutsA), selA,
        filterByRoutine(workoutsB), selB
      );

    } catch (err) {
      console.error('Error en comparativa:', err);
      showToast('Error al cargar los datos para comparar', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-arrows-left-right"></i> Comparar'; }
    }
  }

  // ════════════════════════════════════════════════════════════
  // RENDER DE LA COMPARATIVA
  // ════════════════════════════════════════════════════════════

  /**
   * Genera y renderiza la comparativa completa:
   * · 3 cards de resumen (volumen, carga media, días)
   * · Tabla cara a cara por ejercicio
   */
  function renderComparison(workoutsA, labelA, workoutsB, labelB) {
    // Calcular métricas globales de cada mes
    const metricsA = calcMonthMetrics(workoutsA);
    const metricsB = calcMonthMetrics(workoutsB);

    // Cards de resumen
    renderSummaryCards(metricsA, metricsB);

    // Tabla cara a cara
    renderComparisonTable(workoutsA, workoutsB, labelA, labelB);
  }

  /**
   * Calcula las métricas globales de un conjunto de entrenamientos.
   * @param {Array} workouts
   * @returns {{ totalVolume, avgLoad, days, exerciseMaxes }}
   */
  function calcMonthMetrics(workouts) {
    const totalVolume = workouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
    const days        = workouts.length;

    let totalSets = 0, weightSum = 0;
    const exerciseMaxes = {};  // { exerciseName: { maxWeight, bestVolume, sets } }

    workouts.forEach(w => {
      (w.exercises || []).forEach(ex => {
        if (!exerciseMaxes[ex.name]) {
          exerciseMaxes[ex.name] = { maxWeight: 0, bestVolume: 0, totalSets: 0, avgIntensity: 0, intensityCount: 0 };
        }
        const rec = exerciseMaxes[ex.name];
        (ex.sets || []).forEach(s => {
          if (s.weight > rec.maxWeight) rec.maxWeight = s.weight;
          const vol = s.weight * s.reps;
          if (vol > rec.bestVolume) rec.bestVolume = vol;
          rec.totalSets++;
          weightSum += s.weight;
          totalSets++;
          if (s.intensityType === 'RIR' || s.intensityType === 'RPE') {
            rec.avgIntensity  += parseFloat(s.intensityValue) || 0;
            rec.intensityCount++;
          }
        });
      });
    });

    // Promediar intensidad por ejercicio
    Object.values(exerciseMaxes).forEach(r => {
      if (r.intensityCount > 0) r.avgIntensity = +(r.avgIntensity / r.intensityCount).toFixed(1);
    });

    const avgLoad = totalSets > 0 ? Math.round(weightSum / totalSets) : 0;

    return { totalVolume, days, avgLoad, exerciseMaxes };
  }

  /** Actualiza las 3 tarjetas de resumen ejecutivo */
  function renderSummaryCards(mA, mB) {
    const volDiff  = mB.totalVolume ? Math.round((mA.totalVolume - mB.totalVolume) / mB.totalVolume * 100) : 0;
    const loadDiff = mA.avgLoad - mB.avgLoad;
    const daysDiff = mA.days - mB.days;

    const cards = document.querySelectorAll('.comparison-summary__card');
    if (cards[0]) updateSummaryCard(cards[0], `${volDiff >= 0 ? '+' : ''}${volDiff}%`, 'Volumen total', volDiff >= 0);
    if (cards[1]) updateSummaryCard(cards[1], `${loadDiff >= 0 ? '+' : ''}${loadDiff} kg`, 'Carga media', loadDiff >= 0);
    if (cards[2]) updateSummaryCard(cards[2], `${daysDiff >= 0 ? '+' : ''}${daysDiff} días`, 'Días entrenados', daysDiff >= 0, daysDiff === 0);
  }

  function updateSummaryCard(card, value, label, isPositive, isNeutral = false) {
    card.className = 'comparison-summary__card ' +
      (isNeutral ? 'comparison-summary__card--neutral'
       : isPositive ? 'comparison-summary__card--positive'
       : 'comparison-summary__card--negative');

    const icon = isNeutral ? 'ph-target' : isPositive ? 'ph-trend-up' : 'ph-trend-down';
    card.innerHTML = `
      <i class="ph-fill ${icon}"></i>
      <span class="comparison-summary__value">${value}</span>
      <span class="comparison-summary__label">${label}</span>`;
  }

  /**
   * Genera la tabla cara a cara.
   * Para cada ejercicio que aparece en cualquiera de los dos meses,
   * muestra: carga máx., mejor set (vol), series totales, intensidad.
   */
  function renderComparisonTable(workoutsA, workoutsB, labelA, labelB) {
    const wrapper = document.querySelector('.comparison-table-wrapper');
    if (!wrapper) return;

    const mA = calcMonthMetrics(workoutsA);
    const mB = calcMonthMetrics(workoutsB);

    // Unión de todos los ejercicios de ambos meses
    const allExercises = new Set([
      ...Object.keys(mA.exerciseMaxes),
      ...Object.keys(mB.exerciseMaxes)
    ]);

    if (allExercises.size === 0) {
      wrapper.innerHTML = `
        <div style="padding:var(--s8);text-align:center;color:var(--text-muted)">
          <i class="ph ph-info" style="font-size:2rem;display:block;margin-bottom:var(--s3)"></i>
          No hay datos para comparar en los meses seleccionados.
        </div>`;
      return;
    }

    // Formatear mes para cabecera
    const fmtMonth = str => {
      const [y, m] = str.split('-').map(Number);
      return `${MESES[m - 1]} ${y}`;
    };

    const rows = [...allExercises].map(exName => {
      const a = mA.exerciseMaxes[exName] || { maxWeight: 0, bestVolume: 0, totalSets: 0, avgIntensity: '—' };
      const b = mB.exerciseMaxes[exName] || { maxWeight: 0, bestVolume: 0, totalSets: 0, avgIntensity: '—' };

      return `
        <tr class="comparison-table__group-header">
          <td colspan="5"><i class="ph-fill ph-barbell"></i> ${exName}</td>
        </tr>
        ${compRow('', 'Carga máx.', a.maxWeight ? `${a.maxWeight} kg` : '—', b.maxWeight ? `${b.maxWeight} kg` : '—', a.maxWeight, b.maxWeight, 'kg')}
        ${compRow('', 'Mejor serie (vol)', a.bestVolume ? `${a.bestVolume.toLocaleString('es-ES')} kg` : '—', b.bestVolume ? `${b.bestVolume.toLocaleString('es-ES')} kg` : '—', a.bestVolume, b.bestVolume, '')}
        ${compRow('', 'Series totales', a.totalSets, b.totalSets, a.totalSets, b.totalSets, '')}
        ${compRow('', 'Intensidad media', a.intensityCount > 0 ? a.avgIntensity : '—', b.intensityCount > 0 ? b.avgIntensity : '—', null, null, '')}`;
    }).join('');

    wrapper.innerHTML = `
      <table class="comparison-table">
        <thead>
          <tr>
            <th class="comparison-table__exercise-col">Ejercicio</th>
            <th class="comparison-table__metric-col">Métrica</th>
            <th class="comparison-table__col comparison-table__col--a">
              <span class="col-badge col-badge--a">A</span> ${fmtMonth(labelA)}
            </th>
            <th class="comparison-table__col comparison-table__col--b">
              <span class="col-badge col-badge--b">B</span> ${fmtMonth(labelB)}
            </th>
            <th class="comparison-table__delta-col">Δ Dif.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  /**
   * Genera una fila de la tabla con indicador de diferencia.
   * @param {string} ex    - Nombre del ejercicio (vacío si ya está en la cabecera)
   * @param {string} label - Etiqueta de la métrica
   * @param {*}      vA    - Valor en A (mostrado)
   * @param {*}      vB    - Valor en B (mostrado)
   * @param {number} nA    - Valor numérico en A (para calcular diff), null = no mostrar
   * @param {number} nB    - Valor numérico en B
   * @param {string} unit  - Unidad para el delta (ej: 'kg', '%')
   */
  function compRow(ex, label, vA, vB, nA, nB, unit) {
    let deltaHTML = '<td class="delta delta--neutral">—</td>';

    if (nA !== null && nB !== null) {
      const diff  = nA - nB;
      const sign  = diff >= 0 ? '+' : '';
      const cls   = diff > 0 ? 'delta--positive' : diff < 0 ? 'delta--negative' : 'delta--neutral';
      const icon  = diff > 0 ? 'ph-trend-up' : diff < 0 ? 'ph-trend-down' : '';
      deltaHTML = `<td class="delta ${cls}">
        ${icon ? `<i class="ph-fill ${icon}"></i>` : ''}
        ${sign}${diff}${unit ? ' ' + unit : ''}
      </td>`;
    }

    return `
      <tr>
        <td>${ex}</td>
        <td class="metric-label">${label}</td>
        <td class="col-a">${vA}</td>
        <td class="col-b">${vB}</td>
        ${deltaHTML}
      </tr>`;
  }

  return { init };

})();
