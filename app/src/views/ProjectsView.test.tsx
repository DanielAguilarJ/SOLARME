// @vitest-environment happy-dom
/**
 * La cartera de proyectos, y en concreto el estado del embudo.
 *
 * Por qué existe: `status` solo se escribía como «borrador» al crear el proyecto y nada en la app
 * podía cambiarlo. Aun así la vista tenía pestañas «Propuestas» y «Ganados», sus contadores y una
 * insignia de tres colores. O sea que el instalador veía dos filtros que siempre estarían vacíos y
 * no podía marcar un trabajo ganado, que es justo para lo que sirve una cartera.
 *
 * Se encontró buscando valores que la interfaz CONSUME y la app nunca PRODUCE, que es la firma
 * común de los defectos de cableado de esta sesión.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProjectsView from "./ProjectsView";
import { CITIES, type Design, type Panel } from "../lib/solar";
import type { Project } from "../lib/storage";
import panelsJson from "../data/panels.json";
import { enrichPanels } from "../lib/price";

const panels = enrichPanels(panelsJson.panels as unknown as Panel[]);
const cdmx = CITIES["cdmx"];

const diseno: Design = {
  panel: panels[0], type: "res", area: 40, tilt: 15, az: 180, shade: 5,
  lat: cdmx.lat, lng: cdmx.lng, yield: cdmx.yield, site: cdmx.site,
};

const proyecto = (id: string, address: string, status: Project["status"]): Project =>
  ({ id, address, city: "Ciudad de México", design: diseno, createdAt: 1, status });

const LISTA: Project[] = [
  proyecto("a", "Av. Uno 1", "borrador"),
  proyecto("b", "Av. Dos 2", "propuesta"),
  proyecto("c", "Av. Tres 3", "ganado"),
];

function pintar(projects = LISTA, extra: Partial<Record<"onOpen" | "onStatus", unknown>> = {}) {
  const onStatus = (extra.onStatus as ReturnType<typeof vi.fn>) ?? vi.fn();
  const onOpen = (extra.onOpen as ReturnType<typeof vi.fn>) ?? vi.fn();
  const r = render(
    <ProjectsView
      projects={projects}
      onOpen={onOpen}
      onDelete={() => {}}
      onStatus={onStatus}
      onNew={() => {}}
      onImport={() => ({ agregados: 0, repetidos: 0 })}
    />,
  );
  return { ...r, onStatus, onOpen };
}

afterEach(() => cleanup());

describe("el estado del embudo se puede cambiar", () => {
  // Cada proyecto trae DOS controles de estado, uno para escritorio (columna ESTADO) y otro para
  // teléfono (dentro de la celda de domicilio), porque la columna es `hidden md:table-cell` y en
  // móvil desaparecía la única forma de mover un proyecto por el embudo. En un navegador real solo
  // uno se ve por ancho; en jsdom no hay CSS, así que se renderizan los dos.
  it("cada proyecto trae un control con las tres etapas, en escritorio y en móvil", () => {
    pintar();
    const sel = screen.getAllByLabelText(/^Estado de /);
    expect(sel).toHaveLength(LISTA.length * 2);
    for (const s of sel) {
      // Si faltara una etapa, ese filtro de arriba no podría llenarse nunca.
      expect((s as HTMLSelectElement).options).toHaveLength(3);
    }
  });

  it("el control refleja el estado real de cada proyecto", () => {
    pintar();
    // Los dos controles de un proyecto reflejan el mismo valor: se comprueba el primero.
    const valor = (dir: string) =>
      (screen.getAllByLabelText(`Estado de ${dir}`)[0] as HTMLSelectElement).value;
    expect(valor("Av. Uno 1")).toBe("borrador");
    expect(valor("Av. Dos 2")).toBe("propuesta");
    expect(valor("Av. Tres 3")).toBe("ganado");
  });

  it("cambiarlo avisa con el id y la etapa nueva", () => {
    const onStatus = vi.fn();
    pintar(LISTA, { onStatus });
    // `fireEvent` envuelve el evento en `act`, así que React llega a re-renderizar antes de
    // comprobar. Con un `dispatchEvent` a pelo la aserción corre antes del render.
    // Cualquiera de los dos controles del proyecto dispara el mismo aviso; se usa el primero.
    fireEvent.change(screen.getAllByLabelText("Estado de Av. Uno 1")[0], { target: { value: "ganado" } });
    expect(onStatus).toHaveBeenCalledWith("a", "ganado");
  });

  it("tocar el control no abre el proyecto", () => {
    // El renglón entero es clicable para abrir el proyecto: sin detener la propagación, marcar un
    // trabajo ganado te saca de la cartera a la pantalla de análisis.
    const onOpen = vi.fn();
    pintar(LISTA, { onOpen });
    fireEvent.click(screen.getAllByLabelText("Estado de Av. Dos 2")[0]);
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("los filtros de la cartera ya pueden llenarse", () => {
  it("las tres etapas existen como filtro", () => {
    const { container } = pintar();
    const texto = container.textContent ?? "";
    // Antes esto era decorativo: con `status` congelado en «borrador», Propuestas y Ganados
    // mostraban cero para siempre.
    for (const t of [/Borradores/, /Propuestas/, /Ganados/]) expect(texto).toMatch(t);
  });

  it("filtrar por «Ganados» deja solo el proyecto ganado", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Ganados/ }));
    expect(screen.queryAllByLabelText("Estado de Av. Tres 3").length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText("Estado de Av. Uno 1")).toHaveLength(0);
    expect(screen.queryAllByLabelText("Estado de Av. Dos 2")).toHaveLength(0);
  });
});
