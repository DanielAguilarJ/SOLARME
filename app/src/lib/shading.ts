import { monthlyWeights, type Site } from "./site";
import { areaPoligono, caja, dentro, ladoEnvolvente, type Punto } from "./polygon";

/**
 * Sombreado por obstáculos reales, en lugar de un porcentaje que el instalador adivina.
 *
 * Hasta ahora `Design.shade` era un deslizador de 0 a 35 % capturado a mano: el mismo
 * problema que tenían el precio del módulo y el consumo del cliente antes de medirlos. Un
 * tinaco de 1.2 m en la orilla sur de una azotea de 5 m no cuesta "un 10 %": cuesta una
 * superficie concreta, calculable, que además depende de la latitud y de en qué meses
 * produce ese sitio.
 *
 * Todo el tiempo aquí es HORA SOLAR, no hora de reloj. Se evita así arrastrar la ecuación
 * del tiempo y la diferencia entre el meridiano local y el del huso, que introducirían un
 * error de minutos sin cambiar ninguna decisión de instalación.
 */

/** Obstáculos que un instalador encuentra de verdad en una azotea mexicana. */
export type ObstacleKind = "tinaco" | "chimenea" | "pretil" | "arbol" | "edificio" | "otro";

export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  /** Altura sobre el plano de los módulos, en metros. */
  height: number;
  /** Posición del centro en metros desde la esquina suroeste del área utilizable. */
  x: number;
  y: number;
  /** Huella en planta, en metros. Un tinaco típico ronda 1.1 m de diámetro. */
  width: number;
  depth: number;
}

export const ALTURA_TIPICA: Record<ObstacleKind, { height: number; width: number; depth: number }> = {
  // Rotoplas de 1100 L sobre base: el caso más común de una azotea mexicana.
  tinaco: { height: 1.6, width: 1.2, depth: 1.2 },
  chimenea: { height: 1.0, width: 0.6, depth: 0.6 },
  // Un pretil corre por la orilla; se modela como una pieza larga y delgada.
  pretil: { height: 0.9, width: 6.0, depth: 0.2 },
  arbol: { height: 5.0, width: 3.5, depth: 3.5 },
  edificio: { height: 6.0, width: 8.0, depth: 8.0 },
  otro: { height: 1.0, width: 1.0, depth: 1.0 },
};

export const MAX_ALTURA = 30;
export const MIN_ALTURA = 0.1;

export interface SunPosition {
  /** Grados sobre el horizonte. Negativo significa que el sol no ha salido. */
  elevation: number;
  /** Grados desde el sur: negativo al oriente, positivo al poniente. */
  azimuth: number;
}

