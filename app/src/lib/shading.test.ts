import { describe, it, expect } from "vitest";
import {
  sunPosition, declination, enSombra, computeShading, esObstaculoValido,
  ALTURA_TIPICA, CELDA_M, UMBRAL_INSERVIBLE, type Obstacle,
} from "./shading";
import { rowSpacing } from "./spacing";
import { readFileSync } from "node:fs";
import { compute, paybackLabel, CITIES, type Design, type Panel } from "./solar";
import { enrichPanels } from "./price";
import { SITES } from "./site";

const obs = (p: Partial<Obstacle>): Obstacle => ({
  id: "o1", kind: "tinaco", height: 1.6, x: 2, y: 2, width: 1.2, depth: 1.2, ...p,
});

/** La geometría solar se valida contra astronomía que se puede comprobar aparte, no contra
 * lo que produzca mi propio código. */
describe("posición del sol contra valores conocidos", () => {
  it("la declinación es −23.45° en el solsticio de invierno y +23.45° en el de verano", () => {
    expect(declination(355)).toBeCloseTo(-23.45, 1);
    expect(declination(172)).toBeCloseTo(23.44, 1);
  });

  it("la declinación es casi cero en los equinoccios", () => {
    expect(Math.abs(declination(81))).toBeLessThan(1);
    expect(Math.abs(declination(264))).toBeLessThan(2);
  });

  /** En el equinoccio la elevación al mediodía vale 90 − latitud, exactamente. */
  it("al mediodía del equinoccio la elevación es 90 menos la latitud", () => {
    for (const lat of [19.43, 25.69, 32.51]) {
      const s = sunPosition(lat, 81, 12);
      expect(s.elevation).toBeCloseTo(90 - lat, 0);
    }
  });

  it("al mediodía del solsticio de invierno la elevación es 90 − lat − 23.45", () => {
    for (const lat of [19.43, 25.69, 32.51]) {
      const s = sunPosition(lat, 355, 12);
      expect(s.elevation).toBeCloseTo(90 - lat - 23.45, 0);
    }
  });

  it("al mediodía del solsticio de verano la elevación es 90 − |lat − 23.45|", () => {
    for (const lat of [19.43, 25.69, 32.51]) {
      const s = sunPosition(lat, 172, 12);
      expect(s.elevation).toBeCloseTo(90 - Math.abs(lat - 23.45), 0);
    }
  });

  /** Este es el caso que un arcoseno resuelve mal. Mérida está a 20.97°, por debajo del
   * trópico de Cáncer, así que en verano el sol del mediodía queda al NORTE del cenit y su
   * azimut debe ser 180° y no 0°. */
  it("en Mérida el sol del solsticio de verano pasa al norte del cenit", () => {
    const s = sunPosition(20.97, 172, 12);
    expect(s.elevation).toBeGreaterThan(85);
    expect(Math.abs(s.azimuth)).toBeGreaterThan(170);
  });

  it("en Tijuana, arriba del trópico, el sol del mediodía siempre queda al sur", () => {
    for (const dia of [15, 105, 172, 258, 355]) {
      const s = sunPosition(32.51, dia, 12);
      expect(Math.abs(s.azimuth), `día ${dia}`).toBeLessThan(10);
    }
  });

  it("el sol sale por el oriente y se pone por el poniente", () => {
    const manana = sunPosition(19.43, 81, 8);
    const tarde = sunPosition(19.43, 81, 16);
    expect(manana.azimuth).toBeLessThan(0);
    expect(tarde.azimuth).toBeGreaterThan(0);
  });

  it("en el equinoccio sale casi exactamente por el este", () => {
    const s = sunPosition(19.43, 81, 6);
    expect(Math.abs(Math.abs(s.azimuth) - 90)).toBeLessThan(3);
    expect(s.azimuth).toBeLessThan(0);
  });

  it("de noche la elevación es negativa", () => {
    expect(sunPosition(19.43, 355, 2).elevation).toBeLessThan(0);
    expect(sunPosition(19.43, 355, 22).elevation).toBeLessThan(0);
  });

  it("la mañana y la tarde son simétricas respecto al mediodía solar", () => {
    const a = sunPosition(25.69, 200, 10);
    const b = sunPosition(25.69, 200, 14);
    expect(a.elevation).toBeCloseTo(b.elevation, 6);
    expect(a.azimuth).toBeCloseTo(-b.azimuth, 6);
  });

  /** Consistencia interna: el módulo de espaciado calcula la elevación invernal con otra
   * fórmula. Si las dos no coinciden, una de las dos está mal. */
  it("coincide con la elevación invernal que usa el módulo de espaciado", () => {
    for (const clave of ["cdmx", "monterrey", "tijuana", "merida"]) {
      const s = SITES[clave];
      const espaciado = rowSpacing({ lat: s.lat, tilt: s.tiltOptimo, panelLength: 2 });
      const sol = sunPosition(s.lat, 355, 12);
      expect(sol.elevation, s.nombre).toBeCloseTo(espaciado.sunElevation, 0);
    }
  });
});

