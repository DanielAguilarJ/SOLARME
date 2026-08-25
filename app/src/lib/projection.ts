/**
 * Proyección entre los metros del modelo y los píxeles del plano, en los dos sentidos.
 *
 * El dibujo muestra el techo como un cuadrilátero en perspectiva, no como un cuadrado de
 * frente. Para dibujar basta ir de metros a píxeles; para que el instalador pueda ARRASTRAR
 * un estorbo hace falta el camino inverso, y una interpolación bilineal no se invierte con
 * una fórmula cerrada. Se resuelve con Newton en dos variables, que converge en tres o
 * cuatro pasos porque el cuadrilátero es convexo y casi un cuadrado.
 *
 * Vive aparte del componente para poder probar la ida y el regreso: si la inversa no
 * devuelve el punto de partida, arrastrar movería el estorbo a otro lado.
 */

export interface Punto {
  x: number;
  y: number;
}

/** Las cuatro esquinas del techo en píxeles. */
export interface Esquinas {
  /** Suroeste: el origen del modelo, metros (0, 0). */
  so: Punto;
  se: Punto;
  no: Punto;
  ne: Punto;
}

/**
 * Metros del modelo → píxeles. `u` corre al oriente y `v` al norte, ambos de 0 a 1.
 */
export function aPixeles(u: number, v: number, e: Esquinas): Punto {
  const a = (1 - u) * (1 - v);
  const b = u * (1 - v);
  const c = (1 - u) * v;
  const d = u * v;
  return {
    x: a * e.so.x + b * e.se.x + c * e.no.x + d * e.ne.x,
    y: a * e.so.y + b * e.se.y + c * e.no.y + d * e.ne.y,
  };
}

/**
 * Píxeles → coordenadas normalizadas del modelo, por Newton.
 *
 * Devuelve `u` y `v` acotados a [0, 1]: un clic fuera del techo se pega a la orilla en vez
 * de producir una posición imposible, que es lo que espera quien arrastra hasta el borde.
 */
export function aModelo(px: number, py: number, e: Esquinas): { u: number; v: number } {
  let u = 0.5;
  let v = 0.5;

  for (let i = 0; i < 8; i++) {
    const p = aPixeles(u, v, e);
    const fx = p.x - px;
    const fy = p.y - py;
    if (Math.abs(fx) < 1e-7 && Math.abs(fy) < 1e-7) break;

    // derivadas parciales de la bilineal
    const dxu = (1 - v) * (e.se.x - e.so.x) + v * (e.ne.x - e.no.x);
    const dxv = (1 - u) * (e.no.x - e.so.x) + u * (e.ne.x - e.se.x);
    const dyu = (1 - v) * (e.se.y - e.so.y) + v * (e.ne.y - e.no.y);
    const dyv = (1 - u) * (e.no.y - e.so.y) + u * (e.ne.y - e.se.y);

    const det = dxu * dyv - dxv * dyu;
    if (Math.abs(det) < 1e-12) break; // cuadrilátero degenerado: no hay inversa estable

    u -= (fx * dyv - fy * dxv) / det;
    v -= (fy * dxu - fx * dyu) / det;

    // se mantiene dentro del dominio durante la iteración para que no se escape
    u = Math.max(-0.5, Math.min(1.5, u));
    v = Math.max(-0.5, Math.min(1.5, v));
  }

  return {
    u: Math.max(0, Math.min(1, u)),
    v: Math.max(0, Math.min(1, v)),
  };
}

/** Píxeles → metros desde la esquina suroeste. */
export function aMetros(px: number, py: number, e: Esquinas, lado: number): Punto {
  const { u, v } = aModelo(px, py, e);
  return { x: u * lado, y: v * lado };
}

/** Metros → píxeles. */
export function metrosAPixeles(x: number, y: number, e: Esquinas, lado: number): Punto {
  const L = Math.max(lado, 1e-9);
  return aPixeles(
    Math.max(0, Math.min(1, x / L)),
    Math.max(0, Math.min(1, y / L)),
    e,
  );
}
