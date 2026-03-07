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
  apiKey:            'AIzaSyBExWvzvv8IA17ZtMQei9cZ3SH4Xnb5_h8',
  authDomain:        'app-ideas-4d77b.firebaseapp.com',
  projectId:         'app-ideas-4d77b',
  storageBucket:     'app-ideas-4d77b.firebasestorage.app',
  messagingSenderId: '631636683224',
  appId:             '1:631636683224:web:9c021ae78629e701c5eaad'
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
