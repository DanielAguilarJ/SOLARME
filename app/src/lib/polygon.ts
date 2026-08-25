/**
 * Geometría del contorno real del techo.
 *
 * Hasta ahora el techo era un CUADRADO de lado √área: la hipótesis menos comprometida
 * cuando no se conoce la forma. Pero un instalador parado en la azotea sí la conoce, y la
 * forma cambia el resultado: la misma superficie en una L angosta admite menos módulos que
 * en un cuadrado, porque las filas se cortan.
 *
 * Todo en metros, con el origen en la esquina suroeste, x al oriente y y al norte, igual que
 * el resto del modelo.
 */

export interface Punto {
  x: number;
  y: number;
}

/** Mínimo de vértices para que un contorno delimite superficie. */
export const MIN_VERTICES = 3;

/**
 * Área por la fórmula del cordón de zapato. Devuelve el valor absoluto, así que da igual si
 * los vértices vienen en sentido horario o antihorario: pedirle a alguien que dibuje en un
 * sentido concreto sería una trampa.
 */
export function areaPoligono(p: Punto[]): number {
  if (p.length < MIN_VERTICES) return 0;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * ¿Está el punto dentro del polígono? Por cruces de rayo horizontal.
 *
 * Funciona con polígonos cóncavos, que es justo el caso que importa: las azoteas en L o con
 * un patio son cóncavas, y un algoritmo que solo maneje convexos las daría por buenas
 * incluyendo el hueco.
 */
export function dentro(punto: Punto, poly: Punto[]): boolean {
  if (poly.length < MIN_VERTICES) return false;
  let adentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const cruza = a.y > punto.y !== b.y > punto.y;
    if (!cruza) continue;
    const xCorte = a.x + ((punto.y - a.y) / (b.y - a.y)) * (b.x - a.x);
    if (punto.x < xCorte) adentro = !adentro;
  }
  return adentro;
}

export interface Caja {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  ancho: number;
  alto: number;
}

export function caja(p: Punto[]): Caja {
  if (p.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, ancho: 0, alto: 0 };
  }
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, ancho: maxX - minX, alto: maxY - minY };
}

/** Lado del cuadrado que cubre el contorno. Es la escala de dibujo y de recorrido de celdas:
 * usar el área daría un cuadrado más chico que el polígono y recortaría la punta de una L. */
export function ladoEnvolvente(p: Punto[]): number {
  const c = caja(p);
  return Math.max(c.ancho, c.alto);
}

/** ¿Cabe este rectángulo completo dentro del contorno? Se comprueban las cuatro esquinas y el
 * centro. No es exacto para polígonos muy dentados, pero un módulo mide más de dos metros y
 * una azotea no tiene dientes de esa escala; comprobar solo el centro sí dejaría medio módulo
 * volando fuera del techo. */
export function rectanguloDentro(
  x: number, y: number, w: number, h: number, poly: Punto[],
): boolean {
  if (poly.length < MIN_VERTICES) return false;
  const e = 1e-6;
  return (
    dentro({ x: x + e, y: y + e }, poly) &&
    dentro({ x: x + w - e, y: y + e }, poly) &&
    dentro({ x: x + e, y: y + h - e }, poly) &&
    dentro({ x: x + w - e, y: y + h - e }, poly) &&
    dentro({ x: x + w / 2, y: y + h / 2 }, poly)
  );
}

/** Contorno cuadrado equivalente a un área. Es el respaldo cuando nadie dibujó la azotea, y
 * la interfaz lo declara como suposición. */
export function cuadradoDeArea(area: number): Punto[] {
  const l = Math.sqrt(Math.max(0, area));
  return [
    { x: 0, y: 0 },
    { x: l, y: 0 },
    { x: l, y: l },
    { x: 0, y: l },
  ];
}

/** ¿Se cruzan dos lados del contorno? Un polígono que se cruza consigo mismo produce un área
 * sin sentido físico, así que se rechaza al capturarlo en vez de calcular con él. */
export function seAutointersecta(p: Punto[]): boolean {
  const n = p.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // lados que comparten vértice no cuentan como cruce
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (cruzan(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
    }
  }
  return false;
}

function orientacion(a: Punto, b: Punto, c: Punto): number {
  const v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  return Math.abs(v) < 1e-12 ? 0 : v > 0 ? 1 : 2;
}

function cruzan(p1: Punto, q1: Punto, p2: Punto, q2: Punto): boolean {
  const o1 = orientacion(p1, q1, p2);
  const o2 = orientacion(p1, q1, q2);
  const o3 = orientacion(p2, q2, p1);
  const o4 = orientacion(p2, q2, q1);
  return o1 !== o2 && o3 !== o4;
}

/** Contorno válido para calcular: suficientes vértices, área real y sin cruzarse. */
export function contornoValido(p: Punto[]): boolean {
  return p.length >= MIN_VERTICES && areaPoligono(p) > 0.5 && !seAutointersecta(p);
}
