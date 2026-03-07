/**
 * ============================================================
 * js/auth.js — Autenticación
 * ============================================================
 * Dos modos:
 *  - Google: datos en Firebase (persistentes, sincronizados)
 *  - Invitado: datos en memoria (se pierden al cerrar la app)
 * ============================================================
 */

'use strict';

// ── Estado global de modo invitado ───────────────────────────
let isGuest = false;

// Datos en memoria para el modo invitado
const guestDB = {
  routines: [],
  workouts: []
};

// ════════════════════════════════════════════════════════════
// DETECTAR SESIÓN DE FIREBASE
// ════════════════════════════════════════════════════════════
const googleProvider = new firebase.auth.GoogleAuthProvider();

auth.onAuthStateChanged(async user => {
  if (user && !isGuest) {
    enterApp(user, false);
    await initApp(user);
  } else if (!isGuest) {
    showLogin();
  }
});

// ════════════════════════════════════════════════════════════
// BOTONES DE LOGIN
// ════════════════════════════════════════════════════════════

// Continuar con Google
document.getElementById('btn-google-login').onclick = async () => {
  try {
    isGuest = false;
    await auth.signInWithPopup(googleProvider);
  } catch(e) {
    showToast('Error al iniciar sesión. Inténtalo de nuevo.', 'error');
    console.error(e);
  }
};

// Entrar sin cuenta (modo invitado)
document.getElementById('btn-demo-login').addEventListener('click', async () => {
  isGuest = true;
  guestDB.routines = [];
  guestDB.workouts = [];

  const fakeUser = {
    uid:         'guest',
    displayName: 'Invitado',
    email:       '',
    photoURL:    null
  };

  enterApp(fakeUser, true);
  await initApp(fakeUser);
});

// Cerrar sesión
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  const ok = await showConfirm('¿Cerrar sesión?', 'Tus datos están guardados en la nube.');
  if (!ok) return;

  if (isGuest) {
    isGuest = false;
    guestDB.routines = [];
    guestDB.workouts = [];
    showLogin();
  } else {
    auth.signOut();
  }
});

// ════════════════════════════════════════════════════════════
// HELPERS DE NAVEGACIÓN ENTRE LOGIN Y APP
// ════════════════════════════════════════════════════════════

function showLogin() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('app').hidden = true;
}

function enterApp(user, guest) {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app').hidden = false;
  updateUserProfile(user, guest);
}

// ════════════════════════════════════════════════════════════
// PERFIL DEL USUARIO EN EL SIDEBAR
// ════════════════════════════════════════════════════════════

