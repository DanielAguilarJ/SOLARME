// @vitest-environment happy-dom
/**
 * La libreta de la obra.
 *
 * Es el componente más grande de la aplicación y no tenía pruebas propias. Y no es una lista de
 * contactos cualquiera: de aquí sale el electricista responsable que firma el cálculo eléctrico y la
 * conformidad de la instalación, y su número de registro es lo que se presenta en el trámite. Si esto
 * pierde un contacto o guarda uno a medias, lo que se rompe es un trámite ante la compañía
 * suministradora, no una lista.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Installers from "./Installers";
import { leerContactos, type Contacto } from "../lib/contactos";

const contacto = (over: Partial<Contacto> = {}): Contacto => ({
  id: "c1",
  nombre: "Ing. Ana Ruiz",
  rol: "electricista",
  telefono: "33 1234 5678",
  correo: "ana@ejemplo.mx",
  ciudad: "Guadalajara",
  registro: "CFE-UV-2024-118",
  notas: "",
  creadoEn: 1767225600000,
  ...over,
});

const sembrar = (cs: Contacto[]) =>
  localStorage.setItem("solarme.contactos.v1", JSON.stringify(cs));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("la libreta vacía", () => {
  it("explica por dónde empezar y qué pasa si no lo hace", () => {
    render(<Installers />);
    expect(screen.getByText(/Empieza por el electricista responsable/)).toBeTruthy();
    // y no miente: la propuesta se genera igual, marcada «sin asignar»
    expect(screen.getByText(/La propuesta se genera sin él/)).toBeTruthy();
  });

  it("no promete una red de instaladores que no existe", () => {
    render(<Installers />);
    expect(screen.getByText(/no es un mercado de instaladores/)).toBeTruthy();
  });
});

describe("agregar un contacto", () => {
  it("no deja guardar sin nombre, y dice qué falta en el propio botón", () => {
    render(<Installers />);
    fireEvent.click(screen.getByText(/Agregar el primero/));
    const boton = screen.getByText(/Falta el nombre/);
    expect(boton.hasAttribute("disabled")).toBe(true);
  });

  it("con el nombre puesto se guarda y aparece en la lista", () => {
    render(<Installers />);
    fireEvent.click(screen.getByText(/Agregar el primero/));
    fireEvent.change(screen.getByLabelText("Nombre o empresa"), {
      target: { value: "Ing. Ana Ruiz" },
    });
    fireEvent.click(screen.getByText(/Guardar en la libreta/));
    expect(screen.getByText("Ing. Ana Ruiz")).toBeTruthy();
  });

  it("lo guardado sobrevive a cerrar la aplicación", () => {
    render(<Installers />);
    fireEvent.click(screen.getByText(/Agregar el primero/));
    fireEvent.change(screen.getByLabelText("Nombre o empresa"), {
      target: { value: "Cuadrilla del Norte" },
    });
    fireEvent.change(screen.getByLabelText("Registro o cédula"), {
      target: { value: "CFE-UV-2025-402" },
    });
    fireEvent.click(screen.getByText(/Guardar en la libreta/));
    // se lee del almacén, no del estado de React: es lo que habrá mañana
    const guardados = leerContactos();
    expect(guardados).toHaveLength(1);
    expect(guardados[0].nombre).toBe("Cuadrilla del Norte");
    expect(guardados[0].registro).toBe("CFE-UV-2025-402");
  });

  it("recorta los espacios sobrantes de lo que se teclea", () => {
    render(<Installers />);
    fireEvent.click(screen.getByText(/Agregar el primero/));
    fireEvent.change(screen.getByLabelText("Nombre o empresa"), {
      target: { value: "  Ing. Ana Ruiz  " },
    });
    fireEvent.click(screen.getByText(/Guardar en la libreta/));
    expect(leerContactos()[0].nombre).toBe("Ing. Ana Ruiz");
  });
});

describe("el diálogo de alta sigue la convención de la aplicación", () => {
  const abrirAlta = () => {
    render(<Installers />);
    fireEvent.click(screen.getByText(/Agregar el primero/));
    return screen.getByRole("dialog");
  };

  it("se anuncia como diálogo modal", () => {
    expect(abrirAlta().getAttribute("aria-modal")).toBe("true");
  });

  it("cierra con Escape", () => {
    // era el único diálogo de la aplicación que no cerraba con Escape
    abrirAlta();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cierra al tocar el fondo, no solo con la X", () => {
    // en un teléfono, con el teclado abierto tapando media pantalla, la X queda arriba
    const dialogo = abrirAlta();
    fireEvent.click(dialogo.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("un clic dentro del diálogo NO lo cierra", () => {
    const dialogo = abrirAlta();
    fireEvent.click(dialogo);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("cerrar sin guardar no deja nada en la libreta", () => {
    abrirAlta();
    fireEvent.change(screen.getByLabelText("Nombre o empresa"), { target: { value: "Alguien" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(leerContactos()).toHaveLength(0);
  });
});

describe("buscar y quitar", () => {
  it("busca por nombre, ciudad, registro y nota", () => {
    sembrar([
      contacto(),
      contacto({ id: "c2", nombre: "Cuadrilla del Norte", ciudad: "Monterrey", registro: "R-9", notas: "factura a 30 días" }),
    ]);
    render(<Installers />);
    const buscador = screen.getByLabelText(/Buscar en la libreta/);

    fireEvent.change(buscador, { target: { value: "Monterrey" } });
    expect(screen.queryByText("Ing. Ana Ruiz")).toBeNull();
    expect(screen.getByText("Cuadrilla del Norte")).toBeTruthy();

    fireEvent.change(buscador, { target: { value: "CFE-UV-2024" } });
    expect(screen.getByText("Ing. Ana Ruiz")).toBeTruthy();

    fireEvent.change(buscador, { target: { value: "30 días" } });
    expect(screen.getByText("Cuadrilla del Norte")).toBeTruthy();
  });

  it("quitar un contacto lo borra también del almacén", () => {
    sembrar([contacto()]);
    render(<Installers />);
    fireEvent.click(screen.getByLabelText(/Quitar Ing. Ana Ruiz de la libreta/));
    expect(leerContactos()).toHaveLength(0);
  });

  it("una libreta corrupta no deja la pantalla en blanco", () => {
    // el almacén es entrada no confiable: pudo quedar a medias o venir de otra versión
    localStorage.setItem("solarme.contactos.v1", "{no es json");
    render(<Installers />);
    expect(screen.getByText(/La libreta de la obra/)).toBeTruthy();
  });

  it("un contacto sin nombre guardado a mano se descarta al leer", () => {
    sembrar([contacto(), { ...contacto({ id: "c2" }), nombre: "" }]);
    render(<Installers />);
    expect(screen.getByText("Ing. Ana Ruiz")).toBeTruthy();
    expect(leerContactos()).toHaveLength(1);
  });
});

describe("el aviso", () => {
  it("dice dónde viven los contactos y que viajan en el respaldo", () => {
    render(<Installers />);
    expect(screen.getByText(/Se guarda en este navegador y viaja en tu respaldo/)).toBeTruthy();
  });

  it("no usa el nombre de ninguna función interna de la aplicación", () => {
    const { container } = render(<Installers />);
    const texto = container.textContent ?? "";
    for (const jerga of ["localStorage", ".env", "API", "id ", "JSON"]) {
      expect(texto.includes(jerga), `«${jerga}» es lenguaje interno`).toBe(false);
    }
    void vi;
  });
});
