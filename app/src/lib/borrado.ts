/**
 * Borrar todo lo que la aplicación guarda en este navegador.
 *
 * Existe por dos razones que apuntan al mismo botón.
 *
 * La primera es que el aviso de privacidad lo promete: dice que los datos se pueden ver, corregir y
 * borrar «desde la propia aplicación». Se podía borrar un proyecto y un contacto de uno en uno, y
 * vaciar los campos del negocio a mano, pero no había forma de dejar el navegador limpio. Una
 * promesa legal que solo se cumple a trozos es una promesa a medias.
 *
 * La segunda es práctica: un instalador vende la computadora del taller, la presta, o deja de usar
 * la herramienta. Los domicilios y los consumos de sus clientes son datos personales de terceros y
 * tiene que poder quitarlos de golpe.
 *
 * Se borra por PREFIJO y no con una lista de claves escrita a mano: así una clave nueva que alguien
 * añada mañana también se va, en vez de quedarse olvidada aquí para siempre.
 *
 * Las claves se recorren con `length` y `key(i)`, la API estándar del almacén, y no con
 * `Object.keys`: eso último depende de que el entorno exponga las claves como propiedades
 * enumerables, y hay entornos que no lo hacen. La prueba lo cazó devolviendo cero claves con el
 * almacén lleno, que aquí habría significado un botón de borrado que no borra nada.
 */

/** Todo lo que la aplicación guarda usa este prefijo. */
export const PREFIJO = "solarme.";

/** Qué hay guardado, para poder decirlo antes de borrarlo. */
export interface Inventario {
  /** Cuántos proyectos hay en la cartera. */
  proyectos: number;
  /** Cuántos contactos hay en la libreta. */
  contactos: number;
  /** True si hay datos del negocio. */
  negocio: boolean;
  /** Cuántos precios y costos capturó el instalador. */
  precios: number;
  /** Claves que se van a borrar. Se expone para que la prueba pueda comprobar que no sobra nada. */
  claves: string[];
}

/** Las claves de la aplicación que hay ahora en el almacén. */
function clavesPropias(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIJO)) out.push(k);
    }
  } catch {
    return [];
  }
  return out;
}

const cuantos = (clave: string): number => {
  try {
    const bruto = localStorage.getItem(clave);
    if (!bruto) return 0;
    const v = JSON.parse(bruto);
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") return Object.keys(v).length;
    return 0;
  } catch {
    return 0;
  }
};

/**
 * Lo que hay ahora mismo en el almacén.
 *
 * Se cuenta leyendo el almacén y no el estado de React: este inventario se muestra justo antes de
 * una acción irreversible, y tiene que describir lo que de verdad se va a borrar.
 */
export function inventarioDatos(): Inventario {
  const claves = clavesPropias();

  const negocioBruto = localStorage.getItem(`${PREFIJO}negocio.v1`);
  let negocio = false;
  if (negocioBruto) {
    try {
      const n = JSON.parse(negocioBruto) as Record<string, unknown>;
      negocio = Boolean(n?.nombre || n?.telefono || n?.correo || n?.domicilio);
    } catch {
      negocio = false;
    }
  }

  return {
    proyectos: cuantos(`${PREFIJO}projects.v1`),
    contactos: cuantos(`${PREFIJO}contactos.v1`),
    negocio,
    precios: cuantos(`${PREFIJO}quotes.v1`) + cuantos(`${PREFIJO}bos.v1`),
    claves,
  };
}

/** True si hay algo que borrar. Con el almacén vacío el botón no debería ni ofrecerse. */
export function hayDatos(i: Inventario = inventarioDatos()): boolean {
  return i.claves.length > 0;
}

/**
 * Describe en una frase lo que se va a borrar, para decirlo antes de hacerlo.
 *
 * No dice «todos tus datos», que no informa de nada: dice cuántos proyectos, cuántos contactos y si
 * están sus precios, porque quien lee esto está a un clic de perderlo.
 */
export function resumenDeBorrado(i: Inventario = inventarioDatos()): string {
  const piezas: string[] = [];
  if (i.proyectos > 0) {
    piezas.push(`${i.proyectos} ${i.proyectos === 1 ? "proyecto" : "proyectos"}`);
  }
  if (i.contactos > 0) {
    piezas.push(`${i.contactos} ${i.contactos === 1 ? "contacto" : "contactos"} de la libreta`);
  }
  if (i.negocio) piezas.push("los datos de tu negocio");
  if (i.precios > 0) piezas.push("tus precios");
  if (piezas.length === 0) return "No hay nada guardado en este navegador.";
  // El verbo concuerda con lo enumerado: «Se borrará 1 proyecto», pero «Se borrarán 2 contactos» y
  // «Se borrarán los datos de tu negocio». Solo va en singular cuando hay una única pieza y esa
  // pieza es una sola cosa.
  const unaSolaCosa = piezas.length === 1 && piezas[0].startsWith("1 ");
  const verbo = unaSolaCosa ? "Se borrará" : "Se borrarán";
  if (piezas.length === 1) return `${verbo} ${piezas[0]}.`;
  return `${verbo} ${piezas.slice(0, -1).join(", ")} y ${piezas[piezas.length - 1]}.`;
}

/**
 * Borra todo. Devuelve cuántas claves se quitaron.
 *
 * No recarga la página por su cuenta: quien lo llama decide, porque el estado en memoria de la
 * interfaz sigue vivo después de esto y mostrar la cartera de unos datos que ya no existen sería
 * peor que el problema que resuelve.
 */
export function borrarTodo(): number {
  const claves = clavesPropias();
  try {
    for (const k of claves) localStorage.removeItem(k);
    return claves.length;
  } catch {
    return 0;
  }
}
