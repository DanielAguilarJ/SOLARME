import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildingInsights, mainSegment, usableArea, clearCache, cacheSize,
  QUALITY_NOTE, type BuildingInsights,
} from "./solarApi";

/**
 * Pruebas del cliente de Solar API con fetch simulado.
 *
 * Nunca llaman al servicio real: cada llamada cuesta dinero y la suite corre en cada build.
 * Lo que se verifica es el contrato — que la falta de cobertura no rompa nada, que la caché
 * evite cargos repetidos y que un error de red no se cachee como si fuera un dato del techo.
 */

/** Respuesta representativa de buildingInsights:findClosest. */
const RESPUESTA = {
  name: "buildings/ChIJ_test",
  center: { latitude: 25.6866, longitude: -100.3161 },
  imageryQuality: "HIGH",
  imageryDate: { year: 2025, month: 6, day: 14 },
  solarPotential: {
    maxArrayPanelsCount: 42,
    maxSunshineHoursPerYear: 1893.5,
    wholeRoofStats: { areaMeters2: 210.4 },
    roofSegmentStats: [
      { pitchDegrees: 18.2, azimuthDegrees: 176.4, stats: { areaMeters2: 96.1 } },
      { pitchDegrees: 18.5, azimuthDegrees: 356.2, stats: { areaMeters2: 88.3 } },
      { pitchDegrees: 4.1, azimuthDegrees: 271.0, stats: { areaMeters2: 26.0 } },
    ],
  },
};

const ok = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => {
  clearCache();
  vi.stubEnv("VITE_GOOGLE_SOLAR_KEY", "clave-de-prueba");
});

