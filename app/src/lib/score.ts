import { panelCount, orientationFactor, LOSS, type Panel } from "./solar";
import { panelFit, type Roof, type PanelFit } from "./dims";

/** Panel más la energía que entrega en el techo actual; `null` cuando no hay techo. */
type Measured = Panel & { kwhFit: number | null };

/**
 * Puntuación de compatibilidad de módulos.
 *
 * La versión anterior comparaba cada atributo contra rangos supuestos a mano y se
 * saturaba: con la base CEC real, 134 de 140 módulos daban exactamente 100 en el modo
 * "máxima potencia por m²" y solo salían 5 valores distintos. Un recomendador que
 * recomienda todo por igual no recomienda nada.
 *
 * Ahora cada atributo se normaliza contra el rango observado en el propio catálogo, así
 * que el mejor módulo del conjunto queda cerca de 100, el peor cerca de 0 y el resto se
 * reparte. Se recalibra solo si el catálogo cambia, que es lo que pasará cuando el
 * scraper traiga más marcas.
 */

/** Atributos que entran en el puntaje y su dirección de bondad. */
type Attr = "eff" | "ppw" | "temp" | "warr" | "kwhFit";

const HIGHER_IS_BETTER: Record<Attr, boolean> = {
  eff: true,    // más eficiencia, mejor
  ppw: false,   // menos precio por watt, mejor
  temp: true,   // coeficiente menos negativo, mejor (se compara el valor con signo)
  warr: true,   // más años de garantía, mejor
  kwhFit: true, // más energía entregada EN ESTE TECHO, mejor
};

/** Pesos base, en modo equilibrado. Suman 1. */
const BASE: Record<Attr, number> = {
  eff: 0.3,
  ppw: 0.3,
  temp: 0.25,
  warr: 0.1,
  kwhFit: 0.05,
};

/**
 * Climas que el recomendador entiende.
 *
 * Son los tres que `climaDe` deriva de la temperatura medida MÁS «humedo», que no se puede
 * derivar porque el catálogo no tiene dato de humedad y solo se elige a mano.
 *
 * Antes esta función recibía `clima: string` y resolvía con `CLIMA[clima] ?? {}`. Un valor mal
 * escrito —«húmedo» con acento, «calido », un cambio de nombre a medias— caía a los pesos base
 * SIN ERROR: el recomendador seguía recomendando, con el perfil equivocado y en silencio. Cerrar
 * el tipo convierte eso en un fallo de compilación, y `climaValido` lo convierte en un rechazo
 * explícito allí donde entra texto de la interfaz.
 */
export type ClimaPuntaje = "calido" | "templado" | "fresco" | "humedo";

/** `true` si el texto es un clima que el recomendador entiende. Para el borde de la interfaz. */
export function climaValido(v: string): v is ClimaPuntaje {
  return v === "calido" || v === "templado" || v === "fresco" || v === "humedo";
}

/** Cómo cada clima reordena las prioridades. Un clima nuevo obliga a declarar su perfil. */
const CLIMA: Record<ClimaPuntaje, Partial<Record<Attr, number>>> = {
  // Con calor fuerte el coeficiente de temperatura domina: es lo que se pierde a mediodía.
  calido: { temp: 0.45, eff: 0.2, ppw: 0.2, warr: 0.05, kwhFit: 0.1 },
  templado: {},
  // Con la celda cerca de 36 °C la diferencia entre coeficientes se estrecha a la mitad, así que
  // pesa más la eficiencia (cuántos watts caben) que el comportamiento térmico.
  fresco: { eff: 0.3, kwhFit: 0.25, ppw: 0.25, temp: 0.1, warr: 0.1 },
  // En costa la garantía y el respaldo pesan más por corrosión y humedad.
  humedo: { warr: 0.25, temp: 0.25, eff: 0.2, ppw: 0.2, kwhFit: 0.1 },
};

