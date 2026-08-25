import type { Site } from "./site";
import type { Panel } from "./solar";

/**
 * Calibre del conductor y caída de tensión de un circuito de string.
 *
 * Es el otro cálculo cuyo error no da una cifra imprecisa: un conductor chico en una tubería sobre
 * azotea en Mexicali se calienta hasta fallar el aislamiento. Y es específico del sitio de una
 * manera que sorprende: la norma obliga a sumar 22 °C al aire ambiente cuando la tubería va sobre
 * la azotea, así que la temperatura de diseño en Mexicali (50.3 °C medidos) llega a 72 °C y el
 * conductor pierde la mitad de su capacidad.
 *
 * PROCEDENCIA. Todo lo normativo de aquí se verificó contra fuentes independientes, no de memoria:
 *
 *  - Criterio de corriente: NEC 690.8(A)(1) fija la corriente máxima del circuito en 125 % de Isc,
 *    y 690.8(B)(1) exige que el conductor tenga ampacidad de al menos 125 % de ESA corriente. El
 *    producto es 1.5625. Aquí las fuentes DISCREPAN: una guía comercial aplica el 1.25 una sola
 *    vez, mientras que ECM Web, Electrical License Renewal y ExpertCE aplican los dos factores.
 *    Se usa 1.56 porque son tres fuentes contra una y porque el lado conservador pide MÁS cobre:
 *    equivocarse hacia abajo en un conductor es un incendio.
 *  - Factores de corrección por temperatura para conductores de 90 °C: NEC Tabla 310.15(B)(1)(1).
 *  - Factores de agrupamiento: NEC Tabla 310.15(C)(1).
 *  - Adder de azotea de 22 °C: NEC 310.15(B)(3)(c), aplicable a tubería dentro de 18 cm de la
 *    superficie del techo.
 *  - Ampacidades: NEC Tabla 310.16, columna de 90 °C, cobre. Los valores de 12 AWG (30 A) y
 *    10 AWG (40 A) se corroboraron directamente en la fuente consultada; el resto pertenece a la
 *    misma columna de esa tabla.
 *  - Resistividad del cobre: 16.78 nΩ·m a 20 °C.
 *
 * NOM-001-SEDE reproduce la estructura del NEC en estos capítulos, pero NO se verificó el texto
 * mexicano directamente: las copias que aparecen en línea están en repositorios de pago. La
 * interfaz lo dice, para que nadie firme un plano suponiendo que esto es la norma mexicana citada.
 */

/** Corriente de irradiancia × carga continua. Ver la nota de procedencia. */
export const FACTOR_CORRIENTE = 1.5625;

/** Grados que la norma obliga a sumar cuando la tubería va sobre la azotea. */
export const ADDER_AZOTEA = 22;

/** Resistividad del cobre a 20 °C, en ohm·mm²/m. */
export const RHO_COBRE = 0.01678;

/** Cobre, columna de 90 °C de la tabla 310.16, y sección transversal para la caída de tensión. */
export interface Calibre {
  nombre: string;
  /** Ampacidad de tabla, en amperes, antes de correcciones. */
  amp: number;
  /** Sección transversal, en mm². */
  mm2: number;
}

export const CALIBRES: Calibre[] = [
  { nombre: "14 AWG", amp: 25, mm2: 2.08 },
  { nombre: "12 AWG", amp: 30, mm2: 3.31 },
  { nombre: "10 AWG", amp: 40, mm2: 5.26 },
  { nombre: "8 AWG", amp: 55, mm2: 8.37 },
  { nombre: "6 AWG", amp: 75, mm2: 13.3 },
  { nombre: "4 AWG", amp: 95, mm2: 21.2 },
  { nombre: "2 AWG", amp: 130, mm2: 33.6 },
  { nombre: "1/0 AWG", amp: 170, mm2: 53.5 },
  { nombre: "2/0 AWG", amp: 195, mm2: 67.4 },
  { nombre: "4/0 AWG", amp: 260, mm2: 107.2 },
];

/** Tabla 310.15(B)(1)(1): bandas de temperatura ambiente y su factor, para conductores de 90 °C. */
const CORRECCION_TEMP: Array<[limite: number, factor: number]> = [
  [25, 1.04], [30, 1.0], [35, 0.96], [40, 0.91], [45, 0.87], [50, 0.82],
  [55, 0.76], [60, 0.71], [65, 0.65], [70, 0.58], [75, 0.5],
];

/** Tabla 310.15(C)(1): conductores portadores de corriente por tubería y su factor. */
const AJUSTE_AGRUPAMIENTO: Array<[hasta: number, factor: number]> = [
  [3, 1.0], [6, 0.8], [9, 0.7], [20, 0.5], [30, 0.45], [40, 0.4],
];

/** Factor de corrección por temperatura. Sobre 75 °C la tabla se agota: no hay conductor válido. */
export function correccionTemperatura(tAmbiente: number): number | null {
  for (const [limite, factor] of CORRECCION_TEMP) if (tAmbiente <= limite) return factor;
  return null;
}

export function ajusteAgrupamiento(conductores: number): number {
  for (const [hasta, factor] of AJUSTE_AGRUPAMIENTO) if (conductores <= hasta) return factor;
  return 0.35;
}

