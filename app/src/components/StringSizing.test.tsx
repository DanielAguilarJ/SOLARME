// @vitest-environment happy-dom
/**
 * El dimensionado de series y el conductor.
 *
 * Lo que se prueba aquí es el campo de los metros hasta el inversor, porque de ese número sale el
 * calibre del cable y la caída de tensión. Estaba atado directamente al cálculo: borrar «15» para
 * escribir «40» dejaba el campo en «1» —el mínimo— y el instalador acababa escribiendo «140».
 *
 * El resto del contenido de esta pantalla sale de `strings`, `conductor` y `ocpd`, que tienen sus
 * propias pruebas sobre la física; aquí se comprueba que la pantalla lo presenta y que no promete lo
 * que no puede.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import StringSizing from "./StringSizing";
import { CITIES, compute, type Design, type Panel } from "../lib/solar";

const panel: Panel = {
  brand: "Test", model: "T-550", w: 550, eff: 21.3, temp: -0.34, area: 2.58,
  voc: 49.9, vmp: 41.8, isc: 14.0, imp: 13.2, betaVoc: -0.125, ppw: 5.2,
  priceOrigin: "banda", warr: 25,
};

const ciudad = CITIES.guadalajara;
const design: Design = {
  site: ciudad.site, lat: ciudad.lat, lng: ciudad.lng, yield: ciudad.yield,
  area: 60, tilt: 24, az: 180, shade: 0, type: "res", panel,
};
const r = compute(design);

const pintar = (onMetros = vi.fn(), metros = 15) => {
  render(
    <StringSizing
      strings={r.strings}
      ventana={r.ventana}
      inversor={r.inversor}
      site={ciudad.site}
      kwp={r.kwp}
      onVentana={vi.fn()}
      circuito={r.circuito}
      metros={metros}
      onMetros={onMetros}
      responsables={[]}
      onResponsable={vi.fn()}
    />,
  );
  return onMetros;
};

const campo = () => screen.getByLabelText(/Metros de una vía/) as HTMLInputElement;

afterEach(cleanup);

describe("los metros hasta el inversor", () => {
  it("muestra el valor vigente", () => {
    pintar(vi.fn(), 22);
    expect(campo().value).toBe("22");
  });

  it("se puede borrar para escribir otro número sin saltar al mínimo", () => {
    // atado al cálculo, borrar «15» dejaba «1» de golpe y se acababa escribiendo «140»
    const onMetros = pintar();
    fireEvent.change(campo(), { target: { value: "" } });
    expect(campo().value).toBe("");
    expect(onMetros).not.toHaveBeenCalled();
    fireEvent.change(campo(), { target: { value: "40" } });
    fireEvent.blur(campo());
    expect(onMetros).toHaveBeenCalledWith(40);
  });

  it("confirma con Enter", () => {
    const onMetros = pintar();
    fireEvent.change(campo(), { target: { value: "28" } });
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(onMetros).toHaveBeenCalledWith(28);
  });

  it("no recalcula en cada pulsación, solo al confirmar", () => {
    // cada cambio rehace el conductor y la protección: hacerlo por tecla se nota en un teléfono
    const onMetros = pintar();
    fireEvent.change(campo(), { target: { value: "4" } });
    fireEvent.change(campo(), { target: { value: "40" } });
    expect(onMetros).not.toHaveBeenCalled();
    fireEvent.blur(campo());
    expect(onMetros).toHaveBeenCalledTimes(1);
  });

  it("acepta coma decimal, como los otros campos numéricos", () => {
    const onMetros = pintar();
    fireEvent.change(campo(), { target: { value: "12,5" } });
    fireEvent.blur(campo());
    expect(onMetros).toHaveBeenCalledWith(13);
  });

  it("un campo vacío o un texto dejan el valor anterior, sin saltar al mínimo", () => {
    const onMetros = pintar(vi.fn(), 15);
    fireEvent.change(campo(), { target: { value: "" } });
    fireEvent.blur(campo());
    expect(onMetros).not.toHaveBeenCalled();
    expect(campo().value).toBe("15");

    fireEvent.change(campo(), { target: { value: "lejos" } });
    fireEvent.blur(campo());
    expect(onMetros).not.toHaveBeenCalled();
  });

  it("acota a la banda que el cálculo admite", () => {
    const onMetros = pintar();
    fireEvent.change(campo(), { target: { value: "9000" } });
    fireEvent.blur(campo());
    expect(onMetros).toHaveBeenCalledWith(500);
  });

  it("con Escape se descarta lo tecleado", () => {
    const onMetros = pintar(vi.fn(), 15);
    fireEvent.change(campo(), { target: { value: "77" } });
    fireEvent.keyDown(campo(), { key: "Escape" });
    expect(campo().value).toBe("15");
    expect(onMetros).not.toHaveBeenCalled();
  });
});

describe("lo que la pantalla declara", () => {
  it("dice que usa la mañana más fría medida, no un promedio", () => {
    pintar();
    expect(screen.getByText(/más fría medida/)).toBeTruthy();
  });

  it("sin responsable asignado lo declara y dice qué hará la propuesta", () => {
    // el desplegable de responsables solo aparece si hay electricistas en la libreta: con la libreta
    // vacía, esta pantalla no puede ofrecer a nadie
    render(
      <StringSizing
        strings={r.strings} ventana={r.ventana} inversor={r.inversor} site={ciudad.site}
        kwp={r.kwp} onVentana={vi.fn()} circuito={r.circuito} metros={15} onMetros={vi.fn()}
        responsables={[{
          id: "c1", nombre: "Ing. Ana Ruiz", rol: "electricista", creadoEn: 1,
          registro: "CFE-UV-2024-118",
        }]}
        onResponsable={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Electricista responsable/)).toBeTruthy();
    expect(screen.getByText(/La propuesta lo dirá en lugar de imprimir un hueco/)).toBeTruthy();
  });
});
