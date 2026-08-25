// @vitest-environment happy-dom
/**
 * El aviso de privacidad.
 *
 * Existe porque la app trata datos personales (domicilios de clientes, contactos de la libreta) y
 * en México se exige un aviso de privacidad. Las pruebas fijan lo que NO puede faltar: la
 * descripción factual verdadera y los huecos legales marcados que solo el instalador completa.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import AvisoPrivacidad from "./AvisoPrivacidad";

afterEach(() => cleanup());

describe("el aviso de privacidad dice la verdad y marca lo que falta", () => {
  it("declara dónde viven los datos y que no hay servidor", () => {
    const { getByText } = render(<AvisoPrivacidad onClose={() => undefined} />);
    expect(getByText(/únicamente en este navegador/)).toBeTruthy();
    expect(getByText(/no tiene servidor ni cuenta/)).toBeTruthy();
  });

  it("nombra los terceros a los que sí sale la dirección", () => {
    const { getByText } = render(<AvisoPrivacidad onClose={() => undefined} />);
    expect(getByText(/OpenStreetMap|Nominatim/)).toBeTruthy();
    expect(getByText(/Open-Meteo/)).toBeTruthy();
    expect(getByText(/Google Solar/)).toBeTruthy();
  });

  it("marca los huecos legales que solo el instalador puede llenar", () => {
    const { container, getByText } = render(<AvisoPrivacidad onClose={() => undefined} />);
    const txt = container.textContent ?? "";
    // Los placeholders van entre corchetes para que sea imposible publicarlo a medias sin verlos.
    for (const hueco of ["[RAZÓN SOCIAL", "[DOMICILIO]", "[CORREO O TELÉFONO DE CONTACTO]", "[FECHA]"]) {
      expect(txt).toContain(hueco);
    }
    // Y lo dice en voz alta, no en letra chica.
    expect(getByText(/Borrador para completar/)).toBeTruthy();
  });

  it("se cierra con Escape y con la X, y se anuncia como diálogo", () => {
    const onClose = vi.fn();
    const { getByRole, getByLabelText } = render(<AvisoPrivacidad onClose={onClose} />);
    const dlg = getByRole("dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");

    fireEvent.click(getByLabelText("Cerrar el aviso"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
