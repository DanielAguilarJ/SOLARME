import { describe, it, expect } from "vitest";
import {
  optTilt,
  tiltLoss,
  azimuthLoss,
  orientationFactor,
  orientationAdvice,
  annualFromBill,
  tariffFromBill,
  compute,
  resolveCity,
  DEFAULT_CITY,
  GD_LIMIT_KW,
  type Panel,
  type Design,
  matchCity,
  citySuggestions,
  cityOfProject,
} from "./solar";

/**
 * Estas pruebas son la especificación ejecutable de la investigación profunda
 * (research/02-deep-research-perplexity.md). Cada anclaje numérico viene de ahí.
 *
 * Si una de estas falla, no es que la prueba esté mal: es que el modelo se separó
 * de los datos medidos y las propuestas que genere SolarMe dejarán de sostenerse.
 */

const PANEL: Panel = {
  brand: "Test", model: "T-500", w: 500, eff: 22, temp: -0.3,
  area: 2.2, voc: 49.9, vmp: 41.8, isc: 14.0, imp: 13.2, betaVoc: -0.125, ppw: 5.2, priceOrigin: "banda", warr: 25,
};

describe("optTilt — bandas de latitud medidas en México", () => {
  // Fuente: 15–20 °N → 15–18° · 20–25 °N → 18–22° · 25–30 °N → 22–26°
  const bandas: [number, number, number, string][] = [
    [17, 15, 18, "banda 15–20 °N (Oaxaca, Guerrero)"],
    [19.4, 15, 18, "CDMX"],
    [21, 18, 22, "banda 20–25 °N (Mérida)"],
    [24, 18, 22, "banda 20–25 °N (Zacatecas)"],
    [25.7, 22, 26, "banda 25–30 °N (Monterrey)"],
    [29, 22, 26, "banda 25–30 °N (Hermosillo)"],
  ];

  for (const [lat, min, max, label] of bandas) {
    it(`latitud ${lat}° cae en ${min}–${max}° · ${label}`, () => {
      const t = optTilt(lat);
      expect(t).toBeGreaterThanOrEqual(min);
      expect(t).toBeLessThanOrEqual(max);
    });
  }

  it("nunca propone inclinaciones fuera del rango montable", () => {
    for (let lat = 0; lat <= 90; lat += 1) {
      expect(optTilt(lat)).toBeGreaterThanOrEqual(10);
      expect(optTilt(lat)).toBeLessThanOrEqual(35);
    }
  });

  it("es simétrica respecto al hemisferio", () => {
    expect(optTilt(-25.7)).toBe(optTilt(25.7));
  });
});

describe("tiltLoss — curva de pérdida por desviación", () => {
  const lat = 21;

  // Anclajes medidos: ±10° → <1–2 % · ~20° → ~5 % · 30° → 10–12 % · 90° → >30 %
  it("±10° del óptimo pierde menos de 2 %", () => {
    const loss = tiltLoss(optTilt(lat) + 10, lat) * 100;
    expect(loss).toBeLessThan(2);
  });

  it("~20° de desviación pierde alrededor de 5 %", () => {
    const loss = tiltLoss(optTilt(lat) + 20, lat) * 100;
    expect(loss).toBeGreaterThan(4);
    expect(loss).toBeLessThan(6.5);
  });

  it("30° de desviación pierde entre 10 y 12 %", () => {
    const loss = tiltLoss(optTilt(lat) + 30, lat) * 100;
    expect(loss).toBeGreaterThanOrEqual(10);
    expect(loss).toBeLessThanOrEqual(12);
  });

  it("una fachada vertical pierde más de 30 %", () => {
    expect(tiltLoss(90, lat) * 100).toBeGreaterThan(30);
  });

  it("no pierde nada en el óptimo y crece de forma monótona", () => {
    expect(tiltLoss(optTilt(lat), lat)).toBe(0);
    let prev = 0;
    for (let d = 1; d <= 60; d++) {
      const loss = tiltLoss(optTilt(lat) + d, lat);
      expect(loss).toBeGreaterThanOrEqual(prev);
      prev = loss;
    }
  });

  it("es simétrica: desviarse hacia arriba o hacia abajo cuesta igual", () => {
    const ot = optTilt(lat);
    expect(tiltLoss(ot + 15, lat)).toBeCloseTo(tiltLoss(ot - 15, lat), 10);
  });
});

