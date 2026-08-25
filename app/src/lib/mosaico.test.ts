import { describe, expect, it } from "vitest";
import {
  LADO_MODULO_M,
  LADO_MOSAICO,
  LAT_MAX,
  aFraccion,
  metrosPorPixel,
  mosaicosPorLado,
  resolucionSuficiente,
  urlDeMosaico,
  vistaPara,
  zoomParaResolucion,
  type FuenteMosaico,
  aCoordenada,
  desplazar,} from "./mosaico";

const CDMX = { lat: 19.4326, lon: -99.1332 };
const MEXICALI = { lat: 32.6519, lon: -115.4683 };

const fuente: FuenteMosaico = {
  nombre: "Prueba",
  plantilla: "https://ejemplo.test/{z}/{x}/{y}.jpg",
  credito: "Fuente: Prueba",
  zoomMax: 19,
};

describe("la coordenada de mosaico corresponde al lugar", () => {
  it("el meridiano y el ecuador caen en el centro exacto del mundo", () => {
    const f = aFraccion(0, 0, 1);
    expect(f.x).toBeCloseTo(1, 10);
    expect(f.y).toBeCloseTo(1, 10);
  });

  it("crece hacia el este y hacia el sur, como el esquema de mosaicos", () => {
    const a = aFraccion(CDMX.lat, CDMX.lon, 12);
    const este = aFraccion(CDMX.lat, CDMX.lon + 0.5, 12);
    const sur = aFraccion(CDMX.lat - 0.5, CDMX.lon, 12);
    expect(este.x).toBeGreaterThan(a.x);
    expect(sur.y).toBeGreaterThan(a.y);
  });

  it("una longitud fuera de rango se envuelve, no se recorta", () => {
    // -190° ES una longitud válida: es 170°. Recortarla mandaría el mosaico al lado opuesto.
    expect(aFraccion(0, -190, 4).x).toBeCloseTo(aFraccion(0, 170, 4).x, 10);
  });

  it("la latitud se acota al límite de la proyección en vez de irse a infinito", () => {
    const n = mosaicosPorLado(6);
    for (const lat of [89.9, 90, 120, -90, -140]) {
      const f = aFraccion(lat, 0, 6);
      expect(Number.isFinite(f.y)).toBe(true);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeLessThanOrEqual(n);
    }
    // El polo acotado coincide con el límite declarado de Mercator.
    expect(aFraccion(90, 0, 6).y).toBeCloseTo(aFraccion(LAT_MAX, 0, 6).y, 6);
  });
});

