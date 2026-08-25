import { describe, it, expect } from "vitest";
import { periodoEnAnios } from "./tiempo";
import { SITES } from "./site";

describe("periodoEnAnios", () => {
  it("dice los años del dato real de los sitios", () => {
    // los 102 sitios traen 3653 días de registro: son diez años, no «3653 días»
    expect(periodoEnAnios(3653)).toBe("10 años");
  });

  it("usa el singular cuando toca", () => {
    expect(periodoEnAnios(365)).toBe("12 meses");
    expect(periodoEnAnios(31)).toBe("1 mes");
    expect(periodoEnAnios(1)).toBe("1 mes");
  });

  it("por debajo de dos años habla en meses, no redondea a años", () => {
    // 400 días dichos como «1 año» esconden más de un mes de registro
    expect(periodoEnAnios(400)).toBe("13 meses");
    expect(periodoEnAnios(729)).toBe("24 meses");
    expect(periodoEnAnios(730)).toBe("2 años");
  });

  it("con un dato ausente o absurdo no inventa una cifra", () => {
    for (const malo of [0, -5, NaN, Infinity]) {
      expect(periodoEnAnios(malo)).toBe("el periodo medido");
    }
  });

  it("todos los sitios caen en la banda de años, no de meses", () => {
    // si algún sitio entrara con pocos días, la frase cambiaría de unidad sin que nadie lo note
    for (const sitio of Object.values(SITES)) {
      expect(periodoEnAnios(sitio.diasSerie), sitio.nombre).toMatch(/^\d+ años$/);
    }
  });
});
