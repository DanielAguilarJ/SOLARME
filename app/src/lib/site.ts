import raw from "../data/sites.json";

/** De dónde sale una cifra física. `medido` = barrido real contra PVGIS en ese punto;
 * `estimado` = fórmula ajustada a los sitios medidos, para lugares sin medición. La
 * distinción se muestra en pantalla: un instalador tiene derecho a saber si el número
 * que va a firmar se midió en su ciudad o se interpoló. */
export type FisicaOrigen = "medido" | "estimado";

export interface Site {
  clave: string;
  nombre: string;
  lat: number;
  lng: number;
  /** Metros sobre el nivel del mar según el modelo de elevación de PVGIS. La altitud
   * sube la irradiancia y baja la temperatura del módulo: CDMX a 2247 m rinde más que
   * Mérida a 10 m pese a estar más al norte. */
  elevacion: number;
  /** Estado de la república, para agrupar y para mostrar la ciudad sin ambigüedad. */
  estado: string;
  /** kWh/kWp año orientado al sur con la inclinación óptima y SIN pérdidas de sistema.
   * Las pérdidas de sistema las aplica `LOSS`. Si esta cifra ya las incluyera se
   * descontarían dos veces, que es exactamente el error que tenía el modelo anterior. */
  rendimiento: number;
  /** El mismo valor y el mismo anclaje (sur, inclinación óptima) ANTES de degradar por
   * desacuerdo entre fuentes. Comparable con `rendimiento` término a término. */
  rendimientoPvgis: number;
  /** Rendimiento apuntando al azimut óptimo real en vez del sur. Informativo: dice
   * cuánto queda sobre la mesa por alinear al sur por costumbre. */
  rendimientoOptimo: number;
  /** Desviación estándar interanual en kWh/kWp: cuánto varía un año contra otro. */
  desviacionInteranual: number;
  /** Diferencia porcentual entre PVGIS y NASA POWER en irradiación horizontal. */
  discrepanciaFuentes: number;
  /** `concuerdan` si las dos fuentes caen dentro del umbral; `menor-de-dos` si se
   * degradó a la más baja por prudencia comercial. */
  fuenteRendimiento: string;
  tiltOptimo: number;
  /** Azimut óptimo medido en grados respecto al sur, negativo al oriente. No es cero
   * en casi ninguna ciudad de México: la nube convectiva de la tarde premia al oriente. */
  azimutOptimo: number;
  /** Cuánto gana apuntar al azimut óptimo en vez del sur exacto, en porcentaje. */
  ganaSobreSur: number;
  /** Doce pesos que suman 1. Medidos: Tijuana y CDMX tienen estaciones opuestas. */
  mensual: number[];
  /** `true` si el sitio tiene su propia malla de azimut e inclinación medida. Los de la
   * segunda capa solo traen rendimiento y óptimo medidos, porque la FORMA de la curva
   * resultó igual en las 41 mallas completas y medir el rendimiento donde vive el cliente
   * vale más que medir la malla en pocas ciudades. */
  mallaCompleta: boolean;
  /** Pérdida porcentual medida por desviar del sur, con signo (negativo al oriente).
   * Conserva la asimetría real: en el centro de México el oriente rinde más. */
  perdidaAzimut?: Record<string, number>;
  /** Pérdida porcentual medida por desviar de la inclinación óptima. */
  perdidaTilt?: Record<string, number>;
  /** Mínima absoluta medida en diez años de serie diaria, en °C. Es la que usa el dimensionado
   * de strings: el modo de falla es destruir un inversor, así que se toma el extremo y no un
   * promedio. */
  tMinAbs: number;
  /** Percentil 0.4 % de las mínimas diarias, que es el criterio que citan las normas. Se guarda
   * para poder mostrar cuánto se está siendo más conservador que la norma. */
  tMinAshrae: number;
  /** Máxima absoluta medida, en °C. */
  tMaxAbs: number;
  /** Días de serie diaria detrás de esas cifras. */
  diasSerie: number;
  /** Aire medio en horas de producción, ponderado por la forma mensual medida. Grados. */
  tMediaSol?: number;
  /** Doce medias mensuales de temperatura del aire, en grados. */
  tMediaMensual?: number[];
}

interface CrudoSitio {
  rendimiento: number;
  rendimientoSur: number;
  rendimientoUsado: number;
}

interface Doc {
  fuente: string;
  baseRadiacion: string;
  aniosCubiertos: string;
  contraste?: { segundaFuente: string };
  sitios: Record<string, Omit<Site, "clave"> & { rendimientoUsado: number }>;
}

