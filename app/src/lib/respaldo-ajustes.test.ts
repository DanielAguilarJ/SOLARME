// @vitest-environment happy-dom
/**
 * Lo que el instalador capturó a mano dentro del respaldo.
 *
 * El respaldo llevaba proyectos y libreta, y dejaba fuera tres cosas que también se pierden con el
 * navegador: la identidad del negocio, el costo por watt de su operación y los precios que negoció
 * por marca. Lo grave son los dos últimos: al restaurar en otro equipo, las propuestas volvían a la
 * referencia nacional y le daban al cliente cifras distintas SIN avisar de nada. El archivo prometía
 * «pasar la cartera de un dispositivo a otro» y cumplía a medias.
 */
import { describe, expect, it } from "vitest";
import { exportProjects, fusionarAjustes, importProjects, VERSION, type Ajustes } from "./transfer";
import type { Project } from "./storage";
import { CITIES, type Design, type Panel } from "./solar";

const panel: Panel = {
  brand: "Test", model: "T-550", w: 550, eff: 21.3, temp: -0.34, area: 2.58,
  voc: 49.9, vmp: 41.8, isc: 14.0, imp: 13.2, betaVoc: -0.125, ppw: 5.2,
  priceOrigin: "banda", warr: 25,
};

const ciudad = CITIES.guadalajara;
const design: Design = {
  site: ciudad.site, lat: ciudad.lat, lng: ciudad.lng, yield: ciudad.yield,
  area: 60, tilt: 24, az: 180, shade: 0, type: "res", panel,
};

const proyecto: Project = {
  id: "p1", address: "Av. Chapultepec 100", city: "Guadalajara",
  design, createdAt: 1767225600000, status: "borrador",
};

const ajustes: Ajustes = {
  negocio: {
    nombre: "Solar del Bajío S.A. de C.V.",
    domicilio: "Av. López Mateos 1200, León",
    telefono: "477 123 4567",
    correo: "contacto@solardelbajio.mx",
    registro: "CFE-GD-2024-0192",
  },
  bos: { res: 14.5, com: 12 },
  quotes: { trina: 4.8, jinko: 5.1 },
};

const ida = (a: Ajustes = ajustes) =>
  importProjects(exportProjects([proyecto], new Date("2026-08-25"), [], a));

/**
 * Un archivo real con la sección de ajustes reemplazada por lo que se quiera probar.
 *
 * Se parte de una exportación de verdad en vez de escribir el proyecto a mano en el JSON: lo que se
 * guarda va despojado de la física del sitio —`paraGuardar` la quita porque se recalcula al abrir—,
 * así que un proyecto escrito a mano con todos sus campos no pasa la validación y la prueba mediría
 * otra cosa.
 */
const conAjustesCrudos = (crudos: unknown, version = 2) => {
  const doc = JSON.parse(exportProjects([proyecto], new Date("2026-08-25"), []));
  doc.version = version;
  if (crudos !== undefined) doc.ajustes = crudos;
  return importProjects(JSON.stringify(doc));
};

describe("el respaldo lleva lo que el instalador capturó a mano", () => {
  it("ida y vuelta conserva identidad, costos por watt y precios", () => {
    const r = ida();
    expect(r.error).toBeUndefined();
    // se comprueba también el proyecto: al escribir esta prueba el diseño de ejemplo le faltaba
    // `shade` y se descartaba en silencio, con los ajustes pasando igual. Un verde que no mide.
    expect(r.proyectos).toHaveLength(1);
    expect(r.ajustes.negocio?.nombre).toBe("Solar del Bajío S.A. de C.V.");
    expect(r.ajustes.bos).toEqual({ res: 14.5, com: 12 });
    expect(r.ajustes.quotes).toEqual({ trina: 4.8, jinko: 5.1 });
  });

  it("sin nada capturado, el archivo no escribe la sección vacía", () => {
    // un archivo con «ajustes» lleno de vacíos no dice nada e invita a sobrescribir con vacíos
    const texto = exportProjects([proyecto], new Date(), []);
    expect(texto).not.toContain("ajustes");
    expect(importProjects(texto).ajustes).toEqual({});
  });

  it("un archivo de la versión anterior sigue importándose", () => {
    // compatibilidad hacia atrás: es el respaldo que el instalador ya tiene guardado
    const r = conAjustesCrudos(undefined, 1);
    expect(r.error).toBeUndefined();
    expect(r.proyectos).toHaveLength(1);
    expect(r.ajustes).toEqual({});
  });

  it("el formato declara una versión nueva, y una más nueva aún se rechaza", () => {
    expect(VERSION).toBe(2);
    const futuro = JSON.stringify({
      formato: "solarme.cartera", version: VERSION + 1, exportado: "x", proyectos: [],
    });
    expect(importProjects(futuro).error).toMatch(/versión más nueva/);
  });
});

