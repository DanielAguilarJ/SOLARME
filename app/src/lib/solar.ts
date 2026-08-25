import { buildCapex, type CostBreakdown } from "./capex";
import { rowSpacing, type SpacingResult } from "./spacing";
import { panelDimensions } from "./dims";
import { computeShading, type Obstacle, type ShadingResult } from "./shading";
import { placeModules, bloqueadoPorSombra, type LayoutResult } from "./layout";
import { areaPoligono, contornoValido, caja, cuadradoDeArea, type Punto } from "./polygon";
import { repartirStrings, ventanaPara, potenciaInversor, VENTANAS, type Arreglo, type Ventana } from "./strings";
import { ajusteTermico, type AjusteTermico } from "./termico";
import { dimensionarCircuito, type Circuito2 } from "./ocpd";
import {
  SITES, monthlyWeights, azimuthLossMeasured, tiltLossMeasured,
  azimuthLossEstimated, azimuthLossMin, type Site,
} from "./site";

export type ProjectType = "res" | "com" | "ind";

export interface Panel {
  brand: string; model: string; w: number; eff: number; temp: number;
  area: number;
  /** Voltaje de circuito abierto en condiciones estándar, en volts. */
  voc: number;
  /** Voltaje en el punto de máxima potencia, en volts. */
  vmp: number;
  /** Corriente de cortocircuito, en amperes. */
  isc: number;
  /** Corriente en el punto de máxima potencia, en amperes. */
  imp: number;
  /** Coeficiente de temperatura de Voc en V/°C. NEGATIVO: el frío sube el voltaje, y ahí está
   * el modo de falla que destruye inversores. */
  betaVoc: number;
  /** Precio del módulo en MXN por watt-pico. Ver src/lib/price.ts. */
  ppw: number;
  /** `banda` = estimado por gama de mercado. `cotizado` = lo capturó el instalador. */
  priceOrigin: "banda" | "cotizado";
  /** Años de garantía de producto. `null` cuando la fuente no lo publica: la base CEC no lo
   * trae, y antes se escribía 25 fijo para todos, lo que dejaba el término sin varianza. */
  warr: number | null;
  tech?: string; bifacial?: boolean; source?: string;
}

/** Coordenadas reales del centro de la ciudad; la longitud hace falta para consultar
 * Building Insights, que localiza el edificio más cercano al punto. */
export interface City {
  lat: number; lng: number; yield: number; name: string;
  /** Física medida en el punto. Cuando falta, la ciudad no está en el catálogo de
   * mediciones y todo se calcula con las fórmulas de respaldo, que la interfaz declara. */
  site?: Site;
}

/** Formas alternativas de escribir una ciudad que no coinciden con su clave. Solo las
 * que de verdad hacen falta: la abreviatura de uso corriente, el nombre con acento, y los
 * nombres de estado que un instalador escribe sin la ciudad.
 *
 * "nuevo leon" → Monterrey existe para desactivar una trampa: sin él, una dirección que
 * dice el estado pero no la ciudad casaría con "leon" y devolvería León, Guanajuato, a
 * 700 km y 4.6° de latitud del lugar correcto. */
const ALIAS_EXTRA: Record<string, string> = {
  cdmx: "cdmx",
  df: "cdmx",
  "ciudad de mexico": "cdmx",
  "nuevo leon": "monterrey",
  monterrey: "monterrey",
  "guadalajara jalisco": "guadalajara",
  "juarez": "ciudad juarez",
  "slp": "san luis potosi",
  "bcs": "la paz",
  "cd juarez": "ciudad juarez",
  "cd victoria": "ciudad victoria",
};

/** El catálogo sale de las mediciones, no de una lista escrita a mano: cada sitio medido
 * es una ciudad buscable, y añadir mediciones al JSON las hace aparecer solas en el
 * autocompletado sin tocar el código. */
export const CITIES: Record<string, City> = (() => {
  const out: Record<string, City> = {};
  const desde = (site: Site): City => ({
    lat: site.lat, lng: site.lng, yield: site.rendimiento, name: site.nombre, site,
  });
  for (const clave in SITES) out[clave] = desde(SITES[clave]);
  for (const alias in ALIAS_EXTRA) {
    const site = SITES[ALIAS_EXTRA[alias]];
    if (site) out[alias] = desde(site);
  }
  // el nombre tal como se muestra, con acentos, también debe encontrar su ciudad
  for (const clave in SITES) {
    const site = SITES[clave];
    out[site.nombre.toLowerCase()] = desde(site);
  }
  return out;
})();

/** Promedio de los sitios medidos, no una cifra elegida a mano. Se usa cuando la dirección
 * no cae en ninguna ciudad conocida, y la interfaz lo marca como estimación: el rango real
 * medido cruza todo el país, así que el promedio puede errar bastante en los extremos. */