const doc = raw as unknown as Doc;

export const FUENTE_FISICA = {
  primaria: doc.fuente,
  base: doc.baseRadiacion,
  anios: doc.aniosCubiertos,
  contraste: doc.contraste?.segundaFuente ?? "",
};

export const SITES: Record<string, Site> = Object.fromEntries(
  Object.entries(doc.sitios).map(([clave, s]) => [
    clave,
    {
      ...s,
      clave,
      rendimiento: s.rendimientoUsado,
      rendimientoPvgis: (s as unknown as CrudoSitio).rendimientoSur,
      rendimientoOptimo: (s as unknown as CrudoSitio).rendimiento,
    },
  ]),
);

/**
 * Resumen del catálogo, CALCULADO del dato. Existe porque la interfaz tenía escrito a mano
 * "promedio de siete ciudades" y "el rango va de 1762 a 2017": al pasar de 7 a 41 sitios
 * esos textos se volvieron falsos sin que nada avisara. Un número que describe al dato
 * tiene que salir del dato.
 */
export const RESUMEN = (() => {
  const todos = Object.values(SITES);
  const orden = [...todos].sort((a, b) => a.rendimiento - b.rendimiento);
  const menor = orden[0];
  const mayor = orden[orden.length - 1];
  const promedio = todos.reduce((a, s) => a + s.rendimiento, 0) / todos.length;
  return {
    sitios: todos.length,
    estados: new Set(todos.map((s) => s.estado)).size,
    promedio: Math.round(promedio),
    menor: { nombre: menor.nombre, valor: Math.round(menor.rendimiento) },
    mayor: { nombre: mayor.nombre, valor: Math.round(mayor.rendimiento) },
    /** Peor error posible de usar el promedio en vez de medir, en por ciento. */
    errorDelPromedio:
      Math.max(...todos.map((s) => Math.abs(s.rendimiento - promedio) / s.rendimiento)) * 100,
  };
})();

export function siteFor(clave: string): Site | undefined {
  return SITES[clave];
}

/** Interpolación lineal sobre una tabla dispersa de mediciones. Fuera del rango medido
 * devuelve el extremo, nunca extrapola: extrapolar una medición es inventarla. */
export function interp(tabla: Record<string, number>, x: number): number {
  const xs = Object.keys(tabla)
    .map(Number)
    .sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  if (x <= xs[0]) return tabla[String(xs[0])];
  if (x >= xs[xs.length - 1]) return tabla[String(xs[xs.length - 1])];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    if (x >= a && x <= b) {
      const t = (x - a) / (b - a);
      return tabla[String(a)] + t * (tabla[String(b)] - tabla[String(a)]);
    }
  }
  return tabla[String(xs[xs.length - 1])];
}

/** Coeficiente de la pérdida por azimut a 90° de desviación, por grado de inclinación
 * al cuadrado. Medido en los 7 sitios: media 0.01897, rango 0.01773–0.02039. La forma
 * cuadrática no es arbitraria: con la mesa horizontal el azimut no significa nada, y su
 * efecto crece con lo que se inclina. */
export const AZ_TILT_COEF = 0.01897;

/** Exponente de la forma normalizada. Las 7 ciudades comparten la misma curva una vez
 * dividida por su valor a 90° (0.031–0.038 a 15°, 0.263–0.288 a 45°), así que la forma
 * es universal y solo la escala depende de la inclinación. Ajuste con error medio
 * absoluto de 0.0056 contra k=2.0 que da 0.0182. */
export const AZ_SHAPE_EXP = 1.8;

/** Pérdida por azimut cuando NO hay medición del sitio. Simétrica, porque la asimetría
 * oriente–poniente depende del régimen de nubes local y no se deduce de la latitud:
 * medida va de +7.6 puntos a favor del oriente en CDMX a −1.5 en Tijuana. */
export function azimuthLossEstimated(desviacion: number, tilt: number): number {
  const d = Math.min(90, Math.abs(desviacion));
  const escala = (AZ_TILT_COEF * tilt * tilt) / 100;
  return Math.min(0.3, escala * Math.pow(d / 90, AZ_SHAPE_EXP));
}

/** Curva de pérdida por inclinación, auditada contra barridos reales de PVGIS: su error
 * máximo es 0.84 puntos porcentuales de 0° a 40°. Se usa con el óptimo MEDIDO del sitio
 * cuando no hay malla propia, que es mucho mejor que anclarla en la fórmula de latitud. */
export function tiltLossCurve(desviacion: number): number {
  const d = Math.abs(desviacion);
  return Math.min(0.35, 0.00011 * d * d + 0.0004 * d);
}

