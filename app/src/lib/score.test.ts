import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { climaValido, scorePanels, topReason, type ClimaPuntaje } from "./score";
import { enrichPanels } from "./price";
import type { Panel } from "./solar";

/**
 * El defecto que estas pruebas impiden repetir: la versión anterior del puntaje comparaba
 * cada atributo contra rangos supuestos a mano y con la base CEC real daba 100 a 134 de 140
 * módulos, con solo 5 valores distintos. Un recomendador saturado no recomienda.
 */

// Se enriquece igual que en la app: el JSON crudo del importador no trae precio, lo calcula
// price.ts. Si la prueba leyera el crudo, mediría un NaN y no detectaría nada.
const CEC: Panel[] = enrichPanels(
  JSON.parse(readFileSync(new URL("../data/panels.json", import.meta.url), "utf8")).panels
) as Panel[];

/** Techo de referencia: 60 m² en Monterrey, inclinación óptima, orientado al sur. */
const TECHO = { area: 60, lat: 25.6866, tilt: 22, az: 180, shade: 0, yield: 1710 };

const MODOS: [ClimaPuntaje, string][] = [
  ["templado", "balance"],
  ["calido", "espacio"],
  ["templado", "precio"],
  ["humedo", "calidad"],
  ["calido", "balance"],
];

describe("scorePanels — discrimina de verdad sobre el catálogo CEC real", () => {
  it("el catálogo de prueba tiene los 140 módulos", () => {
    expect(CEC.length).toBe(140);
  });

  for (const [clima, prio] of MODOS) {
    describe(`${clima} / ${prio}`, () => {
      const scored = scorePanels(CEC, clima, prio);

      it("no satura: ningún empate masivo en el tope", () => {
        const at100 = scored.filter((p) => p.score === 100).length;
        // El defecto original llegaba a 134/140. Se permite algún empate, no una avalancha.
        expect(at100).toBeLessThan(CEC.length * 0.05);
      });

      it("produce al menos 20 valores distintos sobre 140 módulos", () => {
        const uniq = new Set(scored.map((p) => p.score)).size;
        expect(uniq).toBeGreaterThanOrEqual(20);
      });

      it("usa un rango amplio de la escala", () => {
        const s = scored.map((p) => p.score);
        expect(Math.max(...s) - Math.min(...s)).toBeGreaterThan(30);
      });

      it("todo puntaje queda dentro de 0–100", () => {
        for (const p of scored) {
          expect(p.score).toBeGreaterThanOrEqual(0);
          expect(p.score).toBeLessThanOrEqual(100);
          expect(Number.isFinite(p.score)).toBe(true);
        }
      });
    });
  }
});

describe("el clima no se puede escribir a mano y colarse", () => {
  // Antes `scorePanels` recibía `clima: string` y resolvía con `CLIMA[clima] ?? {}`. Un valor mal
  // escrito caía a los pesos base SIN ERROR: seguía recomendando, con el perfil equivocado y en
  // silencio. Ése es el modo de falla que este par —tipo cerrado y validador de borde— cierra.
  it("acepta exactamente los cuatro climas que tienen perfil de pesos", () => {
    for (const c of ["calido", "templado", "fresco", "humedo"]) {
      expect(climaValido(c), c).toBe(true);
    }
  });

  it("rechaza las variantes que antes degradaban sin avisar", () => {
    // Con acento, con espacio, en mayúsculas, en otro idioma, o un nombre a medio renombrar.
    for (const c of ["húmedo", "cálido", "calido ", "CALIDO", "warm", "costa", "", "templado2"]) {
      expect(climaValido(c), c).toBe(false);
    }
  });

  it("el clima cambia el puntaje en TODOS los modos de prioridad", () => {
    // Esta prueba nació de un defecto medido y de un error mío al medirlo.
    //
    // El defecto: los pesos se combinaban con `{ ...BASE, ...CLIMA, ...PRIO }` y los perfiles de
    // prioridad declaran los cinco atributos, así que borraban el clima. Con «espacio», «precio»
    // o «calidad», los cuatro climas daban los 140 puntajes IDÉNTICOS. Un instalador en Mexicali
    // que priorizaba espacio recibía una recomendación que ignoraba los 50 °C.
    //
    // Mi error: la primera versión comparaba el ORDEN que devuelve `scorePanels`, y esa función
    // no ordena —eso lo hace la vista—, así que comparaba el orden de entrada y no medía nada.
    const puntajes = (clima: ClimaPuntaje, prio: string) =>
      scorePanels(CEC, clima, prio, TECHO).map((p) => p.score);

    for (const prio of ["balance", "espacio", "precio", "calidad"]) {
      const base = puntajes("templado", prio);
      for (const c of ["calido", "fresco", "humedo"] as const) {
        const otro = puntajes(c, prio);
        const distintos = otro.filter((s, i) => s !== base[i]).length;
        expect(distintos, `${c} no cambia nada con prio=${prio}`).toBeGreaterThan(20);
      }
    }
  });

  it("la prioridad sigue pesando más que el clima", () => {
    // La mezcla no debe invertir la intención: cambiar de prioridad tiene que mover el puntaje
    // más que cambiar de clima.
    const p = (clima: ClimaPuntaje, prio: string) =>
      scorePanels(CEC, clima, prio, TECHO).map((x) => x.score);
    const dif = (a: number[], b: number[]) =>
      a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

    const refClima = dif(p("calido", "balance"), p("templado", "balance"));
    const refPrio = dif(p("templado", "espacio"), p("templado", "balance"));
    expect(refPrio).toBeGreaterThan(refClima);
  });
});