const RENDIMIENTO_PROMEDIO = Math.round(
  Object.values(SITES).reduce((a, s) => a + s.rendimiento, 0) / Object.keys(SITES).length,
);

export const DEFAULT_CITY: City = {
  lat: 22, lng: -100, yield: RENDIMIENTO_PROMEDIO, name: "México (estimado)",
};

/** Resultado de resolver una dirección. `matched: false` significa que ninguna ciudad de
 * `CITIES` apareció en el texto y se está usando `DEFAULT_CITY`: una latitud media del país
 * y un rendimiento promedio. Eso NO es un dato del sitio, y quien captura la dirección tiene
 * que saberlo antes de confiar en la inclinación óptima o en la producción. */
export interface CityMatch {
  city: City;
  matched: boolean;
  /**
   * `true` cuando la coincidencia vino del último segmento de una dirección con varios, o sea del
   * lugar donde suele ir el estado. No se puede confiar en ella para elegir la física: catorce
   * estados mexicanos se llaman igual que una ciudad del catálogo, así que «Salvatierra,
   * Guanajuato» acabaría usando la física de Guanajuato capital. Quien resuelve debe preferir
   * geocodificar y quedarse con esto solo si no hay red.
   */
  debil: boolean;
}

/** Quita acentos y baja a minúsculas. Sin esto, "Ciudad de México" escrito con acento —la
 * forma natural de escribirlo— no coincidía con la clave "ciudad de mexico" y el análisis
 * caía en el respaldo genérico sin que nada lo indicara. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Palabras que delatan un segmento de calle. Sin esto una dirección como
 * "Calle Monterrey 45, León, Guanajuato" resolvía a Monterrey por el nombre de la calle:
 * 700 km y 4.6° de latitud de error, con la inclinación óptima y el rendimiento de otra
 * ciudad. */
const VIAL = /\b(calle|av|avda|avenida|blvd|boulevard|bulevar|calz|calzada|carretera|camino|privada|priv|prolongacion|andador|circuito|eje|paseo|retorno|cerrada|manzana|mz|lote|lt|int|no|num)\b|\d/;

/**
 * Resuelve la ciudad de una dirección mexicana.
 *
 * La versión anterior devolvía la PRIMERA clave que apareciera como subcadena, y el orden
 * de las claves de un objeto es arbitrario. Con siete ciudades se salvaba por suerte; con
 * cuarenta y una hay colisiones reales entre nombre de ciudad y nombre de estado:
 * "Monterrey, Nuevo León" contiene "leon", "Xalapa, Veracruz" contiene "veracruz" y
 * "Ciudad Juárez, Chihuahua" contiene "chihuahua". En los tres casos la respuesta correcta
 * es la primera, porque una dirección mexicana escribe calle, luego ciudad, luego estado.
 *
 * Así que se parte por comas, se descartan los segmentos que parecen calle y se toma la
 * coincidencia del PRIMER segmento restante. Si nada casa segmento a segmento se recurre a
 * buscar en todo el texto, quedándose con la coincidencia más temprana.
 */
/**
 * Ciudad de un proyecto almacenado.
 *
 * La dirección NO alcanza. Cuando el instalador escribe la calle y elige la ciudad de la lista,
 * la dirección guardada no contiene el nombre de la ciudad: `matchCity("Av. de la Raza 100")` cae
 * al promedio nacional. Reabrir así perdía en silencio el rendimiento medido, la inclinación
 * óptima, la forma mensual y las temperaturas extremas de las que depende el dimensionado de
 * series. El campo `city` es la resolución que ya se hizo y se guardó: se consulta primero.
 */
export function cityOfProject(p: { address: string; city?: string }): CityMatch {
  if (p.city) {
    const m = matchCity(p.city);
    if (m.matched) return m;
  }
  return matchCity(p.address);
}

/**
 * Los segmentos de una dirección que pueden nombrar un LUGAR, en orden.
 *
 * Se quitan los que parecen vía —«Av. Chapultepec 100»— porque no nombran localidad, y esa
 * distinción tiene consecuencias: `matchCity` la usa para saber si el nombre que casó está en el
 * hueco del estado, y el geocodificador de localidad la usa para saber qué preguntar y con qué
 * estado desambiguar. Vivía duplicada en los dos sitios y tenían que coincidir exactamente.
 */
export function segmentosDeLugar(query: string): string[] {
  return fold(query)
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && !VIAL.test(x));
}

