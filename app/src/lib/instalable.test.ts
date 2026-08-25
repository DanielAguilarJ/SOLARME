import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { RESUMEN } from "./site";
import catalogo from "../data/panels.json";

/**
 * Guardián de la instalación en el teléfono.
 *
 * Dos cosas distintas se vigilan aquí, y ambas nacen de defectos que ya ocurrieron.
 *
 * La primera es que el manifiesto siga cumpliendo lo que un navegador exige para ofrecer
 * «instalar»: nombre, alcance, modo de ventana e iconos de 192 y 512. Si alguien recorta un campo
 * la aplicación no se rompe —sigue abriéndose en una pestaña— así que ninguna otra prueba se
 * enteraría, y el instalador simplemente dejaría de ver la opción de instalarla.
 *
 * La segunda es la regla de las RUTAS RELATIVAS, y esta es la importante. Los archivos de
 * `public/` se copian tal cual al compilar: nadie reescribe su contenido. Cuando la aplicación se
 * sirve desde un subdirectorio —como en la publicación actual, bajo «/SOLARME/»— cualquier ruta
 * absoluta que empiece por «/» apunta fuera de la aplicación. Ese exacto error, con «/sw.js», hizo
 * que el trabajador de servicio diera 404 en producción: la aplicación arrancaba, y en silencio
 * perdía el funcionamiento sin señal, que es lo que la hace útil en una azotea. Se descubrió
 * mirando la consola, no con las pruebas. Esta prueba cierra esa clase de defecto para el
 * manifiesto, que es el otro archivo de `public/` con rutas dentro.
 */
const raizApp = resolve(__dirname, "../..");
const manifiesto = JSON.parse(readFileSync(resolve(raizApp, "public/manifest.webmanifest"), "utf8"));
const html = readFileSync(resolve(raizApp, "index.html"), "utf8");

const iconos: { src: string; sizes: string; type: string; purpose?: string }[] = manifiesto.icons;

describe("la aplicación se puede instalar en el teléfono", () => {
  it("el manifiesto declara lo que el navegador exige para ofrecer la instalación", () => {
    expect(manifiesto.name).toContain("SolarMe");
    expect(manifiesto.short_name).toBe("SolarMe");
    expect(manifiesto.start_url).toBeTruthy();
    expect(manifiesto.scope).toBeTruthy();
    // sin `standalone` la aplicación se abre dentro de una pestaña, con la barra de direcciones
    // ocupando pantalla en un dispositivo donde la pantalla es el problema
    expect(manifiesto.display).toBe("standalone");
  });

  it("trae los dos tamaños de icono que pide la instalación", () => {
    const tamanos = iconos.filter((i) => i.type === "image/png").map((i) => i.sizes);
    expect(tamanos).toContain("192x192");
    expect(tamanos).toContain("512x512");
  });

  it("trae un icono recortable, porque el lanzador recorta con la forma que quiere", () => {
    const recortable = iconos.find((i) => i.purpose === "maskable");
    expect(recortable, "hace falta un icono con purpose maskable").toBeDefined();
    expect(recortable!.sizes).toBe("512x512");
  });

  it("cada icono declarado existe y no está vacío, con el tamaño que dice", () => {
    for (const icono of iconos) {
      const ruta = resolve(raizApp, "public", icono.src);
      const info = statSync(ruta); // lanza si no existe: eso es el fallo que queremos
      expect(info.size, `${icono.src} está vacío`).toBeGreaterThan(500);
    }
    // el PNG guarda su anchura en los bytes 16..20 de la cabecera IHDR; se lee del archivo en vez
    // de confiar en lo que declara el manifiesto, que es justo lo que podría estar mintiendo
    for (const icono of iconos.filter((i) => i.type === "image/png")) {
      const bytes = readFileSync(resolve(raizApp, "public", icono.src));
      const ancho = bytes.readUInt32BE(16);
      const alto = bytes.readUInt32BE(20);
      expect(`${ancho}x${alto}`, `${icono.src} no mide lo que declara`).toBe(icono.sizes);
    }
  });

  it("el icono de iOS existe: Safari ignora los del manifiesto", () => {
    const bytes = readFileSync(resolve(raizApp, "public/apple-touch-icon.png"));
    expect(bytes.readUInt32BE(16)).toBe(180);
    expect(html).toContain('rel="apple-touch-icon"');
  });

  it("el HTML enlaza el manifiesto y pide pantalla completa en los dos dialectos", () => {
    expect(html).toContain('rel="manifest"');
    // Safari no lee `display` del manifiesto; sin su propia etiqueta abre con barra de direcciones
    expect(html).toContain('name="apple-mobile-web-app-capable"');
    expect(html).toContain('name="mobile-web-app-capable"');
  });
});

