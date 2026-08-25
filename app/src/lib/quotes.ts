/**
 * Costos reales de módulo capturados por el instalador, en MXN/Wp y por marca.
 *
 * POR QUÉ POR MARCA Y NO POR MODELO
 * ---------------------------------
 * Un instalador negocia con su distribuidor por marca y gama, no módulo por módulo: el
 * precio de un Jinko de 550 W y de uno de 610 W sale de la misma lista. Son 20 marcas contra
 * 140 modelos, así que capturar por marca es lo que alguien va a llenar de verdad.
 *
 * Esto cierra el hueco que dejó price.ts: `enrichPanels` ya aceptaba cotizaciones y la
 * procedencia `cotizado` existía, pero nada en la interfaz podía escribirlas. Era un camino
 * de código inalcanzable, y por tanto la etiqueta verde no podía aparecer nunca.
 */

const KEY = "solarme.quotes.v1";

/** Marca en minúsculas -> MXN/Wp. */
export type Quotes = Record<string, number>;

/** Límites de cordura. Un módulo por debajo de 1 MXN/Wp o por encima de 40 es un dedazo
 * (o alguien escribiendo dólares en un campo de pesos), no una cotización. */
export const MIN_QUOTE = 1;
export const MAX_QUOTE = 40;

export function isValidQuote(v: number): boolean {
  return Number.isFinite(v) && v >= MIN_QUOTE && v <= MAX_QUOTE;
}

export function loadQuotes(): Quotes {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // `typeof [] === "object"`, y un arreglo colaría sus índices como nombres de marca
    // ("0", "1", …) con valores numéricos válidos. Hay que descartarlo explícitamente.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    // Se filtra al cargar: un valor corrupto en almacenamiento no debe envenenar el modelo.
    const out: Quotes = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && isValidQuote(v)) out[k.toLowerCase()] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Escribe el conjunto completo, filtrando lo que no sea un precio válido.
 *
 * Es pública porque la restauración de un respaldo trae todas las marcas de golpe. Normaliza a
 * minúsculas igual que `loadQuotes`, o «Trina» y «trina» acabarían siendo dos precios distintos
 * para la misma marca según de qué equipo viniera el archivo.
 */
export function guardarQuotes(q: Quotes): void {
  const limpio: Quotes = {};
  for (const [marca, v] of Object.entries(q)) {
    if (typeof v === "number" && isValidQuote(v)) limpio[marca.toLowerCase()] = v;
  }
  persist(limpio);
}

function persist(q: Quotes) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* almacenamiento no disponible: la sesión sigue en memoria */
  }
}

/** Devuelve un objeto NUEVO con la cotización puesta. Un valor inválido se ignora. */
export function setQuote(q: Quotes, brand: string, mxnPerWp: number): Quotes {
  if (!isValidQuote(mxnPerWp)) return q;
  const next = { ...q, [brand.toLowerCase()]: mxnPerWp };
  persist(next);
  return next;
}

/** Devuelve un objeto NUEVO sin la cotización de esa marca: vuelve a la banda de mercado. */
export function clearQuote(q: Quotes, brand: string): Quotes {
  const key = brand.toLowerCase();
  if (!(key in q)) return q;
  const next = { ...q };
  delete next[key];
  persist(next);
  return next;
}

export function clearAllQuotes(): Quotes {
  persist({});
  return {};
}

export function quoteFor(q: Quotes, brand: string): number | undefined {
  return q[brand.toLowerCase()];
}

export function quoteCount(q: Quotes): number {
  return Object.keys(q).length;
}