describe("sombra de un obstáculo", () => {
  const solSur = { elevation: 45, azimuth: 0 };

  it("con el sol al sur la sombra se proyecta al norte", () => {
    const t = obs({ x: 2, y: 2, height: 2 });
    // a 45° la sombra mide 2 m: una celda a 1 m al norte cae dentro
    expect(enSombra({ x: 2, y: 3 }, t, solSur)).toBe(true);
    // al sur del obstáculo no hay sombra
    expect(enSombra({ x: 2, y: 1 }, t, solSur)).toBe(false);
  });

  it("la sombra se acaba donde dice la trigonometría", () => {
    const t = obs({ x: 2, y: 2, height: 2 });
    expect(enSombra({ x: 2, y: 3.9 }, t, solSur)).toBe(true);
    expect(enSombra({ x: 2, y: 4.5 }, t, solSur)).toBe(false);
  });

  it("un obstáculo más alto tapa más lejos", () => {
    const bajo = obs({ height: 1 });
    const alto = obs({ height: 3 });
    const lejos = { x: 2, y: 4.5 };
    expect(enSombra(lejos, bajo, solSur)).toBe(false);
    expect(enSombra(lejos, alto, solSur)).toBe(true);
  });

  it("con el sol más bajo la sombra se alarga", () => {
    const t = obs({ height: 2 });
    const lejos = { x: 2, y: 5 };
    expect(enSombra(lejos, t, { elevation: 45, azimuth: 0 })).toBe(false);
    expect(enSombra(lejos, t, { elevation: 20, azimuth: 0 })).toBe(true);
  });

  it("con el sol al oriente la sombra va al poniente", () => {
    const t = obs({ x: 3, y: 3, height: 2 });
    const sol = { elevation: 45, azimuth: -90 };
    expect(enSombra({ x: 2, y: 3 }, t, sol)).toBe(true);
    expect(enSombra({ x: 4, y: 3 }, t, sol)).toBe(false);
  });

  it("sin sol útil todo cuenta como sombra, no como generación perdida por error", () => {
    expect(enSombra({ x: 50, y: 50 }, obs({}), { elevation: 0.5, azimuth: 0 })).toBe(true);
  });

  it("la sombra no se extiende infinitamente con el sol rasante", () => {
    const t = obs({ x: 1, y: 1, height: 2 });
    expect(enSombra({ x: 1, y: 200 }, t, { elevation: 2, azimuth: 0 })).toBe(false);
  });
});

