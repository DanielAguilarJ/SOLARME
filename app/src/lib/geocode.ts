import { nearestSite, type Site } from "./site";
import { fetchConLimite } from "./red";
import { matchCity, segmentosDeLugar, DEFAULT_CITY, type City } from "./solar";

/**
 * Geocodificación de direcciones mexicanas contra Nominatim (OpenStreetMap).
 *
 * Existe para una razón concreta: el catálogo mide muchas ciudades, pero México tiene
 * miles de localidades. Sin geocodificar, cualquier dirección fuera del catálogo caía al
 * promedio nacional, que puede errar 19 %. Con las coordenadas reales se puede usar el
 * sitio medido más cercano, típicamente a menos de 100 km, y declarar esa distancia.
 *
 * Nominatim es el servicio gratuito de OSM y tiene una política de uso: una petición por
 * segundo y nada de cargas masivas. Por eso se cachea en `localStorage` de forma
 * permanente —una dirección no cambia de coordenadas— y se limita el ritmo. Un producto en
 * producción debería usar su propio geocodificador o un plan pagado; esto es honesto para
 * un taller que consulta domicilios de a uno.
 *
 * PVGIS no se puede llamar desde el navegador: no envía cabeceras CORS. Por eso la física
 * viaja medida dentro de la app en vez de consultarse en vivo.
 */

const BASE = "https://nominatim.openstreetmap.org/search";
const CLAVE_CACHE = "solarme.geocode.v1";
const RITMO_MS = 1100;

export interface Punto {
  lat: number;
  lng: number;
  /** Nombre completo que devolvió el servicio, para que el instalador confirme. */
  descripcion: string;
  /**
   * Hasta dónde llegó el servicio al resolver ESTE punto. Va en el punto y no solo en la
   * resolución para que sobreviva a la caché: si se perdiera, un punto de calle recuperado del
   * almacén parecería tan bueno como uno de edificio.
   *
   * Opcional porque un punto guardado por una versión anterior no lo trae, y suponerle un nivel
   * sería inventar precisión. Ver `PrecisionPunto` y `puedeCentrarImagen`.
   */
  nivel?: PrecisionPunto;
}

type Cache = Record<string, Punto | null>;

let ultima = 0;

export function normalizar(direccion: string): string {
  return direccion.trim().toLowerCase().replace(/\s+/g, " ");
}

