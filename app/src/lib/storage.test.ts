import { afterEach, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  loadProjects, addProject, updateProject, removeProject, replaceProjects, paraGuardar,
  newId, relativeDate, guardadoFallo, suscribirGuardado, type Project,
} from "./storage";
import {
  AREA_INICIAL, CITIES, designForNewAddress, matchCity, compute,
  type Design, type Panel,
} from "./solar";
import { enrichPanels, modulePrice } from "./price";
import { areaPoligono } from "./polygon";

const panels: Panel[] = enrichPanels(
  JSON.parse(readFileSync(new URL("../data/panels.json", import.meta.url), "utf8")).panels,
) as Panel[];

/** Azotea en L con un tinaco: exactamente lo que un instalador tarda veinte segundos en
 * capturar y no debería tener que volver a capturar nunca. */
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

function proyecto(): Project {
  return {
    id: newId(), address: "Av. Reforma 100, Ciudad de México",
    city: "Ciudad de México", design: diseño(),
    createdAt: Date.now(), status: "borrador",
  };
}

beforeEach(() => localStorage.clear());

describe("lo que se guarda es lo durable", () => {
  it("conserva el contorno trazado tal cual", () => {
    const [g] = addProject([], proyecto());
    expect(g.design.outline).toEqual(CONTORNO);
    expect(areaPoligono(g.design.outline!)).toBeCloseTo(27, 6);
  });

  it("conserva los estorbos con su altura y posición", () => {
    const [g] = addProject([], proyecto());
    expect(g.design.obstacles).toEqual([TINACO]);
  });

  it("conserva el recibo del cliente, que es un dato suyo y no una estimación", () => {
    const [g] = addProject([], proyecto());
    expect(g.design.bill).toEqual({ kwh: 900, amount: 3200, period: "bim" });
  });

  it("conserva la identidad del módulo", () => {
    const [g] = addProject([], proyecto());
    expect(g.design.panel.brand).toBe(panels[0].brand);
    expect(g.design.panel.model).toBe(panels[0].model);
  });
});

/** La física medida se recalcula al abrir, así que guardarla es peso muerto y una invitación a
 * que un proyecto viejo cargue una física vieja. */
describe("lo derivado no se guarda", () => {
  it("no guarda la física del sitio", () => {
    const [g] = addProject([], proyecto());
    expect(g.design.site).toBeUndefined();
  });

  it("no guarda la tarifa del resto del sistema, que vive en su propio ajuste", () => {
    const p = proyecto();
    p.design = { ...p.design, bosPerW: 12 };
    const [g] = addProject([], p);
    expect(g.design.bosPerW).toBeUndefined();
  });

  it("quitar la física recorta más de la mitad del tamaño guardado", () => {
    const completo = JSON.stringify(proyecto()).length;
    const guardado = JSON.stringify(paraGuardar(proyecto())).length;
    expect(guardado).toBeLessThan(completo * 0.5);
  });

  it("`paraGuardar` no muta el proyecto original", () => {
    const p = proyecto();
    paraGuardar(p);
    expect(p.design.site).toBeDefined();
  });

  it("también se limpia al actualizar, no solo al crear", () => {
    let lista = addProject([], proyecto());
    lista = updateProject(lista, lista[0].id, {
      status: "propuesta",
      design: { ...diseño(), area: 60 },
    });
    expect(lista[0].design.site).toBeUndefined();
    expect(lista[0].design.area).toBe(60);
    expect(lista[0].status).toBe("propuesta");
  });
});

/** El recorrido completo: capturar, guardar, recargar la app y abrir. Sin esto el instalador
 * volvería a trazar la azotea cada vez. */