describe("buildingInsights — sin clave configurada", () => {
  it("devuelve no-key en vez de intentar la llamada", async () => {
    vi.stubEnv("VITE_GOOGLE_SOLAR_KEY", "");
    const spy = vi.fn();
    const r = await buildingInsights(25.68, -100.31, "BASE", spy as never);
    expect(r.status).toBe("no-key");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("buildingInsights — respuesta correcta", () => {
  it("traduce la respuesta de Google a la forma de SolarMe", async () => {
    const r = await buildingInsights(25.6866, -100.3161, "HIGH", ok(RESPUESTA) as never);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;

    expect(r.data.imageryQuality).toBe("HIGH");
    expect(r.data.roofAreaMeters2).toBeCloseTo(210.4, 1);
    expect(r.data.maxPanelCount).toBe(42);
    expect(r.data.maxSunshineHoursPerYear).toBeCloseTo(1893.5, 1);
    expect(r.data.segments).toHaveLength(3);
    expect(r.data.segments[0].azimuthDegrees).toBeCloseTo(176.4, 1);
  });

  it("pasa latitud, longitud, calidad y clave en la URL", async () => {
    const spy = ok(RESPUESTA);
    await buildingInsights(25.6866, -100.3161, "MEDIUM", spy as never);
    const url = String((spy.mock.calls as unknown[][])[0][0]);
    expect(url).toContain("location.latitude=25.6866");
    expect(url).toContain("location.longitude=-100.3161");
    expect(url).toContain("requiredQuality=MEDIUM");
    expect(url).toContain("key=clave-de-prueba");
  });

  it("no revienta si Google omite campos", async () => {
    const r = await buildingInsights(25, -100, "BASE", ok({ name: "x" }) as never);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.data.roofAreaMeters2).toBe(0);
    expect(r.data.segments).toEqual([]);
    expect(r.data.imageryQuality).toBe("BASE");
  });
});

describe("buildingInsights — cobertura parcial en México", () => {
  const notFound = vi.fn(async () => new Response("", { status: 404 }));

  it("un 404 se traduce a no-coverage, no a error", async () => {
    const r = await buildingInsights(20, -99, "HIGH", notFound as never);
    expect(r.status).toBe("no-coverage");
  });

  it("la falta de cobertura se cachea: no se repite la consulta", async () => {
    const spy = vi.fn(async () => new Response("", { status: 404 }));
    await buildingInsights(20, -99, "HIGH", spy as never);
    await buildingInsights(20, -99, "HIGH", spy as never);
    await buildingInsights(20, -99, "HIGH", spy as never);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("buildingInsights — caché para no pagar dos veces", () => {
  it("la segunda consulta del mismo techo no llama a la API", async () => {
    const spy = ok(RESPUESTA);
    await buildingInsights(25.6866, -100.3161, "HIGH", spy as never);
    await buildingInsights(25.6866, -100.3161, "HIGH", spy as never);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cacheSize()).toBe(1);
  });

  it("un desplazamiento menor a un metro comparte caché", async () => {
    const spy = ok(RESPUESTA);
    await buildingInsights(25.68660, -100.31610, "HIGH", spy as never);
    await buildingInsights(25.686601, -100.316099, "HIGH", spy as never);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("techos distintos no comparten caché", async () => {
    const spy = ok(RESPUESTA);
    await buildingInsights(25.6866, -100.3161, "HIGH", spy as never);
    await buildingInsights(19.4326, -99.1332, "HIGH", spy as never);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(cacheSize()).toBe(2);
  });
});

describe("buildingInsights — errores", () => {
  it("un 500 devuelve error con el código", async () => {
    const fail = vi.fn(async () => new Response("", { status: 500 }));
    const r = await buildingInsights(25, -100, "BASE", fail as never);
    expect(r.status).toBe("error");
    // El `if` original servía de guarda de tipos, pero también dejaba pasar la prueba en silencio
    // si el código dejaba de reportar error. Un `throw` estrecha el tipo Y falla en voz alta.
    if (r.status !== "error") throw new Error(`se esperaba error, llegó "${r.status}"`);
    expect(r.message).toContain("500");
  });

  it("un fallo de red no revienta la interfaz", async () => {
    const boom = vi.fn(async () => { throw new Error("sin conexión"); });
    const r = await buildingInsights(25, -100, "BASE", boom as never);
    expect(r.status).toBe("error");
    if (r.status !== "error") throw new Error(`se esperaba error, llegó "${r.status}"`);
    expect(r.message).toBe("sin conexión");
  });

  it("un error NO se cachea: al reintentar se vuelve a consultar", async () => {
    // Si se cacheara, un corte de red dejaría el techo marcado como fallido para siempre.
    const flaky = vi.fn()
      .mockImplementationOnce(async () => { throw new Error("sin conexión"); })
      .mockImplementationOnce(async () => new Response(JSON.stringify(RESPUESTA), { status: 200 }));
    const primero = await buildingInsights(25, -100, "BASE", flaky as never);
    const segundo = await buildingInsights(25, -100, "BASE", flaky as never);
    expect(primero.status).toBe("error");
    expect(segundo.status).toBe("ok");
    expect(flaky).toHaveBeenCalledTimes(2);
  });
});

describe("mainSegment y usableArea", () => {
  const datos: BuildingInsights = {
    name: "x",
    center: { latitude: 25, longitude: -100 },
    imageryQuality: "HIGH",
    roofAreaMeters2: 210.4,
    maxSunshineHoursPerYear: 1893,
    maxPanelCount: 42,
    segments: [
      { pitchDegrees: 18, azimuthDegrees: 176, areaMeters2: 96.1 },
      { pitchDegrees: 18, azimuthDegrees: 356, areaMeters2: 88.3 },
      { pitchDegrees: 4, azimuthDegrees: 271, areaMeters2: 26 },
    ],
  };

  it("elige el segmento de mayor superficie", () => {
    expect(mainSegment(datos)?.areaMeters2).toBeCloseTo(96.1, 1);
  });

  it("el segmento principal es el orientado al sur en este techo", () => {
    expect(mainSegment(datos)?.azimuthDegrees).toBeCloseTo(176, 0);
  });

  it("un techo sin segmentos devuelve undefined en vez de fallar", () => {
    expect(mainSegment({ ...datos, segments: [] })).toBeUndefined();
  });

  it("la superficie montable descuenta el 28 % por bordes y accesos", () => {
    expect(usableArea(datos)).toBeCloseTo(210.4 * 0.72, 2);
  });
});

describe("QUALITY_NOTE — la calidad de imagen se comunica al instalador", () => {
  it("cubre las tres calidades que devuelve Google", () => {
    expect(Object.keys(QUALITY_NOTE).sort()).toEqual(["BASE", "HIGH", "MEDIUM"]);
  });

  it("BASE advierte de tratar la superficie como estimación", () => {
    expect(QUALITY_NOTE.BASE.toLowerCase()).toContain("estimación");
  });
});

/**
 * La calidad exigida forma parte de la pregunta, así que forma parte de la clave.
 *
 * `requiredQuality` filtra qué imagen se acepta: pedir HIGH puede devolver 404 donde BASE encuentra
 * el edificio. Con la clave sólo en coordenadas, ese «sin cobertura» se cacheaba y la consulta laxa
 * recibía la negativa de la exigente sin volver a preguntar. Se reprodujo antes de arreglarlo.
 */
describe("la caché distingue la calidad exigida", () => {
  /** Un servicio donde HIGH no encuentra imagen y BASE sí. */
  const porCalidad = () => {
    let llamadas = 0;
    const fn = async (u: string) => {
      llamadas++;
      if (String(u).includes("requiredQuality=HIGH")) return { status: 404, ok: false };
      return { status: 200, ok: true, json: async () => ({ name: "edificio" }) };
    };
    return { fn, cuenta: () => llamadas };
  };

  it("un 404 en calidad alta no bloquea la consulta en calidad base", async () => {
    const s = porCalidad();
    const alta = await buildingInsights(20, -99, "HIGH", s.fn as never);
    const base = await buildingInsights(20, -99, "BASE", s.fn as never);
    expect(alta.status).toBe("no-coverage");
    expect(base.status).toBe("ok");
    expect(s.cuenta()).toBe(2); // volvió a preguntar, no reutilizó la negativa
  });

  it("cada calidad ocupa su propia entrada", async () => {
    const s = porCalidad();
    await buildingInsights(20, -99, "HIGH", s.fn as never);
    await buildingInsights(20, -99, "BASE", s.fn as never);
    await buildingInsights(20, -99, "MEDIUM", s.fn as never);
    expect(cacheSize()).toBe(3);
  });

  /* Lo que la caché sí debe evitar sigue evitándolo: repetir la MISMA pregunta cuesta dinero. */
  it("repetir la misma calidad no vuelve a llamar", async () => {
    const s = porCalidad();
    await buildingInsights(20, -99, "BASE", s.fn as never);
    await buildingInsights(20, -99, "BASE", s.fn as never);
    await buildingInsights(20, -99, "BASE", s.fn as never);
    expect(s.cuenta()).toBe(1);
  });
});
