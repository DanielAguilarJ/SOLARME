/*
 * Trabajador de servicio de SolarMe.
 *
 * Razón de existir: esto se usa en una azotea. Sin conexión una aplicación de una sola página
 * no carga en absoluto —el cascarón se pide al servidor— aunque toda la física, el catálogo de
 * módulos y los proyectos guardados ya vivan en el dispositivo. El instalador abriría la app
 * frente al cliente y vería una pantalla de error teniendo todo lo necesario en la mano.
 *
 * Está escrito a mano en vez de traer un plugin de compilación. Son sesenta líneas y así queda
 * explícito qué se guarda y qué no, que es justo lo que uno quiere poder auditar en la pieza
 * que decide si la aplicación arranca.
 *
 * Estrategias, y el porqué de cada una:
 *
 *   navegación → primero la red, con respaldo en caché. Si hay señal se recibe la versión
 *   nueva; si no, la última que se abrió. Al contrario —caché primero— dejaría al instalador
 *   con una versión vieja sin manera de enterarse.
 *
 *   recursos propios (js, css, tipografías, imágenes) → primero la caché. Llevan huella en el
 *   nombre, así que un archivo con ese nombre no cambia nunca de contenido y servirlo de la
 *   caché es correcto además de instantáneo.
 *
 *   todo lo demás (geocodificador, APIs) → solo red, nunca caché. Una respuesta de
 *   geocodificación cacheada por el trabajador se saltaría la validación y el control de ritmo
 *   que hace `geocode.ts`, que ya tiene su propia caché en almacenamiento local.
 */

// `VERSION` y `ESENCIALES` son PLACEHOLDERS: `scripts/sellar-sw.mjs` los reescribe tras el
// build con un identificador derivado de los assets y con la lista real a precachear. Si esta
// versión fija llegara a producción, la caché no se invalidaría entre despliegues.
const VERSION = "solarme-dev";
const ESENCIALES = ["/", "/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(ESENCIALES))
      // si algún esencial falla no se aborta la instalación: vale más un trabajador a medias
      // que ninguno, y el resto de los recursos se guarda al primer uso
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;

  // el geocodificador y cualquier API quedan fuera: los maneja la aplicación
  if (!propio && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copia));
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match("/index.html") || Response.error()),
        ),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((enCache) => {
      if (enCache) return enCache;
      return fetch(req)
        .then((res) => {
          // solo se guarda lo que llegó bien; una respuesta de error en caché es una trampa
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => enCache || Response.error());
    }),
  );
});
