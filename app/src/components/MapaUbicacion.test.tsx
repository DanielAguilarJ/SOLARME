// @vitest-environment happy-dom
/**
 * El mapa para confirmar el punto del techo.
 *
 * Existe porque solo 2 de cada 8 direcciones mexicanas caen en el edificio (medido); de ese punto
 * sale la física, así que el instalador tiene que poder corregirlo. Es agnóstico del proveedor:
 * sin fuente configurada NO pinta en blanco ni usa mosaicos indistribuibles, lo dice y deja
 * ajustar igual, porque corregir la coordenada no depende de ver la foto.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import MapaUbicacion from "./MapaUbicacion";

afterEach(() => cleanup());

describe("el mapa de ubicación funciona con y sin proveedor de imagen", () => {
  it("sin proveedor configurado lo dice y no finge una foto", () => {
    // Por defecto no hay VITE_TILE_URL, así que la fuente es null.
    const { getByText, container } = render(
      <MapaUbicacion lat={19.4326} lon={-99.1332} onConfirm={() => undefined} onCancel={() => undefined} />
    );
    expect(getByText(/Sin imagen de mapa configurada/)).toBeTruthy();
    // No debe haber intentado cargar ningún mosaico.
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("confirmar devuelve una coordenada", () => {
    const onConfirm = vi.fn();
    const { getByRole } = render(
      <MapaUbicacion lat={19.4326} lon={-99.1332} onConfirm={onConfirm} onCancel={() => undefined} />
    );
    fireEvent.click(getByRole("button", { name: /Usar este punto/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [lat, lon] = onConfirm.mock.calls[0];
    // Sin arrastrar, devuelve el punto de partida.
    expect(lat).toBeCloseTo(19.4326, 5);
    expect(lon).toBeCloseTo(-99.1332, 5);
  });

  it("cancelar no confirma nada, y se anuncia como diálogo", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByRole } = render(
      <MapaUbicacion lat={20} lon={-100} onConfirm={onConfirm} onCancel={onCancel} />
    );
    expect(getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    fireEvent.click(getByRole("button", { name: /Cancelar/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("muestra la coordenada actual para que el instalador la lea", () => {
    const { getByText } = render(
      <MapaUbicacion lat={19.4326} lon={-99.1332} onConfirm={() => undefined} onCancel={() => undefined} />
    );
    expect(getByText(/19\.43260, -99\.13320/)).toBeTruthy();
  });
});
