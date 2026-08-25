import { loadProjects, paraGuardar, type Project } from "./storage";
import type { Design, Panel, ProjectType } from "./solar";
import type { Obstacle, ObstacleKind } from "./shading";
import type { Punto } from "./polygon";
import { sanear, type Contacto } from "./contactos";

/**
 * Exportar e importar la cartera como archivo.
 *
 * No sustituye a un backend: los proyectos siguen viviendo en el navegador. Resuelve lo que
 * duele hoy —respaldar, cambiar de computadora, pasarle un proyecto a un colega— sin pedirle
 * al instalador que confíe su trabajo a un solo perfil de Chrome.
 *
 * Un archivo importado es una ENTRADA NO CONFIABLE, aunque venga del propio usuario: pudo
 * editarlo a mano, venir de una versión vieja o llegar truncado. Se valida campo por campo y
 * se DESCARTA lo que no cuadra en vez de fallar todo, informando cuántos se omitieron. Un
 * respaldo con un proyecto corrupto no debe costarle los otros veinte.
 */

export const FORMATO = "solarme.cartera";
export const VERSION = 1;

interface Archivo {
  formato: string;
  version: number;
  exportado: string;
  proyectos: Project[];
  /** La libreta de la obra. Opcional: un archivo de una versión anterior no la trae. */
  contactos?: Contacto[];
}

const ESTADOS = ["borrador", "propuesta", "ganado"] as const;
const TIPOS: ProjectType[] = ["res", "com", "ind"];
const CLASES: ObstacleKind[] = ["tinaco", "chimenea", "pretil", "arbol", "edificio", "otro"];

const esNumero = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const esTexto = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function exportProjects(
  list: Project[],
  ahora = new Date(),
  contactos: Contacto[] = []
): string {
  const doc: Archivo = {
    formato: FORMATO,
    version: VERSION,
    exportado: ahora.toISOString(),
    // se exporta lo mismo que se guarda: sin la física del sitio, que se recalcula al abrir
    proyectos: list.map(paraGuardar),
    // La libreta viaja con la cartera. La vista promete que lo hace, así que tiene que hacerlo:
    // es dato del usuario que se pierde con el navegador y no se puede recuperar de ningún lado.
    contactos,
  };
  return JSON.stringify(doc, null, 1);
}

export function nombreArchivo(ahora = new Date()): string {
  const f = ahora.toISOString().slice(0, 10);
  return `solarme-cartera-${f}.json`;
}

function validaPunto(v: unknown): Punto | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  return esNumero(p.x) && esNumero(p.y) ? { x: p.x, y: p.y } : null;
}

function validaContorno(v: unknown): Punto[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const pts = v.map(validaPunto);
  // un contorno a medias es peor que ninguno: se descarta entero
  if (pts.some((p) => p === null) || pts.length < 3) return undefined;
  return pts as Punto[];
}

function validaObstaculo(v: unknown): Obstacle | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!esTexto(o.id) || !esTexto(o.kind)) return null;
  if (!CLASES.includes(o.kind as ObstacleKind)) return null;
  for (const k of ["height", "x", "y", "width", "depth"]) {
    if (!esNumero(o[k])) return null;
  }
  const h = o.height as number;
  const w = o.width as number;
  const d = o.depth as number;
  // cotas de cordura: una azotea no tiene un estorbo de 200 m ni de ancho cero
  if (h <= 0 || h > 30 || w <= 0 || w > 50 || d <= 0 || d > 50) return null;
  return {
    id: o.id, kind: o.kind as ObstacleKind, height: h,
    x: o.x as number, y: o.y as number, width: w, depth: d,
  };
}

