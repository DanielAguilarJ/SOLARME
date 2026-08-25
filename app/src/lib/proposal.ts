import { FUENTE_FISICA, RESUMEN } from "./site";
import { periodoEnAnios } from "./tiempo";
import { porcentajesEnteros } from "./capex";
import type { Contacto } from "./contactos";
import { desconectadorCC, desconectadorCA, unifilar, nodosIncompletos } from "./desconexion";
import { GD_LIMIT_KW, azLabel, fmt, paybackLabel, type Design, type Result } from "./solar";

const TYPE_LABEL: Record<string, string> = {
  res: "Residencial", com: "Comercial", ind: "Industrial",
};

/** Devuelve un documento HTML autónomo, listo para imprimir a PDF. */
/**
 * Escapa texto para meterlo en el HTML de la propuesta.
 *
 * Hace falta porque el documento se arma como una cadena y se inyecta con `document.write`, y
 * dentro van datos que NO controlamos: la dirección que teclea el instalador y los campos de su
 * libreta. Medido antes de existir esta función: una dirección con `<img src=x onerror=...>`
 * aparecía literal en el HTML generado.
 *
 * El camino de ataque que lo vuelve grave no es un instalador escribiendo etiquetas por error,
 * es la IMPORTACIÓN de respaldos: los respaldos son archivos que se comparten, así que uno
 * preparado con `<script>` en una dirección ejecutaría código en el navegador del instalador al
 * abrir la propuesta, con acceso al almacén donde están los datos de todos sus clientes.
 *
 * Se escapan también los nombres que salen de nuestros propios datos —módulos, sitios, calibres—.
 * No son texto libre hoy, pero el catálogo de módulos lo alimenta un scraper, y un scraper es
 * exactamente el sitio por donde entra texto que nadie revisó.
 */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Describe el arreglo sin contradecir el número de paneles.
 *
 * El defecto que corrige, visto mirando el documento impreso y no en ninguna prueba: la línea
 * decía «3 filas × 6 módulos» junto a «16 × ...». `perRow` es el máximo de la fila más poblada,
 * no el promedio, así que cuando un estorbo bloquea posiciones el producto de las dos cifras NO
 * es el total. El diseño era correcto —16 módulos en filas de 6, 6 y 4— pero el texto invitaba a
 * una multiplicación que no cuadra, y un cliente que la hace cree que el instalador se equivocó.
 *
 * Con filas parejas se dice como siempre. Con filas desiguales se dicen las filas de verdad, que
 * además es lo que hace falta para montarlo.
 */
/**
 * La línea del domicilio, sin repetir la ciudad.
 *
 * Visto en el documento impreso: decía «Av. Vallarta 2425, Guadalajara · Guadalajara», porque la
 * ciudad se añadía siempre y el instalador ya la había escrito. En una propuesta formal eso se lee
 * descuidado, y las direcciones que teclea un instalador casi siempre traen la ciudad.
 *
 * La comparación ignora acentos y mayúsculas: «Merida» y «Mérida» son la misma ciudad escrita de
 * dos formas, y con una comparación literal la repetición seguiría apareciendo.
 */
function domicilio(address: string, city: string): string {
  const plano = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return plano(address).includes(plano(city)) ? address : `${address} · ${city}`;
}

