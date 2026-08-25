import { describe, it, expect } from "vitest";
import {
  dimensionarConductor, caidaTension, correccionTemperatura, ajusteAgrupamiento,
  circuitoDe, CALIBRES, FACTOR_CORRIENTE, ADDER_AZOTEA, LIMITE_CAIDA, type Circuito,
} from "./conductor";
import { SITES, type Site } from "./site";
// `dimensionarCircuito` vive en `ocpd`, pero el aviso de «divide el circuito» sale del agotamiento
// de la tabla de agrupamiento de este módulo, así que la prueba pertenece aquí.
import { dimensionarCircuito } from "./ocpd";

/** Sitio sintético para reproducir el ejemplo publicado, cuyo ambiente es 40 °C. */
const dallas = { ...SITES["cdmx"], nombre: "Dallas", tMaxAbs: 40 } as Site;

describe("las tablas normativas se leen por banda, no por interpolación", () => {
  it("los cortes coinciden con la tabla 310.15(B)(1)(1)", () => {
    expect(correccionTemperatura(30)).toBe(1.0);
    expect(correccionTemperatura(31)).toBe(0.96);
    expect(correccionTemperatura(62)).toBe(0.65);  // el ejemplo publicado usa este
    expect(correccionTemperatura(72)).toBe(0.5);
    expect(correccionTemperatura(76)).toBeNull(); // la tabla se agota
  });

  it("el agrupamiento cuenta los dos conductores de cada circuito", () => {
    expect(ajusteAgrupamiento(3)).toBe(1.0);
    expect(ajusteAgrupamiento(4)).toBe(0.8);
    expect(ajusteAgrupamiento(6)).toBe(0.8);
    expect(ajusteAgrupamiento(10)).toBe(0.5);
    expect(ajusteAgrupamiento(50)).toBe(0.35);
  });
});

/**
 * El ejemplo publicado: Dallas, Isc 9.58 A, ambiente 40 °C, tubería sobre azotea, dos circuitos
 * en la misma tubería. Su guía llega a 12 AWG aplicando el 1.25 UNA vez; aquí se aplica dos veces
 * (1.5625) por ser el criterio de tres fuentes contra una, y aun así el resultado coincide.
 */
describe("reproduce el ejemplo publicado", () => {
  const c: Circuito = { isc: 9.58, metros: 15, vString: 450, conductores: 4, sobreAzotea: true };
  const r = dimensionarConductor(c, dallas);

  it("la temperatura de diseño suma el adder de azotea", () => {
    expect(r.tDiseno).toBe(40 + ADDER_AZOTEA);
    expect(r.fTemp).toBe(0.65);
    expect(r.fAgrup).toBe(0.8);
  });

  it("con el criterio conservador sigue bastando 12 AWG", () => {
    // 9.58 × 1.5625 / 0.65 / 0.80 = 28.8 A, y 12 AWG da 30 A de tabla
    expect(r.ampRequerida).toBeCloseTo(28.8, 1);
    expect(r.calibre?.nombre).toBe("12 AWG");
  });

  it("aplicar el 1.25 una sola vez daría un conductor más chico", () => {
    // Se documenta la consecuencia de la discrepancia entre fuentes.
    const conUnFactor = (9.58 * 1.25) / (0.65 * 0.8);
    expect(conUnFactor).toBeLessThan(r.ampRequerida);
    expect(CALIBRES.find((k) => k.amp >= conUnFactor)?.nombre).toBe("14 AWG");
  });
});

describe("el sitio cambia el conductor", () => {
  const base: Circuito = { isc: 13.5, metros: 25, vString: 500, conductores: 6, sobreAzotea: true };

  it("Mexicali exige más cobre que Toluca con el mismo circuito", () => {
    const cal = dimensionarConductor(base, SITES["mexicali"]);
    const fre = dimensionarConductor(base, SITES["toluca"]);
    expect(cal.tDiseno).toBeGreaterThan(fre.tDiseno);
    expect(cal.ampRequerida).toBeGreaterThan(fre.ampRequerida);
    expect(CALIBRES.findIndex((k) => k.nombre === cal.calibre!.nombre))
      .toBeGreaterThan(CALIBRES.findIndex((k) => k.nombre === fre.calibre!.nombre));
  });

  it("bajar la tubería del techo ahorra calibre", () => {
    const arriba = dimensionarConductor(base, SITES["mexicali"]);
    const abajo = dimensionarConductor({ ...base, sobreAzotea: false }, SITES["mexicali"]);
    expect(abajo.tDiseno).toBe(arriba.tDiseno - ADDER_AZOTEA);
    expect(abajo.ampRequerida).toBeLessThan(arriba.ampRequerida);
  });

  it("sin sitio medido no se dimensiona nada", () => {
    const r = dimensionarConductor(base);
    expect(r.calibre).toBeNull();
    expect(r.motivo).toContain("temperatura máxima medida");
  });

  it("ningún sitio de los 93 agota la tabla con tubería sobre azotea", () => {
    let evaluados = 0;
    for (const k in SITES) {
      const s = SITES[k];
      if (s.tMaxAbs === undefined) continue;
      const r = dimensionarConductor(base, s);
      expect(r.fTemp, `${s.nombre} a ${r.tDiseno} °C`).not.toBeNull();
      evaluados++;
    }
    expect(evaluados).toBeGreaterThan(90);
  });
});