describe("pérdida por sombra en un techo", () => {
  const AREA = 36; // 6 × 6 m

  it("sin obstáculos no hay pérdida y toda el área sirve", () => {
    const r = computeShading(AREA, 19.43, [], SITES.cdmx);
    expect(r.loss).toBe(0);
    expect(r.areaLibre).toBe(1);
    expect(r.areaUtil).toBe(AREA);
  });

  /** Orden MEDIDO de dónde conviene menos poner un tinaco, no una regla de dedo. La primera
   * versión de esta prueba afirmaba que la orilla sur cuesta más de 3× la norte; medido son
   * 1.93× en CDMX. La cifra 3 la inventé yo. */
  const perdida = (x: number, y: number, lat = 19.43, site = SITES.cdmx) =>
    computeShading(AREA, lat, [obs({ x, y, height: 1.6 })], site).loss;

  it("la orilla norte es el mejor lugar y el centro el peor", () => {
    const norte = perdida(3, 5.7);
    const oriente = perdida(0.3, 3);
    const sur = perdida(3, 0.3);
    const centro = perdida(3, 3);
    expect(norte).toBeLessThan(oriente);
    expect(oriente).toBeLessThan(sur);
    expect(sur).toBeLessThanOrEqual(centro);
  });

  /** El hallazgo que no es obvio: a la latitud de México el sol del mediodía invernal está
   * alto (47° en CDMX), así que la sombra de mediodía es corta y buena parte de la pérdida
   * viene de las sombras largas de la mañana y la tarde, que van de lado. Por eso la ventaja
   * de la orilla norte es real pero mucho menor que a latitudes altas. */
  it("la ventaja de la orilla norte sobre la sur es menor a 2.5×, no un orden de magnitud", () => {
    const razon = perdida(3, 0.3) / perdida(3, 5.7);
    expect(razon).toBeGreaterThan(1.5);
    expect(razon).toBeLessThan(2.5);
  });

  it("oriente y poniente cuestan lo mismo: el camino del sol es simétrico", () => {
    expect(perdida(0.3, 3)).toBeCloseTo(perdida(5.7, 3), 6);
  });

  it("la asimetría norte–sur crece con la latitud, porque el sol invernal baja", () => {
    const cdmx = perdida(3, 0.3, 19.43, SITES.cdmx) / perdida(3, 5.7, 19.43, SITES.cdmx);
    const tij = perdida(3, 0.3, 32.51, SITES.tijuana) / perdida(3, 5.7, 32.51, SITES.tijuana);
    expect(tij).toBeGreaterThan(cdmx);
  });

  it("un obstáculo más alto cuesta más energía", () => {
    const bajo = computeShading(AREA, 19.43, [obs({ height: 0.5 })], SITES.cdmx);
    const alto = computeShading(AREA, 19.43, [obs({ height: 3 })], SITES.cdmx);
    expect(alto.loss).toBeGreaterThan(bajo.loss);
  });

  it("dos obstáculos cuestan al menos tanto como el peor de los dos", () => {
    const a = obs({ id: "a", x: 1.5, y: 1.5 });
    const b = obs({ id: "b", x: 4.5, y: 1.5 });
    const solo = computeShading(AREA, 19.43, [a], SITES.cdmx);
    const dos = computeShading(AREA, 19.43, [a, b], SITES.cdmx);
    expect(dos.loss).toBeGreaterThanOrEqual(solo.loss);
  });

  it("no cuenta dos veces la celda tapada por dos obstáculos a la vez", () => {
    const a = obs({ id: "a", x: 3, y: 1 });
    const b = obs({ id: "b", x: 3, y: 1.1 });
    const r = computeShading(AREA, 19.43, [a, b], SITES.cdmx);
    expect(r.loss).toBeLessThanOrEqual(1);
  });

  it("la pérdida nunca sale del rango 0 a 1", () => {
    const enorme = obs({ height: 25, width: 40, depth: 40, x: 3, y: 0.2 });
    const r = computeShading(AREA, 19.43, [enorme], SITES.cdmx);
    expect(r.loss).toBeGreaterThanOrEqual(0);
    expect(r.loss).toBeLessThanOrEqual(1);
  });

  it("el área útil se descuenta y nunca supera la existente", () => {
    const r = computeShading(AREA, 19.43, [obs({ height: 3, x: 3, y: 0.5 })], SITES.cdmx);
    expect(r.areaUtil).toBeLessThan(AREA);
    expect(r.areaUtil).toBeGreaterThanOrEqual(0);
  });

  /** El umbral no es cosmético: un módulo parcialmente sombreado arrastra a su cadena, así
   * que una celda sombreada buena parte del tiempo no debe contarse como montable. */
  it("una celda sombreada más del umbral deja de contar como superficie montable", () => {
    const r = computeShading(AREA, 19.43, [obs({ height: 4, x: 3, y: 0.3 })], SITES.cdmx);
    const inservibles = r.sombreadas.filter((s) => s.fraccion > UMBRAL_INSERVIBLE).length;
    expect(inservibles).toBeGreaterThan(0);
    const total = r.libres.length + r.sombreadas.length;
    expect(r.areaUtil).toBeCloseTo(((total - inservibles) / total) * AREA, 5);
  });

  it("un techo de área cero no rompe nada", () => {
    const r = computeShading(0, 19.43, [obs({})], SITES.cdmx);
    expect(r.loss).toBe(0);
    expect(r.areaUtil).toBe(0);
  });

  /** La misma sombra pesa distinto según cuándo produce el sitio: en Tijuana diciembre es
   * el mínimo del año y en CDMX es un mes fuerte. */
  it("la pérdida se pondera con el perfil mensual medido de cada ciudad", () => {
    const t = [obs({ height: 2, x: 3, y: 0.5 })];
    const conCdmx = computeShading(AREA, 25, t, SITES.cdmx);
    const conTijuana = computeShading(AREA, 25, t, SITES.tijuana);
    expect(conCdmx.loss).not.toBeCloseTo(conTijuana.loss, 4);
  });

  it("a mayor latitud el sol invernal está más bajo y la misma sombra cuesta más", () => {
    const t = [obs({ height: 2, x: 3, y: 1 })];
    const sur = computeShading(AREA, 17, t);
    const norte = computeShading(AREA, 32.5, t);
    expect(norte.loss).toBeGreaterThan(sur.loss);
  });

  it("las celdas cubren el techo con el paso declarado", () => {
    const r = computeShading(AREA, 19.43, [obs({})], SITES.cdmx);
    const total = r.libres.length + r.sombreadas.length;
    expect(r.lado).toBeCloseTo(6, 6);
    expect(total).toBe(Math.floor(6 / CELDA_M) ** 2);
  });
});

