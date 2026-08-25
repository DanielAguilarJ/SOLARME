// @vitest-environment happy-dom
/**
 * El diálogo con el que empieza todo.
 *
 * Es la puerta de entrada: sin esto no hay análisis, ni propuesta, ni nada. Y es el sitio donde el
 * instalador teclea una dirección de pie en la calle, así que lo que se prueba no es solo que
 * funcione con el ratón: que el teclado la maneje entera, que Escape cierre desde donde sea, que el
 * foco no se escape del diálogo y que vuelva a donde estaba al cerrar.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NewAnalysisDialog from "./NewAnalysisDialog";

afterEach(cleanup);

const abrir = () => {
  // los espías se crean aquí y se devuelven tipados: si el ayudante aceptara manejadores de fuera,
  // su tipo sería la unión de espía y función y las pruebas no podrían leer `mock.calls`
  const onSubmit = vi.fn<(address: string) => void>();
  const onClose = vi.fn<() => void>();
  const utils = render(<NewAnalysisDialog open onClose={onClose} onSubmit={onSubmit} />);
  return { ...utils, onSubmit, onClose };
};

const campo = () => screen.getByLabelText(/Dirección del domicilio/);

describe("el diálogo de nuevo análisis", () => {
  it("cerrado no pinta nada", () => {
    render(<NewAnalysisDialog open={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("se anuncia como diálogo modal", () => {
    abrir();
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  });

  it("ofrece las ciudades medidas antes de escribir nada", () => {
    abrir();
    // el instalador que no conoce la herramienta ve de entrada qué sabe la aplicación
    expect(screen.getByText(/CIUDADES CON DATOS DE IRRADIACIÓN/)).toBeTruthy();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });

  it("filtra por la última parte de la dirección, que es donde va la ciudad", () => {
    // quien escribe «Av. Vasconcelos 800, Monterrey» espera que reconozca Monterrey, no la calle
    abrir();
    fireEvent.change(campo(), { target: { value: "Av. Vasconcelos 800, Monterrey" } });
    const opciones = screen.getAllByRole("option");
    expect(opciones).toHaveLength(1);
    expect(opciones[0].textContent).toMatch(/Monterrey/);
  });

  it("entrega la dirección completa, no solo la ciudad reconocida", () => {
    const { onSubmit } = abrir();
    fireEvent.change(campo(), { target: { value: "Av. Vasconcelos 800, Monterrey" } });
    fireEvent.click(screen.getByRole("button", { name: /Analizar/ }));
    expect(onSubmit).toHaveBeenCalledWith("Av. Vasconcelos 800, Monterrey");
  });

  it("con el campo vacío no analiza nada", () => {
    const { onSubmit } = abrir();
    fireEvent.change(campo(), { target: { value: "   " } });
    const boton = screen.getByRole("button", { name: /Analizar/ });
    fireEvent.click(boton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cierra con Escape estando el foco en el campo", () => {
    const { onClose } = abrir();
    fireEvent.keyDown(campo(), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("cierra con Escape también con el foco fuera del campo", () => {
    // el manejador vive en el diálogo entero: antes estaba en el campo, y al pasar el foco a una
    // sugerencia o al botón, Escape dejaba de cerrar
    const { onClose } = abrir();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("al elegir una ciudad de la lista se puede analizar de inmediato", () => {
    const { onSubmit } = abrir();
    fireEvent.click(screen.getAllByRole("option")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Analizar/ }));
    expect(onSubmit).toHaveBeenCalled();
    expect(String(onSubmit.mock.calls[0][0]).length).toBeGreaterThan(0);
  });

  it("una dirección de una ciudad sin datos lo dice en vez de fingir", () => {
    abrir();
    fireEvent.change(campo(), { target: { value: "Calle 5, Villa Inexistente" } });
    // no hay coincidencia ni sugerencias: la aplicación lo declara
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("dialog").textContent).toMatch(/sin datos|más cercana|promedio/i);
  });

  it("devuelve el foco al botón que lo abrió", () => {
    // quien navega con teclado quedaba tirado al inicio del documento al cerrar
    const disparador = document.createElement("button");
    disparador.textContent = "Nuevo análisis";
    document.body.appendChild(disparador);
    disparador.focus();
    const { unmount } = render(<NewAnalysisDialog open onClose={vi.fn()} onSubmit={vi.fn()} />);
    unmount();
    expect(document.activeElement).toBe(disparador);
    disparador.remove();
  });
});