export function matchCity(query: string): CityMatch {
  const buscarEn = (texto: string): City | undefined => {
    let mejor: { city: City; pos: number; largo: number } | undefined;
    for (const key in CITIES) {
      const f = fold(key);
      const pos = texto.indexOf(f);
      if (pos < 0) continue;
      // más temprano gana; a igual posición gana la clave más larga, para que
      // "ciudad victoria" venza a una hipotética "victoria".
      if (!mejor || pos < mejor.pos || (pos === mejor.pos && f.length > mejor.largo)) {
        mejor = { city: CITIES[key], pos, largo: f.length };
      }
    }
    return mejor?.city;
  };

  // Solo cuentan los segmentos que pueden nombrar un lugar: «Av. Chapultepec 100, Guadalajara»
  // tiene dos, pero el primero es una calle, así que Guadalajara NO está en el sitio del estado
  // sino que es el único lugar nombrado. Contar sin filtrar la calle marcaba esa dirección
  // perfectamente normal como sospechosa —lo cazó una prueba que ya existía—.
  const lugares = segmentosDeLugar(query);

  for (let i = 0; i < lugares.length; i++) {
    const hallada = buscarEn(lugares[i]);
    if (!hallada) continue;
    // Una coincidencia en el ÚLTIMO de varios lugares es sospechosa: ahí va el estado, y catorce
    // de los treinta y dos estados mexicanos se llaman igual que una ciudad del catálogo.
    // «Fortín de las Flores, Veracruz» caía en Veracruz puerto (1616.7 kWh/kWp) teniendo Córdoba
    // a 15 km y medida en ~1823: un 11 % de error por creerle al nombre del estado.
    const debil = lugares.length > 1 && i === lugares.length - 1;
    return { city: hallada, matched: true, debil };
  }

  const global = buscarEn(fold(query));
  // Sin un segmento que respalde la coincidencia tampoco es de fiar cuando hay varios lugares:
  // puede ser el estado incrustado en cualquier parte de la cadena.
  return global
    ? { city: global, matched: true, debil: lugares.length > 1 }
    : { city: DEFAULT_CITY, matched: false, debil: false };
}

export function resolveCity(query: string): City {
  return matchCity(query).city;
}

/** Ciudades candidatas para autocompletar, sin repetir nombre (cdmx y "ciudad de méxico"
 * apuntan a la misma). Con consulta vacía devuelve el catálogo completo; si hay texto,
 * primero las que empiezan por él y luego las que solo lo contienen. */
export function citySuggestions(query: string, limit = 6): City[] {
  const q = fold(query.trim());
  const seen = new Set<string>();
  const starts: City[] = [];
  const contains: City[] = [];

  for (const key in CITIES) {
    const city = CITIES[key];
    if (seen.has(city.name)) continue;
    const name = fold(city.name);
    const k = fold(key);
    if (!q) { seen.add(city.name); starts.push(city); continue; }
    if (name.startsWith(q) || k.startsWith(q)) { seen.add(city.name); starts.push(city); }
    else if (name.includes(q) || k.includes(q)) { seen.add(city.name); contains.push(city); }
  }
  // Con más de cien ciudades el orden de inserción ya no sirve: quien escribe "c" tiene doce
  // candidatas y vería seis sin criterio. Se prioriza a las de malla completa, que son las
  // 41 de la primera capa y coinciden con los mercados grandes del país, y a igualdad se
  // ordena alfabéticamente para que el resultado sea estable y predecible.
  const rango = (c: City) => (c.site?.mallaCompleta ? 0 : 1);
  const ordenar = (xs: City[]) =>
    [...xs].sort((a, b) => rango(a) - rango(b) || a.name.localeCompare(b.name, "es"));
  return [...ordenar(starts), ...ordenar(contains)].slice(0, limit);
}

const CO2F = 0.435;    // kg CO2 / kWh (red México)
/** Pérdidas del sistema (cableado, inversor, suciedad, desajuste). */
export const LOSS = 0.14;
const CONSUMO: Record<ProjectType, number> = { res: 6000, com: 34000, ind: 170000 };
const TARIFA: Record<ProjectType, number> = { res: 3.5, com: 3.2, ind: 2.4 };


/**
 * Inclinación óptima por latitud.
 *
 * Calibrado contra las bandas medidas en la investigación (research/02-deep-research-perplexity.md):
 *   15–20 °N → 15–18°   ·   20–25 °N → 18–22°   ·   25–30 °N → 22–26°
 * La relación β ≈ latitud × 0.87 reproduce las tres bandas dentro de su rango.
 */
export function optTilt(lat: number) {
  return Math.round(Math.max(10, Math.min(35, Math.abs(lat) * 0.87)));
}

