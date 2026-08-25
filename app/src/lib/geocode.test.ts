import { describe, it, expect, beforeEach } from "vitest";
import {
  geocode, geocodeDetallado, geocodeLocalidad, resolveSite, normalizar, loadCache,
  confianzaPorDistancia, puedeCentrarImagen, nivelPorRank,
} from "./geocode";
import { SITES, nearestSite, distanciaKm } from "./site";
import { DEFAULT_CITY, matchCity } from "./solar";

/** Almacenamiento de mentira: las pruebas no deben tocar el localStorage real ni la red. */
function almacen(inicial: Record<string, string> = {}): Storage {
  const datos = { ...inicial };
  return {
    getItem: (k) => datos[k] ?? null,
    setItem: (k, v) => { datos[k] = v; },
    removeItem: (k) => { delete datos[k]; },
    clear: () => { for (const k in datos) delete datos[k]; },
    key: (i) => Object.keys(datos)[i] ?? null,
    get length() { return Object.keys(datos).length; },
  } as Storage;
}

function respuesta(cuerpo: unknown, ok = true): Response {
  return { ok, json: async () => cuerpo } as Response;
}

/** fetch simulado que cuenta llamadas. NUNCA sale a Nominatim. */
function fetchFalso(cuerpo: unknown, ok = true) {
  const llamadas: string[] = [];
  const fn = (async (url: string) => {
    llamadas.push(String(url));
    return respuesta(cuerpo, ok);
  }) as unknown as typeof fetch;
  return { fn, llamadas };
}

const PUNTO_IRAPUATO = [{ lat: "20.6767", lon: "-101.3563", display_name: "Irapuato, Guanajuato, México" }];

describe("normalización de la dirección", () => {
  it("colapsa espacios y baja a minúsculas para que la caché acierte", () => {
    expect(normalizar("  Av.   Reforma   100 , CDMX ")).toBe("av. reforma 100 , cdmx");
  });
});