describe("azimuthLoss — auditada contra barridos reales", () => {
  /** La prueba anterior afirmaba "±30° del sur pierde entre 3 y 4 %". No estaba mal
   * escrita sino mal concebida: ese 3–4 % es el promedio simétrico sesgado al poniente.
   * Medido en CDMX, 30° al poniente cuesta 3.4 % y 30° al oriente MEJORA 0.6 %. La
   * pérdida no es simétrica y depende de la inclinación, dos cosas que la firma vieja
   * `azimuthLoss(az)` no podía expresar. */

  it("el sur verdadero no tiene pérdida", () => {
    expect(azimuthLoss(180, 24)).toBe(0);
  });

  it("depende de la inclinación, que es el término que faltaba", () => {
    expect(azimuthLoss(210, 30)).toBeGreaterThan(azimuthLoss(210, 15));
  });

  it("con la mesa horizontal el azimut es irrelevante", () => {
    expect(azimuthLoss(270, 0)).toBe(0);
  });

  it("desviarse 30° en azimut cuesta menos que 30° en inclinación", () => {
    expect(azimuthLoss(210, 20)).toBeLessThan(tiltLoss(optTilt(21) + 30, 21));
  });

  it("la estimación simétrica trata igual al este y al oeste, y lo declara", () => {
    expect(azimuthLoss(150, 24)).toBeCloseTo(azimuthLoss(210, 24), 10);
  });
});

