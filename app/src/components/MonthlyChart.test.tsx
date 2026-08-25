// @vitest-environment happy-dom
/**
 * Pruebas de componente del gráfico mensual.
 *
 * Por qué existe: la guarda de `estilos.test.ts` exige ver escrito `repartirEnteros(...)` en la
 * fuente. Eso fija la forma de la llamada, no el resultado. Aquí se comprueba la propiedad que le
 * importa a quien mira la pantalla: **los doce valores mostrados suman el anual del titular**.
 *
 * La cifra se lee del NOMBRE ACCESIBLE de cada barra, no de una clase CSS: así la prueba no se ata
 * a la maquetación, y de paso comprueba que el dato existe para quien no ve el dibujo.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import MonthlyChart from "./MonthlyChart";
import { SITES } from "../lib/site";

/** Deshace el formato de `es-MX` (separador de miles con coma). */
function aNumero(texto: string): number {
  const n = Number(texto.replace(/[^\d-]/g, ""));
  expect(Number.isFinite(n), `no se pudo leer un número de «${texto}»`).toBe(true);
  return n;
}

/** Los kWh de cada mes, tal y como los anuncia la interfaz. */
function mesesEnPantalla(): number[] {
  const barras = screen.getAllByLabelText(/kWh$/);
  expect(barras, "el gráfico debe anunciar los doce meses").toHaveLength(12);
  return barras.map((b) => aNumero(b.getAttribute("aria-label")!.split(":")[1]));
}

/** El anual del titular. */
function anualEnPantalla(): number {
  return aNumero(screen.getByText(/kWh\/año$/).textContent!);
}

afterEach(() => cleanup());

// La muestra se elige aquí, sin aserciones: una comprobación en el cuerpo de `describe` corre al
// recolectar y no es una prueba —es la misma clase de defecto que vengo persiguiendo, una aserción
// en el sitio equivocado—. El suelo del catálogo se exige abajo, en su propio `it`.
const claves = Object.keys(SITES);
const muestra = [claves[0], claves[Math.floor(claves.length / 2)], claves[claves.length - 1]];

describe("el gráfico mensual cuadra con su propio titular", () => {
  it("hay catálogo de sitios que recorrer", () => {
    // Sin esto, un catálogo vacío dejaría la muestra llena de `undefined` y las pruebas de abajo
    // pasarían por el camino del perfil promedio, comprobando otra cosa de la que dicen.
    expect(claves.length).toBeGreaterThanOrEqual(90);
    for (const clave of muestra) expect(SITES[clave], clave).toBeTruthy();
  });

  for (const clave of muestra) {
    for (const anual of [8_450, 17_777, 49_659]) {
      it(`los doce meses suman el anual en ${clave} con ${anual} kWh`, () => {
        render(<MonthlyChart annualKwh={anual} site={SITES[clave]} />);

        const meses = mesesEnPantalla();
        const suma = meses.reduce((a, b) => a + b, 0);

        // Ésta es la prueba. Redondear cada mes por su cuenta falla aquí en el 59.5 % de los
        // perfiles: quien sume las doce barras tiene que obtener el número del titular.
        expect(suma, `los meses suman ${suma} y el titular dice ${anualEnPantalla()}`)
          .toBe(anualEnPantalla());
      });
    }
  }

  it("también cuadra sin sitio medido, con el perfil promedio", () => {
    render(<MonthlyChart annualKwh={12_345} />);
    const suma = mesesEnPantalla().reduce((a, b) => a + b, 0);
    expect(suma).toBe(anualEnPantalla());
  });
});

describe("el dato de cada mes existe para quien no ve el dibujo", () => {
  it("las doce barras se anuncian con su mes y su cifra", () => {
    render(<MonthlyChart annualKwh={20_000} site={SITES[muestra[0]]} />);

    const barras = screen.getAllByLabelText(/kWh$/);
    for (const barra of barras) {
      // El número visible vive en un tooltip de hover, que no existe en táctil ni para un lector de
      // pantalla. `role="img"` con nombre es lo que hace que el dato siga estando.
      expect(barra.getAttribute("role"), "la barra debe anunciarse como gráfico").toBe("img");
      expect(barra.getAttribute("aria-label")).toMatch(/^\S+: [\d,]+ kWh$/);
      // Y no debe fingir que se puede activar: no hace nada al pulsarla.
      expect(barra.getAttribute("tabindex")).toBeNull();
    }
  });

  it("el número que se ve y el que se anuncia son el MISMO", () => {
    render(<MonthlyChart annualKwh={49_659} site={SITES[muestra[0]]} />);

    // Encontrado por mutación: se puede repartir bien el nombre accesible y dejar el tooltip
    // visible con el redondeo viejo. Entonces quien mira la pantalla y quien usa un lector oyen
    // cifras distintas del mismo mes, y las doce que se ven no suman el titular. Leer sólo la
    // etiqueta no lo detecta: es otra vez la aserción mirando el sitio equivocado.
    for (const barra of screen.getAllByLabelText(/kWh$/)) {
      const anunciado = barra.getAttribute("aria-label")!.split(":")[1].replace(" kWh", "").trim();
      const visible = (barra.textContent ?? "").replace(/[^\d,]/g, "");
      expect(visible, `la barra ${barra.getAttribute("aria-label")} muestra «${visible}»`)
        .toBe(anunciado);
    }
  });

  it("pico, mínimo y amplitud se leen sin hover, que es lo que salva el táctil", () => {
    render(<MonthlyChart annualKwh={20_000} site={SITES[muestra[0]]} />);
    for (const etiqueta of [/^Pico/, /^Mínimo/, /^Amplitud/]) {
      expect(screen.getByText(etiqueta), String(etiqueta)).toBeTruthy();
    }
  });
});

describe("el gráfico declara de dónde sale la forma mensual", () => {
  it("dice «medido» y nombra la ciudad cuando hay medición", () => {
    const clave = muestra[0];
    render(<MonthlyChart annualKwh={10_000} site={SITES[clave]} />);
    expect(screen.getByText("medido")).toBeTruthy();
    expect(screen.getByText(new RegExp(`Medida en ${SITES[clave].nombre}`))).toBeTruthy();
  });

  it("dice «estimado» y no finge una medición cuando no hay sitio", () => {
    render(<MonthlyChart annualKwh={10_000} />);
    expect(screen.getByText("estimado")).toBeTruthy();
    expect(screen.queryByText("medido")).toBeNull();
  });
});