export interface Circuito {
  /** Corriente de corto circuito del módulo, en amperes. */
  isc: number;
  /** Longitud de UNA vía, en metros. La caída usa ida y vuelta. */
  metros: number;
  /** Voltaje del string en el punto de máxima potencia, para expresar la caída en porcentaje. */
  vString: number;
  /** Conductores portadores de corriente en la misma tubería. Cada circuito aporta dos. */
  conductores: number;
  /** Verdadero si la tubería va sobre la azotea: suma el adder de 22 °C. */
  sobreAzotea: boolean;
}

export interface Resultado {
  /** Temperatura de diseño usada, en grados: aire máximo medido más el adder si aplica. */
  tDiseno: number;
  /** Factor de temperatura, o null si la temperatura excede la tabla. */
  fTemp: number | null;
  fAgrup: number;
  /** Corriente de diseño, en amperes: Isc × 1.5625. */
  iDiseno: number;
  /** Ampacidad de tabla mínima que debe tener el conductor, en amperes. */
  ampRequerida: number;
  /** Calibre elegido: el más chico que cumple ampacidad Y caída de tensión. */
  calibre: Calibre | null;
  /** Calibre que bastaría solo por ampacidad, para mostrar si la caída fue lo que manda. */
  calibrePorAmpacidad: Calibre | null;
  /** Caída de tensión del calibre elegido, en porcentaje del voltaje del string. */
  caida: number;
  /** Qué criterio determinó el calibre. */
  manda: "ampacidad" | "caida" | "ninguno";
  /** Motivo cuando no hay calibre viable. */
  motivo?: string;
}

/** Límite de caída de tensión en el circuito de corriente directa, en porcentaje. */
export const LIMITE_CAIDA = 2;

/** Caída de tensión de ida y vuelta, en porcentaje del voltaje del string. */
export function caidaTension(isc: number, metros: number, mm2: number, vString: number) {
  if (vString <= 0) return Infinity;
  // Dos por la longitud: la corriente va y vuelve por conductores distintos.
  const deltaV = (2 * RHO_COBRE * metros * isc) / mm2;
  return (deltaV / vString) * 100;
}

/**
 * Dimensiona el conductor de un circuito.
 *
 * Sin sitio medido no se calcula: la temperatura de diseño es el aire máximo del lugar y suponerla
 * es lo que produce el conductor chico. Misma regla que el dimensionado de series.
 */
export function dimensionarConductor(c: Circuito, site?: Site): Resultado {
  const vacio: Resultado = {
    tDiseno: NaN, fTemp: null, fAgrup: 1, iDiseno: 0, ampRequerida: 0,
    calibre: null, calibrePorAmpacidad: null, caida: 0, manda: "ninguno",
    motivo: "hace falta la temperatura máxima medida del sitio",
  };
  if (!site || site.tMaxAbs === undefined) return vacio;

  const tDiseno = site.tMaxAbs + (c.sobreAzotea ? ADDER_AZOTEA : 0);
  const fTemp = correccionTemperatura(tDiseno);
  const fAgrup = ajusteAgrupamiento(c.conductores);
  const iDiseno = c.isc * FACTOR_CORRIENTE;

  if (fTemp === null) {
    return {
      ...vacio, tDiseno, fAgrup, iDiseno,
      motivo: `${Math.round(tDiseno)} °C excede la tabla de corrección: baja la tubería del techo o ventílala`,
    };
  }

  const ampRequerida = iDiseno / (fTemp * fAgrup);
  const porAmpacidad = CALIBRES.find((k) => k.amp >= ampRequerida) ?? null;
  // El calibre final tiene que cumplir las DOS cosas: capacidad de corriente y caída de tensión.
  const elegido = CALIBRES.find(
    (k) => k.amp >= ampRequerida && caidaTension(c.isc, c.metros, k.mm2, c.vString) <= LIMITE_CAIDA
  ) ?? null;

  if (!elegido) {
    return {
      tDiseno, fTemp, fAgrup, iDiseno, ampRequerida,
      calibre: null, calibrePorAmpacidad: porAmpacidad, caida: 0, manda: "ninguno",
      motivo: porAmpacidad
        ? `ni el conductor más grande de la tabla mantiene la caída bajo ${LIMITE_CAIDA} % a ${c.metros} m`
        : `${ampRequerida.toFixed(0)} A excede la tabla: divide el circuito`,
    };
  }

  return {
    tDiseno, fTemp, fAgrup, iDiseno, ampRequerida,
    calibre: elegido,
    calibrePorAmpacidad: porAmpacidad,
    caida: caidaTension(c.isc, c.metros, elegido.mm2, c.vString),
    manda: porAmpacidad && elegido.nombre !== porAmpacidad.nombre ? "caida" : "ampacidad",
  };
}

/** Circuito de un proyecto: la Isc del módulo y el voltaje de la serie propuesta. */
export function circuitoDe(panel: Panel, vString: number, metros: number, circuitos: number, sobreAzotea = true): Circuito {
  return {
    isc: panel.isc,
    metros,
    vString,
    // Cada circuito aporta dos conductores portadores de corriente: positivo y negativo.
    conductores: Math.max(2, circuitos * 2),
    sobreAzotea,
  };
}
