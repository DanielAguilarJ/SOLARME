// @vitest-environment happy-dom
/**
 * Los precios por marca de módulo.
 *
 * Es el otro sitio donde el instalador mete dinero suyo: lo que de verdad le cuesta el watt de cada
 * marca, en lugar de la referencia de mercado. De aquí sale el renglón de módulos del desglose y la
 * diferencia entre una cotización y un orden de magnitud, así que la propuesta declara cuál de las
 * dos cosas está mostrando.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CostCapture from "./CostCapture";
import { MAX_QUOTE, MIN_QUOTE, type Quotes } from "../lib/quotes";
import { enrichPanels } from "../lib/price";
import type { Panel } from "../lib/solar";
import catalogo from "../data/panels.json";

const panels: Panel[] = enrichPanels(
  (catalogo as { panels: unknown[] }).panels as Panel[],
) as Panel[];

const marca = panels[0].brand;

const pintar = (quotes: Quotes = {}) => {
  const onSet = vi.fn();
  const onClear = vi.fn();
  const onClearAll = vi.fn();
  render(
    <CostCapture
      panels={panels}
      quotes={quotes}
      onSet={onSet}
      onClear={onClear}
      onClearAll={onClearAll}
    />,
  );
  return { onSet, onClear, onClearAll };
};

const campo = (b = marca) => screen.getByLabelText(new RegExp(`Costo por watt de ${b}`)) as HTMLInputElement;

afterEach(cleanup);

describe("capturar el costo de una marca", () => {
  it("guarda al salir del campo", () => {
    const { onSet } = pintar();
    fireEvent.change(campo(), { target: { value: "4.80" } });
    fireEvent.blur(campo());
    expect(onSet).toHaveBeenCalledWith(marca, 4.8);
  });

  it("guarda con Enter", () => {
    const { onSet } = pintar();
    fireEvent.change(campo(), { target: { value: "5.10" } });
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(onSet).toHaveBeenCalledWith(marca, 5.1);
  });

  it("acepta coma decimal", () => {
    const { onSet } = pintar();
    fireEvent.change(campo(), { target: { value: "4,25" } });
    fireEvent.blur(campo());
    expect(onSet).toHaveBeenCalledWith(marca, 4.25);
  });

  it("vaciar el campo devuelve la marca a la referencia de mercado", () => {
    const { onClear, onSet } = pintar({ [marca.toLowerCase()]: 4.8 });
    fireEvent.change(campo(), { target: { value: "" } });
    fireEvent.blur(campo());
    expect(onClear).toHaveBeenCalledWith(marca);
    expect(onSet).not.toHaveBeenCalled();
  });

  it("un precio fuera de la banda no se guarda", () => {
    // 999 MXN/Wp no es un costo: entraría en el desglose de cada propuesta de esa marca
    const { onSet, onClear } = pintar();
    fireEvent.change(campo(), { target: { value: "999" } });
    fireEvent.blur(campo());
    expect(onSet).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("el campo declara la banda que admite, para que el navegador lo marque", () => {
    pintar();
    expect(campo().getAttribute("min")).toBe(String(MIN_QUOTE));
    expect(campo().getAttribute("max")).toBe(String(MAX_QUOTE));
  });

  it("sin precio propio, el hueco muestra la referencia de esa marca", () => {
    pintar();
    const referencia = Number(campo().getAttribute("placeholder"));
    expect(referencia).toBeGreaterThan(0);
    expect(campo().value).toBe("");
  });

  it("con precio propio, el campo lo muestra", () => {
    pintar({ [marca.toLowerCase()]: 4.8 });
    expect(campo().value).toBe("4.8");
  });
});

describe("la cuenta de marcas cotizadas", () => {
  it("sin ninguna no anuncia nada", () => {
    pintar();
    expect(screen.queryByText(/cotizada/)).toBeNull();
  });

  it("con una lo dice en singular", () => {
    pintar({ [marca.toLowerCase()]: 4.8 });
    expect(screen.getByText(/1 cotizada/)).toBeTruthy();
  });

  it("con varias, en plural", () => {
    const dos = panels.find((p) => p.brand !== marca)!.brand.toLowerCase();
    pintar({ [marca.toLowerCase()]: 4.8, [dos]: 5.1 });
    expect(screen.getByText(/2 cotizadas/)).toBeTruthy();
  });
});
