import { MapPin, Mountain, TriangleAlert, Compass, Navigation, Loader, Thermometer } from "lucide-react";
import { FUENTE_FISICA, RESUMEN, type Site } from "../lib/site";
import type { AjusteTermico } from "../lib/termico";
import {
  confianzaPorDistancia, type GeoEstado, type PrecisionPunto, type ResolucionOrigen,
} from "../lib/geocode";
import { fmt } from "../lib/solar";

/**
 * De dónde salen los números de este análisis. No es un adorno: la diferencia entre un
 * rendimiento medido en la ciudad y un promedio nacional es de hasta 7 %, y quien firma
 * una propuesta tiene derecho a saber cuál de los dos está usando.
 *
 * Cuando dos fuentes independientes discrepan se muestra el desacuerdo en vez de
 * esconderlo, y la cifra en uso es la menor de las dos.
 */
/** Cómo se le dice al instalador hasta dónde llegó la ubicación, sin jerga de geocodificación. */
const NIVEL_UBICACION: Record<PrecisionPunto, string> = {
  edificio: "ubicado en el número exacto",
  calle: "ubicado solo en la calle",
  localidad: "ubicado solo en la localidad",
};

export default function PhysicsSource({ site, lat, yieldKwh, termico, resolucion }: {
  site?: Site;
  lat: number;
  yieldKwh: number;
  /** Ajuste por el coeficiente del módulo elegido. Se declara porque supone la temperatura de celda. */
  termico?: AjusteTermico;
  resolucion?: {
    origen: ResolucionOrigen; km?: number; cerca?: string; buscando?: boolean; motivo?: GeoEstado;
    encontrado?: string; precision?: PrecisionPunto;
  };
}) {
  if (!site) {
    if (resolucion?.buscando) {
      return (
        <div className="rounded-xl border border-line bg-paper px-4 py-3">
          <p className="flex items-center gap-2 text-xs text-muted">
            <Loader size={13} className="animate-spin text-faint" />
            Buscando las coordenadas del domicilio para usar la ciudad medida más cercana.
            Mientras tanto se muestra el promedio nacional.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-line bg-paper px-4 py-3">
        <div className="flex items-start gap-2.5">
          <TriangleAlert size={15} className="mt-px shrink-0 text-solar-600" />
          <div className="min-w-0 text-xs leading-relaxed">
            <p className="font-medium text-ink">
              Sin medición local · {fmt(yieldKwh)} kWh/kWp año
              <span className="ml-1.5 rounded bg-line px-1.5 py-px font-medium text-muted">
                estimado
              </span>
            </p>
            {/* El motivo importa: sin señal el dato se puede mejorar con solo esperar a tener
                red, mientras una dirección que el índice no conoce hay que ubicarla a mano.
                Decir "no encontramos tu dirección" cuando lo que falta es señal manda al
                instalador a resolver el problema equivocado. */}
            {resolucion?.motivo === "sin-red" && (
              <p className="mt-1 font-medium text-ink">
                Sin conexión: no se pudo ubicar el domicilio. Con señal, la app usa la ciudad
                medida más cercana; el resto del análisis funciona igual sin red.
              </p>
            )}
            {resolucion?.motivo === "servicio-falló" && (
              <p className="mt-1 font-medium text-ink">
                El servicio de ubicación no respondió. Vuelve a intentarlo en un momento.
              </p>
            )}
            {resolucion?.motivo === "no-encontrado" && (
              <p className="mt-1 font-medium text-ink">
                No se reconoció el domicilio. Escribe la ciudad para usar su física medida.
              </p>
            )}
            <p className="mt-1 text-muted">
              Promedio de {RESUMEN.sitios} ciudades medidas en {RESUMEN.estados} estados. El
              rango real va de {RESUMEN.menor.valor} ({RESUMEN.menor.nombre}) a{" "}
              {RESUMEN.mayor.valor} ({RESUMEN.mayor.nombre}), así que este número puede errar
              hasta {RESUMEN.errorDelPromedio.toFixed(0)} % en cualquier dirección. La
              inclinación óptima sale de una fórmula de latitud que se queda corta en los{" "}
              {RESUMEN.sitios} sitios medidos, hasta 7°.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const degradado = site.fuenteRendimiento === "menor-de-dos";
  const sd = (site.desviacionInteranual / site.rendimiento) * 100;
  const porCercania = resolucion?.origen === "cercano" && resolucion.km !== undefined;
  const confianza = porCercania ? confianzaPorDistancia(resolucion!.km!) : null;

  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-xs">
        <span className="inline-flex items-baseline gap-1.5">
          <MapPin size={13} className="translate-y-0.5 text-faint" />
          <span className="text-muted">Rendimiento</span>
          <span className="font-medium text-ink tabular-nums">{fmt(Math.round(site.rendimiento))}</span>
          <span className="text-faint tabular-nums">
            ± {Math.round(site.desviacionInteranual)} kWh/kWp
          </span>
          <span
            className={`rounded px-1.5 py-px font-medium ${
              porCercania && confianza === "baja"
                ? "bg-solar-500/10 text-solar-600"
                : "bg-leaf-600/10 text-leaf-600"
            }`}
          >
            {porCercania ? `medido a ${Math.round(resolucion!.km!)} km` : "medido"}
          </span>
        </span>

        {/* Al resolver por cercanía la altitud es la del SITIO medido, no la del domicilio,
            mientras la latitud sí es la del domicilio. Mostrarlas juntas sin distinguirlas
            invita a leer la altitud como si fuera del techo del cliente. */}
        <span className="inline-flex items-baseline gap-1.5">
          <Mountain size={13} className="translate-y-0.5 text-faint" />
          <span className="text-muted">
            Altitud{porCercania ? ` de ${site.nombre}` : ""}
          </span>
          <span className="font-medium text-ink tabular-nums">{Math.round(site.elevacion)} m</span>
        </span>

        <span className="inline-flex items-baseline gap-1.5">
          <Compass size={13} className="translate-y-0.5 text-faint" />
          <span className="text-muted">Óptimo</span>
          {/* El azimut solo se nombra cuando desviarse del sur cambia algo medible. Con
              una ganancia menor a 0.2 % decir "3° al oriente" mientras el control de al
              lado marca "Sur · óptimo" se lee como una contradicción, y no lo es. */}
          <span className="font-medium text-ink tabular-nums">
            {site.tiltOptimo}° ·{" "}
            {site.ganaSobreSur >= 0.2
              ? `${Math.abs(site.azimutOptimo)}° al ${site.azimutOptimo < 0 ? "oriente" : "poniente"}`
              : "sur"}
          </span>
        </span>

        <span className="text-faint">
          latitud {porCercania ? "del domicilio " : ""}{lat.toFixed(2)}° · variación entre años ±{sd.toFixed(1)}%
          {!site.mallaCompleta && " · curva de pérdidas ajustada"}
        </span>
      </div>

      {/* Defecto propio, encontrado al medirlo: cuando la coincidencia de texto es DÉBIL —el
          nombre que casó está en el último segmento, donde va el estado— `resolveSite` intenta
          geocodificar y, si no puede, se queda con esa ciudad y lo declara en `motivo`. Pero los
          avisos de `motivo` sólo se pintaban en la rama sin sitio, así que aquí no salía nada: el
          instalador veía «Veracruz · medido» sin enterarse de que su domicilio nunca se ubicó.
          Y esto no es raro hoy: Nominatim deniega el acceso a peticiones con User-Agent de
          navegador —comprobado, «Access denied» con Mozilla/5.0 y respuesta correcta con un
          User-Agent identificado—, y un navegador no puede cambiar el suyo. */}
      {/* La dirección que el servicio encontró de verdad, para que el instalador la confirme.
          Antes se descartaba en App y una coincidencia en otro municipio pasaba callada: medido,
          «Avenida Juárez 1910, Puebla» resuelve a Cuautlancingo. Y se declara HASTA DÓNDE llegó
          la ubicación, porque de 8 direcciones mexicanas solo 2 llegaron al número de la casa. */}
      {resolucion?.encontrado && (
        <div className="mt-3 border-t border-line pt-2.5">
          <p className="text-xs leading-relaxed text-muted">
            <span className="text-faint">Ubicado como</span>{" "}
            <span className="font-medium text-ink">{resolucion.encontrado}</span>
            {resolucion.precision && (
              <>
                {" · "}
                <span
                  className={
                    resolucion.precision === "edificio" ? "text-leaf-600" : "text-solar-600"
                  }
                >
                  {NIVEL_UBICACION[resolucion.precision]}
                </span>
              </>
            )}
          </p>
          {resolucion.precision && resolucion.precision !== "edificio" && (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Confirma que sea el domicilio correcto: a este nivel el punto puede caer lejos del
              número, incluso en otro municipio con el mismo nombre de calle. La física apenas
              cambia, pero la dirección es la que va en la propuesta.
            </p>
          )}
        </div>
      )}

      {resolucion?.origen === "catalogo" && resolucion.motivo && resolucion.motivo !== "encontrado" && (
        <p className="mt-2.5 flex items-start gap-2 border-t border-line pt-2.5 text-xs text-muted">
          <Navigation size={13} className="mt-px shrink-0 text-faint" />
          <span>
            No se pudo ubicar el domicilio
            {resolucion.motivo === "sin-red" ? " (sin conexión)" : ""}, así que se usa la física
            medida de <span className="font-medium text-ink">{site.nombre}</span> por el nombre
            escrito. Si el domicilio está en otra parte del estado, escribe la ciudad más cercana
            para que el rendimiento sea el suyo.
          </span>
        </p>
      )}

      {porCercania && (
        <p className="mt-2.5 flex items-start gap-2 border-t border-line pt-2.5 text-xs text-muted">
          <Navigation size={13} className="mt-px shrink-0 text-faint" />
          <span>
            Esta dirección no está en el catálogo. Se geocodificó y se usa la física medida
            de <span className="font-medium text-ink">{site.nombre}</span>, a{" "}
            {Math.round(resolucion!.km!)} km.{" "}
            {/* El texto de «alta» decía «prácticamente el del domicilio», y eso es falso: al
                comparar los 194 pares de sitios medidos a menos de 150 km, la distancia predice
                mal el desacuerdo (r = 0.33) y la diferencia de altitud lo predice mejor
                (r = 0.47). Orizaba y Córdoba están a 18 km y difieren 11.5 % porque los separan
                395 m de altitud. Prometer «prácticamente igual» a esa distancia era el mismo
                defecto que este trabajo vino a quitar de todo lo demás. */}
            {confianza === "alta"
              ? "Cerca no siempre significa igual: entre dos ciudades medidas a 18 km, un salto de 400 m de altitud cambia el rendimiento 11 %. Si el domicilio está notablemente más alto o más bajo, confírmalo antes de comprometer producción."
              : confianza === "media"
                ? "Sirve para dimensionar, pero conviene confirmarlo antes de comprometer producción."
                : "A esta distancia se puede haber cruzado de la costa a la sierra: trátalo como orden de magnitud, no como compromiso."}
          </span>
        </p>
      )}

      {site.ganaSobreSur >= 0.2 && (
        <p className="mt-2.5 border-t border-line pt-2.5 text-xs text-muted">
          Girar el arreglo {Math.abs(site.azimutOptimo)}° al{" "}
          {site.azimutOptimo < 0 ? "oriente" : "poniente"} del sur rinde{" "}
          <span className="font-medium text-ink">{site.ganaSobreSur.toFixed(2)}% más</span> que
          apuntarlo al sur exacto. Es gratis: solo cambia cómo se colocan los rieles.
        </p>
      )}

      {termico && site && site.tMediaSol !== undefined && Number.isFinite(termico.tCelda) && (
        <p className="mt-2.5 flex items-start gap-2 border-t border-line pt-2.5 text-xs text-muted">
          <Thermometer size={13} className="mt-px shrink-0 text-faint" />
          <span>
            Este módulo tiene{" "}
            <span className="font-medium text-ink tabular-nums">
              {termico.coefModulo.toFixed(2)} %/°C
            </span>{" "}
            contra {termico.coefRef.toFixed(2)} del módulo de referencia con el que se midió el
            rendimiento, así que la producción se corrige{" "}
            <span className={`font-medium tabular-nums ${termico.factor >= 1 ? "text-leaf-600" : "text-solar-600"}`}>
              {termico.factor >= 1 ? "+" : ""}{((termico.factor - 1) * 100).toFixed(1)}%
            </span>
            . Con {site.tMediaSol} °C de aire medido en horas de producción se supone la celda a{" "}
            {Math.round(termico.tCelda)} °C (NOCT 45 °C): el aire está medido, la sobretemperatura
            es un supuesto.
          </span>
        </p>
      )}

      {degradado && (
        <p className="mt-2.5 flex items-start gap-2 border-t border-line pt-2.5 text-xs text-muted">
          <TriangleAlert size={13} className="mt-px shrink-0 text-solar-600" />
          <span>
            Dos fuentes independientes discrepan{" "}
            <span className="font-medium text-ink tabular-nums">
              {Math.abs(site.discrepanciaFuentes).toFixed(1)}%
            </span>{" "}
            en este punto ({FUENTE_FISICA.base} contra {FUENTE_FISICA.contraste}). Se usa la
            menor de las dos: sobreestimar produce una propuesta que no cumple. Sin degradar
            serían {fmt(Math.round(site.rendimientoPvgis))} kWh/kWp.
          </span>
        </p>
      )}
    </div>
  );
}
