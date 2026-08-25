import { describe, it, expect } from "vitest";
import {
  desconectadorCC, desconectadorCA, unifilar, nodosIncompletos,
  V_NOMINALES, A_NOMINALES,
} from "./desconexion";
import { VENTANAS, repartirStrings } from "./strings";
import { dimensionarCircuito } from "./ocpd";
import { SITES } from "./site";
import { readFileSync } from "node:fs";
import type { Panel } from "./solar";

const cat = JSON.parse(
  readFileSync(new URL("../data/panels.json", import.meta.url), "utf8"),
).panels as Panel[];
const modulo = cat.find((p) => p.voc && p.isc && p.betaVoc)!;
const sitio = (n: string) => Object.values(SITES).find((s) => s.nombre.includes(n))!;

/** Un arreglo real, no inventado: se calcula con la física del sitio. */
function arreglo(ciudad: string, n: number, clave: "res600" | "com1000" | "ind1500") {
  const s = sitio(ciudad);
  const v = VENTANAS.find((x) => x.clave === clave)!;
  return { a: repartirStrings(n, modulo, s, v), v, s };
}

function circuito(ciudad: string) {
  return dimensionarCircuito(
    { isc: modulo.isc!, metros: 25, vString: modulo.vmp! * 10, conductores: 6, sobreAzotea: true },
    sitio(ciudad)
  );
}

describe("desconectador de corriente directa", () => {
  it("la tensión sale del voltaje en frío del sitio, no de un supuesto", () => {
    const { a } = arreglo("Ciudad Juárez", 24, "com1000");
    const d = desconectadorCC(a, circuito("Ciudad Juárez"));
    expect(d.vMin).toBe(Math.ceil(a.vStringFrio));
    expect(d.vMin).toBeGreaterThan(0);
    expect(d.falta).toBeUndefined();
  });

  it("la corriente es la de diseño con la que se calculó el conductor", () => {
    const c = circuito("Mexicali");
    const { a } = arreglo("Mexicali", 24, "com1000");
    expect(desconectadorCC(a, c).aMin).toBe(c.proteccion.minimo);
  });

  it("elige el valor comercial más chico que alcanza, en tensión y en corriente", () => {
    const { a } = arreglo("Mexicali", 24, "com1000");
    const d = desconectadorCC(a, circuito("Mexicali"));
    expect(V_NOMINALES).toContain(d.vNominal!);
    expect(A_NOMINALES).toContain(d.aNominal!);
    expect(d.vNominal!).toBeGreaterThanOrEqual(d.vMin);
    expect(d.aNominal!).toBeGreaterThanOrEqual(d.aMin);
    // más chico que alcanza: el anterior de la lista NO debe alcanzar
    const iv = V_NOMINALES.indexOf(d.vNominal as 600 | 1000 | 1500);
    // Se exige que la categoría elegida NO sea la más baja: si lo fuera, la comprobación de
    // que la anterior no alcanza no diría nada y el `if` la saltaría sin avisar.
    expect(iv).toBeGreaterThan(0);
    expect(V_NOMINALES[iv - 1]).toBeLessThan(d.vMin);
  });

  it("sin arreglo ni circuito no inventa cifras y declara qué falta", () => {
    const d = desconectadorCC(undefined, undefined);
    expect(d.vNominal).toBeNull();
    expect(d.aNominal).toBeNull();
    expect(d.falta).toMatch(/Falta/);
  });

  it("los requisitos que no dependen de cifras siempre están", () => {
    const d = desconectadorCC(undefined, undefined);
    expect(d.requisitos.join(" ")).toMatch(/sin escalera/);
    expect(d.requisitos.join(" ")).toMatch(/llave o que exija herramienta/);
    expect(d.requisitos.join(" ")).toMatch(/abierto o cerrado/);
  });
});

