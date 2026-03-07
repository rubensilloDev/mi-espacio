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

const guestDB = {
  routines: [],
  workouts: []
};

const googleProvider = new firebase.auth.GoogleAuthProvider();

// ════════════════════════════════════════════════════════════
// DETECTAR SESIÓN DE FIREBASE
// ════════════════════════════════════════════════════════════

// Recoger resultado del redirect de Google (una sola vez)
auth.getRedirectResult().then(result => {
  // onAuthStateChanged se encarga del resto
}).catch(e => {
  if (e.code !== 'auth/no-current-user' && e.code !== 'auth/null-user') {
    console.error('Redirect error:', e);
  }
});

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

document.getElementById('btn-google-login').onclick = async () => {
  try {
    isGuest = false;
    await auth.signInWithRedirect(googleProvider);
  } catch(e) {
    showToast('Error al iniciar sesión. Inténtalo de nuevo.', 'error');
    console.error(e);
  }
};

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
// HELPERS
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
// WRAPPERS DE DB PARA MODO INVITADO
// ════════════════════════════════════════════════════════════

const guestId = () => 'guest_' + Math.random().toString(36).slice(2, 10);

const _orig = {};

window.addEventListener('load', () => {
  _orig.saveRoutine         = window.saveRoutine;
  _orig.getRoutines         = window.getRoutines;
  _orig.deleteRoutine       = window.deleteRoutine;
  _orig.saveWorkout         = window.saveWorkout;
  _orig.getWorkoutsByMonth  = window.getWorkoutsByMonth;
  _orig.getWorkoutByDate    = window.getWorkoutByDate;
  _orig.deleteWorkout       = window.deleteWorkout;
  _orig.getRecentWorkouts   = window.getRecentWorkouts;
  _orig.getAllWorkouts       = window.getAllWorkouts;
  _orig.getExerciseHistory  = window.getExerciseHistory;
  _orig.importBackup        = window.importBackup;
});

window.saveRoutine = async function(routine) {
  if (!isGuest) return _orig.saveRoutine(routine);
  if (routine.id) {
    const idx = guestDB.routines.findIndex(r => r.id === routine.id);
    if (idx >= 0) guestDB.routines[idx] = { ...routine };
    return routine.id;
  }
  const id = guestId();
  guestDB.routines.push({ ...routine, id, createdAt: new Date().toISOString() });
  return id;
};

window.getRoutines = async function() {
  if (!isGuest) return _orig.getRoutines();
  return [...guestDB.routines];
};

window.deleteRoutine = async function(routineId) {
  if (!isGuest) return _orig.deleteRoutine(routineId);
  guestDB.routines = guestDB.routines.filter(r => r.id !== routineId);
};

window.saveWorkout = async function(workout) {
  if (!isGuest) return _orig.saveWorkout(workout);
  if (workout.id) {
    const idx = guestDB.workouts.findIndex(w => w.id === workout.id);
    if (idx >= 0) guestDB.workouts[idx] = { ...workout };
    return workout.id;
  }
  const id = guestId();
  guestDB.workouts.push({ ...workout, id, createdAt: new Date().toISOString() });
  return id;
};

window.getWorkoutsByMonth = async function(year, month) {
  if (!isGuest) return _orig.getWorkoutsByMonth(year, month);
  const mm    = String(month + 1).padStart(2, '0');
  const start = `${year}-${mm}-01`;
  const end   = `${year}-${mm}-31`;
  return guestDB.workouts
    .filter(w => w.date >= start && w.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
};

window.getWorkoutByDate = async function(date) {
  if (!isGuest) return _orig.getWorkoutByDate(date);
  return guestDB.workouts.find(w => w.date === date) || null;
};

window.deleteWorkout = async function(workoutId) {
  if (!isGuest) return _orig.deleteWorkout(workoutId);
  guestDB.workouts = guestDB.workouts.filter(w => w.id !== workoutId);
};

window.getRecentWorkouts = async function(limit = 10) {
  if (!isGuest) return _orig.getRecentWorkouts(limit);
  return [...guestDB.workouts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
};

window.getAllWorkouts = async function() {
  if (!isGuest) return _orig.getAllWorkouts();
  return [...guestDB.workouts].sort((a, b) => b.date.localeCompare(a.date));
};

window.getExerciseHistory = async function(exerciseName, maxDocs = 60) {
  if (!isGuest) return _orig.getExerciseHistory(exerciseName, maxDocs);
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
    history.push({ date: workout.date, maxWeight, bestVolume: bestVol.weight * bestVol.reps, allSets: sets });
  });
  return history.reverse();
};

window.importBackup = async function(data) {
  if (!isGuest) return _orig.importBackup(data);
  (data.routines || []).forEach(r => guestDB.routines.push({ ...r, id: guestId() }));
  (data.workouts || []).forEach(w => guestDB.workouts.push({ ...w, id: guestId() }));
};

window.isGuest = () => isGuest;
