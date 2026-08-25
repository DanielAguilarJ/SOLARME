import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  areaPoligono, dentro, caja, ladoEnvolvente, rectanguloDentro,
  cuadradoDeArea, seAutointersecta, contornoValido, MIN_VERTICES, type Punto,
} from "./polygon";
import { compute, CITIES, type Design, type Panel } from "./solar";
import { enrichPanels } from "./price";

const panels: Panel[] = enrichPanels(
  JSON.parse(readFileSync(new URL("../data/panels.json", import.meta.url), "utf8")).panels,
) as Panel[];

const CUADRADO: Punto[] = [
  { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 },
];

/** Azotea en L: un cuadrado de 6×6 al que le falta un cuadrante de 3×3. Área 27. */
const ELE: Punto[] = [
  { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 },
  { x: 3, y: 3 }, { x: 3, y: 6 }, { x: 0, y: 6 },
];

const TRIANGULO: Punto[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }];

/** Las áreas se comparan contra valores que se calculan a mano, no contra la salida del
 * propio código: validar una fórmula contra sí misma no prueba nada. */
describe("área del contorno", () => {
  it("un cuadrado de 6 por 6 mide 36", () => {
    expect(areaPoligono(CUADRADO)).toBeCloseTo(36, 9);
  });

  it("un triángulo de base 4 y altura 3 mide 6", () => {
    expect(areaPoligono(TRIANGULO)).toBeCloseTo(6, 9);
  });

  it("la L de 6×6 sin un cuadrante de 3×3 mide 27", () => {
    expect(areaPoligono(ELE)).toBeCloseTo(27, 9);
  });

  it("da igual el sentido en que se dibuje", () => {
    expect(areaPoligono([...CUADRADO].reverse())).toBeCloseTo(36, 9);
  });

  it("menos de tres vértices no encierran superficie", () => {
    expect(areaPoligono([])).toBe(0);
    expect(areaPoligono([{ x: 0, y: 0 }])).toBe(0);
    expect(areaPoligono([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe(0);
  });

  it("tres puntos alineados no encierran superficie", () => {
    expect(areaPoligono([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }])).toBeCloseTo(0, 9);
  });
});

describe("punto dentro del contorno", () => {
  it("el centro de un cuadrado está dentro y una esquina lejana fuera", () => {
    expect(dentro({ x: 3, y: 3 }, CUADRADO)).toBe(true);
    expect(dentro({ x: 9, y: 9 }, CUADRADO)).toBe(false);
    expect(dentro({ x: -1, y: 3 }, CUADRADO)).toBe(false);
  });

  /** El caso que un algoritmo solo-convexo daría mal: el hueco de la L. */
  it("el hueco de una L queda FUERA, que es lo que un convexo no distingue", () => {
    expect(dentro({ x: 4.5, y: 4.5 }, ELE)).toBe(false);
    expect(dentro({ x: 1.5, y: 4.5 }, ELE)).toBe(true);
    expect(dentro({ x: 4.5, y: 1.5 }, ELE)).toBe(true);
  });

  it("un contorno degenerado no acepta ningún punto", () => {
    expect(dentro({ x: 0, y: 0 }, [])).toBe(false);
    expect(dentro({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });
});

describe("caja envolvente", () => {
  it("encierra el contorno exactamente", () => {
    const c = caja(ELE);
    expect(c.minX).toBe(0);
    expect(c.minY).toBe(0);
    expect(c.maxX).toBe(6);
    expect(c.maxY).toBe(6);
    expect(c.ancho).toBe(6);
    expect(c.alto).toBe(6);
  });

  it("un contorno vacío da una caja de cero, no NaN", () => {
    const c = caja([]);
    expect(c.ancho).toBe(0);
    expect(Number.isFinite(c.maxX)).toBe(true);
  });

  /** Escalar por el área en vez de por la caja recortaría la punta de una L: la L mide 27 m²
   * y √27 = 5.2, menos que sus 6 m de lado. */
  it("el lado envolvente sale de la caja, no del área", () => {
    expect(ladoEnvolvente(ELE)).toBe(6);
    expect(ladoEnvolvente(ELE)).toBeGreaterThan(Math.sqrt(areaPoligono(ELE)));
  });
});

describe("rectángulo dentro del contorno", () => {
  it("un módulo bien adentro cabe", () => {
    expect(rectanguloDentro(1, 1, 1.1, 2, CUADRADO)).toBe(true);
  });

  it("un módulo que sobresale no cabe, aunque su centro esté dentro", () => {
    expect(rectanguloDentro(5.5, 1, 1.1, 2, CUADRADO)).toBe(false);
  });

  it("en la L, un módulo sobre el hueco no cabe", () => {
    expect(rectanguloDentro(3.5, 3.5, 1.1, 2, ELE)).toBe(false);
  });

  it("en la L, el mismo módulo en el brazo sí cabe", () => {
    expect(rectanguloDentro(0.5, 3.5, 1.1, 2, ELE)).toBe(true);
  });

  it("con un contorno inválido nada cabe, en vez de aceptar todo", () => {
    expect(rectanguloDentro(0, 0, 1, 1, [])).toBe(false);
  });
});

describe("cuadrado de respaldo", () => {
  it("tiene exactamente el área pedida", () => {
    expect(areaPoligono(cuadradoDeArea(35))).toBeCloseTo(35, 6);
    expect(areaPoligono(cuadradoDeArea(180))).toBeCloseTo(180, 6);
  });

  it("un área cero o negativa no produce coordenadas absurdas", () => {
    for (const p of cuadradoDeArea(0)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(areaPoligono(cuadradoDeArea(-5))).toBe(0);
  });

  it("empieza en el origen, igual que el resto del modelo", () => {
    expect(cuadradoDeArea(36)[0]).toEqual({ x: 0, y: 0 });
  });
});

/** Un contorno que se cruza consigo mismo da un área sin sentido físico. Se rechaza al
 * capturarlo en vez de calcular con él y entregar un número inventado. */
describe("contornos que se cruzan", () => {
  it("un cuadrado normal no se cruza", () => {
    expect(seAutointersecta(CUADRADO)).toBe(false);
    expect(seAutointersecta(ELE)).toBe(false);
  });

  it("un moño sí se cruza", () => {
    const mono: Punto[] = [
      { x: 0, y: 0 }, { x: 6, y: 6 }, { x: 6, y: 0 }, { x: 0, y: 6 },
    ];
    expect(seAutointersecta(mono)).toBe(true);
  });

  it("un triángulo nunca puede cruzarse", () => {
    expect(seAutointersecta(TRIANGULO)).toBe(false);
  });
});

describe("validez del contorno", () => {
  it("acepta un cuadrado y una L reales", () => {
    expect(contornoValido(CUADRADO)).toBe(true);
    expect(contornoValido(ELE)).toBe(true);
  });

  it("rechaza pocos vértices, área nula y contornos cruzados", () => {
    expect(contornoValido([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    expect(contornoValido([{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0, y: 0.2 }])).toBe(false);
    expect(contornoValido([
      { x: 0, y: 0 }, { x: 6, y: 6 }, { x: 6, y: 0 }, { x: 0, y: 6 },
    ])).toBe(false);
  });

  it("el mínimo de vértices es tres, que es lo que encierra superficie", () => {
    expect(MIN_VERTICES).toBe(3);
  });
});


/** La razón de existir del contorno: la misma superficie en otra forma no admite los mismos
 * módulos, y un cuadrado supuesto lo esconde. */
describe("el contorno llega al cálculo", () => {
  const base: Design = {
    site: CITIES.cdmx.site, lat: CITIES.cdmx.lat, lng: CITIES.cdmx.lng,
    yield: CITIES.cdmx.yield, area: 27, tilt: CITIES.cdmx.site!.tiltOptimo,
    az: 180, shade: 0, type: "res", panel: panels[0],
  };

  it("sin contorno se supone un cuadrado y se declara como suposición", () => {
    const r = compute(base);
    expect(r.outlineMedido).toBe(false);
    expect(r.area).toBeCloseTo(27, 6);
    expect(areaPoligono(r.outline)).toBeCloseTo(27, 6);
  });

  it("con contorno el área sale del polígono y no del campo", () => {
    const r = compute({ ...base, area: 999, outline: ELE });
    expect(r.outlineMedido).toBe(true);
    expect(r.area).toBeCloseTo(27, 6);
  });

  /** El hallazgo que justifica el trabajo: misma área, distinta forma, distinto sistema. */
  it("una L de 27 m² admite menos módulos que un cuadrado de 27 m²", () => {
    const cuadrado = compute({ ...base, outline: cuadradoDeArea(27) });
    const ele = compute({ ...base, outline: ELE });
    expect(cuadrado.area).toBeCloseTo(ele.area, 6);
    expect(ele.n).toBeLessThan(cuadrado.n);
    expect(ele.kwh).toBeLessThan(cuadrado.kwh);
  });

  /** Se comprueba con `dentro` esquina por esquina y NO con `rectanguloDentro`: usar la misma
   * función que decide la colocación haría que la prueba pasara por tautología. Reducir
   * `rectanguloDentro` a comprobar solo el centro no rompía esta prueba, y sí es un defecto:
   * dejaría medio módulo volando fuera de la azotea. */
  it("ninguna esquina de ningún módulo colocado queda fuera del contorno", () => {
    const r = compute({ ...base, outline: ELE });
    expect(r.placement.modules.length).toBeGreaterThan(0);
    for (const m of r.placement.modules) {
      const esquinas = [
        { x: m.x + 1e-6, y: m.y + 1e-6 },
        { x: m.x + m.w - 1e-6, y: m.y + 1e-6 },
        { x: m.x + 1e-6, y: m.y + m.h - 1e-6 },
        { x: m.x + m.w - 1e-6, y: m.y + m.h - 1e-6 },
      ];
      for (const [k, e] of esquinas.entries()) {
        expect(
          dentro(e, ELE),
          `esquina ${k} del módulo en ${m.x.toFixed(2)},${m.y.toFixed(2)}`,
        ).toBe(true);
      }
    }
  });

  it("tampoco se sale en una azotea con la muesca del otro lado", () => {
    const espejo: Punto[] = [
      { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 },
      { x: 3, y: 6 }, { x: 3, y: 3 }, { x: 0, y: 3 },
    ];
    const r = compute({ ...base, outline: espejo });
    // Si en la L no cupiera ningún módulo el bucle no recorrería nada y la prueba no comprobaría
    // que ninguno se sale: pasaría afirmando algo sobre un techo vacío.
    expect(r.placement.modules.length).toBeGreaterThan(0);
    for (const m of r.placement.modules) {
      expect(dentro({ x: m.x + m.w - 1e-6, y: m.y + m.h - 1e-6 }, espejo)).toBe(true);
    }
  });

  /** Caer al cuadrado en silencio desconcierta: el instalador arrastra un vértice y ve el
   * área saltar de vuelta sin explicación. Se expone la señal para poder decírselo. */
  it("un contorno cruzado se ignora, se vuelve al cuadrado y se DECLARA", () => {
    const mono: Punto[] = [
      { x: 0, y: 0 }, { x: 6, y: 6 }, { x: 6, y: 0 }, { x: 0, y: 6 },
    ];
    const r = compute({ ...base, outline: mono });
    expect(r.outlineMedido).toBe(false);
    expect(r.outlineInvalido).toBe(true);
    expect(r.area).toBeCloseTo(27, 6);
    expect(r.n).toBeGreaterThan(0);
  });

  it("sin contorno dibujado no se declara inválido: no hay nada que invalidar", () => {
    expect(compute(base).outlineInvalido).toBe(false);
  });

  it("un contorno válido no se declara inválido", () => {
    expect(compute({ ...base, outline: ELE }).outlineInvalido).toBe(false);
  });

  it("un contorno de área minúscula se rechaza y se declara", () => {
    const diminuto: Punto[] = [
      { x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 0.3 }, { x: 0, y: 0.3 },
    ];
    const r = compute({ ...base, outline: diminuto });
    expect(r.outlineInvalido).toBe(true);
    expect(r.area).toBeCloseTo(27, 6);
  });

  /** Nunca por debajo de tres vértices: dos puntos no encierran superficie. */
  it("un contorno de dos vértices no cuenta como contorno dibujado", () => {
    const r = compute({ ...base, outline: [{ x: 0, y: 0 }, { x: 5, y: 5 }] });
    expect(r.outlineMedido).toBe(false);
    expect(r.outlineInvalido).toBe(false);
    expect(r.area).toBeCloseTo(27, 6);
  });

  it("el contorno y los estorbos funcionan juntos", () => {
    const limpio = compute({ ...base, outline: ELE });
    const conTinaco = compute({
      ...base, outline: ELE,
      obstacles: [{ id: "t", kind: "tinaco", height: 2, x: 1.5, y: 1, width: 1.2, depth: 1.2 }],
    });
    expect(conTinaco.n).toBeLessThanOrEqual(limpio.n);
    expect(conTinaco.shading).toBeDefined();
    // la sombra se calcula sobre la superficie del polígono, no del cuadrado
    expect(conTinaco.shading!.areaUtil).toBeLessThanOrEqual(27);
  });

  /** Esta prueba afirmaba que una azotea angosta admite MENOS que un cuadrado igual, y lo
   * medido dice lo contrario: la franja de 13.5 × 2 cabe 9 módulos y el cuadrado 8. Lo que
   * decide no es la proporción sino cómo divide el fondo norte-sur entre el pitch de fila.
   * La suposición era mía, no del dato. */
  it("lo que decide no es la proporción sino el fondo contra el pitch de fila", () => {
    const franjaBuena: Punto[] = [
      { x: 0, y: 0 }, { x: 13.5, y: 0 }, { x: 13.5, y: 2 }, { x: 0, y: 2 },
    ];
    const franjaMala: Punto[] = [
      { x: 0, y: 0 }, { x: 6.75, y: 0 }, { x: 6.75, y: 4 }, { x: 0, y: 4 },
    ];
    expect(areaPoligono(franjaBuena)).toBeCloseTo(27, 6);
    expect(areaPoligono(franjaMala)).toBeCloseTo(27, 6);

    const buena = compute({ ...base, outline: franjaBuena });
    const mala = compute({ ...base, outline: franjaMala });
    // las dos caben UNA fila, pero la de 4 m de fondo desperdicia casi una banda entera
    expect(buena.placement.rows).toBe(1);
    expect(mala.placement.rows).toBe(1);
    expect(mala.n).toBeLessThan(buena.n);
  });

  it("un fondo menor que la huella del módulo no admite ninguna fila", () => {
    const rasante: Punto[] = [
      { x: 0, y: 0 }, { x: 27, y: 0 }, { x: 27, y: 1 }, { x: 0, y: 1 },
    ];
    const r = compute({ ...base, outline: rasante });
    expect(r.n).toBe(0);
    expect(r.noCabe).toBe(true);
    expect(r.placement.faltaParaOtraFila).toBeGreaterThan(0);
  });

  /** El dato accionable: cuánto fondo falta para ganar una fila. */
  it("dice cuántos metros de fondo faltan para que entre otra fila", () => {
    const cuatroMetros: Punto[] = [
      { x: 0, y: 0 }, { x: 6.75, y: 0 }, { x: 6.75, y: 4 }, { x: 0, y: 4 },
    ];
    const r = compute({ ...base, outline: cuatroMetros });
    const falta = r.placement.faltaParaOtraFila;
    expect(falta).toBeGreaterThan(0);
    expect(falta).toBeLessThan(1);

    // y si se le da ese fondo, la fila entra de verdad
    const estirada: Punto[] = [
      { x: 0, y: 0 }, { x: 6.75, y: 0 },
      { x: 6.75, y: 4 + falta + 0.01 }, { x: 0, y: 4 + falta + 0.01 },
    ];
    expect(compute({ ...base, outline: estirada }).placement.rows).toBe(2);
  });

  it("con fondo de sobra no reporta falta artificial", () => {
    const r = compute({ ...base, outline: cuadradoDeArea(400) });
    expect(r.placement.faltaParaOtraFila).toBeGreaterThanOrEqual(0);
    expect(r.placement.rows).toBeGreaterThan(3);
  });
});
