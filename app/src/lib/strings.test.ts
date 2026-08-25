import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  VENTANAS, DELTA_T_CELDA, ALPHA_IMP_REL, vocFrio, vmpCaliente,
  rangoString, repartirStrings, ventanaPara, potenciaInversor, DC_AC_RECOMENDADO,
} from "./strings";
import { SITES } from "./site";
import { enrichPanels } from "./price";
import type { Panel } from "./solar";

const panels: Panel[] = enrichPanels(
  JSON.parse(readFileSync(new URL("../data/panels.json", import.meta.url), "utf8")).panels,
) as Panel[];

const RES = VENTANAS[0];
const COM = VENTANAS[1];
const IND = VENTANAS[2];

/** Un módulo real del catálogo, no inventado: CSI CS3W-400P. */
const CSI = panels.find((p) => p.model === "CS3W-400P")!;
/** El CdTe de First Solar, que tiene 226 V de Voc y rompe cualquier supuesto de 40 V. */
const CDTE = panels.reduce((a, b) => (b.voc > a.voc ? b : a));

describe("el catálogo trae los datos eléctricos", () => {
  it("los 140 módulos tienen Voc, Vmp y coeficiente de temperatura", () => {
    for (const p of panels) {
      expect(p.voc, p.model).toBeGreaterThan(5);
      expect(p.vmp, p.model).toBeGreaterThan(0);
      expect(p.betaVoc, p.model).toBeLessThan(0);
    }
  });

  it("Vmp siempre por debajo de Voc, e Imp por debajo de Isc", () => {
    for (const p of panels) {
      expect(p.vmp, p.model).toBeLessThan(p.voc);
      expect(p.imp, p.model).toBeLessThan(p.isc);
    }
  });

  /** El invariante que valida el registro eléctrico completo contra la potencia de placa. */
  it("Vmp × Imp reproduce la potencia de placa dentro del 10 %", () => {
    for (const p of panels) {
      const err = Math.abs(p.vmp * p.imp - p.w) / p.w;
      expect(err, `${p.model}: ${(p.vmp * p.imp).toFixed(0)} W contra ${p.w} W`).toBeLessThan(0.1);
    }
  });

  it("el coeficiente relativo de Voc cae en el rango del silicio y el CdTe", () => {
    for (const p of panels) {
      const rel = (p.betaVoc / p.voc) * 100;
      expect(rel, p.model).toBeGreaterThan(-0.45);
      expect(rel, p.model).toBeLessThan(-0.15);
    }
  });
});

describe("los sitios traen sus temperaturas extremas", () => {
  it("todo sitio del catálogo tiene mínima absoluta, percentil y máxima", () => {
    const todos = Object.values(SITES);
    // El título habla de TODO el catálogo, así que la prueba tiene que comprobar que hay catálogo.
    // El título llevaba un conteo escrito a mano —«los 93 sitios»— y envejeció al ampliarlo: un
    // título con cifra es una afirmación que nadie recuerda actualizar. Sin esta línea, con
    // el catálogo vacío el bucle no recorre nada y la prueba pasa afirmando algo sobre cero sitios.
    // La contaba un ancla que vive en otro archivo: dependía del azar.
    expect(todos.length).toBeGreaterThanOrEqual(90);
    for (const s of todos) {
      expect(s.tMinAbs, s.nombre).toBeLessThan(s.tMaxAbs);
      expect(s.diasSerie, s.nombre).toBeGreaterThan(3000);
    }
  });

  /** El extremo absoluto es SIEMPRE igual o más frío que el percentil de la norma. Si se
   * invirtiera, el cálculo sería menos conservador que la norma sin avisar. */
  it("la mínima absoluta nunca es mayor que el percentil de la norma", () => {
    for (const s of Object.values(SITES)) {
      expect(s.tMinAbs, s.nombre).toBeLessThanOrEqual(s.tMinAshrae);
    }
  });

  it("México tiene sitios bajo cero y sitios que pasan de 45 grados", () => {
    const todos = Object.values(SITES);
    expect(Math.min(...todos.map((s) => s.tMinAbs))).toBeLessThan(-5);
    expect(Math.max(...todos.map((s) => s.tMaxAbs))).toBeGreaterThan(45);
  });
});

