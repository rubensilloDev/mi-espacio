/**
 * ============================================================
 * js/firebase-config.js — Inicialización de Firebase
 * ============================================================
 * Expone globalmente: auth, db
 * ============================================================
 */

'use strict';

const firebaseConfig = {
  apiKey:            "AIzaSyA8pMAVklqE2cUMfk92WKDFKSfOdhdOJl0",
  authDomain:        "gymtracker-2026r.firebaseapp.com",
  projectId:         "gymtracker-2026r",
  storageBucket:     "gymtracker-2026r.firebasestorage.app",
  messagingSenderId: "267443380401",
  appId:             "1:267443380401:web:08a86ba3298336cf804290"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

auth.languageCode = 'es';

db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
    console.warn('Persistencia offline no disponible:', err);
  }
});