describe("los ajustes de un archivo son entrada no confiable", () => {
  it("un costo por watt fuera de rango se descarta sin tumbar la importación", () => {
    // 999 MXN/W metido a mano se usaría en CADA propuesta como si fuera dato del instalador
    const r = conAjustesCrudos({ bos: { res: 999, com: 12 } });
    expect(r.proyectos).toHaveLength(1);
    expect(r.ajustes.bos).toEqual({ com: 12 });
  });

  it("un precio de módulo que no es número se descarta", () => {
    expect(conAjustesCrudos({ quotes: { trina: "gratis", jinko: 5.1 } }).ajustes.quotes).toEqual({
      jinko: 5.1,
    });
  });

  it("un tipo de proyecto inventado no entra", () => {
    expect(conAjustesCrudos({ bos: { res: 15, marciano: 20 } }).ajustes.bos).toEqual({ res: 15 });
  });

  it("un negocio con campos de otro tipo se queda con lo aprovechable", () => {
    const n = conAjustesCrudos({ negocio: { nombre: "Solar Sur", telefono: 4771234567 } }).ajustes
      .negocio;
    expect(n?.nombre).toBe("Solar Sur");
    expect(n?.telefono).toBe("");
  });

  it("una sección de ajustes que no es objeto se ignora", () => {
    for (const basura of ["texto", 42, [], null]) {
      expect(conAjustesCrudos(basura).ajustes).toEqual({});
    }
  });
});

describe("fusionarAjustes no sobrescribe lo que ya hay en el equipo", () => {
  const local: Ajustes = {
    negocio: {
      nombre: "Solar Norte", domicilio: "Calle 5, Monterrey",
      telefono: "81 1111 2222", correo: "", registro: "",
    },
    bos: { res: 16 },
    quotes: { trina: 5 },
  };

  it("la identidad local gana: un respaldo de un compañero no cambia tu razón social", () => {
    const r = fusionarAjustes(local, ajustes);
    expect(r.ajustes.negocio?.nombre).toBe("Solar Norte");
    expect(r.aplicados).not.toContain("los datos del negocio");
  });

  it("en un equipo sin identidad, la del archivo entra", () => {
    const r = fusionarAjustes({}, ajustes);
    expect(r.ajustes.negocio?.nombre).toBe("Solar del Bajío S.A. de C.V.");
    expect(r.aplicados).toContain("los datos del negocio");
  });

  it("los costos y precios se suman, y el local manda en los repetidos", () => {
    const r = fusionarAjustes(local, ajustes);
    expect(r.ajustes.bos).toEqual({ res: 16, com: 12 });
    expect(r.ajustes.quotes).toEqual({ trina: 5, jinko: 5.1 });
  });

  it("dice qué se tomó del archivo, con singular y plural", () => {
    const r = fusionarAjustes(local, ajustes);
    expect(r.aplicados).toContain("1 costo por watt");
    expect(r.aplicados).toContain("1 precio de módulo");

    const dos = fusionarAjustes({}, { bos: { res: 14, com: 12 }, quotes: { a: 4, b: 5 } });
    expect(dos.aplicados).toContain("2 costos por watt");
    expect(dos.aplicados).toContain("2 precios de módulo");
  });

  it("sin nada que aportar no anuncia nada", () => {
    expect(fusionarAjustes(local, {}).aplicados).toEqual([]);
    expect(fusionarAjustes(local, local).aplicados).toEqual([]);
  });
});