/**
 * Inclinación óptima del sitio. Usa la MEDIDA cuando existe, porque el óptimo no es
 * función de la latitud: Mérida (20.97°) y Guadalajara (20.66°) distan un tercio de
 * grado y tienen óptimos de 21° y 24°. Lo que decide es en qué temporada está el cielo
 * despacejado, o sea el clima, y ninguna fórmula de latitud puede saberlo.
 *
 * Contra los siete sitios medidos la fórmula de respaldo se queda corta entre 2° y 7°.
 * El costo energético de ese error es menor a 0.5 % anual —medido, no supuesto—, pero la
 * cifra también se muestra como RECOMENDACIÓN, y ahí un error de 7° sí importa.
 */
export function optTiltFor(city: { lat: number; site?: Site }) {
  return city.site ? city.site.tiltOptimo : optTilt(city.lat);
}

/**
 * Pérdida anual por desviarse de la inclinación óptima, como fracción (0–1).
 *
 * Auditada contra barridos reales de PVGIS en tres ciudades: el error máximo de esta
 * curva es 0.84 puntos porcentuales en todo el rango de 0° a 40°. Se conserva tal cual
 * porque la medición la respaldó.
 */
export function tiltLoss(tilt: number, lat: number) {
  const dev = Math.abs(tilt - optTilt(lat));
  return Math.min(0.35, 0.00011 * dev * dev + 0.0004 * dev);
}

/**
 * Pérdida anual por desviarse del sur verdadero, como fracción (0–1).
 *
 * La versión anterior no recibía la inclinación y por eso era estructuralmente incapaz:
 * predecía 29.4 % a 90° del sur cuando lo medido en CDMX es 6.4 % y en Tijuana 19.1 %.
 * Sobreestimaba hasta 23 puntos y habría hecho descartar techos al oriente que son
 * perfectamente rentables.
 *
 * La escala correcta es cuadrática en la inclinación, y no por analogía: con la mesa
 * horizontal el azimut no significa nada y su efecto crece con lo que se inclina. El
 * coeficiente 0.01897 y el exponente 1.8 salen de ajustar la malla medida.
 */
export function azimuthLoss(az: number, tilt: number) {
  return azimuthLossEstimated(az - 180, tilt);
}

/** Factor combinado de orientación. Vale 1 al sur con la inclinación óptima, que es la
 * orientación en la que está anclado `yield`. Puede pasar de 1 con datos medidos, porque
 * en el centro de México apuntar unos grados al oriente rinde MÁS que el sur exacto: en
 * CDMX 0.68 % más. Recortarlo a 1 escondería una mejora real y gratuita. */
export function orientationFactor(tilt: number, az: number, lat: number, site?: Site) {
  const pt = site ? tiltLossMeasured(site, tilt) : tiltLoss(tilt, lat);
  const pa = site ? azimuthLossMeasured(site, az - 180) : azimuthLossEstimated(az - 180, tilt);
  return (1 - pt) * (1 - pa);
}

/** Azimut óptimo del sitio en la convención de la app (180 = sur). Rara vez es 180 en
 * México: el óptimo medido está entre 5° y 21° al oriente en cinco de las siete ciudades. */
export function optAzFor(city: { site?: Site }) {
  return city.site ? 180 + city.site.azimutOptimo : 180;
}

/**
 * Cuánto pierde la orientación actual respecto a la MEJOR posible del sitio, en fracción.
 *
 * Existe porque la interfaz etiquetaba "Sur = óptimo" con el sur escrito a mano, y al
 * mismo tiempo la cabecera declaraba que el óptimo medido de CDMX está 21° al oriente:
 * dos afirmaciones contradictorias en la misma pantalla. Con la pérdida medida no hay
 * nada que contradecir, y además dice si vale la pena mover los rieles.
 */
export function azPenalty(az: number, city: { lat: number; site?: Site }): number {
  if (!city.site) return azimuthLossEstimated(az - 180, optTilt(city.lat));
  // Se resta el mínimo REAL del sitio, no `ganaSobreSur`: con malla propia el mínimo sale
  // de la malla y con curva estimada sale de la curva, y en ambos casos la penalización
  // queda exactamente en cero en el óptimo. Mezclarlos dejaba a los sitios sin malla con
  // una penalización residual en su propio óptimo.
  return Math.max(0, azimuthLossMeasured(city.site, az - 180) - azimuthLossMin(city.site));
}

/** De dónde salieron las pérdidas de orientación de este cálculo. */
export function orientationOrigin(site?: Site): "medido" | "estimado" {
  return site ? "medido" : "estimado";
}

/**
 * Diagnóstico accionable de la orientación: le dice al instalador si vale la pena
 * proponer estructura de corrección o si el techo tal como está es suficiente.
 */
