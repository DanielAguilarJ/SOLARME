// @vitest-environment happy-dom
/**
 * Pruebas del límite de error.
 *
 * Por qué existen: todo el trabajo del instalador vive en el navegador. Sin el límite, un fallo
 * de renderizado deja la página EN BLANCO, y el instalador no ve un error sino que su cartera
 * desapareció —en casa de un cliente— sin forma de recuperarla desde la interfaz.
 *
 * Las pruebas usan un componente que falla DE VERDAD al renderizar, no un espía: lo que se está
 * comprobando es precisamente que React entregue el error al límite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Explota(): never {
  throw new Error("fallo de prueba en el renderizado");
}

let errores: unknown[][];

beforeEach(() => {
  errores = [];
  // React imprime el error por su cuenta; se silencia para que la salida de la suite sea legible,
  // pero se guarda para poder afirmar que el límite SÍ registra el fallo.
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    errores.push(a);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("el límite de error no deja la pantalla en blanco", () => {
  it("con un fallo real muestra la explicación en vez de nada", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Explota />
      </ErrorBoundary>
    );
    expect(getByText(/Algo se rompió en la pantalla/)).toBeTruthy();
  });

  it("dice que el trabajo NO se perdió, porque es verdad", () => {
    // El fallo es de la interfaz; el almacén del navegador sigue intacto. Decirlo es la
    // diferencia entre un susto y creer que se borró la cartera.
    const { getByText } = render(
      <ErrorBoundary>
        <Explota />
      </ErrorBoundary>
    );
    expect(getByText(/Tu trabajo no se perdió/)).toBeTruthy();
    expect(getByText(/siguen guardados en este navegador/)).toBeTruthy();
  });

  it("ofrece descargar una copia sin pasar por la vista que falló", () => {
    const { getByRole } = render(
      <ErrorBoundary>
        <Explota />
      </ErrorBoundary>
    );
    const boton = getByRole("button", { name: /Descargar una copia/ });

    // Se comprueba que la descarga se dispara de verdad: sin esto el botón sería decorativo.
    const clics: string[] = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clics.push(this.download);
    };
    const urlOriginal = URL.createObjectURL;
    URL.createObjectURL = () => "blob:prueba";
    URL.revokeObjectURL = () => undefined;

    try {
      fireEvent.click(boton);
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
      URL.createObjectURL = urlOriginal;
    }

    expect(clics).toHaveLength(1);
    expect(clics[0]).toMatch(/\.json$/);
  });

  it("deja volver a intentar sin recargar", () => {
    // El caso más común es un estado concreto que rompe una vista, no la aplicación entera.
    let debeFallar = true;
    function AVeces() {
      if (debeFallar) throw new Error("solo la primera vez");
      return <p>contenido recuperado</p>;
    }

    const { getByRole, getByText } = render(
      <ErrorBoundary>
        <AVeces />
      </ErrorBoundary>
    );
    expect(getByText(/Algo se rompió/)).toBeTruthy();

    debeFallar = false;
    fireEvent.click(getByRole("button", { name: /Volver a intentar/ }));
    expect(getByText(/contenido recuperado/)).toBeTruthy();
  });

  it("registra el fallo para poder diagnosticarlo", () => {
    render(
      <ErrorBoundary>
        <Explota />
      </ErrorBoundary>
    );
    const propio = errores.filter((a) => String(a[0]).includes("SolarMe: fallo de interfaz"));
    expect(propio.length).toBeGreaterThan(0);
  });

  it("sin fallo no se interpone: pinta lo que envuelve", () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <p>la aplicación normal</p>
      </ErrorBoundary>
    );
    expect(getByText(/la aplicación normal/)).toBeTruthy();
    expect(queryByText(/Algo se rompió/)).toBeNull();
  });
});
