import type { Contacto } from "./contactos";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  cargarCarteraSegura, exportProjects, importProjects, fusionar, nombreArchivo, FORMATO, VERSION,
} from "./transfer";
import { newId, type Project } from "./storage";
import { CITIES, compute, matchCity, type Design, type Panel } from "./solar";
import { enrichPanels, modulePrice } from "./price";

const panels: Panel[] = enrichPanels(
  JSON.parse(readFileSync(new URL("../data/panels.json", import.meta.url), "utf8")).panels,
) as Panel[];

const CONTORNO = [
  { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 },
  { x: 3, y: 3 }, { x: 3, y: 6 }, { x: 0, y: 6 },
];
const TINACO = {
  id: "t1", kind: "tinaco" as const, height: 1.6, x: 1.5, y: 1, width: 1.2, depth: 1.2,
};

function diseño(): Design {
  const c = CITIES.cdmx;
  return {
    site: c.site, lat: c.lat, lng: c.lng, yield: c.yield,
    area: 35, tilt: c.site!.tiltOptimo, az: 180, shade: 0,
    type: "res", panel: panels[0],
    outline: CONTORNO, obstacles: [TINACO],
    bill: { kwh: 900, amount: 3200, period: "bim" },
  };
}

function proyecto(over: Partial<Project> = {}): Project {
  return {
    id: newId(), address: "Av. Reforma 100, Ciudad de México",
    city: "Ciudad de México", design: diseño(),
    createdAt: 1700000000000, status: "borrador", ...over,
  };
}

/** Modifica el archivo exportado como podría hacerlo alguien a mano. */
function alterado(cambio: (doc: Record<string, unknown>) => void): string {
  const doc = JSON.parse(exportProjects([proyecto()]));
  cambio(doc);
  return JSON.stringify(doc);
}

describe("exportar", () => {
  it("declara formato, versión y fecha", () => {
    const doc = JSON.parse(exportProjects([proyecto()], new Date("2026-08-23T10:00:00Z")));
    expect(doc.formato).toBe(FORMATO);
    expect(doc.version).toBe(VERSION);
    expect(doc.exportado).toBe("2026-08-23T10:00:00.000Z");
  });

  it("no exporta la física del sitio, igual que no se guarda", () => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    expect(doc.proyectos[0].design.site).toBeUndefined();
  });

  it("conserva el contorno, los estorbos y el recibo", () => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    expect(doc.proyectos[0].design.outline).toEqual(CONTORNO);
    expect(doc.proyectos[0].design.obstacles).toEqual([TINACO]);
    expect(doc.proyectos[0].design.bill.kwh).toBe(900);
  });

  it("una cartera vacía produce un archivo válido, no un error", () => {
    const r = importProjects(exportProjects([]));
    expect(r.error).toBeUndefined();
    expect(r.proyectos).toEqual([]);
  });

  it("el nombre del archivo lleva la fecha", () => {
    expect(nombreArchivo(new Date("2026-08-23T10:00:00Z")))
      .toBe("solarme-cartera-2026-08-23.json");
  });
});

describe("la ida y vuelta conserva lo importante", () => {
  it("lo exportado se vuelve a importar con su geometría intacta", () => {
    const r = importProjects(exportProjects([proyecto()]));
    expect(r.omitidos).toBe(0);
    expect(r.proyectos[0].design.outline).toEqual(CONTORNO);
    expect(r.proyectos[0].design.obstacles).toEqual([TINACO]);
  });

  it("el cálculo da lo mismo después de exportar e importar", () => {
    const antes = compute(diseño());
    const r = importProjects(exportProjects([proyecto()]));
    const p = r.proyectos[0];
    const ciudad = matchCity(p.address).city;
    const precio = modulePrice(p.design.panel.brand, p.design.panel.eff);
    const despues = compute({
      ...p.design, site: ciudad.site, yield: ciudad.yield,
      panel: { ...p.design.panel, ppw: precio.mxnPerWp, priceOrigin: precio.origin },
    });
    expect(despues.n).toBe(antes.n);
    expect(despues.kwh).toBeCloseTo(antes.kwh, 6);
    expect(despues.area).toBeCloseTo(antes.area, 6);
  });

  it("el precio del módulo no viaja en el archivo: se recalcula", () => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    doc.proyectos[0].design.panel.ppw = 0.34; // el valor viejo en dólares
    const r = importProjects(JSON.stringify(doc));
    expect(r.proyectos[0].design.panel.ppw).toBe(0);
    expect(r.proyectos[0].design.panel.priceOrigin).toBe("banda");
  });
});

