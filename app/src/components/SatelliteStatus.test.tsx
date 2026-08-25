// @vitest-environment happy-dom
/**
 * La franja que dice de dónde sale el techo.
 *
 * Se prueba sobre todo por el vocabulario. Esta franja decía «No hay clave de Google Solar API
 * configurada […] con la clave puesta en .env.local se mide el techo real»: una instrucción para
 * quien programa, en la pantalla de quien instala, pidiéndole tocar un archivo del código. Ninguna
 * prueba se enteraba porque el componente funcionaba perfectamente; se encontró abriendo la
 * aplicación y leyéndola como la lee un instalador.
 *
 * Lo que se fija aquí es la regla, no la frase: en esta pantalla no aparecen nombres de archivos de
 * configuración ni instrucciones de desarrollo, y cada estado dice de dónde sale la superficie con
 * la que están hechos los números que el instalador tiene delante.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SatelliteStatus from "./SatelliteStatus";
import type { BuildingInsights, SolarLookup } from "../lib/solarApi";

afterEach(cleanup);

const datos: BuildingInsights = {
  name: "buildings/prueba",
  center: { latitude: 20.66, longitude: -103.35 },
  imageryQuality: "HIGH",
  imageryDate: { year: 2024, month: 3, day: 1 },
  roofAreaMeters2: 96,
  maxSunshineHoursPerYear: 1800,
  segments: [{ pitchDegrees: 15, azimuthDegrees: 180, areaMeters2: 40 }],
  maxPanelCount: 18,
};

const medido: SolarLookup = { status: "ok", data: datos };

const estados: SolarLookup[] = [
  medido,
  { status: "no-key" },
  { status: "no-coverage" },
  { status: "error", message: "HTTP 500" },
];

describe("la franja del techo habla el idioma del instalador", () => {
  it("ningún estado nombra archivos de configuración ni acciones de desarrollo", () => {
    for (const estado of estados) {
      cleanup();
      const { container } = render(<SatelliteStatus lookup={estado} />);
      const texto = container.textContent ?? "";
      for (const prohibido of [".env", "API", "clave", "configurad", "habilitada"]) {
        expect(
          texto.toLowerCase().includes(prohibido.toLowerCase()),
          `el estado «${estado.status}» dice «${prohibido}»: eso es lenguaje interno`,
        ).toBe(false);
      }
    }
  });

  it("sin imagen aérea explica que la superficie sale del contorno trazado", () => {
    const { container } = render(<SatelliteStatus lookup={{ status: "no-key" }} />);
    const texto = container.textContent ?? "";
    expect(texto).toContain("El techo lo trazas tú");
    expect(texto).toMatch(/contorno/);
    // y no puede insinuar que el techo está medido
    expect(texto).not.toMatch(/techo medido/i);
  });

  it("cuando el techo sí está medido lo declara con su calidad", () => {
    const { container } = render(<SatelliteStatus lookup={medido} />);
    const texto = container.textContent ?? "";
    expect(texto).toMatch(/medido por satélite/);
    expect(texto).toContain("HIGH");
    expect(texto).toContain("2024-03");
  });

  it("un fallo de consulta muestra la causa y con qué se sigue", () => {
    const { container } = render(<SatelliteStatus lookup={{ status: "error", message: "HTTP 500" }} />);
    const texto = container.textContent ?? "";
    expect(texto).toContain("HTTP 500");
    expect(texto).toMatch(/captures a mano/);
  });
});

describe("la pestaña de la capa base no promete satélite sin imagen", () => {
  it("la etiqueta depende del estado, no está fija", () => {
    // guarda sobre la fuente: la etiqueta se decidía con la cadena «Satélite» escrita a pelo, de
    // modo que sin imagen aérea la pestaña prometía una foto que no existe
    const vista = readFileSync(resolve(__dirname, "../views/AnalysisView.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(vista).toMatch(/status === "ok" \? "Satélite" : "Plano"/);
  });
});