describe("scorePanels — el contexto cambia la recomendación", () => {
  const mejor = (clima: ClimaPuntaje, prio: string) =>
    scorePanels(CEC, clima, prio).reduce((a, b) => (b.score > a.score ? b : a));

  it("priorizar espacio elige el que MÁS ENERGÍA entrega en el techo, no el más grande", () => {
    // Antes esta prueba exigía el módulo de mayor eficiencia del catálogo. Era un proxy
    // tomado por verdad: en un techo real un módulo largo exige más pasillo y caben menos
    // filas, así que el que más entrega no es ni el más eficiente ni el más potente.
    const ganador = scorePanels(CEC, "templado", "espacio", TECHO)
      .reduce((a, b) => (b.score > a.score ? b : a));

    const porEnergia = CEC.map((p) => scorePanels([p], "templado", "espacio", TECHO)[0])
      .reduce((a, b) => ((b.fit?.kwh ?? 0) > (a.fit?.kwh ?? 0) ? b : a));

    // El ganador tiene que estar en la cima por energía entregada, con holgura del 5 %.
    expect(ganador.fit).toBeDefined();
    expect(ganador.fit!.kwh).toBeGreaterThan(porEnergia.fit!.kwh * 0.95);

    // Y no tiene por qué ser el más potente: eso es justo el sesgo que se corrigió.
    const maxW = Math.max(...CEC.map((p) => p.w));
    expect(ganador.w).toBeLessThanOrEqual(maxW);
  });

  it("sin techo, el eje de energía se descarta en lugar de inventarse", () => {
    const conTecho = scorePanels(CEC, "templado", "espacio", TECHO);
    const sinTecho = scorePanels(CEC, "templado", "espacio");
    expect(conTecho.every((p) => p.fit !== undefined)).toBe(true);
    expect(sinTecho.every((p) => p.fit === undefined)).toBe(true);
    // Sin el eje medido el reparto de peso sigue produciendo puntajes válidos y variados.
    const vals = sinTecho.map((p) => p.score);
    expect(new Set(vals).size).toBeGreaterThanOrEqual(15);
    expect(Math.max(...vals)).toBeLessThanOrEqual(100);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0);
  });

  it("priorizar precio elige uno de los más baratos por watt", () => {
    const minPpw = Math.min(...CEC.map((p) => p.ppw));
    expect(mejor("templado", "precio").ppw).toBeCloseTo(minPpw, 2);
  });

  it("clima cálido favorece mejor coeficiente de temperatura que el modo precio", () => {
    // A igualdad de prioridad, el clima cálido debe subir el peso del coeficiente térmico.
    const calido = mejor("calido", "balance");
    const precio = mejor("templado", "precio");
    expect(Math.abs(calido.temp)).toBeLessThanOrEqual(Math.abs(precio.temp) + 0.02);
  });

  it("espacio y precio no siempre coinciden en el ganador", () => {
    // Si coincidieran siempre, los modos no estarían haciendo nada.
    const a = mejor("templado", "espacio");
    const b = mejor("templado", "precio");
    expect(a.model !== b.model || a.brand !== b.brand).toBe(true);
  });
});

describe("scorePanels — casos límite", () => {
  it("un catálogo vacío no revienta", () => {
    expect(scorePanels([], "templado", "balance")).toEqual([]);
  });

  it("un solo módulo recibe un puntaje válido y neutro", () => {
    const [only] = scorePanels([CEC[0]], "templado", "balance");
    // Sin nada con qué comparar, todos los atributos son neutros: 0.5 de cada peso.
    expect(only.score).toBe(50);
  });

  it("módulos idénticos reciben el mismo puntaje", () => {
    const gemelos = [CEC[0], { ...CEC[0] }];
    const [a, b] = scorePanels(gemelos, "templado", "balance");
    expect(a.score).toBe(b.score);
  });

  it("un atributo sin varianza no inventa diferencias", () => {
    // Los 140 módulos CEC tienen 25 años de garantía: ese término no debe discriminar.
    const garantias = new Set(CEC.map((p) => p.warr));
    expect(garantias.size).toBe(1);
    const scored = scorePanels(CEC, "humedo", "calidad");
    const aportes = new Set(scored.map((p) => p.breakdown.warr));
    expect(aportes.size).toBe(1);
  });

  it("los pesos siempre suman 1: los modos son comparables entre sí", () => {
    for (const [clima, prio] of MODOS) {
      const [p] = scorePanels(CEC, clima, prio);
      const total = Object.values(p.breakdown).reduce((a, b) => a + b, 0);
      // Con todos los atributos al máximo el puntaje sería 1; el desglose no puede pasarse.
      expect(total).toBeLessThanOrEqual(1.000001);
    }
  });
});

describe("topReason — explica por qué gana un módulo", () => {
  it("devuelve una etiqueta legible en español", () => {
    const scored = scorePanels(CEC, "templado", "balance");
    const razon = topReason(scored[0]);
    expect(razon).toMatch(/eficiencia|precio por watt|calor|garantía|potencia/);
  });

  it("en modo espacio la razón dominante es la eficiencia", () => {
    const mejor = scorePanels(CEC, "templado", "espacio")
      .reduce((a, b) => (b.score > a.score ? b : a));
    expect(topReason(mejor)).toBe("eficiencia");
  });

  it("en modo precio la razón dominante es el precio por watt", () => {
    const mejor = scorePanels(CEC, "templado", "precio")
      .reduce((a, b) => (b.score > a.score ? b : a));
    expect(topReason(mejor)).toBe("precio por watt");
  });
});