/** Un archivo pudo editarse a mano, venir truncado o de otra aplicación. */
describe("archivos que no sirven", () => {
  it("un texto que no es JSON se rechaza con un motivo legible", () => {
    const r = importProjects("{{{ no soy json");
    expect(r.proyectos).toEqual([]);
    expect(r.error).toMatch(/JSON/);
  });

  it("un arreglo suelto no es una cartera", () => {
    expect(importProjects("[1,2,3]").error).toBeTruthy();
  });

  it("un JSON de otra aplicación se rechaza por el formato", () => {
    expect(importProjects(JSON.stringify({ formato: "otra.cosa", proyectos: [] })).error)
      .toMatch(/cartera de SolarMe/);
  });

  it("un archivo de una versión más nueva se rechaza en vez de adivinar", () => {
    const r = importProjects(alterado((d) => { d.version = VERSION + 1; }));
    expect(r.error).toMatch(/versión más nueva/);
  });

  it("una versión más vieja SÍ se acepta: hacia atrás se puede leer", () => {
    const r = importProjects(alterado((d) => { d.version = 1; }));
    expect(r.error).toBeUndefined();
  });

  it("sin la lista de proyectos se rechaza", () => {
    expect(importProjects(JSON.stringify({ formato: FORMATO, version: 1 })).error)
      .toMatch(/no trae proyectos/);
  });

  it("un texto vacío no rompe nada", () => {
    expect(importProjects("").error).toBeTruthy();
  });
});

/** Un proyecto malo no debe costarle los buenos. */
describe("descarta lo inválido y conserva el resto", () => {
  const conDos = (segundo: unknown) => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    doc.proyectos.push(segundo);
    return importProjects(JSON.stringify(doc));
  };

  it("omite el proyecto roto y salva el bueno, informando cuántos", () => {
    const r = conDos({ id: "x", address: "sin diseño" });
    expect(r.proyectos).toHaveLength(1);
    expect(r.omitidos).toBe(1);
  });

  it("omite un proyecto sin dirección", () => {
    const doc = JSON.parse(exportProjects([proyecto(), proyecto()]));
    doc.proyectos[1].address = "";
    const r = importProjects(JSON.stringify(doc));
    expect(r.proyectos).toHaveLength(1);
    expect(r.omitidos).toBe(1);
  });

  it("omite coordenadas imposibles", () => {
    const r = conDos({
      ...proyecto(), design: { ...diseño(), lat: 200 },
    });
    expect(r.omitidos).toBe(1);
  });

  it("omite una inclinación imposible", () => {
    expect(conDos({ ...proyecto(), design: { ...diseño(), tilt: 400 } }).omitidos).toBe(1);
  });

  it("omite un módulo con potencia absurda", () => {
    const p = { ...proyecto(), design: { ...diseño(), panel: { ...panels[0], w: 99999 } } };
    expect(conDos(p).omitidos).toBe(1);
  });

  it("un estado desconocido no descarta el proyecto: se vuelve borrador", () => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    doc.proyectos[0].status = "inventado";
    const r = importProjects(JSON.stringify(doc));
    expect(r.proyectos[0].status).toBe("borrador");
    expect(r.omitidos).toBe(0);
  });

  it("un contorno a medias se descarta entero, no se importa mutilado", () => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    doc.proyectos[0].design.outline = [{ x: 0, y: 0 }, { x: "no", y: 3 }, { x: 3, y: 3 }];
    const r = importProjects(JSON.stringify(doc));
    expect(r.proyectos[0].design.outline).toBeUndefined();
    expect(r.omitidos).toBe(0);
  });

  it("un contorno de dos puntos se descarta: no encierra superficie", () => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    doc.proyectos[0].design.outline = [{ x: 0, y: 0 }, { x: 3, y: 3 }];
    expect(importProjects(JSON.stringify(doc)).proyectos[0].design.outline).toBeUndefined();
  });

  it("un estorbo inválido se cae solo, sin arrastrar a los válidos", () => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    doc.proyectos[0].design.obstacles = [
      TINACO,
      { id: "malo", kind: "ovni", height: 2, x: 1, y: 1, width: 1, depth: 1 },
      { ...TINACO, id: "gigante", height: 900 },
    ];
    const r = importProjects(JSON.stringify(doc));
    expect(r.proyectos[0].design.obstacles).toEqual([TINACO]);
  });

  it("un recibo con ceros se ignora en vez de dividir por cero", () => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    doc.proyectos[0].design.bill = { kwh: 0, amount: 0, period: "bim" };
    expect(importProjects(JSON.stringify(doc)).proyectos[0].design.bill).toBeUndefined();
  });

  it("un periodo de recibo inventado se ignora", () => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    doc.proyectos[0].design.bill = { kwh: 900, amount: 3200, period: "quincenal" };
    expect(importProjects(JSON.stringify(doc)).proyectos[0].design.bill).toBeUndefined();
  });

  it("nunca importa la física del sitio, ni si el archivo la trae", () => {
    const doc = JSON.parse(exportProjects([proyecto()]));
    doc.proyectos[0].design.site = { nombre: "Inventada", rendimiento: 9999 };
    expect(importProjects(JSON.stringify(doc)).proyectos[0].design.site).toBeUndefined();
  });
});