describe("voltaje contra temperatura", () => {
  it("el frío SUBE el voltaje de circuito abierto", () => {
    expect(vocFrio(CSI, -10)).toBeGreaterThan(CSI.voc);
    expect(vocFrio(CSI, 25)).toBeCloseTo(CSI.voc, 6);
    expect(vocFrio(CSI, 40)).toBeLessThan(CSI.voc);
  });

  /** Anclaje aritmético contra el coeficiente publicado: Voc 47.2 V, β −0.1315 V/°C.
   * A −10 °C son 35 grados por debajo de condiciones estándar. */
  it("reproduce la aritmética del coeficiente publicado", () => {
    expect(vocFrio(CSI, -10)).toBeCloseTo(47.2 + -0.1315 * -35, 4);
    expect(vocFrio(CSI, -10)).toBeCloseTo(51.8, 1);
  });

  it("el calor BAJA el voltaje del punto máximo", () => {
    expect(vmpCaliente(CSI, 43.1)).toBeLessThan(CSI.vmp);
    expect(vmpCaliente(CSI, 25 - DELTA_T_CELDA)).toBeCloseTo(CSI.vmp, 6);
  });

  it("la celda se calcula más caliente que el aire", () => {
    expect(DELTA_T_CELDA).toBeGreaterThan(20);
    expect(DELTA_T_CELDA).toBeLessThan(40);
    expect(vmpCaliente(CSI, 30, 0)).toBeGreaterThan(vmpCaliente(CSI, 30, 31));
  });

  it("el coeficiente de Vmp se deriva del de potencia, no se inventa", () => {
    const betaRel = (CSI.temp - ALPHA_IMP_REL) / 100;
    expect(betaRel).toBeLessThan(-0.003);
    expect(betaRel).toBeGreaterThan(-0.005);
  });
});

/**
 * El hallazgo que justifica todo el módulo: el mismo módulo y el mismo inversor admiten
 * DISTINTO número de módulos por serie según el frío del sitio. Un instalador que aplique una
 * regla genérica de doce en Ciudad Juárez llega a 621.6 V en una mañana de −10 °C con un
 * inversor de 600 V.
 */
describe("el sitio cambia el largo del string", () => {
  it("Ciudad Juárez admite menos módulos por serie que Valladolid", () => {
    const juarez = rangoString(CSI, SITES["ciudad juarez"], RES);
    const valladolid = rangoString(CSI, SITES.valladolid, RES);
    expect(juarez.max).toBeLessThan(valladolid.max);
    expect(juarez.max).toBe(11);
    expect(valladolid.max).toBe(12);
  });

  it("doce módulos en Ciudad Juárez rebasarían el inversor de 600 V", () => {
    const r = rangoString(CSI, SITES["ciudad juarez"], RES);
    expect(12 * r.vocFrio).toBeGreaterThan(RES.vMax);
    expect(r.max * r.vocFrio).toBeLessThanOrEqual(RES.vMax);
  });

  /** Se usa el extremo ABSOLUTO y no el percentil de la norma, y esa decisión tiene que estar
   * fijada: cambiarla pasaba las 28 pruebas sin que nada se quejara. Es la misma lógica que
   * eligió la fuente menor cuando PVGIS y NASA discrepan — el modo de falla es destruir un
   * inversor, así que se toma el peor caso medido y no el codificado. */
  it("el cálculo usa la mínima ABSOLUTA, no el percentil de la norma", () => {
    let masExigentes = 0;
    for (const s of Object.values(SITES)) {
      const r = rangoString(CSI, s, RES);
      const conNorma = Math.ceil(vocFrio(CSI, s.tMinAshrae) * 10) / 10;
      // el voltaje que reporta tiene que ser el del extremo absoluto
      expect(r.vocFrio, s.nombre).toBeCloseTo(
        Math.ceil(vocFrio(CSI, s.tMinAbs) * 10) / 10, 6,
      );
      expect(r.vocFrio, s.nombre).toBeGreaterThanOrEqual(conNorma);
      if (r.vocFrio > conNorma) masExigentes++;
    }
    // y en la mayoría de los sitios el extremo SÍ es más exigente que la norma: si fueran
    // iguales en todos, la distinción no significaría nada
    expect(masExigentes).toBeGreaterThan(Object.keys(SITES).length * 0.7);
  });

  it("una ventana más alta admite series más largas", () => {
    const res = rangoString(CSI, SITES.cdmx, RES);
    const com = rangoString(CSI, SITES.cdmx, COM);
    expect(com.max).toBeGreaterThan(res.max);
  });

  it("el CdTe de 226 V apenas cabe en una ventana residencial", () => {
    const r = rangoString(CDTE, SITES.cdmx, RES);
    expect(r.max).toBeLessThanOrEqual(2);
  });
});