describe("ida y vuelta por almacenamiento", () => {
  it("un proyecto guardado se recupera con su contorno y sus estorbos", () => {
    addProject([], proyecto());
    const recuperados = loadProjects();
    expect(recuperados).toHaveLength(1);
    expect(recuperados[0].design.outline).toEqual(CONTORNO);
    expect(recuperados[0].design.obstacles).toEqual([TINACO]);
  });

  it("al abrirlo se recompone la física y el cálculo da lo mismo que antes de guardar", () => {
    const antes = compute(diseño());
    addProject([], proyecto());
    const p = loadProjects()[0];

    // la misma recomposición que hace la app: sitio por dirección y precio del módulo vigente
    const ciudad = matchCity(p.address).city;
    const precio = modulePrice(p.design.panel.brand, p.design.panel.eff);
    const despues = compute({
      ...p.design,
      site: ciudad.site,
      yield: ciudad.yield,
      panel: { ...p.design.panel, ppw: precio.mxnPerWp, priceOrigin: precio.origin },
    });

    expect(despues.n).toBe(antes.n);
    expect(despues.area).toBeCloseTo(antes.area, 6);
    expect(despues.kwh).toBeCloseTo(antes.kwh, 6);
    expect(despues.outlineMedido).toBe(true);
  });

  it("sin contorno guardado se vuelve al cuadrado, sin romper nada", () => {
    const p = proyecto();
    p.design = { ...p.design, outline: undefined };
    addProject([], p);
    const r = loadProjects()[0];
    expect(r.design.outline).toBeUndefined();
    expect(compute({ ...r.design, site: CITIES.cdmx.site }).outlineMedido).toBe(false);
  });
});

