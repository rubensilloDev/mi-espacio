/**
 * ============================================================
 * js/auth.js — Autenticación con Firebase (Google)
 * ============================================================
 * Gestiona el ciclo de vida de la sesión:
 * · Login con popup de Google
 * · Logout con confirmación
 * · Observer que muestra/oculta la app según el estado
 * · Actualiza el perfil de usuario en el sidebar
 * ============================================================
 */

'use strict';

// Proveedor de Google con scopes de perfil y email
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

// ── Login ────────────────────────────────────────────────────

/**
 * Inicia sesión con popup de Google.
 * onAuthStateChanged se encarga de mostrar la app al completarse.
 */
async function signInWithGoogle() {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (err) {
    // Ignorar si el usuario cerró el popup voluntariamente
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('Error al iniciar sesión: ' + err.message, 'error');
      console.error('Auth error:', err);
    }
  }
}

// ── Logout ───────────────────────────────────────────────────

async function signOutUser() {
  const ok = await showConfirm(
    '¿Cerrar sesión?',
    'Tus datos están guardados en la nube y estarán disponibles la próxima vez.'
  );
  if (!ok) return;
  try {
    await auth.signOut();
  } catch (err) {
    showToast('Error al cerrar sesión', 'error');
  }
}

// ── Estado de sesión ─────────────────────────────────────────

/**
 * Observer principal. Firebase lo llama automáticamente:
 * · Al cargar la página (restaura sesión si existía)
 * · Al hacer login o logout
 */
auth.onAuthStateChanged(async user => {
  if (user) {
    // Actualizar el perfil en el sidebar
    updateUserProfile(user);

    // Mostrar app, ocultar login
    document.getElementById('login-screen').hidden = true;
    document.getElementById('app').hidden = false;

    // Inicializar la app con el usuario autenticado
    await initApp(user);

  } else {
    // Sin sesión: mostrar pantalla de login
    document.getElementById('app').hidden = true;
    document.getElementById('login-screen').hidden = false;
  }
});

// ── Actualizar UI de perfil ──────────────────────────────────

/**
 * Actualiza el avatar, nombre y email del usuario en el sidebar.
 * También actualiza el saludo en el hero del home.
 * @param {firebase.User} user
 */
function updateUserProfile(user) {
  // Avatar: usa la foto de Google o genera un avatar con las iniciales
  const avatarUrl = user.photoURL ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName || 'U')}&backgroundColor=FFD600&textColor=0A0A0A`;

  const avatar = document.getElementById('user-avatar');
  const name   = document.querySelector('.user-profile__name');
  const email  = document.querySelector('.user-profile__email');

  if (avatar) avatar.src = avatarUrl;
  if (name)   name.textContent  = user.displayName || 'Usuario';
  if (email)  email.textContent = user.email || '';

  // Saludo personalizado en el home
  const heroName = document.querySelector('.home-hero__name');
  if (heroName) {
    heroName.textContent = (user.displayName || 'Atleta').split(' ')[0];
  }
}

// ── Conectar botones ─────────────────────────────────────────

document.getElementById('btn-google-login')
  ?.addEventListener('click', signInWithGoogle);

// El botón demo ya no hace nada funcional — necesita login real
document.getElementById('btn-demo-login')
  ?.addEventListener('click', () => {
    showToast('Usa "Continuar con Google" para acceder a la app', 'info');
  });

document.getElementById('btn-logout')
  ?.addEventListener('click', signOutUser);