/** Pérdida por azimut interpolada de la malla medida del sitio. Puede ser negativa:
 * apuntar unos grados al oriente del sur mejora el rendimiento en el centro de México,
 * y esconderlo sería descartar información útil para colocar los módulos. */
export function azimuthLossMeasured(site: Site, desviacion: number): number {
  if (!site.perdidaAzimut) {
    // Sin malla propia se usa la forma universal, pero ANCLADA en el azimut óptimo medido
    // del punto y desplazada para que valga exactamente 0 en el sur. Las dos condiciones
    // son obligatorias: `rendimiento` está medido al sur, así que una pérdida distinta de
    // cero ahí descontaría dos veces; y el óptimo medido debe salir con pérdida negativa,
    // porque apuntar ahí rinde más y esconderlo tiraría información real.
    const opt = site.azimutOptimo;
    return (
      azimuthLossEstimated(desviacion - opt, site.tiltOptimo) -
      azimuthLossEstimated(-opt, site.tiltOptimo)
    );
  }
  return interp(site.perdidaAzimut, Math.max(-90, Math.min(90, desviacion))) / 100;
}

/** Pérdida mínima alcanzable del sitio, que ocurre en su azimut óptimo. Es negativa
 * siempre que el óptimo no sea el sur exacto. */
export function azimuthLossMin(site: Site): number {
  if (!site.perdidaAzimut) return azimuthLossMeasured(site, site.azimutOptimo);
  return Math.min(...Object.values(site.perdidaAzimut)) / 100;
}

/** Pérdida por inclinación del sitio. Con malla propia se interpola lo medido; sin ella
 * se usa la curva validada anclada en el óptimo MEDIDO del punto. */
export function tiltLossMeasured(site: Site, tilt: number): number {
  if (!site.perdidaTilt) return tiltLossCurve(tilt - site.tiltOptimo);
  return Math.max(0, interp(site.perdidaTilt, tilt - site.tiltOptimo) / 100);
}

/** Los tres niveles de procedencia de las pérdidas de orientación, en orden de calidad.
 * Se declaran por separado porque un sitio puede tener rendimiento medido y curva
 * estimada, y decir solo "medido" ocultaría la mitad. */
export type PerdidaOrigen = "malla-medida" | "curva-en-optimo-medido" | "estimado";

export function perdidaOrigen(site?: Site): PerdidaOrigen {
  if (!site) return "estimado";
  return site.mallaCompleta ? "malla-medida" : "curva-en-optimo-medido";
}

/** Distancia en kilómetros por la fórmula del semiverseno. */
export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(lat2 - lat1);
  const dLng = r(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Sitio medido más cercano a un punto, con su distancia.
 *
 * Sirve para que una dirección geocodificada que no cae en ninguna ciudad del catálogo use
 * física medida cerca en vez del promedio nacional, que puede errar 19 %. La distancia se
 * devuelve porque ES la incertidumbre: a 30 km el dato es prácticamente el del sitio, a
 * 300 km puede haber cruzado de la costa a la sierra y hay que decirlo.
 */
export function nearestSite(lat: number, lng: number): { site: Site; km: number } {
  const todos = Object.values(SITES);
  let mejor = { site: todos[0], km: Infinity };
  for (const s of todos) {
    const km = distanciaKm(lat, lng, s.lat, s.lng);
    if (km < mejor.km) mejor = { site: s, km };
  }
  return mejor;
}

/** Reparto mensual del sitio, o el promedio de los sitios medidos cuando no hay dato
 * local. El promedio no es una invención: es la media de siete mediciones reales, y se
 * declara como estimación porque aplana estaciones que en la realidad son opuestas. */
const PROMEDIO_MENSUAL: number[] = (() => {
  const sitios = Object.values(SITES);
  return Array.from({ length: 12 }, (_, i) =>
    sitios.reduce((a, s) => a + s.mensual[i], 0) / sitios.length,
  );
})();

export function monthlyWeights(site?: Site): { pesos: number[]; origen: FisicaOrigen } {
  return site
    ? { pesos: site.mensual, origen: "medido" }
    : { pesos: PROMEDIO_MENSUAL, origen: "estimado" };
}

/** Amplitud estacional: mes mayor entre mes menor. Sirve para decir en pantalla si el
 * sitio produce parejo todo el año o carga fuerte a una temporada, que es lo que decide
 * si el excedente se acumula y se consume dentro de los 12 meses que compensa la CFE. */
export function seasonalSwing(pesos: number[]): number {
  return Math.max(...pesos) / Math.min(...pesos);
}
