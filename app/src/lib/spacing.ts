/**
 * Geometría de autosombreado entre filas de módulos.
 *
 * Fuente: investigación profunda 2026-08-23 (research/02-deep-research-perplexity.md).
 * El caso de diseño es el solsticio de invierno al mediodía solar (21 de diciembre), que
 * es el peor momento del año: el sol alcanza su elevación mínima al mediodía. Si no hay
 * sombra entre filas ese día a esa hora, no la hay el resto del año a esa hora.
 */

/** Declinación solar en el solsticio de invierno, en grados. */
const WINTER_DECLINATION = 23.45;

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface SpacingInput {
  /** Latitud del sitio en grados (positiva al norte). */
  lat: number;
  /** Inclinación de la estructura respecto a la horizontal, en grados. */
  tilt: number;
  /** Largo del módulo en el sentido de la inclinación, en metros. */
  panelLength: number;
}

export interface SpacingResult {
  /** Elevación solar de diseño al mediodía del solsticio de invierno, en grados. */
  sunElevation: number;
  /** Altura vertical que gana la fila por la inclinación, en metros. */
  rowHeight: number;
  /** Separación libre mínima entre filas, en metros. */
  gap: number;
  /** Pitch total de fila: borde delantero a borde delantero, en metros. */
  pitch: number;
  /** Proyección horizontal que ocupa el módulo inclinado, en metros. */
  footprint: number;
  /** Fracción del techo aprovechable una vez descontados los pasillos (0–1). */
  packing: number;
}

/**
 * Calcula la separación entre filas necesaria para evitar autosombreado.
 *
 *   H = L · sin(β)
 *   α = 90° − φ − 23.45°
 *   D = H / tan(α)
 *   P = D + W · cos(β)
 *
 * A latitudes altas α se vuelve pequeño y D crece rápido, por eso en el norte del país
 * las filas necesitan mucho más pasillo que en el sur.
 */
export function rowSpacing({ lat, tilt, panelLength }: SpacingInput): SpacingResult {
  const sunElevation = 90 - Math.abs(lat) - WINTER_DECLINATION;
  const rowHeight = panelLength * Math.sin(rad(tilt));
  const footprint = panelLength * Math.cos(rad(tilt));

  // Con el sol en el horizonte o por debajo la sombra es infinita: no hay solución física.
  // Ocurre por encima de ~66.5° de latitud, fuera del alcance de México, pero se acota
  // para que la interfaz nunca reciba Infinity ni NaN.
  const safeElevation = Math.max(sunElevation, 5);
  const gap = rowHeight / Math.tan(rad(safeElevation));

  const pitch = gap + footprint;
  const packing = pitch > 0 ? footprint / pitch : 0;

  return {
    sunElevation: round(sunElevation, 1),
    rowHeight: round(rowHeight, 2),
    gap: round(gap, 2),
    pitch: round(pitch, 2),
    footprint: round(footprint, 2),
    packing: round(packing, 3),
  };
}

/**
 * Módulos que caben en un techo plano respetando el pasillo antisombra.
 *
 * A diferencia de una estimación por área, este cálculo es direccional: las filas se
 * separan en el eje norte-sur y se empaquetan sin holgura en el eje este-oeste, que es
 * como se montan en obra.
 */
export function panelsWithSpacing(
  area: number,
  panelWidth: number,
  spacing: SpacingResult,
): { count: number; rows: number; perRow: number } {
  // Techo aproximado como cuadrado: sin la huella real del edificio es la hipótesis
  // menos comprometida. Con Google Solar API esto se sustituye por el polígono real.
  const side = Math.sqrt(Math.max(area, 0));

  // La última fila NO necesita pasillo detrás: el pasillo existe para que una fila no
  // sombree a la siguiente, y la fila más al norte no tiene ninguna detrás. Usar
  // `floor(lado / pitch)` reservaba un pasillo para ella y perdía una fila entera. En una
  // azotea de 30 m² eso daba 4 módulos cuando caben 8: la mitad del sistema.
  const rows = side + 1e-9 >= spacing.footprint
    ? Math.floor((side - spacing.footprint) / spacing.pitch) + 1
    : 0;
  const perRow = Math.max(0, Math.floor(side / panelWidth));

  return { count: rows * perRow, rows, perRow };
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
