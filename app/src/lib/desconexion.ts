import type { Arreglo, Ventana } from "./strings";
import type { Circuito2 } from "./ocpd";

/**
 * Medios de desconexión y diagrama unifilar.
 *
 * Lo que falta para que el paquete de trámite esté completo: el instalador ya tiene el calibre, la
 * protección y las series, pero nadie aprueba un plano sin decir DÓNDE se corta la energía.
 *
 * Criterios verificados en cuatro fuentes independientes (up.codes, ECM Web, ExpertCE,
 * Solar Permit Solutions), todas citando NEC Art. 690 y 705:
 *
 * - 690.13(A): el desconectador del sistema va en un lugar «readily accessible» — alcanzable sin
 *   escalera y sin quitar obstáculos — en el exterior o justo dentro del punto de entrada.
 * - 690.13(A)(2): la tapa se cierra con llave o exige herramienta para abrirse.
 * - 690.13(B): debe indicar abierto (OFF) / cerrado (ON) y llevar la marca del desconectador.
 * - Del lado de alterna, las tarifas de la compañía suministradora piden que sea enclavable en
 *   abierto y con contacto visible.
 * - 705.10: placa permanente en el punto de servicio que declare la fuente interconectada.
 *
 * NO verificado directamente: el texto de la NOM-001-SEDE, cuyos repositorios están de pago. Las
 * cifras de aquí salen del cálculo del propio sitio; los requisitos, de las fuentes citadas.
 *
 * Un dato deliberadamente NO aplicado: 705.11(B) exige mínimo 6 AWG de cobre en los conductores del
 * lado de suministro. Eso rige la acometida, no los circuitos de módulos que dimensiona
 * `conductor.ts`, y aplicarlo ahí abultaría el cobre sin razón.
 */

/**
 * Tensiones nominales de interruptor de seguridad que se consiguen en el mercado.
 *
 * Coinciden con las ventanas de inversor porque el mercado se organiza igual: no existe un
 * interruptor de 800 V, se salta de 600 a 1000.
 */
export const V_NOMINALES = [600, 1000, 1500] as const;

/** Corrientes nominales de interruptor de seguridad de uso corriente. */
export const A_NOMINALES = [30, 60, 100, 200, 400, 600] as const;

export interface Desconectador {
  lado: "cc" | "ca";
  /** Tensión que debe soportar sin falla, en volts. */
  vMin: number;
  /** Corriente que debe conducir de continuo, en amperes. */
  aMin: number;
  /** Tensión nominal comercial elegida, o null si ninguna alcanza. */
  vNominal: number | null;
  /** Corriente nominal comercial elegida, o null si ninguna alcanza. */
  aNominal: number | null;
  /** Requisitos que no dependen de ninguna cifra. */
  requisitos: string[];
  /** Por qué no se pudo elegir, cuando falta algo. */
  falta?: string;
}

const REQ_CC = [
  "Accesible sin escalera y sin mover obstáculos.",
  "En el exterior, o justo dentro del punto de entrada de los conductores.",
  "Tapa con llave o que exija herramienta para abrirse.",
  "Debe indicar si está abierto o cerrado, y llevar la marca del desconectador.",
];

const REQ_CA = [
  "Enclavable en abierto, con contacto visible.",
  "Accesible para la compañía suministradora.",
  "Placa permanente en el punto de servicio que declare la fuente interconectada.",
];

/** El primer valor de la lista que alcanza. `null` si ninguno. */
const primeroQueAlcanza = (lista: readonly number[], minimo: number): number | null =>
  lista.find((v) => v >= minimo) ?? null;

/**
 * Desconectador del lado de corriente directa.
 *
 * Las dos cifras salen de datos ya medidos, no de supuestos: la tensión, del voltaje del string en
 * el frío extremo del sitio; la corriente, de la de diseño con la que se calculó el conductor.
 */