describe("orientationFactor", () => {
  it("vale 1 en la orientación ideal", () => {
    expect(orientationFactor(optTilt(21), 180, 21)).toBe(1);
  });

  it("nunca sale del rango físico (0, 1]", () => {
    for (let tilt = 0; tilt <= 90; tilt += 5) {
      for (let az = 90; az <= 270; az += 15) {
        const f = orientationFactor(tilt, az, 21);
        expect(f).toBeGreaterThan(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("orientationAdvice — recomendación accionable de estructura", () => {
  it("dentro de ±10° no recomienda estructura", () => {
    expect(orientationAdvice(optTilt(21) + 8, 180, 21).level).toBe("ok");
  });

  it("a 20° avisa y cuantifica", () => {
    expect(orientationAdvice(optTilt(21) + 20, 180, 21).level).toBe("warn");
  });

  it("a más de 25° recomienda corrección", () => {
    expect(orientationAdvice(optTilt(21) + 35, 180, 21).level).toBe("bad");
  });
});

describe("recibo CFE — sustituye suposiciones por el dato del cliente", () => {
  it("un recibo bimestral anualiza multiplicando por 6", () => {
    expect(annualFromBill({ kwh: 1450, amount: 8990, period: "bim" })).toBe(8700);
  });

  it("un recibo mensual anualiza multiplicando por 12", () => {
    expect(annualFromBill({ kwh: 700, amount: 2400, period: "mes" })).toBe(8400);
  });

  it("el precio efectivo sale del importe entre los kWh", () => {
    const t = tariffFromBill({ kwh: 1450, amount: 8990, period: "bim" });
    expect(t).toBeCloseTo(6.2, 2);
  });

  it("no divide por cero con un recibo vacío", () => {
    expect(tariffFromBill({ kwh: 0, amount: 0, period: "bim" })).toBe(0);
  });
});

describe("compute — el excedente no se valora a tarifa minorista", () => {
  const base: Design = {
    lat: 25.6866, lng: -100.3161, yield: 1710, area: 180, tilt: 22, az: 180,
    shade: 0, type: "com", panel: PANEL,
  };

  it("el ahorro es siempre la energía desplazada por la tarifa, nunca la producción entera", () => {
    // Esta es la invariante que impide volver a inflar propuestas: si alguien cambia
    // `save` por `kwh * tariff`, un sistema sobredimensionado la rompe de inmediato.
    for (const area of [20, 60, 180, 400, 2000]) {
      const r = compute({ ...base, area });
      expect(r.save).toBeCloseTo(r.offset * r.tariff, 6);
    }
  });

  it("un sistema sobredimensionado no cobra el excedente a tarifa minorista", () => {
    // Techo enorme sobre un consumo comercial: la producción supera el consumo con holgura.
    const r = compute({ ...base, area: 2000 });
    expect(r.kwh).toBeGreaterThan(r.consumption);
    expect(r.surplus).toBeGreaterThan(0);
    expect(r.save).toBeLessThan(r.kwh * r.tariff);
    expect(r.save).toBeCloseTo(r.consumption * r.tariff, 6);
  });

  it("el ahorro nunca supera el consumo por la tarifa", () => {
    for (const area of [20, 180, 400, 2000]) {
      const r = compute({ ...base, area });
      expect(r.save).toBeLessThanOrEqual(r.consumption * r.tariff + 1e-6);
    }
  });

  it("declara el excedente aparte cuando sobreproduce", () => {
    const r = compute({ ...base, area: 400 });
    // Se EXIGE que el caso sea el que dice el título. Estaba como `if`, así que si un cambio
    // de física dejara de sobreproducir en 400 m², la prueba habría pasado sin afirmar nada
    // sobre el excedente, que es justo lo que vino a proteger.
    expect(r.kwh, "el caso de prueba tiene que sobreproducir").toBeGreaterThan(r.consumption);
    expect(r.surplus).toBeCloseTo(r.kwh - r.consumption, 6);
    expect(r.offset).toBe(r.consumption);
  });

  it("sin excedente, la energía desplazada es toda la producción", () => {
    const r = compute({ ...base, area: 20 });
    expect(r.surplus).toBe(0);
    expect(r.offset).toBeCloseTo(r.kwh, 6);
  });

  it("offset + surplus siempre reconstruye la producción", () => {
    for (const area of [20, 60, 180, 400]) {
      const r = compute({ ...base, area });
      expect(r.offset + r.surplus).toBeCloseTo(r.kwh, 6);
    }
  });

  it("el recibo real manda sobre el promedio del tipo", () => {
    const sinRecibo = compute(base);
    const conRecibo = compute({
      ...base,
      bill: { kwh: 1450, amount: 8990, period: "bim" },
    });
    expect(sinRecibo.fromBill).toBe(false);
    expect(conRecibo.fromBill).toBe(true);
    expect(conRecibo.consumption).toBe(8700);
    expect(conRecibo.tariff).toBeCloseTo(6.2, 2);
  });

  it("un recibo incompleto no se toma como dato", () => {
    const r = compute({ ...base, bill: { kwh: 1450, amount: 0, period: "bim" } });
    expect(r.fromBill).toBe(false);
  });

  it("el pasillo antisombra acota los módulos: nunca más que por área", () => {
    for (const lat of [19.4, 21, 25.7, 32.5]) {
      const r = compute({ ...base, lat, tilt: optTilt(lat) });
      const porArea = Math.floor((base.area * 0.72) / PANEL.area);
      expect(r.n).toBeLessThanOrEqual(porArea);
    }
  });

  it("a mayor latitud caben menos módulos en el mismo techo", () => {
    const sur = compute({ ...base, lat: 19.4, tilt: optTilt(19.4) });
    const norte = compute({ ...base, lat: 32.5, tilt: optTilt(32.5) });
    expect(norte.spacing.gap).toBeGreaterThan(sur.spacing.gap);
    expect(norte.n).toBeLessThanOrEqual(sur.n);
  });

  it("señala cuando supera el límite de generación distribuida exenta", () => {
    const grande = compute({ ...base, type: "ind", area: 200000 });
    // Igual: sin exigir que la muestra rebase el límite, la prueba del límite de 499 kW podía
    // pasar sin probar el rebase.
    expect(grande.kwp, "la muestra debe rebasar el límite").toBeGreaterThan(GD_LIMIT_KW);
    expect(grande.exceedsGD).toBe(true);
    expect(compute(base).exceedsGD).toBe(false);
  });

  it("no produce NaN ni negativos en ningún extremo", () => {
    for (const area of [0, 1, 15, 400]) {
      for (const tilt of [0, 22, 60]) {
        for (const shade of [0, 35]) {
          const r = compute({ ...base, area, tilt, shade });
          for (const [k, v] of Object.entries(r)) {
            if (typeof v !== "number") continue;
            // `payback` es Infinity a PROPÓSITO cuando no cabe ningún módulo: devolver 0
            // hacía leer "retorno inmediato" un techo en el que no hay sistema posible. El
            // barrido sigue exigiendo finitud a todo lo demás, y aquí exige la semántica.
            if (k === "payback" && r.noCabe) {
              expect(v, "sin módulos el retorno es imposible, no cero").toBe(Infinity);
              continue;
            }
            expect(Number.isFinite(v), `${k} finito con área ${area}`).toBe(true);
            expect(v, `${k} no negativo`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe("resolveCity", () => {
  it("reconoce ciudades por subcadena de la dirección", () => {
    expect(resolveCity("Av Vasconcelos 800, Monterrey").name).toBe("Monterrey");
    expect(resolveCity("Calle 60, Mérida, Yucatán").name).toBe("Mérida");
  });

  it("cae al estimado nacional cuando no reconoce la ciudad", () => {
    expect(resolveCity("Rancho sin nombre").name).toBe(DEFAULT_CITY.name);
  });
});

describe("resolución de ciudad: el respaldo genérico tiene que ser visible", () => {
  it("reconoce la ciudad dentro de una dirección completa", () => {
    const m = matchCity("Av. Vasconcelos 800, Monterrey");
    expect(m.matched).toBe(true);
    expect(m.city.name).toBe("Monterrey");
    expect(m.city.lat).toBeCloseTo(25.6866, 3);
  });

  it("acepta el alias cdmx y el nombre completo", () => {
    expect(matchCity("oficina en cdmx").city.name).toBe("Ciudad de México");
    expect(matchCity("Ciudad de México centro").city.name).toBe("Ciudad de México");
  });

  it("no depende de los acentos ni de las mayúsculas", () => {
    // Escribir el nombre bien, con acento, es la forma natural: tiene que coincidir.
    for (const q of ["Ciudad de México", "MÉRIDA", "cancún", "Merida", "CANCUN"]) {
      expect(matchCity(q).matched).toBe(true);
    }
    expect(matchCity("Ciudad de México").city.name).toBe("Ciudad de México");
    expect(citySuggestions("mérida", 6).map((c) => c.name)).toEqual(["Mérida"]);
    expect(citySuggestions("merida", 6).map((c) => c.name)).toEqual(["Mérida"]);
  });

  /** Esta prueba usaba Hermosillo como ejemplo de ciudad sin datos, y advertía que por
   * eso la inclinación óptima saldría 6° corta. La brecha se cerró midiéndola: ahora
   * rinde 2106 kWh/kWp con óptimo de 30°, y el respaldo se prueba con una ciudad que de
   * verdad falta. */
  it("Hermosillo ya está medida, y su óptimo no es el de la fórmula", () => {
    const m = matchCity("Blvd. Solidaridad 300, Hermosillo, Sonora");
    expect(m.matched).toBe(true);
    expect(m.city.site).toBeDefined();
    expect(m.city.site!.tiltOptimo).toBeGreaterThan(Math.round(m.city.lat * 0.87));
  });

  it("marca matched=false cuando la ciudad de verdad no está medida", () => {
    const m = matchCity("Calle Morelos 20, Pénjamo");
    expect(m.matched).toBe(false);
    expect(m.city).toEqual(DEFAULT_CITY);
  });

  /** Con 41 ciudades hay colisiones reales entre nombre de ciudad y de estado. Cada caso
   * de aquí devolvía la ciudad equivocada con la resolución por primera subcadena. */
  it("no confunde el estado con una ciudad de nombre parecido", () => {
    expect(matchCity("Av. Constitución 400, Monterrey, Nuevo León").city.name).toBe("Monterrey");
    expect(matchCity("Xalapa, Veracruz").city.name).toBe("Xalapa");
    expect(matchCity("Ciudad Juárez, Chihuahua").city.name).toBe("Ciudad Juárez");
  });

  it("ignora el nombre de una ciudad usado como nombre de calle", () => {
    expect(matchCity("Calle Monterrey 45, León, Guanajuato").city.name).not.toBe("Monterrey");
  });

  it("un estado sin ciudad no cae en una ciudad de otro estado", () => {
    expect(matchCity("Parque industrial, Nuevo León").city.name).toBe("Monterrey");
  });

  it("resolveCity sigue devolviendo la misma ciudad que matchCity", () => {
    for (const q of ["monterrey", "Cancún", "nada que ver", "puebla"]) {
      expect(resolveCity(q)).toEqual(matchCity(q).city);
    }
  });

  it("no repite ciudades que tienen alias", () => {
    const names = citySuggestions("", 20).map((c) => c.name);
    // La comparación de unicidad sola pasaría con la lista vacía (0 === 0). Lo que impide eso son
    // las dos ciudades exigidas justo debajo, no esta línea.
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Ciudad de México");
    expect(names).toContain("Mérida");
  });

  it("prioriza las que empiezan por el texto sobre las que solo lo contienen", () => {
    const first = citySuggestions("mo", 6)[0];
    expect(first.name).toBe("Monterrey");
  });

  it("filtra por texto y respeta el límite", () => {
    expect(citySuggestions("guadal", 6).map((c) => c.name)).toEqual(["Guadalajara"]);
    expect(citySuggestions("", 3).length).toBe(3);
    expect(citySuggestions("zzzz", 6)).toEqual([]);
  });

  it("todas las sugerencias traen las dos coordenadas y un rendimiento usable", () => {
    for (const c of citySuggestions("", 20)) {
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(c.lng).toBeLessThan(0);          // México está al oeste de Greenwich
      expect(c.yield).toBeGreaterThan(1500);
      // El techo es físico, no empírico: Ciudad Juárez mide 2242 kWh/kWp con loss=0 y
      // dos fuentes concuerdan. Un valor por encima de 2400 sí sería imposible en México.
      expect(c.yield).toBeLessThan(2400);
    }
  });
});

/**
 * Elegir la ciudad de la lista deja una dirección que no la nombra. Reabrir el proyecto leyendo
 * solo la dirección perdía el sitio medido en silencio: el rendimiento caía al promedio nacional
 * y el dimensionado de series se quedaba sin la temperatura mínima del lugar.
 */
describe("la ciudad de un proyecto sobrevive a la reapertura", () => {
  it("usa el campo city cuando la dirección no nombra la ciudad", () => {
    const soloCalle = matchCity("Av. de la Raza 100");
    expect(soloCalle.matched).toBe(false);

    const p = cityOfProject({ address: "Av. de la Raza 100", city: "Ciudad Juárez" });
    expect(p.matched).toBe(true);
    expect(p.city.name).toBe("Ciudad Juárez");
    expect(p.city.site).toBeDefined();
    // y con ello vuelven las temperaturas de las que depende el largo de la serie
    expect(p.city.site!.tMinAbs).toBeLessThan(0);
  });

  it("la dirección sigue funcionando cuando sí nombra la ciudad", () => {
    expect(cityOfProject({ address: "Calle 60, Valladolid" }).city.name).toBe("Valladolid");
  });

  it("un city que no corresponde a ningún sitio medido cede a la dirección", () => {
    const p = cityOfProject({ address: "Calle 60, Valladolid", city: "Pueblo Inventado" });
    expect(p.city.name).toBe("Valladolid");
  });

  it("sin ciudad reconocible en ninguno de los dos, declara que no hubo coincidencia", () => {
    expect(cityOfProject({ address: "Camino viejo", city: "" }).matched).toBe(false);
  });
});