describe("fusionar con lo que ya hay", () => {
  it("agrega los nuevos y cuenta los repetidos", () => {
    const a = proyecto({ id: "a", createdAt: 1000 });
    const b = proyecto({ id: "b", createdAt: 2000 });
    const r = fusionar([a], [a, b]);
    expect(r.agregados).toBe(1);
    expect(r.repetidos).toBe(1);
    expect(r.lista).toHaveLength(2);
  });

  /** Sobrescribir el trabajo local con una copia vieja del respaldo sería la peor variante. */
  it("no sobrescribe un proyecto existente con la copia del archivo", () => {
    const local = proyecto({ id: "a", address: "trabajo de hoy" });
    const viejo = proyecto({ id: "a", address: "copia vieja" });
    expect(fusionar([local], [viejo]).lista[0].address).toBe("trabajo de hoy");
  });

  it("ordena por fecha, lo más nuevo primero", () => {
    const viejo = proyecto({ id: "v", createdAt: 1000 });
    const nuevo = proyecto({ id: "n", createdAt: 9000 });
    expect(fusionar([viejo], [nuevo]).lista[0].id).toBe("n");
  });

  it("importar en una cartera vacía trae todo", () => {
    const r = fusionar([], [proyecto({ id: "a" }), proyecto({ id: "b" })]);
    expect(r.agregados).toBe(2);
    expect(r.repetidos).toBe(0);
  });

  it("no muta las listas que recibe", () => {
    const actuales = [proyecto({ id: "a" })];
    fusionar(actuales, [proyecto({ id: "b" })]);
    expect(actuales).toHaveLength(1);
  });
});

/**
 * La vista promete que la libreta «viaja en tu respaldo». Cuando se escribió esa frase el respaldo
 * NO la llevaba: la promesa era falsa y ninguna de las 644 pruebas lo veía. Esto lo fija.
 */
