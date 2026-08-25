// @vitest-environment happy-dom
/**
 * El conteo del catálogo.
 *
 * Por qué existe: la lista se recortaba con `.slice(0, 12)` y la cabecera imprimía el largo del
 * recorte. Con todos los rangos abiertos decía «Mostrando 12 de 140 módulos», y mover un
 * deslizador no cambiaba el número mientras siguieran cumpliendo doce o más. O sea que los
 * controles de rango —que el producto ofrece como función— no daban ninguna señal de estar
 * haciendo algo, y no había forma de saber cuántos módulos quedaban dentro.
 *
 * Se vio mirando la pantalla, no leyendo el código: la suite estaba verde con el defecto puesto.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import Catalog from "./Catalog";
import { enrichPanels } from "../lib/price";
import type { Panel } from "../lib/solar";
import { SITES } from "../lib/site";
import catalogo from "../data/panels.json";

const panels: Panel[] = enrichPanels(
  (catalogo as { panels: unknown[] }).panels as Panel[]
) as Panel[];

const site = SITES["guadalajara"] ?? Object.values(SITES)[0];

function pintar() {
  return render(
    <Catalog
      panels={panels}
      site={site}
      roof={{ area: 35, lat: site.lat, tilt: site.tiltOptimo, az: 180, shade: 0, yield: site.rendimiento }}
      onPick={() => undefined}
      sourceLabel="banda"
      quotes={{}}
      onSetQuote={() => undefined}
      onClearQuote={() => undefined}
      onClearAllQuotes={() => undefined}
    />
  );
}

afterEach(() => cleanup());

describe("el conteo del catálogo dice cuántos cumplen, no cuántos caben en pantalla", () => {
  it("con los rangos abiertos declara el catálogo completo, no el recorte", () => {
    const { getByText } = pintar();
    // 140 módulos y un tope visible de 12: la cifra grande tiene que ser la del catálogo.
    expect(getByText(/mejores de los/)).toBeTruthy();
    expect(getByText(String(panels.length))).toBeTruthy();
  });

  it("no presenta el tope de pantalla como si fuera el resultado del filtro", () => {
    const { queryByText } = pintar();
    // Ésta es la frase exacta que engañaba.
    expect(queryByText(/^Mostrando 12 de 140 módulos$/)).toBeNull();
  });

  it("al apretar un rango el conteo baja y lo dice", () => {
    const { getByLabelText, getByText } = pintar();
    // La eficiencia mínima es el rango más discriminante del catálogo real. Se busca por su
    // etiqueta visible, que es como está asociada: el `<input>` vive dentro de un `<label>`.
    const eficiencia = getByLabelText(/Eficiencia mínima/) as HTMLInputElement;

    fireEvent.change(eficiencia, { target: { value: "23" } });

    // Con 23 % de eficiencia mínima cumplen bastantes menos que los 140.
    const texto = getByText(/cumplen tus rangos|mejores de los/);
    expect(texto.textContent).not.toMatch(new RegExp(`de los ${panels.length} del catálogo`));
  });
});
