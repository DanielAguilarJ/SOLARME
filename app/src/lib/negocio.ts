/**
 * Los datos del negocio que usa la herramienta.
 *
 * Nace de dos huecos que apuntaban al mismo sitio:
 *
 *   · La propuesta que el instalador entrega llevaba el nombre de SolarMe en la cabecera y nada
 *     suyo. El cliente se quedaba con un documento impecable y sin saber a quién llamar, y el
 *     instalador quedaba como intermediario de una herramienta en vez de como el autor del
 *     trabajo. Es el documento con el que se cierra una venta: tiene que ser suyo.
 *
 *   · El aviso de privacidad —obligatorio en México— exige decir QUIÉN es responsable de los
 *     datos, con su domicilio y su contacto. Estaba redactado con huecos entre corchetes.
 *
 * Es el mismo dato en los dos casos, así que se pide una vez y sirve para todo. Vive en este
 * navegador, como el resto del trabajo: no hay servidor ni cuenta que lo guarde.
 *
 * Todos los campos son opcionales a propósito. Un instalador que solo quiere ver un cálculo no
 * debería tener que rellenar una ficha de empresa antes de empezar, y lo que falte se declara como
 * falta en vez de inventarse.
 */

/** Clave de almacenamiento. Sigue el patrón de las demás: nombre, dominio, versión. */
const CLAVE = "solarme.negocio.v1";

export interface Negocio {
  /** Razón social o nombre con el que factura o se presenta. */
  nombre: string;
  /** Domicilio fiscal o de operación. Lo pide el aviso de privacidad. */
  domicilio: string;
  /** Teléfono de contacto, tal como quiere que lo llamen. */
  telefono: string;
  /** Correo de contacto. */
  correo: string;
  /** Registro ante la CFE o número de licencia, si lo tiene. Va en la propuesta si está. */
  registro: string;
}

export const NEGOCIO_VACIO: Negocio = {
  nombre: "",
  domicilio: "",
  telefono: "",
  correo: "",
  registro: "",
};

/** Longitud máxima por campo: evita que un pegado accidental llene el almacén. */
const MAX = 200;

const limpiar = (v: unknown): string =>
  typeof v === "string" ? v.trim().slice(0, MAX) : "";

/**
 * Valida y normaliza lo que venga del almacén o de un respaldo importado.
 *
 * No rechaza el objeto entero por un campo malo: se queda con lo aprovechable, porque perder el
 * teléfono del negocio porque alguien guardó un número donde iba texto sería peor.
 */
export function normalizaNegocio(bruto: unknown): Negocio {
  if (!bruto || typeof bruto !== "object") return NEGOCIO_VACIO;
  const o = bruto as Record<string, unknown>;
  return {
    nombre: limpiar(o.nombre),
    domicilio: limpiar(o.domicilio),
    telefono: limpiar(o.telefono),
    correo: limpiar(o.correo),
    registro: limpiar(o.registro),
  };
}

const suscriptores = new Set<() => void>();
let cache: Negocio | null = null;

/** Lee los datos del negocio. Devuelve la misma referencia mientras no cambien. */
export function leerNegocio(): Negocio {
  if (cache) return cache;
  try {
    const bruto = localStorage.getItem(CLAVE);
    cache = bruto ? normalizaNegocio(JSON.parse(bruto)) : NEGOCIO_VACIO;
  } catch {
    // almacén bloqueado o contenido corrupto: se sigue sin datos en vez de romper el arranque
    cache = NEGOCIO_VACIO;
  }
  return cache;
}

/**
 * Guarda los datos. Devuelve false si el almacén no aceptó la escritura, para que la interfaz
 * pueda decirlo en vez de dar por hecho que se guardó.
 */
export function guardarNegocio(n: Negocio): boolean {
  const limpio = normalizaNegocio(n);
  cache = limpio;
  suscriptores.forEach((f) => f());
  try {
    localStorage.setItem(CLAVE, JSON.stringify(limpio));
    return true;
  } catch {
    return false;
  }
}

/** Suscribe cambios, para que la barra lateral y los documentos se enteren sin recargar. */
export function suscribirNegocio(f: () => void): () => void {
  suscriptores.add(f);
  const alCambiarOtraPestania = (e: StorageEvent) => {
    if (e.key === CLAVE) {
      cache = null;
      f();
    }
  };
  window.addEventListener("storage", alCambiarOtraPestania);
  return () => {
    suscriptores.delete(f);
    window.removeEventListener("storage", alCambiarOtraPestania);
  };
}

/** True si hay al menos un dato con el que identificar al negocio. */
export function tieneNegocio(n: Negocio = leerNegocio()): boolean {
  return Boolean(n.nombre || n.telefono || n.correo);
}

/**
 * Lo que falta para que el aviso de privacidad esté completo.
 *
 * El aviso exige responsable, domicilio y medio de contacto; el registro ante la CFE no, así que no
 * se cuenta. Devuelve los nombres en el orden en que aparecen en el formulario.
 */
export function faltaParaAviso(n: Negocio = leerNegocio()): string[] {
  const falta: string[] = [];
  if (!n.nombre) falta.push("nombre o razón social");
  if (!n.domicilio) falta.push("domicilio");
  if (!n.telefono && !n.correo) falta.push("teléfono o correo");
  return falta;
}

/** Solo para pruebas: olvida lo leído para volver a leer del almacén. */
export function _olvidarNegocio(): void {
  cache = null;
}
