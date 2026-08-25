import type { Contacto } from "./contactos";
import { describe, it, expect } from "vitest";
import { buildProposal } from "./proposal";
import { CITIES, compute, GD_LIMIT_KW, type Design, type Panel } from "./solar";

const panel: Panel = {
  brand: "Test", model: "T-550", w: 550, eff: 21.3, temp: -0.34,
  area: 2.58, voc: 49.9, vmp: 41.8, isc: 14.0, imp: 13.2, betaVoc: -0.125, ppw: 5.2, priceOrigin: "banda", warr: 25,
};

const base: Design = {
  lat: 20.6597, lng: -103.3496, yield: 1880, area: 60,
  tilt: 18, az: 180, shade: 0, type: "res", panel,
};

function html(d: Design, contactos: Contacto[] = []) {
  return buildProposal("Av. Chapultepec 100", "Guadalajara", d, compute(d), contactos);
}

describe("propuesta imprimible", () => {
  it("es un documento HTML autónomo en español", () => {
    const out = html(base);
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain('lang="es"');
    expect(out.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("incluye el trámite de interconexión completo", () => {
    const out = html(base);
    expect(out).toContain("Trámite de interconexión");
    // Los siete pasos que salieron de la investigación: sin uno de ellos el instalador
    // llega a la ventanilla de CFE incompleto.
    for (const paso of [
      "Medición neta",
      "Solicitud de interconexión",
      "Croquis de localización",
      "Diagrama unifilar",
      "Unidad de Verificación",
      "Medidor bidireccional",
      "contrato de interconexión",
    ]) {
      expect(out).toContain(paso);
    }
  });

  it("dice que el sistema entra en Generación Distribuida cuando no supera el límite", () => {
    const r = compute(base);
    expect(r.exceedsGD).toBe(false);
    const out = html(base);
    // Con la aguja suelta esta prueba pasaba aunque la frase del régimen se cambiara por otra:
    // «Generación Distribuida» aparece también en la advertencia de requisitos variables, que
    // cita las Disposiciones. Comprobado por mutación: 0 pruebas caían. Se fija la frase.
    expect(out).toContain("entra en <b>Generación Distribuida</b>");
    expect(out).toContain(String(GD_LIMIT_KW));
    expect(out).not.toContain("permiso de generación ante la CRE");
  });

  it("advierte del permiso CRE cuando el sistema supera los 499 kW", () => {
    const grande: Design = { ...base, area: 12000, type: "ind" };
    const r = compute(grande);
    expect(r.exceedsGD).toBe(true);
    expect(r.kwp).toBeGreaterThan(GD_LIMIT_KW);
    const out = buildProposal("Parque industrial", "Guadalajara", grande, r);
    expect(out).toContain("permiso de generación ante la CRE");
    expect(out).toContain("estudio de impacto en la red");
  });

  it("declara el excedente solo cuando existe, y nunca lo cuenta como ahorro", () => {
    const sobrado: Design = { ...base, area: 400 }; // residencial muy sobredimensionado
    const r = compute(sobrado);
    expect(r.surplus).toBeGreaterThan(0);
    const out = html(sobrado);
    expect(out).toContain("Nota sobre el excedente");
    expect(out).toContain("no se valora a");

    const ajustado: Design = { ...base, area: 20 };
    expect(compute(ajustado).surplus).toBeLessThanOrEqual(0);
    expect(html(ajustado)).not.toContain("Nota sobre el excedente");
  });

  it("no promete plazos que no puede sostener", () => {
    const out = html(base);
    expect(out).toContain("no un compromiso de tiempos");
    // Nada de afirmar días concretos de conexión: la investigación no los fijó.
    expect(out).not.toMatch(/en \d+ d[ií]as h[áa]biles/i);
  });
});
describe("la propuesta declara de dónde sale la producción", () => {
  const conSitio = (clave: string): Design => ({
    ...base,
    site: CITIES[clave].site,
    lat: CITIES[clave].lat,
    yield: CITIES[clave].yield,
    tilt: CITIES[clave].site!.tiltOptimo,
  });

  it("nombra la fuente y el rendimiento medido cuando hay sitio", () => {
    const out = html(conSitio("cdmx"));
    expect(out).toContain("PVGIS");
    expect(out).toContain("kWh por kWp instalado al año");
  });

  it("declara la variación entre años, para que un año nublado no parezca una falla", () => {
    expect(html(conSitio("cdmx"))).toMatch(/kWh\/kWp/);
    expect(html(conSitio("cdmx"))).toContain("variación entre un año y otro");
  });

  it("cuando dos fuentes discrepan lo dice y admite usar la menor", () => {
    const out = html(conSitio("tijuana"));
    expect(out).toContain("discrepan");
    expect(out).toContain("MENOR");
  });

  it("cuando las fuentes concuerdan no inventa una advertencia", () => {
    expect(html(conSitio("merida"))).not.toContain("discrepan");
  });

  it("sin sitio medido avisa que es promedio y da el rango de error", () => {
    const out = html({ ...base, site: undefined });
    expect(out).toMatch(/promedio de \d+ ciudades mexicanas medidas/);
    expect(out).toMatch(/en \d+ estados/);
    expect(out).not.toContain("kWh por kWp instalado al año");
  });
});


/** El electricista necesita esto en el papel: cuántos módulos en serie y con qué margen. */
describe("la propuesta incluye la conexión en series", () => {
  const conSitio = (clave: string): Design => ({
    ...base,
    site: CITIES[clave].site,
    lat: CITIES[clave].lat,
    yield: CITIES[clave].yield,
    tilt: CITIES[clave].site!.tiltOptimo,
    area: 180,
    type: "com",
  });

  it("dice cuántas series y de cuántos módulos", () => {
    const out = html(conSitio("ciudad juarez"));
    expect(out).toContain("Conexión en series");
    expect(out).toMatch(/\d+ serie/);
    expect(out).toMatch(/de \d+ módulos/);
  });

  it("declara la temperatura extrema usada y cuánto tiempo la respalda", () => {
    // Antes esta prueba exigía la frase literal «días de serie diaria». Lo que importa no es la
    // frase: es que el documento diga de cuánto registro sale el extremo. Al decirlo en años —que
    // es como lo entiende quien recibe la propuesta— la prueba vieja habría bloqueado la mejora.
    const out = html(conSitio("ciudad juarez"));
    expect(out).toContain("mínima absoluta medida");
    expect(out).toMatch(/-?[\d.]+ °C/);
    expect(out).toMatch(/de registro\s+diario/);
    expect(out).toMatch(/\d+ (años|meses|mes|año) de registro/);
    expect(out, "«serie diaria» es jerga estadística").not.toMatch(/serie diaria/);
  });

  it("compara contra el criterio de norma en vez de esconderlo", () => {
    expect(html(conSitio("ciudad juarez"))).toContain("El criterio de norma usaría");
  });

  it("advierte que la ventana es una clase de inversor y no un modelo", () => {
    const out = html(conSitio("monterrey"));
    expect(out).toContain("no a un modelo concreto");
    // la advertencia tiene que seguir estando, pero en tercera persona: la versión anterior decía
    // «Antes de comprar, confirma el voltaje máximo…», una orden al instalador en el documento del
    // cliente, y esta prueba exigía esa frase literal
    expect(out).toMatch(/voltaje máximo y el mínimo de arranque/);
    expect(out).toMatch(/el largo de la serie cambia/);
    expect(out, "no se le dan órdenes al lector").not.toMatch(/Antes de comprar, confirma/);
  });

  it("da el rango de inversor recomendado", () => {
    expect(html(conSitio("monterrey"))).toMatch(/\d+(\.\d+)? a \d+(\.\d+)? kW/);
  });

  it("sin ciudad medida no inventa un dimensionado", () => {
    const out = html({ ...base, site: undefined });
    expect(out).not.toContain("Conexión en series");
  });
});


/** El plano necesita esto: qué cable, qué fusible y de dónde salen. */
describe("la propuesta incluye el conductor y la protección", () => {
  const conSitio = (clave: string): Design => ({
    ...base,
    site: CITIES[clave].site,
    lat: CITIES[clave].lat,
    yield: CITIES[clave].yield,
    tilt: CITIES[clave].site!.tiltOptimo,
    area: 180,
    type: "com",
    runMeters: 30,
  });

  it("dice el calibre, el fusible y los metros", () => {
    const out = html(conSitio("mexicali"));
    expect(out).toContain("Conductor y protección del circuito");
    expect(out).toMatch(/\d+ AWG/);
    expect(out).toMatch(/protección de <strong>\d+ A/);
    expect(out).toContain("30 m de una vía");
  });

  /* Antes esto no se detectaba: la propuesta imprimía los metros del diseño mientras el circuito
     se calculaba con el valor por omisión, así que el papel y el cálculo podían discrepar. */
  it("los metros impresos son los que usó el cálculo, no los del diseño", () => {
    const corto = compute(conSitio("mexicali"));
    const largo = compute({ ...conSitio("mexicali"), runMeters: 200 });
    expect(corto.circuito!.metros).toBe(30);
    expect(largo.circuito!.metros).toBe(200);
    // y una tirada de 200 m tiene que cambiar el resultado, no solo el texto
    expect(largo.circuito!.conductor.caida).not.toBeCloseTo(corto.circuito!.conductor.caida, 3);
    expect(html({ ...conSitio("mexicali"), runMeters: 200 })).toContain("200 m de una vía");
  });

  it("declara la temperatura de diseño y de qué se compone", () => {
    const out = html(conSitio("mexicali"));
    expect(out).toContain("22 °C que la norma obliga a sumar");
    expect(out).toMatch(/factor de corrección en 0\.\d+/);
  });

  it("cuando el calibre lo manda la protección, lo explica", () => {
    // Escenario elegido MIDIENDO, no razonando: se barrieron 12 ciudades × 13 tiradas × 5 áreas y
    // 284 combinaciones suben el calibre. Hace falta una tirada CORTA —con 5 m la caída de tensión
    // no manda, así que el calibre mínimo es fino y ningún interruptor comercial le encaja—.
    //
    // Antes esto era `if (out.includes("Se subió el calibre")) { expect(...) }` con el escenario de
    // Mexicali, donde la condición NUNCA se cumple: la prueba pasaba por su aserción de cola sin
    // comprobar jamás lo que su título anuncia. El linter lo señalaba y estaba en lo cierto.
    const out = html({ ...conSitio("cdmx"), runMeters: 5, area: 40 });
    expect(out).toContain("Se subió el calibre");
    expect(out).toContain("por la protección, no por la corriente");
    expect(out).toContain("Caída de tensión");
  });

  it("no afirma nada sobre la norma mexicana, porque su texto no se consultó", () => {
    // Esta prueba pedía la frase «NO se verificó» dentro de la propuesta. La intención era buena
    // —no prometer conformidad con la NOM-001-SEDE sin haber leído su texto— pero la solución
    // metía lenguaje de auditoría en el documento que firma el cliente, junto con órdenes al
    // instalador («confírmalo antes de firmar un plano»).
    //
    // La regla que de verdad importa no es que aparezca una advertencia, es que NO haya una
    // afirmación: el documento cita el NEC, que sí se verificó, y calla sobre la NOM. La salvedad
    // sigue donde le sirve a quien firma —dentro de la app— y hay una guarda que lo vigila.
    const out = html(conSitio("monterrey"));
    expect(out).not.toMatch(/NOM/);
    expect(out, "el criterio verificado sí se cita").toMatch(/NEC/);
  });

  it("sin sitio medido no aparece la sección", () => {
    expect(html({ ...base, site: undefined })).not.toContain("Conductor y protección");
  });
});

/**
 * La propuesta imprime una lista de trámites ante la CRE y un cálculo eléctrico que alguien con
 * registro tiene que firmar. Antes no nombraba a nadie y dejaba el hueco sin decirlo.
 */
describe("la propuesta nombra a quien firma", () => {
  const ana: Contacto = {
    id: "e1", nombre: "Ing. Ana Ruiz", rol: "electricista",
    registro: "CFE-4471", telefono: "686 112 3344", creadoEn: 1,
  };
  const conFirma = (o: Partial<Design> = {}): Design => ({ ...base, responsableId: "e1", ...o });

  it("nombra al responsable con su registro y su teléfono", () => {
    const out = html(conFirma(), [ana]);
    expect(out).toContain("Responsable de la instalación");
    expect(out).toContain("Ing. Ana Ruiz");
    expect(out).toContain("CFE-4471");
    expect(out).toContain("686 112 3344");
  });

  it("sin asignar lo declara en vez de dejar un hueco", () => {
    const out = html(base, [ana]);
    expect(out).toContain("Sin asignar");
    expect(out).toContain("necesitan la firma de un responsable con registro");
    expect(out).not.toContain("Ing. Ana Ruiz");
  });

  /* El id puede quedar colgando si el contacto se borra de la libreta. */
  it("un id que ya no existe se trata como sin asignar", () => {
    const out = html(conFirma({ responsableId: "borrado" }), [ana]);
    expect(out).toContain("Sin asignar");
    expect(out).not.toContain("Ing. Ana Ruiz");
  });

  it("un contacto que no es electricista no puede firmar", () => {
    const cuadrilla: Contacto = { ...ana, rol: "cuadrilla" };
    expect(html(conFirma(), [cuadrilla])).toContain("Sin asignar");
  });

  it("un responsable sin registro se acepta pero se advierte", () => {
    const out = html(conFirma(), [{ ...ana, registro: undefined }]);
    expect(out).toContain("Ing. Ana Ruiz");
    expect(out).toContain("Sin registro capturado");
  });

  it("sin libreta la propuesta sigue saliendo, declarando la ausencia", () => {
    const out = html(conFirma());
    expect(out).toContain("Sin asignar");
    expect(out.length).toBeGreaterThan(2000);
  });
});

/**
 * Un plano de trámite no se aprueba sin decir dónde se corta la energía. La propuesta imprimía el
 * calibre y la protección y no mencionaba ni un desconectador.
 */
describe("la propuesta trae el unifilar y los medios de desconexión", () => {
  it("recorre la cadena completa, de los módulos a la red", () => {
    const out = html(base);
    expect(out).toContain("Diagrama unifilar");
    for (const nodo of ["Módulos", "Desconectador CC", "Inversor", "Desconectador CA",
                        "Medidor bidireccional", "Red"]) {
      expect(out).toContain(nodo);
    }
  });

  it("imprime los requisitos que no dependen de ninguna cifra", () => {
    const out = html(base);
    expect(out).toContain("Medios de desconexión");
    expect(out).toContain("sin escalera");
    expect(out).toContain("Enclavable en abierto");
  });

  it("declara lo que queda por definir en vez de imprimirlo en blanco", () => {
    const out = html(base);
    // Igual que arriba: «por definir» y «placa del inversor» aparecen también en el pie de
    // elementos incompletos y en los requisitos del desconectador, así que vaciar el detalle del
    // NODO no tumbaba nada. Se fija a la fila del nodo, que es lo que esta prueba dice comprobar.
    expect(out).toMatch(/Desconectador CA[^<]*<\/td><td>[^<]*por definir/);
    expect(out).toMatch(/por definir<br>Se dimensiona con la placa del inversor/);
  });

  it("los medios de desconexión citan el NEC y no invocan la NOM", () => {
    const out = html(base);
    expect(out).toMatch(/NEC Art\. 690 y 705/);
    expect(out, "no se invoca una norma cuyo texto no se leyó").not.toMatch(/NOM/);
  });

  it("no imprime instrucciones dirigidas al instalador", () => {
    // El documento llevaba tres: «El plano no se puede presentar sin cerrarlo», «confírmalo antes
    // de firmar un plano» (dos veces). Son correctas como nota interna y desconcertantes en la
    // cotización de un cliente, que lee que su propio plano «no se puede presentar».
    // Se le sumó una cuarta, encontrada leyendo el documento impreso: la salvedad del techo
    // cerraba con «Traza el contorno antes de comprometer una cantidad», que es una orden para
    // quien instala metida en el papel que se lleva quien compra.
    const out = html(base);
    for (const frase of [
      /no se puede presentar/,
      /confírmalo antes de firmar/,
      /no se pudo consultar directamente/,
      /no se verificó/,
      /Traza el contorno/,
      /antes de comprometer/,
    ]) {
      expect(out, `sobra en el documento del cliente: ${frase}`).not.toMatch(frase);
    }
  });

  it("no usa términos del oficio en inglés", () => {
    // «Pasillo antisombra 0.74 m (pitch 2.47 m)»: el cliente que recibe esto no sabe qué es un
    // pitch, y la palabra en español existe y es exacta. Se encontró mirando el documento impreso.
    const out = html(base);
    for (const termino of ["pitch", "string", "layout", "array", "derating", "tilt", "azimuth"]) {
      expect(
        new RegExp(`\\b${termino}\\b`, "i").test(out),
        `«${termino}» es jerga en inglés en el documento del cliente`,
      ).toBe(false);
    }
    // y sigue diciendo el dato, con su nombre en español
    expect(out).toMatch(/paso de fila/);
  });

  it("no promete datos satelitales, que la app no tiene", () => {
    expect(html(base)).not.toMatch(/satelital/);
  });
});

/**
 * Los requisitos del trámite no se piden igual en cada zona de distribución.
 *
 * Fuente del sector (CCEEA) documenta oficinas que han pedido fotografías de la instalación y
 * comprobantes de certificación de equipos, que no están en las Disposiciones Administrativas de
 * Generación Distribuida. Un instalador que lo sabe puede preguntar en qué se sustenta; uno que no,
 * lo consigue y lo paga.
 */
describe("la propuesta advierte que los requisitos varían por zona", () => {
  it("dice que no se piden igual en todo el país", () => {
    const out = html(base);
    expect(out).toContain("no se piden igual en todo el país");
  });

  it("nombra qué se ha pedido de más y dice qué hacer", () => {
    const out = html(base);
    expect(out).toMatch(/fotograf/i);
    expect(out).toMatch(/certificación de los equipos/i);
    expect(out).toContain("en qué disposición se sustenta");
  });

  /**
   * La advertencia no debe volverse una excusa para no traer lo que SÍ toca.
   *
   * Se comprueban las etiquetas NUMERADAS, no la cadena suelta: «Diagrama unifilar» también es el
   * título de la sección del dibujo, así que buscarlo a secas hacía pasar la prueba aunque el paso
   * se borrara del trámite. Comprobado: borrar la fila 4 no tumbaba nada.
   */
  it("sigue enumerando los siete pasos numerados del trámite", () => {
    const out = html(base);
    const pasos = [
      "1. Esquema de contraprestación",
      "2. Solicitud de interconexión",
      "3. Croquis de localización",
      "4. Diagrama unifilar",
      "5. Unidad de Verificación",
      "6. Medidor bidireccional",
      "7. Firma del contrato",
    ];
    for (const paso of pasos) expect(out, paso).toContain(paso);
    expect(pasos).toHaveLength(7); // que el bucle recorrió los siete
  });
});

/**
 * La propuesta es el documento que el instalador entrega e imprime, y nunca se había auditado
 * contra los criterios que sí se aplican a la interfaz. Al mirarla entera aparecieron cuatro
 * defectos que ninguna prueba de contenido podía ver, porque no rompen nada: sólo se leen mal.
 *
 * Estos errores son invisibles a `expect(out).toContain(...)`, así que se comprueba el CSS.
 */
describe("la propuesta declara de dónde sale el techo", () => {
  // El resto del documento declara procedencia de todo: rendimiento del sitio, tarifa, reparto de
  // costos, plazos del trámite, la NOM sin verificar. Del techo no decía nada, y de él dependen los
  // tres números que el cliente lee como si fueran un levantamiento.
  const cuadrado = [
    { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 7.5 }, { x: 0, y: 7.5 },
  ];

  it("dice que la superficie sale del contorno trazado, no de un levantamiento", () => {
    const out = html({ ...base, outline: cuadrado });
    expect(out).toContain("De dónde sale el techo");
    expect(out).toMatch(/contorno que\s+el instalador trazó/);
    expect(out).toContain("no de un levantamiento");
    expect(out).toMatch(/confirmar las medidas en sitio/);
  });

  it("sin contorno avisa de que el arreglo es un orden de magnitud, no un plano", () => {
    const out = html(base);
    expect(out).toContain("De dónde sale el techo");
    expect(out).toContain("cuadrado equivalente");
    expect(out).toMatch(/orden de magnitud, no un plano de montaje/);
    // Y no debe afirmar lo contrario: sin contorno no hay contorno trazado que citar.
    expect(out).not.toMatch(/el instalador trazó/);
  });

  it("las dos procedencias dicen cosas distintas", () => {
    // Sin esto, una sola nota genérica pasaría las dos pruebas de arriba y el cliente no sabría
    // si el arreglo es montable o solo indicativo.
    const conContorno = html({ ...base, outline: cuadrado });
    const sinContorno = html(base);
    expect(conContorno).not.toEqual(sinContorno);
    expect(conContorno.includes("cuadrado equivalente")).toBe(false);
    expect(sinContorno.includes("confirmar las medidas en sitio")).toBe(false);
  });

  it("la nota va junto a los números que dependen del techo", () => {
    const out = html({ ...base, outline: cuadrado });
    // El aviso no sirve al final del documento: tiene que leerse con el arreglo y el pasillo.
    const iArreglo = out.indexOf("Pasillo antisombra");
    const iNota = out.indexOf("De dónde sale el techo");
    const iDesglose = out.indexOf("Desglose de la inversión");
    expect(iArreglo).toBeGreaterThan(0);
    expect(iNota).toBeGreaterThan(iArreglo);
    expect(iNota).toBeLessThan(iDesglose);
  });
});

describe("la propuesta declara de dónde sale el costo por watt", () => {
  // El documento ya declaraba la procedencia de la producción, la tarifa, el trámite, la NOM y el
  // techo. Del COSTO no decía nada, y es el segundo número más consecuente que lee el cliente.
  //
  // No se puede deducir del diseño: `bosFor` siempre devuelve un número —si el instalador no
  // capturó su tarifa cae a la referencia nacional— así que con 16 MXN/W en residencial la propia
  // y la de referencia son idénticas. Por eso se pasa explícito.
  it("con tarifa propia lo dice y no habla de referencia", () => {
    const out = buildProposal("Av. Chapultepec 100", "Guadalajara", base, compute(base), [], true);
    expect(out).toMatch(/es el que el instalador capturó/);
    expect(out).toMatch(/de su propia operación/);
    expect(out).not.toMatch(/referencia nacional/);
  });

  it("sin tarifa propia avisa de que es un orden de magnitud, no una cotización", () => {
    const out = buildProposal("Av. Chapultepec 100", "Guadalajara", base, compute(base), [], false);
    expect(out).toMatch(/referencia nacional por tipo de proyecto/);
    expect(out).toMatch(/no el costo real de\s+este instalador/);
    expect(out).toMatch(/no una cotización cerrada/);
    expect(out).not.toMatch(/el instalador capturó/);
  });

  it("por omisión asume lo prudente: referencia, no cotización", () => {
    // Si alguien añade una ruta nueva y olvida pasar el dato, el documento debe rebajar la
    // promesa, no inflarla.
    const out = buildProposal("Av. Chapultepec 100", "Guadalajara", base, compute(base));
    expect(out).toMatch(/referencia nacional por tipo de proyecto/);
  });

  it("las dos procedencias dicen cosas distintas", () => {
    const propio = buildProposal("A", "Guadalajara", base, compute(base), [], true);
    const banda = buildProposal("A", "Guadalajara", base, compute(base), [], false);
    expect(propio).not.toEqual(banda);
  });
});

describe("el documento no se contradice a sí mismo", () => {
  // Los dos defectos de este bloque se vieron MIRANDO la propuesta impresa, no en ninguna prueba:
  // la suite estaba verde con los dos presentes.
  it("con filas desiguales dice el reparto, no una multiplicación que no cuadra", () => {
    // `perRow` es el máximo de la fila más poblada, no el promedio. Con un estorbo que bloquea
    // posiciones, «3 filas × 6 módulos» junto a «16 ×» invita a una resta que no existe: el
    // diseño es correcto, el texto parecía un error del instalador.
    const conEstorbo = {
      ...base,
      area: 55,
      obstacles: [
        { id: "t", kind: "tinaco" as const, height: 1.6, x: 2, y: 2, width: 1.1, depth: 1.1 },
      ],
    } as typeof base;
    const r = compute(conEstorbo);
    const out = buildProposal("Av. Vallarta 2425", "Guadalajara", conEstorbo, r);

    if (r.layout.rows * r.layout.perRow !== r.n) {
      // Caso desigual: se nombran las filas reales y su suma es el total propuesto.
      const m = out.match(/(\d+) módulos en (\d+) filas \(([\d\s+]+)\)/);
      expect(m, "debe declarar el reparto por filas").not.toBeNull();
      expect(Number(m![1])).toBe(r.n);
      const suma = m![3].split("+").reduce((s, x) => s + Number(x.trim()), 0);
      expect(suma, "las filas declaradas deben sumar el total").toBe(r.n);
    } else {
      expect(out).toContain(`${r.layout.rows} filas × ${r.layout.perRow} módulos`);
    }
  });

  it("con filas parejas conserva la forma corta", () => {
    const r = compute(base);
    const out = buildProposal("Calle 1", "Guadalajara", base, r);
    if (r.layout.rows * r.layout.perRow === r.n) {
      expect(out).toContain(`${r.layout.rows} filas × ${r.layout.perRow} módulos`);
      expect(out).not.toMatch(/módulos en \d+ filas \(/);
    }
  });

  it("cualquiera de las dos formas es coherente con el número de paneles", () => {
    // La garantía que de verdad importa, sea cual sea la forma elegida: si el documento nombra
    // filas por columnas, su producto ES el total.
    for (const area of [20, 35, 55, 80, 120]) {
      const d = { ...base, area } as typeof base;
      const r = compute(d);
      const out = buildProposal("Calle 1", "Guadalajara", d, r);
      const corto = out.match(/(\d+) filas × (\d+) módulos/);
      if (corto) {
        expect(Number(corto[1]) * Number(corto[2]), `área ${area}`).toBe(r.n);
      }
    }
  });

  it("no repite la ciudad cuando la dirección ya la trae", () => {
    const out = buildProposal("Av. Vallarta 2425, Guadalajara", "Guadalajara", base, compute(base));
    expect(out).toContain("Av. Vallarta 2425, Guadalajara");
    expect(out).not.toContain("Guadalajara · Guadalajara");
  });

  it("ignora acentos al comparar: Merida y Mérida son la misma", () => {
    const out = buildProposal("Calle 60 349, Merida", "Mérida", base, compute(base));
    expect(out).not.toMatch(/Merida · Mérida/);
  });

  it("sí añade la ciudad cuando la dirección no la menciona", () => {
    const out = buildProposal("Calle Hidalgo 10", "Guadalajara", base, compute(base));
    expect(out).toContain("Calle Hidalgo 10 · Guadalajara");
  });
});

describe("el documento no se puede usar para inyectar código", () => {
  // Medido ANTES de arreglarlo: una dirección con `<img src=x onerror="alert(1)">` aparecía
  // literal en el HTML generado. El documento se arma como cadena y se inyecta con
  // `document.write`, así que ahí no hay ninguna barrera del navegador que ayude.
  //
  // Lo que lo vuelve grave no es un instalador escribiendo etiquetas por error: la app IMPORTA
  // respaldos, y un respaldo es un archivo que se comparte. Uno preparado con `<script>` en una
  // dirección ejecutaría código en el navegador del instalador al abrir la propuesta, con acceso
  // al almacén donde están los datos de todos sus clientes.
  const VENENO = '<img src=x onerror="alert(1)">';

  it("una dirección con etiquetas sale escapada, no ejecutable", () => {
    const out = buildProposal(VENENO, "Guadalajara", base, compute(base));
    expect(out).not.toContain(VENENO);
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;img src=x");
  });

  it("las comillas también, para no escaparse de un atributo", () => {
    const out = buildProposal('a" onload="alert(1)', "Guadalajara", base, compute(base));
    expect(out).not.toContain('" onload="');
    expect(out).toContain("&quot;");
  });

  it("no rompe el ampersand ni lo escapa dos veces", () => {
    const out = buildProposal("Ruiz & Hnos 10", "Guadalajara", base, compute(base));
    expect(out).toContain("Ruiz &amp; Hnos 10");
    expect(out).not.toContain("&amp;amp;");
  });

  it("el texto legítimo con acentos sigue intacto", () => {
    const out = buildProposal("Avenida Ñuño Beltrán 3, Colonia Álamos", "Guadalajara", base, compute(base));
    expect(out).toContain("Avenida Ñuño Beltrán 3, Colonia Álamos");
  });

  it("el nombre del responsable de obra también se escapa", () => {
    // Sale de la libreta, que es texto libre, y viaja en los respaldos igual que los proyectos.
    const conFirma = { ...base, responsableId: "c1" } as typeof base;
    const out = buildProposal("Calle 1", "Guadalajara", conFirma, compute(conFirma), [
      {
        id: "c1",
        rol: "electricista",
        nombre: '<script>alert(1)</script>',
        registro: "",
        telefono: "",
      } as never,
    ]);
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });
});

describe("el documento se puede leer y se puede imprimir", () => {
  const css = () => html(base).match(/<style>([\s\S]*?)<\/style>/)![1];

  /* Nueve notas a 10.5px: las advertencias más importantes eran el texto menos legible. */
  it("ningún tamaño de letra baja de 11px", () => {
    const tamaños = [...css().matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(tamaños.length).toBeGreaterThan(3); // que se encontraron tamaños de verdad
    for (const t of tamaños) expect(t).toBeGreaterThanOrEqual(11);
  });

  /* #9a968e da 2.95:1. En la interfaz ya se había sustituido por #726e68; aquí sobrevivió. */
  it("no reaparece el gris que falla contraste", () => {
    expect(css()).not.toMatch(/#9a968e/i);
  });

  /* Sin max-width el texto corría de borde a borde de la ventana. */
  it("el cuerpo tiene una medida acotada en pantalla", () => {
    expect(css()).toMatch(/max-width:\s*\d+px/);
    expect(css()).toMatch(/margin:0 auto/);
  });

  /**
   * Un título al pie de la hoja deja su tabla en la siguiente, y una fila partida por la mitad
   * hace ilegible justo la cifra que el cliente va a leer.
   */
  it("controla los saltos de página al imprimir", () => {
    const c = css();
    expect(c).toMatch(/@media print/);
    expect(c).toMatch(/@page/);
    // Se comprueba el SELECTOR, no la propiedad suelta: `break-inside:avoid` aparece también en
    // `.cards`, así que buscarla a secas hacía pasar la prueba aunque se quitara de las filas.
    // Comprobado: cambiar la regla de `tr` a `auto` no la tumbaba.
    expect(c).toMatch(/h2\{[^}]*break-after:avoid/);
    expect(c).toMatch(/(^|[,{;\s])tr\s*,[^{]*\{[^}]*break-inside:avoid/m);
  });
});