/** El invariante de seguridad: pase lo que pase, el string no rebasa el inversor. */
describe("nunca se propone un arreglo que rebase el inversor", () => {
  it("en todo el catálogo: cada sitio medido, cada módulo y las tres ventanas", () => {
    let combinaciones = 0;
    for (const s of Object.values(SITES)) {
      for (const p of panels) {
        for (const v of VENTANAS) {
          const r = rangoString(p, s, v);
          combinaciones++;
          if (r.max >= 1) {
            expect(r.max * r.vocFrio, `${p.model} en ${s.nombre} con ${v.etiqueta}`)
              .toBeLessThanOrEqual(v.vMax);
          }
          // Medido: `max >= 1` es cierto en las 42 840 combinaciones, así que el `if` de arriba
          // nunca llegó a saltarse nada. Exigirlo convierte un guardián inerte en una afirmación
          // que sí dice algo del catálogo: todo módulo entra al menos una vez en cada ventana y en
          // cada sitio. El día que entre un módulo de Voc alto, esto avisa en vez de callar.
          expect(r.max, `${p.model} en ${s.nombre} con ${v.etiqueta} no admite ni un módulo`)
            .toBeGreaterThanOrEqual(1);
        }
      }
    }
    // El comentario anterior decía que esta línea evitaba el catálogo vacío. Era falso: es un
    // producto de tres longitudes, así que basta que UNA esté vacía para que dé 0 === 0 y pase.
    // Con suelo en las tres, el barrido tiene que haber ocurrido de verdad.
    expect(Object.keys(SITES).length).toBeGreaterThanOrEqual(90);
    expect(panels.length).toBeGreaterThan(100);
    expect(VENTANAS.length).toBe(3);
    expect(combinaciones).toBe(Object.keys(SITES).length * panels.length * VENTANAS.length);
  });
});

describe("reparto en series parejas", () => {
  it("las series y los sobrantes suman los módulos que caben", () => {
    for (const n of [1, 7, 10, 11, 12, 24, 33, 64, 90]) {
      const a = repartirStrings(n, CSI, SITES.cdmx, RES);
      expect(a.porString * a.strings + a.sobrantes, `n=${n}`).toBe(n);
      expect(a.conectados, `n=${n}`).toBe(a.porString * a.strings);
    }
  });

  it("el largo elegido cae dentro del rango admisible", () => {
    const a = repartirStrings(24, CSI, SITES.cdmx, RES);
    expect(a.porString).toBeLessThanOrEqual(a.rango.max);
    expect(a.porString).toBeGreaterThanOrEqual(a.rango.min);
  });

  it("prefiere no dejar sobrantes cuando puede repartir exacto", () => {
    const a = repartirStrings(22, CSI, SITES.cdmx, RES);
    expect(a.sobrantes).toBe(0);
    expect(a.porString * a.strings).toBe(22);
  });

  it("el voltaje del arreglo propuesto deja margen contra el máximo", () => {
    const a = repartirStrings(24, CSI, SITES.cdmx, RES);
    expect(a.vStringFrio).toBeLessThanOrEqual(RES.vMax);
    expect(a.margen).toBeGreaterThan(0);
  });

  it("con menos módulos que el mínimo de una serie no propone nada", () => {
    const a = repartirStrings(1, CSI, SITES.cdmx, IND);
    expect(a.strings).toBe(0);
    expect(a.sobrantes).toBe(1);
  });

  it("cero módulos no produce un arreglo ni cifras absurdas", () => {
    const a = repartirStrings(0, CSI, SITES.cdmx, RES);
    expect(a.porString).toBe(0);
    expect(a.strings).toBe(0);
    expect(Number.isFinite(a.margen)).toBe(true);
  });

  it("un módulo que no combina con la ventana se declara no viable", () => {
    // Voc alto y Vmp que se desploma: el máximo cae a seis módulos mientras el mínimo para
    // arrancar el seguidor pide más de cien. Ese módulo no combina con esa ventana.
    const raro = { voc: 200, vmp: 5, betaVoc: -0.5, temp: -0.35 };
    const r = rangoString(raro, SITES.cdmx, IND);
    expect(r.viable).toBe(false);
    expect(repartirStrings(50, raro, SITES.cdmx, IND).strings).toBe(0);
  });
});

describe("ventana e inversor según el tamaño", () => {
  it("elige residencial, comercial o industrial por potencia", () => {
    expect(ventanaPara(5).clave).toBe("res600");
    expect(ventanaPara(60).clave).toBe("com1000");
    expect(ventanaPara(800).clave).toBe("ind1500");
  });

  it("las ventanas están ordenadas y son coherentes", () => {
    for (const v of VENTANAS) {
      expect(v.vMpptMin).toBeLessThan(v.vMpptMax);
      expect(v.vMpptMax).toBeLessThan(v.vMax);
    }
    expect(VENTANAS[0].vMax).toBeLessThan(VENTANAS[1].vMax);
    expect(VENTANAS[1].vMax).toBeLessThan(VENTANAS[2].vMax);
  });

  it("el inversor recomendado es menor que la potencia de módulos", () => {
    const r = potenciaInversor(10);
    expect(r.min).toBeLessThan(10);
    expect(r.max).toBeLessThanOrEqual(10);
    expect(r.min).toBeLessThan(r.max);
  });

  it("la relación recomendada sobredimensiona el arreglo, no el inversor", () => {
    expect(DC_AC_RECOMENDADO.min).toBeGreaterThan(1);
    expect(DC_AC_RECOMENDADO.max).toBeLessThan(1.5);
  });
});
