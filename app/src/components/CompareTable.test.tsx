// @vitest-environment happy-dom
/**
 * La tabla de comparación de módulos.
 *
 * Por qué existe esta prueba: el valor se imprimía crudo (`r.get(p)`) y el trofeo del «mejor» se
 * decidía sobre ese mismo crudo. Hoy coinciden por casualidad, pero dos módulos con coeficiente
 * −0.256 y −0.264 se mostrarían como «-0.256» y «-0.264» —no la cifra limpia que ve el
 * instalador— y, peor, dos que en pantalla se ven IGUALES podrían llevar un solo trofeo. La regla
 * honesta es comparar por lo que se muestra.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import CompareTable from "./CompareTable";
import type { Panel } from "../lib/solar";

function panel(over: Partial<Panel>): Panel {
  return {
    brand: "Marca", model: "M", w: 550, eff: 21, temp: -0.3, area: 2.5,
    voc: 50, vmp: 42, isc: 14, imp: 13, betaVoc: -0.25, tech: "mono",
    bifacial: false, class: "std", warr: null, ppw: 5, priceOrigin: "banda",
    ...over,
  } as Panel;
}

afterEach(() => cleanup());

describe("el modal se cierra con teclado y se anuncia como diálogo", () => {
  // Los otros modales de la app (análisis, paleta) cierran con Escape y llevan role="dialog".
  // Éste era el único que no: quien navega con teclado quedaba atrapado sin salida.
  const dos = [panel({ model: "A" }), panel({ model: "B", w: 600 })];

  it("Escape lo cierra", () => {
    const onClose = vi.fn();
    render(<CompareTable panels={dos} onClose={onClose} onRemove={() => undefined} onPick={() => undefined} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("tocar el fondo lo cierra, tocar el contenido no", () => {
    const onClose = vi.fn();
    const { getByRole, getByText } = render(
      <CompareTable panels={dos} onClose={onClose} onRemove={() => undefined} onPick={() => undefined} />
    );
    // El contenido no debe cerrar.
    fireEvent.click(getByText(/Comparación de módulos/));
    expect(onClose).not.toHaveBeenCalled();
    // El fondo (el propio diálogo) sí.
    fireEvent.click(getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("se anuncia como diálogo modal", () => {
    const { getByRole } = render(
      <CompareTable panels={dos} onClose={() => undefined} onRemove={() => undefined} onPick={() => undefined} />
    );
    const dlg = getByRole("dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.getAttribute("aria-label")).toMatch(/Comparación/);
  });
});

describe("el trofeo y el número mostrado cuentan la misma historia", () => {
  it("dos coeficientes que se redondean al mismo valor empatan: los dos llevan trofeo", () => {
    // −0.256 y −0.264 → ambos «-0.26». No puede haber un solo ganador de una fila que en pantalla
    // se ve idéntica.
    const { container } = render(
      <CompareTable
        panels={[
          panel({ model: "A", temp: -0.256 }),
          panel({ model: "B", temp: -0.264 }),
        ]}
        onClose={() => undefined}
        onRemove={() => undefined}
        onPick={() => undefined}
      />
    );
    const celdas = [...container.querySelectorAll("td")].filter((td) =>
      td.textContent?.includes("-0.26")
    );
    expect(celdas.length, "ambas celdas muestran -0.26").toBe(2);
    const conTrofeo = celdas.filter((td) => td.querySelector("svg"));
    expect(conTrofeo.length, "si se ven iguales, o las dos ganan o ninguna").toBe(2);
  });

  it("el número se muestra con los decimales de su magnitud, no crudo", () => {
    const { container } = render(
      <CompareTable
        panels={[panel({ model: "A", temp: -0.2561, eff: 21.04 })]}
        onClose={() => undefined}
        onRemove={() => undefined}
        onPick={() => undefined}
      />
    );
    const txt = container.textContent ?? "";
    // temp con 2 decimales, eficiencia con 1: nunca el crudo de cuatro cifras.
    expect(txt).toContain("-0.26");
    expect(txt).not.toContain("-0.2561");
    expect(txt).toContain("21.0");
    expect(txt).not.toContain("21.04");
  });

  it("una diferencia real sí corona a uno solo", () => {
    const { container } = render(
      <CompareTable
        panels={[panel({ model: "A", w: 550 }), panel({ model: "B", w: 600 })]}
        onClose={() => undefined}
        onRemove={() => undefined}
        onPick={() => undefined}
      />
    );
    // Fila de potencia: 600 gana, 550 no.
    const cel600 = [...container.querySelectorAll("td")].find((td) => td.textContent?.match(/^600/));
    const cel550 = [...container.querySelectorAll("td")].find((td) => td.textContent?.match(/^550/));
    expect(cel600?.querySelector("svg"), "600 W debe ganar").toBeTruthy();
    expect(cel550?.querySelector("svg"), "550 W no debe ganar").toBeFalsy();
  });
});
