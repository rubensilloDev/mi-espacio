/**
 * js/auth.js — Autenticación con Firebase (Google)
 * Mismo método que la app que ya funciona.
 */

'use strict';

const googleProvider = new firebase.auth.GoogleAuthProvider();

// Observer: se ejecuta al cargar y cada vez que cambia la sesión
auth.onAuthStateChanged(async user => {
  if (user) {
    updateUserProfile(user);
    document.getElementById('login-screen').hidden = true;
    document.getElementById('app').hidden = false;
    await initApp(user);
  } else {
    document.getElementById('app').hidden = true;
    document.getElementById('login-screen').hidden = false;
  }
});

// Botón Google — exactamente igual que la app que funciona
document.getElementById('btn-google-login').onclick = async () => {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch(e) {
    showToast('Error al iniciar sesión. Inténtalo de nuevo.', 'error');
    console.error(e);
  }
};

// Botón demo — aviso
document.getElementById('btn-demo-login')?.addEventListener('click', () => {
  showToast('Usa "Continuar con Google" para acceder', 'info');
});

// Cerrar sesión
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  const ok = await showConfirm('¿Cerrar sesión?', 'Tus datos están guardados en la nube.');
  if (ok) auth.signOut();
});

function updateUserProfile(user) {
  const avatarUrl = user.photoURL ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName||'U')}&backgroundColor=FFD600&textColor=0A0A0A`;

  const avatar = document.getElementById('user-avatar');
  const name   = document.querySelector('.user-profile__name');
  const email  = document.querySelector('.user-profile__email');

  if (avatar) avatar.src = avatarUrl;
  if (name)   name.textContent  = user.displayName || 'Usuario';
  if (email)  email.textContent = user.email || '';

  const heroName = document.querySelector('.home-hero__name');
  if (heroName) heroName.textContent = (user.displayName || 'Atleta').split(' ')[0];
}
