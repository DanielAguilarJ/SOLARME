// @vitest-environment happy-dom
/**
 * El plano del techo.
 *
 * Es la parte más interactiva de la aplicación —se traza el contorno arrastrando vértices, se
 * insertan esquinas para una azotea en L, se colocan los estorbos— y no tenía pruebas propias: la
 * geometría estaba cubierta en `polygon` y `layout`, pero nada comprobaba que se pudiera USAR.
 *
 * Se prueba por teclado a propósito. Todo lo que se hace arrastrando tiene que poder hacerse sin
 * ratón, y aquí eso no es un requisito abstracto: el plano se maneja también en un teléfono, donde
 * un objetivo de 3 px es inalcanzable, y con teclado, donde hace falta ver DÓNDE está el foco. El
 * componente quitaba el contorno del navegador y lo sustituía por pasar de 5 a 7 px de radio, que
 * con varios vértices en pantalla no distingue nada.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RoofView from "./RoofView";
import { placeModules } from "../lib/layout";
import { rowSpacing } from "../lib/spacing";
import { panelDimensions } from "../lib/dims";
import type { Panel } from "../lib/solar";

const panel: Panel = {
  brand: "Test", model: "T-550", w: 550, eff: 21.3, temp: -0.34, area: 2.58,
  voc: 49.9, vmp: 41.8, isc: 14.0, imp: 13.2, betaVoc: -0.125, ppw: 5.2,
  priceOrigin: "banda", warr: 25,
};

const contorno = [
  { x: 0, y: 0 },
  { x: 8, y: 0 },
  { x: 8, y: 6 },
  { x: 0, y: 6 },
];

const dims = panelDimensions(panel.area);
const sp = rowSpacing({ lat: 20.66, tilt: 24, panelLength: dims.length });
const placement = placeModules({
  ancho: 8, fondo: 6, pitch: sp.pitch, footprint: sp.footprint,
  moduleWidth: dims.width, outline: contorno,
});

const props = {
  az: 180,
  layer: "sat" as const,
  side: 8,
  placement,
  obstacles: [],
  shade: 0,
  outline: contorno,
  outlineMedido: true,
};

afterEach(cleanup);

describe("los vértices del contorno se manejan con teclado", () => {
  it("cada vértice dice dónde está, en metros y en orientación", () => {
    render(<RoofView {...props} onMoveVertex={vi.fn()} />);
    // sin esto, quien usa un lector de pantalla no tiene ninguna referencia de la forma que traza
    expect(screen.getByLabelText(/Vértice 2 de 4, a 8.0 m al oriente y 0.0 m al norte/)).toBeTruthy();
  });

  it("las flechas mueven el vértice un paso fino", () => {
    const onMoveVertex = vi.fn();
    render(<RoofView {...props} onMoveVertex={onMoveVertex} />);
    fireEvent.keyDown(screen.getByLabelText(/Vértice 1 de 4/), { key: "ArrowRight" });
    expect(onMoveVertex).toHaveBeenCalledWith(0, 0.25, 0);
  });

  it("con Shift el paso es mayor, para recorrer distancias", () => {
    const onMoveVertex = vi.fn();
    render(<RoofView {...props} onMoveVertex={onMoveVertex} />);
    fireEvent.keyDown(screen.getByLabelText(/Vértice 1 de 4/), { key: "ArrowRight", shiftKey: true });
    expect(onMoveVertex).toHaveBeenCalledWith(0, 1, 0);
  });

  it("no deja salir del cuadrante: el plano empieza en cero", () => {
    const onMoveVertex = vi.fn();
    render(<RoofView {...props} onMoveVertex={onMoveVertex} />);
    fireEvent.keyDown(screen.getByLabelText(/Vértice 1 de 4/), { key: "ArrowLeft" });
    expect(onMoveVertex).toHaveBeenCalledWith(0, 0, 0);
  });

  it("Suprimir quita el vértice", () => {
    const onDeleteVertex = vi.fn();
    render(<RoofView {...props} onMoveVertex={vi.fn()} onDeleteVertex={onDeleteVertex} />);
    fireEvent.keyDown(screen.getByLabelText(/Vértice 3 de 4/), { key: "Delete" });
    expect(onDeleteVertex).toHaveBeenCalledWith(2);
  });

  it("con tres vértices ya no se puede quitar ninguno: no encerraría superficie", () => {
    const onDeleteVertex = vi.fn();
    const triangulo = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }];
    render(
      <RoofView {...props} outline={triangulo} onMoveVertex={vi.fn()} onDeleteVertex={onDeleteVertex} />,
    );
    fireEvent.keyDown(screen.getByLabelText(/Vértice 1 de 3/), { key: "Delete" });
    expect(onDeleteVertex).not.toHaveBeenCalled();
    // y la etiqueta no ofrece lo que no se puede hacer
    expect(screen.getByLabelText(/Vértice 1 de 3/).getAttribute("aria-label")).not.toMatch(/Suprimir/);
  });

  it("sin manejadores el plano es de solo lectura y no anuncia acciones", () => {
    render(<RoofView {...props} />);
    expect(screen.queryByLabelText(/Vértice 1 de 4/)).toBeNull();
  });
});

describe("se ve dónde está el foco", () => {
  /**
   * El componente pone `focus:outline-none`, así que el indicador tiene que ser propio. Antes era
   * pasar de 5 a 7 px de radio: un cambio que solo se nota comparando con los otros vértices.
   */
  const anillos = (c: HTMLElement) => c.querySelectorAll('circle[stroke-dasharray="3 2"]');

  it("un vértice enfocado se marca con un anillo, no solo con dos píxeles más", () => {
    const { container } = render(<RoofView {...props} onMoveVertex={vi.fn()} />);
    expect(anillos(container)).toHaveLength(0);
    fireEvent.focus(screen.getByLabelText(/Vértice 2 de 4/));
    expect(anillos(container)).toHaveLength(1);
  });

  it("al salir el foco el anillo desaparece", () => {
    const { container } = render(<RoofView {...props} onMoveVertex={vi.fn()} />);
    const v = screen.getByLabelText(/Vértice 2 de 4/);
    fireEvent.focus(v);
    fireEvent.blur(v);
    expect(anillos(container)).toHaveLength(0);
  });

  it("el punto para agregar una esquina también se marca", () => {
    const { container } = render(
      <RoofView {...props} onMoveVertex={vi.fn()} onAddVertex={vi.fn()} />,
    );
    fireEvent.focus(screen.getByLabelText(/Agregar un vértice en el lado 1/));
    expect(anillos(container)).toHaveLength(1);
  });
});

describe("el plano se puede tocar con un dedo", () => {
  it("cada vértice lleva un blanco táctil mucho mayor que su círculo visible", () => {
    // el círculo visible son unos 3 px reales en un teléfono: imposible de agarrar
    const { container } = render(<RoofView {...props} onMoveVertex={vi.fn()} />);
    const invisibles = [...container.querySelectorAll('circle[fill="transparent"]')];
    expect(invisibles.length).toBeGreaterThanOrEqual(contorno.length);
    for (const c of invisibles) {
      expect(Number(c.getAttribute("r"))).toBeGreaterThanOrEqual(16);
    }
  });
});
