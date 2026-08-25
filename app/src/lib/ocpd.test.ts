import { describe, it, expect } from "vitest";
import { dimensionarProteccion, dimensionarCircuito, VALORES_COMERCIALES } from "./ocpd";
import { dimensionarConductor, type Circuito } from "./conductor";
import { SITES } from "./site";

const circ = (o: Partial<Circuito> = {}): Circuito => ({
  isc: 13.5, metros: 25, vString: 500, conductores: 6, sobreAzotea: true, ...o,
});

describe("de los valores que caben, se elige el MENOR", () => {
  // Medido: cambiar la búsqueda para que devolviera el mayor valor comercial que cabe dejaba la
  // suite casi entera en verde —solo una prueba lo notaba, y de rebote—. Y esa variante no es
  // inofensiva: un interruptor más grande sigue por debajo de la ampacidad corregida, así que
  // «cumple», pero deja pasar más corriente antes de abrir y protege peor al conductor. La regla
  // de diseño es la más chica que soporta la corriente, y hasta ahora no estaba fijada.
  it("no es cualquiera que quepa: es el primero que alcanza", () => {
    // Se usa `dimensionarCircuito`, que es el camino del producto: sube el calibre cuando la
    // protección no cabe con el conductor mínimo. Con `dimensionarConductor` a secas este
    // escenario da protección nula —y eso ya lo documenta otra prueba de este archivo—.
    const c = circ();
    const { proteccion: p } = dimensionarCircuito(c, SITES["mexicali"]);

    expect(p.valor).not.toBeNull();
    const caben = VALORES_COMERCIALES.filter((v) => v >= p.minimo && v <= p.maximo);
    expect(caben.length, "el escenario debe ofrecer más de una opción válida").toBeGreaterThan(1);
    expect(p.valor, "se eligió uno más grande de lo necesario").toBe(Math.min(...caben));
  });

  it("la regla se cumple en todos los sitios medidos, no solo en uno", () => {
    let comprobados = 0;
    for (const s of Object.values(SITES)) {
      for (const isc of [8, 13.5, 18]) {
        const c = circ({ isc });
        const { proteccion: p } = dimensionarCircuito(c, s);
        if (p.valor === null) continue;
        const caben = VALORES_COMERCIALES.filter((v) => v >= p.minimo && v <= p.maximo);
        expect(p.valor, `${s.nombre} con ${isc} A`).toBe(Math.min(...caben));
        comprobados++;
      }
    }
    // Sin esta línea, un catálogo que no produjera ninguna protección válida pasaría en silencio.
    expect(comprobados, "el barrido no ejercitó ningún caso").toBeGreaterThan(100);
  });
});