export function orientationAdvice(tilt: number, az: number, lat: number, site?: Site) {
  const dev = Math.abs(tilt - optTiltFor({ lat, site }));
  const loss = 1 - orientationFactor(tilt, az, lat, site);
  if (dev <= 10) {
    return {
      level: "ok" as const,
      text: `A ${dev}° del óptimo: pérdida despreciable. Montaje coplanar al techo.`,
    };
  }
  if (dev <= 25) {
    return {
      level: "warn" as const,
      text: `A ${dev}° del óptimo: pierdes ${(loss * 100).toFixed(1)}%. Evalúa estructura inclinada.`,
    };
  }
  return {
    level: "bad" as const,
    text: `A ${dev}° del óptimo: pierdes ${(loss * 100).toFixed(1)}%. Estructura de corrección recomendada.`,
  };
}

export function azLabel(a: number) {
  if (a <= 112) return "Este";
  if (a < 135) return "Sureste";
  if (a <= 157) return "Sur-sureste";
  if (a < 173) return "Sur ↙";
  if (a <= 187) return "Sur";
  if (a < 203) return "Sur ↘";
  if (a <= 225) return "Sur-suroeste";
  if (a < 247) return "Suroeste";
  return "Oeste";
}

export function panelCount(area: number, panel: { area: number }) {
  return Math.max(0, Math.floor((area * 0.72) / panel.area));
}

/**
 * Datos tomados del recibo CFE del cliente.
 *
 * Capturar el recibo real evita tener que asumir una tarifa. CFE aplica tarifas escalonadas
 * (básico, intermedio, excedente) y el salto a DAC cambia el precio radicalmente, así que
 * cualquier tabla queda desfasada o mal aplicada. El precio efectivo que sale de dividir el
 * importe entre los kWh del propio recibo es el que el sistema solar va a desplazar de verdad.
 */
export interface Bill {
  /** Consumo del periodo facturado, en kWh. */
  kwh: number;
  /** Importe del periodo, en MXN. */
  amount: number;
  /** CFE factura residencial cada dos meses y comercial cada mes. */
  period: "mes" | "bim";
}

/** Consumo anual implícito en el recibo, en kWh. */
export function annualFromBill(b: Bill) {
  return b.kwh * (b.period === "bim" ? 6 : 12);
}

/**
 * Precio efectivo por kWh del cliente, en MXN.
 *
 * Incluye cargos fijos y escalones tal como los cobra CFE, porque sale del importe real.
 * Es el número correcto para valorar el ahorro: es lo que el cliente deja de pagar.
 */
export function tariffFromBill(b: Bill) {
  return b.kwh > 0 ? b.amount / b.kwh : 0;
}

export interface Design {
  /** Costo del resto del sistema por watt (MXN/W) capturado por el instalador. */
  bosPerW?: number;
  /** Física medida del sitio, si la dirección cayó en una ciudad medida. */
  site?: Site;
  /** Obstáculos de la azotea. Si hay al menos uno, la sombra se CALCULA y el deslizador
   * `shade` deja de usarse. */
  obstacles?: Obstacle[];
  /** Contorno real de la azotea en metros, dibujado por el instalador. Cuando existe MANDA
   * sobre `area`: la superficie se deriva del polígono. Sin él se supone un cuadrado. */
  outline?: Punto[];
  /** Metros de una vía del circuito más largo al inversor. Lo mide el instalador una vez. */
  runMeters?: number;
  /**
   * Tope voluntario del arreglo, cuando el instalador decide no llenar el techo.
   *
   * Lo pone el ajuste al consumo: si un tercio de los módulos no desplaza compra a CFE, el techo se
   * deja como está y simplemente no se llena. Persiste con el proyecto porque es una decisión del
   * diseño, no un cálculo derivado, y la interfaz debe poder mostrarla y quitarla.
   */
  arregloTope?: { filas: number; columnas: number };
  /** Id del contacto de la libreta que firma este trabajo. Puede quedar colgando si se borra
   * de la libreta: la propuesta lo resuelve por id y declara la ausencia, no imprime un hueco. */
  responsableId?: string;
  /** Ventana de inversor elegida por el instalador. Sin ella se propone la que corresponde al
   * tamaño, que es un punto de partida y no una elección de equipo. */
  inverterWindow?: Ventana["clave"];
  lat: number; lng: number; yield: number; area: number; tilt: number; az: number;
  shade: number; type: ProjectType; panel: Panel;
  /** Recibo real del cliente. Si está presente, manda sobre los promedios por tipo. */
  bill?: Bill;
}

