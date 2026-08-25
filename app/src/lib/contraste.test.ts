import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "node:fs";

/**
 * Guardián del contraste de los textos.
 *
 * Los grises y el naranja de esta paleta no se eligieron a ojo: los comentarios de `index.css`
 * cuentan que `#9a968e` daba 2.95:1 y hubo que subirlo a `#726e68` para llegar a 5.07, y que el
 * naranja de los avisos pasó de 3.92 a 4.88. Pero un comentario no falla una compilación. Hoy
 * cualquiera puede aclarar un gris «para que se vea más fino» y dejar ilegible el texto secundario
 * de toda la aplicación sin que ninguna prueba se entere.
 *
 * Importa más aquí que en una aplicación de escritorio: esto se usa en una azotea, con el teléfono
 * a pleno sol, que es la peor condición de lectura que existe. El umbral es 4.5:1 —lo que pide WCAG
 * para texto normal— y se aplica a todo, sin la excepción de 3:1 para texto grande, porque esta
 * interfaz usa tamaños pequeños en casi todas partes.
 */
const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

/** Colores de la paleta, leídos del propio CSS para que la prueba mida lo que la app usa. */
const paleta = (() => {
  const mapa = new Map<string, string>();
  for (const [, nombre, valor] of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    mapa.set(nombre, valor);
  }
  return mapa;
})();

/**
 * Colores de Tailwind que la aplicación usa por nombre y que por tanto no están en el CSS.
 * Se copian sus valores oficiales; si alguno cambiara de versión, la prueba mediría un color que
 * no es el que se pinta, así que se limita a los pocos que de verdad se usan como par de texto.
 */
const TAILWIND: Record<string, string> = {
  "amber-50": "#fffbeb",
  "amber-200": "#fde68a",
  "amber-900": "#78350f",
  "green-50": "#f0fdf4",
  white: "#ffffff",
};

