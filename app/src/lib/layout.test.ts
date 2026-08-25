import { describe, it, expect } from "vitest";
import { placeModules, bloqueadoPorSombra, SOMBRA_CRITICA } from "./layout";
import { rowSpacing, panelsWithSpacing } from "./spacing";
import { computeShading, type Obstacle } from "./shading";
import { panelDimensions } from "./dims";
import { SITES } from "./site";

/**
 * La condición que hace esto seguro: sobre un techo LIMPIO la colocación real tiene que dar
 * exactamente lo mismo que el cálculo por área. Si difirieran habría dos estimaciones
 * contradictorias en la misma app, que es un defecto que ya se corrigió una vez con las
 * dimensiones por módulo.
 */
describe("equivalencia con el cálculo anterior en techo limpio", () => {
  const casos = [
    { area: 22, lat: 19.43, panelArea: 1.95 },
    { area: 35, lat: 19.43, panelArea: 2.58 },
    { area: 60, lat: 25.69, panelArea: 2.58 },
    { area: 180, lat: 20.66, panelArea: 3.1 },
    { area: 400, lat: 32.51, panelArea: 2.2 },
    { area: 7, lat: 21.16, panelArea: 2.58 },
  ];

  it("reproduce el conteo, las filas y los módulos por fila", () => {
    for (const c of casos) {
      const dims = panelDimensions(c.panelArea);
      const sp = rowSpacing({ lat: c.lat, tilt: 24, panelLength: dims.length });
      const viejo = panelsWithSpacing(c.area, dims.width, sp);
      const nuevo = placeModules({
        ancho: Math.sqrt(c.area),
        fondo: Math.sqrt(c.area),
        pitch: sp.pitch,
        footprint: sp.footprint,
        moduleWidth: dims.width,
      });
      const etiqueta = `área ${c.area}`;
      expect(nuevo.count, etiqueta).toBe(viejo.count);
      expect(nuevo.rows, etiqueta).toBe(viejo.rows);
      expect(nuevo.perRow, etiqueta).toBe(viejo.perRow);
    }
  });

  it("sin estorbos no descarta ninguna posición", () => {
    const dims = panelDimensions(2.58);
    const sp = rowSpacing({ lat: 19.43, tilt: 24, panelLength: dims.length });
    const r = placeModules({
      ancho: 6, fondo: 6, pitch: sp.pitch, footprint: sp.footprint, moduleWidth: dims.width,
    });
    expect(r.bloqueadas).toBe(0);
  });
});

describe("geometría de la colocación", () => {
  const dims = panelDimensions(2.58);
  const sp = rowSpacing({ lat: 19.43, tilt: 24, panelLength: dims.length });
  const base = { ancho: 8, fondo: 8, pitch: sp.pitch, footprint: sp.footprint, moduleWidth: dims.width };

  it("ningún módulo se sale del techo", () => {
    const r = placeModules(base);
    for (const m of r.modules) {
      expect(m.x + m.w).toBeLessThanOrEqual(base.ancho + 1e-6);
      expect(m.y + m.h).toBeLessThanOrEqual(base.fondo + 1e-6);
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("ningún par de módulos se traslapa", () => {
    const { modules } = placeModules(base);
    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const a = modules[i], b = modules[j];
        const separados =
          a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 ||
          a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9;
        expect(separados, `traslape entre ${i} y ${j}`).toBe(true);
      }
    }
  });

  it("las filas consecutivas guardan el pitch, no se pegan", () => {
    const { modules } = placeModules(base);
    const ys = [...new Set(modules.map((m) => m.y))].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeCloseTo(sp.pitch, 6);
    }
    // y el hueco libre entre el borde trasero de una fila y la siguiente es el pasillo
    if (ys.length > 1) {
      expect(ys[1] - (ys[0] + sp.footprint)).toBeCloseTo(sp.gap, 1);
    }
  });

  it("la primera fila arranca en la orilla sur", () => {
    const { modules } = placeModules(base);
    expect(Math.min(...modules.map((m) => m.y))).toBe(0);
  });

  it("un techo diminuto no coloca nada en vez de forzar un módulo", () => {
    const r = placeModules({ ...base, ancho: 0.8, fondo: 0.8 });
    expect(r.count).toBe(0);
    expect(r.modules).toHaveLength(0);
  });

  it("medidas inválidas devuelven cero y no NaN", () => {
    for (const mal of [{ ancho: 0 }, { fondo: 0 }, { pitch: 0 }, { moduleWidth: 0 }, { footprint: -1 }]) {
      const r = placeModules({ ...base, ...mal });
      expect(r.count).toBe(0);
      expect(Number.isFinite(r.rows)).toBe(true);
    }
  });
});