function updateUserProfile(user, guest = false) {
  const avatarUrl = (!guest && user.photoURL)
    ? user.photoURL
    : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName||'G')}&backgroundColor=FFD600&textColor=0A0A0A`;

  const avatar = document.getElementById('user-avatar');
  const name   = document.querySelector('.user-profile__name');
  const email  = document.querySelector('.user-profile__email');

  if (avatar) avatar.src = avatarUrl;
  if (name)   name.textContent  = guest ? 'Invitado' : (user.displayName || 'Usuario');
  if (email)  email.textContent = guest ? '⚠️ Datos temporales' : (user.email || '');

  const heroName = document.querySelector('.home-hero__name');
  if (heroName) heroName.textContent = guest ? 'Invitado' : (user.displayName || 'Atleta').split(' ')[0];
}

// ════════════════════════════════════════════════════════════
// SOBRESCRIBIR FUNCIONES DE DB PARA MODO INVITADO
// ════════════════════════════════════════════════════════════
// Cuando isGuest === true, las funciones de db.js se reemplazan
// por versiones que trabajan con el array guestDB en memoria.

const _originalSaveRoutine  = typeof saveRoutine  !== 'undefined' ? saveRoutine  : null;
const _originalGetRoutines  = typeof getRoutines  !== 'undefined' ? getRoutines  : null;
const _originalDeleteRoutine= typeof deleteRoutine!== 'undefined' ? deleteRoutine: null;
const _originalSaveWorkout  = typeof saveWorkout  !== 'undefined' ? saveWorkout  : null;
const _originalGetWorkoutsByMonth = typeof getWorkoutsByMonth !== 'undefined' ? getWorkoutsByMonth : null;
const _originalGetWorkoutByDate   = typeof getWorkoutByDate   !== 'undefined' ? getWorkoutByDate   : null;
const _originalDeleteWorkout      = typeof deleteWorkout      !== 'undefined' ? deleteWorkout      : null;
const _originalGetRecentWorkouts  = typeof getRecentWorkouts  !== 'undefined' ? getRecentWorkouts  : null;
const _originalGetAllWorkouts     = typeof getAllWorkouts      !== 'undefined' ? getAllWorkouts      : null;
const _originalGetExerciseHistory = typeof getExerciseHistory !== 'undefined' ? getExerciseHistory : null;
const _originalImportBackup       = typeof importBackup       !== 'undefined' ? importBackup       : null;

// Genera un id único para los registros en memoria
const guestId = () => 'guest_' + Math.random().toString(36).slice(2, 10);

// Reemplazamos las funciones globales con wrappers que detectan el modo
window.saveRoutine = async function(routine) {
  if (!isGuest) return _originalSaveRoutine(routine);
  if (routine.id) {
    const idx = guestDB.routines.findIndex(r => r.id === routine.id);
    if (idx >= 0) guestDB.routines[idx] = { ...routine };
    return routine.id;
  } else {
    const id = guestId();
    guestDB.routines.push({ ...routine, id, createdAt: new Date().toISOString() });
    return id;
  }
};

window.getRoutines = async function() {
  if (!isGuest) return _originalGetRoutines();
  return [...guestDB.routines];
};

window.deleteRoutine = async function(routineId) {
  if (!isGuest) return _originalDeleteRoutine(routineId);
  guestDB.routines = guestDB.routines.filter(r => r.id !== routineId);
};

window.saveWorkout = async function(workout) {
  if (!isGuest) return _originalSaveWorkout(workout);
  if (workout.id) {
    const idx = guestDB.workouts.findIndex(w => w.id === workout.id);
    if (idx >= 0) guestDB.workouts[idx] = { ...workout };
    return workout.id;
  } else {
    const id = guestId();
    guestDB.workouts.push({ ...workout, id, createdAt: new Date().toISOString() });
    return id;
  }
};

window.getWorkoutsByMonth = async function(year, month) {
  if (!isGuest) return _originalGetWorkoutsByMonth(year, month);
  const mm    = String(month + 1).padStart(2, '0');
  const start = `${year}-${mm}-01`;
  const end   = `${year}-${mm}-31`;
  return guestDB.workouts
    .filter(w => w.date >= start && w.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
};

window.getWorkoutByDate = async function(date) {
  if (!isGuest) return _originalGetWorkoutByDate(date);
  return guestDB.workouts.find(w => w.date === date) || null;
};

window.deleteWorkout = async function(workoutId) {
  if (!isGuest) return _originalDeleteWorkout(workoutId);
  guestDB.workouts = guestDB.workouts.filter(w => w.id !== workoutId);
};

window.getRecentWorkouts = async function(limit = 10) {
  if (!isGuest) return _originalGetRecentWorkouts(limit);
  return [...guestDB.workouts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
};

window.getAllWorkouts = async function() {
  if (!isGuest) return _originalGetAllWorkouts();
  return [...guestDB.workouts].sort((a, b) => b.date.localeCompare(a.date));
};

window.getExerciseHistory = async function(exerciseName, maxDocs = 60) {
  if (!isGuest) return _originalGetExerciseHistory(exerciseName, maxDocs);
  const history = [];
  const workouts = [...guestDB.workouts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, maxDocs);

  workouts.forEach(workout => {
    const exercise = workout.exercises?.find(e => e.name === exerciseName);
    if (!exercise || !exercise.sets?.length) return;
    const sets      = exercise.sets;
    const maxWeight = Math.max(...sets.map(s => s.weight));
    const bestVol   = sets.reduce((best, s) =>
      (s.weight * s.reps) > (best.weight * best.reps) ? s : best, sets[0]);
    history.push({
      date:       workout.date,
      maxWeight,
      bestVolume: bestVol.weight * bestVol.reps,
      allSets:    sets
    });
  });
  return history.reverse();
};

window.importBackup = async function(data) {
  if (!isGuest) return _originalImportBackup(data);
  // En modo invitado simplemente carga los datos en memoria
  (data.routines || []).forEach(r => {
    guestDB.routines.push({ ...r, id: guestId() });
  });
  (data.workouts || []).forEach(w => {
    guestDB.workouts.push({ ...w, id: guestId() });
  });
};

// Exponer isGuest globalmente por si algún módulo lo necesita
window.isGuest = () => isGuest;
