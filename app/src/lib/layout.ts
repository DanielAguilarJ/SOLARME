import { CELDA_M, UMBRAL_INSERVIBLE, type ShadingResult } from "./shading";
import { rectanguloDentro, type Punto } from "./polygon";

/**
 * Colocación real de los módulos sobre el techo.
 *
 * Antes el número de módulos salía de dividir área entre área. Eso funciona en un techo
 * limpio, pero con un estorbo en medio sobrestima: la superficie libre puede quedar
 * FRAGMENTADA en pedazos donde no cabe un módulo entero, y dividir no lo nota. Un tinaco
 * al centro de una azotea angosta puede dejar 20 m² libres repartidos en dos franjas de
 * 1 m: el área dice que caben diez módulos y la realidad dice ninguno.
 *
 * Colocar de verdad resuelve eso y además hace honesto el dibujo: el plano muestra los
 * mismos módulos que se cotizan, en las mismas posiciones, en lugar de una rejilla
 * decorativa que podría quedar encima del tinaco.
 *
 * Las filas avanzan de sur a norte porque la fila delantera es la del sur: así ninguna
 * sombrea a la de atrás, que es la premisa de todo el cálculo de pasillo.
 */

export interface ModuleRect {
  /** Metros desde la orilla poniente. */
  x: number;
  /** Metros desde la orilla sur. */
  y: number;
  /** Ancho ocupado, en metros. */
  w: number;
  /** Profundidad ocupada en planta, en metros (la proyección del módulo inclinado). */
  h: number;
  row: number;
  col: number;
}

export interface LayoutResult {
  modules: ModuleRect[];
  count: number;
  /** Filas que llegaron a tener al menos un módulo. */
  rows: number;
  /** Módulos de la fila más poblada. */
  perRow: number;
  /** Posiciones descartadas por caer sobre superficie inservible. */
  bloqueadas: number;
  /** Ancho oriente-poniente usado, en metros. */
  ancho: number;
  /** Fondo norte-sur usado, en metros: el eje que decide cuántas filas caben. */
  fondo: number;
  /** Metros de fondo norte-sur que faltan para que entre una fila más.
   *
   * Existe porque la relación entre fondo y pitch tiene bandas muertas: con el módulo típico
   * en CDMX, una azotea de 2 m de fondo y una de 4 m caben la MISMA fila, así que esos dos
   * metros extra no aportan nada hasta llegar a 4.16 m. Un instalador que sabe que le faltan
   * 16 cm puede recorrer el arreglo o negociar el pretil; sin saberlo, deja una fila en la
   * mesa sin enterarse. */
  faltaParaOtraFila: number;
}

export interface PlaceInput {
  /** Ancho oriente-poniente de la caja envolvente, en metros. */
  ancho: number;
  /** Fondo norte-sur de la caja envolvente, en metros. Es el eje que decide las filas, y por
   * eso NO puede compartirse con el ancho: una azotea de 6.75 × 4 tiene fondo 4, y usar 6.75
   * en los dos ejes daba un conteo de filas que no correspondía a ninguna azotea real. */
  fondo: number;
  /** Borde delantero a borde delantero, en metros. */
  pitch: number;
  /** Proyección en planta del módulo inclinado, en metros. */
  footprint: number;
  /** Ancho del módulo, en metros. */
  moduleWidth: number;
  /**
   * Tope voluntario del arreglo: como máximo estas filas y estos módulos por fila.
   *
   * Existe porque el ajuste al consumo puede pedir menos módulos de los que caben —un tercio del
   * arreglo llega a no desplazar ninguna compra a CFE— y la única palanca era el área, que encoge
   * las dos dimensiones a la vez y salta a tramos. Con el tope el instalador deja el techo como
   * está y simplemente no lo llena.
   *
   * Se topa por FILAS y COLUMNAS, no por número total, porque así se monta: rieles completos y
   * filas iguales. Un tope de 32 a secas dejaría una fila a medias.
   */
  tope?: { filas: number; columnas: number };
  /** Devuelve `true` si esa superficie no sirve para montar. */
  bloqueado?: (x: number, y: number, w: number, h: number) => boolean;
  /** Contorno real del techo. Un módulo tiene que caber COMPLETO adentro: con solo el centro
   * dentro quedaría medio módulo volando fuera de la azotea. */
  outline?: Punto[];
}