describe("la libreta viaja con la cartera", () => {
  const contacto = (o: Partial<Contacto> = {}): Contacto => ({
    id: "e1", nombre: "Ing. Ana Ruiz", rol: "electricista", registro: "CFE-4471", creadoEn: 5, ...o,
  });

  it("el archivo exportado incluye los contactos", () => {
    const doc = JSON.parse(exportProjects([], new Date(), [contacto()]));
    expect(doc.contactos).toHaveLength(1);
    expect(doc.contactos[0].nombre).toBe("Ing. Ana Ruiz");
    expect(doc.contactos[0].registro).toBe("CFE-4471");
  });

  it("sin libreta el campo existe vacío, no ausente", () => {
    expect(JSON.parse(exportProjects([])).contactos).toEqual([]);
  });

  it("va y vuelve idéntico", () => {
    const cs = [contacto(), contacto({ id: "c1", nombre: "Cuadrilla Norte", rol: "cuadrilla", registro: undefined })];
    const r = importProjects(exportProjects([], new Date(), cs));
    expect(r.error).toBeUndefined();
    expect(r.contactos).toHaveLength(2);
    expect(r.contactos.map((c) => c.id)).toEqual(["e1", "c1"]);
  });

  it("un contacto roto se descarta y cuenta como omitido, no rompe el archivo", () => {
    const texto = JSON.stringify({
      formato: JSON.parse(exportProjects([])).formato,
      version: JSON.parse(exportProjects([])).version,
      exportado: new Date().toISOString(),
      proyectos: [],
      contactos: [contacto(), null, { nombre: "" }, { rol: "otro" }, 7],
    });
    const r = importProjects(texto);
    expect(r.error).toBeUndefined();
    expect(r.contactos).toHaveLength(1);
    expect(r.omitidos).toBe(4);
  });

  it("un archivo de una versión sin libreta se importa sin contactos y sin error", () => {
    const doc = JSON.parse(exportProjects([]));
    delete doc.contactos;
    const r = importProjects(JSON.stringify(doc));
    expect(r.error).toBeUndefined();
    expect(r.contactos).toEqual([]);
  });

  it("los contactos no se cuelan como proyectos", () => {
    const r = importProjects(exportProjects([], new Date(), [contacto()]));
    expect(r.proyectos).toEqual([]);
  });
});

describe("un proyecto corrupto en el almacén no puede encerrar al instalador", () => {
  // El defecto: `loadProjects` hace `parsed as Project[]`, un casting a ciegas. Un proyecto
  // escrito a medias —pestaña cerrada durante el guardado, formato de una versión anterior—
  // entraba en el estado de React y podía romper el renderizado.
  //
  // Con el límite de error puesto es PEOR de lo que parece: la pantalla de recuperación aparece,
  // pero «volver a intentar» vuelve a leer la misma entrada mala y falla siempre. El instalador
  // queda encerrado, con un único recurso: descargar el respaldo.
  // Se usa el MISMO generador que las pruebas de importación: si el dato de prueba fuera
  // distinto, la comparación entre los dos caminos no valdría nada.
  const bueno = proyecto({ id: "p1", address: "Calle Buena 1" });

  function conAlmacen(valor: unknown): { proyectos: Project[]; descartados: number } {
    const real = (globalThis as { localStorage?: Storage }).localStorage;
    const datos: Record<string, string> = {
      "solarme.projects.v1": typeof valor === "string" ? valor : JSON.stringify(valor),
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (k: string) => datos[k] ?? null,
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 1,
      } as unknown as Storage,
      configurable: true,
      writable: true,
    });
    try {
      return cargarCarteraSegura();
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: real, configurable: true, writable: true,
      });
    }
  }

  it("conserva los proyectos buenos y descarta los inservibles", () => {
    const r = conAlmacen([bueno, { id: "roto" }, null, { ...bueno, id: "p2", design: null }]);
    expect(r.proyectos).toHaveLength(1);
    expect(r.proyectos[0].id).toBe("p1");
    expect(r.descartados).toBe(3);
  });

  it("un almacén entero corrupto devuelve vacío en vez de romper", () => {
    for (const basura of ["no soy json", { no: "es arreglo" }, 42, null]) {
      const r = conAlmacen(basura);
      expect(Array.isArray(r.proyectos), String(basura)).toBe(true);
      expect(r.proyectos, String(basura)).toHaveLength(0);
    }
  });

  it("un almacén vacío no inventa proyectos", () => {
    const r = conAlmacen([]);
    expect(r.proyectos).toHaveLength(0);
    expect(r.descartados).toBe(0);
  });

  it("aplica la MISMA regla que un respaldo importado", () => {
    // Si las dos validaciones se desviaran, un archivo aceptado al importar podría quedar
    // descartado al recargar, o al contrario.
    const archivo = JSON.stringify({
      formato: FORMATO, version: VERSION, proyectos: [bueno, { id: "roto" }],
    });
    const importado = importProjects(archivo);
    const guardado = conAlmacen([bueno, { id: "roto" }]);
    expect(importado.proyectos).toHaveLength(guardado.proyectos.length);
    expect(importado.proyectos[0].id).toBe(guardado.proyectos[0].id);
  });
});
