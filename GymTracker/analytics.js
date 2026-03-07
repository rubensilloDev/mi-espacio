/**
 * ============================================================
 * js/analytics.js — Analíticas con datos reales
 * ============================================================
 * Carga entrenamientos de Firestore y calcula:
 * · Métricas del mes: volumen, días, intensidad media, PRs
 * · Historial de un ejercicio → gráfico Chart.js
 * · Comparativa contra el mes anterior (cada métrica)
 * ============================================================
 */

'use strict';

const AnalyticsModule = (() => {

  // ── Estado interno ────────────────────────────────────────
  let _year    = new Date().getFullYear();
  let _month   = new Date().getMonth();
  let _workouts = [];
  let _prevWorkouts = [];   // Mes anterior (para comparativa)
  let _exerciseHistory = [];

  // ── Escuchar navegación ───────────────────────────────────
  document.addEventListener('section:enter', async e => {
    if (e.detail.section === 'analytics' && auth.currentUser) {
      await loadData();
    }
  });

  // ── Controles de mes ──────────────────────────────────────
  document.getElementById('analytics-prev')?.addEventListener('click', async () => {
    _month--;
    if (_month < 0) { _month = 11; _year--; }
    updateMonthLabel();
    await loadData();
  });

  document.getElementById('analytics-next')?.addEventListener('click', async () => {
    _month++;
    if (_month > 11) { _month = 0; _year++; }
    updateMonthLabel();
    await loadData();
  });

  function updateMonthLabel() {
    const el = document.getElementById('analytics-month');
    if (el) el.textContent = `${MESES[_month]} ${_year}`;
  }

  // ── Tabs tipo gráfico ─────────────────────────────────────
  let _chartType = 'line';
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _chartType = tab.dataset.chart;
      renderChart();
    });
  });

  // ── Selector ejercicio ────────────────────────────────────
  document.getElementById('chart-exercise-select')?.addEventListener('change', async e => {
    await loadExerciseHistory(e.target.value);
    renderChart();
  });

  // ════════════════════════════════════════════════════════════
  // CARGA DE DATOS
  // ════════════════════════════════════════════════════════════

  async function loadData() {
    try {
      // Mes actual y mes anterior en paralelo
      const prevMonth = _month === 0 ? 11 : _month - 1;
      const prevYear  = _month === 0 ? _year - 1 : _year;

      [_workouts, _prevWorkouts] = await Promise.all([
        getWorkoutsByMonth(_year, _month),
        getWorkoutsByMonth(prevYear, prevMonth)
      ]);

      renderMetrics();
      populateExerciseSelector();

      // Cargar historial del ejercicio actualmente seleccionado
      const selectedEx = document.getElementById('chart-exercise-select')?.value;
      if (selectedEx) {
        await loadExerciseHistory(selectedEx);
      }
      renderChart();

    } catch (err) {
      console.error('Error cargando analíticas:', err);
      showToast('Error al cargar las analíticas', 'error');
    }
  }

  /**
   * Carga el historial de un ejercicio para el gráfico.
   * @param {string} exerciseName
   */
  async function loadExerciseHistory(exerciseName) {
    try {
      _exerciseHistory = await getExerciseHistory(exerciseName, 60);
    } catch (err) {
      _exerciseHistory = [];
    }
  }

  // ════════════════════════════════════════════════════════════
  // MÉTRICAS
  // ════════════════════════════════════════════════════════════

  /**
   * Calcula y renderiza las 4 tarjetas de métricas del mes.
   */
  function renderMetrics() {
    // ── Volumen total del mes
    const volumen    = _workouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
    const volPrev    = _prevWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
    const volDiff    = volPrev ? Math.round((volumen - volPrev) / volPrev * 100) : 0;

    // ── Días entrenados
    const dias       = _workouts.length;
    const diasPrev   = _prevWorkouts.length;
    const diasDiff   = dias - diasPrev;

    // ── Intensidad media (solo entrenamientos que tengan sets con RIR/RPE)
    let totalIntensity = 0, intensityCount = 0;
    _workouts.forEach(w => {
      (w.exercises || []).forEach(ex => {
        (ex.sets || []).forEach(s => {
          if (s.intensityType === 'RIR' || s.intensityType === 'RPE') {
            totalIntensity += parseFloat(s.intensityValue) || 0;
            intensityCount++;
          }
        });
      });
    });
    const intensidadMedia = intensityCount > 0
      ? (totalIntensity / intensityCount).toFixed(1)
      : '—';

    // ── PRs del mes: sets con peso mayor que cualquier set previo
    const prs = countPRs(_workouts, _prevWorkouts);

    // ── Actualizar DOM ────────────────────────────────────────
    const cards = document.querySelectorAll('.metric-card .metric-card__data');
    if (cards[0]) {
      cards[0].querySelector('.metric-card__value').textContent = volumen.toLocaleString('es-ES');
      setTrend(cards[0], volDiff, '%', 'vs mes anterior');
    }
    if (cards[1]) {
      cards[1].querySelector('.metric-card__value').textContent = `${dias} días`;
      setTrend(cards[1], diasDiff, ' días', 'vs mes anterior', true);
    }
    if (cards[2]) {
      const label = _workouts[0]?.exercises?.[0]?.sets?.[0]?.intensityType || 'RIR';
      cards[2].querySelector('.metric-card__value').textContent = `${label} ${intensidadMedia}`;
      cards[2].querySelector('.metric-card__label').textContent = 'Intensidad media';
      cards[2].querySelector('.metric-card__trend').textContent = '';
    }
    if (cards[3]) {
      cards[3].querySelector('.metric-card__value').textContent = `${prs} PRs`;
      cards[3].querySelector('.metric-card__trend').innerHTML  =
        prs > 0
          ? '<i class="ph-fill ph-trend-up"></i> Nuevos récords personales'
          : 'Sin nuevos PRs este mes';
    }
  }

  /**
   * Aplica el indicador de tendencia (▲ / ▼) a una metric card.
   */
  function setTrend(cardEl, diff, unit, label, absolute = false) {
    const trendEl = cardEl.querySelector('.metric-card__trend');
    if (!trendEl) return;
    const sign = diff >= 0 ? '+' : '';
    const cls  = diff >= 0 ? 'trend--up' : 'trend--down';
    const icon = diff >= 0 ? 'ph-trend-up' : 'ph-trend-down';
    trendEl.className = `metric-card__trend ${cls}`;
    trendEl.innerHTML = `<i class="ph-fill ${icon}"></i> ${sign}${diff}${unit} ${label}`;
  }

  /**
   * Cuenta cuántos sets del mes actual superon el máximo histórico previo.
   * Simple aproximación: compara el máximo de este mes con el del mes anterior.
   */
  function countPRs(currentWorkouts, prevWorkouts) {
    // Máximos del mes anterior por ejercicio
    const prevMaxes = {};
    prevWorkouts.forEach(w => {
      (w.exercises || []).forEach(ex => {
        (ex.sets || []).forEach(s => {
          const key = ex.name;
          if (!prevMaxes[key] || s.weight > prevMaxes[key]) {
            prevMaxes[key] = s.weight;
          }
        });
      });
    });

    // Contar ejercicios del mes actual que superen el máximo previo
    let prs = 0;
    const counted = new Set();
    currentWorkouts.forEach(w => {
      (w.exercises || []).forEach(ex => {
        if (counted.has(ex.name)) return;
        (ex.sets || []).forEach(s => {
          if (prevMaxes[ex.name] && s.weight > prevMaxes[ex.name]) {
            prs++;
            counted.add(ex.name);
          }
        });
      });
    });
    return prs;
  }

  // ════════════════════════════════════════════════════════════
  // SELECTOR DE EJERCICIO
  // ════════════════════════════════════════════════════════════

  /**
   * Rellena el <select> con todos los ejercicios únicos
   * que aparecen en los entrenamientos del mes actual.
   */
  function populateExerciseSelector() {
    const select = document.getElementById('chart-exercise-select');
    if (!select) return;

    const exercises = new Set();
    _workouts.forEach(w => {
      (w.exercises || []).forEach(ex => {
        if (ex.name) exercises.add(ex.name);
      });
    });

    // También incluir ejercicios de las rutinas del usuario
    RoutinesModule.getRoutines().forEach(r => {
      (r.exercises || []).forEach(ex => {
        if (ex.name) exercises.add(ex.name);
      });
    });

    const currentVal = select.value;
    select.innerHTML = [...exercises].map(name =>
      `<option value="${name}" ${name === currentVal ? 'selected' : ''}>${name}</option>`
    ).join('');

    // Si no había nada seleccionado, cargar el primero
    if (!currentVal && exercises.size > 0) {
      loadExerciseHistory(select.value).then(renderChart);
    }
  }

  // ════════════════════════════════════════════════════════════
  // GRÁFICO CHART.JS
  // ════════════════════════════════════════════════════════════

  /**
   * Renderiza el gráfico con los datos del historial del ejercicio.
   * Soporta 3 tipos: líneas, barras y radar.
   */
  function renderChart() {
    const canvas = document.getElementById('main-chart');
    if (!canvas) return;

    // Destruir el gráfico anterior para evitar conflictos
    if (window.mainChart) {
      window.mainChart.destroy();
      window.mainChart = null;
    }

    const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#666' : '#888';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const bgCard    = isDark ? '#141414' : '#FFFFFF';

    let chartData, chartType;

    if (_chartType === 'radar') {
      // Para el radar: progresión relativa por ejercicio del mes
      const exData = getExercisesProgressData();
      chartData = {
        labels:   exData.map(e => e.name.length > 12 ? e.name.slice(0,12)+'…' : e.name),
        datasets: [{
          label:            'Carga relativa (%)',
          data:             exData.map(e => e.progress),
          borderColor:      '#FFD600',
          backgroundColor:  'rgba(255,214,0,0.15)',
          pointBackgroundColor: '#FFD600',
          pointRadius:      5
        }]
      };
      chartType = 'radar';
    } else {
      // Para líneas y barras: progresión histórica del ejercicio seleccionado
      const labels  = _exerciseHistory.map(h => {
        const [, m, d] = h.date.split('-');
        return `${parseInt(d)} ${MESES[parseInt(m)-1].slice(0,3)}`;
      });
      const weights = _exerciseHistory.map(h => h.maxWeight);

      chartData = {
        labels,
        datasets: [{
          label:            `Peso máximo (kg)`,
          data:             weights,
          borderColor:      '#FFD600',
          backgroundColor:  _chartType === 'bar'
            ? 'rgba(255,214,0,0.6)'
            : 'rgba(255,214,0,0.15)',
          pointBackgroundColor: '#FFD600',
          pointRadius:      5,
          pointHoverRadius: 8,
          tension:          0.35,
          fill:             _chartType !== 'bar'
        }]
      };
      chartType = _chartType === 'bar' ? 'bar' : 'line';
    }

    const scalesConfig = _chartType !== 'radar' ? {
      x: { ticks: { color: textColor }, grid: { color: gridColor } },
      y: { ticks: { color: textColor }, grid: { color: gridColor },
           beginAtZero: false }
    } : {
      r: {
        ticks: { color: textColor, backdropColor: 'transparent' },
        grid:  { color: gridColor },
        pointLabels: { color: textColor, font: { size: 11 } }
      }
    };

    window.mainChart = new Chart(canvas, {
      type: chartType,
      data: chartData,
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        plugins: {
          legend: { labels: { color: textColor, font: { family: "'Plus Jakarta Sans'", size: 12 } } },
          tooltip: {
            backgroundColor: bgCard,
            titleColor:      isDark ? '#F0F0F0' : '#0A0A0A',
            bodyColor:       textColor,
            borderColor:     '#FFD600',
            borderWidth:     1,
            padding:         14,
            callbacks: {
              label: ctx => ` ${ctx.parsed.y ?? ctx.parsed.r} kg`
            }
          }
        },
        scales: scalesConfig
      }
    });
  }

  /**
   * Para el gráfico radar: calcula la progresión relativa de cada
   * ejercicio del mes comparándolo con el mes anterior.
   * @returns {Array} [{ name, progress }]
   */
  function getExercisesProgressData() {
    const current  = {};
    const previous = {};

    _workouts.forEach(w => (w.exercises || []).forEach(ex => {
      (ex.sets || []).forEach(s => {
        if (!current[ex.name] || s.weight > current[ex.name]) current[ex.name] = s.weight;
      });
    }));

    _prevWorkouts.forEach(w => (w.exercises || []).forEach(ex => {
      (ex.sets || []).forEach(s => {
        if (!previous[ex.name] || s.weight > previous[ex.name]) previous[ex.name] = s.weight;
      });
    }));

    return Object.entries(current).slice(0, 6).map(([name, cur]) => {
      const prev     = previous[name] || cur;
      const progress = prev ? Math.round((cur - prev) / prev * 100 + 100) : 100;
      return { name, progress };
    });
  }

  /** Actualizar colores del gráfico al cambiar de tema */
  function refreshChartColors() {
    renderChart();
  }
  window.refreshChartColors = refreshChartColors;

  return { init: loadData };

})();
