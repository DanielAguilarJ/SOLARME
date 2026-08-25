import { describe, it, expect, beforeEach } from "vitest";
import {
  sanear, contactoValido, leerContactos, guardarContactos, ordenar, buscar, resumen,
  CLAVE_ALMACEN, ROLES, type Contacto,
  contarContactos, suscribir,
} from "./contactos";

const base = (o: Partial<Contacto> = {}): Contacto => ({
  id: "a", nombre: "Ing. Ana Ruiz", rol: "electricista", creadoEn: 1000, ...o,
});

beforeEach(() => localStorage.clear());

describe("lo mínimo para que una fila diga algo", () => {
  it("exige nombre y un rol de la lista", () => {
    expect(contactoValido({ nombre: "Ana Ruiz", rol: "electricista" })).toBe(true);
    expect(contactoValido({ nombre: "A", rol: "electricista" })).toBe(false);
    expect(contactoValido({ nombre: "Ana Ruiz", rol: "inventado" as never })).toBe(false);
    expect(contactoValido({ rol: "cuadrilla" })).toBe(false);
  });

  it("los cuatro roles existen y explican para qué sirven", () => {
    expect(ROLES).toHaveLength(4);
    for (const r of ROLES) expect(r.nota.length).toBeGreaterThan(15);
  });
});

/** Lo que viene del almacenamiento o de un archivo es entrada no confiable. */
describe("saneado de entrada no confiable", () => {
  it("descarta lo que no es objeto o le falta lo esencial", () => {
    for (const x of [null, 3, "texto", [], {}, { nombre: "Ana" }, { rol: "otro" }]) {
      expect(sanear(x)).toBeNull();
    }
  });

  it("descarta campos con el tipo equivocado en vez de propagarlos", () => {
    const c = sanear({ nombre: "Ana Ruiz", rol: "otro", telefono: 5512345678, notas: { a: 1 } });
    expect(c).not.toBeNull();
    expect(c!.telefono).toBeUndefined();
    expect(c!.notas).toBeUndefined();
  });

  it("recorta textos largos en vez de guardarlos completos", () => {
    const c = sanear({ nombre: "x".repeat(500), rol: "otro", notas: "y".repeat(2000) })!;
    expect(c.nombre.length).toBe(80);
    expect(c.notas!.length).toBe(300);
  });

  it("genera id y fecha cuando faltan, sin sobrescribir los que vienen", () => {
    const sin = sanear({ nombre: "Ana Ruiz", rol: "otro" })!;
    expect(sin.id.length).toBeGreaterThan(3);
    expect(sin.creadoEn).toBeGreaterThan(0);
    const con = sanear({ id: "fijo", nombre: "Ana Ruiz", rol: "otro", creadoEn: 42 })!;
    expect(con.id).toBe("fijo");
    expect(con.creadoEn).toBe(42);
  });

  it("no acepta una fecha absurda", () => {
    expect(sanear({ nombre: "Ana Ruiz", rol: "otro", creadoEn: -5 })!.creadoEn).toBeGreaterThan(0);
  });
});

