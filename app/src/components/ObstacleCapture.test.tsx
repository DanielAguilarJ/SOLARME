// @vitest-environment happy-dom
/**
 * La captura de estorbos de la azotea.
 *
 * De aquí sale la sombra CALCULADA, que sustituye al deslizador que se adivinaba a ojo, y la sombra
 * decide cuántos módulos caben de verdad. Un tinaco no cuesta «un 10 %»: cuesta una superficie
 * concreta que depende de su altura, de dónde está y de la latitud.
 *
 * Se prueba sobre todo la entrada de la altura, porque el campo acepta texto libre: escribir «2,5»
 * con coma —como se escribe a mano en media hispanoamérica— daba NaN, y el botón no hacía nada ni
 * decía por qué.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ObstacleCapture from "./ObstacleCapture";
import { MAX_ALTURA, MIN_ALTURA, type Obstacle } from "../lib/shading";

afterEach(cleanup);

const pintar = (obstacles: Obstacle[] = [], onChange = vi.fn()) => {
  render(<ObstacleCapture areaM2={64} obstacles={obstacles} onChange={onChange} />);
  return onChange;
};

const altura = () => screen.getByLabelText(/Altura del estorbo en metros/);
const boton = () => screen.getByRole("button", { name: /Agregar|Escribe una altura/ });

describe("agregar un estorbo", () => {
  it("con la altura típica del tipo elegido, se agrega", () => {
    const onChange = pintar();
    fireEvent.click(boton());
    expect(onChange).toHaveBeenCalledTimes(1);
    const [lista] = onChange.mock.calls[0] as [Obstacle[]];
    expect(lista).toHaveLength(1);
    expect(lista[0].kind).toBe("tinaco");
    expect(lista[0].height).toBeGreaterThan(0);
  });

  it("acepta la altura escrita con coma decimal", () => {
    // «2,5» daba NaN y el botón no hacía nada: ni agregaba ni explicaba
    const onChange = pintar();
    fireEvent.change(altura(), { target: { value: "2,5" } });
    fireEvent.click(boton());
    const [lista] = onChange.mock.calls[0] as [Obstacle[]];
    expect(lista[0].height).toBe(2.5);
  });

  it("y también con punto, como se teclea en un teléfono", () => {
    const onChange = pintar();
    fireEvent.change(altura(), { target: { value: "1.8" } });
    fireEvent.click(boton());
    const [lista] = onChange.mock.calls[0] as [Obstacle[]];
    expect(lista[0].height).toBe(1.8);
  });

  it("una altura imposible no se agrega, y el botón dice qué hace falta", () => {
    const onChange = pintar();
    fireEvent.change(altura(), { target: { value: "80" } });
    const b = boton();
    expect(b.hasAttribute("disabled")).toBe(true);
    expect(b.textContent).toMatch(new RegExp(`entre ${MIN_ALTURA} y ${MAX_ALTURA} m`));
    fireEvent.click(b);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("un texto que no es un número tampoco pasa en silencio", () => {
    const onChange = pintar();
    fireEvent.change(altura(), { target: { value: "alto" } });
    expect(boton().hasAttribute("disabled")).toBe(true);
    fireEvent.click(boton());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("el campo vacío no se puede agregar", () => {
    pintar();
    fireEvent.change(altura(), { target: { value: "" } });
    expect(boton().hasAttribute("disabled")).toBe(true);
  });

  it("cambiar el tipo propone su altura típica", () => {
    pintar();
    const antes = (altura() as HTMLInputElement).value;
    fireEvent.click(screen.getByText("Árbol"));
    expect((altura() as HTMLInputElement).value).not.toBe(antes);
  });

  it("dos estorbos seguidos no comparten identificador", () => {
    // se agregaban con la hora en milisegundos: dos en el mismo milisegundo colisionaban, y el
    // identificador es lo que usa la lista para borrar y el plano para saber cuál se arrastra
    const onChange = vi.fn();
    const primero: Obstacle = {
      id: "tinaco-x", kind: "tinaco", height: 1.6, x: 4, y: 4, width: 1.2, depth: 1.2,
    };
    render(<ObstacleCapture areaM2={64} obstacles={[primero]} onChange={onChange} />);
    fireEvent.click(boton());
    const [lista] = onChange.mock.calls[0] as [Obstacle[]];
    expect(lista[1].id).not.toBe(primero.id);
  });

  it("el estorbo no puede ser más ancho que la azotea", () => {
    const onChange = vi.fn();
    render(<ObstacleCapture areaM2={1} obstacles={[]} onChange={onChange} />);
    fireEvent.click(boton());
    const [lista] = onChange.mock.calls[0] as [Obstacle[]];
    expect(lista[0].width).toBeLessThanOrEqual(1);
    expect(lista[0].depth).toBeLessThanOrEqual(1);
  });
});

describe("la lista de estorbos", () => {
  const tinaco: Obstacle = {
    id: "t1", kind: "tinaco", height: 1.6, x: 1.5, y: 1, width: 1.2, depth: 1.2,
  };

  it("cada uno se puede quitar", () => {
    const onChange = vi.fn();
    render(<ObstacleCapture areaM2={64} obstacles={[tinaco]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Quitar Tinaco/));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("sin estorbos declara que se usa el porcentaje estimado", () => {
    pintar();
    expect(screen.getByText(/Sin estorbos capturados se usa el porcentaje estimado/)).toBeTruthy();
  });

  it("dice qué es el norte, que en un plano sin foto no es obvio", () => {
    pintar();
    expect(screen.getByText(/Arriba es el norte/)).toBeTruthy();
  });
});
