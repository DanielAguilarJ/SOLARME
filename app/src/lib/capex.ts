/**
 * Desglose del costo instalado, construido desde el costo REAL del módulo.
 *
 * EL DEFECTO QUE CORRIGE
 * ----------------------
 * `compute` calculaba así la inversión:
 *
 *     const capex = kwp * 1000 * CAPEX_MXN_PER_W[d.type];
 *
 * Una constante por tipo de proyecto. El precio del módulo —`panel.ppw`— NO entraba en la
 * economía por ningún lado. Consecuencia: el instalador capturaba su costo real de Jinko, el
 * catálogo se reordenaba, y el retorno, la inversión y la propuesta impresa no cambiaban un
 * peso. Elegir un módulo caro o uno barato daba el mismo payback, y ese es justo el número que
 * el instalador pone frente al cliente.
 *
 * UNA CONTRADICCIÓN ENTRE FUENTES, RESUELTA A LA VISTA
 * ---------------------------------------------------
 * research/03-precios-mexico-perplexity.md da dos cosas que no cuadran entre sí:
 *
 *   (a) módulos Tier 1 en 3.5-6.5 MXN/Wp
 *   (b) sistema llave en mano en 15-28 MXN/Wp, con el módulo al 40-50 % del CAPEX
 *
 * Si el módulo cuesta 5 MXN/Wp y es el 45 % del total, el total sería ~11 MXN/Wp: por debajo
 * de la banda (b). Las dos no pueden ser ciertas a la vez. La explicación más probable es que
 * el 40-50 % esté desactualizado: los módulos se abarataron fuerte entre 2023 y 2026 y la mano
 * de obra, la estructura y el trámite no. Hoy el módulo pesa menos del total.
 *
 * CÓMO SE MODELA ENTONCES
 * -----------------------
 * No con una proporción, sino como el instalador lo vive:
 *
 *     total = costo real de módulos  +  resto del sistema por watt × watts
 *
 * El "resto del sistema" (inversor, estructura, cableado, mano de obra, trámite) es un costo
 * por watt propio del instalador y NO depende de qué módulo elija. Así, un módulo más barato
 * baja el total exactamente en lo que debe bajar, y el reparto resultante se reporta en vez de
 * imponerse. Los valores por omisión se eligen para que el total caiga dentro de la banda
 * llave en mano verificada.
 */

export type CostOrigin = "medido" | "proporcion";

export interface CostLine {
  key: string;
  label: string;
  mxn: number;
  /** Fracción del total, 0–1. */
  share: number;
  /** `medido` = sale del precio del módulo. `proporcion` = reparto del resto del sistema. */
  origin: CostOrigin;
  note?: string;
}

export interface CostBreakdown {
  lines: CostLine[];
  total: number;
  mxnPerWp: number;
  /** Fracción del total que representan los módulos. */
  moduleShare: number;
  /** `true` si el total por watt cae dentro de la banda llave en mano verificada. */
  inBand: boolean;
  /** `true` si el reparto módulo/resto queda dentro de lo plausible. */
  shareReasonable: boolean;
}

/**
 * Resto del sistema por watt instalado, en MXN/W, sin contar módulos. Se calibra para que
 * sumado a un módulo típico (~5 MXN/Wp) el total caiga dentro de 15-28 MXN/Wp: residencial
 * ~21, comercial ~18, industrial ~15. Baja con la escala, igual que el CAPEX total.
 */
export const BOS_MXN_PER_W: Record<"res" | "com" | "ind", number> = {
  res: 16,
  com: 13,
  ind: 10,
};

/** Banda llave en mano verificada (MXN/Wp instalado). */
export const TURNKEY_BAND = { min: 15, max: 28 } as const;
/** Reparto plausible del módulo sobre el total, para señalar cifras incoherentes. */
export const MODULE_SHARE_BAND = { min: 0.12, max: 0.55 } as const;

/**
 * Reparto del resto del sistema. Estas fracciones NO salen de la investigación —que solo acota
 * el total y el peso del módulo—, son una descomposición del resto y así se etiquetan en la
 * interfaz. Suman 1.
 */
const BOS_SPLIT: { key: string; label: string; frac: number; note: string }[] = [
  { key: "inversor", label: "Inversor", frac: 0.30, note: "Inversor o microinversores y monitoreo" },
  { key: "estructura", label: "Estructura y montaje", frac: 0.22, note: "Rieles, clemas y anclaje al techo" },
  { key: "electrico", label: "Cableado y protecciones", frac: 0.14, note: "Conductores, centro de carga, tierra física" },
  { key: "obra", label: "Mano de obra e ingeniería", frac: 0.26, note: "Instalación, diseño y puesta en marcha" },
  { key: "tramite", label: "Trámite e interconexión", frac: 0.08, note: "Unidad verificadora, gestión ante CFE" },
];

