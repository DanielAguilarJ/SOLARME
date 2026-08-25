import type { FuenteMosaico } from "./mosaico";

/**
 * De dónde salen los mosaicos del mapa, si es que hay una fuente configurada.
 *
 * SolarMe no trae ningún proveedor de imagen dentro, por dos razones que este proyecto ya midió:
 * la imagen satelital útil (Google Solar) exige facturación del propietario, y las fuentes
 * gratuitas o no tienen resolución de techo (INEGI) o su licencia prohíbe distribuir la app con
 * ellas (mosaicos estándar de OpenStreetMap). Así que la fuente es una DECISIÓN del operador: se
 * enchufa por variable de entorno y, mientras no exista, el mapa lo dice en vez de pintar en
 * blanco o de usar mosaicos que no se pueden distribuir.
 *
 * `VITE_TILE_URL` es la plantilla con `{z}`, `{x}`, `{y}` —el formato que usan MapTiler, Mapbox,
 * Google y casi todos—. `VITE_TILE_CREDITO` es la atribución que la licencia del proveedor exige;
 * sin ella no se arma ninguna URL (lo impide `urlDeMosaico`). El zoom máximo se puede ajustar por
 * proveedor, con un valor por defecto razonable para ver un techo.
 */
const PLANTILLA = (import.meta.env.VITE_TILE_URL ?? "").trim();
const CREDITO = (import.meta.env.VITE_TILE_CREDITO ?? "").trim();
const ZOOM_MAX = Number(import.meta.env.VITE_TILE_ZOOM_MAX ?? 19);

/** La fuente configurada, o `null` si el operador todavía no eligió proveedor. */
export function fuenteMosaico(): FuenteMosaico | null {
  if (PLANTILLA === "" || CREDITO === "") return null;
  return {
    nombre: "mapa",
    plantilla: PLANTILLA,
    credito: CREDITO,
    zoomMax: Number.isFinite(ZOOM_MAX) && ZOOM_MAX > 0 ? Math.floor(ZOOM_MAX) : 19,
  };
}

/** `true` si hay una fuente de imagen lista para pintar el mapa. */
export function hayFuenteMosaico(): boolean {
  return fuenteMosaico() !== null;
}
