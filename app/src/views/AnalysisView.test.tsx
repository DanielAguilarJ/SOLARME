// @vitest-environment happy-dom
/**
 * La salida de la propuesta cuando el navegador bloquea la ventana emergente.
 *
 * Por qué existe esta prueba: el código decía `if (!w) return;`. El instalador tocaba
 * «Propuesta», no pasaba NADA y no había forma de saber por qué. En un teléfono —que es donde se
 * usa esto, en la azotea o frente al cliente— bloquear emergentes es el comportamiento normal,
 * así que el caso silencioso era el caso FRECUENTE y la app parecía descompuesta justo en el
 * momento de cerrar la venta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import AnalysisView from "./AnalysisView";
import { enrichPanels } from "../lib/price";
import { CITIES, type Design, type Panel } from "../lib/solar";
import { SITES } from "../lib/site";
// Se importa el JSON en vez de leerlo del disco: en el entorno de navegador de esta prueba
// `import.meta.url` no es una ruta de archivo y `readFileSync` no resuelve.
import catalogo from "../data/panels.json";

// El JSON crudo no trae `ppw` ni `priceOrigin`: los añade `enrichPanels`, igual que en la app.
const panels: Panel[] = enrichPanels(
  (catalogo as { panels: unknown[] }).panels as Panel[]
) as Panel[];

const site = SITES["guadalajara"] ?? Object.values(SITES)[0];
const city = CITIES["guadalajara"] ?? Object.values(CITIES)[0];

const design: Design = {
  type: "res", area: 40, bill: 1500, tariff: "1", shade: 5,
  tilt: site.tiltOptimo, az: 180, panel: panels[0],
  lat: site.lat, lng: site.lng, yield: site.rendimiento, site,
} as unknown as Design;

function pintar(d: Design = design) {
  return render(
    <AnalysisView
      address="Av. Chapultepec 100"
      city={city.name}
      design={d}
      onChange={() => undefined}
      onSave={() => undefined}
      saved={false}
      bosRates={{}}
      onSetBos={() => undefined}
      onClearBos={() => undefined}
    />
  );
}

let urls: string[];

beforeEach(() => {
  urls = [];
  URL.createObjectURL = ((b: Blob) => {
    urls.push(String(b.type));
    return "blob:propuesta";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => undefined;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("cuando el navegador bloquea la ventana de la propuesta", () => {
  it("lo dice y ofrece abrirla, en vez de no hacer nada", () => {
    // `window.open` devuelve null: es exactamente lo que hace un bloqueador de emergentes.
    vi.spyOn(window, "open").mockReturnValue(null);

    const { getByRole, getByText, queryByText } = pintar();
    expect(queryByText(/bloqueó la ventana/), "no debe avisar antes de intentarlo").toBeNull();

    fireEvent.click(getByRole("button", { name: /Propuesta/ }));

    expect(getByText(/Tu navegador bloqueó la ventana de la propuesta/)).toBeTruthy();
    const enlace = getByRole("link", { name: /Abrir la propuesta/ });
    expect(enlace.getAttribute("href")).toBe("blob:propuesta");
    // El documento se construyó de verdad y como HTML: el enlace no es decorativo.
    expect(urls).toEqual(["text/html"]);
  });

  it("el enlace se abre en otra pestaña y sin exponer la sesión", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const { getByRole } = pintar();
    fireEvent.click(getByRole("button", { name: /Propuesta/ }));

    const enlace = getByRole("link", { name: /Abrir la propuesta/ });
    expect(enlace.getAttribute("target")).toBe("_blank");
    expect(enlace.getAttribute("rel")).toContain("noopener");
  });

  it("cuando la ventana SÍ abre, no molesta con el aviso", () => {
    const escrito: string[] = [];
    const falsa = {
      document: { write: (h: string) => escrito.push(h), close: () => undefined },
      focus: () => undefined,
      print: () => undefined,
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(falsa);

    const { getByRole, queryByText } = pintar();
    fireEvent.click(getByRole("button", { name: /Propuesta/ }));

    expect(queryByText(/bloqueó la ventana/)).toBeNull();
    expect(escrito).toHaveLength(1);
    expect(escrito[0]).toContain("Av. Chapultepec 100");
    // No se crea un archivo cuando no hace falta.
    expect(urls).toEqual([]);
  });
});

/**
 * Un techo donde no cabe ni un módulo.
 *
 * El cálculo ya lo sabía —devuelve `noCabe`— pero en pantalla solo se veía un «no cabe» en la
 * esquina del retorno, con la producción, el ahorro y el CO2 en cero. El instalador leía cuatro
 * ceros sin saber si el techo no da o si es cosa de la inclinación, que es justo lo que puede
 * cambiar con un deslizador.
 */
describe("cuando no cabe ningún módulo", () => {
  // 2 m² no alcanzan ni para un módulo del catálogo, que ronda los 2 m² de área
  const minusculo = { ...design, area: 2 } as Design;

  it("lo dice con la superficie que hay, no solo con ceros", () => {
    const { container } = pintar(minusculo);
    expect(container.textContent).toMatch(/No cabe ningún módulo en 2 m²/);
  });

  it("dice cuántos metros faltan, que es lo que permite decidir", () => {
    const { container } = pintar(minusculo);
    expect(container.textContent).toMatch(/faltan .*m de fondo/);
  });

  it("explica que la inclinación cambia el fondo que ocupa cada fila", () => {
    const { container } = pintar(minusculo);
    expect(container.textContent).toMatch(/bajar la inclinación aprieta las filas/);
  });

  it("con un techo normal no aparece la advertencia", () => {
    const { container } = pintar();
    expect(container.textContent).not.toMatch(/No cabe ningún módulo/);
  });
});
