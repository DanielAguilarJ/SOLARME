/**
 * Matemática de mosaicos de imagen aérea (Web Mercator, el esquema que usan todos los
 * proveedores de mapas): dado un domicilio y un nivel de acercamiento, QUÉ mosaicos pedir y en
 * qué píxel exacto cae el domicilio dentro de ellos.
 *
 * Vive aparte y sin ninguna URL de proveedor dentro por dos razones medidas:
 *
 * 1. La fuente todavía no está decidida, pero la matemática es idéntica para todas. Cambiar de
 *    proveedor debe ser cambiar una plantilla de texto, no reescribir la vista.
 *
 * 2. El INEGI publica su imagen con una licencia que permite explotación comercial, pero sus
 *    capas servibles por WMS son ortofotos a escala 1:10 000 (≈1.5-2 m por píxel), RapidEye a
 *    5 m y Landsat a 30 m. Un módulo mide 1.13 m de lado corto: en la mejor de esas capas un
 *    módulo es SUBPÍXEL. Por eso `resolucionSuficiente` existe y la vista debe consultarla antes
 *    de invitar a trazar un techo: una imagen demasiado gruesa no se nota "borrosa", se nota en
 *    que el instalador traza un contorno que no corresponde al techo real y nadie lo sabe.
 *
 * El crédito de la fuente es un campo OBLIGATORIO del tipo, no un adorno: los Términos de Libre
 * Uso del INEGI —y los de cualquier proveedor comercial— exigen atribución. Al hacerlo parte de
 * `FuenteMosaico`, el compilador impide construir una fuente sin crédito.
 */

/** Circunferencia de la Tierra en metros, la que usa Web Mercator. */
const CIRCUNFERENCIA_M = 40075016.686;

/** Lado en píxeles de un mosaico. 256 es el estándar; 512 lo usan algunos proveedores. */
export const LADO_MOSAICO = 256;

/** Límite de latitud de Web Mercator: más allá la proyección se va a infinito. */
export const LAT_MAX = 85.05112878;

/** Lado corto de un módulo fotovoltaico típico, en metros. Es la vara para medir si una imagen
 *  sirve: si un módulo no ocupa varios píxeles, no se puede colocar sobre la imagen. */
export const LADO_MODULO_M = 1.13;

export interface FuenteMosaico {
  /** Nombre legible, para poder decirle al instalador de dónde sale la imagen. */
  readonly nombre: string;
  /** Plantilla con `{z}`, `{x}` e `{y}`. Sin proveedor escrito en este archivo. */
  readonly plantilla: string;
  /** Atribución exigida por la licencia. No puede quedar vacía. */
  readonly credito: string;
  /** Acercamiento máximo que la fuente sirve de verdad. */
  readonly zoomMax: number;
}

export interface Mosaico {
  readonly z: number;
  readonly x: number;
  readonly y: number;
  /** Posición del mosaico dentro del lienzo, en píxeles, ya descontado el centrado. */
  readonly izquierda: number;
  readonly arriba: number;
}

export interface Vista {
  readonly mosaicos: readonly Mosaico[];
  /** Píxel del lienzo donde cae exactamente el domicilio. */
  readonly centro: { readonly px: number; readonly py: number };
  readonly metrosPorPixel: number;
}

function acotar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Cuántos mosaicos hay por lado en un nivel de acercamiento. */
export function mosaicosPorLado(zoom: number): number {
  return 2 ** Math.max(0, Math.floor(zoom));
}

/**
 * Coordenada de mosaico FRACCIONARIA. La parte entera dice qué mosaico y la decimal en qué
 * punto de él cae, que es lo que permite centrar el domicilio en el píxel correcto en vez de
 * en la esquina del mosaico que lo contiene.
 */
export function aFraccion(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = mosaicosPorLado(zoom);
  const la = acotar(lat, -LAT_MAX, LAT_MAX);
  // La longitud se envuelve en vez de acotarse: -190° es una longitud válida, es 170°.
  const lo = ((((lon + 180) % 360) + 360) % 360) - 180;
  const rad = (la * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x: ((lo + 180) / 360) * n, y: acotar(y, 0, n) };
}

/**
 * Inverso de `aFraccion`: de coordenada de mosaico fraccionaria a latitud y longitud.
 *
 * Existe para que el instalador pueda ARRASTRAR el pin del techo: sin el inverso, un gesto en
 * píxeles no se puede traducir a un domicilio nuevo. La fórmula es la inversa exacta de la
 * proyección Web Mercator, no una aproximación, así que ir y volver devuelve el mismo punto.
 */