/** El motivo de existir de este módulo: la fragmentación. */
/** El fondo norte-sur y el ancho oriente-poniente son ejes distintos. Compartir un solo
 * `side` para los dos daba un conteo de filas que no correspondía a ninguna azotea: una de
 * 6.75 × 4 recibía 6.75 en ambos y reportaba que le faltaban 2.29 m para otra fila cuando le
 * faltan 0.16. */
describe("los dos ejes no son intercambiables", () => {
  const dims = panelDimensions(2.58);
  const sp = rowSpacing({ lat: 19.43, tilt: 24, panelLength: dims.length });
  const con = (ancho: number, fondo: number) =>
    placeModules({ ancho, fondo, pitch: sp.pitch, footprint: sp.footprint, moduleWidth: dims.width });

  it("las filas dependen del fondo y los módulos por fila del ancho", () => {
    const ancha = con(12, 4);
    const profunda = con(4, 12);
    expect(profunda.rows).toBeGreaterThan(ancha.rows);
    expect(ancha.perRow).toBeGreaterThan(profunda.perRow);
  });

  it("intercambiar los ejes cambia el resultado, o sea que se están usando", () => {
    expect(con(12, 4).count).not.toBe(con(4, 12).count);
  });

  it("la falta para otra fila se mide en el fondo, no en el ancho", () => {
    const a = con(30, 4);
    const b = con(6, 4);
    expect(a.faltaParaOtraFila).toBeCloseTo(b.faltaParaOtraFila, 9);
  });

  /** El límite verdadero: la falta nunca puede pasar de un pitch, porque más allá la fila ya
   * entró. Antes esta prueba exigía "menos de un metro", una cifra que solo valía para el
   * módulo con que la escribí: la banda muerta depende del módulo. */
  it("la falta nunca supera un pitch, con ningún fondo ni módulo", () => {
    for (const fondo of [2.5, 3, 4, 5, 6.4, 9, 12.7, 20]) {
      const r = con(20, fondo);
      expect(r.faltaParaOtraFila, `fondo ${fondo}`).toBeGreaterThanOrEqual(0);
      expect(r.faltaParaOtraFila, `fondo ${fondo}`).toBeLessThan(sp.pitch + 1e-9);
    }
  });

  it("dar ese fondo extra hace entrar la fila de verdad", () => {
    for (const fondo of [3, 4, 6.4, 9]) {
      const antes = con(20, fondo);
      const despues = con(20, fondo + antes.faltaParaOtraFila + 1e-6);
      expect(despues.rows, `fondo ${fondo}`).toBe(antes.rows + 1);
    }
  });

  it("un fondo menor que la huella reporta cuánto falta para la primera fila", () => {
    const r = con(20, 1);
    expect(r.rows).toBe(0);
    expect(r.faltaParaOtraFila).toBeCloseTo(sp.footprint - 1, 6);
  });
});

