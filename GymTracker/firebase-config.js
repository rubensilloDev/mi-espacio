/**
 * ============================================================
 * js/firebase-config.js — Inicialización de Firebase
 * ============================================================
 * Expone globalmente: auth, db
 *
 * ⚠️  IMPORTANTE — Para ejecutar la app abre una terminal en
 *   la carpeta gym-tracker/ y ejecuta:
 *     python3 -m http.server 8080
 *   Luego abre: http://localhost:8080
 *   (Firebase Auth no funciona abriendo index.html directamente)
 * ============================================================
 */

'use strict';

const firebaseConfig = {
  apiKey:            'AIzaSyBGOJq5ga9CT-nXQSXv0-0gh34vLbV9AgI',
  authDomain:        'gymtracker-pro-e5109.firebaseapp.com',
  projectId:         'gymtracker-pro-e5109',
  storageBucket:     'gymtracker-pro-e5109.firebasestorage.app',
  messagingSenderId: '839826470710',
  appId:             '1:839826470710:web:1ff08545a6b13605e3a597'
};

firebase.initializeApp(firebaseConfig);

// Instancias globales usadas por todos los módulos
const auth = firebase.auth();
const db   = firebase.firestore();

// Mensajes de Auth en español
auth.languageCode = 'es';

// Persistencia offline: cachea datos localmente entre sesiones
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
    console.warn('Persistencia offline no disponible:', err);
  }
});
