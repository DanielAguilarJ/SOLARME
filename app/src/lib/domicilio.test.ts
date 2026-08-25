import { describe, it, expect } from "vitest";
import { conCiudad } from "./domicilio";

/**
 * La regla vivía dentro del generador de la propuesta, se arregló ahí, y el mismo defecto volvió a
 * salir en la franja que ofrece recuperar un análisis: «Blvd. Kukulcán 12, Cancún, Cancún». Estas
 * pruebas cubren el módulo compartido para que no haya una tercera vez.
 */
describe("conCiudad", () => {
  it("no repite la ciudad cuando la dirección ya la trae", () => {
    expect(conCiudad("Blvd. Kukulcán 12, Cancún", "Cancún", ", ")).toBe("Blvd. Kukulcán 12, Cancún");
  });

  it("la añade cuando falta", () => {
    expect(conCiudad("Av. Chapultepec 100", "Guadalajara")).toBe("Av. Chapultepec 100 · Guadalajara");
  });

  it("reconoce el mismo topónimo escrito sin acentos", () => {
    // las direcciones llegan de fuentes distintas y no todas acentúan
    expect(conCiudad("Blvd. Kukulcan 12, Cancun", "Cancún", ", ")).toBe("Blvd. Kukulcan 12, Cancun");
    expect(conCiudad("Calle 5, MERIDA", "Mérida", ", ")).toBe("Calle 5, MERIDA");
  });

  it("distingue mayúsculas y minúsculas como la misma ciudad", () => {
    expect(conCiudad("Calle 5, puebla", "Puebla", ", ")).toBe("Calle 5, puebla");
  });

  it("sin ciudad devuelve la dirección tal cual", () => {
    expect(conCiudad("Av. Chapultepec 100", "")).toBe("Av. Chapultepec 100");
    expect(conCiudad("Av. Chapultepec 100", "   ")).toBe("Av. Chapultepec 100");
  });

  it("el separador es de quien llama: el papel usa punto medio y la pantalla coma", () => {
    expect(conCiudad("Calle 5", "León")).toBe("Calle 5 · León");
    expect(conCiudad("Calle 5", "León", ", ")).toBe("Calle 5, León");
  });

  it("una ciudad de dos palabras también se reconoce", () => {
    expect(conCiudad("Av. Juárez 200, Ciudad de México", "Ciudad de México", ", ")).toBe(
      "Av. Juárez 200, Ciudad de México",
    );
  });
});