export function aCoordenada(x: number, y: number, zoom: number): { lat: number; lon: number } {
  const n = mosaicosPorLado(zoom);
  const lon = (x / n) * 360 - 180;
  const g = Math.PI * (1 - (2 * acotar(y, 0, n)) / n);
  const lat = (Math.atan(Math.sinh(g)) * 180) / Math.PI;
  return { lat, lon };
}

/**
 * Mueve una coordenada un desplazamiento en píxeles de pantalla, al nivel de acercamiento dado.
 *
 * Es lo que convierte «el instalador arrastró el pin 40 px a la derecha» en el domicilio nuevo.
 * `dpx` positivo mueve al este; `dpy` positivo, al sur (el eje de pantalla crece hacia abajo).
 */
export function desplazar(
  lat: number,
  lon: number,
  zoom: number,
  dpx: number,
  dpy: number
): { lat: number; lon: number } {
  const f = aFraccion(lat, lon, zoom);
  return aCoordenada(f.x + dpx / LADO_MOSAICO, f.y + dpy / LADO_MOSAICO, zoom);
}

/** Metros de suelo por píxel de imagen. Depende de la latitud: Mercator estira hacia los polos. */
export function metrosPorPixel(lat: number, zoom: number): number {
  const la = acotar(lat, -LAT_MAX, LAT_MAX);
  const escala = LADO_MOSAICO * mosaicosPorLado(zoom);
  return (CIRCUNFERENCIA_M * Math.cos((la * Math.PI) / 180)) / escala;
}

/**
 * Nivel de acercamiento más bajo que consigue al menos la resolución pedida. Se devuelve el más
 * bajo a propósito: cada nivel extra cuadruplica los mosaicos que hay que traer, y pedir más
 * detalle del necesario se paga en peticiones y en espera del instalador.
 */
export function zoomParaResolucion(lat: number, metrosObjetivo: number, zoomTope = 22): number {
  if (!(metrosObjetivo > 0)) return zoomTope;
  for (let z = 0; z <= zoomTope; z++) {
    if (metrosPorPixel(lat, z) <= metrosObjetivo) return z;
  }
  return zoomTope;
}

/**
 * Si la imagen da para trabajar sobre ella. El criterio no es estético: se exige que el lado
 * corto de un módulo ocupe al menos `pixelesMinimos` píxeles, porque por debajo de eso el
 * instalador estaría arrastrando módulos sobre una mancha.
 */
export function resolucionSuficiente(
  lat: number,
  zoom: number,
  ladoModuloM = LADO_MODULO_M,
  pixelesMinimos = 4
): boolean {
  return ladoModuloM / metrosPorPixel(lat, zoom) >= pixelesMinimos;
}

/** URL de un mosaico concreto. Rechaza una fuente sin crédito: la licencia exige atribución. */
export function urlDeMosaico(f: FuenteMosaico, m: Mosaico): string {
  if (f.credito.trim() === "") {
    throw new Error("Una fuente de imagen sin crédito no se puede usar: la licencia exige atribución.");
  }
  return f.plantilla
    .replace("{z}", String(m.z))
    .replace("{x}", String(m.x))
    .replace("{y}", String(m.y));
}

/**
 * Los mosaicos que cubren un lienzo de `ancho` x `alto` píxeles centrado en el domicilio, con la
 * posición de cada uno ya calculada para poder pintarlos sin más aritmética en la vista.
 */
export function vistaPara(
  lat: number,
  lon: number,
  zoom: number,
  ancho: number,
  alto: number
): Vista {
  const z = Math.max(0, Math.floor(zoom));
  const n = mosaicosPorLado(z);
  const f = aFraccion(lat, lon, z);

  // Píxel global del domicilio, y esquina superior izquierda del lienzo en ese mismo sistema.
  const gx = f.x * LADO_MOSAICO;
  const gy = f.y * LADO_MOSAICO;
  const x0 = gx - ancho / 2;
  const y0 = gy - alto / 2;

  const desde = (v: number) => Math.floor(v / LADO_MOSAICO);
  const hasta = (v: number) => Math.ceil(v / LADO_MOSAICO) - 1;

  const mosaicos: Mosaico[] = [];
  for (let ty = desde(y0); ty <= hasta(y0 + alto); ty++) {
    // Verticalmente no hay envoltura: fuera del rango no existe mosaico y se omite.
    if (ty < 0 || ty >= n) continue;
    for (let tx = desde(x0); tx <= hasta(x0 + ancho); tx++) {
      mosaicos.push({
        z,
        x: ((tx % n) + n) % n, // la longitud sí se envuelve
        y: ty,
        izquierda: tx * LADO_MOSAICO - x0,
        arriba: ty * LADO_MOSAICO - y0,
      });
    }
  }

  return {
    mosaicos,
    centro: { px: gx - x0, py: gy - y0 },
    metrosPorPixel: metrosPorPixel(lat, z),
  };
}