function arregloTexto(r: Result): string {  const { rows, perRow } = r.layout;
  if (rows <= 0) return "sin arreglo";
  if (rows * perRow === r.n) return `${rows} filas × ${perRow} módulos`;

  const porFila = new Map<number, number>();
  for (const m of r.placement.modules) porFila.set(m.row, (porFila.get(m.row) ?? 0) + 1);
  const reparto = [...porFila.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  return `${r.n} módulos en ${rows} filas (${reparto.join(" + ")})`;
}

export function buildProposal(
  address: string,
  city: string,
  d: Design,
  r: Result,
  /** Libreta del instalador, para nombrar a quien firma. Vacía si no hay ninguno. */
  contactos: Contacto[] = [],
  /**
   * `true` cuando el costo por watt del resto del sistema lo capturó el instalador, `false`
   * cuando salió de la referencia nacional por tipo de proyecto.
   *
   * Existe porque `bosFor` SIEMPRE devuelve un número —si no hay tarifa propia cae a la banda—,
   * así que el documento no puede distinguirlo mirando el diseño: con 16 MXN/W en residencial,
   * la tarifa capturada y la de referencia son idénticas. Y la diferencia importa: un precio
   * basado en los costos reales del instalador es una cotización, y uno basado en una referencia
   * nacional es un orden de magnitud.
   */
  bosPropio = false
): string {
  // Se resuelve por id contra la libreta actual. Si el contacto se borró, el id queda colgando y
  // aquí sale `undefined`: el documento dice que falta la firma en vez de imprimir un espacio.
  // El unifilar se construye del mismo cálculo que la pantalla, para que no puedan discrepar.
  const cc = desconectadorCC(r.strings, r.circuito);
  const ca = desconectadorCA();
  const nodos = unifilar(r.strings, r.ventana, r.circuito, (d.panel.w * (r.placement?.count ?? 0)) / 1000, cc, ca);
  const faltan = nodosIncompletos(nodos);

  const responsable = d.responsableId
    ? contactos.find((c) => c.id === d.responsableId && c.rol === "electricista")
    : undefined;
  const hoy = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  const folio = "SM-" + Math.floor(Math.random() * 90000 + 10000);
  const row = (k: string, v: string) =>
    `<tr><td>${k}</td><td>${v}</td></tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Propuesta ${folio} · SolarMe</title>
<style>
  @page{margin:16mm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a17;padding:24px;max-width:940px;margin:0 auto}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #ea580c;padding-bottom:14px}
  .brand{font:600 26px Georgia,serif;color:#ea580c}
  .meta{text-align:right;font-size:12px;color:#6b6862}
  .who{margin-top:18px;color:#3a3a35}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}
  .card{border:1px solid #ece9e3;border-radius:12px;padding:18px}
  .card .lab{font-size:12px;color:#6b6862}
  .big{font:600 30px/1 Georgia,serif;margin-top:6px}
  .big.green{color:#15803d}.big.orange{color:#ea580c}
  table{width:100%;border-collapse:collapse;margin-top:22px}
  td{padding:10px 2px;border-bottom:1px solid #ece9e3;font-size:13.5px}
  td:first-child{padding-right:16px}
  td:last-child{text-align:right;font-weight:600}
  .note{font-size:11.5px;line-height:1.55;color:#3f3a33;background:#fdf6ee;border:1px solid #f0dcc4;border-radius:7px;padding:10px 12px;margin:14px 0 0}
    .foot{margin-top:26px;font-size:11.5px;color:#726e68;line-height:1.6}
  @media print{
    body{padding:0;max-width:none}
    /* Un h2 al final de la hoja deja su tabla en la siguiente: se mantienen juntos. */
    h2{break-after:avoid;page-break-after:avoid}
    /* Una fila partida por la mitad hace ilegible la cifra que el cliente va a leer. */
    tr,.card,.note{break-inside:avoid;page-break-inside:avoid}
    .cards{break-inside:avoid}
  }
</style></head><body>
  <div class="head">
    <div><div class="brand">☀ SolarMe</div><div style="color:#6b6862">Propuesta de instalación solar</div></div>
    <div class="meta">${hoy}<br>Folio ${folio}</div>
  </div>
  <p class="who"><b>Domicilio:</b> ${esc(domicilio(address, city))}<br>
     <b>Tipo de proyecto:</b> ${TYPE_LABEL[d.type]}</p>
  <div class="cards">
    <div class="card"><div class="lab">Producción estimada</div><div class="big">${fmt(Math.round(r.kwh))} kWh/año</div></div>
    <div class="card"><div class="lab">Ahorro estimado</div><div class="big green">$${fmt(Math.round(r.save))}/año</div></div>
  </div>
  <table>
    ${row("Módulos propuestos", `${r.n} × ${esc(d.panel.brand)} ${esc(d.panel.model)}`)}
    ${row("Tamaño del sistema", `${r.kwp.toFixed(2)} kWp`)}
    ${row("Inclinación / orientación", `${d.tilt}° / ${azLabel(d.az)}`)}
    ${row("Cobertura del consumo", `${r.cov}%`)}
    ${row("Arreglo", arregloTexto(r))}
    ${row("Pasillo antisombra", `${r.spacing.gap} m (paso de fila ${r.spacing.pitch} m)`)}
    ${row("CO₂ evitado", `${r.co2.toFixed(1)} ton/año`)}
    ${row("Inversión estimada", `$${fmt(Math.round(r.capex))} MXN`)}
    ${row("Retorno de inversión", paybackLabel(r))}
  </table>

  ${(() => {
    // El documento declara la procedencia de casi todo —el rendimiento del sitio, la tarifa, el
    // reparto de costos, los plazos del trámite, la NOM sin verificar— pero NO decía de dónde
    // sale la geometría del techo. Y de ella dependen los tres números que el cliente lee como
    // si fueran un levantamiento: cuántos paneles, en qué arreglo y con cuánto pasillo.
    //
    // La app sí lo declara en pantalla, en la franja que dice que el contorno lo traza el
    // instalador. Callarlo en el papel es peor que en la pantalla, porque el papel es lo que el
    // cliente guarda y con lo que compara al instalador que gane la obra.
    //
    // Cuidado con a quién le habla cada frase: la versión anterior cerraba con «Traza el contorno
    // antes de comprometer una cantidad», que es una orden para el instalador metida en el
    // documento que lee el cliente. Es el mismo error que ya se corrigió tres veces en otras
    // frases. El documento describe lo que hay; el aviso al instalador va en su pantalla.
    const superficie = r.area.toFixed(r.outlineMedido ? 1 : 0);
    return r.outlineMedido
      ? `<p class="note"><b>De dónde sale el techo.</b> Los ${superficie} m² salen del contorno que
         el instalador trazó sobre el plano, no de un levantamiento topográfico ni de una medición
         satelital. El número de módulos, el arreglo y el pasillo antisombra se derivan de ese
         contorno, así que conviene confirmar las medidas en sitio antes de comprar equipo.</p>`
      : `<p class="note"><b>De dónde sale el techo.</b> Todavía sin el contorno real: los
         ${superficie} m² se tratan como un cuadrado equivalente. El número de módulos y el arreglo
         son un orden de magnitud, no un plano de montaje: un techo de la misma superficie con otra
         forma admite otro arreglo. La cantidad definitiva sale de la visita técnica.</p>`;
  })()}

  <h2>Desglose de la inversión</h2>
  <table>
    ${(() => {
      // Los porcentajes se reparten para que sumen 100: redondear cada uno por su cuenta daba
      // 99 o 101 en el 54 % de los casos medidos, y un desglose que no cuadra resta credibilidad.
      const pcts = porcentajesEnteros(r.costs.lines.map((l) => l.share));
      return r.costs.lines
        .map((l, i) =>
          row(
            l.label,
            `$${fmt(Math.round(l.mxn))} MXN · ${pcts[i]}%` +
              (l.origin === "medido" ? " · precio del módulo elegido" : "")
          )
        )
        .join("\n    ");
    })()}
    ${row("<b>Total instalado</b>", `<b>$${fmt(Math.round(r.costs.total))} MXN · ${r.costs.mxnPerWp.toFixed(1)} MXN/Wp</b>`)}
  </table>
  <p class="note">
    El renglón de módulos sale del precio por watt del módulo elegido. Los demás son un reparto
    del resto del sistema, que es un costo por watt de la operación del instalador y no depende
    de qué módulo se escoja.
    ${bosPropio
      ? `Ese costo por watt es el que el instalador capturó para este tipo de proyecto, no una
         referencia: la cifra sale de su propia operación.`
      : `<b>Ese costo por watt es una referencia nacional por tipo de proyecto, no el costo real de
         este instalador.</b> Mientras no capture el suyo, el total es un orden de magnitud
         adecuado para decidir si el proyecto tiene sentido, no una cotización cerrada.`}
    ${!r.costs.inBand
      ? `<b>Atención:</b> ${r.costs.mxnPerWp.toFixed(1)} MXN/Wp queda fuera de la banda de
         mercado de sistemas llave en mano (15-28 MXN/Wp). Revisa los costos antes de cotizar.`
      : ""}
  </p>
  ${r.surplus > 0 ? `<p class="note"><b>Nota sobre el excedente.</b> El sistema produce
  ${fmt(Math.round(r.surplus))} kWh/año por encima del consumo estimado del cliente. El ahorro
  indicado arriba considera únicamente la energía que desplaza compra a CFE. Bajo medición neta el
  saldo a favor se compensa hasta 12 meses; el excedente sobre el consumo anual no se valora a
  tarifa minorista y por tanto no se cuenta como ahorro en esta propuesta.</p>` : ""}

  <h2>Trámite de interconexión</h2>
  <p class="note">
    ${r.exceedsGD
      ? `<b>Este sistema (${r.kwp.toFixed(1)} kWp) supera los ${GD_LIMIT_KW} kW del régimen exento de
         Generación Distribuida.</b> No aplica el contrato de interconexión simplificado: requiere
         permiso de generación ante la CRE y un estudio de impacto en la red. Los plazos y costos
         son sensiblemente mayores a los de un sistema en GD.`
      : `Con ${r.kwp.toFixed(1)} kWp el sistema entra en <b>Generación Distribuida</b> (hasta
         ${GD_LIMIT_KW} kW), que usa los modelos de contrato de interconexión de la CRE para
         centrales menores a 0.5 MW y está exento de permiso de generación.`}
  </p>
  <table>
    ${row("1. Esquema de contraprestación", "Medición neta, facturación neta o venta total (se elige al firmar)")}
    ${row("2. Solicitud de interconexión", "Ante CFE Distribución, con datos del inmueble y del titular del servicio")}
    ${row("3. Croquis de localización", "Ubicación del predio y del punto de conexión")}
    ${row("4. Diagrama unifilar", "Arreglo, inversor, protecciones y punto de acoplamiento")}
    ${row("5. Unidad de Verificación", "Dictamen de UVIE acreditada sobre la instalación eléctrica")}
    ${row("6. Medidor bidireccional", "Cambio o ajuste del medidor por CFE")}
    ${row("7. Firma del contrato", "Contrato de interconexión y convenio de la modalidad elegida")}
  </table>
  <p class="note">Los plazos dependen de la zona de distribución y de si se requiere estudio de red.
  Esta lista es la secuencia del trámite, no un compromiso de tiempos: confirma con la oficina de
  CFE Distribución que corresponde al domicilio.</p>
  <p class="note"><b>Los requisitos no se piden igual en todo el país.</b> Distintas zonas de
  distribución han solicitado documentos adicionales —fotografías de la instalación, comprobantes de
  certificación de los equipos— que <b>no forman parte de lo requerido</b> en las Disposiciones
  Administrativas de Carácter General en materia de Generación Distribuida. Si en la ventanilla se
  pide algo que no está en esta lista, conviene preguntar en qué disposición se sustenta antes de
  conseguirlo.</p>

  ${r.strings && r.ventana && d.site && r.strings.strings > 0 ? `
  <h2>Conexión en series</h2>
  <p>El arreglo se conecta en <strong>${r.strings.strings} serie${r.strings.strings === 1 ? "" : "s"}
  de ${r.strings.porString} módulos</strong>${r.strings.sobrantes > 0
    ? `, y quedan ${r.strings.sobrantes} módulo${r.strings.sobrantes === 1 ? "" : "s"} sin conectar
       porque no completan otra serie pareja`
    : ", sin módulos sueltos"}.</p>

  <p>El dimensionado usa la temperatura <strong>mínima absoluta medida en ${esc(d.site.nombre)},
  ${r.strings.rango.tFrio} °C</strong>, sobre ${periodoEnAnios(d.site.diasSerie)} de registro
  diario. A esa
  temperatura cada módulo entrega ${r.strings.rango.vocFrio} V en circuito abierto, así que la serie
  alcanza <strong>${fmt(Math.round(r.strings.vStringFrio))} V</strong> contra el máximo de
  ${r.ventana.vMax} V del inversor: un margen de ${r.strings.margen.toFixed(1)} %.</p>

  <p class="note">Se usa el extremo medido y no el promedio a propósito. El voltaje de circuito
  abierto SUBE cuando baja la temperatura, así que una serie calculada con un día normal puede
  rebasar el inversor la primera mañana fría del año. El criterio de norma usaría
  ${d.site.tMinAshrae} °C, que es menos exigente que el extremo empleado aquí.</p>

  <p class="note">La ventana de ${r.ventana.vMax} V corresponde a la clase de inversor de un proyecto
  de este tamaño, no a un modelo concreto. El voltaje máximo y el mínimo de arranque se confirman con
  la hoja del inversor que se compre: si difieren, el largo de la serie cambia.</p>
  ${r.inversor ? `<p>Potencia de inversor recomendada:
  <strong>${r.inversor.min} a ${r.inversor.max} kW</strong> para ${r.kwp.toFixed(1)} kWp de módulos.
  Sobredimensionar el arreglo respecto al inversor es normal y aprovecha mejor las horas de sol
  bajo; pasar de esa banda empieza a recortar producción al mediodía.</p>` : ""}
  ` : ""}

  ${r.termico && Number.isFinite(r.termico.tCelda) && d.site ? `
  <p>El módulo elegido tiene un coeficiente de potencia de
  <strong>${r.termico.coefModulo.toFixed(2)} %/°C</strong>, contra
  ${r.termico.coefRef.toFixed(2)} %/°C del módulo de referencia con el que se midió el rendimiento
  del sitio. La producción se corrige
  <strong>${r.termico.factor >= 1 ? "+" : ""}${((r.termico.factor - 1) * 100).toFixed(1)} %</strong>
  por esa diferencia, y sólo por esa diferencia: aplicar el coeficiente completo descontaría el
  efecto térmico dos veces, porque el rendimiento medido ya lo incluye para su referencia.</p>

  <p class="note">La celda se supone a ${Math.round(r.termico.tCelda)} °C, a partir de los
  ${d.site.tMediaSol} °C de aire medidos en ${esc(d.site.nombre)} ponderados por la producción mensual y
  una sobretemperatura de módulo de ${Math.round(r.termico.tCelda - d.site.tMediaSol!)} °C
  (relación NOCT, 45 °C). El aire está medido; la sobretemperatura es un supuesto y depende del
  montaje y la ventilación reales.</p>
  ` : ""}

  <h2>Diagrama unifilar</h2>
  <table>
    <tr><th>Elemento</th><th>Datos</th></tr>
    ${nodos.map((n) => `<tr><td>${n.titulo}${n.incompleto ? " *" : ""}</td><td>${n.detalle.join("<br>")}</td></tr>`).join("")}
  </table>
  ${faltan.length > 0 ? `<p class="note">* ${faltan.length === 1 ? "Este elemento" : "Estos elementos"} ${faltan.length === 1 ? "queda" : "quedan"} por definir: ${faltan.map((n) => n.titulo).join(", ")}. ${faltan.length === 1 ? "Se cierra" : "Se cierran"} al elegir el inversor, y el plano que se presenta a la compañía suministradora lo firma el responsable de la instalación.</p>` : ""}

  <h2>Medios de desconexión</h2>
  <p>Criterios de NEC Art. 690 y 705.</p>
  <table>
    <tr><th>Lado</th><th>Requisitos</th></tr>
    <tr><td>Corriente directa<br><strong>${cc.vNominal && cc.aNominal ? `${cc.vNominal} V · ${cc.aNominal} A` : "por definir"}</strong></td>
      <td>${cc.requisitos.map((x) => `${x}`).join("<br>")}${cc.falta ? `<br><em>${cc.falta}</em>` : ""}</td></tr>
    <tr><td>Corriente alterna</td>
      <td>${ca.requisitos.map((x) => `${x}`).join("<br>")}${ca.falta ? `<br><em>${ca.falta}</em>` : ""}</td></tr>
  </table>

  ${responsable ? `
  <h2>Responsable de la instalación</h2>
  <p><strong>${esc(responsable.nombre)}</strong>${responsable.registro
    ? `, registro <strong>${esc(responsable.registro)}</strong>` : ""}.
  ${responsable.telefono ? `Teléfono ${esc(responsable.telefono)}. ` : ""}Firma el cálculo eléctrico de
  este documento y la conformidad de la instalación.</p>
  ${!responsable.registro ? `<p class="note">Sin registro capturado en la libreta: anótalo antes de
  presentar el trámite.</p>` : ""}
  ` : `
  <h2>Responsable de la instalación</h2>
  <p class="note">Sin asignar. El cálculo eléctrico y la lista de trámites de este documento
  necesitan la firma de un responsable con registro: asígnalo desde la libreta de la obra antes de
  entregarlo.</p>
  `}

  ${r.circuito?.conductor.calibre && d.site ? `
  <h2>Conductor y protección del circuito</h2>
  <p>Conductor de <strong>${esc(r.circuito.conductor.calibre.nombre)}</strong> de cobre
  ${r.circuito.proteccion.valor !== null
    ? `con protección de <strong>${r.circuito.proteccion.valor} A</strong>`
    : "<strong>sin protección conforme</strong>"}, para
  ${r.circuito.metros} m de una vía hasta el inversor.</p>

  <p>El cálculo parte de ${r.circuito.conductor.iDiseno.toFixed(1)} A de corriente de diseño
  —${(d.panel.isc).toFixed(2)} A de corto circuito del módulo por los dos factores de 125 % que
  piden NEC 690.8(A) y 690.8(B)— y de una temperatura de diseño de
  <strong>${Math.round(r.circuito.conductor.tDiseno)} °C</strong>: los ${d.site.tMaxAbs} °C máximos
  medidos en ${esc(d.site.nombre)} más los 22 °C que la norma obliga a sumar cuando la tubería va sobre
  la azotea. Eso deja el factor de corrección en ${r.circuito.conductor.fTemp} y el de agrupamiento
  en ${r.circuito.conductor.fAgrup}, así que el conductor necesita
  ${r.circuito.conductor.ampRequerida.toFixed(0)} A de tabla.</p>

  ${r.circuito.subidoPorProteccion ? `<p>Se subió el calibre de ${r.circuito.calibreMinimo} a
  ${esc(r.circuito.conductor.calibre.nombre)} <strong>por la protección, no por la corriente</strong>:
  el calibre menor corregido solo aguanta ${r.circuito.proteccion.maximo.toFixed(0)} A y el valor
  comercial siguiente sobre la corriente de diseño lo excedería, de modo que no existiría un
  fusible conforme. Subir cobre es el lado seguro.</p>` : ""}

  <p>Caída de tensión: <strong>${r.circuito.conductor.caida.toFixed(2)} %</strong> de ida y vuelta,
  bajo el límite de 2 % del circuito de corriente directa.</p>

  <p class="note">Bajar la tubería del techo elimina los 22 °C de sobretemperatura normativa y
  suele permitir un calibre menor.</p>

  <p class="note">Los criterios citados son del NEC (690.8, 690.9 y la lista cerrada de valores
  comerciales de 240.6(A)).</p>
  ` : ""}

  <h2>De dónde sale la producción</h2>
  ${d.site ? `
  <p>El rendimiento de este cálculo se midió en ${esc(d.site.nombre)} contra ${FUENTE_FISICA.primaria},
  base ${FUENTE_FISICA.base}, años ${FUENTE_FISICA.anios}:
  <strong>${fmt(Math.round(d.site.rendimiento))} kWh por kWp instalado al año</strong> orientado al sur con
  ${d.site.tiltOptimo}° de inclinación y sin pérdidas de sistema, que se descuentan aparte.
  La variación entre un año y otro medida en el sitio es de ±${Math.round(d.site.desviacionInteranual)} kWh/kWp
  (±${((d.site.desviacionInteranual / d.site.rendimiento) * 100).toFixed(1)} %), así que un año seco
  o nublado se mueve dentro de ese margen sin que el sistema tenga ninguna falla.</p>
  ${d.site.fuenteRendimiento === "menor-de-dos" ? `
  <p class="note">Dos fuentes independientes discrepan
  ${Math.abs(d.site.discrepanciaFuentes).toFixed(1)} % en la irradiación de este punto
  (${FUENTE_FISICA.base} contra ${FUENTE_FISICA.contraste}). Esta propuesta usa deliberadamente la
  cifra MENOR de las dos: sin degradar serían ${fmt(Math.round(d.site.rendimientoPvgis))} kWh/kWp.
  Preferimos una estimación que el sistema cumpla a una que se vea mejor en papel.</p>` : ""}
  ` : `
  <p class="note">Esta dirección no está en el catálogo de ciudades medidas, así que el rendimiento
  usado (${fmt(d.yield)} kWh/kWp año) es el promedio de ${RESUMEN.sitios} ciudades mexicanas medidas
  en ${RESUMEN.estados} estados. El rango real entre ellas va de ${RESUMEN.menor.valor}
  (${esc(RESUMEN.menor.nombre)}) a ${RESUMEN.mayor.valor} (${RESUMEN.mayor.nombre}) kWh/kWp, de modo que
  esta cifra puede desviarse hasta ${RESUMEN.errorDelPromedio.toFixed(0)} % en cualquier dirección.
  Antes de comprometer una producción conviene medir el sitio.</p>
  `}

  <p class="foot">Estimación generada por SolarMe con modelo físico (rendimiento medido por
  ubicación, orientación, pérdidas y factor de emisión de México). Los valores finales se confirman
  con el levantamiento del techo y la visita técnica. Precios y tarifas de referencia, sujetos a
  cambio.</p>
</body></html>`;
}
