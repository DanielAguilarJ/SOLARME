import type { Panel } from "./solar";
import type { Site } from "./site";

/**
 * Dimensionado de strings: cuántos módulos van en serie y cuántas series.
 *
 * Es el cálculo que faltaba para que una propuesta sea instalable. La app ya decía qué módulo
 * y cuántos caben; sin esto no decía cómo conectarlos, y ahí está el modo de falla que rompe
 * equipo: el voltaje de circuito abierto SUBE cuando baja la temperatura, porque `betaVoc` es
 * negativo. Un string dimensionado con la temperatura promedio puede rebasar el voltaje máximo
 * del inversor la primera mañana fría del año.
 *
 * Por eso el cálculo usa el EXTREMO medido de cada sitio y no un promedio: −10.0 °C en Ciudad
 * Juárez contra +11.9 °C en Valladolid es más de un módulo de diferencia por string en el mismo
 * inversor. Un calculador genérico no lo distingue.
 */

export interface Ventana {
  clave: "res600" | "com1000" | "ind1500";
  etiqueta: string;
  /** Voltaje máximo de entrada en corriente directa. Rebasarlo destruye el inversor. */
  vMax: number;
  /** Voltaje mínimo al que el seguidor de punto máximo arranca. Por debajo no genera. */
  vMpptMin: number;
  /** Tope de la ventana de seguimiento: arriba de esto sigue operando pero fuera del óptimo. */
  vMpptMax: number;
}

/** Ventanas típicas del equipo que se vende en México. No son de un modelo concreto: son la
 * clase de inversor que corresponde a cada tamaño de proyecto, y la interfaz lo declara para
 * que el instalador sustituya la del inversor que de verdad va a usar. */
export const VENTANAS: Ventana[] = [
  { clave: "res600", etiqueta: "Residencial 600 V", vMax: 600, vMpptMin: 80, vMpptMax: 550 },
  { clave: "com1000", etiqueta: "Comercial 1000 V", vMax: 1000, vMpptMin: 200, vMpptMax: 950 },
  { clave: "ind1500", etiqueta: "Industrial 1500 V", vMax: 1500, vMpptMin: 500, vMpptMax: 1450 },
];

/**
 * Cuánto sube la temperatura de la celda sobre el aire a plena irradiancia.
 *
 * Del modelo NOCT: ΔT = (NOCT − 20) / 800 × 1000. Con el NOCT de 45 °C que declara la mayoría
 * de los módulos de silicio da 31 °C. No se toma del catálogo porque CEC no publica NOCT; se
 * usa el valor estándar y se declara como supuesto.
 */
export const DELTA_T_CELDA = 31;

/**
 * Coeficiente de corriente en el punto máximo, en %/°C.
 *
 * Sirve para derivar el coeficiente de VOLTAJE en el punto máximo, que el catálogo no trae:
 * el coeficiente de potencia que sí trae (`temp`) es aproximadamente la suma del de voltaje y
 * el de corriente, así que β_Vmp ≈ γ_P − α_Imp. Con γ = −0.38 %/°C sale −0.42 %/°C, que cae en
 * el rango típico de −0.40 a −0.45 que publican las fichas técnicas.
 */
export const ALPHA_IMP_REL = 0.04;

/** Voltaje de circuito abierto a la temperatura dada. El frío lo SUBE. */
export function vocFrio(panel: Pick<Panel, "voc" | "betaVoc">, tCelda: number): number {
  return panel.voc + panel.betaVoc * (tCelda - 25);
}

/** Voltaje en el punto máximo con el módulo caliente. El calor lo BAJA. */
export function vmpCaliente(
  panel: Pick<Panel, "vmp" | "temp">,
  tAire: number,
  deltaCelda = DELTA_T_CELDA,
): number {
  const betaRel = (panel.temp - ALPHA_IMP_REL) / 100;
  const tCelda = tAire + deltaCelda;
  return panel.vmp * (1 + betaRel * (tCelda - 25));
}

export interface RangoString {
  /** Máximo de módulos en serie sin rebasar el voltaje máximo del inversor en el frío extremo. */
  max: number;
  /** Mínimo de módulos en serie para que el seguidor arranque con el módulo caliente. */
  min: number;
  /** `false` cuando el mínimo supera al máximo: ese módulo no combina con ese inversor. */
  viable: boolean;
  /** Voc de un módulo en el frío extremo del sitio, en volts. */
  vocFrio: number;
  /** Vmp de un módulo con el módulo caliente, en volts. */
  vmpCaliente: number;
  /** Temperatura de celda usada para el frío: en circuito abierto no hay corriente ni
   * calentamiento propio, así que es la del aire. */
  tFrio: number;
  /** Temperatura de celda usada para el calor. */
  tCaliente: number;
}

/**
 * Rango admisible de módulos en serie.
 *
 * El frío se evalúa a la temperatura del AIRE sin sumar calentamiento: en circuito abierto no
 * circula corriente, así que el módulo no se calienta a sí mismo, y ese es justo el momento
 * peligroso —el arranque de una mañana fría, antes de que el inversor conecte—.
 */
