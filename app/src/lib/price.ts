/**
 * Precio de módulo en MXN por watt-pico.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ---------------------------
 * El catálogo traía `ppw` con dos valores para 140 módulos (0.28 y 0.34), producidos por un
 * proxy de eficiencia en el importador:
 *
 *     if eff >= 22.5: return 0.34
 *     if eff >= 21.0: return 0.28
 *
 * Eso no es un precio: es la eficiencia disfrazada. Y en el modo "precio" del recomendador ese
 * eje pesa el 55 % del puntaje, así que más de la mitad de la recomendación la decidía un volado
 * entre dos números inventados. Peor: el campo no declaraba moneda —0.28 solo tiene sentido en
 * USD/W— mientras CAPEX_PER_W estaba en MXN/W.
 *
 * DE DÓNDE SALEN LAS CIFRAS
 * -------------------------
 * research/03-precios-mexico-perplexity.md · Perplexity Deep Research, 25 pasos, 139 fuentes.
 *
 *   - Módulos Tier 1 en México 2025-2026: ~3.5 a ~6.5 MXN/Wp según marca, tecnología y canal.
 *   - Ancla verificable: PGI Energy, JA Solar 605 W Mono N-Type, $3,136.87 MXN
 *     -> 3136.87 / 605 = 5.19 MXN/Wp (página de producto, 2026).
 *   - Sistema llave en mano: 15-28 MXN/Wp instalado; el módulo es 40-50 % del CAPEX.
 *
 * LO QUE ESTE MODELO NO ES
 * ------------------------
 * No es una cotización. Es una BANDA DE MERCADO por gama, y la interfaz lo dice con esas
 * palabras. La única cifra exacta es la que el instalador escribe, igual que con el recibo CFE:
 * no se adivina la tarifa, se captura el recibo real.
 */

export type Tier = 1 | 2 | 3;
export type PriceOrigin = "cotizado" | "banda";

export interface ModulePrice {
  /** MXN por watt-pico. */
  mxnPerWp: number;
  /** `cotizado` = lo escribió el instalador. `banda` = estimación por gama. */
  origin: PriceOrigin;
  tier: Tier;
}

/**
 * Banda por gama, en MXN/Wp. El punto medio de Tier 1 se fija en el ancla verificada de 5.19
 * y no en el centro aritmético del rango, porque el ancla es un precio publicado real.
 */
export const TIER_BAND: Record<Tier, { min: number; mid: number; max: number }> = {
  1: { min: 3.5, mid: 5.2, max: 6.5 },
  2: { min: 3.1, mid: 4.4, max: 5.6 },
  3: { min: 2.6, mid: 3.6, max: 4.8 },
};

/**
 * Clasificación por marca según la investigación. Tier 1 son las verticalmente integradas con
 * más del 3 % de ingresos en I+D; Tier 2 subcontratan parte del proceso; el resto queda en 3.
 *
 * Las claves se comparan en minúsculas y por inclusión, porque la base CEC escribe la misma
 * empresa de varias formas ("Trina Solar" y "Trina Solar CoLtd").
 */
const TIER1 = [
  "jinko", "longi", "trina", "ja solar", "jasolar", "canadian", "csi solar",
  "chint", "astronergy", "rec ", "rec group", "qcells", "q cells", "hanwha",
  "first solar", "sunpower", "maxeon",
];
const TIER2 = [
  "risen", "gcl", "suntech", "phono", "znshine", "seg solar", "talesun",
  "jolywood", "boviet", "elite solar", "solarspace",
];

export function brandTier(brand: string): Tier {
  const b = brand.toLowerCase();
  if (TIER1.some((k) => b.includes(k))) return 1;
  if (TIER2.some((k) => b.includes(k))) return 2;
  return 3;
}

/**
 * Precio de un módulo. `quoted` es el MXN/Wp que capturó el instalador para esa marca; si
 * existe, gana sobre la banda y la procedencia pasa a `cotizado`.
 *
 * Dentro de la banda se interpola por eficiencia: a mayor eficiencia, más cerca del techo.
 * Esa correlación es real —la eficiencia se paga— pero es una tendencia, no una tarifa, y por
 * eso el resultado sigue marcado como `banda`.
 */
export function modulePrice(
  brand: string,
  eff: number,
  quoted?: number
): ModulePrice {
  const tier = brandTier(brand);
  if (quoted !== undefined && quoted > 0) {
    return { mxnPerWp: quoted, origin: "cotizado", tier };
  }
  const band = TIER_BAND[tier];
  // Rango de eficiencia del mercado actual de módulos de silicio. Fuera de él se satura.
  const t = clamp((eff - 18) / (24.5 - 18), 0, 1);
  const mxnPerWp = round2(band.min + (band.max - band.min) * t);
  return { mxnPerWp, origin: "banda", tier };
}

/** Costo del lote de módulos de un sistema, en MXN. */
export function moduleCost(price: ModulePrice, watts: number): number {
  return price.mxnPerWp * watts;
}

/**
 * CAPEX instalado por watt, en MXN/W, por tipo de proyecto.
 *
 * Antes había un solo valor (17.5) para los tres tipos, y eso es incorrecto: el costo por watt
 * baja con la escala. La investigación acota el total en 15-28 MXN/Wp instalado, así que
 * residencial se sitúa arriba de la banda e industrial abajo.
 */
export const CAPEX_MXN_PER_W: Record<"res" | "com" | "ind", number> = {
  res: 22,
  com: 18,
  ind: 15,
};

export const CAPEX_RANGE = { min: 15, max: 28 } as const;

export const PRICE_NOTE =
  "Banda de mercado 2025-2026 (3.5-6.5 MXN/Wp para Tier 1), no una cotización. " +
  "Captura tu costo real para que el comparativo use tus números.";

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/** Forma cruda de un módulo tal como sale del importador CEC. */
interface RawPanel {
  brand: string; model: string; w: number; eff: number; temp: number;
  area: number; warr: number | null; tech?: string; bifacial?: boolean;
  source?: string;
}

/**
 * Convierte el catálogo crudo en paneles con precio. Se hace en un solo punto para que no haya
 * dos ideas distintas de cuánto cuesta un módulo circulando por la app.
 *
 * `quotes` mapea marca en minúsculas -> MXN/Wp capturado por el instalador.
 */
export function enrichPanels<T extends RawPanel>(
  raw: T[],
  quotes: Record<string, number> = {}
) {
  return raw.map((p) => {
    const price = modulePrice(p.brand, p.eff, quotes[p.brand.toLowerCase()]);
    return { ...p, ppw: price.mxnPerWp, priceOrigin: price.origin };
  });
}
