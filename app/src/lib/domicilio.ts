/**
 * Cómo se escribe un domicilio junto a su ciudad.
 *
 * El geocodificador devuelve direcciones que muchas veces ya llevan la ciudad dentro («Blvd.
 * Kukulcán 12, Cancún»), así que pegarle la ciudad detrás producía «Blvd. Kukulcán 12, Cancún,
 * Cancún». Pasó primero en la propuesta impresa y se arregló ahí; volvió a pasar en la franja que
 * ofrece recuperar un análisis sin guardar, porque la regla vivía dentro del generador del
 * documento. Ahora vive en un sitio y la usan los dos.
 *
 * La comparación ignora acentos y mayúsculas: el mismo topónimo aparece escrito de las dos formas
 * según la fuente, y «Cancun» dentro de la dirección tiene que reconocer a «Cancún».
 */

/** Quita acentos y baja a minúsculas, para comparar topónimos escritos de distinta manera. */
const plano = (v: string): string =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * El domicilio con su ciudad, sin repetirla.
 *
 * `separador` existe porque el documento impreso usa un punto medio y la interfaz una coma; el
 * criterio de cuándo añadir la ciudad es el mismo en los dos.
 */
export function conCiudad(address: string, city: string, separador = " · "): string {
  if (!city.trim()) return address;
  return plano(address).includes(plano(city)) ? address : `${address}${separador}${city}`;
}
