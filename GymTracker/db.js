/**
 * ============================================================
 * js/db.js — Operaciones con Firestore
 * ============================================================
 * Todas las lecturas y escrituras en la base de datos.
 * Requiere: firebase-config.js (auth, db)
 *
 * Estructura de datos en Firestore:
 *   users/{uid}/
 *     routines/{routineId}   → Rutinas con sus ejercicios
 *     workouts/{workoutId}   → Entrenamientos por día
 * ============================================================
 */

'use strict';

// ── Helpers internos ─────────────────────────────────────────

/** Colección de rutinas del usuario actual */
function routinesRef() {
  return db.collection('users').doc(auth.currentUser.uid).collection('routines');
}

/** Colección de entrenamientos del usuario actual */
function workoutsRef() {
  return db.collection('users').doc(auth.currentUser.uid).collection('workouts');
}

/** Timestamp del servidor de Firestore */
const serverTs = () => firebase.firestore.FieldValue.serverTimestamp();


// ════════════════════════════════════════════════════════════
// RUTINAS
// ════════════════════════════════════════════════════════════

/**
 * Guarda una rutina. Si tiene .id → actualiza. Si no → crea.
 * @param {Object} routine - Datos de la rutina
 * @returns {Promise<string>} id del documento
 */
async function saveRoutine(routine) {
  const data = { ...routine, updatedAt: serverTs() };
  if (routine.id) {
    const { id, ...rest } = data;
    await routinesRef().doc(routine.id).set(rest, { merge: true });
    return routine.id;
  } else {
    data.createdAt = serverTs();
    const ref = await routinesRef().add(data);
    return ref.id;
  }
}

/**
 * Devuelve todas las rutinas del usuario ordenadas por fecha de creación.
 * @returns {Promise<Array>}
 */
async function getRoutines() {
  const snap = await routinesRef().orderBy('createdAt', 'asc').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Elimina una rutina por su id.
 * @param {string} routineId
 */
async function deleteRoutine(routineId) {
  await routinesRef().doc(routineId).delete();
}


// ════════════════════════════════════════════════════════════
// ENTRENAMIENTOS
// ════════════════════════════════════════════════════════════

/**
 * Guarda un entrenamiento. Si tiene .id → actualiza. Si no → crea.
 * @param {Object} workout - Datos del entrenamiento
 * @returns {Promise<string>} id del documento
 */
async function saveWorkout(workout) {
  const data = { ...workout, updatedAt: serverTs() };
  if (workout.id) {
    const { id, ...rest } = data;
    await workoutsRef().doc(workout.id).set(rest, { merge: true });
    return workout.id;
  } else {
    data.createdAt = serverTs();
    const ref = await workoutsRef().add(data);
    return ref.id;
  }
}

/**
 * Obtiene todos los entrenamientos de un mes específico.
 * Las fechas se guardan como "YYYY-MM-DD" para hacer range queries.
 * @param {number} year  - Año (ej: 2025)
 * @param {number} month - Mes 0-indexed (0 = Enero, 2 = Marzo...)
 * @returns {Promise<Array>}
 */
async function getWorkoutsByMonth(year, month) {
  const mm        = String(month + 1).padStart(2, '0');
  const startDate = `${year}-${mm}-01`;
  const endDate   = `${year}-${mm}-31`;

  const snap = await workoutsRef()
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .get();

  // Ordenar en cliente para evitar índice compuesto en Firestore
  return snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Obtiene el entrenamiento de una fecha concreta (si existe).
 * @param {string} date - Formato "YYYY-MM-DD"
 * @returns {Promise<Object|null>}
 */
async function getWorkoutByDate(date) {
  const snap = await workoutsRef()
    .where('date', '==', date)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

/**
 * Elimina un entrenamiento por su id.
 * @param {string} workoutId
 */
async function deleteWorkout(workoutId) {
  await workoutsRef().doc(workoutId).delete();
}

/**
 * Obtiene los últimos N entrenamientos del usuario.
 * Usado en el Home para mostrar el último entreno y calcular la racha.
 * @param {number} limit - Máximo de resultados (default 10)
 * @returns {Promise<Array>}
 */
async function getRecentWorkouts(limit = 10) {
  const snap = await workoutsRef()
    .orderBy('date', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Obtiene TODOS los entrenamientos del usuario.
 * Solo se usa para el Backup y para analíticas históricas.
 * @returns {Promise<Array>}
 */
async function getAllWorkouts() {
  const snap = await workoutsRef().orderBy('date', 'desc').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Obtiene el historial de un ejercicio concreto para el gráfico.
 * Busca en los últimos 'maxDocs' entrenamientos, filtra los que
 * contienen ese ejercicio y devuelve fecha + mejor serie.
 *
 * @param {string} exerciseName - Nombre exacto del ejercicio
 * @param {number} maxDocs      - Cuántos entrenamientos revisar (default 60)
 * @returns {Promise<Array>} [{date, maxWeight, bestVolume, allSets}]
 */
async function getExerciseHistory(exerciseName, maxDocs = 60) {
  const snap = await workoutsRef()
    .orderBy('date', 'desc')
    .limit(maxDocs)
    .get();

  const history = [];

  snap.docs.forEach(doc => {
    const workout  = { id: doc.id, ...doc.data() };
    const exercise = workout.exercises?.find(e => e.name === exerciseName);
    if (!exercise || !exercise.sets?.length) return;

    const sets = exercise.sets;

    // Mejor serie: mayor peso levantado ese día
    const maxWeight = Math.max(...sets.map(s => s.weight));

    // Mejor volumen de serie: peso × reps
    const bestVolSet = sets.reduce((best, s) =>
      (s.weight * s.reps) > (best.weight * best.reps) ? s : best, sets[0]);

    history.push({
      date:       workout.date,
      maxWeight,
      bestVolume: bestVolSet.weight * bestVolSet.reps,
      allSets:    sets
    });
  });

  // Devolver en orden cronológico (más antiguo → más reciente) para el gráfico
  return history.reverse();
}

/**
 * Importa datos en bloque desde un backup JSON.
 * Usa batch writes para ser más eficiente (máx 500 por batch).
 * @param {Object} data - { routines: [], workouts: [] }
 */
async function importBackup(data) {
  const uid = auth.currentUser.uid;
  let batch = db.batch();
  let ops   = 0;

  const flush = async () => {
    await batch.commit();
    batch = db.batch();
    ops   = 0;
  };

  // Importar rutinas
  for (const routine of (data.routines || [])) {
    const { id, ...rest } = routine;
    const ref = routinesRef().doc();
    batch.set(ref, { ...rest, importedAt: serverTs() });
    if (++ops >= 490) await flush();
  }

  // Importar entrenamientos
  for (const workout of (data.workouts || [])) {
    const { id, ...rest } = workout;
    const ref = workoutsRef().doc();
    batch.set(ref, { ...rest, importedAt: serverTs() });
    if (++ops >= 490) await flush();
  }

  if (ops > 0) await batch.commit();
}
