import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guardián de propiedades de CSS cuyo error no se ve en pantalla pero rompe el uso real.
 *
 * Existe porque un defecto real pasó desapercibido a 621 pruebas: `input[type=range]` tenía
 * `height:3px`, y como el área táctil de un deslizador es la CAJA del elemento y no el pulgar que
 * se pinta encima, en un teléfono solo se podía agarrar dentro de una banda de tres píxeles. Se veía
 * perfecto en la captura. Un instalador en una azotea no habría podido mover el control.
 */
const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

const bloque = (selector: string) => {
  const i = css.indexOf(selector);
  if (i < 0) return "";
  const j = css.indexOf("}", i);
  return css.slice(i, j);
};

describe("el CSS mantiene las áreas tocables", () => {
  it("el deslizador tiene caja alta, no la altura de su barra", () => {
    const b = bloque('input[type="range"]{');
    expect(b).not.toBe("");
    const alto = /height:\s*(\d+)px/.exec(b);
    expect(alto, "el bloque del deslizador debe fijar una altura").not.toBeNull();
    expect(Number(alto![1])).toBeGreaterThanOrEqual(36);
  });

  it("la barra de 3 px se dibuja en el pseudoelemento, no en la caja", () => {
    expect(css).toContain("::-webkit-slider-runnable-track");
    expect(bloque("::-webkit-slider-runnable-track{")).toMatch(/height:\s*3px/);
  });

  it("el pulgar se centra sobre la barra con margen negativo", () => {
    expect(bloque("::-webkit-slider-thumb{")).toMatch(/margin-top:\s*-7\.5px/);
  });

  it("Firefox recibe sus propios prefijos", () => {
    expect(css).toContain("::-moz-range-track");
    expect(css).toContain("::-moz-range-thumb");
  });

  it("el deslizador conserva un foco visible", () => {
    expect(css).toContain("focus-visible::-webkit-slider-thumb");
  });

  it("las utilidades de texto chico siguen dentro de @layer components", () => {
    // Fuera de la capa, Tailwind las gana por especificidad y el texto se encoge otra vez.
    const capa = css.indexOf("@layer components");
    expect(capa).toBeGreaterThan(-1);
    for (const clase of [".txt-micro", ".txt-mini", ".fld"]) {
      expect(css.indexOf(clase), `${clase} debe declararse tras @layer components`)
        .toBeGreaterThan(capa);
    }
  });
});

/**
 * El unifilar dibuja los símbolos en una rejilla y los datos en otra. Si las dos dejan de tener el
 * mismo número de columnas, los símbolos se desalinean de sus etiquetas y nadie lo nota: compila,
 * no desborda y las pruebas de contenido siguen verdes. Sólo se ve mirando el dibujo.
 */
describe("el dibujo del unifilar comparte rejilla con sus datos", () => {
  const tsx = readFileSync(
    new URL("../components/Unifilar.tsx", import.meta.url), "utf8"
  );

  it("el trazo y la tabla declaran el mismo número de columnas", () => {
    const cols = [...tsx.matchAll(/sm:grid-cols-(\d+)/g)].map((m) => Number(m[1]));
    expect(cols.length).toBe(2); // el trazo y la lista de datos
    expect(new Set(cols).size).toBe(1);
    expect(cols[0]).toBe(6); // seis elementos: módulos, CC, inversor, CA, medidor, red
  });

  it("el trazo mide un pixel y cruza la separación de la rejilla", () => {
    expect(tsx).toMatch(/h-px/);
    expect(tsx).toMatch(/marginRight: -12/);
  });

  it("el símbolo se repite en teléfono y se oculta en escritorio, sin duplicarse", () => {
    expect(tsx).toMatch(/sm:hidden/);   // el símbolo dentro de los datos, sólo en teléfono
    expect(tsx).toMatch(/hidden sm:grid/); // el trazo, sólo en escritorio
  });
});

