'use strict';

const googleProvider = new firebase.auth.GoogleAuthProvider();

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

document.getElementById('btn-google-login').onclick = async () => {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch(e) {
    showToast('Error al iniciar sesión. Inténtalo de nuevo.', 'error');
    console.error(e);
  }
};

document.getElementById('btn-demo-login')?.addEventListener('click', () => {
  showToast('Usa "Continuar con Google" para acceder', 'info');
});

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