describe("los metros por píxel dicen si la imagen sirve", () => {
  it("en el ecuador a zoom 0 un píxel vale unos 156 km", () => {
    expect(metrosPorPixel(0, 0)).toBeCloseTo(156543, 0);
  });

  it("cada nivel de acercamiento parte a la mitad el tamaño del píxel", () => {
    for (const z of [8, 12, 17]) {
      expect(metrosPorPixel(CDMX.lat, z + 1)).toBeCloseTo(metrosPorPixel(CDMX.lat, z) / 2, 9);
    }
  });

  it("la misma imagen rinde menos suelo por píxel cuanto más al norte", () => {
    // Mercator estira hacia los polos: a igual zoom, Mexicali tiene MÁS detalle real que CDMX.
    expect(metrosPorPixel(MEXICALI.lat, 18)).toBeLessThan(metrosPorPixel(CDMX.lat, 18));
  });

  it("descarta las capas del INEGI para trazar un techo, con la cuenta a la vista", () => {
    // Este es el hallazgo que motivó el módulo: la licencia del INEGI permite uso comercial,
    // pero sus capas servibles son demasiado gruesas. Un módulo mide 1.13 m de lado corto.
    const ortofoto = 1.5; // escala 1:10 000
    const rapideye = 5;
    const landsat = 30;
    for (const m of [ortofoto, rapideye, landsat]) {
      expect(LADO_MODULO_M / m).toBeLessThan(4); // menos de 4 píxeles por módulo
    }
    expect(LADO_MODULO_M / landsat).toBeLessThan(1); // una casa entera es un píxel
  });

  it("trazar el contorno de un techo y colocar módulos NO piden el mismo detalle", () => {
    // Medido, y corrige un supuesto mío: a zoom 18 en CDMX el píxel vale 0.563 m, así que un
    // módulo de 1.13 m ocupa 2.0 píxeles. Alcanza para dibujar el CONTORNO de un techo —un techo
    // de 8 m son 14 píxeles de lado— pero no para colocar módulos uno por uno sobre la imagen.
    const p18 = metrosPorPixel(CDMX.lat, 18);
    expect(p18).toBeCloseTo(0.563, 3);
    expect(LADO_MODULO_M / p18).toBeCloseTo(2.0, 1);
    expect(8 / p18).toBeGreaterThan(12); // el techo sí se distingue

    expect(resolucionSuficiente(CDMX.lat, 18)).toBe(false);
    expect(resolucionSuficiente(CDMX.lat, 19)).toBe(true);
  });

  it("por debajo de zoom 18 no alcanza para nada de esto", () => {
    for (const z of [12, 14, 16, 17]) {
      expect(resolucionSuficiente(CDMX.lat, z)).toBe(false);
    }
  });

  it("el criterio se puede aflojar, y entonces zoom 18 sí pasa", () => {
    // Dos píxeles por módulo es lo que hay a zoom 18; el valor por omisión es exigente a
    // propósito, pero la vista puede pedir un criterio explícito y quedar documentada.
    expect(resolucionSuficiente(CDMX.lat, 18, LADO_MODULO_M, 2)).toBe(true);
  });

  it("el zoom pedido es el más bajo que cumple, no uno de más", () => {
    // Cada nivel extra cuadruplica los mosaicos: pedir de más se paga en espera.
    const z = zoomParaResolucion(CDMX.lat, 0.5);
    expect(metrosPorPixel(CDMX.lat, z)).toBeLessThanOrEqual(0.5);
    expect(metrosPorPixel(CDMX.lat, z - 1)).toBeGreaterThan(0.5);
  });

  it("un objetivo imposible devuelve el tope en vez de un bucle o un NaN", () => {
    expect(zoomParaResolucion(CDMX.lat, 0)).toBe(22);
    expect(zoomParaResolucion(CDMX.lat, -1)).toBe(22);
    expect(Number.isInteger(zoomParaResolucion(CDMX.lat, 1e-9))).toBe(true);
  });
});

describe("la vista cubre el lienzo y centra el domicilio", () => {
  it("el domicilio cae exactamente en el centro del lienzo", () => {
    const v = vistaPara(CDMX.lat, CDMX.lon, 18, 640, 480);
    expect(v.centro.px).toBeCloseTo(320, 6);
    expect(v.centro.py).toBeCloseTo(240, 6);
  });

  it("los mosaicos tapan todo el lienzo sin dejar hueco", () => {
    const ancho = 700;
    const alto = 500;
    const v = vistaPara(CDMX.lat, CDMX.lon, 17, ancho, alto);
    expect(v.mosaicos.length).toBeGreaterThan(0);
    // Cada esquina y el centro del lienzo tienen que caer dentro de algún mosaico.
    const puntos = [
      [0, 0],
      [ancho - 1, 0],
      [0, alto - 1],
      [ancho - 1, alto - 1],
      [ancho / 2, alto / 2],
    ];
    for (const [px, py] of puntos) {
      const tapado = v.mosaicos.some(
        (m) =>
          px >= m.izquierda &&
          px < m.izquierda + LADO_MOSAICO &&
          py >= m.arriba &&
          py < m.arriba + LADO_MOSAICO
      );
      expect(tapado).toBe(true);
    }
  });

  it("no pide dos veces el mismo mosaico", () => {
    const v = vistaPara(CDMX.lat, CDMX.lon, 16, 800, 600);
    const claves = new Set(v.mosaicos.map((m) => `${m.z}/${m.x}/${m.y}`));
    expect(claves.size).toBe(v.mosaicos.length);
  });

  it("no pide mosaicos que no existen arriba ni abajo del mundo", () => {
    const n = mosaicosPorLado(3);
    const v = vistaPara(LAT_MAX, 0, 3, 900, 900);
    for (const m of v.mosaicos) {
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThan(n);
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThan(n);
    }
  });

  it("informa de la resolución con la que se pintó, para poder avisar", () => {
    const v = vistaPara(CDMX.lat, CDMX.lon, 18, 400, 400);
    expect(v.metrosPorPixel).toBeCloseTo(metrosPorPixel(CDMX.lat, 18), 12);
  });
});