/** Cómo la prioridad del cliente reordena las prioridades. */
const PRIO: Record<string, Partial<Record<Attr, number>>> = {
  balance: {},
  // Techo chico: lo que importa es cuántos watts entran por metro cuadrado.
  espacio: { kwhFit: 0.55, eff: 0.2, temp: 0.1, ppw: 0.1, warr: 0.05 },
  precio: { ppw: 0.5, kwhFit: 0.2, eff: 0.1, temp: 0.15, warr: 0.05 },
  calidad: { warr: 0.3, temp: 0.3, eff: 0.2, ppw: 0.1, kwhFit: 0.1 },
};

const ATTRS = Object.keys(BASE) as Attr[];

/**
 * Rango observado de cada atributo en el catálogo.
 *
 * `hasData` distingue dos situaciones que no son iguales: que todos los módulos compartan el
 * mismo valor, y que el atributo no tenga valor. La garantía es el segundo caso —la base CEC
 * no la publica y `warr` es null— y un atributo sin dato no puede pesar en el puntaje.
 */
function ranges(panels: Measured[]) {
  const r = {} as Record<Attr, { min: number; max: number; hasData: boolean }>;
  for (const a of ATTRS) {
    let min = Infinity, max = -Infinity, n = 0;
    for (const p of panels) {
      const v = p[a];
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      n++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    r[a] = { min, max, hasData: n > 0 && max > min };
  }
  return r;
}

/**
 * Normaliza un valor a 0–1 dentro del rango del catálogo.
 *
 * Si todos los módulos comparten el mismo valor (hoy pasa con la garantía: los 140 son de
 * 25 años) el atributo no aporta información y devuelve un 0.5 neutro, en vez de inventar
 * una diferencia que no existe.
 */
function norm(value: number, attr: Attr, r: { min: number; max: number; hasData: boolean }) {
  const span = r.max - r.min;
  if (!r.hasData || span === 0) return 0.5;
  const t = (value - r.min) / span;
  return HIGHER_IS_BETTER[attr] ? t : 1 - t;
}

/**
 * Cuánto manda la prioridad del cliente cuando choca con el clima del sitio.
 *
 * 0.6 significa que la prioridad pesa más, que es la intención declarada, pero no borra al
 * clima. Antes se combinaba con `{ ...BASE, ...CLIMA, ...PRIO }` y los perfiles de prioridad
 * declaran LOS CINCO atributos, así que sobreescribían el clima por completo: medido, con
 * «espacio», «precio» o «calidad» los cuatro climas daban los 140 puntajes idénticos. Solo
 * «balance» dejaba pasar el clima, porque su perfil está vacío.
 *
 * La consecuencia era grave y silenciosa: un instalador en Mexicali que priorizaba espacio
 * recibía una recomendación que ignoraba los 50 °C, mientras la interfaz seguía mostrando el
 * clima como medido y activo.
 */
const PESO_PRIORIDAD = 0.6;

/**
 * Pesos efectivos: la prioridad del cliente pesa más que el clima del sitio, sin anularlo.
 *
 * Los atributos sin dato quedan en 0 y su peso se reparte entre los demás. Si no se hiciera,
 * en modo "calidad" el 30 % del puntaje sería una constante de 0.5 para todos y aplastaría la
 * separación entre módulos justo en el modo que más necesita discriminar.
 */
function weights(
  clima: ClimaPuntaje,
  prio: string,
  usable: Record<Attr, { hasData: boolean }>
): Record<Attr, number> {
  const porClima = { ...BASE, ...(CLIMA[clima] ?? {}) };
  const porPrio = { ...BASE, ...(PRIO[prio] ?? {}) };
  const hayClima = Object.keys(CLIMA[clima] ?? {}).length > 0;
  const hayPrio = Object.keys(PRIO[prio] ?? {}).length > 0;

  // Con uno solo de los dos declarado no hay nada que mezclar: se usa tal cual, que es el
  // comportamiento que ya funcionaba. La mezcla solo entra donde antes se perdía el clima.
  // Los tres perfiles suman 1, así que una combinación convexa también suma 1.
  const w: Record<Attr, number> = ATTRS.reduce((acc, a) => {
    acc[a] =
      hayClima && hayPrio
        ? (1 - PESO_PRIORIDAD) * porClima[a] + PESO_PRIORIDAD * porPrio[a]
        : hayPrio
          ? porPrio[a]
          : porClima[a];
    return acc;
  }, {} as Record<Attr, number>);

  const live = ATTRS.filter((a) => usable[a].hasData);
  const total = live.reduce((s, a) => s + w[a], 0);
  // Si NINGÚN atributo tiene varianza —catálogo de un solo módulo, o de gemelos— no hay nada
  // que comparar. Reparto el peso por igual para que norm() devuelva su 0.5 neutro y el
  // puntaje salga 50, en lugar de 0: un módulo sin rival no es un módulo malo.
  if (total === 0) {
    return ATTRS.reduce((acc, a) => {
      acc[a] = 1 / ATTRS.length;
      return acc;
    }, {} as Record<Attr, number>);
  }
  return ATTRS.reduce((acc, a) => {
    acc[a] = usable[a].hasData ? w[a] / total : 0;
    return acc;
  }, {} as Record<Attr, number>);
}

export interface ScoredPanel extends Panel {
  score: number;
  /** Ajuste medido al techo actual. `undefined` si se puntuó sin techo. */
  fit?: PanelFit;
  /** Aportación de cada atributo al puntaje, para poder explicar la recomendación. */
  breakdown: Record<Attr, number>;
}

/**
 * Puntúa el catálogo completo. Necesita todos los módulos porque la normalización es
 * relativa al conjunto: un puntaje aislado no significaría nada.
 */
export function scorePanels(
  panels: Panel[],
  clima: ClimaPuntaje,
  prio: string,
  roof?: Roof
): ScoredPanel[] {
  if (panels.length === 0) return [];

  // La energía entregada solo existe si hay un techo. Sin él el atributo queda nulo para todos
  // y el reparto de peso lo descarta, en vez de sustituirlo por una constante.
  const fits = roof
    ? panels.map((p) => panelFit(p, roof, { panelCount, orientationFactor, loss: LOSS }))
    : null;
  const withFit = panels.map((p, i) => ({
    ...p,
    kwhFit: fits ? fits[i].kwh : null,
  })) as Measured[];

  const r = ranges(withFit);
  const w = weights(clima, prio, r);

  return withFit.map((p, i) => {
    const breakdown = {} as Record<Attr, number>;
    let sum = 0;
    for (const a of ATTRS) {
      const v = p[a];
      // Un valor ausente es NEUTRO, no cero: si a un módulo le falta el dato, restarle el peso
      // completo lo castigaría por un hueco de la fuente, no por ser peor.
      const contrib = (v === null || v === undefined ? 0.5 : norm(v, a, r[a])) * w[a];
      breakdown[a] = contrib;
      sum += contrib;
    }
    return {
      ...p,
      score: Math.round(Math.max(0, Math.min(1, sum)) * 100),
      breakdown,
      fit: fits ? fits[i] : undefined,
    };
  });
}

/** Etiquetas legibles de los atributos, para explicar por qué gana un módulo. */
export const ATTR_LABEL: Record<Attr, string> = {
  eff: "eficiencia",
  ppw: "precio por watt",
  temp: "comportamiento con calor",
  warr: "garantía",
  kwhFit: "energía en tu techo",
};

/** El atributo que más aporta al puntaje de un módulo. */
export function topReason(p: ScoredPanel): string {
  const best = (Object.keys(p.breakdown) as Attr[]).reduce((a, b) =>
    p.breakdown[b] > p.breakdown[a] ? b : a,
  );
  return ATTR_LABEL[best];
}
