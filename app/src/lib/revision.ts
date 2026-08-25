import { compute, cityOfProject, type Design } from "./solar";
import type { Site } from "./site";

/**
 * Qué le falta a un proyecto para que sus números se puedan defender frente al cliente.
 *
 * Todo lo que se lista aquí sale del estado real del diseño, no de un supuesto. Es la
 * información que la pantalla de inicio debería dar en lugar de un saludo: al abrir la app por la
 * mañana, lo que un instalador necesita saber es cuál de sus propuestas todavía descansa sobre una
 * suposición, porque eso es lo que le cuesta una segunda visita.
 */
export type Gravedad = "impide" | "estima";

export interface Hallazgo {
  clave: string;
  /** `impide`: la propuesta no se puede entregar. `estima`: se puede, con una cifra supuesta. */
  gravedad: Gravedad;
  /** Qué pasa, en una línea, sin jerga. */
  texto: string;
  /** Qué hacer al respecto. */
  accion: string;
}

/** Orden de presentación: primero lo que impide entregar. */
const PESO: Record<Gravedad, number> = { impide: 0, estima: 1 };

/**
 * `site` se recibe aparte y no se lee de `design.site` a propósito: `paraGuardar` lo elimina en el
 * límite de persistencia —es física derivada, no dato del proyecto— así que en un proyecto
 * almacenado siempre viene vacío. Leerlo de ahí marcaría "usa el promedio nacional" incluso en
 * ciudades medidas. `revisarProyecto` lo resuelve de la dirección, igual que al abrir el proyecto.
 */
export function revisar(design: Design, site?: Site): Hallazgo[] {
  const r = compute(site ? { ...design, site } : design);
  const h: Hallazgo[] = [];

  if (r.noCabe) {
    h.push({
      clave: "no-cabe",
      gravedad: "impide",
      texto: "No cabe ningún módulo con la superficie y los obstáculos capturados",
      accion: "Revisa el contorno o el módulo elegido",
    });
  }

  if (r.outlineInvalido) {
    h.push({
      clave: "contorno-invalido",
      gravedad: "impide",
      texto: "El contorno del techo se cruza consigo mismo, así que se está usando un cuadrado",
      accion: "Corrige los vértices",
    });
  }

  if (r.strings && !r.strings.rango.viable) {
    h.push({
      clave: "string-inviable",
      gravedad: "impide",
      texto: "El módulo no combina con la ventana de inversor elegida en este sitio",
      accion: "Cambia de ventana o de módulo",
    });
  }

  if (!(site ?? design.site)) {
    h.push({
      clave: "sin-sitio",
      gravedad: "estima",
      texto: "La producción usa el promedio nacional, no la de una ciudad medida",
      accion: "Escribe la ciudad para usar su rendimiento real",
    });
  }

  if (!design.bill) {
    h.push({
      clave: "sin-recibo",
      gravedad: "estima",
      texto: "El ahorro parte de una tarifa promedio, no del recibo del cliente",
      accion: "Captura dos números del recibo CFE",
    });
  }

  if (!r.outlineMedido) {
    h.push({
      clave: "sin-contorno",
      gravedad: "estima",
      texto: "La superficie es un cuadrado supuesto, no el techo real",
      accion: "Traza el contorno sobre el plano",
    });
  }

  if (!design.obstacles || design.obstacles.length === 0) {
    h.push({
      clave: "sin-obstaculos",
      gravedad: "estima",
      texto: "No hay obstáculos capturados: el sombreado viene del deslizador",
      accion: "Marca tinacos, muros y árboles",
    });
  }

  return h.sort((a, b) => PESO[a.gravedad] - PESO[b.gravedad]);
}

/** Lo mínimo que identifica un proyecto para revisarlo: su dirección resuelve la física. */
export interface Revisable {
  address: string;
  /** Nombre de ciudad ya resuelto al crear el proyecto. Manda sobre la dirección. */
  city?: string;
  design: Design;
}

/** Revisa un proyecto almacenado resolviendo su sitio desde la dirección. */
export function revisarProyecto(p: Revisable): Hallazgo[] {
  return revisar(p.design, p.design.site ?? cityOfProject(p).city.site);
}

/** Cuenta cuántos proyectos tienen algo que impide entregar y cuántos algo estimado. */
export function resumenCartera(proyectos: Revisable[]) {
  let impiden = 0;
  let estiman = 0;
  for (const p of proyectos) {
    const h = revisarProyecto(p);
    if (h.some((x) => x.gravedad === "impide")) impiden++;
    else if (h.length > 0) estiman++;
  }
  return { impiden, estiman, listos: proyectos.length - impiden - estiman };
}
