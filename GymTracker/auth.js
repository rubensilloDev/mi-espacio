'use strict';

let isGuest   = false;
let appReady  = false; // evita que onAuthStateChanged llame a showLogin antes de que getRedirectResult termine

const guestDB = { routines: [], workouts: [] };
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ── Procesar resultado del redirect PRIMERO ──────────────────
// Marcamos appReady=true solo cuando getRedirectResult termina
// para que onAuthStateChanged no muestre el login prematuramente
auth.getRedirectResult().then(result => {
  appReady = true;
  // Si hay usuario del redirect, onAuthStateChanged ya lo gestiona
}).catch(e => {
  appReady = true;
  if (e.code && e.code !== 'auth/no-current-user') {
    console.error('Redirect error:', e.code, e.message);
  }
});

// ── Detectar sesión ──────────────────────────────────────────
auth.onAuthStateChanged(async user => {
  // Esperar a que getRedirectResult haya terminado
  if (!appReady) {
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (appReady) { clearInterval(interval); resolve(); }
      }, 50);
    });
  }

  if (user && !isGuest) {
    try {
      enterApp(user, false);
      await initApp(user);
    } catch(e) {
      console.error('Error al iniciar la app:', e);
    }
  } else if (!isGuest) {
    showLogin();
  }
});

// ── Botón Google ─────────────────────────────────────────────
document.getElementById('btn-google-login').onclick = async () => {
  isGuest  = false;
  appReady = false;
  try {
    await auth.signInWithRedirect(googleProvider);
  } catch(e) {
    appReady = true;
    showToast('Error al iniciar sesión. Inténtalo de nuevo.', 'error');
    console.error(e);
  }
};

// ── Botón invitado ───────────────────────────────────────────
document.getElementById('btn-demo-login').addEventListener('click', async () => {
  isGuest = true;
  guestDB.routines = [];
  guestDB.workouts = [];
  const fakeUser = { uid: 'guest', displayName: 'Invitado', email: '', photoURL: null };
  try {
    enterApp(fakeUser, true);
    await initApp(fakeUser);
  } catch(e) {
    console.error('Error modo invitado:', e);
  }
});

// ── Cerrar sesión ────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────
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
  if (email)  email.textContent = guest ? 'Modo invitado' : (user.email || '');
  const heroName = document.querySelector('.home-hero__name');
  if (heroName) heroName.textContent = guest ? 'Invitado' : (user.displayName || 'Atleta').split(' ')[0];
}

// ── Wrappers DB para modo invitado ───────────────────────────
const guestId = () => 'g_' + Math.random().toString(36).slice(2, 10);

const _orig = {
  saveRoutine:        window.saveRoutine,
  getRoutines:        window.getRoutines,
  deleteRoutine:      window.deleteRoutine,
  saveWorkout:        window.saveWorkout,
  getWorkoutsByMonth: window.getWorkoutsByMonth,
  getWorkoutByDate:   window.getWorkoutByDate,
  deleteWorkout:      window.deleteWorkout,
  getRecentWorkouts:  window.getRecentWorkouts,
  getAllWorkouts:      window.getAllWorkouts,
  getExerciseHistory: window.getExerciseHistory,
  importBackup:       window.importBackup,
};

window.saveRoutine = async r => {
  if (!isGuest) return _orig.saveRoutine(r);
  if (r.id) { const i = guestDB.routines.findIndex(x => x.id === r.id); if (i >= 0) guestDB.routines[i] = {...r}; return r.id; }
  const id = guestId(); guestDB.routines.push({...r, id}); return id;
};

window.getRoutines = async () => isGuest ? [...guestDB.routines] : _orig.getRoutines();

window.deleteRoutine = async id => {
  if (!isGuest) return _orig.deleteRoutine(id);
  guestDB.routines = guestDB.routines.filter(r => r.id !== id);
};

window.saveWorkout = async w => {
  if (!isGuest) return _orig.saveWorkout(w);
  if (w.id) { const i = guestDB.workouts.findIndex(x => x.id === w.id); if (i >= 0) guestDB.workouts[i] = {...w}; return w.id; }
  const id = guestId(); guestDB.workouts.push({...w, id}); return id;
};

window.getWorkoutsByMonth = async (year, month) => {
  if (!isGuest) return _orig.getWorkoutsByMonth(year, month);
  const mm = String(month + 1).padStart(2, '0');
  return guestDB.workouts.filter(w => w.date >= `${year}-${mm}-01` && w.date <= `${year}-${mm}-31`).sort((a,b) => a.date.localeCompare(b.date));
};

window.getWorkoutByDate = async date => isGuest ? (guestDB.workouts.find(w => w.date === date) || null) : _orig.getWorkoutByDate(date);

window.deleteWorkout = async id => {
  if (!isGuest) return _orig.deleteWorkout(id);
  guestDB.workouts = guestDB.workouts.filter(w => w.id !== id);
};

window.getRecentWorkouts = async (limit = 10) => isGuest
  ? [...guestDB.workouts].sort((a,b) => b.date.localeCompare(a.date)).slice(0, limit)
  : _orig.getRecentWorkouts(limit);

window.getAllWorkouts = async () => isGuest
  ? [...guestDB.workouts].sort((a,b) => b.date.localeCompare(a.date))
  : _orig.getAllWorkouts();

window.getExerciseHistory = async (name, max = 60) => {
  if (!isGuest) return _orig.getExerciseHistory(name, max);
  return [...guestDB.workouts].sort((a,b) => b.date.localeCompare(a.date)).slice(0, max)
    .reduce((hist, w) => {
      const ex = w.exercises?.find(e => e.name === name);
      if (!ex?.sets?.length) return hist;
      const maxW = Math.max(...ex.sets.map(s => s.weight));
      const best = ex.sets.reduce((b,s) => (s.weight*s.reps) > (b.weight*b.reps) ? s : b, ex.sets[0]);
      hist.push({ date: w.date, maxWeight: maxW, bestVolume: best.weight*best.reps, allSets: ex.sets });
      return hist;
    }, []).reverse();
};

window.importBackup = async data => {
  if (!isGuest) return _orig.importBackup(data);
  (data.routines||[]).forEach(r => guestDB.routines.push({...r, id: guestId()}));
  (data.workouts||[]).forEach(w => guestDB.workouts.push({...w, id: guestId()}));
};

window.isGuest = () => isGuest;
