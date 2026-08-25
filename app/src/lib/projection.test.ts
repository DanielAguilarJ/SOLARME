import { describe, it, expect } from "vitest";
import { aPixeles, aModelo, aMetros, metrosAPixeles, type Esquinas } from "./projection";

/** Las esquinas reales del plano, con la misma perspectiva que usa el dibujo. */
const E: Esquinas = {
  so: { x: 96, y: 338 },
  se: { x: 516, y: 366 },
  no: { x: 136, y: 66 },
  ne: { x: 544, y: 88 },
};

/** Un cuadrado perfecto, para comprobar el caso sin perspectiva. */
const CUADRADO: Esquinas = {
  so: { x: 0, y: 100 },
  se: { x: 100, y: 100 },
  no: { x: 0, y: 0 },
  ne: { x: 100, y: 0 },
};

describe("ida: metros a píxeles", () => {
  it("las cuatro esquinas caen exactamente en su lugar", () => {
    expect(aPixeles(0, 0, E)).toEqual(E.so);
    expect(aPixeles(1, 0, E)).toEqual(E.se);
    expect(aPixeles(0, 1, E)).toEqual(E.no);
    expect(aPixeles(1, 1, E)).toEqual(E.ne);
  });

  it("el centro cae en el promedio de las cuatro esquinas", () => {
    const c = aPixeles(0.5, 0.5, E);
    expect(c.x).toBeCloseTo((E.so.x + E.se.x + E.no.x + E.ne.x) / 4, 6);
    expect(c.y).toBeCloseTo((E.so.y + E.se.y + E.no.y + E.ne.y) / 4, 6);
  });

  it("el norte queda arriba en pantalla, que es donde apunta la brújula", () => {
    expect(aPixeles(0.5, 1, E).y).toBeLessThan(aPixeles(0.5, 0, E).y);
  });

  it("el oriente queda a la derecha", () => {
    expect(aPixeles(1, 0.5, E).x).toBeGreaterThan(aPixeles(0, 0.5, E).x);
  });
});

/**
 * La propiedad que hace seguro arrastrar: si la inversa no devuelve el punto de partida, el
 * estorbo saltaría a otro lugar al soltarlo.
 */
describe("vuelta: la inversa recupera el punto de partida", () => {
  it("recupera cualquier punto interior con precisión de un milímetro", () => {
    for (const u of [0, 0.13, 0.25, 0.5, 0.77, 0.91, 1]) {
      for (const v of [0, 0.08, 0.34, 0.5, 0.66, 0.95, 1]) {
        const p = aPixeles(u, v, E);
        const r = aModelo(p.x, p.y, E);
        expect(r.u, `u en (${u},${v})`).toBeCloseTo(u, 4);
        expect(r.v, `v en (${u},${v})`).toBeCloseTo(v, 4);
      }
    }
  });

  it("también funciona sin perspectiva, donde la solución es trivial", () => {
    const p = aPixeles(0.3, 0.7, CUADRADO);
    const r = aModelo(p.x, p.y, CUADRADO);
    expect(r.u).toBeCloseTo(0.3, 6);
    expect(r.v).toBeCloseTo(0.7, 6);
  });

  it("un punto fuera del techo se pega a la orilla, sin devolver algo imposible", () => {
    const fuera = aModelo(E.so.x - 300, E.so.y + 300, E);
    expect(fuera.u).toBeGreaterThanOrEqual(0);
    expect(fuera.u).toBeLessThanOrEqual(1);
    expect(fuera.v).toBeGreaterThanOrEqual(0);
    expect(fuera.v).toBeLessThanOrEqual(1);
  });

  it("un cuadrilátero degenerado no cuelga ni devuelve NaN", () => {
    const plano: Esquinas = {
      so: { x: 10, y: 10 }, se: { x: 10, y: 10 },
      no: { x: 10, y: 10 }, ne: { x: 10, y: 10 },
    };
    const r = aModelo(50, 50, plano);
    expect(Number.isFinite(r.u)).toBe(true);
    expect(Number.isFinite(r.v)).toBe(true);
  });
});

describe("conversión en metros", () => {
  const LADO = 6;

  it("va y vuelve conservando los metros", () => {
    for (const [x, y] of [[0, 0], [1.5, 4.2], [3, 3], [5.9, 0.1], [6, 6]]) {
      const p = metrosAPixeles(x, y, E, LADO);
      const m = aMetros(p.x, p.y, E, LADO);
      expect(m.x, `x de (${x},${y})`).toBeCloseTo(x, 3);
      expect(m.y, `y de (${x},${y})`).toBeCloseTo(y, 3);
    }
  });

  it("nunca devuelve metros fuera del techo", () => {
    const m = aMetros(0, 0, E, LADO);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x).toBeLessThanOrEqual(LADO);
    expect(m.y).toBeGreaterThanOrEqual(0);
    expect(m.y).toBeLessThanOrEqual(LADO);
  });

  it("un techo de lado cero no rompe la conversión", () => {
    const p = metrosAPixeles(0, 0, E, 0);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it("mover un píxel a la derecha mueve menos de un metro en un techo chico", () => {
    const a = aMetros(300, 200, E, LADO);
    const b = aMetros(301, 200, E, LADO);
    expect(Math.abs(b.x - a.x)).toBeLessThan(0.1);
    expect(Math.abs(b.x - a.x)).toBeGreaterThan(0);
  });
});
