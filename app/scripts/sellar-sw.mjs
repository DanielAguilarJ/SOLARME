#!/usr/bin/env node
/**
 * Sella el service worker después de `vite build`.
 *
 * Por qué existe, medido cortando la red sobre la app compilada: `sw.js` se copia verbatim desde
 * `public/`, así que su `VERSION` quedaba fija en «solarme-v1» build tras build. Como la caché se
 * purga solo cuando cambia `VERSION`, un despliegue nuevo —con otros hashes de assets— NUNCA
 * refrescaba el cascarón cacheado. Un usuario sin señal se quedaba con un `index.html` viejo que
 * pedía un `index-<hash>.js` que ya no existe, y la app no arrancaba.
 *
 * Este paso hace dos cosas, y las dos importan para que «funciona sin señal» sea verdad:
 *
 *   1. Deriva `VERSION` de los nombres de los assets compilados —que ya llevan hash de contenido—,
 *      así que cualquier cambio de código produce una VERSION distinta. Eso dispara `install`
 *      (recachea el cascarón fresco) y `activate` (borra la caché vieja) en cada despliegue.
 *
 *   2. Precachea los assets reales, no solo «/» e «/index.html». Sin esto, el primer arranque
 *      offline dependía de que el JS se hubiera pedido antes online; ahora basta una carga con red.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");

// Los assets con hash que referencia el índice compilado.
const assets = [...html.matchAll(/\/assets\/[^"']+\.(?:js|css)/g)].map((m) => m[0]);
if (assets.length === 0) {
  console.error("sellar-sw: no encontré assets en dist/index.html; ¿cambió el build?");
  process.exit(1);
}

const version = "solarme-" + createHash("sha256").update(assets.sort().join("|")).digest("hex").slice(0, 12);
const precache = ["/", "/index.html", ...assets];

const swPath = new URL("sw.js", dist);
let sw = readFileSync(swPath, "utf8");

const antesVersion = sw;
sw = sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`);
sw = sw.replace(/const ESENCIALES = \[[^\]]*\];/, `const ESENCIALES = ${JSON.stringify(precache)};`);

if (sw === antesVersion) {
  console.error("sellar-sw: no encontré VERSION/ESENCIALES para sustituir; ¿cambió sw.js?");
  process.exit(1);
}

writeFileSync(swPath, sw, "utf8");
console.log(`sellar-sw: ${version} · precache de ${precache.length} rutas`);