describe("nada de public lleva rutas absolutas", () => {
  it("las rutas del manifiesto son relativas, así vale servido en un subdirectorio", () => {
    const rutas = [manifiesto.start_url, manifiesto.scope, ...iconos.map((i) => i.src)];
    for (const ruta of rutas) {
      expect(
        ruta.startsWith("/"),
        `«${ruta}» es absoluta: servida bajo /SOLARME/ apuntaría fuera de la aplicación`,
      ).toBe(false);
    }
  });

  it("el trabajador de servicio no vuelve a registrarse con una ruta absoluta", () => {
    // el comentario del propio archivo cita la ruta defectuosa, así que se compara sobre el
    // código sin comentarios; comprobar sobre el texto crudo daría un falso positivo
    const codigo = readFileSync(resolve(raizApp, "src/lib/offline.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/register\(\s*["'`]\//);
    // debe registrarse relativo a la base y con su propio ámbito
    expect(codigo).toMatch(/BASE_URL/);
    expect(codigo).toMatch(/scope/);
  });

  it("el sellador corrige la imagen de vista previa, que Vite no toca", () => {
    // Vite reescribe href y src, pero no el `content` de una meta: si el sellador dejara de
    // hacerlo, la vista previa apuntaría a la raíz del dominio y daría 404 en la publicación
    const sellador = readFileSync(resolve(raizApp, "scripts/sellar-sw.mjs"), "utf8");
    expect(sellador).toMatch(/og:image/);
    expect(sellador).toMatch(/SITE_URL/);
  });
});

describe("los dibujos que se sirven tal cual están bien formados", () => {
  // Un SVG mal formado se sirve con normalidad, y los rasterizadores tolerantes lo dibujan igual,
  // así que el fallo no aparece en ninguna parte hasta que un consumidor estricto lo rechaza y el
  // icono desaparece. Pasó de verdad, dos veces, y por la misma causa tonta: los comentarios de
  // estos archivos explican decisiones citando nombres de variables CSS («la de color solar» lleva
  // dos guiones delante) y opciones largas de línea de comandos, y un comentario XML no admite dos
  // guiones seguidos.
  //
  // Se comprueba con una pila de etiquetas propia y no con un parser de verdad porque el entorno de
  // pruebas de este proyecto no monta un DOM completo. No pretende ser un validador de XML: detecta
  // comentarios ilegales, etiquetas descompensadas y ampersands sin escapar, que son los tres
  // errores que se cometen escribiendo estos archivos a mano.
  const svgs = ["favicon.svg", "icono-app.svg", "vista-previa.svg"];

  const etiquetasDescompensadas = (texto: string): string[] => {
    const sinComentarios = texto.replace(/<!--[\s\S]*?-->/g, "");
    const pila: string[] = [];
    for (const m of sinComentarios.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
      const [, cierre, nombre, autocierre] = m;
      if (autocierre) continue;
      if (cierre) {
        if (pila.pop() !== nombre) return [`cierre inesperado de <${nombre}>`];
      } else {
        pila.push(nombre);
      }
    }
    return pila.map((n) => `<${n}> quedó sin cerrar`);
  };

  for (const nombre of svgs) {
    it(`${nombre} no lleva dos guiones seguidos dentro de un comentario`, () => {
      const texto = readFileSync(resolve(raizApp, "public", nombre), "utf8");
      for (const [, cuerpo] of texto.matchAll(/<!--([\s\S]*?)-->/g)) {
        expect(cuerpo.includes("--"), `${nombre}: un comentario XML no admite «--»`).toBe(false);
      }
    });

    it(`${nombre} tiene las etiquetas balanceadas y el texto escapado`, () => {
      const texto = readFileSync(resolve(raizApp, "public", nombre), "utf8");
      expect(etiquetasDescompensadas(texto), nombre).toEqual([]);
      // un & suelto rompe el parseo igual que el comentario; solo valen entidades
      const sueltos = [...texto.matchAll(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/g)];
      expect(sueltos.length, `${nombre}: hay un & sin escapar`).toBe(0);
      expect(texto).toContain("<svg");
    });
  }

  it("la lámina de vista previa mide lo que declaran las etiquetas", () => {
    const bytes = readFileSync(resolve(raizApp, "public/vista-previa.png"));
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    expect(html).toContain('content="1200"');
    expect(html).toContain('content="630"');
  });

  it("las cifras de la lámina son las mismas que la aplicación afirma", () => {
    // si mañana hay 110 sitios medidos y nadie regenera la lámina, el enlace compartido miente.
    // Se leen de la MISMA fuente que la portada: RESUMEN.sitios y el catálogo de módulos.
    const lamina = readFileSync(resolve(raizApp, "public/vista-previa.svg"), "utf8");
    expect(lamina).toContain(`${RESUMEN.sitios} ciudades medidas`);
    expect(lamina).toContain(`${catalogo.panels.length} módulos reales`);
  });
});