function validaPanel(v: unknown): Panel | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (!esTexto(p.brand) || !esTexto(p.model)) return null;
  for (const k of ["w", "eff", "temp", "area"]) {
    if (!esNumero(p[k])) return null;
  }
  const w = p.w as number;
  const eff = p.eff as number;
  const area = p.area as number;
  if (w < 50 || w > 1200 || eff <= 0 || eff > 40 || area <= 0 || area > 10) return null;

  // Los datos eléctricos SÍ se importan: son identidad durable del módulo, igual que la marca
  // y el modelo, y sin ellos no se puede dimensionar un string. Se validan con cotas físicas:
  // un módulo de silicio ronda 30–60 V de Voc y el CdTe de First Solar llega a 230; `betaVoc`
  // tiene que ser NEGATIVO, porque el frío sube el voltaje, y un signo invertido produciría el
  // error opuesto al que este cálculo existe para evitar.
  for (const k of ["voc", "vmp", "isc", "imp", "betaVoc"]) {
    if (!esNumero(p[k])) return null;
  }
  const voc = p.voc as number;
  const vmp = p.vmp as number;
  const isc = p.isc as number;
  const imp = p.imp as number;
  const betaVoc = p.betaVoc as number;
  if (voc <= 5 || voc > 400 || vmp <= 0 || vmp >= voc) return null;
  if (isc <= 0 || isc > 40 || imp <= 0 || imp >= isc) return null;
  if (betaVoc >= 0 || betaVoc < -2) return null;

  return {
    brand: p.brand, model: p.model, w, eff, temp: p.temp as number, area,
    voc, vmp, isc, imp, betaVoc,
    // el precio NO se importa: se recalcula con el modelo vigente, igual que al abrir un
    // proyecto guardado. Un archivo viejo traería una banda vieja.
    ppw: 0,
    priceOrigin: "banda",
    warr: esNumero(p.warr) ? (p.warr as number) : null,
  };
}

function validaDiseño(v: unknown): Design | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  for (const k of ["lat", "lng", "yield", "area", "tilt", "az", "shade"]) {
    if (!esNumero(d[k])) return null;
  }
  const lat = d.lat as number;
  const lng = d.lng as number;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const area = d.area as number;
  const tilt = d.tilt as number;
  const az = d.az as number;
  const shade = d.shade as number;
  if (area < 0 || area > 100000) return null;
  if (tilt < 0 || tilt > 90 || az < 0 || az > 360 || shade < 0 || shade > 100) return null;
  if (!TIPOS.includes(d.type as ProjectType)) return null;

  const panel = validaPanel(d.panel);
  if (!panel) return null;

  const obstacles = Array.isArray(d.obstacles)
    ? (d.obstacles.map(validaObstaculo).filter((o): o is Obstacle => o !== null))
    : undefined;

  let bill: Design["bill"];
  if (d.bill && typeof d.bill === "object") {
    const b = d.bill as Record<string, unknown>;
    if (esNumero(b.kwh) && esNumero(b.amount) && (b.period === "mes" || b.period === "bim")) {
      if (b.kwh > 0 && b.amount > 0) bill = { kwh: b.kwh, amount: b.amount, period: b.period };
    }
  }

  return {
    lat, lng, yield: d.yield as number, area, tilt, az, shade,
    type: d.type as ProjectType, panel,
    outline: validaContorno(d.outline),
    obstacles: obstacles && obstacles.length > 0 ? obstacles : undefined,
    bill,
    // `site` nunca se importa: se deriva de la dirección al abrir el proyecto
  };
}

function validaProyecto(v: unknown): Project | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (!esTexto(p.id) || !esTexto(p.address)) return null;
  if (!esNumero(p.createdAt) || p.createdAt <= 0) return null;
  const estado = ESTADOS.includes(p.status as (typeof ESTADOS)[number])
    ? (p.status as Project["status"])
    : "borrador";
  const design = validaDiseño(p.design);
  if (!design) return null;
  return {
    id: p.id, address: p.address,
    city: esTexto(p.city) ? p.city : "",
    design, createdAt: p.createdAt, status: estado,
  };
}

export interface Importado {
  proyectos: Project[];
  /** Contactos del archivo, ya saneados. Vacío si el archivo no traía libreta. */
  contactos: Contacto[];
  /** Entradas descartadas por no pasar la validación. */
  omitidos: number;
  /** Motivo cuando el archivo entero no sirve. */
  error?: string;
}