export interface Result {
  n: number; kwp: number; kwh: number; save: number; co2: number;
  cov: number; of: number; capex: number;
  /** Años para recuperar la inversión. `Infinity` cuando no cabe ningún módulo: devolver 0
   * hacía leer "retorno inmediato" un caso en el que no hay sistema. */
  payback: number;
  /** `true` cuando la sombra o el área no permiten montar ni un módulo. */
  noCabe: boolean;
  tariff: number;
  /** Sombra calculada de obstáculos reales. Ausente cuando no se capturó ninguno y la
   * sombra viene del deslizador estimado. */
  shading?: ShadingResult;
  /** Superficie que de verdad sirve para montar, ya descontadas las zonas inservibles. */
  areaMontable: number;
  /** Posiciones reales de los módulos, en metros desde la esquina suroeste. El dibujo usa
   * estas mismas, de modo que el plano no puede contradecir al presupuesto. */
  placement: LayoutResult;
  /** Fracción del techo que ocupan los módulos colocados. Es la utilización REAL, distinta
   * de `spacing.packing`, que es la razón entre huella y pitch de un arreglo infinito. */
  utilizacion: number;
  /** Superficie con la que se calculó: del contorno si se dibujó, del campo si no. */
  area: number;
  /** Contorno usado, sea el dibujado o el cuadrado supuesto. El plano dibuja este. */
  outline: Punto[];
  /** Ajuste por el coeficiente térmico real del módulo contra la referencia de PVGIS. */
  termico: AjusteTermico;
  /** Conductor y protección del circuito de string. Ausente sin series dimensionadas. */
  circuito?: Circuito2;
  /** Reparto en series con el frío extremo del sitio. Ausente sin ciudad medida: no se puede
   * dimensionar un string sin conocer la temperatura mínima del lugar, y suponerla es
   * exactamente lo que destruye inversores. */
  strings?: Arreglo;
  /** Ventana de inversor con la que se dimensionó. */
  ventana?: Ventana;
  /** Rango de potencia de inversor recomendada, en kW de corriente alterna. */
  inversor?: { min: number; max: number };
  /** `true` si el contorno lo dibujó el instalador y no se supuso. */
  outlineMedido: boolean;
  /** `true` cuando hay un contorno dibujado pero NO se puede calcular con él: se cruza
   * consigo mismo o no encierra superficie. Se expone en vez de caer al cuadrado en
   * silencio, porque ver el área saltar de vuelta sin explicación desconcierta. */
  outlineInvalido: boolean;
  /** Desglose del costo instalado, construido desde el precio real del módulo. */
  costs: CostBreakdown;
  /** Geometría de filas usada para acotar el número de módulos. */
  spacing: SpacingResult;
  /** Filas y módulos por fila del arreglo propuesto. */
  layout: { rows: number; perRow: number };
  /** true si el sistema supera el umbral de generación distribuida exenta. */
  exceedsGD: boolean;
  /** Consumo anual estimado del cliente, en kWh. */
  consumption: number;
  /** Energía que desplaza compra a CFE y por tanto vale la tarifa completa, en kWh. */
  offset: number;
  /** Excedente sobre el consumo anual, en kWh. No se valora a tarifa minorista. */
  surplus: number;
  /** true si consumo y tarifa vienen del recibo real del cliente. */
  fromBill: boolean;
}

/**
 * Umbral de generación distribuida exenta en México: hasta 499 kW el cliente entra al
 * régimen de GD con contrato de interconexión simplificado (< 0.5 MW ante la CRE).
 * Por encima, el trámite es otro y el instalador tiene que saberlo antes de cotizar.
 */
export const GD_LIMIT_KW = 499;

/** Superficie de arranque de un análisis nuevo, en m². Punto de partida para mover el
 * deslizador, no una medición. */
export const AREA_INICIAL = 35;

/** Metros supuestos al inversor mientras el instalador no los mida. */
export const RUN_METERS_INICIAL = 20;

/**
 * Diseño para un domicilio NUEVO, partiendo del anterior.
 *
 * Existe porque arrastrar el estado entre análisis producía datos de otro edificio: se
 * analizaba un techo, se empezaba otro domicilio y el tinaco y el contorno del primero
 * viajaban al segundo. La propuesta del cliente nuevo salía con los estorbos del anterior.
 *
 * La regla es la que distingue al edificio de quien lo instala. Se BORRA lo que describe al
 * inmueble —contorno, estorbos, superficie, sombra estimada y el recibo del cliente— y se
 * CONSERVA lo que es del instalador: el módulo que trabaja y el tipo de proyecto.
 */
export function designForNewAddress(anterior: Design, city: City): Design {
  return {
    ...anterior,
    site: city.site,
    lat: city.lat,
    lng: city.lng,
    yield: city.yield,
    tilt: optTiltFor(city),
    az: 180,
    // del edificio anterior: nada sobrevive
    area: AREA_INICIAL,
    shade: 0,
    outline: undefined,
    obstacles: undefined,
    bill: undefined,
  };
}

