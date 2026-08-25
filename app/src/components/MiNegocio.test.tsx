// @vitest-environment happy-dom
/**
 * La pantalla «Mi negocio».
 *
 * Es un formulario corto, y lo que hay que probar no es que guarde texto: es que diga la verdad
 * sobre lo que falta y sobre lo que se guardó. Un formulario que dice «Guardado» cuando el
 * almacenamiento rechazó la escritura le hace creer al instalador que su identidad ya está en las
 * propuestas que va a entregar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MiNegocio from "./MiNegocio";
import { _olvidarNegocio, leerNegocio } from "../lib/negocio";

beforeEach(() => {
  localStorage.clear();
  _olvidarNegocio();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  _olvidarNegocio();
});

const escribir = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByPlaceholderText(etiqueta), { target: { value: valor } });

describe("Mi negocio", () => {
  it("guarda lo que se escribe y lo deja disponible para la propuesta", () => {
    render(<MiNegocio onClose={() => undefined} />);
    escribir(/Solar del Bajío/, "Solar Norte S.A.");
    escribir(/477 123 4567/, "81 1234 5678");
    fireEvent.click(screen.getByText("Guardar"));
    expect(leerNegocio().nombre).toBe("Solar Norte S.A.");
    expect(leerNegocio().telefono).toBe("81 1234 5678");
  });

  it("confirma el guardado en el propio botón", () => {
    render(<MiNegocio onClose={() => undefined} />);
    escribir(/Solar del Bajío/, "Solar Norte");
    fireEvent.click(screen.getByText("Guardar"));
    expect(screen.getByText("Guardado")).toBeTruthy();
  });

  it("si el almacenamiento rechaza la escritura lo dice, en vez de confirmar", () => {
    const original = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    render(<MiNegocio onClose={() => undefined} />);
    escribir(/Solar del Bajío/, "Solar Norte");
    fireEvent.click(screen.getByText("Guardar"));
    expect(screen.getByText(/No se pudo guardar/)).toBeTruthy();
    expect(screen.queryByText("Guardado")).toBeNull();
    localStorage.setItem = original;
  });

  it("dice qué falta para que el aviso de privacidad quede completo", () => {
    render(<MiNegocio onClose={() => undefined} />);
    expect(screen.getByText(/faltan: nombre o razón social, domicilio y teléfono o correo/)).toBeTruthy();
  });

  it("el aviso de lo que falta se actualiza al escribir, sin guardar", () => {
    render(<MiNegocio onClose={() => undefined} />);
    escribir(/Solar del Bajío/, "Solar Norte");
    escribir(/Av. López Mateos/, "Calle 5, Monterrey");
    // ya solo falta el contacto
    expect(screen.getByText(/falta el teléfono o correo/)).toBeTruthy();
  });

  it("con todo puesto no queda ninguna advertencia", () => {
    render(<MiNegocio onClose={() => undefined} />);
    escribir(/Solar del Bajío/, "Solar Norte");
    escribir(/Av. López Mateos/, "Calle 5, Monterrey");
    escribir(/contacto@tunegocio/, "hola@solarnorte.mx");
    expect(screen.queryByText(/Para que el aviso de privacidad/)).toBeNull();
  });

  it("dice que los datos se quedan en este navegador", () => {
    // es la misma verdad que el pie de la barra lateral: no hay servidor donde guardarlos
    render(<MiNegocio onClose={() => undefined} />);
    expect(screen.getByText(/Se guarda en este navegador/)).toBeTruthy();
  });

  it("se cierra con Escape y con la X, y se anuncia como diálogo", () => {
    const onClose = vi.fn();
    render(<MiNegocio onClose={onClose} />);
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    fireEvent.click(screen.getByLabelText("Cerrar"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