export function loadCache(store: Storage | undefined = safeStorage()): Cache {
  if (!store) return {};
  try {
    const raw = JSON.parse(store.getItem(CLAVE_CACHE) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Cache = {};
    for (const k in raw) {
      const v = raw[k];
      if (v === null) { out[k] = null; continue; }
      if (typeof v?.lat === "number" && typeof v?.lng === "number") {
        // El nivel se conserva: sin él, un punto de calle recuperado del almacén
        // parecería tan bueno como uno de edificio.
        const n = v.nivel;
        out[k] = {
          lat: v.lat,
          lng: v.lng,
          descripcion: String(v.descripcion ?? ""),
          ...(n === "edificio" || n === "calle" || n === "localidad" ? { nivel: n } : {}),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function guardar(cache: Cache, store = safeStorage()) {
  try {
    store?.setItem(CLAVE_CACHE, JSON.stringify(cache));
  } catch {
    // almacenamiento lleno o bloqueado: la geocodificación sigue funcionando sin caché
  }
}

/**
 * Por qué falló una geocodificación. Existe porque «no hay señal» y «esa dirección no está en
 * el índice» son cosas distintas y antes las dos devolvían `null`: la app le decía al
 * instalador que su domicilio no se encontró cuando lo que pasaba era que estaba sin red en
 * una azotea. Una lo resuelve esperar a tener señal; la otra, capturar la ubicación a mano.
 */
export type GeoEstado = "encontrado" | "no-encontrado" | "sin-red" | "servicio-falló";

/**
 * Traduce el `place_rank` de Nominatim al nivel que le importa a la app.
 *
 * Su escala llega a 30 y la usa para decir cuán fino es el objeto encontrado: 30 es una casa o
 * un portal con número, 26 es una vía, y por debajo son colonias, municipios y estados. Se
 * traduce en vez de exponer el número para que el resto del código no dependa de la escala de
 * un proveedor concreto.
 *
 * Un rango ausente o no numérico cae a `"localidad"`, el nivel más prudente: nunca se supone
 * más precisión de la que el servicio declaró.
 */
export function nivelPorRank(rank: number): PrecisionPunto {
  if (!Number.isFinite(rank)) return "localidad";
  if (rank >= 30) return "edificio";
  if (rank >= 26) return "calle";
  return "localidad";
}

export interface GeoResultado {
  estado: GeoEstado;
  punto?: Punto;
}

/** Igual que `geocodeDetallado` pero devolviendo solo el punto, para los usos que no
 * necesitan distinguir el motivo. */
export async function geocode(
  direccion: string,
  fetchImpl: typeof fetch = fetch,
  store: Storage | undefined = safeStorage(),
): Promise<Punto | null> {
  return (await geocodeDetallado(direccion, fetchImpl, store)).punto ?? null;
}

/**
 * Traduce una dirección a coordenadas, diciendo por qué si no pudo.
 *
 * Un «no encontrado» SÍ se cachea: la dirección seguirá sin estar en el índice mañana. Un
 * fallo de red o de servicio NO, porque es temporal y cachearlo dejaría la dirección
 * envenenada para siempre.
 */
export async function geocodeDetallado(
  direccion: string,
  fetchImpl: typeof fetch = fetch,
  store: Storage | undefined = safeStorage(),
): Promise<GeoResultado> {
  const clave = normalizar(direccion);
  if (clave.length < 4) return { estado: "no-encontrado" };

  const cache = loadCache(store);
  if (clave in cache) {
    const guardado = cache[clave];
    return guardado ? { estado: "encontrado", punto: guardado } : { estado: "no-encontrado" };
  }

  // El control de ritmo existe para respetar la política de Nominatim, que pide como máximo una
  // consulta por segundo. Solo tiene sentido cuando se va a llamar al servicio DE VERDAD: con un
  // `fetch` de mentira no se toca ningún servidor y la pausa solo hace esperar a quien mide.
  //
  // No es una comodidad: la suite dormía 33 segundos en este archivo, y como el reloj es real y
  // el instante del último envío es compartido entre pruebas, bajo carga alguna se pasaba del
  // tiempo máximo y la suite fallaba de forma INTERMITENTE. Una suite que falla a veces entrena a
  // ignorar el rojo, y entonces deja de servir para lo único que sirve.
  if (fetchImpl === globalThis.fetch) {
    const espera = RITMO_MS - (Date.now() - ultima);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultima = Date.now();
  }

  const url =
    `${BASE}?q=${encodeURIComponent(direccion)}` +
    "&format=json&limit=1&countrycodes=mx&addressdetails=0";

  let punto: Punto | null = null;
  try {
    const r = await fetchConLimite(fetchImpl, url, { headers: { Accept: "application/json" } });
    // un fallo del servicio NO se cachea: puede ser temporal
    if (!r.ok) return { estado: "servicio-falló" };
    const datos = await r.json();
    if (Array.isArray(datos) && datos.length > 0) {
      const lat = Number(datos[0].lat);
      const lng = Number(datos[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        punto = {
          lat,
          lng,
          descripcion: String(datos[0].display_name ?? ""),
          nivel: nivelPorRank(Number(datos[0].place_rank)),
        };
      }
    }
  } catch {
    // sin red se sigue trabajando con el catálogo local, y se DICE que fue por eso
    return { estado: "sin-red" };
  }

  guardar({ ...cache, [clave]: punto }, store);
  return punto ? { estado: "encontrado", punto } : { estado: "no-encontrado" };
}

/** Geocodificador de LOCALIDAD, el único que funciona desde un navegador. */
const LOCALIDAD_BASE = "https://geocoding-api.open-meteo.com/v1/search";

/**
 * Ubica la localidad de una dirección, no su número exacto.
 *
 * Por qué existe: Nominatim **deniega el acceso** a peticiones con User-Agent de navegador —está
 * en su política de uso y se comprobó: «Access denied» con `Mozilla/5.0` y respuesta correcta con
 * un User-Agent identificado—. Un navegador no puede cambiar el suyo, así que `geocodeDetallado`
 * no puede funcionar en el producto y toda dirección fuera del catálogo caía al respaldo.
 *
 * Y resulta que esta app no necesita precisión de calle: solo saber en qué localidad está el
 * domicilio para elegir el sitio medido más cercano, que queda a decenas de kilómetros. Con eso,
 * un geocodificador de localidades basta y sobra.
 *
 * Se descartó Photon midiendo, no por prejuicio: con caja de México devuelve «Merida, Texas» y
 * manda «Fortín de las Flores» a Guanajuato en vez de Veracruz. Éste devuelve el estado
 * (`admin1`), así que el estado que el instalador ya escribió sirve para desambiguar homónimos
 * —y homónimos hay: Salvatierra existe en Guanajuato y en Nayarit—.
 */
export async function geocodeLocalidad(
  direccion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeoResultado> {
  const lugares = segmentosDeLugar(direccion);
  if (lugares.length === 0) return { estado: "no-encontrado" };

  const nombre = lugares[0];
  // El último segmento es donde va el estado. Si solo hay uno, no hay con qué desambiguar.
  const estado = lugares.length > 1 ? lugares[lugares.length - 1] : undefined;

  /**
   * Los nombres OFICIALES mexicanos llevan cola: «Uruapan del Progreso», «Cuautla de Morelos»,
   * «Tapachula de Córdova y Ordóñez». El índice los tiene por el nombre corto, así que el largo
   * devuelve cero. Y el largo es justo el que aparece en un recibo de CFE, o sea el que el
   * instalador copia. Medido: de 40 localidades, 6 no resolvían y recortar la cola rescata la
   * mitad de las que son localidades de verdad.
   *
   * Solo se recorta por «de» y «del», y solo como SEGUNDO intento. No se prueba la última palabra
   * aunque rescataría un caso más: «san juan bautista» —recorte de San Juan Bautista Tuxtepec—
   * devuelve una localidad de Nayarit, a 500 km de la de Oaxaca. Un recorte puede mentir con
   * confianza, y lo único que lo hace seguro es el filtro por estado.
   */
  const intentos = [nombre];
  const corte = nombre.search(/ del? /);
  if (corte > 0) intentos.push(nombre.slice(0, corte));

  for (const consulta of intentos) {
    const res = await pedirLocalidad(consulta, estado, fetchImpl);
    if (res.estado !== "no-encontrado") return res;
  }
  return { estado: "no-encontrado" };
}

/** Una consulta al índice de localidades, con el estado como desempate. */
async function pedirLocalidad(
  nombre: string,
  estado: string | undefined,
  fetchImpl: typeof fetch,
): Promise<GeoResultado> {
  const url =
    `${LOCALIDAD_BASE}?name=${encodeURIComponent(nombre)}` +
    "&count=10&language=es&countryCode=MX";

  try {
    const r = await fetchConLimite(fetchImpl, url, { headers: { Accept: "application/json" } });
    if (!r.ok) return { estado: "servicio-falló" };
    const datos = await r.json();
    const lista: unknown[] = Array.isArray(datos?.results) ? datos.results : [];
    if (lista.length === 0) return { estado: "no-encontrado" };

    const punto = (x: Record<string, unknown>): Punto | null => {
      const lat = Number(x.latitude);
      const lng = Number(x.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      // Su índice es de poblaciones: nunca es más fino que la localidad.
      return {
        lat,
        lng,
        descripcion: `${String(x.name ?? "")}, ${String(x.admin1 ?? "")}`,
        nivel: "localidad",
      };
    };

    // Con estado escrito gana el que concuerde; sin él, el primero, que viene por relevancia.
    if (estado) {
      for (const x of lista as Record<string, unknown>[]) {
        const a1 = String(x.admin1 ?? "")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (a1 && (a1.includes(estado) || estado.includes(a1))) {
          const p = punto(x);
          if (p) return { estado: "encontrado", punto: p };
        }
      }
    }
    const p = punto(lista[0] as Record<string, unknown>);
    return p ? { estado: "encontrado", punto: p } : { estado: "no-encontrado" };
  } catch {
    return { estado: "sin-red" };
  }
}

/** Cómo se resolvió la física de una dirección, de mejor a peor. */
export type ResolucionOrigen = "catalogo" | "cercano" | "promedio";

/**
 * Hasta dónde llega el punto que se consiguió. Medido sobre 8 direcciones mexicanas de ciudades
 * de distinto tamaño: **2 llegaron al edificio, 5 solo a la calle y 1 no se encontró.**
 *
 * `"calle"` no es «casi el edificio»: en una avenida larga el punto puede caer a kilómetros del
 * número, y en la medición una «Avenida Juárez» de Puebla resolvió a Cuautlancingo, otro
 * municipio. Por eso los tres niveles se distinguen en vez de agruparse en «encontrado».
 *
 * Para la física cualquiera de los tres sirve: elige el sitio medido cercano y la latitud. Para
 * dibujar el techo sobre una imagen solo sirve `"edificio"`: a zoom 18 el píxel vale 0.56 m, así
 * que un kilómetro de error son 1780 píxeles y el techo no sale ni en el encuadre. Ése es el
 * motivo de `puedeCentrarImagen`.
 */
export type PrecisionPunto = "edificio" | "calle" | "localidad";

/**
 * Si el punto da para centrar una imagen aérea en el techo. Solo el nivel de edificio basta;
 * un punto sin nivel declarado —por ejemplo uno cacheado por una versión anterior— tampoco,
 * porque suponerle precisión sería inventarla.
 */
export function puedeCentrarImagen(p: Punto | undefined): boolean {
  return p?.nivel === "edificio";
}

export interface Resolucion {
  city: City;
  origen: ResolucionOrigen;
  /** Distancia al sitio medido, solo cuando se resolvió por proximidad. */
  km?: number;
  punto?: Punto;
  /** Hasta dónde llega `punto`. Solo viene cuando hay punto y el servicio lo declaró. */
  precision?: PrecisionPunto;
  /** Por qué se cayó al promedio, cuando fue el caso. La interfaz lo necesita para no decirle
   * «no encontramos tu dirección» a alguien que simplemente está sin señal. */
  motivo?: GeoEstado;
}

/**
 * Física para una dirección, con la mejor procedencia disponible.
 *
 * El orden importa y ahorra red: primero el catálogo por nombre, que es instantáneo y
 * exacto para las ciudades medidas. Solo si eso falla se geocodifica, y con las
 * coordenadas se toma el sitio medido más cercano. Si tampoco hay red queda el promedio,
 * siempre declarado como tal.
 */
export async function resolveSite(
  direccion: string,
  fetchImpl: typeof fetch = fetch,
  store: Storage | undefined = safeStorage(),
): Promise<Resolucion> {
  const porNombre = matchCity(direccion);
  // Una coincidencia FUERTE es el camino rápido y el que funciona sin red: el instalador escribió
  // el nombre de una ciudad medida. Una DÉBIL viene del último segmento, donde va el estado, y
  // confiar en ella costaba hasta un 11 % de error —«Fortín de las Flores, Veracruz» tomaba la
  // física del puerto teniendo Córdoba a 15 km—. Así que la débil no decide: se geocodifica.
  if (porNombre.matched && !porNombre.debil) {
    return { city: porNombre.city, origen: "catalogo" };
  }

  let r = await geocodeDetallado(direccion, fetchImpl, store);
  if (!r.punto && r.estado !== "no-encontrado") {
    // Se reintenta con el índice de poblaciones cuando el de calles no dio nada.
    //
    // CORRECCIÓN de una conclusión anterior de este archivo: se dio por verificado que Nominatim
    // denegaba el acceso a los User-Agent de navegador, y es falso. Medido: responde 200, con
    // `Access-Control-Allow-Origin: *`, y devuelve el número exacto de la casa. Lo que se
    // interpretó como bloqueo por identificación era casi con seguridad un bloqueo temporal por
    // ritmo, provocado por una tanda de 40 consultas seguidas.
    //
    // El respaldo sigue siendo necesario por otro motivo, éste sí medido: de 8 direcciones
    // mexicanas, 1 no se encontró y 5 se quedaron en la calle. Cuando el de calles falla del
    // todo, el punto de la población es mejor que nada.
    //
    // Un «no-encontrado» no se reintenta: la dirección tampoco estará en el otro índice y ese
    // resultado sí está cacheado.
    const alterno = await geocodeLocalidad(direccion, fetchImpl);
    if (alterno.punto) r = alterno;
  }
  if (!r.punto) {
    // Sin red, una coincidencia débil sigue siendo mejor que el promedio nacional: el estado
    // acota mucho más que el país. Se declara como catálogo porque de ahí sale la física.
    if (porNombre.matched) return { city: porNombre.city, origen: "catalogo", motivo: r.estado };
    return { city: DEFAULT_CITY, origen: "promedio", motivo: r.estado };
  }

  const punto = r.punto;
  const { site, km } = nearestSite(punto.lat, punto.lng);
  return {
    // La latitud del punto se conserva tal cual y la física se toma del sitio medido cercano.
    // OJO con `precision`: solo el nivel "edificio" identifica el techo. Medido sobre 8
    // direcciones mexicanas, ese nivel se alcanza en 2; en 5 el punto es de la CALLE, que en una
    // avenida larga puede quedar a kilómetros y hasta en otro municipio. Sirve para la física;
    // para dibujar el techo hace falta que el instalador confirme el punto.
    city: { lat: punto.lat, lng: punto.lng, yield: site.rendimiento, name: site.nombre, site },
    origen: "cercano",
    km,
    punto,
    precision: punto.nivel,
    motivo: "encontrado",
  };
}

/** Qué tan confiable es una resolución por proximidad. Los cortes salen de lo medido:
 * ciudades a menos de 50 km difieren típicamente menos de 2 %, mientras a más de 200 km
 * se puede haber cruzado de la costa a la sierra, que es la diferencia entre Mazatlán y
 * Durango: 199 km y 11 % de rendimiento. */
export function confianzaPorDistancia(km: number): "alta" | "media" | "baja" {
  if (km <= 50) return "alta";
  if (km <= 150) return "media";
  return "baja";
}

export type { Site };