export function compute(d: Design): Result {
  // Dimensiones DEL MÓDULO ELEGIDO, no constantes globales. Antes se usaba 2.28 x 1.13 m para
  // los 140 del catálogo, así que a un módulo de 420 W (1.76 m) se le calculaba el pasillo de
  // uno de 2.28 m: pasillo de más, módulos de menos. Y `panelCount` sí usaba el área real, con
  // lo que las dos estimaciones que se comparan abajo eran inconsistentes entre sí.
  const dims = panelDimensions(d.panel.area);
  const spacing = rowSpacing({ lat: d.lat, tilt: d.tilt, panelLength: dims.length });

  // El contorno dibujado manda sobre el área escrita: si el instalador se tomó el trabajo de
  // trazar la azotea, ese dato es mejor que un número teclado. Sin contorno se supone un
  // cuadrado de lado √área, que es la hipótesis menos comprometida, y la interfaz lo declara.
  const contorno = d.outline && contornoValido(d.outline) ? d.outline : undefined;
  const area = contorno ? areaPoligono(contorno) : Math.max(0, d.area);
  // ancho y fondo por separado: el fondo norte-sur es el eje que decide las filas.
  const dim = contorno
    ? caja(contorno)
    : { ancho: Math.sqrt(area), alto: Math.sqrt(area) };

  // Sombra por obstáculos REALES cuando el instalador los capturó. Antes `shade` era un
  // deslizador de 0 a 35 % que se adivinaba a ojo: el mismo defecto que tenían el precio del
  // módulo y el consumo del cliente antes de medirlos. Un tinaco no cuesta "un 10 %", cuesta
  // una superficie concreta que depende de su altura, de dónde está y de la latitud.
  const obstaculos = d.obstacles ?? [];
  const shading = obstaculos.length > 0
    ? computeShading(area, d.lat, obstaculos, d.site, contorno)
    : undefined;

  // Con obstáculos mapeados la superficie que sirve NO es la que existe: una celda sombreada
  // buena parte del día es inservible porque un módulo parcialmente sombreado arrastra a su
  // cadena entera. Así los obstáculos bajan el número de módulos, no solo la energía.
  const areaMontable = shading ? shading.areaUtil : area;

  // Los módulos se COLOCAN, no se estiman dividiendo área entre área. La diferencia
  // aparece cuando hay un estorbo: la superficie libre puede quedar fragmentada en pedazos
  // donde no cabe un módulo entero, y dividir no lo nota. Además el dibujo usa estas mismas
  // posiciones, así que el plano muestra lo que se cotiza.
  const placement = placeModules({
    tope: d.arregloTope,
    ancho: dim.ancho,
    fondo: dim.alto,
    pitch: spacing.pitch,
    footprint: spacing.footprint,
    moduleWidth: dims.width,
    bloqueado: shading ? bloqueadoPorSombra(shading) : undefined,
    outline: contorno,
  });

  // El área también acota: un módulo de área grande no cabe tantas veces como sugiere la
  // rejilla. Se conserva el mínimo, que es el criterio que evita inflar propuestas.
  const byArea = panelCount(areaMontable, d.panel);
  const n = Math.min(byArea, placement.count);
  const byGeometry = { rows: placement.rows, perRow: placement.perRow };

  const kwp = (n * d.panel.w) / 1000;
  const of = orientationFactor(d.tilt, d.az, d.lat, d.site);
  // Los obstáculos medidos MANDAN sobre el deslizador. Aplicar los dos descontaría la misma
  // sombra dos veces, y la interfaz declara cuál de los dos está en uso.
  const sf = shading ? 1 - shading.loss : 1 - d.shade / 100;
  // El coeficiente térmico del módulo elegido entra en la energía, no solo en el puntaje. El
  // rendimiento medido corresponde al módulo de referencia de PVGIS (−0.47 %/°C a 25 °C); este
  // factor aplica ÚNICAMENTE la diferencia contra esa referencia, para no descontar dos veces.
  const termico = ajusteTermico(d.panel.temp, d.site);
  const kwh = kwp * d.yield * of * sf * (1 - LOSS) * termico.factor;

  // El recibo del cliente manda. Sin recibo se usa el promedio por tipo de proyecto, que es
  // una hipótesis de arranque, no un dato: la interfaz lo señala para que nadie lo confunda.
  const hasBill = !!d.bill && d.bill.kwh > 0 && d.bill.amount > 0;
  const tariff = hasBill ? tariffFromBill(d.bill!) : TARIFA[d.type];
  const consumption = hasBill ? annualFromBill(d.bill!) : CONSUMO[d.type];

  // El ahorro solo puede venir de energía que el cliente habría comprado a CFE.
  // Bajo medición neta el saldo a favor se compensa hasta 12 meses, pero las fuentes
  // consultadas NO establecen que el excedente sobre el consumo anual se pague a tarifa
  // minorista. Valorarlo así infla la propuesta: en un sistema al 134 % de cobertura
  // sobrestimaba el ahorro un 34 %. Se acota al consumo y el excedente se reporta aparte.
  const offset = Math.min(kwh, consumption);
  const surplus = Math.max(0, kwh - consumption);
  const save = offset * tariff;

  const co2 = (kwh * CO2F) / 1000;
  const cov = Math.min(200, Math.round((kwh / consumption) * 100));
  // El costo del lote de módulos sale del precio del módulo elegido —banda de mercado o el
  // costo que capturó el instalador—, no de una constante por tipo de proyecto. Así elegir un
  // módulo más barato baja de verdad la inversión y el retorno.
  const moduleCost = d.panel.ppw * n * d.panel.w;
  const costs = buildCapex(kwp * 1000, moduleCost, d.type, d.bosPerW);
  const capex = costs.total;
  // Retorno solo cuando hay algo que retornar. Con el techo tapado por un vecino de 8 m
  // caben cero módulos, y `capex / save` daba 0, que en pantalla se lee como "se paga al
  // instante" cuando significa lo contrario: no cabe nada. Se devuelve Infinity y la
  // interfaz lo declara como sistema que no cabe.
  // Dimensionado de series. Requiere la temperatura mínima extrema del sitio: sin ciudad
  // medida no se calcula en vez de suponerla, porque un supuesto optimista aquí no produce una
  // estimación imprecisa, produce un inversor quemado.
  const ventana = d.inverterWindow
    ? VENTANAS.find((v) => v.clave === d.inverterWindow) ?? ventanaPara(kwp)
    : ventanaPara(kwp);
  const strings = d.site ? repartirStrings(n, d.panel, d.site, ventana) : undefined;

  // Conductor y protección del circuito. Depende del reparto en series, así que va después.
  const metros = d.runMeters ?? RUN_METERS_INICIAL;
  const circuito = strings && strings.strings > 0 && d.site
    ? dimensionarCircuito({
        isc: d.panel.isc,
        metros,
        vString: strings.porString * d.panel.vmp,
        conductores: Math.max(2, strings.strings * 2),
        sobreAzotea: true,
      }, d.site)
    : undefined;

  const payback = save > 0 ? capex / save : Infinity;

  return {
    n, kwp, kwh, save, co2, cov, of, capex, payback, noCabe: n === 0, tariff, costs,
    shading, areaMontable, placement,
    utilizacion: area > 0 ? (n * dims.width * spacing.footprint) / area : 0,
    area,
    termico,
    circuito,
    strings,
    ventana: d.site ? ventana : undefined,
    inversor: kwp > 0 ? potenciaInversor(kwp) : undefined,
    outline: contorno ?? cuadradoDeArea(area),
    outlineMedido: !!contorno,
    outlineInvalido: !!d.outline && d.outline.length >= 3 && !contorno,
    spacing,
    layout: { rows: byGeometry.rows, perRow: byGeometry.perRow },
    exceedsGD: kwp > GD_LIMIT_KW,
    consumption, offset, surplus, fromBill: hasBill,
  };
}


