// @vitest-environment happy-dom
/**
 * Borrar todo lo guardado.
 *
 * Es la única acción irreversible de la aplicación, así que lo que se prueba con más cuidado no es
 * que borre: es que diga la verdad ANTES de borrar, y que no se lleve por delante nada que no sea
 * suyo. Un «se borrarán 3 proyectos» cuando hay 12 sería el peor defecto posible aquí.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarTodo, hayDatos, inventarioDatos, PREFIJO, resumenDeBorrado } from "./borrado";

const poner = (clave: string, valor: unknown) =>
  localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("inventario antes de borrar", () => {
  it("con el almacén vacío no hay nada que borrar", () => {
    const i = inventarioDatos();
    expect(hayDatos(i)).toBe(false);
    expect(resumenDeBorrado(i)).toMatch(/No hay nada guardado/);
  });

  it("cuenta proyectos, contactos, negocio y precios", () => {
    poner("projects.v1", [{ id: "a" }, { id: "b" }, { id: "c" }]);
    poner("contactos.v1", [{ id: "c1" }]);
    poner("negocio.v1", { nombre: "Solar Norte" });
    poner("quotes.v1", { trina: 4.8, jinko: 5.1 });
    poner("bos.v1", { res: 14.5 });

    const i = inventarioDatos();
    expect(i.proyectos).toBe(3);
    expect(i.contactos).toBe(1);
    expect(i.negocio).toBe(true);
    expect(i.precios).toBe(3);
  });

  it("un negocio vacío no cuenta como dato del negocio", () => {
    poner("negocio.v1", { nombre: "", telefono: "", correo: "", domicilio: "", registro: "" });
    expect(inventarioDatos().negocio).toBe(false);
  });

  it("el resumen enumera exactamente lo que hay", () => {
    poner("projects.v1", [{ id: "a" }]);
    poner("negocio.v1", { nombre: "Solar Norte" });
    expect(resumenDeBorrado()).toBe("Se borrarán 1 proyecto y los datos de tu negocio.");
  });

  it("el verbo concuerda con lo que se enumera", () => {
    // esta prueba fijaba «Se borrará 2 contactos», que es lo que decía el código: la prueba
    // repetía el error en vez de comprobar la regla
    poner("contactos.v1", [{ id: "c1" }, { id: "c2" }]);
    expect(resumenDeBorrado()).toBe("Se borrarán 2 contactos de la libreta.");

    localStorage.clear();
    poner("projects.v1", [{ id: "a" }]);
    expect(resumenDeBorrado()).toBe("Se borrará 1 proyecto.");

    localStorage.clear();
    poner("negocio.v1", { nombre: "Solar Norte" });
    expect(resumenDeBorrado()).toBe("Se borrarán los datos de tu negocio.");

    localStorage.clear();
    poner("quotes.v1", { trina: 4.8 });
    expect(resumenDeBorrado()).toBe("Se borrarán tus precios.");
  });

  it("un contenido corrupto no rompe el inventario", () => {
    localStorage.setItem(PREFIJO + "projects.v1", "{no es json");
    expect(inventarioDatos().proyectos).toBe(0);
    expect(hayDatos()).toBe(true); // la clave existe y se va a borrar igual
  });
});

describe("borrarTodo", () => {
  it("se lleva todas las claves de la aplicación", () => {
    poner("projects.v1", [{ id: "a" }]);
    poner("contactos.v1", []);
    poner("negocio.v1", { nombre: "x" });
    poner("geocode.v1", {});
    expect(borrarTodo()).toBe(4);
    expect(inventarioDatos().claves).toEqual([]);
  });

  it("NO toca lo que no es suyo", () => {
    // el navegador del instalador puede tener datos de otras aplicaciones en el mismo dominio
    localStorage.setItem("otra-app.sesion", "no me toques");
    poner("projects.v1", [{ id: "a" }]);
    borrarTodo();
    expect(localStorage.getItem("otra-app.sesion")).toBe("no me toques");
  });

  it("borra por prefijo, así que una clave nueva también se va", () => {
    // si mañana alguien añade «solarme.loquesea», no hace falta acordarse de apuntarla aquí
    poner("loquesea.v9", { algo: 1 });
    expect(borrarTodo()).toBe(1);
    expect(localStorage.getItem(PREFIJO + "loquesea.v9")).toBeNull();
  });

  it("sobre un almacén vacío no falla", () => {
    expect(borrarTodo()).toBe(0);
  });
});
