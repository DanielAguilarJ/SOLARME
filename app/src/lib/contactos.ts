/**
 * Libreta de contactos del instalador.
 *
 * Por qué esto y no un directorio de empresas: un directorio donde el usuario BUSCA instaladores
 * necesita que esos instaladores se hayan dado de alta en algún lugar compartido, o sea un
 * servidor. Esta aplicación no lo tiene: todo vive en el almacenamiento del navegador. Llenarlo de
 * empresas inventadas con un cartel de «datos de demostración» era honesto pero inútil.
 *
 * Lo que SÍ puede existir sin servidor, y hace falta de verdad: la libreta que el instalador ya
 * tiene repartida entre los contactos del teléfono y un grupo de WhatsApp. Hace falta porque lo que
 * esta aplicación calcula —el conductor, la protección, la lista de la CRE— necesita la firma de un
 * responsable con registro, y porque una obra se reparte entre cuadrilla, electricista y
 * distribuidor. Es dato real, del usuario, y sale en su respaldo.
 */

export type Rol = "electricista" | "cuadrilla" | "distribuidor" | "otro";

export const ROLES: { clave: Rol; nombre: string; nota: string }[] = [
  {
    clave: "electricista",
    nombre: "Electricista responsable",
    nota: "quien firma el plano y la conformidad de la instalación",
  },
  { clave: "cuadrilla", nombre: "Cuadrilla de montaje", nota: "quien sube y fija los módulos" },
  { clave: "distribuidor", nombre: "Distribuidor", nota: "de quien salen módulos, inversor y estructura" },
  { clave: "otro", nombre: "Otro", nota: "gestoría, grúa, obra civil" },
];

export interface Contacto {
  id: string;
  nombre: string;
  rol: Rol;
  /** Teléfono como lo escribió el usuario. No se normaliza: los formatos mexicanos varían. */
  telefono?: string;
  correo?: string;
  ciudad?: string;
  /** Registro o cédula del responsable. Solo tiene sentido para quien firma. */
  registro?: string;
  notas?: string;
  creadoEn: number;
}

export const CLAVE_ALMACEN = "solarme.contactos.v1";

/** Nombre y rol son lo mínimo: sin ellos la fila no dice nada. */
export function contactoValido(c: Partial<Contacto>): boolean {
  if (typeof c.nombre !== "string" || c.nombre.trim().length < 2) return false;
  return ROLES.some((r) => r.clave === c.rol);
}

/**
 * Valida un registro leído del almacenamiento o de un archivo importado.
 *
 * Todo lo que viene de fuera es entrada no confiable, igual que en `transfer.ts`: un campo con el
 * tipo equivocado se descarta en vez de propagarse y romper la vista al renderizar.
 */
export function sanear(x: unknown): Contacto | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!contactoValido(o as Partial<Contacto>)) return null;
  const texto = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
  return {
    id: typeof o.id === "string" && o.id ? o.id : `c${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
    nombre: (o.nombre as string).trim().slice(0, 80),
    rol: o.rol as Rol,
    telefono: texto(o.telefono, 32),
    correo: texto(o.correo, 120),
    ciudad: texto(o.ciudad, 60),
    registro: texto(o.registro, 40),
    notas: texto(o.notas, 300),
    creadoEn: typeof o.creadoEn === "number" && o.creadoEn > 0 ? o.creadoEn : Date.now(),
  };
}

export function leerContactos(): Contacto[] {
  try {
    const raw = localStorage.getItem(CLAVE_ALMACEN);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanear).filter((c): c is Contacto => c !== null);
  } catch {
    return [];
  }
}

export function guardarContactos(cs: Contacto[]): void {
  try {
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(cs));
  } catch {
    // Sin espacio no se pierde lo que ya está en memoria; la interfaz sigue funcionando.
  }
  // Se avisa incluso si el guardado falló: quien escuche vuelve a leer y descubre la discrepancia,
  // que es mejor que dejarla escondida.
  avisar();
}

/* ---------- aviso de cambios ---------- */

/**
 * Quien muestre la libreta fuera de su propia vista necesita enterarse cuando cambia.
 *
 * La barra lateral leía la cuenta una sola vez al montar y no se remontaba nunca, así que se
 * quedaba atrasada en silencio. Esto es lo mínimo que lo arregla sin meter una librería de estado.
 *
 * Aquí hubo una caché de la cuenta, justificada con que `useSyncExternalStore` necesita una
 * instantánea estable. Era falso: la instantánea es un NÚMERO y React la compara con `Object.is`,
 * así que recalcularla da siempre el mismo valor. La caché sólo evitaba parsear JSON, y a cambio
 * dejaba la cuenta vieja si alguien vaciaba el almacenamiento por detrás. Se quitó.
 */
type Oyente = () => void;
const oyentes = new Set<Oyente>();

const avisar = () => {
  for (const o of oyentes) o();
};

/** Cuántos contactos hay. Se lee cada vez: nunca puede quedar atrasada. */
export function contarContactos(): number {
  return leerContactos().length;
}

/**
 * Escucha cambios en la libreta y devuelve cómo dejar de escuchar.
 *
 * Cubre también el evento `storage`, que sólo dispara en OTRAS pestañas: si el instalador tiene la
 * app abierta dos veces, la que no editó también se pone al día.
 */
export function suscribir(o: Oyente): () => void {
  oyentes.add(o);

  // Sin `window` —render en servidor, o una prueba sin DOM— la parte de otras pestañas simplemente
  // no aplica. La suscripción local sigue funcionando en vez de reventar.
  if (typeof window === "undefined") return () => { oyentes.delete(o); };

  const deOtraPestana = (e: StorageEvent) => {
    if (e.key === null || e.key === CLAVE_ALMACEN) avisar();
  };
  window.addEventListener("storage", deOtraPestana);
  return () => {
    oyentes.delete(o);
    window.removeEventListener("storage", deOtraPestana);
  };
}

/** Orden de presentación: primero quien firma, y dentro de cada rol lo más reciente. */
const PESO: Record<Rol, number> = { electricista: 0, cuadrilla: 1, distribuidor: 2, otro: 3 };

export function ordenar(cs: Contacto[]): Contacto[] {
  return [...cs].sort((a, b) => PESO[a.rol] - PESO[b.rol] || b.creadoEn - a.creadoEn);
}

export function buscar(cs: Contacto[], q: string): Contacto[] {
  const t = q.trim().toLowerCase();
  if (!t) return cs;
  return cs.filter((c) =>
    [c.nombre, c.ciudad, c.registro, c.notas, c.telefono, c.correo]
      .some((v) => v?.toLowerCase().includes(t))
  );
}

/**
 * Cuántos contactos hay por rol, y si falta el que la app necesita.
 *
 * `sinResponsable` es la única alerta que se muestra, y no es un adorno: la propuesta imprime una
 * lista de trámites ante la CRE y un cálculo de conductor que alguien con registro tiene que firmar.
 * Sin ese contacto en la libreta, el trabajo se queda en el escritorio.
 */
export function resumen(cs: Contacto[]) {
  const por = { electricista: 0, cuadrilla: 0, distribuidor: 0, otro: 0 } as Record<Rol, number>;
  for (const c of cs) por[c.rol]++;
  return { por, total: cs.length, sinResponsable: por.electricista === 0 && cs.length > 0 };
}