describe("desconectador de corriente alterna", () => {
  /* La app entrega una ventana de kW, no un modelo: la corriente de salida no se puede derivar. */
  it("no inventa la corriente y dice de dónde sale", () => {
    const d = desconectadorCA();
    expect(d.aNominal).toBeNull();
    expect(d.falta).toMatch(/placa del inversor/);
  });

  it("exige contacto visible y enclavamiento", () => {
    expect(desconectadorCA().requisitos.join(" ")).toMatch(/Enclavable en abierto/);
    expect(desconectadorCA().requisitos.join(" ")).toMatch(/contacto visible/);
  });
});

describe("diagrama unifilar", () => {
  it("va de los módulos a la red pasando por los dos desconectadores", () => {
    const { a, v } = arreglo("Mexicali", 24, "com1000");
    const n = unifilar(a, v, circuito("Mexicali"), 9.6);
    expect(n.map((x) => x.titulo)).toEqual([
      "Módulos", "Desconectador CC", "Inversor", "Desconectador CA",
      "Medidor bidireccional", "Red",
    ]);
  });

  it("el nodo de módulos trae las cifras del arreglo real", () => {
    const { a, v } = arreglo("Ciudad Juárez", 24, "com1000");
    const n = unifilar(a, v, circuito("Ciudad Juárez"), 9.6);
    const t = n[0].detalle.join(" ");
    expect(t).toContain(`${a.strings} × ${a.porString}`);
    expect(t).toContain(`${Math.round(a.vStringFrio)} V`);
  });

  it("el desconectador de alterna queda marcado como incompleto, no en blanco", () => {
    const { a, v } = arreglo("Mexicali", 24, "com1000");
    const n = unifilar(a, v, circuito("Mexicali"), 9.6);
    const ca = n.find((x) => x.titulo === "Desconectador CA")!;
    expect(ca.incompleto).toBe(true);
    expect(ca.detalle.length).toBeGreaterThan(0);
    expect(nodosIncompletos(n).map((x) => x.titulo)).toContain("Desconectador CA");
  });

  it("sin datos ningún nodo queda vacío: todos declaran la ausencia", () => {
    const n = unifilar(undefined, undefined, undefined, 0);
    for (const nodo of n) expect(nodo.detalle.length).toBeGreaterThan(0);
    expect(nodosIncompletos(n).length).toBeGreaterThanOrEqual(4);
  });

  it("el medidor y la red no dependen del cálculo y nunca están incompletos", () => {
    const n = unifilar(undefined, undefined, undefined, 0);
    expect(n.find((x) => x.titulo === "Red")!.incompleto).toBeFalsy();
    expect(n.find((x) => x.titulo === "Medidor bidireccional")!.incompleto).toBeFalsy();
  });
});

describe("el frío del sitio cambia el desconectador", () => {
  /* Mismo módulo, mismo arreglo 2×12, misma ventana: lo único que cambia es dónde está el techo. */
  const conMismoArreglo = (ciudad: string) => {
    const { a } = arreglo(ciudad, 24, "com1000");
    return { a, d: desconectadorCC(a, circuito(ciudad)) };
  };

  it("el sitio más frío exige más tensión con el arreglo idéntico", () => {
    const j = conMismoArreglo("Ciudad Juárez");
    const v = conMismoArreglo("Valladolid");
    expect(j.a.porString).toBe(v.a.porString); // el arreglo ES el mismo
    expect(j.a.strings).toBe(v.a.strings);
    expect(j.d.vMin).toBeGreaterThan(v.d.vMin);
  });

  it("el frío salta la categoría comercial: 600 V no alcanza en Ciudad Juárez y sí en Valladolid", () => {
    expect(conMismoArreglo("Ciudad Juárez").d.vNominal).toBe(1000);
    expect(conMismoArreglo("Valladolid").d.vNominal).toBe(600);
  });

  /* Mexicali queda 6 V arriba del corte de 600 V: el caso que se decide por nada. */
  it("un sitio apenas sobre el corte ya obliga al interruptor de la categoría siguiente", () => {
    const m = conMismoArreglo("Mexicali");
    expect(m.d.vMin).toBeGreaterThan(600);
    expect(m.d.vMin).toBeLessThan(650);
    expect(m.d.vNominal).toBe(1000);
  });
});
