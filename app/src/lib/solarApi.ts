/**
 * Cliente de Google Solar API.
 *
 * Estrategia de llamadas, tomada de los precios reales medidos en la investigación
 * (research/02-deep-research-perplexity.md):
 *
 *   Building Insights  10 USD / 1,000 llamadas  → ~0.01 USD por domicilio
 *   Data Layers        75 USD / 1,000 llamadas  → ~0.075 USD por domicilio (7.5× más)
 *
 * Por eso Building Insights se llama en todo análisis y Data Layers solo cuando el
 * instalador pide explícitamente el mapa de flujo solar. Ambos se cachean por edificio.
 *
 * Las respuestas NOT_FOUND (404) no se facturan, pero sí cuentan al límite de uso, así que
 * la falta de cobertura se cachea también para no repetir la consulta.
 */


import { fetchConLimite } from "./red";
const BASE = "https://solar.googleapis.com/v1";

/** Calidad de la imagen disponible para el edificio. */
export type ImageryQuality = "HIGH" | "MEDIUM" | "BASE";

/** Confianza que merece el resultado según la calidad de imagen. */
export const QUALITY_NOTE: Record<ImageryQuality, string> = {
  HIGH: "Imagen aérea de baja altura (~0.1 m/px). Geometría de techo fiable.",
  MEDIUM: "Imagen de resolución media. Verifica la superficie en la visita técnica.",
  BASE: "Imagen de baja resolución. Trata la superficie como estimación gruesa.",
};

export interface RoofSegment {
  /** Inclinación del segmento en grados. */
  pitchDegrees: number;
  /** Azimut del segmento en grados (180 = sur). */
  azimuthDegrees: number;
  /** Superficie del segmento en m². */
  areaMeters2: number;
  /** Altura del segmento sobre el nivel del suelo, en metros. */
  planeHeightAtCenterMeters?: number;
}

export interface BuildingInsights {
  name: string;
  center: { latitude: number; longitude: number };
  imageryQuality: ImageryQuality;
  imageryDate?: { year: number; month: number; day: number };
  /** Superficie total de techo detectada, en m². */
  roofAreaMeters2: number;
  /** Horas de sol al año que recibe el punto máximo del techo. */
  maxSunshineHoursPerYear: number;
  /** Segmentos de techo con su orientación real. */
  segments: RoofSegment[];
  /** Máximo de paneles que Google estima que caben. */
  maxPanelCount: number;
}

export type SolarLookup =
  | { status: "ok"; data: BuildingInsights }
  | { status: "no-coverage" }
  | { status: "no-key" }
  | { status: "error"; message: string };

/** La clave se lee del entorno; nunca se escribe en el código ni se registra. */
function apiKey(): string | undefined {
  const k = import.meta.env?.VITE_GOOGLE_SOLAR_KEY;
  return typeof k === "string" && k.length > 0 ? k : undefined;
}

/** true si la integración está configurada y se pueden hacer llamadas reales. */
export function isConfigured() {
  return apiKey() !== undefined;
}

/**
 * Caché en memoria por coordenada redondeada Y calidad exigida.
 *
 * Se redondea a 5 decimales (~1 m) para que dos consultas del mismo techo compartan
 * resultado sin que un desplazamiento mínimo del pin genere un cargo nuevo.
 *
 * La calidad forma parte de la clave porque forma parte de la pregunta. `requiredQuality` filtra
 * qué imagen se acepta: pedir HIGH puede devolver 404 donde BASE encuentra el edificio. Con la
 * clave sólo en coordenadas, ese «no hay cobertura» quedaba cacheado y la consulta laxa recibía la
 * negativa de la exigente sin volver a preguntar. Se reprodujo con fetch simulado: una sola llamada
 * de red y el edificio nunca aparecía.
 */
const cache = new Map<string, SolarLookup>();