export function placeModules({
  ancho, fondo, pitch, footprint, moduleWidth, bloqueado, outline, tope,
}: PlaceInput): LayoutResult {
  const modules: ModuleRect[] = [];
  let bloqueadas = 0;

  if (ancho <= 0 || fondo <= 0 || pitch <= 0 || moduleWidth <= 0 || footprint <= 0) {
    return {
      modules, count: 0, rows: 0, perRow: 0, bloqueadas: 0, ancho, fondo,
      faltaParaOtraFila: Math.max(0, footprint - Math.max(0, fondo)),
    };
  }

  const porFila = new Map<number, number>();
  let fila = 0;

  // Igual que `panelsWithSpacing`: caben filas mientras la HUELLA entre, no el pitch, y en
  // cada fila caben módulos mientras el ancho entre. Sobre un techo limpio esto reproduce
  // exactamente aquel cálculo; la diferencia aparece solo cuando hay estorbos.
  for (let y = 0; y + footprint <= fondo + 1e-9; y += pitch, fila++) {
    // El tope corta por índice de fila y de columna, no por total colocado: si una posición se
    // pierde por sombra o por el contorno, la fila queda con menos, no se rellena por otro lado.
    if (tope && fila >= tope.filas) break;
    let col = 0;
    for (let x = 0; x + moduleWidth <= ancho + 1e-9; x += moduleWidth, col++) {
      if (tope && col >= tope.columnas) break;
      if (outline && !rectanguloDentro(x, y, moduleWidth, footprint, outline)) {
        continue; // fuera del techo: no es una posición descartada, no existe
      }
      if (bloqueado?.(x, y, moduleWidth, footprint)) {
        bloqueadas++;
        continue;
      }
      modules.push({ x, y, w: moduleWidth, h: footprint, row: fila, col });
      porFila.set(fila, (porFila.get(fila) ?? 0) + 1);
    }
  }

  // filas que CABEN por geometría, aunque la sombra o el contorno las hayan vaciado
  const filasGeometricas = fondo + 1e-9 >= footprint
    ? Math.floor((fondo - footprint) / pitch) + 1
    : 0;
  const fondoParaUnaMas = footprint + filasGeometricas * pitch;

  return {
    modules,
    count: modules.length,
    rows: porFila.size,
    perRow: porFila.size > 0 ? Math.max(...porFila.values()) : 0,
    bloqueadas,
    ancho,
    fondo,
    faltaParaOtraFila: Math.max(0, fondoParaUnaMas - fondo),
  };
}

/** Sombra sostenida a partir de la cual una esquina sí arrastra a la cadena entera, aunque
 * el resto del módulo esté despejado. */
export const SOMBRA_CRITICA = 0.6;

/**
 * Predicado de superficie inservible a partir del cálculo de sombra.
 *
 * Se evalúa el acceso solar POR MÓDULO, promediando las celdas que ocupa, porque así se
 * evalúa en obra: un módulo mide más de dos metros y medir su viabilidad con una celda de
 * medio metro es más estricto que la práctica y descarta posiciones que sí sirven. La
 * primera versión bloqueaba si cualquier celda pasaba el umbral y dejaba en cero techos
 * que en realidad admiten varios módulos.
 *
 * Se conserva una segunda condición: una esquina con sombra sostenida por encima de
 * `SOMBRA_CRITICA` descarta la posición aunque el promedio salga bien. Eso sí arrastra a la
 * cadena, y promediarlo lo esconderÍa.
 */
export function bloqueadoPorSombra(shading: ShadingResult) {
  const fraccion = new Map<string, number>();
  for (const s of shading.sombreadas) {
    fraccion.set(
      `${Math.floor(s.celda.x / CELDA_M)},${Math.floor(s.celda.y / CELDA_M)}`,
      s.fraccion,
    );
  }
  if (fraccion.size === 0) return undefined;

  return (x: number, y: number, w: number, h: number): boolean => {
    const i0 = Math.floor(x / CELDA_M);
    const i1 = Math.floor((x + w - 1e-9) / CELDA_M);
    const j0 = Math.floor(y / CELDA_M);
    const j1 = Math.floor((y + h - 1e-9) / CELDA_M);
    let suma = 0;
    let celdas = 0;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const f = fraccion.get(`${i},${j}`) ?? 0;
        if (f > SOMBRA_CRITICA) return true;
        suma += f;
        celdas++;
      }
    }
    return celdas > 0 && suma / celdas > UMBRAL_INSERVIBLE;
  };
}