describe("persistencia", () => {
  it("va y vuelve idéntico", () => {
    const cs = [base(), base({ id: "b", nombre: "Cuadrilla Norte", rol: "cuadrilla" })];
    guardarContactos(cs);
    expect(leerContactos()).toEqual(cs);
  });

  it("un almacenamiento corrupto devuelve lista vacía en vez de romper", () => {
    localStorage.setItem(CLAVE_ALMACEN, "{esto no es json");
    expect(leerContactos()).toEqual([]);
    localStorage.setItem(CLAVE_ALMACEN, '{"no":"es arreglo"}');
    expect(leerContactos()).toEqual([]);
  });

  it("una lista con basura conserva lo bueno y descarta lo malo", () => {
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify([
      base(), null, { nombre: "" }, base({ id: "b", nombre: "Solar MX", rol: "distribuidor" }), 7,
    ]));
    const leidos = leerContactos();
    expect(leidos).toHaveLength(2);
    expect(leidos.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("orden y búsqueda", () => {
  it("quien firma va primero", () => {
    const cs = [
      base({ id: "1", rol: "otro", creadoEn: 9000 }),
      base({ id: "2", rol: "distribuidor", creadoEn: 8000 }),
      base({ id: "3", rol: "electricista", creadoEn: 100 }),
      base({ id: "4", rol: "cuadrilla", creadoEn: 7000 }),
    ];
    expect(ordenar(cs).map((c) => c.rol)).toEqual(
      ["electricista", "cuadrilla", "distribuidor", "otro"]);
  });

  it("dentro del mismo rol gana lo más reciente", () => {
    const cs = [base({ id: "viejo", creadoEn: 10 }), base({ id: "nuevo", creadoEn: 900 })];
    expect(ordenar(cs)[0].id).toBe("nuevo");
  });

  it("ordenar no muta la lista original", () => {
    const cs = [base({ id: "1", rol: "otro" }), base({ id: "2", rol: "electricista" })];
    const antes = cs.map((c) => c.id);
    ordenar(cs);
    expect(cs.map((c) => c.id)).toEqual(antes);
  });

  it("busca en todos los campos con texto, sin distinguir mayúsculas", () => {
    const cs = [
      base({ id: "1", nombre: "Ana Ruiz", ciudad: "Mexicali", registro: "CFE-4471" }),
      base({ id: "2", nombre: "Beto", rol: "cuadrilla", notas: "trabaja fines de semana" }),
    ];
    expect(buscar(cs, "MEXICALI").map((c) => c.id)).toEqual(["1"]);
    expect(buscar(cs, "4471").map((c) => c.id)).toEqual(["1"]);
    expect(buscar(cs, "fines").map((c) => c.id)).toEqual(["2"]);
    expect(buscar(cs, "  ")).toHaveLength(2);
    expect(buscar(cs, "nada")).toHaveLength(0);
  });
});

describe("el resumen avisa de lo que impide entregar", () => {
  it("una libreta sin electricista se señala", () => {
    const r = resumen([base({ rol: "cuadrilla" })]);
    expect(r.sinResponsable).toBe(true);
    expect(r.por.cuadrilla).toBe(1);
  });

  it("con electricista no se señala", () => {
    expect(resumen([base({ rol: "electricista" })]).sinResponsable).toBe(false);
  });

  it("una libreta vacía no señala nada: no hay nada que corregir todavía", () => {
    const r = resumen([]);
    expect(r.sinResponsable).toBe(false);
    expect(r.total).toBe(0);
  });
});

/**
 * La barra lateral muestra la cuenta de contactos y no se desmonta nunca. Sin aviso de cambios se
 * queda atrasada en silencio: el instalador añade un electricista y el pie sigue diciendo lo de
 * antes. Nadie lo ve porque no hay error, sólo un número viejo.
 */
describe("aviso de cambios en la libreta", () => {
  beforeEach(() => localStorage.clear());

  const uno = (id: string): Contacto => ({
    id, nombre: `Contacto ${id}`, rol: "electricista", creadoEn: 1,
  });

  it("la cuenta refleja lo guardado", () => {
    expect(contarContactos()).toBe(0);
    guardarContactos([uno("a"), uno("b")]);
    expect(contarContactos()).toBe(2);
  });

  it("guardar avisa a quien escucha", () => {
    let avisos = 0;
    const cancelar = suscribir(() => { avisos++; });
    guardarContactos([uno("a")]);
    guardarContactos([uno("a"), uno("b")]);
    expect(avisos).toBe(2);
    cancelar();
  });

  it("cancelar deja de recibir avisos", () => {
    let avisos = 0;
    suscribir(() => { avisos++; })();  // suscribir y cancelar de inmediato
    guardarContactos([uno("a")]);
    expect(avisos).toBe(0);
  });

  /* Sin caché, vaciar el almacenamiento por detrás tampoco puede dejar la cuenta vieja. */
  it("la cuenta nunca queda atrasada, ni con un borrado que no pasa por la librería", () => {
    guardarContactos([uno("a"), uno("b")]);
    expect(contarContactos()).toBe(2);
    localStorage.clear();
    expect(contarContactos()).toBe(0);
  });

  it("un cambio desde otra pestaña también pone la cuenta al día", () => {
    const cancelar = suscribir(() => {});
    expect(contarContactos()).toBe(0);
    // Otra pestaña escribe: el evento `storage` sólo dispara aquí, no en la que escribió.
    localStorage.setItem("solarme.contactos.v1", JSON.stringify([uno("a"), uno("b"), uno("c")]));
    window.dispatchEvent(new StorageEvent("storage", { key: "solarme.contactos.v1" }));
    expect(contarContactos()).toBe(3);
    cancelar();
  });

  it("ignora cambios en otras claves del almacenamiento", () => {
    let avisos = 0;
    const cancelar = suscribir(() => { avisos++; });
    window.dispatchEvent(new StorageEvent("storage", { key: "solarme.projects.v1" }));
    expect(avisos).toBe(0);
    cancelar();
  });
});
