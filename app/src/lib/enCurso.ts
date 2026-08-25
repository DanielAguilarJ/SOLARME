import { paraGuardar, type Project } from "./storage";
import { validaProyectoImportado } from "./transfer";

/**
 * Rescate del análisis que se está haciendo.
 *
 * Un análisis solo existía en la memoria de la pestaña hasta que el instalador pulsaba «Guardar»: el
 * contorno del techo que acabó de trazar, los obstáculos que colocó, el módulo que eligió, el recibo
 * que capturó. Si el navegador cerraba la pestaña, todo eso se iba.
 *
 * Y en un teléfono eso no es un caso raro, es el caso normal: el sistema descarta las pestañas en
 * segundo plano para liberar memoria, y basta una llamada entrante o abrir la cámara. Diez minutos
 * de trazo sobre una azotea, perdidos sin que nadie haya tocado nada. Alguien a quien le pasa eso no
 * vuelve a abrir la aplicación.
 *
 * Lo que se guarda es el análisis EN CURSO, aparte de la cartera, y se ofrece al volver en vez de
 * restaurarse solo: aparecer con el trabajo de otro momento sin haberlo pedido desconcierta más de
 * lo que ayuda. Al guardar el proyecto de verdad, este rescate se descarta.
 *
 * Se valida con la MISMA función que valida un respaldo importado. El almacén es entrada no
 * confiable igual que un archivo: pudo quedar a medias por una escritura interrumpida o venir de una
 * versión anterior con otra forma. Duplicar aquí las reglas de validación sería garantizar que las
 * dos copias se separen.
 */

const CLAVE = "solarme.enCurso.v1";

/** El id que lleva el rescate. No es un proyecto de la cartera y no debe parecerlo. */
const ID = "en-curso";

export interface EnCurso {
  address: string;
  city: string;
  design: Project["design"];
  /** Cuándo se guardó, para poder decir «hace un rato» al ofrecerlo. */
  ts: number;
}

/**
 * Guarda el análisis en curso. Devuelve false si el almacén rechazó la escritura.
 *
 * Sin dirección no se guarda nada: es el estado inicial de la aplicación, no un trabajo a medias.
 */
export function guardarEnCurso(address: string, city: string, design: Project["design"]): boolean {
  if (!address.trim()) return false;
  try {
    // se guarda despojado, igual que la cartera: la física del sitio se recalcula al restaurar y
    // meterla aquí multiplicaría el tamaño del almacén sin añadir nada
    const p = paraGuardar({
      id: ID, address, city, design, createdAt: Date.now(), status: "borrador",
    });
    localStorage.setItem(CLAVE, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/** El análisis en curso guardado, o null si no hay o no es aprovechable. */
export function leerEnCurso(): EnCurso | null {
  let bruto: string | null;
  try {
    bruto = localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
  if (!bruto) return null;

  try {
    const doc = JSON.parse(bruto) as Record<string, unknown>;
    const p = validaProyectoImportado(doc);
    if (!p || !p.address) return null;
    const ts = typeof doc.createdAt === "number" ? doc.createdAt : 0;
    return { address: p.address, city: p.city, design: p.design, ts };
  } catch {
    return null;
  }
}

/** Descarta el rescate. Se llama al guardar el proyecto y cuando el instalador dice que no. */
export function olvidarEnCurso(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* almacén no disponible: no había nada que descartar */
  }
}