describe("las listas no se mutan", () => {
  it("agregar devuelve una lista nueva y deja la anterior intacta", () => {
    const lista: Project[] = [];
    const next = addProject(lista, proyecto());
    expect(lista).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it("el nuevo queda primero, que es el orden que espera la lista de proyectos", () => {
    const a = { ...proyecto(), address: "primero" };
    const b = { ...proyecto(), address: "segundo" };
    const lista = addProject(addProject([], a), b);
    expect(lista[0].address).toBe("segundo");
  });

  it("quitar no toca la lista anterior", () => {
    const lista = addProject([], proyecto());
    const next = removeProject(lista, lista[0].id);
    expect(lista).toHaveLength(1);
    expect(next).toHaveLength(0);
    expect(loadProjects()).toHaveLength(0);
  });

  it("actualizar un id que no existe no inventa un proyecto", () => {
    const lista = addProject([], proyecto());
    const next = updateProject(lista, "no-existe", { status: "ganado" });
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("borrador");
  });
});

/** La primitiva de restaurar un respaldo: guardar de a uno recorrería el almacenamiento tantas
 * veces como proyectos traiga el archivo y podría dejar la lista a medias. */
describe("reemplazo masivo", () => {
  it("guarda toda la lista de una vez", () => {
    const lista = [proyecto(), proyecto(), proyecto()];
    replaceProjects(lista);
    expect(loadProjects()).toHaveLength(3);
  });

  it("también limpia la física de cada uno", () => {
    replaceProjects([proyecto(), proyecto()]);
    const guardados = loadProjects();
    // Sin esta línea el bucle recorre cero elementos si no se guardó nada y la prueba pasa
    // afirmando que se limpió la física de una lista vacía. Comprobado: neutralizar
    // `replaceProjects` la dejaba en verde.
    expect(guardados).toHaveLength(2);
    for (const p of guardados) expect(p.design.site).toBeUndefined();
  });

  it("conserva el contorno y los estorbos de todos", () => {
    replaceProjects([proyecto(), proyecto()]);
    const guardados = loadProjects();
    expect(guardados).toHaveLength(2);
    for (const p of guardados) {
      expect(p.design.outline).toEqual(CONTORNO);
      expect(p.design.obstacles).toEqual([TINACO]);
    }
  });

  it("una lista vacía deja el almacenamiento vacío, no corrupto", () => {
    replaceProjects([proyecto()]);
    replaceProjects([]);
    expect(loadProjects()).toEqual([]);
  });

  it("no muta la lista que recibe", () => {
    const lista = [proyecto()];
    replaceProjects(lista);
    expect(lista[0].design.site).toBeDefined();
  });
});

describe("almacenamiento corrupto", () => {
  it("una lista que no es arreglo se descarta en vez de romper la app", () => {
    localStorage.setItem("solarme.projects.v1", JSON.stringify({ no: "es lista" }));
    expect(loadProjects()).toEqual([]);
  });

  it("JSON inválido se descarta", () => {
    localStorage.setItem("solarme.projects.v1", "{{{");
    expect(loadProjects()).toEqual([]);
  });

  it("sin nada guardado devuelve lista vacía", () => {
    expect(loadProjects()).toEqual([]);
  });
});

describe("identificadores y fechas", () => {
  it("dos identificadores seguidos no coinciden", () => {
    const vistos = new Set(Array.from({ length: 200 }, () => newId()));
    expect(vistos.size).toBe(200);
  });

  it("la fecha relativa cubre minutos, horas, ayer y días", () => {
    const ahora = Date.now();
    expect(relativeDate(ahora)).toBe("hace minutos");
    expect(relativeDate(ahora - 5 * 3.6e6)).toBe("hace 5 h");
    expect(relativeDate(ahora - 26 * 3.6e6)).toBe("ayer");
    expect(relativeDate(ahora - 5 * 24 * 3.6e6)).toBe("hace 5 días");
  });

  it("más de un mes muestra la fecha, no un contador que ya no dice nada", () => {
    expect(relativeDate(Date.now() - 200 * 24 * 3.6e6)).toMatch(/\d/);
  });
});


/**
 * El defecto que esto impide repetir: se analizaba un techo, se empezaba otro domicilio y el
 * tinaco y el contorno del primero viajaban al segundo. Salió al respaldar dos proyectos y
 * ver que el segundo traía dos estorbos cuando se había capturado uno en cada uno.
 */
describe("un domicilio nuevo no hereda nada del anterior", () => {
  const anterior = (): Design => ({
    ...diseño(),
    area: 180,
    shade: 22,
    outline: CONTORNO,
    obstacles: [TINACO],
    bill: { kwh: 900, amount: 3200, period: "bim" },
  });

  it("no arrastra el contorno del techo anterior", () => {
    expect(designForNewAddress(anterior(), CITIES.tijuana).outline).toBeUndefined();
  });

  it("no arrastra los estorbos del techo anterior", () => {
    expect(designForNewAddress(anterior(), CITIES.tijuana).obstacles).toBeUndefined();
  });

  it("no arrastra el recibo, que es de otro cliente", () => {
    expect(designForNewAddress(anterior(), CITIES.tijuana).bill).toBeUndefined();
  });

  it("no arrastra la superficie ni la sombra estimada", () => {
    const n = designForNewAddress(anterior(), CITIES.tijuana);
    expect(n.area).toBe(AREA_INICIAL);
    expect(n.shade).toBe(0);
  });

  /** Lo que sí se conserva: la elección del instalador, que no cambia entre domicilios. */
  it("conserva el módulo con que trabaja el instalador", () => {
    const a = anterior();
    const n = designForNewAddress(a, CITIES.tijuana);
    expect(n.panel.brand).toBe(a.panel.brand);
    expect(n.panel.model).toBe(a.panel.model);
  });

  it("conserva el tipo de proyecto", () => {
    const a = { ...anterior(), type: "com" as const };
    expect(designForNewAddress(a, CITIES.tijuana).type).toBe("com");
  });

  it("toma la física y la inclinación óptima de la ciudad nueva", () => {
    const n = designForNewAddress(anterior(), CITIES.tijuana);
    expect(n.site).toBe(CITIES.tijuana.site);
    expect(n.yield).toBe(CITIES.tijuana.yield);
    expect(n.tilt).toBe(CITIES.tijuana.site!.tiltOptimo);
    expect(n.lat).toBe(CITIES.tijuana.lat);
  });

  it("vuelve a apuntar al sur: la orientación es del techo, no del instalador", () => {
    expect(designForNewAddress({ ...anterior(), az: 250 }, CITIES.tijuana).az).toBe(180);
  });

  it("no muta el diseño anterior", () => {
    const a = anterior();
    designForNewAddress(a, CITIES.tijuana);
    expect(a.outline).toEqual(CONTORNO);
    expect(a.obstacles).toEqual([TINACO]);
  });

  it("el cálculo del domicilio nuevo no lleva sombra de estorbos ajenos", () => {
    const r = compute(designForNewAddress(anterior(), CITIES.tijuana));
    expect(r.shading).toBeUndefined();
    expect(r.outlineMedido).toBe(false);
  });
});

describe("el retorno de replaceProjects NO sirve como estado de la interfaz", () => {
  // La trampa: `replaceProjects` persiste y DEVUELVE `list.map(paraGuardar)`, o sea la versión
  // despojada. Usar su retorno como estado de React le quitaba a TODOS los proyectos la física
  // medida y el costo BOS capturado por el instalador —en memoria, no solo en disco—, así que los
  // números de la cartera cambiaban solos al cambiar el estado de uno o al importar un respaldo.
  //
  // Nada en la suite lo veía: 796 pruebas pasaban con el defecto puesto. Estas lo fijan.
  beforeEach(() => localStorage.clear());

  it("devuelve la lista despojada, no la que se le pasó", () => {
    const p = proyecto();
    const conFisica: Project = {
      ...p,
      design: { ...p.design, site: CITIES["cdmx"].site, bosPerW: 9.5 },
    };
    expect(conFisica.design.site, "el escenario debe partir con física").toBeTruthy();

    const devuelto = replaceProjects([conFisica]);

    // Esto es lo que hay que saber antes de usar el retorno: viene sin física ni BOS.
    expect(devuelto[0].design.site).toBeUndefined();
    expect(devuelto[0].design.bosPerW).toBeUndefined();
    // Y el original no se muta: el que llama sigue teniendo la lista completa disponible.
    expect(conFisica.design.site).toBeTruthy();
    expect(conFisica.design.bosPerW).toBe(9.5);
  });

  it("lo que se guarda sí va despojado, que es su motivo de existir", () => {
    const p = proyecto();
    replaceProjects([{ ...p, design: { ...p.design, site: CITIES["cdmx"].site, bosPerW: 9.5 } }]);

    const guardados = loadProjects();
    expect(guardados).toHaveLength(1);
    // La física es derivada: se recalcula al abrir el proyecto, no se almacena.
    expect(guardados[0].design.site).toBeUndefined();
    // Pero el resto del diseño tiene que sobrevivir, o el proyecto se degrada al recargar.
    expect(guardados[0].design.area).toBe(p.design.area);
    expect(guardados[0].design.tilt).toBe(p.design.tilt);
    expect(guardados[0].status).toBe(p.status);
  });
});

describe("un almacén que ya no acepta escrituras no puede pasar callado", () => {
  // El `catch` de `persist` estaba vacío, con la nota de que la sesión seguía en memoria. Es
  // verdad, y es exactamente el problema: el instalador ve su proyecto en pantalla, cree que está
  // guardado y al cerrar la pestaña lo pierde. En un teléfono con la cartera llena de contornos y
  // estorbos, quedarse sin espacio es plausible, y perder trabajo EN SILENCIO es el peor fallo
  // posible en un producto cuyo único almacén es el navegador.
  const real = (globalThis as { localStorage?: Storage }).localStorage;

  function conAlmacen(setItem: (k: string, v: string) => void): void {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => null,
        setItem,
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      } as unknown as Storage,
      configurable: true,
      writable: true,
    });
  }

  function restaurar(): void {
    Object.defineProperty(globalThis, "localStorage", {
      value: real, configurable: true, writable: true,
    });
  }

  afterEach(() => {
    // Se deja el indicador en falso para no contaminar el resto del archivo.
    conAlmacen(() => undefined);
    addProject([], proyecto());
    restaurar();
  });

  it("cuando el almacén se llena, el fallo queda declarado", () => {
    conAlmacen(() => {
      throw new Error("cuota excedida");
    });
    addProject([], proyecto());
    expect(guardadoFallo()).toBe(true);
  });

  it("avisa a quien escuche, para que la interfaz lo pueda decir", () => {
    conAlmacen(() => undefined);
    addProject([], proyecto());       // parte de un estado bueno
    let avisos = 0;
    const cancelar = suscribirGuardado(() => {
      avisos++;
    });
    conAlmacen(() => {
      throw new Error("sin espacio");
    });
    addProject([], proyecto());
    cancelar();
    expect(avisos).toBeGreaterThan(0);
  });

  it("cuando vuelve a haber espacio, deja de avisar", () => {
    conAlmacen(() => {
      throw new Error("sin espacio");
    });
    addProject([], proyecto());
    expect(guardadoFallo()).toBe(true);

    conAlmacen(() => undefined);
    addProject([], proyecto());
    expect(guardadoFallo()).toBe(false);
  });

  it("un guardado que funciona no molesta a nadie", () => {
    conAlmacen(() => undefined);
    addProject([], proyecto());
    let avisos = 0;
    const cancelar = suscribirGuardado(() => {
      avisos++;
    });
    addProject([], proyecto());
    cancelar();
    expect(avisos).toBe(0);
  });

  it("el fallo se detecta también al borrar y al reemplazar, no solo al añadir", () => {
    for (const mutar of [
      () => removeProject([proyecto()], "x"),
      () => replaceProjects([proyecto()]),
    ]) {
      conAlmacen(() => undefined);
      addProject([], proyecto());
      expect(guardadoFallo()).toBe(false);
      conAlmacen(() => {
        throw new Error("sin espacio");
      });
      mutar();
      expect(guardadoFallo()).toBe(true);
    }
  });
});