describe("la caída de tensión puede mandar sobre la ampacidad", () => {
  it("una tirada larga fuerza un calibre mayor que el de la corriente", () => {
    const corto: Circuito = { isc: 11, metros: 10, vString: 500, conductores: 2, sobreAzotea: false };
    const largo: Circuito = { ...corto, metros: 120 };
    const a = dimensionarConductor(corto, SITES["cdmx"]);
    const b = dimensionarConductor(largo, SITES["cdmx"]);
    expect(a.manda).toBe("ampacidad");
    expect(b.manda).toBe("caida");
    expect(b.calibre!.mm2).toBeGreaterThan(a.calibre!.mm2);
  });

  it("el calibre elegido siempre respeta el límite de caída", () => {
    let evaluados = 0;
    for (const metros of [10, 40, 80, 150]) {
      const r = dimensionarConductor(
        { isc: 12, metros, vString: 480, conductores: 4, sobreAzotea: true }, SITES["monterrey"]);
      if (!r.calibre) continue;
      expect(r.caida).toBeLessThanOrEqual(LIMITE_CAIDA);
      evaluados++;
    }
    expect(evaluados).toBeGreaterThan(2);
  });

  it("la caída va con ida y vuelta: el doble de la longitud", () => {
    const una = caidaTension(10, 50, 5.26, 500);
    const doble = caidaTension(10, 100, 5.26, 500);
    expect(doble).toBeCloseTo(una * 2, 6);
    // y contra el cálculo a mano: 2 × 0.01678 × 50 × 10 / 5.26 = 3.19 V sobre 500 V
    expect(una).toBeCloseTo((2 * 0.01678 * 50 * 10 / 5.26 / 500) * 100, 6);
  });

  it("una tirada absurda se declara imposible en vez de devolver el conductor más grande", () => {
    const r = dimensionarConductor(
      { isc: 15, metros: 3000, vString: 300, conductores: 2, sobreAzotea: false }, SITES["cdmx"]);
    expect(r.calibre).toBeNull();
    expect(r.motivo).toContain("caída");
  });
});

describe("los avisos que ningún sitio real alcanza, probados a propósito", () => {
  // Medido: sobre 102 sitios × los 46 valores de Isc del catálogo × 6 agrupamientos × 4 tiradas ×
  // azotea sí/no —225 216 combinaciones, remedidas tras ampliar el catálogo— NINGUNA dispara
  // estos dos mensajes, y ninguna prueba los
  // mencionaba. Son guardas correctas, pero una guarda que nadie ejercita se rompe en silencio el
  // día que hace falta, así que aquí se fuerzan con datos sintéticos.

  it("el sitio más caliente de México cabe en la tabla, con poco margen", () => {
    // Éste es el dato de producto: la tabla 310.15(B)(1)(1) se agota en 75 °C y el caso real más
    // caliente —Mexicali, con la adición de azotea— llega a 72.3 °C. Si algún sitio pasara de 75,
    // la app no podría dimensionar conductor ahí.
    let peor = 0;
    let dondePeor = "";
    for (const [clave, s] of Object.entries(SITES)) {
      if (s.tMaxAbs === undefined) continue;
      const t = s.tMaxAbs + ADDER_AZOTEA;
      if (t > peor) { peor = t; dondePeor = clave; }
    }
    expect(peor).toBeGreaterThan(70);
    expect(peor, `${dondePeor} se sale de la tabla de corrección`).toBeLessThanOrEqual(75);
    // Y todos deben poder dimensionarse: si uno no puede, el instalador de esa ciudad se queda sin
    // cálculo eléctrico y hay que enterarse aquí, no en la obra.
    for (const [clave, s] of Object.entries(SITES)) {
      const r = dimensionarConductor({ isc: 14, metros: 20, vString: 600, conductores: 6, sobreAzotea: true }, s);
      expect(r.calibre, `${clave} sin calibre`).toBeTruthy();
    }
  });

  it("sobre 75 °C dice qué hacer, no solo que no puede", () => {
    const masCaliente = SITES["mexicali"];
    const inventado = { ...masCaliente, tMaxAbs: 60 };  // 60 + 22 = 82 °C, fuera de la tabla
    const r = dimensionarConductor(
      { isc: 14, metros: 20, vString: 600, conductores: 6, sobreAzotea: true }, inventado);

    expect(r.calibre).toBeNull();
    expect(r.fTemp).toBeNull();
    expect(r.motivo).toContain("excede la tabla de corrección");
    // Lo que hace útil el mensaje es la acción, no el diagnóstico.
    expect(r.motivo).toContain("baja la tubería del techo o ventílala");
    // Y debe decir la temperatura, para que el instalador juzgue cuánto le falta.
    expect(r.motivo).toMatch(/^8[12] °C/);
  });

  it("cuando ningún calibre admite protección, dice que divida el circuito", () => {
    // Escenario encontrado midiendo: 40 A con 41 conductores en la tubería agota la tabla de
    // agrupamiento (que llega a 40) y ningún calibre queda conforme.
    const r = dimensionarCircuito(
      { isc: 40, metros: 5, vString: 600, conductores: 41, sobreAzotea: true }, SITES["cdmx"]);

    expect(r.proteccion.valor).toBeNull();
    expect(r.proteccion.motivo).toContain("ningún calibre de la tabla admite una protección conforme");
    expect(r.proteccion.motivo).toContain("divide el circuito en más strings");
    expect(r.subidoPorProteccion, "no se subió el calibre: se agotó la tabla").toBe(false);
  });
});

describe("el circuito se arma del proyecto", () => {
  it("cada circuito aporta dos conductores", () => {
    expect(circuitoDe({ isc: 11 } as never, 500, 20, 3).conductores).toBe(6);
    expect(circuitoDe({ isc: 11 } as never, 500, 20, 1).conductores).toBe(2);
  });

  it("el factor de corriente es el producto de los dos criterios", () => {
    expect(FACTOR_CORRIENTE).toBeCloseTo(1.25 * 1.25, 10);
  });
});