const rad = (g: number) => (g * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Declinación solar por la fórmula de Cooper, la misma que usa `spacing.ts` para el
 * solsticio. En el día 355 (21 de diciembre) devuelve aproximadamente −23.45°. */
export function declination(dayOfYear: number): number {
  return 23.45 * Math.sin(rad((360 * (284 + dayOfYear)) / 365));
}

/**
 * Posición del sol para una latitud, un día del año y una hora solar.
 *
 * El azimut se resuelve con la tangente de dos argumentos, no con el arcoseno: en verano y
 * a latitudes por debajo del trópico de Cáncer el sol del mediodía queda al NORTE del
 * cenit, y un arcoseno devolvería el hemisferio equivocado. En Mérida, a 20.97°, eso pasa
 * de verdad durante casi dos meses al año.
 */
export function sunPosition(lat: number, dayOfYear: number, solarHour: number): SunPosition {
  const d = rad(declination(dayOfYear));
  const f = rad(lat);
  const w = rad(15 * (solarHour - 12));

  const senAlt = Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(w);
  const elevation = deg(Math.asin(Math.max(-1, Math.min(1, senAlt))));

  const y = Math.cos(d) * Math.sin(w);
  const x = Math.cos(f) * Math.sin(d) - Math.sin(f) * Math.cos(d) * Math.cos(w);
  // atan2 con el eje de referencia en el sur: 0 = sur, negativo = oriente.
  const azimuth = deg(Math.atan2(y, -x));

  return { elevation, azimuth };
}

/** Día representativo de cada mes: el día 15, que es la convención habitual para promedios
 * mensuales de radiación. */
export const DIA_REPRESENTATIVO = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/** Horas solares evaluadas. Se concentra en la ventana productiva: antes de las 8 y después
 * de las 16 la elevación es tan baja que aporta poco y cualquier obstáculo proyecta sombras
 * enormes que exagerarían la pérdida. */
export const HORAS = [8, 9, 10, 11, 12, 13, 14, 15, 16];

export interface Celda {
  x: number;
  y: number;
}

/**
 * ¿Está esta celda a la sombra de este obstáculo, con este sol?
 *
 * La sombra parte de la huella del obstáculo y se extiende en dirección OPUESTA al sol, con
 * largo igual a `altura / tan(elevación)`. La celda cae en sombra si su centro queda dentro
 * de ese rectángulo barrido. Con el sol bajo la sombra se alarga sin límite, así que se
 * acota: más allá de 60 m ya no hay azotea que la contenga y seguir extendiéndola solo
 * gasta cómputo.
 */
export function enSombra(celda: Celda, obs: Obstacle, sol: SunPosition): boolean {
  if (sol.elevation <= 1) return true; // sin sol útil no hay generación que perder
  const largo = Math.min(60, obs.height / Math.tan(rad(sol.elevation)));
  if (largo <= 0) return false;

  // Vector de la sombra: se aleja del sol. Con el azimut medido desde el sur y positivo al
  // poniente, la dirección HACIA el sol es (−sen, −cos) y la sombra es la opuesta,
  // (sen, cos). Comprobación: azimut 0 (sol al sur) → sombra (0, +1) = al norte; azimut −90
  // (sol al oriente) → sombra (−1, 0) = al poniente.
  const a = rad(sol.azimuth);
  const sx = Math.sin(a);
  const sy = Math.cos(a);

  // se pasa la celda al marco del obstáculo: t a lo largo de la sombra, u perpendicular
  const dx = celda.x - obs.x;
  const dy = celda.y - obs.y;
  const t = dx * sx + dy * sy;
  const u = dx * -sy + dy * sx;

  if (t < 0 || t > largo) return false;
  // ancho efectivo: la mitad de la huella proyectada. Se usa el semiperímetro mayor para no
  // subestimar la sombra de una pieza alargada como un pretil vista de canto.
  const medio = Math.max(obs.width, obs.depth) / 2;
  return Math.abs(u) <= medio;
}

export interface ShadingResult {
  /** Pérdida anual de energía por sombra, como fracción de 0 a 1. */
  loss: number;
  /** Fracción de la superficie que nunca recibe sombra en la ventana evaluada. */
  areaLibre: number;
  /** Celdas utilizables, para dibujar el área realmente aprovechable. */
  libres: Celda[];
  /** Celdas con alguna sombra, con su fracción de tiempo sombreada. */
  sombreadas: { celda: Celda; fraccion: number }[];
  /** Lado del cuadrado equivalente de la azotea, en metros. */
  lado: number;
  /** Área utilizable después de descontar lo que queda inservible. */
  areaUtil: number;
}

export const CELDA_M = 0.5;
/** Una celda sombreada más de este tiempo se considera inservible para montar módulos:
 * un módulo parcialmente sombreado arrastra a su cadena entera, así que colocarlo ahí
 * perjudica más de lo que aporta. */
export const UMBRAL_INSERVIBLE = 0.25;

/**
 * Pérdida por sombra y superficie realmente aprovechable.
 *
 * La pérdida se pondera por la energía que ese sitio produce en cada mes —usando el perfil
 * mensual MEDIDO— y dentro del día por el seno de la elevación, que es proporcional a la
 * irradiancia sobre plano horizontal. Así una sombra de invierno pesa distinto en Tijuana,
 * que produce poco en diciembre, que en Ciudad de México, que produce mucho.
 */
export function computeShading(
  areaM2: number,
  lat: number,
  obstaculos: Obstacle[],
  site?: Site,
  /** Contorno real de la azotea. Sin él se supone un cuadrado de lado √área. */
  outline?: Punto[],
): ShadingResult {
  // Con contorno la superficie es la del polígono y la rejilla recorre su caja envolvente,
  // contando SOLO las celdas de adentro. Escalar por el área recortaría la punta de una L:
  // una L de 27 m² mide 6 m de lado y √27 son 5.2.
  const conContorno = !!outline && outline.length >= 3;
  const area = conContorno ? areaPoligono(outline!) : Math.max(0, areaM2);
  const lado = conContorno ? ladoEnvolvente(outline!) : Math.sqrt(area);
  const { pesos } = monthlyWeights(site);

  const celdas: Celda[] = [];
  if (conContorno) {
    const c = caja(outline!);
    for (let x = c.minX + CELDA_M / 2; x < c.maxX; x += CELDA_M) {
      for (let y = c.minY + CELDA_M / 2; y < c.maxY; y += CELDA_M) {
        if (dentro({ x, y }, outline!)) celdas.push({ x, y });
      }
    }
  } else {
    const n = Math.max(1, Math.floor(lado / CELDA_M));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        celdas.push({ x: (i + 0.5) * CELDA_M, y: (j + 0.5) * CELDA_M });
      }
    }
  }

  // muestras de sol con su peso energético
  const muestras: { sol: SunPosition; peso: number }[] = [];
  for (let m = 0; m < 12; m++) {
    for (const h of HORAS) {
      const sol = sunPosition(lat, DIA_REPRESENTATIVO[m], h);
      if (sol.elevation <= 3) continue; // sol rasante: aporta casi nada
      muestras.push({ sol, peso: pesos[m] * Math.sin(rad(sol.elevation)) });
    }
  }
  const pesoTotal = muestras.reduce((a, x) => a + x.peso, 0);

  if (celdas.length === 0 || pesoTotal === 0 || obstaculos.length === 0) {
    return {
      loss: 0,
      areaLibre: 1,
      libres: celdas,
      sombreadas: [],
      lado,
      areaUtil: area,
    };
  }

  let perdido = 0;
  const libres: Celda[] = [];
  const sombreadas: { celda: Celda; fraccion: number }[] = [];

  for (const celda of celdas) {
    let pesoSombra = 0;
    for (const { sol, peso } of muestras) {
      for (const obs of obstaculos) {
        if (enSombra(celda, obs, sol)) {
          pesoSombra += peso;
          break; // basta un obstáculo: la celda ya está a la sombra
        }
      }
    }
    const fraccion = pesoSombra / pesoTotal;
    perdido += fraccion;
    if (fraccion <= 0.001) libres.push(celda);
    else sombreadas.push({ celda, fraccion });
  }

  const utiles = celdas.length - sombreadas.filter((s) => s.fraccion > UMBRAL_INSERVIBLE).length;

  return {
    loss: perdido / celdas.length,
    areaLibre: libres.length / celdas.length,
    libres,
    sombreadas,
    lado,
    // la superficie que de verdad sirve para montar, no la que existe
    areaUtil: (utiles / celdas.length) * area,
  };
}

/** Valida un obstáculo capturado por el instalador. Se rechaza lo que no cabe en una azotea
 * para que un dedazo no arruine el cálculo en silencio. */
export function esObstaculoValido(o: Partial<Obstacle>, areaM2: number): boolean {
  const lado = Math.sqrt(Math.max(0, areaM2));
  return (
    typeof o.height === "number" && o.height >= MIN_ALTURA && o.height <= MAX_ALTURA &&
    typeof o.width === "number" && o.width > 0 && o.width <= 50 &&
    typeof o.depth === "number" && o.depth > 0 && o.depth <= 50 &&
    typeof o.x === "number" && o.x >= 0 && o.x <= lado &&
    typeof o.y === "number" && o.y >= 0 && o.y <= lado
  );
}

export const ETIQUETA_OBSTACULO: Record<ObstacleKind, string> = {
  tinaco: "Tinaco",
  chimenea: "Chimenea o ducto",
  pretil: "Pretil",
  arbol: "Árbol",
  edificio: "Edificio vecino",
  otro: "Otro",
};