describe("estorbos y fragmentación", () => {
  const dims = panelDimensions(2.58);
  const sp = rowSpacing({ lat: 19.43, tilt: 24, panelLength: dims.length });
  const AREA = 36;
  const arma = (obstaculos: Obstacle[]) => {
    const sh = computeShading(AREA, 19.43, obstaculos, SITES.cdmx);
    return {
      sh,
      layout: placeModules({
        ancho: Math.sqrt(AREA), fondo: Math.sqrt(AREA), pitch: sp.pitch,
        footprint: sp.footprint, moduleWidth: dims.width, bloqueado: bloqueadoPorSombra(sh),
      }),
    };
  };

  it("un estorbo grande descarta posiciones y baja el conteo", () => {
    const limpio = arma([]);
    const conArbol = arma([
      { id: "a", kind: "arbol", height: 6, x: 3, y: 2, width: 3.5, depth: 3.5 },
    ]);
    expect(conArbol.layout.count).toBeLessThan(limpio.layout.count);
    expect(conArbol.layout.bloqueadas).toBeGreaterThan(0);
  });

  it("sin celdas inservibles no se construye predicado, y nada se descarta", () => {
    const sh = computeShading(AREA, 19.43, [], SITES.cdmx);
    expect(bloqueadoPorSombra(sh)).toBeUndefined();
  });

  /** El caso que el cálculo por área no ve: superficie libre suficiente, repartida de modo
   * que no cabe un módulo entero. Colocar de verdad sí lo nota. */
  it("cuenta menos módulos que el área libre sugiere cuando queda fragmentada", () => {
    const { sh, layout } = arma([
      { id: "a", kind: "pretil", height: 3, x: 3, y: 3, width: 5.5, depth: 0.4 },
    ]);
    const porArea = Math.floor(sh.areaUtil / 2.58);
    expect(layout.count).toBeLessThanOrEqual(porArea);
  });

  it("ningún módulo colocado cae sobre superficie inservible", () => {
    const { sh, layout } = arma([
      { id: "a", kind: "arbol", height: 5, x: 2, y: 2, width: 3, depth: 3 },
    ]);
    const pred = bloqueadoPorSombra(sh)!;
    // Un estorbo puede dejar el techo sin módulos —la prueba siguiente verifica justo eso—, y
    // entonces este bucle no recorrería nada y la prueba pasaría sin comprobar ninguna posición.
    expect(layout.modules.length).toBeGreaterThan(0);
    for (const m of layout.modules) {
      expect(pred(m.x, m.y, m.w, m.h), `módulo en ${m.x},${m.y}`).toBe(false);
    }
  });

  it("un estorbo que tapa todo deja el techo sin módulos", () => {
    const { layout } = arma([
      { id: "e", kind: "edificio", height: 20, x: 3, y: 0.3, width: 30, depth: 30 },
    ]);
    expect(layout.count).toBe(0);
    expect(layout.rows).toBe(0);
    expect(layout.perRow).toBe(0);
  });

  it("el mismo estorbo al norte descarta menos posiciones que al centro", () => {
    const lado = Math.sqrt(AREA);
    const centro = arma([
      { id: "t", kind: "tinaco", height: 2.5, x: lado / 2, y: lado / 2, width: 1.2, depth: 1.2 },
    ]);
    const norte = arma([
      { id: "t", kind: "tinaco", height: 2.5, x: lado / 2, y: lado - 0.4, width: 1.2, depth: 1.2 },
    ]);
    expect(norte.layout.count).toBeGreaterThanOrEqual(centro.layout.count);
  });
});


/**
 * La regla de descarte se evalúa POR MÓDULO promediando sus celdas, no celda por celda.
 * La primera versión bloqueaba si cualquier celda de medio metro pasaba el umbral, y por eso
 * un árbol de 5 m dejaba una azotea de 6 m en CERO módulos cuando en realidad quedan tres en
 * las esquinas despejadas. Un módulo mide más de dos metros: juzgarlo con una celda de medio
 * metro es más estricto que la práctica.
 */
describe("acceso solar evaluado por módulo", () => {
  const dims = panelDimensions(2.58);
  const sp = rowSpacing({ lat: 19.43, tilt: 24, panelLength: dims.length });
  const AREA = 36;

  const conArbol = () => {
    const sh = computeShading(AREA, 19.43, [
      { id: "a", kind: "arbol", height: 5, x: 3, y: 0.9, width: 3.5, depth: 3.5 },
    ], SITES.cdmx);
    return placeModules({
      ancho: Math.sqrt(AREA), fondo: Math.sqrt(AREA), pitch: sp.pitch,
      footprint: sp.footprint, moduleWidth: dims.width, bloqueado: bloqueadoPorSombra(sh),
    });
  };

  it("un árbol grande deja módulos en las esquinas libres, no cero", () => {
    const r = conArbol();
    expect(r.count).toBeGreaterThan(0);
    expect(r.bloqueadas).toBeGreaterThan(0);
  });

  it("los módulos que quedan están al norte, lejos del árbol del sur", () => {
    const r = conArbol();
    const yMin = Math.min(...r.modules.map((m) => m.y));
    expect(yMin).toBeGreaterThan(0);
  });

  /** La segunda condición sí es celda por celda: una esquina con sombra sostenida arrastra a
   * la cadena aunque el promedio del módulo salga aceptable, y promediarla lo esconderÍa. */
  it("una esquina con sombra sostenida descarta la posición aunque el promedio pase", () => {
    const fraccionAlta = SOMBRA_CRITICA + 0.15;
    const fake = {
      loss: 0, areaLibre: 0, lado: 6, areaUtil: 36,
      libres: [],
      sombreadas: [{ celda: { x: 0.25, y: 0.25 }, fraccion: fraccionAlta }],
    };
    const pred = bloqueadoPorSombra(fake)!;
    // el módulo cubre muchas celdas limpias y solo esa mala: el promedio pasaría
    expect(pred(0, 0, dims.width, sp.footprint)).toBe(true);
    // y una posición que no la toca sigue siendo válida
    expect(pred(3, 3, dims.width, sp.footprint)).toBe(false);
  });

  it("el umbral crítico es más severo que el de inservible, no al revés", () => {
    expect(SOMBRA_CRITICA).toBeGreaterThan(0.25);
    expect(SOMBRA_CRITICA).toBeLessThan(1);
  });
});
