// @vitest-environment happy-dom
/**
 * El aviso que aparece cuando la física viene de una ciudad cercana y no del domicilio.
 *
 * Por qué existe esta prueba: el texto decía «a esa distancia el dato es prácticamente el del
 * domicilio», y eso es **falso**. Medido sobre los 194 pares de sitios medidos a menos de 150 km,
 * la distancia predice mal el desacuerdo (r = 0.33) y la diferencia de altitud lo predice mejor
 * (r = 0.47). Orizaba y Córdoba están a 18 km y su rendimiento difiere 11.5 %, porque los separan
 * 395 m de altitud. Prometer «prácticamente igual» era el mismo defecto de sobreafirmación que
 * este trabajo lleva toda la sesión quitando del resto de la app.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import PhysicsSource from "./PhysicsSource";
import { SITES, distanciaKm } from "../lib/site";

afterEach(() => cleanup());

function cerca(km: number) {
  const site = SITES["cordoba"] ?? SITES["cdmx"];
  return render(
    <PhysicsSource
      site={site}
      lat={site.lat}
      yieldKwh={site.rendimiento}
      resolucion={{ origen: "cercano", km }}
    />,
  );
}

describe("el aviso de física prestada no promete precisión que no tiene", () => {
  it("a corta distancia advierte de la altitud en vez de decir «prácticamente igual»", () => {
    const { container } = cerca(20);
    const texto = container.textContent ?? "";

    expect(texto).toMatch(/Cerca no siempre significa igual/);
    expect(texto).toMatch(/altitud/);
    // La frase retirada: si vuelve, el instalador vuelve a creer que puede comprometer producción.
    expect(texto).not.toMatch(/prácticamente el del domicilio/);
  });

  it("dice de qué ciudad viene y a cuántos kilómetros", () => {
    const { container } = cerca(37);
    const texto = container.textContent ?? "";
    // Sin eso el aviso es una advertencia abstracta y el instalador no puede juzgarla.
    expect(texto).toMatch(/37 km/);
    expect(texto).toMatch(/Se geocodificó y se usa la física medida/);
  });

  it("a media y larga distancia conserva sus dos avisos distintos", () => {
    const media = (cerca(120).container.textContent ?? "");
    cleanup();
    const baja = (cerca(200).container.textContent ?? "");
    expect(media).toMatch(/Sirve para dimensionar/);
    expect(baja).toMatch(/orden de magnitud/);
    expect(media).not.toEqual(baja);
  });
});

describe("cuando la dirección no se pudo ubicar, la app lo dice", () => {
  // Defecto propio: `resolveSite` devuelve `origen: "catalogo"` CON `motivo` cuando la
  // coincidencia era débil y la geocodificación no pudo. Los avisos de `motivo` sólo se pintaban
  // en la rama sin sitio, así que el instalador veía «Veracruz · medido» sin enterarse de que su
  // domicilio nunca se ubicó. Y hoy es el caso normal, no el raro: Nominatim deniega el acceso a
  // peticiones con User-Agent de navegador y un navegador no puede cambiar el suyo.
  function conMotivo(motivo: "sin-red" | "servicio-falló" | "no-encontrado") {
    const site = SITES["veracruz"] ?? SITES["cdmx"];
    return render(
      <PhysicsSource
        site={site}
        lat={site.lat}
        yieldKwh={site.rendimiento}
        resolucion={{ origen: "catalogo", motivo }}
      />,
    );
  }

  it("declara que la física viene del nombre escrito, no del domicilio", () => {
    const texto = conMotivo("servicio-falló").container.textContent ?? "";
    expect(texto).toMatch(/No se pudo ubicar el domicilio/);
    expect(texto).toMatch(/por el nombre\s+escrito/);
    // Y da la salida concreta, no solo el diagnóstico.
    expect(texto).toMatch(/escribe la ciudad más cercana/);
  });

  it("distingue la falta de red del fallo del servicio", () => {
    expect(conMotivo("sin-red").container.textContent).toMatch(/sin conexión/);
    cleanup();
    expect(conMotivo("servicio-falló").container.textContent).not.toMatch(/sin conexión/);
  });

  it("una resolución de catálogo limpia no muestra el aviso", () => {
    // Si el instalador escribió el nombre de una ciudad medida, no hay nada que advertir: un
    // aviso que sale siempre deja de leerse.
    const site = SITES["merida"] ?? SITES["cdmx"];
    const { container } = render(
      <PhysicsSource site={site} lat={site.lat} yieldKwh={site.rendimiento}
        resolucion={{ origen: "catalogo" }} />,
    );
    expect(container.textContent).not.toMatch(/No se pudo ubicar el domicilio/);
  });
});

describe("la app muestra qué dirección encontró de verdad", () => {
  // Por qué existe: `Punto.descripcion` se documenta como «para que el instalador confirme», y
  // App.tsx lo descartaba. Medido, «Avenida Juárez 1910, Puebla» resuelve a Cuautlancingo, otro
  // municipio; sin mostrarlo, esa dirección equivocada entra callada en la propuesta.
  function conUbicacion(encontrado: string, precision?: "edificio" | "calle" | "localidad") {
    const site = SITES["cordoba"] ?? SITES["cdmx"];
    return render(
      <PhysicsSource
        site={site}
        lat={site.lat}
        yieldKwh={site.rendimiento}
        resolucion={{ origen: "cercano", km: 7, encontrado, precision }}
      />
    );
  }

  it("imprime el nombre completo que devolvió el servicio", () => {
    const { getByText } = conUbicacion("Avenida Juárez, Cuautlancingo, Puebla, 90796, México");
    expect(getByText(/Cuautlancingo/)).toBeTruthy();
  });

  it("cuando llegó al número exacto lo dice y no pide confirmación", () => {
    const { getByText, queryByText } = conUbicacion("10, Calle Hidalgo, Salvatierra", "edificio");
    expect(getByText(/número exacto/)).toBeTruthy();
    expect(queryByText(/Confirma que sea el domicilio correcto/)).toBeNull();
  });

  it("cuando solo llegó a la calle pide confirmación y avisa del otro municipio", () => {
    const { getByText } = conUbicacion("Avenida Juárez, Cuautlancingo, Puebla", "calle");
    expect(getByText(/solo en la calle/)).toBeTruthy();
    expect(getByText(/Confirma que sea el domicilio correcto/)).toBeTruthy();
    expect(getByText(/otro municipio/)).toBeTruthy();
  });

  it("cuando solo llegó a la localidad también pide confirmación", () => {
    const { getByText } = conUbicacion("Salvatierra, Estado de Guanajuato", "localidad");
    expect(getByText(/solo en la localidad/)).toBeTruthy();
    expect(getByText(/Confirma que sea el domicilio correcto/)).toBeTruthy();
  });

  it("sin dirección encontrada no inventa el bloque", () => {
    const site = SITES["cordoba"] ?? SITES["cdmx"];
    const { queryByText } = render(
      <PhysicsSource site={site} lat={site.lat} yieldKwh={site.rendimiento}
        resolucion={{ origen: "cercano", km: 7 }} />
    );
    expect(queryByText(/Ubicado como/)).toBeNull();
  });
});

describe("el dato que desmiente el «prácticamente igual»", () => {
  it("hay ciudades medidas muy cerca cuyo rendimiento difiere más del 10 %", () => {
    // Éste es el hecho que obligó a cambiar el texto. Si dejara de ser cierto —porque alguien
    // recalculó o quitó sitios— habría que revisar el aviso, no dejarlo desactualizado.
    const V = Object.values(SITES);
    let peor = { km: 0, dif: 0, a: "", b: "" };
    for (let i = 0; i < V.length; i++) {
      for (let j = i + 1; j < V.length; j++) {
        const a = V[i];
        const b = V[j];
        const km = distanciaKm(a.lat, a.lng, b.lat, b.lng);
        if (km > 25) continue;
        const dif = Math.abs(a.rendimiento - b.rendimiento) / ((a.rendimiento + b.rendimiento) / 2) * 100;
        if (dif > peor.dif) peor = { km, dif, a: a.nombre, b: b.nombre };
      }
    }
    expect(peor.dif, `el peor par a <25 km es ${peor.a}–${peor.b} (${peor.dif.toFixed(1)} %)`)
      .toBeGreaterThan(10);
    expect(peor.km).toBeLessThan(25);
  });
});
