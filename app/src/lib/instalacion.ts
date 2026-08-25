/**
 * Instalación en el dispositivo.
 *
 * El manifiesto hace que la aplicación SE PUEDA instalar; esto hace que se sepa. Sin un botón
 * dentro de la aplicación, instalarla exige que el instalador conozca el menú de su navegador y
 * encuentre «añadir a la pantalla de inicio» —tres toques escondidos que casi nadie da—. Y la
 * diferencia importa donde se usa esto: instalada abre a pantalla completa, sin la barra de
 * direcciones comiéndose una franja del teléfono en una azotea a pleno sol, y arranca desde el
 * icono como cualquier otra herramienta de trabajo.
 *
 * El navegador avisa de que puede instalarla con un evento (`beforeinstallprompt`) que llega UNA
 * vez y hay que retener: si no se guarda, la oportunidad se pierde y el diálogo del sistema ya no
 * se puede abrir a mano. Por eso este módulo lo captura al arrancar y expone su estado con el mismo
 * patrón de suscripción que usa el resto de la aplicación.
 *
 * Safari en iPhone no dispara ese evento —allí se instala desde el menú Compartir— así que en ese
 * caso el botón no aparece. Es deliberado: vale más no ofrecer nada que ofrecer un botón que no
 * hace nada.
 */

/** El evento del navegador, que no está en los tipos estándar de TypeScript. */
interface EventoDeInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let pendiente: EventoDeInstalacion | null = null;
const suscriptores = new Set<() => void>();

const avisar = () => suscriptores.forEach((f) => f());

/** True si el navegador ya ofreció instalar y la oferta sigue viva. */
export function sePuedeInstalar(): boolean {
  return pendiente !== null;
}

/**
 * True si la aplicación ya se está viendo instalada. Se comprueba de dos formas porque Safari en
 * iPhone no implementa `display-mode` y usa una propiedad propia.
 */
export function yaEstaInstalada(): boolean {
  if (typeof window === "undefined") return false;
  const enVentanaPropia = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const enSafariDeIPhone = (window.navigator as { standalone?: boolean }).standalone === true;
  return enVentanaPropia || enSafariDeIPhone;
}

/** Suscribe un cambio de estado. Devuelve la función para darse de baja. */
export function suscribirInstalacion(f: () => void): () => void {
  suscriptores.add(f);
  return () => suscriptores.delete(f);
}

/**
 * Empieza a escuchar al navegador. Se llama una vez al arrancar.
 *
 * `preventDefault` es obligatorio: sin él el navegador muestra su propio aviso donde le parece y el
 * evento se descarta, con lo que el botón de la aplicación quedaría inservible.
 */
export function escucharInstalacion(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pendiente = e as EventoDeInstalacion;
    avisar();
  });
  // instalada desde el navegador o desde el botón: la oferta ya no tiene sentido
  window.addEventListener("appinstalled", () => {
    pendiente = null;
    avisar();
  });
}

/**
 * Abre el diálogo del sistema y devuelve si el usuario aceptó.
 *
 * La oferta se consume aceptada o no: el navegador no permite reabrir el mismo evento, así que se
 * suelta en cuanto se usa para que el botón desaparezca en vez de quedar sin efecto.
 */
export async function instalar(): Promise<boolean> {
  const evento = pendiente;
  if (!evento) return false;
  pendiente = null;
  avisar();
  try {
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    return outcome === "accepted";
  } catch {
    // el navegador puede rechazar el diálogo (por ejemplo si no hubo gesto del usuario);
    // no hay nada que recuperar y la interfaz ya no muestra el botón
    return false;
  }
}

/** Solo para pruebas: devuelve el módulo a su estado inicial. */
export function _reiniciarInstalacion(): void {
  pendiente = null;
  suscriptores.clear();
}
