/**
 * Peticiones con límite de tiempo.
 *
 * Por qué existe: ninguna llamada de la app lo tenía. En una azotea con señal intermitente —el
 * sitio donde se usa esto— una respuesta que se queda a medias no falla, se queda colgada. La
 * interfaz mostraba «Buscando las coordenadas del domicilio…» indefinidamente y la física nunca
 * subía del promedio nacional, sin decir por qué. El instalador espera delante del cliente y
 * acaba trabajando con el número equivocado o abandonando.
 *
 * El navegador termina cortando la conexión por su cuenta, pero puede tardar minutos, y una
 * respuesta que entrega cabeceras y nunca termina el cuerpo aguanta todavía más. Ocho segundos es
 * de sobra para una ida y vuelta en una red lenta y poco para dejar a alguien esperando.
 *
 * Un corte se comunica como cualquier otro fallo de red, así que la app ya lo dice bien: sus
 * mensajes distinguen la falta de señal del fallo del servicio y de la dirección inexistente.
 */

/** Ocho segundos. Medido contra el uso, no contra el ideal: se usa en la calle, con datos. */
export const TIEMPO_LIMITE_MS = 8000;

/**
 * Envuelve un `fetch` para que aborte pasado el límite.
 *
 * Se usa `AbortController` y no `AbortSignal.timeout` para no depender de una función que puede
 * faltar en un entorno de prueba o en un navegador viejo, y para poder cancelar el temporizador
 * cuando la respuesta sí llega: dejarlo corriendo mantendría el proceso despierto sin motivo.
 *
 * El límite es un parámetro para que las pruebas no tengan que esperar ocho segundos de verdad.
 */
export async function fetchConLimite(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit = {},
  limiteMs: number = TIEMPO_LIMITE_MS
): Promise<Response> {
  // Sin `AbortController` —entorno muy antiguo— se pide sin límite antes que no pedir nada.
  if (typeof AbortController === "undefined") return fetchImpl(url, init);

  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), limiteMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(reloj);
  }
}
