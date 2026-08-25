import { useState } from "react";
import { Cable, TriangleAlert, Thermometer, Ruler } from "lucide-react";
import { periodoEnAnios } from "../lib/tiempo";
import { LIMITE_CAIDA, ADDER_AZOTEA } from "../lib/conductor";
import type { Circuito2 } from "../lib/ocpd";
import { UserCheck } from "lucide-react";
import type { Contacto } from "../lib/contactos";
import { VENTANAS, type Arreglo, type Ventana } from "../lib/strings";
import type { Site } from "../lib/site";
import { fmt } from "../lib/solar";

/**
 * Cómo se conectan los módulos: cuántos en serie y cuántas series.
 *
 * Es el cálculo cuyo error rompe equipo. El voltaje de circuito abierto SUBE cuando baja la
 * temperatura, así que el número que importa no es el de un día normal sino el de la mañana más
 * fría medida en ese sitio. Por eso la temperatura se muestra junto al resultado: es el dato
 * que hace que la cifra sea distinta en Ciudad Juárez y en Mérida con el mismo equipo.
 */
export default function StringSizing({
  strings, ventana, inversor, site, kwp, onVentana, circuito, metros, onMetros,
  responsables, responsableId, onResponsable,
}: {
  strings?: Arreglo;
  ventana?: Ventana;
  inversor?: { min: number; max: number };
  site?: Site;
  kwp: number;
  onVentana: (clave: Ventana["clave"]) => void;
  /** Circuito ya calculado por `compute`: conductor y protección. */
  circuito?: Circuito2;
  metros: number;
  onMetros: (m: number) => void;
  /** Electricistas de la libreta, para asignar quién firma este cálculo. */
  responsables: Contacto[];
  responsableId?: string;
  onResponsable: (id: string | undefined) => void;
}) {

  if (!site || !strings || !ventana) {
    return (
      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="text-sm font-medium">Conexión en series</h3>
        <p className="mt-2 flex items-start gap-2 txt-mini text-muted">
          <TriangleAlert size={13} className="mt-px shrink-0 text-solar-600" />
          <span>
            Hace falta la ciudad medida. El largo de una serie depende de la temperatura mínima
            extrema del sitio, y suponerla no da una cifra imprecisa: da un inversor quemado.
            Escribe la ciudad y el cálculo aparece.
          </span>
        </p>
      </div>
    );
  }

  const r = strings.rango;
  const apretado = strings.margen < 5;

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <Cable size={14} className="text-faint" /> Conexión en series
          </h3>
          <p className="mt-0.5 txt-mini text-muted">
            Con la mañana más fría medida en {site.nombre}, no con un promedio.
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-line txt-mini">
          {VENTANAS.map((v) => (
            <button
              key={v.clave}
              onClick={() => onVentana(v.clave)}
              className={`min-h-11 px-2.5 py-1.5 transition sm:min-h-0 ${
                v.clave === ventana.clave
                  ? "bg-ink font-medium text-white"
                  : "text-muted hover:bg-paper hover:text-ink"
              }`}
            >
              {v.vMax} V
            </button>
          ))}
        </div>
      </div>

      {!r.viable || strings.strings === 0 ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-solar-500/30 bg-solar-500/5 px-3 py-2.5 txt-mini text-muted">
          <TriangleAlert size={13} className="mt-px shrink-0 text-solar-600" />
          <span>
            {!r.viable ? (
              <>
                Este módulo no combina con un inversor de {ventana.vMax} V en este sitio: para
                arrancar el seguidor haría falta{" "}
                <span className="font-medium text-ink">{r.min}</span> en serie, y el frío solo
                permite <span className="font-medium text-ink">{r.max}</span>. Prueba otra
                ventana u otro módulo.
              </>
            ) : (
              <>
                Con {strings.sobrantes} módulo{strings.sobrantes === 1 ? "" : "s"} no alcanza para
                una serie de {r.min}. Amplía la superficie o elige un módulo de menos voltaje.
              </>
            )}
          </span>
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
            <Dato k="Arreglo" v={`${strings.strings} × ${strings.porString}`}
              pie={`series × módulos${strings.sobrantes > 0 ? ` · ${strings.sobrantes} sin conectar` : ""}`} />
            <Dato k="Voltaje en frío" v={`${fmt(Math.round(strings.vStringFrio))} V`}
              pie={`máximo del inversor ${ventana.vMax} V`} />
            <Dato k="Margen" v={`${strings.margen.toFixed(1)}%`}
              pie={apretado ? "poco holgado" : "holgado"} acento={apretado} />
            <Dato k="Inversor" v={inversor ? `${inversor.min}–${inversor.max} kW` : "—"}
              pie={`para ${kwp.toFixed(1)} kWp de módulos`} />
          </div>

          <Conductor circuito={circuito} metros={metros} onMetros={onMetros} site={site} />

          <Firma
            responsables={responsables}
            valor={responsableId}
            onChange={onResponsable}
          />

          <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 txt-mini text-muted">
            <Thermometer size={13} className="mt-px shrink-0 text-faint" />
            <span>
              A <span className="font-medium text-ink">{r.tFrio} °C</span> —la mínima absoluta
              medida en {periodoEnAnios(site.diasSerie)} de registro— cada módulo da{" "}
              <span className="font-medium text-ink">{r.vocFrio} V</span> en circuito abierto,
              contra {site.tMinAshrae} °C que usaría el criterio de norma. Caben hasta{" "}
              <span className="font-medium text-ink">{r.max}</span> en serie; una más rebasaría el
              inversor.
              {apretado && " El margen es corto: verifica el dato del inversor que vas a usar."}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Calibre del conductor del circuito. Va aquí y no en otra tarjeta porque depende del string:
 * la corriente sale del módulo y el voltaje del reparto en series que se acaba de decidir.
 */
function Conductor({ circuito, metros, onMetros, site }: {
  circuito?: Circuito2;
  metros: number;
  onMetros: (m: number) => void;
  site: Site;
}) {
  const r = circuito?.conductor;
  const p = circuito?.proteccion;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 txt-mini font-medium">
          <Ruler size={12} className="text-faint" /> Conductor y protección
        </h4>
        <CampoMetros metros={metros} onMetros={onMetros} />
      </div>

      {r?.calibre && p ? (
        <p className="mt-2 txt-micro text-muted">
          <span className="font-medium text-ink">{r.calibre.nombre}</span> de cobre
          {p.valor !== null && (
            <> con protección de <span className="font-medium text-ink">{p.valor} A</span></>
          )}
          .{" "}
          {circuito!.subidoPorProteccion ? (
            <>
              Por corriente bastaría {circuito!.calibreMinimo}, pero corregido solo aguanta{" "}
              {p.maximo.toFixed(0)} A y el fusible comercial siguiente lo excedería: el calibre lo
              manda la protección.{" "}
            </>
          ) : r.manda === "caida" ? (
            <>
              Lo manda la caída de tensión, no la corriente: por ampacidad bastaría{" "}
              {r.calibrePorAmpacidad?.nombre}, pero a {circuito!.metros} m se pasaría de {LIMITE_CAIDA} %.{" "}
            </>
          ) : (
            <>
              Necesita {r.ampRequerida.toFixed(0)} A de tabla y da {r.calibre.amp} A; la caída queda
              en {r.caida.toFixed(2)} %.{" "}
            </>
          )}
          El diseño usa <span className="font-medium text-ink">{Math.round(r.tDiseno)} °C</span>: los{" "}
          {site.tMaxAbs} °C máximos medidos en {site.nombre} más los {ADDER_AZOTEA} °C que la norma
          obliga a sumar por tubería sobre azotea, lo que deja el factor en {r.fTemp}.
        </p>
      ) : (
        <p className="mt-2 flex items-start gap-2 txt-micro text-muted">
          <TriangleAlert size={12} className="mt-px shrink-0 text-solar-600" />
          <span>No hay circuito viable: {r?.motivo ?? p?.motivo ?? "faltan datos del sitio"}.</span>
        </p>
      )}

      {r?.calibre && p && p.valor === null && (
        <p className="mt-1.5 flex items-start gap-2 txt-micro text-muted">
          <TriangleAlert size={12} className="mt-px shrink-0 text-solar-600" />
          <span>Sin protección conforme: {p.motivo}.</span>
        </p>
      )}

      <p className="mt-1.5 txt-micro text-faint">
        Criterio NEC 690.8 y 690.9 con los dos factores de 125 %; valores de fusible de la lista
        cerrada de 240.6(A). NOM-001-SEDE reproduce esta estructura, pero su texto no se verificó
        directamente: confírmalo antes de firmar un plano.
      </p>
    </div>
  );
}

/**
 * Quién firma este cálculo.
 *
 * Va junto al conductor y la protección porque es lo que hay que firmar. Un cálculo correcto sin
 * responsable asignado no se puede presentar, y la propuesta lo dice en lugar de dejar un hueco.
 */
function Firma({ responsables, valor, onChange }: {
  responsables: Contacto[];
  valor?: string;
  onChange: (id: string | undefined) => void;
}) {
  const elegido = responsables.find((c) => c.id === valor);

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 txt-mini font-medium">
          <UserCheck size={12} className="text-faint" /> Quién firma
        </h4>
        {responsables.length > 0 && (
          <select
            value={valor ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            aria-label="Electricista responsable que firma el cálculo"
            className="min-h-11 max-w-[60%] rounded border border-line bg-paper px-2 py-1 txt-micro text-ink sm:min-h-0"
          >
            <option value="">Sin asignar</option>
            {responsables.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}{c.registro ? ` · ${c.registro}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="mt-1.5 txt-micro text-faint">
        {responsables.length === 0 ? (
          <>
            No hay electricista responsable en la libreta de la obra. Este cálculo y la lista de
            trámites necesitan la firma de alguien con registro.
          </>
        ) : elegido ? (
          <>
            {elegido.nombre} firma el cálculo eléctrico y la conformidad.{" "}
            {elegido.registro
              ? `Su registro (${elegido.registro}) sale en la propuesta.`
              : "No tiene registro capturado: anótalo en la libreta antes del trámite."}
          </>
        ) : (
          <>Sin asignar. La propuesta lo dirá en lugar de imprimir un hueco donde va la firma.</>
        )}
      </p>
    </div>
  );
}

function Dato({ k, v, pie, acento }: { k: string; v: string; pie: string; acento?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="txt-micro uppercase tracking-wide text-faint">{k}</div>
      <div className={`mt-0.5 text-lg font-medium tabular-nums ${acento ? "text-solar-600" : ""}`}>
        {v}
      </div>
      <div className="txt-micro text-faint">{pie}</div>
    </div>
  );
}

/**
 * Los metros de una vía hasta el inversor.
 *
 * Va en su propio componente por dos razones. Una técnica: `StringSizing` tiene un retorno temprano
 * cuando todavía no hay sitio ni series, y un estado declarado después de ese retorno rompe la regla
 * de los hooks. Y una de uso: el campo necesita un BORRADOR.
 *
 * Con el valor atado directamente al cálculo, borrar «15» para escribir «40» dejaba el campo en «1»
 * de golpe —el mínimo— y el instalador acababa escribiendo «140». Ahora se teclea libre y el número
 * se confirma al salir del campo o con Enter, que además evita recalcular el conductor en cada
 * pulsación. Acepta coma decimal, como los otros campos numéricos de la aplicación.
 */
function CampoMetros({ metros, onMetros }: { metros: number; onMetros: (m: number) => void }) {
  const [borrador, setBorrador] = useState<string | null>(null);

  const confirmar = () => {
    if (borrador === null) return;
    const v = Number(borrador.replace(",", "."));
    // un campo vacío o un texto que no es número dejan el valor anterior, en vez de saltar al
    // mínimo sin avisar
    if (Number.isFinite(v) && v > 0) onMetros(Math.max(1, Math.min(500, Math.round(v))));
    setBorrador(null);
  };

  return (
    <label className="flex items-center gap-1.5 txt-micro text-muted">
      Al inversor
      <input
        type="text"
        inputMode="decimal"
        value={borrador ?? String(metros)}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirmar();
          if (e.key === "Escape") setBorrador(null);
        }}
        aria-label="Metros de una vía del circuito al inversor"
        className="min-h-11 w-16 rounded border border-line bg-paper px-1.5 py-1 text-right tabular-nums text-ink sm:min-h-0"
      />
      m
    </label>
  );
}
