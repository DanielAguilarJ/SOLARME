/**
 * Registro del trabajador de servicio y estado de la conexión.
 *
 * Solo se registra en la compilación de producción. En desarrollo interceptaría la recarga en
 * caliente de Vite y dejaría servir módulos viejos, que es una manera muy eficaz de perder una
 * tarde persiguiendo un cambio que sí estaba en el archivo.
 */

export function registrarTrabajador() {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // sin trabajador la app sigue funcionando con conexión; no hay nada que avisar
    });
  });
}

/**
 * Suscribe a los cambios de conexión y devuelve la función para darse de baja.
 *
 * `navigator.onLine` es una señal imperfecta —dice que hay una interfaz de red, no que haya
 * internet del otro lado— así que se usa para AVISAR, nunca para decidir si intentar una
 * petición. Lo que decide es el resultado de la petición misma.
 */
export function observarConexion(alCambiar: (enLinea: boolean) => void): () => void {
  const notificar = () => alCambiar(navigator.onLine);
  window.addEventListener("online", notificar);
  window.addEventListener("offline", notificar);
  return () => {
    window.removeEventListener("online", notificar);
    window.removeEventListener("offline", notificar);
  };
}

export function hayConexion(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
