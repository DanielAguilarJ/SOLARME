import { describe, it, expect } from "vitest";
import { revisar, revisarProyecto, resumenCartera } from "./revision";
import { CITIES, type Design } from "./solar";
import panelsJson from "../data/panels.json";
import type { Panel } from "./solar";
import { enrichPanels } from "./price";

const panels = enrichPanels(panelsJson.panels as unknown as Panel[]);
const cdmx = CITIES["cdmx"];

/** Un diseño recién creado: nada capturado todavía. */
const nuevo: Design = {
  panel: panels[0], type: "res", area: 35, tilt: 15, az: 180, shade: 5,
  lat: cdmx.lat, lng: cdmx.lng, yield: cdmx.yield,
};

/** Un diseño con todo lo que el instalador puede medir. */
const completo: Design = {
  ...nuevo,
  site: cdmx.site,
  bill: { kwh: 700, amount: 2400, period: "bim" },
  outline: [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 5 }, { x: 0, y: 5 }],
  obstacles: [{ id: "a", kind: "tinaco", height: 1.6, width: 1.2, depth: 1.2, x: 1, y: 1 }],
};

describe("qué le falta a un proyecto", () => {
  it("avisa cuando el módulo no combina con la ventana de inversor", () => {
    // Este aviso es de gravedad «impide» y NO tenía ninguna prueba. Además es inalcanzable con
    // los datos reales: medí las 42 840 combinaciones de 140 módulos × 102 sitios × 3 ventanas
    // —remedidas tras ampliar el catálogo, incluidos los sitios de −8 °C que más aprietan el
    // cálculo de Voc en frío— y
    // `viable` es cierto en TODAS. O sea que nunca se dispararía por accidente, y el día que el
    // catálogo crezca con un módulo de Voc alto nadie habría comprobado que el aviso funciona.
    //
    // El módulo sintético es el mismo criterio que usa `strings.test.ts`: Voc alto con Vmp que se
    // desploma, así que el máximo cae a unos pocos módulos mientras el mínimo para arrancar el
    // seguidor pide muchos más.
    const raro: Design = {
      ...completo,
      panel: { ...panels[0], voc: 200, vmp: 5, betaVoc: -0.5, temp: -0.35 },
    };

    const h = revisar(raro);
    const aviso = h.find((x) => x.clave === "string-inviable");
    expect(aviso, "el aviso de string inviable debe aparecer").toBeTruthy();
    expect(aviso!.gravedad).toBe("impide");
    expect(aviso!.texto).toContain("no combina con la ventana de inversor");
    expect(aviso!.accion).toBeTruthy();

    // Y con un módulo normal no debe aparecer: un aviso que sale siempre no informa de nada.
    expect(revisar(completo).map((x) => x.clave)).not.toContain("string-inviable");
  });

  it("un diseño nuevo tiene todo por capturar", () => {
    const h = revisar(nuevo);
    const claves = h.map((x) => x.clave);
    expect(claves).toContain("sin-sitio");
    expect(claves).toContain("sin-recibo");
    expect(claves).toContain("sin-contorno");
    expect(claves).toContain("sin-obstaculos");
  });

  it("un diseño completo no reporta nada", () => {
    expect(revisar(completo)).toEqual([]);
  });

  it("cada hallazgo dice qué hacer, no solo qué falta", () => {
    const h = revisar(nuevo);
    expect(h.length).toBeGreaterThan(0);
    for (const x of h) {
      expect(x.accion.length).toBeGreaterThan(8);
      expect(x.texto.length).toBeGreaterThan(15);
    }
  });

  it("capturar el recibo quita ese hallazgo y deja los demás", () => {
    const antes = revisar(nuevo).length;
    const h = revisar({ ...nuevo, bill: { kwh: 700, amount: 2400, period: "bim" } });
    expect(h.length).toBe(antes - 1);
    expect(h.map((x) => x.clave)).not.toContain("sin-recibo");
  });

  it("lo que impide entregar va antes de lo estimado", () => {
    // techo de un metro de fondo: no cabe ninguna fila
    const h = revisar({ ...nuevo, outline: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 1 }, { x: 0, y: 1 }] });
    expect(h[0].gravedad).toBe("impide");
    expect(h[0].clave).toBe("no-cabe");
  });

  it("un contorno que se cruza se reporta como impedimento", () => {
    const h = revisar({ ...nuevo, outline: [{ x: 0, y: 0 }, { x: 7, y: 5 }, { x: 7, y: 0 }, { x: 0, y: 5 }] });
    expect(h.some((x) => x.clave === "contorno-invalido" && x.gravedad === "impide")).toBe(true);
  });

  it("el resumen separa listos, estimados e impedidos", () => {
    const r = resumenCartera([
      { address: "Calle 1, Ciudad de México", design: completo },
      { address: "Calle 2", design: nuevo },
      { address: "Calle 3", design: { ...nuevo, outline: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 1 }, { x: 0, y: 1 }] } },
    ]);
    expect(r.listos).toBe(1);
    expect(r.estiman).toBe(1);
    expect(r.impiden).toBe(1);
  });

  /* Un proyecto guardado NUNCA trae `design.site`: `paraGuardar` lo elimina porque es física
     derivada. Si la revisión lo leyera de ahí, marcaría "promedio nacional" en toda ciudad medida. */
  it("resuelve el sitio de la dirección, no del diseño guardado", () => {
    const guardado = { ...completo, site: undefined };
    // leído del diseño: se ve como si no hubiera ciudad medida
    expect(revisar(guardado).map((x) => x.clave)).toContain("sin-sitio");
    // resuelto de la dirección: la ciudad sí está medida
    expect(revisarProyecto({ address: "Av. Reforma 100, Ciudad de México", design: guardado })
      .map((x) => x.clave)).not.toContain("sin-sitio");
  });

  it("una dirección sin ciudad medida sí reporta el promedio nacional", () => {
    expect(revisarProyecto({ address: "Camino viejo sin número", design: { ...completo, site: undefined } })
      .map((x) => x.clave)).toContain("sin-sitio");
  });

  it("una cartera vacía no reporta nada", () => {
    expect(resumenCartera([])).toEqual({ impiden: 0, estiman: 0, listos: 0 });
  });
});