export function desconectadorCC(
  strings: Arreglo | undefined,
  circuito: Circuito2 | undefined
): Desconectador {
  const vMin = strings ? Math.ceil(strings.vStringFrio) : 0;
  const aMin = circuito ? circuito.proteccion.minimo : 0;

  if (!strings || !circuito) {
    return {
      lado: "cc", vMin, aMin, vNominal: null, aNominal: null, requisitos: REQ_CC,
      falta: "Falta el arreglo de series o el cálculo del circuito para dimensionarlo.",
    };
  }

  const vNominal = primeroQueAlcanza(V_NOMINALES, vMin);
  const aNominal = primeroQueAlcanza(A_NOMINALES, aMin);

  return {
    lado: "cc", vMin, aMin, vNominal, aNominal, requisitos: REQ_CC,
    falta: vNominal === null
      ? `Ningún interruptor comercial de la lista soporta ${vMin} V.`
      : aNominal === null
        ? `Ningún interruptor comercial de la lista conduce ${aMin.toFixed(1)} A.`
        : undefined,
  };
}

/**
 * Desconectador del lado de corriente alterna.
 *
 * Aquí NO se inventa la corriente. Se calcula de la corriente nominal de salida del inversor, que
 * viene en su placa, y la app no elige un modelo concreto: entrega una ventana de kW. Así que se
 * declaran los requisitos, que no dependen de ninguna cifra, y se dice exactamente qué falta.
 */
export function desconectadorCA(): Desconectador {
  return {
    lado: "ca", vMin: 0, aMin: 0, vNominal: null, aNominal: null, requisitos: REQ_CA,
    falta: "Se dimensiona con la corriente de salida de placa del inversor que se compre.",
  };
}

/* ---------- diagrama unifilar ---------- */

export type Simbolo = "modulos" | "desconectador" | "inversor" | "medidor" | "red";

export interface Nodo {
  simbolo: Simbolo;
  titulo: string;
  /** Datos del nodo. Cada línea es un hecho calculado, o una ausencia declarada. */
  detalle: string[];
  /** Verdadero cuando al nodo le falta un dato para quedar completo. */
  incompleto?: boolean;
}

/**
 * El unifilar como datos, no como dibujo.
 *
 * Se construye aquí para que la propuesta impresa y la pantalla no puedan discrepar, que es el
 * error que ya apareció con los metros del circuito.
 */
export function unifilar(
  strings: Arreglo | undefined,
  ventana: Ventana | undefined,
  circuito: Circuito2 | undefined,
  kwp: number,
  cc = desconectadorCC(strings, circuito),
  ca = desconectadorCA()
): Nodo[] {
  const nom = (d: Desconectador) =>
    d.vNominal && d.aNominal ? `${d.vNominal} V · ${d.aNominal} A` : "por definir";

  return [
    {
      simbolo: "modulos",
      titulo: "Módulos",
      detalle: strings
        ? [
            `${strings.conectados} módulos · ${kwp.toFixed(1)} kWp`,
            `${strings.strings} × ${strings.porString} en serie`,
            `${Math.round(strings.vStringFrio)} V en el frío extremo`,
          ]
        : ["Sin arreglo calculado"],
      incompleto: !strings,
    },
    {
      simbolo: "desconectador",
      titulo: "Desconectador CC",
      detalle: cc.falta
        ? [nom(cc), cc.falta]
        : [nom(cc), `mínimo ${cc.vMin} V · ${cc.aMin.toFixed(1)} A`],
      incompleto: Boolean(cc.falta),
    },
    {
      simbolo: "inversor",
      titulo: "Inversor",
      detalle: ventana
        ? [ventana.etiqueta, `entrada máxima ${ventana.vMax} V`]
        : ["Sin ventana elegida"],
      incompleto: !ventana,
    },
    {
      // El motivo completo vive en la sección de requisitos: aquí sólo cabe el hecho.
      simbolo: "desconectador",
      titulo: "Desconectador CA",
      detalle: [nom(ca), "Se dimensiona con la placa del inversor"],
      incompleto: Boolean(ca.falta),
    },
    {
      simbolo: "medidor",
      titulo: "Medidor bidireccional",
      detalle: ["Lo instala la compañía suministradora", "Mide entrega y consumo por separado"],
    },
    {
      simbolo: "red",
      titulo: "Red",
      detalle: ["Interconexión en paralelo", "Placa de fuente interconectada en el servicio"],
    },
  ];
}

/** Nodos a los que les falta un dato. Vacío cuando el unifilar está completo. */
export const nodosIncompletos = (nodos: Nodo[]): Nodo[] => nodos.filter((n) => n.incompleto);