export const fmt = (x: number) => x.toLocaleString("es-MX");

/** Retorno legible. Sin `Infinity` en pantalla y sin el 0 que se leía como retorno
 * inmediato: cuando no cabe ningún módulo se dice que no cabe. */
export function paybackLabel(r: { payback: number; noCabe: boolean }): string {
  if (r.noCabe || !Number.isFinite(r.payback)) return "no cabe";
  return `${r.payback.toFixed(1)} años`;
}

export const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
/** Reparto mensual. La versión anterior usaba UNA forma fija "aproximada para México
 * (~20°N)" para todo el país, y eso es imposible: CDMX y Tijuana tienen estaciones
 * opuestas. CDMX hace pico en marzo con diciembre alto (9.1 % del año) porque su
 * temporada seca es el invierno; Tijuana hace pico en agosto con diciembre en el mínimo
 * (6.6 %) por la capa marina. Una sola curva parte la diferencia y falla en las dos.
 */
export function monthlyProduction(annualKwh: number, site?: Site) {
  const { pesos, origen } = monthlyWeights(site);
  const total = pesos.reduce((a, b) => a + b, 0);
  return {
    origen,
    data: pesos.map((w, i) => ({ m: MONTHS[i], kwh: (annualKwh * w) / total })),
  };
}