describe("geocode", () => {
  let store: Storage;
  beforeEach(() => { store = almacen(); });

  it("no llama al servicio con una consulta demasiado corta", async () => {
    const { fn, llamadas } = fetchFalso(PUNTO_IRAPUATO);
    expect(await geocode("abc", fn, store)).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it("devuelve el punto y lo guarda en caché", async () => {
    const { fn, llamadas } = fetchFalso(PUNTO_IRAPUATO);
    const p = await geocode("Calle Hidalgo 12, Irapuato", fn, store);
    expect(p?.lat).toBeCloseTo(20.6767, 4);
    expect(p?.lng).toBeCloseTo(-101.3563, 4);
    expect(llamadas).toHaveLength(1);

    const p2 = await geocode("Calle Hidalgo 12, Irapuato", fn, store);
    expect(p2?.lat).toBeCloseTo(20.6767, 4);
    expect(llamadas, "la caché debe evitar la segunda llamada").toHaveLength(1);
  });

  it("restringe la búsqueda a México", async () => {
    const { fn, llamadas } = fetchFalso(PUNTO_IRAPUATO);
    await geocode("Calle Hidalgo 12, Irapuato", fn, store);
    expect(llamadas[0]).toContain("countrycodes=mx");
  });

  it("una dirección inexistente devuelve null y SÍ se cachea", async () => {
    const { fn, llamadas } = fetchFalso([]);
    expect(await geocode("Calle que no existe 999, Nowhere", fn, store)).toBeNull();
    await geocode("Calle que no existe 999, Nowhere", fn, store);
    expect(llamadas).toHaveLength(1);
  });

  /** Misma regla que el cliente de la API satelital: un fallo del servicio no se cachea,
   * porque puede ser temporal y cachearlo dejaría la dirección envenenada para siempre. */
  it("un fallo del servicio NO se cachea", async () => {
    const { fn, llamadas } = fetchFalso(null, false);
    expect(await geocode("Av. Juárez 1, Irapuato", fn, store)).toBeNull();
    expect(loadCache(store)).toEqual({});
    await geocode("Av. Juárez 1, Irapuato", fn, store);
    expect(llamadas).toHaveLength(2);
  });

  it("sin red devuelve null en vez de romper", async () => {
    const explota = (async () => { throw new Error("sin red"); }) as unknown as typeof fetch;
    expect(await geocode("Av. Juárez 1, Irapuato", explota, store)).toBeNull();
  });

  it("una respuesta con coordenadas no numéricas no se acepta", async () => {
    const { fn } = fetchFalso([{ lat: "no", lon: "tampoco" }]);
    expect(await geocode("Av. Falsa 1, Irapuato", fn, store)).toBeNull();
  });
});

describe("caché del geocodificador", () => {
  it("rechaza un arreglo guardado en lugar de un objeto", () => {
    const store = almacen({ "solarme.geocode.v1": JSON.stringify([1, 2, 3]) });
    expect(loadCache(store)).toEqual({});
  });

  it("descarta entradas con forma equivocada y conserva las buenas", () => {
    const store = almacen({
      "solarme.geocode.v1": JSON.stringify({
        buena: { lat: 20, lng: -100, descripcion: "x" },
        mala: { lat: "20", lng: null },
      }),
    });
    const c = loadCache(store);
    expect(c.buena).toEqual({ lat: 20, lng: -100, descripcion: "x" });
    expect(c.mala).toBeUndefined();
  });

  it("conserva los nulos, que son un resultado válido y no una entrada corrupta", () => {
    const store = almacen({ "solarme.geocode.v1": JSON.stringify({ x: null }) });
    expect(loadCache(store).x).toBeNull();
  });

  it("un almacenamiento con basura no rompe la carga", () => {
    expect(loadCache(almacen({ "solarme.geocode.v1": "{{{" }))).toEqual({});
  });
});

describe("sitio medido más cercano", () => {
  it("un punto dentro de una ciudad medida devuelve esa ciudad", () => {
    const cdmx = SITES.cdmx;
    const { site, km } = nearestSite(cdmx.lat + 0.01, cdmx.lng + 0.01);
    expect(site.clave).toBe("cdmx");
    expect(km).toBeLessThan(3);
  });

  it("Irapuato cae en un sitio medido cercano, no en el otro extremo del país", () => {
    const { km } = nearestSite(20.6767, -101.3563);
    expect(km).toBeLessThan(80);
  });

  it("la distancia es simétrica y cero contra sí misma", () => {
    const a = SITES.tijuana;
    const b = SITES.merida;
    expect(distanciaKm(a.lat, a.lng, a.lat, a.lng)).toBeCloseTo(0, 6);
    expect(distanciaKm(a.lat, a.lng, b.lat, b.lng)).toBeCloseTo(
      distanciaKm(b.lat, b.lng, a.lat, a.lng), 6,
    );
  });

  it("Tijuana y Mérida están a más de 2500 km: la fórmula no colapsa a escala", () => {
    const a = SITES.tijuana;
    const b = SITES.merida;
    expect(distanciaKm(a.lat, a.lng, b.lat, b.lng)).toBeGreaterThan(2500);
  });
});

describe("resolveSite: catálogo, luego cercano, luego promedio", () => {
  let store: Storage;
  beforeEach(() => { store = almacen(); });

  it("una ciudad del catálogo se resuelve sin tocar la red", async () => {
    const { fn, llamadas } = fetchFalso(PUNTO_IRAPUATO);
    const r = await resolveSite("Av. Chapultepec 100, Guadalajara", fn, store);
    expect(r.origen).toBe("catalogo");
    expect(r.city.name).toBe("Guadalajara");
    expect(llamadas, "el catálogo es instantáneo y no debe gastar red").toHaveLength(0);
  });

  it("una dirección fuera del catálogo se geocodifica y toma el sitio cercano", async () => {
    // Un punto en la Sierra Tarahumara, lejos de cualquier ciudad medida: comprueba que
    // resuelve por proximidad de verdad y no por coincidir con un sitio.
    const sierra = [{ lat: "26.5", lon: "-107.0", display_name: "Sierra Tarahumara" }];
    const { fn } = fetchFalso(sierra);
    const r = await resolveSite("Camino de terracería, Ejido La Providencia", fn, store);
    expect(r.origen).toBe("cercano");
    expect(r.km).toBeGreaterThan(20);
    expect(r.km).toBeLessThan(400);
    expect(r.city.site).toBeDefined();
  });

  it("conserva las coordenadas reales del domicilio, no las del sitio vecino", async () => {
    // La dirección no puede nombrar una ciudad del catálogo, o el nombre gana antes de
    // geocodificar, que es justo el comportamiento correcto y no el que se prueba aquí.
    // Un punto que NO coincide con ninguna ciudad medida, para que se vea que las
    // coordenadas devueltas son del domicilio y no las del sitio vecino.
    const { fn } = fetchFalso([{ lat: "26.5", lon: "-107.0", display_name: "Sierra" }]);
    const r = await resolveSite("Camino a la presa s/n, Ejido El Sauz", fn, store);
    expect(r.origen).toBe("cercano");
    expect(r.city.lat).toBeCloseTo(26.5, 4);
    expect(r.city.lat).not.toBe(r.city.site!.lat);
    expect(r.city.lng).not.toBe(r.city.site!.lng);
  });

  it("sin geocodificación cae al promedio y lo declara", async () => {
    const { fn } = fetchFalso([]);
    const r = await resolveSite("Domicilio inventado sin nombre de ciudad", fn, store);
    expect(r.origen).toBe("promedio");
    expect(r.city).toEqual(DEFAULT_CITY);
    expect(r.km).toBeUndefined();
  });

  it("el rendimiento de una resolución cercana es el del sitio medido, no el promedio", async () => {
    const { fn } = fetchFalso(PUNTO_IRAPUATO);
    const r = await resolveSite("Camino a la presa s/n, Ejido El Sauz", fn, store);
    expect(r.city.yield).toBe(r.city.site!.rendimiento);
    expect(r.city.yield).not.toBe(DEFAULT_CITY.yield);
  });
});

describe("confianza por distancia", () => {
  it("los cortes reflejan lo medido entre ciudades", () => {
    expect(confianzaPorDistancia(20)).toBe("alta");
    expect(confianzaPorDistancia(50)).toBe("alta");
    expect(confianzaPorDistancia(51)).toBe("media");
    expect(confianzaPorDistancia(150)).toBe("media");
    expect(confianzaPorDistancia(199)).toBe("baja");
  });

  it("el caso Mazatlán–Durango, 199 km y 11 % de diferencia, es de confianza baja", () => {
    expect(confianzaPorDistancia(199)).toBe("baja");
  });
});


/**
 * «No hay señal» y «esa dirección no está en el índice» son cosas distintas, y antes las dos
 * devolvían `null`: la app le decía al instalador que su domicilio no se encontró cuando
 * estaba sin red en una azotea. Una lo arregla esperar señal; la otra, capturar a mano.
 */
describe("por qué falló la geocodificación", () => {
  let store: Storage;
  beforeEach(() => { store = almacen(); });

  it("una dirección encontrada lo dice y trae el punto", async () => {
    const { fn } = fetchFalso(PUNTO_IRAPUATO);
    const r = await geocodeDetallado("Calle Hidalgo 12, Irapuato", fn, store);
    expect(r.estado).toBe("encontrado");
    expect(r.punto?.lat).toBeCloseTo(20.6767, 4);
  });

  it("sin red devuelve sin-red, no no-encontrado", async () => {
    const explota = (async () => { throw new Error("sin red"); }) as unknown as typeof fetch;
    const r = await geocodeDetallado("Av. Juárez 1, Irapuato", explota, store);
    expect(r.estado).toBe("sin-red");
    expect(r.punto).toBeUndefined();
  });

  it("una dirección que el índice no tiene devuelve no-encontrado", async () => {
    const { fn } = fetchFalso([]);
    expect((await geocodeDetallado("Calle inventada 999", fn, store)).estado).toBe("no-encontrado");
  });

  it("un servicio caído se distingue de las dos anteriores", async () => {
    const { fn } = fetchFalso(null, false);
    expect((await geocodeDetallado("Av. Juárez 1, Irapuato", fn, store)).estado)
      .toBe("servicio-falló");
  });

  it("un no-encontrado SÍ se cachea y no se vuelve a preguntar", async () => {
    const { fn, llamadas } = fetchFalso([]);
    await geocodeDetallado("Calle inventada 999", fn, store);
    const r = await geocodeDetallado("Calle inventada 999", fn, store);
    expect(r.estado).toBe("no-encontrado");
    expect(llamadas).toHaveLength(1);
  });

  it("un fallo por falta de red NO se cachea: mañana puede haber señal", async () => {
    const explota = (async () => { throw new Error("sin red"); }) as unknown as typeof fetch;
    await geocodeDetallado("Av. Juárez 1, Irapuato", explota, store);
    expect(loadCache(store)).toEqual({});
  });

  it("`geocode` sigue devolviendo solo el punto, para quien no necesita el motivo", async () => {
    const { fn } = fetchFalso(PUNTO_IRAPUATO);
    const p = await geocode("Calle Hidalgo 12, Irapuato", fn, store);
    expect(p?.lat).toBeCloseTo(20.6767, 4);
  });
});

describe("resolveSite propaga el motivo", () => {
  let store: Storage;
  beforeEach(() => { store = almacen(); });

  it("sin red cae al promedio y dice que fue por falta de red", async () => {
    const explota = (async () => { throw new Error("sin red"); }) as unknown as typeof fetch;
    const r = await resolveSite("Camino a la presa s/n, Ejido El Sauz", explota, store);
    expect(r.origen).toBe("promedio");
    expect(r.motivo).toBe("sin-red");
  });

  it("una dirección inexistente cae al promedio por otro motivo", async () => {
    const { fn } = fetchFalso([]);
    const r = await resolveSite("Camino a la presa s/n, Ejido El Sauz", fn, store);
    expect(r.origen).toBe("promedio");
    expect(r.motivo).toBe("no-encontrado");
  });

  it("una ciudad del catálogo no trae motivo: no hizo falta geocodificar", async () => {
    const { fn, llamadas } = fetchFalso(PUNTO_IRAPUATO);
    const r = await resolveSite("Av. Chapultepec 100, Guadalajara", fn, store);
    expect(r.origen).toBe("catalogo");
    expect(r.motivo).toBeUndefined();
    expect(llamadas).toHaveLength(0);
  });
});

describe("los tres avisos de confianza son alcanzables con la geografía real", () => {
  // Por qué existe esto: `PhysicsSource` muestra un texto distinto por nivel —«prácticamente el
  // del domicilio», «conviene confirmarlo», «orden de magnitud, no compromiso»—. Si un nivel no
  // se alcanzara nunca, ese texto sería inalcanzable y nadie lo notaría. Se mide sobre las
  // coordenadas reales de los sitios medidos, no sobre umbrales inventados.

  /** Distancia de cada sitio a su vecino medido más cercano. */
  function huecos() {
    const S = Object.values(SITES);
    return S.map((a) => {
      let km = Infinity;
      let vecino = "";
      for (const b of S) {
        if (b === a) continue;
        const d = distanciaKm(a.lat, a.lng, b.lat, b.lng);
        if (d < km) { km = d; vecino = b.nombre; }
      }
      return { sitio: a.nombre, vecino, km };
    }).sort((x, y) => y.km - x.km);
  }

  it("ningún domicilio entre dos sitios vecinos cae ya en «baja»", () => {
    const peor = huecos()[0];
    // Esta prueba nació al revés: exigía que el hueco mayor pasara de 300 km, o sea fijaba una
    // CARENCIA como requisito, y falló —correctamente— el día que la carencia se arregló. Ahora
    // afirma la garantía: el hueco mayor eran 342 km (Ciudad Juárez–Chihuahua) y al añadir Villa
    // Ahumada, Santa Ana y Felipe Carrillo Puerto bajó a 199 km, así que el punto medio del peor
    // hueco queda a ~99 km y ya entra en «media».
    expect(peor.km / 2, `${peor.sitio}–${peor.vecino}`).toBeLessThanOrEqual(150);
    expect(confianzaPorDistancia(peor.km / 2)).not.toBe("baja");
  });

  it("el catálogo no se puede vaciar dejando huecos peores en silencio", () => {
    // Trinquete de cobertura: si alguien borra sitios, el hueco crece y más domicilios caen a
    // «orden de magnitud» sin que nada avise. El techo se aprieta a 250 km porque hoy son 199.
    const peor = huecos()[0];
    expect(peor.km, `${peor.sitio}–${peor.vecino} abrió un hueco nuevo`).toBeLessThanOrEqual(250);
  });

  it("los tres niveles se alcanzan desde puntos reales del territorio", () => {
    const vistos = new Set<string>();
    for (let lat = 15; lat <= 32.5; lat += 0.5) {
      for (let lng = -117; lng <= -87; lng += 0.5) {
        const r = nearestSite(lat, lng);
        // Más de 400 km de cualquier ciudad medida es mar, no territorio útil.
        if (r.km > 400) continue;
        vistos.add(confianzaPorDistancia(r.km));
      }
    }
    expect([...vistos].sort()).toEqual(["alta", "baja", "media"]);
  });
});

describe("las poblaciones reales quedan cubiertas, no solo el mapa", () => {
  // La cobertura por ÁREA decía 42 % en nivel «baja», y eso sonaba mucho peor de lo que es:
  // ese 42 % es desierto y sierra. Medido contra 196 asentamientos mexicanos de más de 50 000
  // habitantes (Wikidata, deduplicados por entidad porque `P1082` trae un valor por censo),
  // el reparto de la población era 98.17 % «alta», 1.78 % «media» y 0.05 % «baja» — y ese
  // 0.05 % era UNA sola localidad: Puerto Peñasco, a 232 km del sitio medido más cercano.
  //
  // Al medirla y añadirla, ninguna localidad de ese tamaño queda ya en «baja». Estas
  // coordenadas se fijan aquí para que la garantía se compruebe sin red: si alguien borra
  // sitios del catálogo, esta prueba cae antes de que un instalador se lleve la sorpresa.
  const POBLACIONES: Array<[string, number, number, number]> = [
    // nombre, lat, lng, km máximos admitidos
    ["Puerto Peñasco", 31.3167, -113.5333, 50],
    ["Ciudad Valles", 21.9833, -99.0167, 150],
    ["San Luis Río Colorado", 32.4536, -114.7617, 150],
    ["San Andrés Tuxtla", 18.4472, -95.2131, 150],
    ["Ciudad Acuña", 29.3236, -100.9517, 150],
  ];

  it("ninguna localidad grande cae en «orden de magnitud»", () => {
    for (const [nombre, lat, lng, tope] of POBLACIONES) {
      const r = nearestSite(lat, lng);
      expect(r.km, `${nombre} quedó a ${Math.round(r.km)} km de ${r.site.nombre}`)
        .toBeLessThanOrEqual(tope);
      expect(confianzaPorDistancia(r.km), nombre).not.toBe("baja");
    }
  });

  it("Puerto Peñasco tiene su propia física medida, no una prestada", () => {
    // Era el único caso en «baja» del país por población. Ahora es su propio sitio: si alguien
    // lo quita, el nivel de confianza de esa costa se desploma sin aviso.
    const r = nearestSite(31.3167, -113.5333);
    expect(r.km).toBeLessThan(20);
    expect(confianzaPorDistancia(r.km)).toBe("alta");
    // Y su rendimiento medido es de los mejores del país: 2237 kWh/kWp, con el óptimo al sur
    // exacto. Si eso cambia sin medir de nuevo, es que alguien lo editó a mano.
    expect(r.site.rendimiento).toBeGreaterThan(2100);
  });
});

describe("cada sitio añadido evita un error medido de física prestada", () => {
  // Cómo se eligieron: NO por distancia. Se pidió a PVGIS el rendimiento de catorce localidades
  // que estaban en nivel «media» y se comparó con el que la app les prestaba del vecino. La
  // distancia resultó un mal predictor: Ocotlán se desviaba a 52 km más que Agua Prieta a 133 km,
  // porque lo que importa es cruzar un límite climático, no los kilómetros.
  //
  // Corrección importante sobre una cifra que reporté mal: primero comparé el óptimo de PVGIS
  // (con azimut libre) contra `Site.rendimiento`, que es el valor CONSERVADOR al sur degradado
  // cuando NASA discrepa. Son magnitudes distintas y el error salía inflado (+10.27 %). Midiendo
  // lo mismo con lo mismo —el rendimiento que la app usa, propio frente al del vecino— la
  // sobreestimación real llegaba a +5.48 %.
  const ANADIDOS: Array<[string, number, number, number]> = [
    // clave en el catálogo, lat, lng, desviación medida frente al vecino en %
    ["ocotlan", 20.3467, -102.7742, 5.48],
    ["puerto penasco", 31.3167, -113.5333, 4.39],
    ["ciudad valles", 21.9865, -99.0187, 3.86],
    ["ciudad mante", 22.7425, -98.9722, 3.71],
    ["tuxtepec", 18.0883, -96.1253, 3.29],
    ["huajuapan", 17.8097, -97.7764, 1.75],
  ];

  it("ninguno es redundante: quitarlo cambiaría la física que se le presta", () => {
    for (const [clave, lat, lng, esperado] of ANADIDOS) {
      const propio = SITES[clave];
      expect(propio, `${clave} desapareció del catálogo`).toBeTruthy();

      // El vecino medido más cercano que no es él mismo: lo que la app usaría si se borrara.
      let vecino = null as typeof propio | null;
      let mejor = Infinity;
      for (const [k, s] of Object.entries(SITES)) {
        if (k === clave) continue;
        const d = distanciaKm(lat, lng, s.lat, s.lng);
        if (d < mejor) { mejor = d; vecino = s; }
      }
      const brecha = Math.abs((vecino!.rendimiento - propio.rendimiento) / propio.rendimiento * 100);

      // Se compara la MISMA magnitud en los dos lados: el rendimiento que la app usa.
      expect(brecha, `${propio.nombre} frente a ${vecino!.nombre}`).toBeGreaterThan(1);
      expect(brecha, `${propio.nombre}: se midió ${esperado} %`).toBeCloseTo(esperado, 0);
    }
  });

  it("el catálogo cubre el rango nacional que la investigación midió", () => {
    const r = Object.values(SITES).map((s) => s.rendimiento);
    // Tuxtepec, en la cuenca del Papaloapan, es de los más bajos; Mexicali y Puerto Peñasco de
    // los más altos. Si el rango se estrecha es que alguien recortó el catálogo por los extremos.
    expect(Math.min(...r)).toBeLessThan(1600);
    expect(Math.max(...r)).toBeGreaterThan(2100);
  });
});


describe("el nombre del estado no puede secuestrar la física", () => {
  // El defecto: `resolveSite` confiaba en la coincidencia de texto antes de geocodificar, y
  // `matchCity` buscaba cualquier clave del catálogo dentro de la dirección. Como CATORCE de los
  // treinta y dos estados mexicanos se llaman igual que una ciudad medida, «Fortín de las Flores,
  // Veracruz» resolvía a Veracruz puerto (1616.7 kWh/kWp) teniendo Córdoba a 15 km, medida en
  // ~1823: un 11 % por debajo, y sin gastar una sola llamada de red que lo habría corregido.
  //
  // Se encontró intentando ver el aviso de cercanía en el navegador, no leyendo el código.

  const CASOS: Array<[string, "fuerte" | "debil", string]> = [
    // dirección, qué debe ser la coincidencia, ciudad que devuelve
    ["Av. Chapultepec 100, Guadalajara", "fuerte", "Guadalajara"],
    ["Mérida", "fuerte", "Mérida"],
    ["Veracruz, Veracruz", "fuerte", "Veracruz"],
    ["Tehuacán, Puebla", "fuerte", "Tehuacán"],
    ["Av. Constitución 100, Monterrey, Nuevo León", "fuerte", "Monterrey"],
    ["Fortín de las Flores, Veracruz", "debil", "Veracruz"],
    ["Calle 5 de Mayo 20, Coatepec, Veracruz", "debil", "Veracruz"],
    ["Salvatierra, Guanajuato", "debil", "Guanajuato"],
  ];

  it("distingue la ciudad nombrada del estado que la acompaña", () => {
    for (const [direccion, esperado, ciudad] of CASOS) {
      const m = matchCity(direccion);
      expect(m.matched, direccion).toBe(true);
      expect(m.city.name, direccion).toBe(ciudad);
      expect(m.debil ? "debil" : "fuerte", direccion).toBe(esperado);
    }
  });

  it("una calle en el primer segmento no convierte a la ciudad en sospechosa", () => {
    // Ésta es la trampa que cazó una prueba que ya existía: «Av. Chapultepec 100, Guadalajara»
    // tiene la ciudad en el último segmento, pero el primero es una calle, así que Guadalajara es
    // el único lugar nombrado y la coincidencia es buena.
    expect(matchCity("Av. Chapultepec 100, Guadalajara").debil).toBe(false);
    expect(matchCity("Calle 5 de Mayo 20, Coatepec, Veracruz").debil).toBe(true);
  });

  it("con coincidencia débil geocodifica en vez de creerle al estado", async () => {
    const store = almacen();
    const { fn, llamadas } = fetchFalso(PUNTO_IRAPUATO);
    const r = await resolveSite("Salvatierra, Guanajuato", fn, store);

    expect(llamadas, "la coincidencia débil DEBE gastar una llamada").toHaveLength(1);
    expect(r.origen).toBe("cercano");
    expect(r.km).toBeGreaterThanOrEqual(0);
  });

  it("con coincidencia fuerte sigue sin tocar la red", async () => {
    const store = almacen();
    const { fn, llamadas } = fetchFalso(PUNTO_IRAPUATO);
    const r = await resolveSite("Mérida", fn, store);

    expect(llamadas, "una ciudad nombrada no debe gastar red ni dejar de funcionar sin ella")
      .toHaveLength(0);
    expect(r.origen).toBe("catalogo");
  });

  it("sin red, la coincidencia débil vale más que el promedio nacional", async () => {
    // El estado acota mucho más que el país. Caer al promedio nacional cuando se sabe el estado
    // sería tirar información que el instalador ya escribió.
    const store = almacen();
    const fn = (async () => { throw new Error("sin red"); }) as unknown as typeof fetch;
    const r = await resolveSite("Salvatierra, Guanajuato", fn, store);

    expect(r.origen).toBe("catalogo");
    expect(r.city.name).toBe("Guanajuato");
    expect(r.motivo, "debe declarar por qué no se geocodificó").toBeTruthy();
  });
});

describe("el geocodificador que sí funciona desde un navegador", () => {
  // Nominatim deniega el acceso a peticiones con User-Agent de navegador —comprobado: «Access
  // denied» con Mozilla/5.0, respuesta correcta con un User-Agent identificado— y un navegador no
  // puede cambiar el suyo. Así que su fallo es la NORMA en el producto, no la excepción, y hace
  // falta un segundo camino. Éste ubica la LOCALIDAD, que es todo lo que la app necesita: el sitio
  // medido más cercano está a decenas de kilómetros, no a metros.
  const SALVATIERRA = {
    results: [
      { name: "Salvatierra", admin1: "Estado de Nayarit", latitude: 21.325, longitude: -104.1694 },
      { name: "Salvatierra", admin1: "Estado de Guanajuato", latitude: 20.2132, longitude: -100.8802 },
    ],
  };

  it("desambigua homónimos con el estado que el instalador escribió", async () => {
    // Sin esto se toma el primero por relevancia y Salvatierra acaba en Nayarit, a 500 km.
    const { fn } = fetchFalso(SALVATIERRA);
    const r = await geocodeLocalidad("Salvatierra, Guanajuato", fn);

    expect(r.estado).toBe("encontrado");
    expect(r.punto!.lat).toBeCloseTo(20.2132, 3);
    expect(r.punto!.descripcion).toMatch(/Guanajuato/);
  });

  it("sin estado escrito toma el primero, que viene por relevancia", async () => {
    const { fn } = fetchFalso(SALVATIERRA);
    const r = await geocodeLocalidad("Salvatierra", fn);
    expect(r.punto!.lat).toBeCloseTo(21.325, 3);
  });

  it("pregunta por la localidad, no por la calle", async () => {
    const { fn, llamadas } = fetchFalso({ results: [] });
    await geocodeLocalidad("Av. Chapultepec 100, Fortín de las Flores, Veracruz", fn);
    // La calle no nombra localidad: preguntar por ella no devuelve nada útil.
    expect(llamadas[0]).not.toMatch(/Chapultepec/);
    // Se pregunta sin acentos porque `segmentosDeLugar` normaliza, y la API es insensible a
    // ellos: se comprobó que «Fortin de las Flores» devuelve Fortín, Veracruz.
    expect(decodeURIComponent(llamadas[0])).toMatch(/name=fortin de las flores/);
  });

  it("distingue no encontrado, servicio caído y falta de red", async () => {
    expect((await geocodeLocalidad("Xyz", fetchFalso({ results: [] }).fn)).estado)
      .toBe("no-encontrado");
    expect((await geocodeLocalidad("Xyz", fetchFalso({}, false).fn)).estado)
      .toBe("servicio-falló");
    const revienta = (async () => { throw new Error("sin red"); }) as unknown as typeof fetch;
    expect((await geocodeLocalidad("Xyz", revienta)).estado).toBe("sin-red");
  });

  it("reintenta sin la cola oficial cuando el nombre largo no existe en el índice", async () => {
    // Los nombres oficiales llevan cola —«Cuautla de Morelos», «Uruapan del Progreso»— y son los
    // que aparecen en un recibo de CFE, o sea los que el instalador copia. El índice los tiene por
    // el nombre corto. Medido: de 40 localidades, 6 no resolvían por esto.
    const consultas: string[] = [];
    const fn = (async (url: string) => {
      consultas.push(decodeURIComponent(String(url)));
      const corto = String(url).includes("name=cuautla&");
      return {
        ok: true,
        status: 200,
        json: async () => (corto
          ? { results: [{ name: "Cuautla", admin1: "Estado de Morelos", latitude: 18.811, longitude: -98.935 }] }
          : { results: [] }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await geocodeLocalidad("Cuautla de Morelos, Morelos", fn);

    expect(consultas, "primero el nombre completo, luego el recortado").toHaveLength(2);
    expect(consultas[0]).toMatch(/name=cuautla de morelos/);
    expect(consultas[1]).toMatch(/name=cuautla&/);
    expect(r.estado).toBe("encontrado");
    expect(r.punto!.lat).toBeCloseTo(18.811, 3);
  });

  it("no recorta cuando el nombre completo sí resuelve", async () => {
    // Un recorte puede mentir con confianza: «san juan bautista», recorte de San Juan Bautista
    // Tuxtepec, devuelve una localidad de Nayarit a 500 km de la de Oaxaca. Solo se recorta como
    // último recurso.
    const { fn, llamadas } = fetchFalso({
      results: [{ name: "Cuautla", admin1: "Estado de Morelos", latitude: 18.811, longitude: -98.935 }],
    });
    await geocodeLocalidad("Cuautla de Morelos, Morelos", fn);
    expect(llamadas).toHaveLength(1);
  });

  it("resolveSite reintenta con él cuando el primero es denegado", async () => {
    // Éste es el caso real del navegador: Nominatim responde no-ok y antes de esto la app se
    // quedaba con el nombre escrito sin haber ubicado nada.
    const llamadas: string[] = [];
    const fn = (async (url: string) => {
      llamadas.push(String(url));
      if (String(url).includes("nominatim")) {
        return { ok: false, status: 403, json: async () => ({}) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => SALVATIERRA } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await resolveSite("Salvatierra, Guanajuato", fn, almacen());

    expect(llamadas.some((u) => u.includes("nominatim")), "debe intentar el primero").toBe(true);
    expect(llamadas.some((u) => u.includes("open-meteo")), "y reintentar con el segundo").toBe(true);
    expect(r.origen).toBe("cercano");
    expect(r.punto!.lat).toBeCloseTo(20.2132, 3);
  });

  it("no reintenta cuando la dirección simplemente no existe", async () => {
    // Un «no-encontrado» ya está cacheado y tampoco estará en el otro índice: reintentar sería
    // gastar una llamada por cada dirección mal escrita.
    const llamadas: string[] = [];
    const fn = (async (url: string) => {
      llamadas.push(String(url));
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    }) as unknown as typeof fetch;

    await resolveSite("Direccion Inexistente Qwerty", fn, almacen());
    expect(llamadas.filter((u) => u.includes("open-meteo"))).toHaveLength(0);
  });
});

describe("el control de ritmo sigue protegiendo al servicio real", () => {
  // La pausa de 1.1 s solo se aplica cuando `fetchImpl` ES el `fetch` real, para que las pruebas
  // no duerman: así este archivo pasó de 33 s a medio segundo y la suite dejó de fallar de forma
  // intermitente por agotar el tiempo bajo carga.
  //
  // Pero esa optimización sería un daño si desactivara el límite EN PRODUCCIÓN: Nominatim pide
  // como máximo una consulta por segundo, y pasarse es exactamente lo que provoca un bloqueo
  // temporal por ritmo. Esta prueba cuesta 1.1 s a propósito: es el precio de demostrarlo.
  it("con el fetch real de por medio, dos consultas seguidas se separan", async () => {
    const real = globalThis.fetch;
    const llamadas: number[] = [];
    const espia = (async () => {
      llamadas.push(Date.now());
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    }) as unknown as typeof fetch;

    // Se instala el espía COMO el fetch global y se pasa el mismo: así la condición se cumple
    // igual que en producción, sin tocar la red.
    globalThis.fetch = espia;
    try {
      const store = almacen();
      await geocodeDetallado("Direccion Uno Muy Distinta", espia, store);
      await geocodeDetallado("Direccion Dos Muy Distinta", espia, store);
    } finally {
      globalThis.fetch = real;
    }

    expect(llamadas).toHaveLength(2);
    expect(llamadas[1] - llamadas[0], "no se respetó una consulta por segundo").toBeGreaterThanOrEqual(
      1000
    );
  }, 15000);

  it("con un fetch de mentira no se espera, porque no hay servicio que proteger", async () => {
    const inicio = Date.now();
    const falso = (async () =>
      ({ ok: true, status: 200, json: async () => [] }) as unknown as Response) as unknown as typeof fetch;
    const store = almacen();
    await geocodeDetallado("Otra Direccion Distinta A", falso, store);
    await geocodeDetallado("Otra Direccion Distinta B", falso, store);
    expect(Date.now() - inicio, "las pruebas no deben dormir").toBeLessThan(500);
  });
});

describe("una petición cortada por tiempo se cuenta como falta de señal", () => {
  // Antes ninguna llamada tenía límite de tiempo: en una azotea con señal intermitente, una
  // respuesta a medias dejaba la interfaz en «Buscando las coordenadas…» para siempre. Ahora se
  // aborta, y lo que importa es CÓMO se comunica: un corte no es una dirección inexistente.
  it("cae al estado escrito y declara sin-red, no no-encontrado", async () => {
    const cortado = (async () => {
      throw new DOMException("cancelado", "AbortError");
    }) as unknown as typeof fetch;

    const r = await resolveSite("Salvatierra, Guanajuato", cortado, almacen());
    expect(r.motivo).toBe("sin-red");
    // La física viene del nombre escrito, que acota más que el promedio nacional.
    expect(r.origen).toBe("catalogo");
    // Y no se promete una precisión que no se consiguió.
    expect(r.precision).toBeUndefined();
  });
});

describe("la resolución declara hasta dónde llega su punto", () => {
  // Existe porque el comentario del código afirmaba que se conservaban «las coordenadas REALES
  // del domicilio», y no es cierto en general: medido sobre 8 direcciones mexicanas, solo 2
  // llegaron al edificio, 5 se quedaron en la calle y 1 no se encontró.
  //
  // Las pruebas usan «Salvatierra, Guanajuato» a propósito: es coincidencia DÉBIL del catálogo
  // (Guanajuato es nombre de estado), así que `resolveSite` sí sale a geocodificar. Con una
  // ciudad medida como Guadalajara el camino rápido cortaría antes y no se ejercitaría nada.
  const LOCALIDAD = {
    results: [
      { name: "Salvatierra", admin1: "Estado de Guanajuato", latitude: 20.2132, longitude: -100.8802 },
    ],
  };
  const DIRECCION = "Salvatierra, Guanajuato";

  /** Respuesta de Nominatim con el rango que decide el nivel. */
  function conRank(rank: number): typeof fetch {
    return (async (url: string) => {
      if (String(url).includes("nominatim")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { lat: "20.2140", lon: "-100.8810", display_name: "Calle Hidalgo 10, Salvatierra", place_rank: rank },
          ],
        } as unknown as Response;
      }
      throw new Error("no debe hacer falta el respaldo");
    }) as unknown as typeof fetch;
  }

  it("el rango 30 es un edificio y es el único que permite centrar la imagen", async () => {
    const r = await resolveSite(DIRECCION, conRank(30), almacen());
    expect(r.precision).toBe("edificio");
    expect(puedeCentrarImagen(r.punto)).toBe(true);
  });

  it("el rango 26 es una calle, y NO basta para centrar la imagen", async () => {
    // Éste es el caso mayoritario en México, y el que engaña: en la medición una «Avenida Juárez»
    // de Puebla resolvió a Cuautlancingo, otro municipio.
    const r = await resolveSite(DIRECCION, conRank(26), almacen());
    expect(r.precision).toBe("calle");
    expect(puedeCentrarImagen(r.punto)).toBe(false);
  });

  it("un rango bajo es zona, no dirección", async () => {
    const r = await resolveSite(DIRECCION, conRank(16), almacen());
    expect(r.precision).toBe("localidad");
    expect(puedeCentrarImagen(r.punto)).toBe(false);
  });

  it("cuando contesta el índice de poblaciones, el nivel es localidad", async () => {
    const fn = (async (url: string) => {
      if (String(url).includes("nominatim")) {
        return { ok: false, status: 403, json: async () => ({}) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => LOCALIDAD } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await resolveSite(DIRECCION, fn, almacen());
    expect(r.punto).toBeDefined();
    expect(r.precision).toBe("localidad");
    expect(puedeCentrarImagen(r.punto)).toBe(false);
  });

  it("sin punto no se declara precisión, para no prometer una que no existe", async () => {
    const fn = (async () => {
      throw new Error("sin red");
    }) as unknown as typeof fetch;

    const r = await resolveSite(DIRECCION, fn, almacen());
    expect(r.punto).toBeUndefined();
    expect(r.precision).toBeUndefined();
    expect(puedeCentrarImagen(r.punto)).toBe(false);
  });

  it("el clasificador nunca supone más precisión de la declarada", () => {
    expect(nivelPorRank(30)).toBe("edificio");
    expect(nivelPorRank(29)).toBe("calle");
    expect(nivelPorRank(26)).toBe("calle");
    expect(nivelPorRank(25)).toBe("localidad");
    expect(nivelPorRank(4)).toBe("localidad");
    // Un rango ausente o roto cae a lo más prudente, no a lo más favorable.
    expect(nivelPorRank(NaN)).toBe("localidad");
    expect(nivelPorRank(Number.POSITIVE_INFINITY)).toBe("localidad");
  });

  it("el nivel sobrevive a la caché", async () => {
    // Si la caché lo tirara, un punto de calle recuperado del almacén parecería de edificio.
    const store = almacen();
    const primera = await resolveSite(DIRECCION, conRank(26), store);
    expect(primera.precision).toBe("calle");

    const sinRed = (async () => {
      throw new Error("no debe salir a la red: está cacheado");
    }) as unknown as typeof fetch;
    const segunda = await resolveSite(DIRECCION, sinRed, store);
    expect(segunda.precision).toBe("calle");
    expect(puedeCentrarImagen(segunda.punto)).toBe(false);
  });

  it("un punto guardado por una versión anterior no finge tener nivel", () => {
    // Los puntos cacheados antes de este campo no lo traen. Suponerles «edificio» sería inventar.
    expect(puedeCentrarImagen({ lat: 20.2, lng: -100.8, descripcion: "viejo" })).toBe(false);
  });

  it("un punto de calle está demasiado lejos para dibujar un techo encima", () => {
    // La cuenta que motivó el campo: a zoom 18 el píxel vale 0.563 m en el centro del país.
    // Un kilómetro son casi 1800 píxeles: el techo no estaría ni cerca del encuadre.
    const metrosPorPixel = 0.563;
    const pixelesPorKm = 1000 / metrosPorPixel;
    expect(pixelesPorKm).toBeGreaterThan(1700);
    expect(0.8 * pixelesPorKm).toBeGreaterThan(1000);
  });
});