export function importProjects(texto: string): Importado {
  let doc: unknown;
  try {
    doc = JSON.parse(texto);
  } catch {
    return { proyectos: [], contactos: [], omitidos: 0, error: "El archivo no es un JSON válido." };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { proyectos: [], contactos: [], omitidos: 0, error: "El archivo no tiene la forma esperada." };
  }
  const a = doc as Record<string, unknown>;
  if (a.formato !== FORMATO) {
    return { proyectos: [], contactos: [], omitidos: 0, error: "El archivo no es una cartera de SolarMe." };
  }
  if (!esNumero(a.version) || (a.version as number) > VERSION) {
    return {
      proyectos: [], contactos: [], omitidos: 0,
      error: "El archivo viene de una versión más nueva de SolarMe.",
    };
  }
  if (!Array.isArray(a.proyectos)) {
    return { proyectos: [], contactos: [], omitidos: 0, error: "El archivo no trae proyectos." };
  }

  const validos: Project[] = [];
  for (const bruto of a.proyectos) {
    const p = validaProyecto(bruto);
    if (p) validos.push(p);
  }
  // La libreta se sanea con su propia validación, no con la de proyectos: un contacto roto se
  // descarta y cuenta como omitido, igual que un proyecto roto.
  const contactos: Contacto[] = Array.isArray(a.contactos)
    ? a.contactos.map(sanear).filter((c): c is Contacto => c !== null)
    : [];
  const omitidosContactos = Array.isArray(a.contactos)
    ? a.contactos.length - contactos.length
    : 0;

  return {
    proyectos: validos,
    contactos,
    omitidos: a.proyectos.length - validos.length + omitidosContactos,
  };
}

/**
 * Une lo importado con lo que ya hay, sin perder nada.
 *
 * Los proyectos con un id que ya existe se omiten: son el mismo proyecto, y sobrescribir
 * silenciosamente el trabajo local con una copia vieja del respaldo sería la peor variante.
 * Quien quiera reemplazar puede borrar y volver a importar.
 */
/**
 * Carga la cartera del navegador DESCARTANDO lo que esté malformado.
 *
 * `loadProjects` hace un casting a ciegas: si el JSON del almacén es un arreglo, lo devuelve tal
 * cual. Con eso, un proyecto escrito a medias —un cierre de pestaña durante el guardado, un
 * proyecto de una versión anterior con otra forma— entra en el estado de React y puede romper el
 * renderizado.
 *
 * Antes de que existiera el límite de error, eso era una pantalla en blanco. Con el límite es
 * peor de lo que parece: la pantalla de recuperación aparece, pero «volver a intentar» falla
 * SIEMPRE, porque el almacén sigue teniendo la entrada mala. El instalador queda encerrado con
 * un solo recurso, descargar el respaldo.
 *
 * Vive aquí y no en `storage.ts` porque la validación por proyecto ya está escrita en este
 * archivo para la importación, y `transfer` ya depende de `storage`. Ponerlo al revés haría un
 * ciclo, y escribir una segunda validación en el almacén garantizaría que las dos se desvíen.
 * Un archivo importado y un proyecto recuperado del almacén deben pasar por la MISMA regla.
 */
export function cargarCarteraSegura(): { proyectos: Project[]; descartados: number } {
  const crudos = loadProjects();
  const validos = crudos.map(validaProyecto).filter((p): p is Project => p !== null);
  return { proyectos: validos, descartados: crudos.length - validos.length };
}

export function fusionar(actuales: Project[], entrantes: Project[]): {
  lista: Project[];
  agregados: number;
  repetidos: number;
} {
  const vistos = new Set(actuales.map((p) => p.id));
  const nuevos = entrantes.filter((p) => !vistos.has(p.id));
  return {
    lista: [...nuevos, ...actuales].sort((a, b) => b.createdAt - a.createdAt),
    agregados: nuevos.length,
    repetidos: entrantes.length - nuevos.length,
  };
}