/**
 * La app no tiene cuentas. Cualquier nombre propio, inicial o cargo escrito a mano en el armazón es
 * una afirmación falsa sobre quién está usando el producto, y nadie la detecta mirando: parece un
 * perfil normal. Esto la detecta.
 */
describe("el armazón no finge una sesión que no existe", () => {
  const shell = ["Sidebar", "Topbar", "MobileNav"].map((n) => ({
    n,
    src: readFileSync(new URL(`../components/shell/${n}.tsx`, import.meta.url), "utf8"),
  }));

  it("ninguna pieza trae un nombre propio ni un cargo escritos a mano", () => {
    expect(shell.length).toBe(3); // que el bucle corrió
    for (const { n, src } of shell) {
      // Se ignoran los comentarios: ahí sí se explica qué se quitó y por qué.
      const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(codigo, n).not.toMatch(/Daniel|Ing\.\s|Renovables|Mi cuenta|Cerrar sesi/);
    }
  });

  it("el pie de la barra dice dónde vive el trabajo y ofrece respaldarlo", () => {
    const s = shell.find((x) => x.n === "Sidebar")!.src;
    expect(s).toMatch(/Sólo en este navegador/);
    expect(s).toMatch(/Respaldar/);
    // Los contactos cuentan como trabajo, y la barra no se desmonta: tiene que SUSCRIBIRSE, no
    // leer una vez. Se comprueba la suscripción, no el nombre de la función que lee.
    // Las agujas sueltas no servían: `contactos` aparece 6 veces en el archivo (comentarios,
    // variable, texto) y `useSyncExternalStore`/`suscribir` aparecen dos veces cada una, así que
    // los IMPORTS por sí solos las satisfacían. Comprobado por mutación: sustituir la suscripción
    // por una lectura única, dejando los imports usados con `void`, pasaba tsc, oxlint Y la prueba.
    // Se fija la FORMA de la llamada, que es lo que hace que la cuenta no quede atrasada.
    expect(s).toMatch(/useSyncExternalStore\(\s*suscribir\s*,\s*contarContactos/);
    // y que la cuenta se rinda de verdad, con su plural
    expect(s).toMatch(/contactos === 1 \?/);
  });
});

/**
 * Que el reparto esté cableado donde se muestra, no solo que exista.
 *
 * Se probó `repartirEnteros` a fondo y aun así devolver el gráfico a `Math.round` por mes pasaba
 * todas las pruebas: se estaba probando el ayudante y no su uso. Como con la suscripción de la barra
 * lateral, se fija la FORMA de la llamada y no la mera presencia del identificador.
 */
describe("los desgloses mostrados usan el reparto entero", () => {
  const leer = (ruta: string) =>
    readFileSync(new URL(ruta, import.meta.url), "utf8");

  it("el gráfico mensual reparte los doce contra el anual", () => {
    const s = leer("../components/MonthlyChart.tsx");
    expect(s).toMatch(/repartirEnteros\(\s*data\.map\(\(d\) => d\.kwh\)\s*,\s*annualKwh\s*\)/);
    // y que no queden meses redondeados por su cuenta en las etiquetas
    expect(s).not.toMatch(/\{fmt\(Math\.round\(d\.kwh\)\)\}/);
  });

  it("la pestaña financiera reparte los porcentajes del desglose", () => {
    const s = leer("../views/AnalysisView.tsx");
    expect(s).toMatch(/porcentajesEnteros\(\s*r\.costs\.lines\.map\(\(l\) => l\.share\)\s*\)/);
    expect(s).not.toMatch(/\{Math\.round\(l\.share \* 100\)\}%/);
  });

  it("la propuesta impresa también", () => {
    const s = leer("./proposal.ts");
    expect(s).toMatch(/porcentajesEnteros\(r\.costs\.lines\.map\(\(l\) => l\.share\)\)/);
    expect(s).not.toMatch(/Math\.round\(l\.share \* 100\)/);
  });
});

/**
 * Cableado crítico: la función existe y está probada, pero nadie comprobaba que se la llame.
 *
 * Encontrado desconectando cada punto y viendo si la suite se enteraba:
 *
 *     ajusteTermico    desconectado → 6 pruebas fallan   ✔
 *     cityOfProject    desconectado → 0 pruebas fallan   ✘
 *     ajustarAlConsumo desconectado → 0 pruebas fallan   ✘
 *
 * El de `cityOfProject` es el grave: es el mismo defecto que ya apareció una vez en esta sesión. Al
 * abrir un proyecto donde el instalador escribió una calle y eligió la ciudad del desplegable,
 * resolver con `matchCity(p.address)` pierde en silencio el rendimiento medido, la inclinación
 * óptima, la forma mensual y las temperaturas extremas de las que depende el dimensionado de series.
 * Volvería a colarse sin que nada fallara.
 *
 * Sin pruebas de componente esto solo puede guardarse mirando la fuente. No es equivalente a una
 * prueba de comportamiento y conviene no confundirlas: fija la llamada, no el efecto.
 */
describe("el cableado crítico está en su sitio", () => {
  const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

  it("abrir un proyecto resuelve la ciudad con cityOfProject, no con la dirección sola", () => {
    const s = leer("../App.tsx");

    // Una coincidencia DÉBIL —el nombre casó en el segmento donde va el estado— tiene que llegar
    // a `resolveSite`. El `return` de antes se disparaba con cualquier coincidencia, así que el
    // arreglo del secuestro por nombre de estado era inalcanzable desde la interfaz: «Fortín de
    // las Flores, Veracruz» seguía usando Veracruz puerto. Se vio en el navegador, no leyendo.
    expect(s).toMatch(/if \(m\.matched && !m\.debil\) return;/);

    // Una resolución «catalogo» con motivo NO es el promedio nacional: la física que se usa es de
    // esa ciudad. Tratarla como promedio hacía que la interfaz declarara «promedio de 102
    // ciudades» mientras los números venían de una sola, y dejaba inalcanzable el aviso que
    // explica el caso. Y una respuesta obsoleta debe descartarse antes de tocar el estado.
    expect(s).toMatch(/if \(!vigente\) return;/);
    expect(s).toMatch(/if \(r\.origen === "catalogo"\)/);

    // `replaceProjects` devuelve la lista DESPOJADA de física y de BOS. Usar su retorno como
    // estado de React le quitaba esos datos a todos los proyectos en memoria, y los números de la
    // cartera cambiaban solos. Se persiste con ella y se conserva la lista completa.
    expect(s, "no uses el retorno de replaceProjects como estado")
      .not.toMatch(/return replaceProjects\(/);
    expect(s, "no uses el retorno de replaceProjects como estado")
      .not.toMatch(/setProjects\(\(l\) => replaceProjects\(/);
    expect(s, "una respuesta obsoleta no debe pisar el estado con «promedio»")
      .not.toMatch(/!vigente \|\| r\.origen/);
    expect(s).toMatch(/cityOfProject\(p\)/);
    // y que no vuelva a resolverse por dirección en ese camino
    expect(s).not.toMatch(/matchCity\(p\.address\)/);
  });

  it("la caja de excedente consulta el ajuste al consumo", () => {
    const s = leer("../views/AnalysisView.tsx");
    expect(s).toMatch(/ajustarAlConsumo\(r\)/);
    // y ofrece aplicarlo, que es lo que lo vuelve accionable
    expect(s).toMatch(/arregloTope: a\.arreglo/);
  });

  it("la energía lleva la corrección térmica del módulo", () => {
    const s = leer("./solar.ts");
    expect(s).toMatch(/ajusteTermico\(d\.panel\.temp, d\.site\)/);
  });

  /**
   * Inicio existe para decir qué le falta a cada proyecto: sustituyó una lista de tareas con dos
   * pasos imposibles que decían «2 de 4» para siempre. Desconectada, la pantalla no mostraría ningún
   * hallazgo y no habría error. Comprobado: 0 pruebas fallaban.
   */
  it("la pantalla de inicio revisa cada proyecto y resume la cartera", () => {
    const s = leer("../views/HomeView.tsx");
    expect(s).toMatch(/revisarProyecto\(p\)/);
    expect(s).toMatch(/resumenCartera\(projects\)/);
  });

  it("la dirección que encontró el servicio llega a la interfaz", () => {
    const s = leer("../App.tsx");

    // `Punto.descripcion` se documenta «para que el instalador confirme», y App lo descartaba:
    // una coincidencia en otro municipio —medido, «Avenida Juárez 1910, Puebla» resuelve a
    // Cuautlancingo— entraba callada en la cotización. Las pruebas de componente NO cazan esto:
    // verifican el componente con datos que ellas mismas le pasan, no que la app se los pase.
    expect(s, "App debe pasar la dirección encontrada").toMatch(
      /encontrado: r\.punto\?\.descripcion/
    );
    expect(s, "App debe pasar el nivel de ubicación").toMatch(/precision: r\.precision/);
  });

  it("el plano declara de dónde sale su geometría y no promete un proveedor", () => {
    const s = leer("../views/AnalysisView.tsx");

    // La esquina del lienzo decía «Vista simulada · en producción: Google Solar API»: una nota de
    // hoja de ruta en la interfaz, y FIJA, así que con techo medido la franja de arriba diría
    // «Techo medido por satélite» y esta esquina «simulada», del mismo techo.
    expect(s, "no debe prometer un proveedor en la interfaz").not.toMatch(
      /en producción: Google Solar API/
    );
    expect(s, "debe distinguir el techo medido").toMatch(/Plano a escala del techo medido/);
    expect(s, "debe distinguir el contorno trazado").toMatch(/r\.outlineMedido/);
  });

  it("el límite de error envuelve la aplicación entera", () => {
    const s = leer("../main.tsx");

    // Si alguien lo desmonta, un fallo de renderizado vuelve a dejar la pantalla en blanco y el
    // instalador cree que perdió su cartera. Las pruebas del componente no lo cazan: verifican
    // el límite aislado, no que esté puesto donde tiene que estar.
    expect(s, "main.tsx debe montar el límite").toMatch(/<ErrorBoundary>/);
    expect(s, "y debe envolver App").toMatch(/<ErrorBoundary>[\s\S]*<App \/>[\s\S]*<\/ErrorBoundary>/);
  });

  it("la cartera se carga validada, no con un casting a ciegas", () => {
    const s = leer("../App.tsx");

    // `loadProjects` devuelve `parsed as Project[]`. Un proyecto malformado en el almacén entraba
    // en el estado y podía romper el renderizado; con el límite de error puesto, «volver a
    // intentar» relee la misma entrada mala y el instalador queda encerrado.
    // La guarda mira el nombre sin exigir la forma de la llamada: pasó de `cargarCarteraSegura()`
    // a `useState(cargarCarteraSegura)` al conservar también el conteo de descartados, y una guarda
    // que se rompe con una mejora legítima solo enseña a relajar guardas.
    expect(s, "App debe usar el cargador validado").toMatch(/cargarCarteraSegura/);
    // Lo que de verdad protege es esto: la cartera NO puede venir del cargador crudo.
    expect(s, "y no el crudo").not.toMatch(/useState<Project\[\]>\(\(\) => loadProjects\(\)\)/);
    // No basta con que la palabra aparezca —sale también en el texto de la franja—: el aviso
    // tiene que DERIVAR del conteo. Con una constante en su lugar, un proyecto dañado
    // desaparecería en silencio y la palabra seguiría ahí.
    expect(s, "el aviso debe derivar del conteo, no de una constante").toMatch(
      /useState\(carteraInicial\.descartados\s*>\s*0\)/
    );
    // Y tiene que pintarse: calcularlo sin mostrarlo sería exactamente el defecto original.
    expect(s, "la franja de proyectos dañados debe renderizarse").toMatch(
      /\{avisoDescartados && \(/
    );
  });

  it("las cifras de la portada salen del dato, no de la memoria de quien escribió el texto", () => {
    const s = leer("../views/HomeView.tsx");

    // Decía «93 sitios medidos» cuando ya eran 102, en la PRIMERA pantalla que ve un cliente. Se
    // detectó mirando la app en un teléfono, no leyendo el código: ninguna prueba podía fallar
    // porque el número estaba escrito a mano y era coherente consigo mismo.
    expect(s, "el número de sitios debe contarse").toMatch(/RESUMEN\.sitios/);
    expect(s, "y el de estados también").toMatch(/RESUMEN\.estados/);
    expect(s, "el catálogo de módulos también se cuenta").toMatch(/catalogo\.panels\.length/);
    // Ninguna cifra de catálogo escrita a mano en el texto visible.
    expect(s, "no debe quedar un conteo a mano").not.toMatch(/\d{2,3} (sitios|módulos)/);
  });

  it("la app dice cuando dejó de guardar", () => {
    const s = leer("../App.tsx");

    // El `catch` de `persist` estaba vacío: el trabajo no se guardaba, el instalador lo veía en
    // pantalla y lo perdía al cerrar. Que el almacén lo declare no sirve si nadie lo muestra.
    expect(s, "App debe escuchar el estado del guardado").toMatch(/suscribirGuardado/);
    expect(s, "y debe pintar la franja").toMatch(/\{noGuarda && \(/);
    expect(s, "con la salida a respaldar").toMatch(/Ir a respaldar/);
  });

  it("el título de la página no promete lo que la app no hace", () => {
    const html = leer("../../index.html");

    // Decía que el diseño era «por satélite» mientras la app corre en modo estimado y el propio
    // lienzo declara que el techo lo capturó el instalador. Era la sobreafirmación más visible que
    // quedaba: la pestaña del navegador y el resultado de búsqueda.
    //
    // La guarda es negativa a propósito: no fija UN texto —el copy debe poder mejorar— sino que
    // impide volver a titular una capacidad que no existe. Cuando haya imagen aérea, se relaja.
    const visible = html.replace(/<!--[\s\S]*?-->/g, "");
    expect(visible, "el título no debe prometer satélite").not.toMatch(/<title>[^<]*sat[eé]lite/i);
    expect(visible, "ni la descripción").not.toMatch(
      /name="description"[^>]*sat[eé]lit/i
    );
    // Y debe seguir declarando lo que sí es cierto y medible.
    expect(visible).toMatch(/<title>[^<]*SolarMe/);
    expect(visible).toMatch(/name="description"/);
  });

  it("la salvedad de la norma mexicana sigue visible para quien firma", () => {
    // Se retiró del documento del cliente, donde era lenguaje de auditoría y una orden al
    // instalador. Pero el dato es real y le importa a quien pone su registro en un plano, así que
    // tiene que seguir EN LA APP. Sin esta guarda, quitarla del documento la habría hecho
    // desaparecer del producto entero sin que nada se quejara.
    const uni = leer("../components/Unifilar.tsx");
    const str = leer("../components/StringSizing.tsx");
    expect(uni, "el unifilar debe declarar la salvedad").toMatch(/NOM-001-SEDE/);
    expect(uni).toMatch(/antes de firmar un plano/);
    expect(str, "el dimensionado de series también").toMatch(/NOM-001-SEDE/);
  });

  it("la libreta no le miente al instalador sobre la propuesta", () => {
    const libreta = leer("../components/Installers.tsx");
    const prop = leer("./proposal.ts");

    // La libreta decía «sin él la propuesta no se puede entregar». Falso: `proposal.ts` genera el
    // documento sin responsable y lo marca «Sin asignar». Un texto que contradice lo que hace el
    // producto es peor que no tener texto.
    expect(prop, "la propuesta sí funciona sin firmante").toMatch(/Sin asignar/);
    expect(libreta, "la libreta no debe afirmar lo contrario").not.toMatch(
      /no se puede entregar/
    );
  });

  it("el offline no depende de una versión de service worker congelada", () => {
    // Medido cortando la red sobre el build: `sw.js` se copia verbatim y su VERSION quedaba fija,
    // así que un despliegue nuevo no invalidaba la caché y un usuario sin señal se quedaba con un
    // cascarón que pedía un asset que ya no existía. Lo arregla `scripts/sellar-sw.mjs`, que
    // reescribe VERSION y ESENCIALES en cada build. Esta guarda vigila las dos puntas del cableado.
    const pkg = leer("../../package.json");
    expect(pkg, "el build debe sellar el SW").toContain("scripts/sellar-sw.mjs");

    const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    // El fuente lleva un placeholder a propósito: si alguien fija aquí una versión «real», la caché
    // dejaría de invalidarse entre despliegues sin que nada avise.
    expect(sw, "el SW fuente debe ser un placeholder que el build sella").toMatch(
      /const VERSION = "solarme-dev";/
    );
  });

  it("el producto usa un solo término: «módulos», también en la navegación", () => {
    // El producto mezclaba «paneles» y «módulos». Se unificó a «módulos» (dominaba 89 a 16 y es
    // el término del catálogo y la propuesta), pero la primera pasada dejó fuera la barra inferior
    // de móvil, que es un componente aparte de la lateral. Esta guarda cubre las DOS navegaciones,
    // que es justo donde se escondió la inconsistencia.
    const lateral = leer("../components/shell/Sidebar.tsx");
    const inferior = leer("../components/shell/MobileNav.tsx");
    // La etiqueta visible no debe ser «Paneles»; la clave de ruta interna «paneles» sí se conserva.
    expect(lateral, "barra lateral").not.toMatch(/label: "Paneles"/);
    expect(inferior, "barra inferior de móvil").not.toMatch(/label: "Paneles"/);
    expect(lateral).toMatch(/label: "Módulos"/);
    expect(inferior).toMatch(/label: "Módulos"/);
    // Y el título del catálogo tampoco vuelve a «paneles».
    expect(leer("../components/Catalog.tsx")).not.toMatch(/Catálogo de paneles/);
    // La paleta de comandos también tenía un «Catálogo de paneles» que se escapó.
    expect(leer("../components/CommandPalette.tsx")).not.toMatch(/de paneles/);
  });

  it("la app monta el aviso de privacidad y es alcanzable en escritorio y móvil", () => {
    // Elemento legalmente obligatorio en México (trata domicilios de clientes). Debe estar
    // montado y con acceso en las dos superficies: el pie del sidebar (escritorio) y la
    // paleta de comandos (alcanzable en móvil por la lupa).
    const app = leer("../App.tsx");
    expect(app, "el modal debe montarse").toMatch(/<AvisoPrivacidad/);
    expect(leer("../components/shell/Sidebar.tsx"), "enlace en escritorio").toMatch(
      /Aviso de privacidad/
    );
    expect(leer("../components/CommandPalette.tsx"), "acción en la paleta").toMatch(
      /Aviso de privacidad/
    );
  });

  it("el mapa para ajustar el techo está montado y cableado a la física", () => {
    // Corrige el problema medido de que solo 2/8 direcciones caen en la casa. Al confirmar un
    // punto a mano hay que RECALCULAR el sitio medido cercano, no solo mover el pin; si no, la
    // física seguiría en el domicilio viejo. La guarda vigila las dos puntas.
    const app = leer("../App.tsx");
    expect(app, "el modal debe montarse").toMatch(/<MapaUbicacion/);
    expect(app, "confirmar debe recalcular el sitio").toMatch(/nearestSite\(lat, lng\)/);
    expect(app, "y pasar el disparador a la vista").toMatch(/onAjustarUbicacion=/);
  });

  it("el conductor y la protección se dimensionan con el sitio", () => {
    const s = leer("./solar.ts");
    expect(s).toMatch(/dimensionarCircuito\(\{[\s\S]*?\},\s*d\.site\)/);
  });
});
