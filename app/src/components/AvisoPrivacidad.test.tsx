// @vitest-environment happy-dom
/**
 * El aviso de privacidad.
 *
 * Existe porque la app trata datos personales (domicilios de clientes, contactos de la libreta) y
 * en México se exige un aviso de privacidad. Las pruebas fijan lo que NO puede faltar: la
 * descripción factual verdadera y los huecos legales marcados que solo el instalador completa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import AvisoPrivacidad from "./AvisoPrivacidad";
import { _olvidarNegocio, guardarNegocio } from "../lib/negocio";

beforeEach(() => {
  localStorage.clear();
  _olvidarNegocio();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  _olvidarNegocio();
});

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

  it("marca los huecos legales mientras el instalador no ponga sus datos", () => {
    const { container, getByText } = render(<AvisoPrivacidad onClose={() => undefined} />);
    const txt = container.textContent ?? "";
    // Los placeholders van entre corchetes para que sea imposible publicarlo a medias sin verlos.
    for (const hueco of ["[RAZÓN SOCIAL", "[DOMICILIO]", "[CORREO O TELÉFONO DE CONTACTO]"]) {
      expect(txt).toContain(hueco);
    }
    // Y lo dice en voz alta, no en letra chica.
    expect(getByText(/Borrador para completar/)).toBeTruthy();
  });

  it("la fecha es la del día en que se lee, no un hueco por rellenar", () => {
    // Decía «Última actualización: [FECHA]»: un hueco que nadie iba a mantener, y además una
    // afirmación sobre el historial del documento que la aplicación no puede sostener.
    const { container } = render(<AvisoPrivacidad onClose={() => undefined} />);
    const txt = container.textContent ?? "";
    expect(txt).not.toContain("[FECHA]");
    expect(txt).toContain(
      new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" }),
    );
  });

  it("con los datos del negocio puestos, el aviso queda completo y sin advertencia", () => {
    guardarNegocio({
      nombre: "Solar del Bajío S.A. de C.V.",
      domicilio: "Av. López Mateos 1200, León",
      telefono: "477 123 4567",
      correo: "contacto@solardelbajio.mx",
      registro: "",
    });
    const { container, queryByText } = render(<AvisoPrivacidad onClose={() => undefined} />);
    const txt = container.textContent ?? "";
    expect(txt).toContain("Solar del Bajío S.A. de C.V.");
    expect(txt).toContain("Av. López Mateos 1200, León");
    expect(txt).toContain("477 123 4567");
    expect(txt, "no puede quedar ningún hueco marcado").not.toMatch(/\[[A-ZÁÉÍÓÚÑ ]{4,}\]/);
    expect(
      queryByText(/Borrador para completar/),
      "advertir de que falta algo cuando ya no falta sería falso",
    ).toBeNull();
  });

  it("con solo parte de los datos, dice exactamente qué falta", () => {
    guardarNegocio({
      nombre: "Solar Norte",
      domicilio: "",
      telefono: "",
      correo: "hola@solarnorte.mx",
      registro: "",
    });
    const { container } = render(<AvisoPrivacidad onClose={() => undefined} />);
    const txt = container.textContent ?? "";
    expect(txt).toContain("Solar Norte");
    expect(txt).toContain("[DOMICILIO]");
    expect(txt).toMatch(/Falta domicilio/);
    expect(txt, "el contacto ya está cubierto por el correo").not.toContain("[CORREO");
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