export function rangoString(
  panel: Pick<Panel, "voc" | "vmp" | "betaVoc" | "temp">,
  site: Pick<Site, "tMinAbs" | "tMaxAbs">,
  ventana: Ventana,
): RangoString {
  const tFrio = site.tMinAbs;
  const tCaliente = site.tMaxAbs + DELTA_T_CELDA;

  // El Voc del frío se redondea HACIA ARRIBA a un decimal, y el máximo se calcula con ese
  // valor redondeado. Dos razones, y la segunda es la que importa: primera, el número que se
  // muestra y el que se usa son el mismo, así que `módulos × Voc` en pantalla nunca contradice
  // al límite; segunda, cuando una cifra protege equipo se redondea del lado seguro. Sin esto
  // un módulo proponía un string de 1500.8 V en un inversor de 1500 V por un artefacto de
  // redondeo de ocho décimas de volt.
  const vFrio = Math.ceil(vocFrio(panel, tFrio) * 10) / 10;
  const vCaliente = Math.floor(vmpCaliente(panel, site.tMaxAbs) * 10) / 10;

  const max = vFrio > 0 ? Math.floor(ventana.vMax / vFrio) : 0;
  const min = vCaliente > 0 ? Math.ceil(ventana.vMpptMin / vCaliente) : 0;

  return {
    max,
    min: Math.max(1, min),
    viable: max >= Math.max(1, min) && max >= 1,
    vocFrio: vFrio,
    vmpCaliente: vCaliente,
    tFrio,
    tCaliente: Math.round(tCaliente * 10) / 10,
  };
}

export interface Arreglo {
  /** Módulos por serie. */
  porString: number;
  /** Cantidad de series. */
  strings: number;
  /** Módulos que no entran en un arreglo parejo. */
  sobrantes: number;
  /** Módulos realmente conectados. */
  conectados: number;
  /** Voltaje del string en el frío extremo, que es el que no debe rebasar el máximo. */
  vStringFrio: number;
  /** Margen que queda contra el voltaje máximo del inversor, en por ciento. */
  margen: number;
  rango: RangoString;
}

/**
 * Reparte los módulos que caben en el techo en series parejas.
 *
 * Se busca el largo de serie más grande dentro del rango admisible que divida la cantidad sin
 * sobrantes; si ninguno divide exacto, se toma el que menos módulos deje fuera. Series parejas
 * importan: series de distinto largo en el mismo seguidor arrastran la producción de la más
 * larga al nivel de la más corta.
 */
export function repartirStrings(
  n: number,
  panel: Pick<Panel, "voc" | "vmp" | "betaVoc" | "temp">,
  site: Pick<Site, "tMinAbs" | "tMaxAbs">,
  ventana: Ventana,
): Arreglo {
  const rango = rangoString(panel, site, ventana);
  const vacio: Arreglo = {
    porString: 0, strings: 0, sobrantes: n, conectados: 0,
    vStringFrio: 0, margen: 0, rango,
  };
  if (n <= 0 || !rango.viable) return vacio;

  let mejor = { porString: 0, strings: 0, sobrantes: n };
  for (let largo = rango.max; largo >= rango.min; largo--) {
    const series = Math.floor(n / largo);
    if (series < 1) continue;
    const sobra = n - series * largo;
    // se prefiere menos sobrantes; a igualdad, la serie más larga, que reduce cableado y
    // pérdidas en corriente directa
    if (sobra < mejor.sobrantes || mejor.porString === 0) {
      mejor = { porString: largo, strings: series, sobrantes: sobra };
      if (sobra === 0) break;
    }
  }
  if (mejor.porString === 0) return vacio;

  const vStringFrio = mejor.porString * rango.vocFrio;
  return {
    ...mejor,
    conectados: mejor.porString * mejor.strings,
    vStringFrio: Math.round(vStringFrio * 10) / 10,
    margen: Math.round((1 - vStringFrio / ventana.vMax) * 1000) / 10,
    rango,
  };
}

/** Ventana que corresponde al tamaño del sistema. Es un punto de partida, no una elección de
 * equipo: la interfaz deja cambiarla. */
export function ventanaPara(kwp: number): Ventana {
  if (kwp <= 15) return VENTANAS[0];
  if (kwp <= 250) return VENTANAS[1];
  return VENTANAS[2];
}

/** Relación entre potencia de módulos y potencia del inversor. En México, con irradiancia alta,
 * sobredimensionar el arreglo respecto al inversor por encima de ~1.25 empieza a recortar
 * producción en las horas centrales. */
export const DC_AC_RECOMENDADO = { min: 1.05, max: 1.25 };

export function potenciaInversor(kwpDc: number): { min: number; max: number } {
  return {
    min: Math.round((kwpDc / DC_AC_RECOMENDADO.max) * 10) / 10,
    max: Math.round((kwpDc / DC_AC_RECOMENDADO.min) * 10) / 10,
  };
}