describe("la atribución no se puede omitir", () => {
  it("arma la URL sustituyendo los tres marcadores", () => {
    const v = vistaPara(CDMX.lat, CDMX.lon, 18, 256, 256);
    const url = urlDeMosaico(fuente, v.mosaicos[0]);
    expect(url).toMatch(/^https:\/\/ejemplo\.test\/18\/\d+\/\d+\.jpg$/);
  });

  it("una fuente sin crédito falla en voz alta en vez de pintar sin atribución", () => {
    // Los Términos de Libre Uso del INEGI —y los de cualquier proveedor— exigen crédito.
    // Que el tipo lo pida no basta: una cadena vacía compila.
    expect(() => urlDeMosaico({ ...fuente, credito: "   " }, { z: 1, x: 0, y: 0, izquierda: 0, arriba: 0 })).toThrow(
      /crédito/
    );
  });
});

describe("el inverso de la proyección permite arrastrar el pin", () => {
  const CDMX = { lat: 19.4326, lon: -99.1332 };

  it("ir a fracción y volver devuelve el mismo punto", () => {
    for (const z of [12, 16, 18, 20]) {
      const f = aFraccion(CDMX.lat, CDMX.lon, z);
      const v = aCoordenada(f.x, f.y, z);
      expect(v.lat, `lat z${z}`).toBeCloseTo(CDMX.lat, 9);
      expect(v.lon, `lon z${z}`).toBeCloseTo(CDMX.lon, 9);
    }
  });

  it("sin desplazamiento no mueve nada", () => {
    const v = desplazar(CDMX.lat, CDMX.lon, 18, 0, 0);
    expect(v.lat).toBeCloseTo(CDMX.lat, 9);
    expect(v.lon).toBeCloseTo(CDMX.lon, 9);
  });

  it("a la derecha aumenta la longitud; hacia abajo baja la latitud", () => {
    const v = desplazar(CDMX.lat, CDMX.lon, 18, 40, 40);
    expect(v.lon, "dpx>0 va al este").toBeGreaterThan(CDMX.lon);
    expect(v.lat, "dpy>0 va al sur").toBeLessThan(CDMX.lat);
  });

  it("el tamaño del paso concuerda con los metros por píxel del nivel", () => {
    // Arrastrar un píxel debe mover, en metros, lo que vale un píxel a esa latitud y zoom.
    const mpp = metrosPorPixel(CDMX.lat, 18);
    const v = desplazar(CDMX.lat, CDMX.lon, 18, 100, 0);
    // distancia este-oeste aproximada en metros
    const metros = Math.abs(v.lon - CDMX.lon) * 111320 * Math.cos((CDMX.lat * Math.PI) / 180);
    expect(metros).toBeCloseTo(100 * mpp, 0);
  });

  it("un arrastre y su opuesto se cancelan", () => {
    const ida = desplazar(CDMX.lat, CDMX.lon, 19, 63, -27);
    const vuelta = desplazar(ida.lat, ida.lon, 19, -63, 27);
    expect(vuelta.lat).toBeCloseTo(CDMX.lat, 9);
    expect(vuelta.lon).toBeCloseTo(CDMX.lon, 9);
  });
});