describe("la protección queda entre dos límites opuestos", () => {
  it("supera la corriente de diseño y no excede la ampacidad corregida", () => {
    const c = circ();
    const { proteccion: p } = dimensionarCircuito(c, SITES["mexicali"]);
    expect(p.valor).not.toBeNull();
    expect(p.valor!).toBeGreaterThanOrEqual(p.minimo);
    expect(p.valor!).toBeLessThanOrEqual(p.maximo);
  });

  it("el máximo usa la ampacidad CORREGIDA, no la de tabla", () => {
    const c = circ();
    const cond = dimensionarConductor(c, SITES["mexicali"]);
    const p = dimensionarProteccion(c.isc, cond);
    // 8 AWG da 55 A de tabla, pero a 72 °C y con seis conductores mucho menos
    expect(p.maximo).toBeLessThan(cond.calibre!.amp);
    expect(p.maximo).toBeCloseTo(cond.calibre!.amp * cond.fTemp! * cond.fAgrup, 5);
  });

  it("elige el valor comercial más chico que sirve, no el más grande que cabe", () => {
    const c = circ();
    const cond = dimensionarConductor(c, SITES["cdmx"]);
    const p = dimensionarProteccion(c.isc, cond);
    const menores = VALORES_COMERCIALES.filter((v) => v < p.valor! && v >= p.minimo);
    expect(menores).toEqual([]);
  });

  it("solo usa valores de la lista cerrada: nunca una cifra intermedia", () => {
    let evaluados = 0;
    for (const k of ["mexicali", "monterrey", "cdmx", "campeche", "toluca"]) {
      const s = SITES[k]; if (!s) continue;
      const { proteccion: p } = dimensionarCircuito(circ(), s);
      if (p.valor === null) continue;
      expect(VALORES_COMERCIALES).toContain(p.valor);
      evaluados++;
    }
    expect(evaluados).toBeGreaterThan(3);
  });

  it("sin conductor no se inventa una protección", () => {
    const p = dimensionarProteccion(13.5, dimensionarConductor(circ()));
    expect(p.valor).toBeNull();
    expect(p.motivo).toContain("conductor");
  });

  it("cuando no cabe ningún valor, dice que hay que subir el calibre", () => {
    // El escenario anterior (isc 19 con 20 conductores) SÍ admitía una protección, así que la
    // prueba se iba siempre por el `else` y no comprobaba nunca lo que su título anuncia.
    // Éste se encontró midiendo: se barrieron 4 sitios × 11 corrientes × 7 agrupamientos × 4
    // tiradas y 364 combinaciones dejan la protección sin valor. Con 8 A y sólo 2 conductores el
    // conductor mínimo es 14 AWG, aguanta 13 A corregidos, y el siguiente fusible comercial son
    // 15 A: no cabe ninguno.
    const cond = dimensionarConductor(circ({ isc: 8, conductores: 2 }), SITES["mexicali"]);
    const p = dimensionarProteccion(8, cond);

    expect(p.valor, "el escenario debe dejar la protección sin valor").toBeNull();
    expect(p.motivo).toMatch(/sube un calibre/);
    // El motivo tiene que dar las DOS cifras que permiten juzgarlo, no sólo decir que no cabe:
    // cuánto pide el siguiente fusible y cuánto aguanta el conductor ya corregido.
    expect(p.motivo).toMatch(/\d+ A\) excede/);
    expect(p.motivo).toMatch(/corregido \(\d+ A\)/);
    // Y no debe confundirse con el otro caso de valor nulo, que es no tener conductor.
    expect(p.motivo).not.toMatch(/hace falta el conductor/);
  });

  it("la holgura se informa para poder juzgarla", () => {
    const { proteccion: p } = dimensionarCircuito(circ(), SITES["monterrey"]);
    expect(p.holgura).toBeGreaterThan(0);
    expect(p.holgura).toBeLessThan(100);
  });
});


/**
 * El hallazgo: cumplir ampacidad no basta. Estas pruebas fijan el caso medido de Mexicali, que es
 * exactamente el tipo de detalle por el que se rechaza un plano.
 */
describe("el conductor que apenas cumple ampacidad puede no admitir fusible", () => {
  it("en Mexicali hay que subir de 8 a 6 AWG por la protección, no por la corriente", () => {
    const r = dimensionarCircuito(circ(), SITES["mexicali"]);
    expect(r.calibreMinimo).toBe("8 AWG");
    expect(r.subidoPorProteccion).toBe(true);
    expect(r.conductor.calibre!.nombre).toBe("6 AWG");
    expect(r.proteccion.valor).toBe(25);
  });

  it("y el resultado sí respeta los dos límites", () => {
    const r = dimensionarCircuito(circ(), SITES["mexicali"]);
    expect(r.proteccion.valor!).toBeGreaterThanOrEqual(r.proteccion.minimo);
    expect(r.proteccion.valor!).toBeLessThanOrEqual(r.proteccion.maximo);
  });

  it("donde el calibre de ampacidad ya admite fusible, no se sube de más", () => {
    let sinSubir = 0, evaluados = 0;
    for (const k in SITES) {
      const s = SITES[k]; if (s.tMaxAbs === undefined) continue;
      const r = dimensionarCircuito(circ({ isc: 9 }), s);
      if (!r.proteccion.valor) continue;
      if (!r.subidoPorProteccion) sinSubir++;
      evaluados++;
    }
    expect(evaluados).toBeGreaterThan(90);
    expect(sinSubir).toBeGreaterThan(0);
  });
});

/** La interfaz no debe dar dos razones distintas para el mismo calibre. */
it("subir por la protección no se reporta además como caída de tensión", () => {
  const c: Circuito = { isc: 13.5, metros: 20, vString: 400, conductores: 6, sobreAzotea: true };
  const r = dimensionarCircuito(c, SITES["campeche"]);

  // Medido: este escenario SÍ sube el calibre por la protección (y 319 más del barrido). Antes la
  // comprobación vivía dentro de un `if`, así que si dejaba de subirlo la prueba pasaba por su
  // aserción de cola sin comprobar nunca lo que el título anuncia.
  expect(r.subidoPorProteccion, "el escenario debe subir el calibre por la protección").toBe(true);
  expect(r.conductor.manda).toBe(dimensionarConductor(c, SITES["campeche"]).manda);
  expect(r.proteccion.valor).not.toBeNull();
});