describe("validación de obstáculos capturados", () => {
  it("acepta un tinaco típico dentro del techo", () => {
    expect(esObstaculoValido(obs({}), 36)).toBe(true);
  });

  it("rechaza una altura imposible o negativa", () => {
    expect(esObstaculoValido(obs({ height: 0 }), 36)).toBe(false);
    expect(esObstaculoValido(obs({ height: -2 }), 36)).toBe(false);
    expect(esObstaculoValido(obs({ height: 500 }), 36)).toBe(false);
  });

  it("rechaza una posición fuera del techo", () => {
    expect(esObstaculoValido(obs({ x: -1 }), 36)).toBe(false);
    expect(esObstaculoValido(obs({ y: 99 }), 36)).toBe(false);
  });

  it("rechaza una huella nula", () => {
    expect(esObstaculoValido(obs({ width: 0 }), 36)).toBe(false);
    expect(esObstaculoValido(obs({ depth: -1 }), 36)).toBe(false);
  });

  it("las medidas típicas son alturas de azotea reales, no de relleno", () => {
    expect(ALTURA_TIPICA.tinaco.height).toBeGreaterThan(1);
    expect(ALTURA_TIPICA.tinaco.height).toBeLessThan(2.5);
    expect(ALTURA_TIPICA.pretil.height).toBeLessThan(ALTURA_TIPICA.arbol.height);
    expect(ALTURA_TIPICA.edificio.height).toBeGreaterThan(ALTURA_TIPICA.tinaco.height);
  });
});


const panels: Panel[] = enrichPanels(
  JSON.parse(readFileSync(new URL("../data/panels.json", import.meta.url), "utf8")).panels,
) as Panel[];

/** La integración es lo que importa: si los obstáculos no llegan al diseño, medirlos no
 * sirve de nada. Este es el mismo defecto de camino inalcanzable que tuvieron las
 * cotizaciones por marca y la tarifa del resto del sistema. */