function cacheKey(lat: number, lng: number, quality: ImageryQuality) {
  return `${lat.toFixed(5)},${lng.toFixed(5)},${quality}`;
}

/** Limpia la caché. Solo para pruebas. */
export function clearCache() {
  cache.clear();
}

/** Número de entradas cacheadas, es decir llamadas que no se repitieron. */
export function cacheSize() {
  return cache.size;
}

/**
 * Consulta Building Insights para un domicilio.
 *
 * `requiredQuality` es el mínimo aceptable: pedir HIGH y no tenerlo devuelve
 * `no-coverage` en vez de un dato peor del esperado.
 */
export async function buildingInsights(
  lat: number,
  lng: number,
  requiredQuality: ImageryQuality = "BASE",
  fetchImpl: typeof fetch = fetch,
): Promise<SolarLookup> {
  const key = apiKey();
  if (!key) return { status: "no-key" };

  const ck = cacheKey(lat, lng, requiredQuality);
  const hit = cache.get(ck);
  if (hit) return hit;

  const url =
    `${BASE}/buildingInsights:findClosest` +
    `?location.latitude=${lat}&location.longitude=${lng}` +
    `&requiredQuality=${requiredQuality}&key=${encodeURIComponent(key)}`;

  let result: SolarLookup;
  try {
    const res = await fetchConLimite(fetchImpl, url);

    // 404 = sin cobertura en ese punto. No se factura, pero se cachea para no repetirla.
    if (res.status === 404) {
      result = { status: "no-coverage" };
    } else if (!res.ok) {
      result = { status: "error", message: `HTTP ${res.status}` };
    } else {
      result = { status: "ok", data: parse(await res.json()) };
    }
  } catch (e) {
    result = {
      status: "error",
      message: e instanceof Error ? e.message : "fallo de red",
    };
  }

  // Los errores transitorios no se cachean: un fallo de red no es un dato del edificio.
  if (result.status !== "error") cache.set(ck, result);
  return result;
}

/** Traduce la respuesta de Google a la forma que usa SolarMe. */
function parse(json: unknown): BuildingInsights {
  const j = json as Record<string, any>;
  const potential = j.solarPotential ?? {};
  const segments: RoofSegment[] = (potential.roofSegmentStats ?? []).map(
    (s: Record<string, any>) => ({
      pitchDegrees: num(s.pitchDegrees),
      azimuthDegrees: num(s.azimuthDegrees),
      areaMeters2: num(s.stats?.areaMeters2),
      planeHeightAtCenterMeters: s.planeHeightAtCenterMeters,
    }),
  );

  return {
    name: String(j.name ?? ""),
    center: {
      latitude: num(j.center?.latitude),
      longitude: num(j.center?.longitude),
    },
    imageryQuality: (j.imageryQuality ?? "BASE") as ImageryQuality,
    imageryDate: j.imageryDate,
    roofAreaMeters2: num(potential.wholeRoofStats?.areaMeters2),
    maxSunshineHoursPerYear: num(potential.maxSunshineHoursPerYear),
    segments,
    maxPanelCount: num(potential.maxArrayPanelsCount),
  };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Segmento de techo con más superficie: el candidato natural para el arreglo principal.
 * Devuelve undefined si el edificio no tiene segmentos utilizables.
 */
export function mainSegment(b: BuildingInsights): RoofSegment | undefined {
  if (b.segments.length === 0) return undefined;
  return b.segments.reduce((a, s) => (s.areaMeters2 > a.areaMeters2 ? s : a));
}

/**
 * Superficie realmente montable.
 *
 * Google devuelve la superficie geométrica del techo; en obra hay que descontar bordes,
 * accesos y obstáculos. El 72 % es el factor que SolarMe ya usaba en el modo estimado, y se
 * mantiene aquí para que el resultado con datos reales sea comparable con el estimado.
 */
export function usableArea(b: BuildingInsights) {
  return b.roofAreaMeters2 * 0.72;
}
