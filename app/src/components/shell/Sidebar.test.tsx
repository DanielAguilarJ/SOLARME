// @vitest-environment happy-dom
/**
 * Pruebas de componente de la barra lateral.
 *
 * Por qué existe este archivo: `estilos.test.ts` guardaba este cableado con una expresión
 * regular sobre el código fuente —exigía ver `useSyncExternalStore(suscribir, contarContactos`
 * escrito—. Esa guarda fija la FORMA DE LA LLAMADA, no el efecto: se puede satisfacer
 * escribiendo la llamada y tirando su resultado. Aquí se comprueba lo que de verdad importa,
 * que es que la cifra en pantalla cambie cuando cambia la libreta.
 *
 * El entorno se pide por archivo con el comentario de arriba. El resto de la suite sigue en
 * Node a propósito: montar un DOM para las ~730 pruebas de cálculo las haría más lentas sin
 * comprobar nada nuevo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import Sidebar from "./Sidebar";
import { guardarContactos, type Contacto } from "../../lib/contactos";

function contacto(id: string, nombre: string): Contacto {
  return { id, nombre, rol: "electricista", creadoEn: 1 };
}

/** El pie es el único sitio donde se declara qué hay guardado. */
function pie(): string {
  // Se lee por el texto fijo de la advertencia, que es lo que ancla el bloque: buscar por clase
  // volvería a atar la prueba al código en vez de a lo que se ve.
  const aviso = screen.getByText(/Sólo en este navegador/);
  return aviso.parentElement!.textContent ?? "";
}

function montar(projectCount = 1, onNavigate = () => {}, onAviso = () => {}, onNegocio = () => {}) {
  return render(
    <Sidebar view="inicio" onNavigate={onNavigate} onNew={() => {}} projectCount={projectCount} onAviso={onAviso} onNegocio={onNegocio} />,
  );
}

describe("el pie de la barra lateral dice qué hay guardado", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("cuenta los proyectos y omite la libreta cuando está vacía", () => {
    montar(2);
    expect(pie()).toContain("2 proyectos");
    // Decir «0 contactos» sería ruido: lo que no hay no se enumera.
    expect(pie()).not.toMatch(/contacto/);
  });

  it("se entera de un contacto nuevo SIN volver a montarse", () => {
    montar(1);
    expect(pie()).toContain("1 proyecto");
    expect(pie()).not.toMatch(/contacto/);

    // Éste es el defecto que la prueba existe para cazar. La barra lateral no se desmonta nunca,
    // así que leer la cuenta una sola vez al montar la deja atrasada en silencio: el instalador
    // añade un electricista y el pie sigue diciendo lo de antes, sin error a la vista.
    act(() => guardarContactos([contacto("a", "Ana Ruiz")]));

    expect(pie()).toContain("1 proyecto · 1 contacto");
  });

  it("concuerda el plural con la cuenta", () => {
    montar(1);
    act(() => guardarContactos([contacto("a", "Ana"), contacto("b", "Beto")]));
    expect(pie()).toContain("2 contactos");

    act(() => guardarContactos([contacto("a", "Ana")]));
    expect(pie()).toContain("1 contacto");
    expect(pie()).not.toContain("1 contactos");
  });

  it("recoge el cambio hecho en otra pestaña", () => {
    montar(1);
    // Otra pestaña escribe directamente en el almacén: el evento `storage` sólo dispara en las
    // pestañas que NO hicieron el cambio, así que es el único aviso que llega.
    act(() => {
      localStorage.setItem("solarme.contactos.v1", JSON.stringify([contacto("z", "Zoe")]));
      window.dispatchEvent(new StorageEvent("storage", { key: "solarme.contactos.v1" }));
    });
    expect(pie()).toContain("1 contacto");
  });

  it("no finge una sesión: no hay nombre propio ni cargo en pantalla", () => {
    const { container } = montar(1);
    // Antes el pie mostraba un avatar «DA», «Daniel A.» y «Ing. Energías Renovables» escritos a
    // mano, sin ninguna cuenta detrás. La guarda de `estilos.test.ts` lo busca en el código; ésta
    // lo busca en lo que el usuario ve, que es donde el defecto hacía daño.
    const visible = container.textContent ?? "";
    expect(visible).not.toMatch(/Daniel|Ing\.\s|Renovables|Mi cuenta|Cerrar sesi/);
  });

  it("la única acción del pie lleva a donde se respalda", () => {
    const onNavigate = vi.fn();
    montar(1, onNavigate);
    screen.getByRole("button", { name: /Respaldar en un archivo/ }).click();
    expect(onNavigate).toHaveBeenCalledWith("proyectos");
  });
});
