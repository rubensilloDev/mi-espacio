// Service Worker — Mi Espacio
// Permite que la app funcione sin conexión guardando los archivos en caché

const CACHE = "mi-espacio-v1";

// Archivos que se guardan en caché al instalar
const FILES = [
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
];

// Al instalar: guardar archivos en caché
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES))
  );
});

// Al activar: borrar cachés antiguas
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

// Al hacer peticiones: servir desde caché si está disponible
self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
