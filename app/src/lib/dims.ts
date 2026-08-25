/**
 * Dimensiones de módulo y ajuste al techo real.
 *
 * EL DEFECTO QUE CORRIGE
 * ----------------------
 * `solar.ts` tenía dos constantes:
 *
 *     const PANEL_LENGTH = 2.28;
 *     const PANEL_WIDTH  = 1.13;
 *
 * y las aplicaba a los 140 módulos del catálogo. La geometría antisombra calculaba el pasillo
 * suponiendo un módulo de 2.28 m de largo incluso para uno de 420 W, que mide ~1.76 m. Eso
 * sobrestima el pasillo y por tanto subestima cuántos caben. Peor: `panelCount` sí usaba el
 * área real del módulo, así que las dos estimaciones que `compute` compara eran inconsistentes
 * y para módulos chicos ganaba la equivocada.
 *
 * El defecto estaba enmascarado mientras el catálogo era todo de 710-740 W —ahí las constantes
 * eran aproximadamente ciertas—. Al ampliar el catálogo a 400-740 W quedó al descubierto.
 *
 * POR QUÉ SE DERIVA Y NO SE MIDE
 * ------------------------------
 * La base CEC publica el área (`A_c`) pero no el largo ni el ancho. El ancho de un módulo de
 * silicio no es libre: lo fija el formato de celda. Seis columnas de celdas de 182 mm dan
 * ~1.134 m; de 210 mm (formato G12) dan ~1.30 m. Así que el ancho se infiere del área y el
 * largo se deriva dividiendo. Es una inferencia, no un dato de placa, y está acotada.
 */
import { rowSpacing, panelsWithSpacing } from "./spacing";
import type { Site } from "./site";

/** Ancho de un módulo de 6 columnas con celdas de 182 mm. */
const WIDTH_M10 = 1.134;
/** Ancho de un módulo de 6 columnas con celdas de 210 mm (G12). */
const WIDTH_G12 = 1.303;
/** A partir de esta área el formato es G12: por debajo no existen módulos de 210 mm. */
const G12_AREA_THRESHOLD = 3.0;

/** Largos plausibles de un módulo comercial actual, para acotar la inferencia. */
const MIN_LENGTH = 1.4;
const MAX_LENGTH = 2.6;

export interface PanelDims {
  width: number;
  length: number;
  /** `true` cuando el largo salió del área sin recorte; `false` si hubo que acotarlo. */
  exact: boolean;
}

export function panelDimensions(area: number): PanelDims {
  const width = area >= G12_AREA_THRESHOLD ? WIDTH_G12 : WIDTH_M10;
  const raw = area > 0 ? area / width : MIN_LENGTH;
  const length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, raw));
  return { width, length, exact: raw === length };
}

/**
 * Lo que hace falta del techo para saber qué módulo le conviene. Es un subconjunto de
 * `Design`: el ajuste no depende del tipo de proyecto ni del recibo.
 */
export interface Roof {
  area: number;
  /** Física medida del sitio. Sin ella el ajuste usa las fórmulas de respaldo. */
  site?: Site;
  lat: number;
  tilt: number;
  az: number;
  shade: number;
  yield: number;
}

export interface PanelFit {
  /** Módulos que caben de verdad, ya descontado el pasillo antisombra. */
  count: number;
  kwp: number;
  /** Producción anual estimada de ESTE módulo en ESTE techo. */
  kwh: number;
  rows: number;
  perRow: number;
  /** Pasillo requerido por el largo real de este módulo. */
  gap: number;
  /** Costo del lote de módulos, en MXN. */
  moduleCost: number;
  /** MXN de módulo por kWh anual entregado: la cifra que de verdad compara opciones. */
  mxnPerKwh: number;
}


/**
 * Cuánto entrega un módulo concreto en un techo concreto.
 *
 * Esto es lo que sustituye al eje de "potencia" en el recomendador. Premiar los watts de placa
 * daba por bueno que más grande es mejor, y en un techo real no lo es: un módulo largo proyecta
 * más sombra, exige más pasillo y caben menos filas. Medido sobre 60 m² en Monterrey, el módulo
 * de 400 W entrega 10,588 kWh/año y el de 540 W solo 9,529: dieciocho chicos rinden más que doce
 * medianos. La única forma honesta de comparar es calcularlo.
 *
 * Se importa desde solar.ts para no duplicar la física; las pérdidas y el factor de orientación
 * son los mismos que usa `compute`.
 */
export function panelFit(
  panel: { w: number; area: number; ppw: number },
  roof: Roof,
  physics: {
    panelCount: (area: number, p: { area: number }) => number;
    orientationFactor: (tilt: number, az: number, lat: number, site?: Site) => number;
    loss: number;
  }
): PanelFit {
  const dims = panelDimensions(panel.area);
  const spacing = rowSpacing({ lat: roof.lat, tilt: roof.tilt, panelLength: dims.length });
  const byArea = physics.panelCount(roof.area, panel);
  const byGeometry = panelsWithSpacing(roof.area, dims.width, spacing);
  const count = Math.min(byArea, byGeometry.count);

  const kwp = (count * panel.w) / 1000;
  const of = physics.orientationFactor(roof.tilt, roof.az, roof.lat, roof.site);
  const kwh = kwp * roof.yield * of * (1 - roof.shade / 100) * (1 - physics.loss);
  const moduleCost = panel.ppw * count * panel.w;

  return {
    count,
    kwp,
    kwh,
    rows: byGeometry.rows,
    perRow: byGeometry.perRow,
    gap: spacing.gap,
    moduleCost,
    // Sin energía no hay razón que comparar: se devuelve Infinity para que quede último.
    mxnPerKwh: kwh > 0 ? moduleCost / kwh : Infinity,
  };
}
