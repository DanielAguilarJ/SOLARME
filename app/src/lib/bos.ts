/**
 * Costo del resto del sistema por watt (MXN/W) capturado por el instalador.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ---------------------------
 * `Design.bosPerW` y `buildCapex(..., bosOverride)` ya existían y estaban probados de punta a
 * punta, pero **ninguna interfaz los escribía**. Otro camino de código inalcanzable, igual que
 * las cotizaciones de módulo antes de cerrarlas: la función existía, nadie podía llegar.
 *
 * POR QUÉ SE GUARDA POR TIPO DE PROYECTO Y NO POR PROYECTO
 * -------------------------------------------------------
 * El inversor, la estructura, el cableado, la mano de obra y el trámite son el costo de la
 * OPERACIÓN del instalador, no de un domicilio: se repite proyecto a proyecto y solo cambia con
 * la escala. Por eso se guarda una tarifa por tipo (residencial, comercial, industrial) y se
 * aplica a todos los análisis de ese tipo, en vez de pedirla otra vez en cada uno.
 */

import type { ProjectType } from "./solar";
import { BOS_MXN_PER_W } from "./capex";

const KEY = "solarme.bos.v1";

export type BosRates = Partial<Record<ProjectType, number>>;

/** Límites de cordura. Por debajo de 3 MXN/W no cabe ni el inversor; por encima de 40 el total
 * se sale de cualquier banda de mercado. Fuera de ahí es un dedazo, no una tarifa. */
export const MIN_BOS = 3;
export const MAX_BOS = 40;

export function isValidBos(v: number): boolean {
  return Number.isFinite(v) && v >= MIN_BOS && v <= MAX_BOS;
}

const TYPES: ProjectType[] = ["res", "com", "ind"];

export function loadBosRates(): BosRates {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: BosRates = {};
    for (const t of TYPES) {
      const v = (parsed as Record<string, unknown>)[t];
      if (typeof v === "number" && isValidBos(v)) out[t] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Escribe el conjunto completo, filtrando lo que no sea un costo válido.
 *
 * Es pública porque la restauración de un respaldo trae el conjunto de golpe, y hacerlo con
 * `setBos` una por una escribiría tres veces y dejaría estados intermedios en el almacén. Filtra
 * con la misma regla que `loadBosRates`: un archivo editado a mano no puede colar un 999.
 */
export function guardarBosRates(r: BosRates): void {
  const limpio: BosRates = {};
  for (const t of TYPES) {
    const v = r[t];
    if (typeof v === "number" && isValidBos(v)) limpio[t] = v;
  }
  persist(limpio);
}

function persist(r: BosRates) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* almacenamiento no disponible: la sesión sigue en memoria */
  }
}

/** Devuelve un objeto NUEVO con la tarifa puesta. Un valor inválido se ignora. */
export function setBos(r: BosRates, type: ProjectType, mxnPerW: number): BosRates {
  if (!isValidBos(mxnPerW)) return r;
  const next = { ...r, [type]: mxnPerW };
  persist(next);
  return next;
}

/** Devuelve un objeto NUEVO sin la tarifa de ese tipo: vuelve al valor de referencia. */
export function clearBos(r: BosRates, type: ProjectType): BosRates {
  if (!(type in r)) return r;
  const next = { ...r };
  delete next[type];
  persist(next);
  return next;
}

/** Tarifa vigente para ese tipo: la del instalador si la capturó, o la de referencia. */
export function bosFor(r: BosRates, type: ProjectType): number {
  const v = r[type];
  return v !== undefined && isValidBos(v) ? v : BOS_MXN_PER_W[type];
}

/** `true` cuando el valor vigente lo capturó el instalador y no es el de referencia. */
export function isOwnBos(r: BosRates, type: ProjectType): boolean {
  const v = r[type];
  return v !== undefined && isValidBos(v);
}