describe("los obstáculos llegan al diseño, no solo a un porcentaje", () => {
  const base: Design = {
    site: CITIES.cdmx.site, lat: CITIES.cdmx.lat, lng: CITIES.cdmx.lng,
    yield: CITIES.cdmx.yield, area: 40, tilt: CITIES.cdmx.site!.tiltOptimo,
    az: 180, shade: 0, type: "res", panel: panels[0],
  };

  it("sin obstáculos el resultado no trae sombra calculada y usa toda el área", () => {
    const r = compute(base);
    expect(r.shading).toBeUndefined();
    expect(r.areaMontable).toBe(40);
  });

  it("un obstáculo grande reduce los módulos que caben, no solo la energía", () => {
    const limpio = compute(base);
    const conArbol = compute({
      ...base,
      obstacles: [{ id: "a", kind: "arbol", height: 6, x: 3, y: 2, width: 4, depth: 4 }],
    });
    expect(conArbol.areaMontable).toBeLessThan(limpio.areaMontable);
    expect(conArbol.n).toBeLessThan(limpio.n);
    expect(conArbol.kwh).toBeLessThan(limpio.kwh);
  });

  it("menos módulos por sombra también bajan la inversión: no se pagan paneles que no caben", () => {
    const limpio = compute(base);
    const conArbol = compute({
      ...base,
      obstacles: [{ id: "a", kind: "arbol", height: 6, x: 3, y: 2, width: 4, depth: 4 }],
    });
    expect(conArbol.costs.total).toBeLessThan(limpio.costs.total);
  });

  it("los obstáculos medidos mandan sobre el deslizador, sin descontar dos veces", () => {
    const o = [{ id: "t", kind: "tinaco" as const, height: 1.6, x: 3, y: 1, width: 1.2, depth: 1.2 }];
    const conDeslizador = compute({ ...base, shade: 30, obstacles: o });
    const sinDeslizador = compute({ ...base, shade: 0, obstacles: o });
    expect(conDeslizador.kwh).toBeCloseTo(sinDeslizador.kwh, 6);
  });

  it("un estorbo baja la producción por módulo, en la proporción exacta de su sombra", () => {
    // Medido: descartar la sombra calculada y quedarse con el deslizador dejaba la suite casi
    // entera en verde. Solo una prueba lo notaba, y comprobaba otra cosa —que el deslizador no se
    // sumara además de los estorbos—. Nada exigía que la sombra ENTRARA en la energía.
    //
    // Se compara por módulo a propósito: un estorbo cambia dos cosas a la vez, cuántos módulos
    // caben y cuánto produce cada uno. Dividir entre el conteo aísla lo segundo, que es lo que
    // esta prueba vigila. Con el deslizador en cero, la única diferencia por módulo es la sombra.
    const o = [{ id: "t", kind: "tinaco" as const, height: 1.8, x: 3, y: 3, width: 1.2, depth: 1.2 }];
    const sin = compute({ ...base, shade: 0 });
    const con = compute({ ...base, shade: 0, obstacles: o });

    expect(con.shading, "el escenario debe producir sombra calculada").toBeDefined();
    expect(con.shading!.loss, "un tinaco de 1.8 m tiene que dar sombra").toBeGreaterThan(0);
    expect(sin.placement.count).toBeGreaterThan(0);
    expect(con.placement.count).toBeGreaterThan(0);

    const porModuloSin = sin.kwh / sin.placement.count;
    const porModuloCon = con.kwh / con.placement.count;
    expect(porModuloCon).toBeLessThan(porModuloSin);
    // La proporción es exactamente el factor de sombra: ni de más ni de menos.
    expect(porModuloCon / porModuloSin).toBeCloseTo(1 - con.shading!.loss, 6);
  });

  it("sin obstáculos el deslizador sigue funcionando como estimación", () => {
    const a = compute({ ...base, shade: 0 });
    const b = compute({ ...base, shade: 20 });
    expect(b.kwh).toBeLessThan(a.kwh);
    expect(b.kwh / a.kwh).toBeCloseTo(0.8, 2);
  });

  it("el mismo tinaco en la orilla norte deja más módulos que en el centro", () => {
    const t = (x: number, y: number) => compute({
      ...base,
      obstacles: [{ id: "t", kind: "tinaco", height: 1.8, x, y, width: 1.2, depth: 1.2 }],
    });
    const lado = Math.sqrt(40);
    expect(t(lado / 2, lado - 0.4).kwh).toBeGreaterThan(t(lado / 2, lado / 2).kwh);
  });

  it("un techo tapado dice \"no cabe\", nunca un retorno de cero años", () => {
    const r = compute({
      ...base,
      obstacles: [{ id: "e", kind: "edificio", height: 20, x: 3, y: 0.5, width: 30, depth: 30 }],
    });
    expect(r.noCabe).toBe(true);
    expect(paybackLabel(r)).toBe("no cabe");
    expect(paybackLabel(r)).not.toContain("0.0");
  });

  it("un techo que sí funciona muestra los años, no la leyenda", () => {
    expect(paybackLabel(compute(base))).toMatch(/^\d+\.\d años$/);
  });

  it("un obstáculo que tapa casi todo no produce números absurdos", () => {
    const r = compute({
      ...base,
      obstacles: [{ id: "e", kind: "edificio", height: 20, x: 3, y: 0.5, width: 30, depth: 30 }],
    });
    expect(r.n).toBeGreaterThanOrEqual(0);
    expect(r.kwh).toBeGreaterThanOrEqual(0);
    // Medido: con este vecino de 20 m a 3 m del borde NO cabe ningún módulo. Antes esto era un
    // `if (r.n === 0) … else …`, y la rama `else` dejaba pasar la prueba comprobando otra cosa si
    // el vecino resultaba no tapar todo. Se exige el caso que el título describe.
    expect(r.n, "el vecino debe tapar el techo entero").toBe(0);
    expect(r.noCabe).toBe(true);
    // Y sin módulos el retorno es imposible, no inmediato: cero módulos con payback finito sería
    // prometerle al cliente que se paga solo.
    expect(r.payback).toBe(Infinity);
  });
});