const color = (nombre: string): string => {
  const v = paleta.get(nombre) ?? TAILWIND[nombre];
  if (!v) throw new Error(`no encuentro el color «${nombre}» ni en el CSS ni en la lista de Tailwind`);
  return v;
};

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Luminancia relativa según la definición de WCAG 2.2. */
const luminancia = (hex: string): number => {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Razón de contraste entre dos colores opacos. */
const contraste = (a: string, b: string): number => {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Color resultante de pintar `frente` con opacidad `alfa` encima de `fondo`.
 * Los tintes de los avisos (`bg-solar-500/5`, `bg-leaf-600/5`, `bg-amber-50/70`) son translúcidos,
 * así que medir contra el color puro daría un resultado que nadie ve.
 */
const componer = (frente: string, alfa: number, fondo: string): string => {
  const f = rgb(frente);
  const b = rgb(fondo);
  const mezcla = f.map((c, i) => Math.round(c * alfa + b[i] * (1 - alfa)));
  return "#" + mezcla.map((c) => c.toString(16).padStart(2, "0")).join("");
};

const MINIMO = 4.5;

/** Cada par es: [descripción, color del texto, color del fondo ya compuesto]. */
const pares: [string, string, string][] = [
  ["texto principal sobre el papel", color("ink"), color("paper")],
  ["texto principal sobre una tarjeta", color("ink"), color("card")],
  ["texto secundario sobre el papel", color("muted"), color("paper")],
  ["texto secundario sobre una tarjeta", color("muted"), color("card")],
  ["texto tenue sobre el papel", color("faint"), color("paper")],
  ["texto tenue sobre una tarjeta", color("faint"), color("card")],
  ["naranja como texto sobre una tarjeta", color("solar-600"), color("card")],
  ["naranja como texto sobre el papel", color("solar-600"), color("paper")],
  ["naranja sobre el tinte naranja claro", color("solar-600"), color("solar-50")],
  [
    "naranja sobre el aviso de tinte al 5 %",
    color("solar-600"),
    componer(color("solar-500"), 0.05, color("card")),
  ],
  ["verde como texto sobre una tarjeta", color("leaf-600"), color("card")],
  [
    "verde sobre su propio tinte al 5 %",
    color("leaf-600"),
    componer(color("leaf-600"), 0.05, color("card")),
  ],
  ["verde sobre el verde claro de la etiqueta «medido»", color("leaf-600"), color("green-50")],
  ["ámbar sobre su aviso al 70 %", color("amber-900"), componer(color("amber-50"), 0.7, color("card"))],
  ["blanco sobre el botón oscuro", color("white"), color("ink")],
  ["blanco sobre el botón naranja", color("white"), color("solar-600")],
  // el texto de los botones oscuros no es blanco puro sino el color del papel
  ["papel sobre el botón oscuro", color("paper"), color("ink")],
  // naranja oscuro: el renglón que dice qué falta en el unifilar, sobre tarjeta y sobre papel
  ["naranja oscuro sobre una tarjeta", color("solar-700"), color("card")],
  ["naranja oscuro sobre el papel", color("solar-700"), color("paper")],
];

/**
 * Iconos. La norma les pide 3:1 y no 4.5, porque una silueta se reconoce con menos contraste que
 * una letra. El sol de la marca es el único color que aparece solo como icono.
 */
const MINIMO_GRAFICO = 3;
const paresGrafico: [string, string, string][] = [
  ["el sol de la marca sobre el papel", color("solar-500"), color("paper")],
  ["el sol de la marca sobre una tarjeta", color("solar-500"), color("card")],
];

describe("los textos se leen a pleno sol", () => {
  for (const [que, frente, fondo] of pares) {
    it(`${que} llega a ${MINIMO}:1`, () => {
      const razon = contraste(frente, fondo);
      expect(
        razon,
        `${que}: ${frente} sobre ${fondo} da ${razon.toFixed(2)}:1, y hace falta ${MINIMO}:1`,
      ).toBeGreaterThanOrEqual(MINIMO);
    });
  }

  for (const [que, frente, fondo] of paresGrafico) {
    it(`${que} llega a ${MINIMO_GRAFICO}:1, el mínimo de un icono`, () => {
      const razon = contraste(frente, fondo);
      expect(
        razon,
        `${que}: ${frente} sobre ${fondo} da ${razon.toFixed(2)}:1, y un icono necesita ${MINIMO_GRAFICO}:1`,
      ).toBeGreaterThanOrEqual(MINIMO_GRAFICO);
    });
  }

  it("la cuenta de la razón de contraste es la de la norma", () => {
    // dos anclas conocidas: negro sobre blanco son 21:1, y un mismo color contra sí mismo, 1:1
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contraste("#4a4a4a", "#4a4a4a")).toBeCloseTo(1, 5);
  });

  it("el naranja claro se usa solo en iconos, nunca en texto", () => {
    // Da 3.41:1: suficiente para una silueta, insuficiente para una letra. Como está en la lista de
    // colores medidos, la comprobación de cobertura no se enteraría si alguien lo pusiera en un
    // párrafo, así que se vigila aparte. El indicio de que es un icono es que lleva `size`.
    const fuentes = globSync(resolve(__dirname, "../**/*.tsx")).filter((f) => !f.includes(".test."));
    for (const f of fuentes) {
      const lineas = readFileSync(f, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        if (!linea.includes("text-solar-500")) return;
        expect(
          /size=\{/.test(linea),
          `${f}:${i + 1} usa text-solar-500 en algo que no es un icono: da 3.41:1 y el texto pide 4.5`,
        ).toBe(true);
      });
    }
  });

  it("los colores que se miden son los que la aplicación pinta", () => {
    // si un color de la paleta deja de existir, `color()` lanza y la prueba de arriba falla; esto
    // vigila lo contrario: que no se añada un color de texto nuevo sin medirlo
    const fuentes = globSync(resolve(__dirname, "../**/*.tsx")).filter((f) => !f.includes(".test."));
    const usados = new Set<string>();
    for (const f of fuentes) {
      for (const [, nombre] of readFileSync(f, "utf8").matchAll(/\btext-([a-z]+-\d{2,3}|[a-z]+)\b/g)) {
        usados.add(nombre);
      }
    }
    const medidos = new Set([...pares, ...paresGrafico].map(([, frente]) => frente));
    const sinMedir = [...usados].filter((n) => {
      const hex = paleta.get(n) ?? TAILWIND[n];
      // se ignoran las utilidades que no son un color de la paleta (text-xs, text-left, text-[13px])
      return hex !== undefined && !medidos.has(hex);
    });
    expect(sinMedir, `estos colores de texto se usan y nadie mide su contraste: ${sinMedir}`).toEqual(
      [],
    );
  });
});