/**
 * Construye el desglose.
 *
 * @param watts        potencia instalada en W
 * @param moduleCost   costo real del lote de módulos, en MXN
 * @param type         tipo de proyecto, que fija el resto del sistema por watt
 * @param bosOverride  costo del resto del sistema por watt capturado por el instalador
 */
export function buildCapex(
  watts: number,
  moduleCost: number,
  type: "res" | "com" | "ind",
  bosOverride?: number
): CostBreakdown {
  const w = Math.max(0, watts);
  const bosPerW = bosOverride !== undefined && bosOverride > 0 ? bosOverride : BOS_MXN_PER_W[type];
  const bosTotal = bosPerW * w;
  const total = Math.max(0, moduleCost) + bosTotal;

  const lines: CostLine[] = [
    {
      key: "modulos",
      label: "Módulos fotovoltaicos",
      mxn: Math.max(0, moduleCost),
      share: total > 0 ? Math.max(0, moduleCost) / total : 0,
      origin: "medido",
      note: "Del precio por watt del módulo elegido",
    },
    ...BOS_SPLIT.map((s) => ({
      key: s.key,
      label: s.label,
      mxn: bosTotal * s.frac,
      share: total > 0 ? (bosTotal * s.frac) / total : 0,
      origin: "proporcion" as CostOrigin,
      note: s.note,
    })),
  ];

  const mxnPerWp = w > 0 ? total / w : 0;
  const moduleShare = lines[0].share;

  return {
    lines,
    total,
    mxnPerWp,
    moduleShare,
    inBand: w > 0 && mxnPerWp >= TURNKEY_BAND.min && mxnPerWp <= TURNKEY_BAND.max,
    shareReasonable:
      w > 0 && moduleShare >= MODULE_SHARE_BAND.min && moduleShare <= MODULE_SHARE_BAND.max,
  };
}

export const CAPEX_NOTE =
  "El renglón de módulos sale del precio del módulo elegido. El resto del sistema es un costo " +
  "por watt propio de tu operación y no depende de qué módulo escojas: captúralo para que la " +
  "propuesta use tus números.";


/**
 * Porcentajes enteros que suman exactamente 100.
 *
 * Redondear cada partida por separado no cuadra: medido sobre 600 combinaciones de módulo, tipo de
 * proyecto y superficie, **325 —el 54 %— sumaban 99 o 101**. Los montos en pesos sí cuadraban
 * siempre; era solo la columna de porcentajes. En una cotización que ve el cliente, un desglose que
 * suma 101 % es justo lo que se nota, y resta credibilidad a todo lo demás del documento.
 *
 * Se usa el método del resto mayor: se trunca todo hacia abajo y las unidades que faltan se reparten
 * entre las partidas con mayor resto decimal. Así la suma es exactamente 100 y cada valor mostrado
 * queda a menos de un punto del real, que es lo mejor que puede hacerse con enteros.
 */
export function porcentajesEnteros(shares: number[]): number[] {
  return repartirEnteros(shares.map((s) => s * 100), 100);
}

/**
 * Enteros que suman exactamente un total dado, por el método del resto mayor.
 *
 * Sirve para cualquier reparto que se muestre desglosado: los porcentajes de la inversión y los doce
 * meses del perfil de producción. En los dos casos redondear cada parte por su cuenta rompe la suma
 * —medido: 54 % de los desgloses y 59.5 % de los perfiles—, y el usuario que sume con calculadora
 * encuentra que las partes no dan el todo.
 *
 * La magnitud es muy distinta según el caso y conviene no confundirlas: en los porcentajes el error
 * era de 1 punto sobre 100, visible; en los meses es de 1 a 3 kWh sobre decenas de miles, o sea un
 * problema de consistencia y no de exactitud. Se arregla igual porque cuesta lo mismo.
 *
 * Si las partes no suman el total —por ejemplo porque el total venía en cero—, se devuelve el piso
 * sin forzar nada: inventar unidades para cuadrar sería peor que declarar el descuadre.
 */
export function repartirEnteros(exactos: number[], total: number): number[] {
  if (exactos.length === 0) return [];

  const piso = exactos.map((e) => Math.floor(e));
  const faltan = Math.round(total) - piso.reduce((a, b) => a + b, 0);
  if (faltan < 0 || faltan > exactos.length) return piso;

  const orden = exactos
    .map((e, i) => ({ i, resto: e - Math.floor(e) }))
    .sort((a, b) => b.resto - a.resto);

  const salida = [...piso];
  for (let k = 0; k < faltan; k++) salida[orden[k].i]++;
  return salida;
}
