import {
  FACTOR_CORRIENTE, CALIBRES, caidaTension, LIMITE_CAIDA,
  dimensionarConductor, type Circuito, type Resultado as Conductor,
} from "./conductor";
import type { Site } from "./site";

/**
 * Protección contra sobrecorriente del circuito de string.
 *
 * Por qué va aquí y no en el conductor: la protección tiene que cumplir DOS condiciones que
 * empujan en sentidos opuestos. Por abajo, no puede abrir con la corriente normal del arreglo, así
 * que debe superar la misma corriente de diseño del conductor (NEC 690.9(B), el mismo 1.5625 de
 * Isc). Por arriba, no puede exceder la ampacidad ya corregida del conductor que protege, porque
 * entonces el cable se calienta sin que nada actúe. Cuando no existe un valor comercial entre las
 * dos, el problema no es la protección: es que el conductor está justo, y hay que subirlo.
 *
 * PROCEDENCIA. Los valores comerciales son los de NEC 240.6(A), que es una lista cerrada: no se
 * puede «elegir 33 A». El criterio de corriente es el mismo verificado para el conductor.
 * NOM-001-SEDE reproduce esta estructura; su texto no se consultó directamente.
 */

/** Valores comerciales de fusible o interruptor, en amperes (NEC 240.6(A)). */
export const VALORES_COMERCIALES = [
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200,
  225, 250, 300, 350, 400,
];

export interface Proteccion {
  /** Mínimo que debe soportar sin abrir, en amperes: la corriente de diseño. */
  minimo: number;
  /** Máximo permitido, en amperes: la ampacidad ya corregida del conductor. */
  maximo: number;
  /** Valor comercial elegido, o null si no cabe ninguno entre el mínimo y el máximo. */
  valor: number | null;
  /** Holgura sobre el mínimo, en por ciento. */
  holgura: number;
  motivo?: string;
}

/**
 * Elige la protección de un circuito a partir del conductor ya dimensionado.
 *
 * Se toma el valor comercial más CHICO que supere el mínimo, no el más grande que quepa: una
 * protección sobredimensionada cumple la tabla y no protege nada.
 */
export function dimensionarProteccion(isc: number, cond: Conductor): Proteccion {
  const vacio: Proteccion = {
    minimo: 0, maximo: 0, valor: null, holgura: 0,
    motivo: "hace falta el conductor dimensionado",
  };
  if (!cond.calibre || cond.fTemp === null) return vacio;

  const minimo = isc * FACTOR_CORRIENTE;
  // La ampacidad que el conductor realmente tiene en estas condiciones, no la de tabla.
  const maximo = cond.calibre.amp * cond.fTemp * cond.fAgrup;

  const valor = VALORES_COMERCIALES.find((v) => v >= minimo && v <= maximo) ?? null;
  if (valor === null) {
    const siguiente = VALORES_COMERCIALES.find((v) => v >= minimo);
    return {
      minimo, maximo, valor: null, holgura: 0,
      motivo: siguiente
        ? `el valor comercial siguiente (${siguiente} A) excede lo que el conductor aguanta corregido (${maximo.toFixed(0)} A): sube un calibre`
        : `${minimo.toFixed(0)} A supera la lista de valores comerciales: divide el circuito`,
    };
  }

  return { minimo, maximo, valor, holgura: ((valor - minimo) / minimo) * 100 };
}


/**
 * Circuito completo: conductor Y protección que funcionan juntos.
 *
 * Hace falta porque el conductor que apenas cumple ampacidad puede no admitir ningún fusible
 * conforme. Caso real, medido: en Mexicali un string de 13.5 A con seis conductores sobre azotea
 * necesita 52.7 A de tabla, lo que da 8 AWG; pero ese 8 AWG corregido solo aguanta 22.0 A y el
 * siguiente valor comercial sobre la corriente de diseño (21.1 A) es 25 A, que lo excede. La
 * solución no es forzar el fusible: es subir a 6 AWG, que corregido llega a 30 A y sí admite 25 A.
 *
 * Se sube el calibre en vez de aplicar la excepción del «siguiente valor comercial superior»
 * porque esa excepción es justo el tipo de matiz normativo donde ya se comprobó que las fuentes
 * discrepan, y subir cobre siempre es el lado seguro.
 */
export interface Circuito2 {
  /** Metros de una vía con los que se calculó. Se guardan aquí para que nadie los re-derive:
   * la propuesta imprimía los del diseño mientras el cálculo usaba otros. */
  metros: number;
  conductor: Conductor;
  proteccion: Proteccion;
  /** Verdadero si hubo que subir el calibre por encima de lo que pedía la ampacidad. */
  subidoPorProteccion: boolean;
  /** Calibre que habría bastado solo por ampacidad y caída, para poder explicarlo. */
  calibreMinimo?: string;
}

export function dimensionarCircuito(c: Circuito, site?: Site): Circuito2 {
  const base = dimensionarConductor(c, site);
  if (!base.calibre || base.fTemp === null) {
    return { metros: c.metros, conductor: base, proteccion: dimensionarProteccion(c.isc, base), subidoPorProteccion: false };
  }

  const desde = CALIBRES.findIndex((k) => k.nombre === base.calibre!.nombre);
  for (let i = desde; i < CALIBRES.length; i++) {
    const k = CALIBRES[i];
    if (caidaTension(c.isc, c.metros, k.mm2, c.vString) > LIMITE_CAIDA) continue;
    const cond: Conductor = {
      ...base,
      calibre: k,
      caida: caidaTension(c.isc, c.metros, k.mm2, c.vString),
      // El criterio se conserva: la razón de haber SUBIDO la lleva `subidoPorProteccion`.
      // Marcarlo como "caida" aquí hacía que la interfaz diera dos razones contradictorias.
      manda: base.manda,
    };
    const p = dimensionarProteccion(c.isc, cond);
    if (p.valor !== null) {
      return {
        metros: c.metros,
        conductor: cond,
        proteccion: p,
        subidoPorProteccion: i > desde,
        calibreMinimo: base.calibre.nombre,
      };
    }
  }

  return {
    metros: c.metros,
    conductor: base,
    proteccion: {
      ...dimensionarProteccion(c.isc, base),
      motivo: "ningún calibre de la tabla admite una protección conforme: divide el circuito en más strings",
    },
    subidoPorProteccion: false,
    calibreMinimo: base.calibre.nombre,
  };
}
