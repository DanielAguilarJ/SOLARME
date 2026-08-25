import type { Design } from "./solar";

export interface Project {
  id: string;
  address: string;
  city: string;
  design: Design;
  createdAt: number;
  status: "borrador" | "propuesta" | "ganado";
}

const KEY = "solarme.projects.v1";

/**
 * Quita del diseño lo que NO debe guardarse porque se deriva al abrir.
 *
 * `site` trae la física medida completa del punto —pérdidas por azimut, por inclinación y el
 * perfil mensual— y son 1010 de los 1526 bytes de un proyecto: el 67 % del archivo es dato
 * que `openProject` descarta y vuelve a calcular. Guardarlo no solo ocupa, también invita a
 * que un proyecto viejo cargue una física vieja el día que se re-mida una ciudad.
 *
 * Se hace en la frontera de persistencia y no en quien llama, para que ningún camino futuro
 * pueda colarlo por descuido.
 *
 * Lo que SÍ se guarda es lo durable: la dirección, el contorno trazado, los estorbos, la
 * orientación, el tipo de proyecto, el recibo y la identidad del módulo. Un edificio no
 * cambia de forma ni pierde su tinaco entre sesiones.
 */
export function paraGuardar(p: Project): Project {
  const { site, bosPerW, ...durable } = p.design;
  void site;
  void bosPerW;
  return { ...p, design: durable as Design };
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Project[]) : [];
  } catch {
    return [];
  }
}

/* ---------- aviso de guardado fallido ---------- */

/**
 * Si el último intento de guardar falló.
 *
 * Antes el `catch` estaba vacío con la nota de que la sesión seguía en memoria. Es verdad, y es
 * precisamente el problema: el instalador ve su proyecto en pantalla, cree que está guardado, y
 * al cerrar la pestaña lo pierde. En un teléfono con la cartera llena de contornos y estorbos,
 * quedarse sin espacio es plausible, y perder trabajo EN SILENCIO es el peor fallo posible en un
 * producto cuyo único almacén es el navegador.
 *
 * Se expone como suscripción, igual que la libreta, para que se entere quien lo tenga que decir
 * sin importar qué función provocó el fallo.
 */
let falloGuardado = false;
type Oyente = () => void;
const oyentes = new Set<Oyente>();

export function suscribirGuardado(o: Oyente): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Instantánea estable: un booleano, que React compara con `Object.is`. */
export function guardadoFallo(): boolean {
  return falloGuardado;
}

function persist(list: Project[]) {
  const antes = falloGuardado;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    falloGuardado = false;
  } catch {
    // La sesión sigue en memoria, pero eso NO es estar guardado: hay que decirlo.
    falloGuardado = true;
  }
  if (falloGuardado !== antes) for (const o of oyentes) o();
}

/** Añade un proyecto devolviendo una lista nueva (sin mutar la original). */
export function addProject(list: Project[], p: Project): Project[] {
  const next = [paraGuardar(p), ...list];
  persist(next);
  return next;
}

export function updateProject(list: Project[], id: string, patch: Partial<Project>): Project[] {
  const next = list.map((p) => (p.id === id ? paraGuardar({ ...p, ...patch }) : p));
  persist(next);
  return next;
}

/**
 * Reemplaza la lista completa. Es la primitiva que necesita restaurar un respaldo: guardar de
 * a uno con `addProject` recorrería el almacenamiento tantas veces como proyectos traiga el
 * archivo, y dejaría la lista a medias si algo fallara en medio.
 */
export function replaceProjects(list: Project[]): Project[] {
  const next = list.map(paraGuardar);
  persist(next);
  return next;
}

export function removeProject(list: Project[], id: string): Project[] {
  const next = list.filter((p) => p.id !== id);
  persist(next);
  return next;
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function relativeDate(ts: number) {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  return new Date(ts).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}
