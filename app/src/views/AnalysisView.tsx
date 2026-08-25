import { useEffect, useMemo, useState } from "react";
import {
  Zap, PiggyBank, TrendingUp, Leaf, Compass, Ruler, SunMedium, CloudSun,
  FileDown, Save, Check, MapPinned} from "lucide-react";
import {
  compute, optTiltFor, optAzFor, azPenalty, azLabel, fmt, paybackLabel, orientationAdvice,
  RUN_METERS_INICIAL,
  type Design, type ProjectType,
} from "../lib/solar";
import RoofView, { type RoofLayer } from "../components/RoofView";
import MonthlyChart from "../components/MonthlyChart";
import PhysicsSource from "../components/PhysicsSource";
import ObstacleCapture from "../components/ObstacleCapture";
import StringSizing from "../components/StringSizing";
import type { Ventana } from "../lib/strings";
import type { ResolucionOrigen } from "../lib/geocode";
import BillCapture from "../components/BillCapture";
import BosRateField from "../components/BosRateField";
import { isOwnBos, type BosRates } from "../lib/bos";
import SatelliteStatus from "../components/SatelliteStatus";
import { buildingInsights, type SolarLookup } from "../lib/solarApi";
import { buildProposal } from "../lib/proposal";
import { ajustarAlConsumo } from "../lib/dimensionado";
import { porcentajesEnteros } from "../lib/capex";
import { leerContactos } from "../lib/contactos";
import Unifilar from "../components/Unifilar";
import { desconectadorCC, desconectadorCA, unifilar, nodosIncompletos } from "../lib/desconexion";

type Tab = "diseno" | "produccion" | "financiero";

interface Props {
  address: string;
  city: string;
  design: Design;
  onChange: (patch: Partial<Design>) => void;
  onSave: () => void;
  saved: boolean;
  bosRates: BosRates;
  onSetBos: (type: ProjectType, mxnPerW: number) => void;
  onClearBos: (type: ProjectType) => void;
  /** Procedencia de la física: catálogo por nombre, sitio medido cercano, o promedio. */
  resolucion?: { origen: ResolucionOrigen; km?: number; cerca?: string; buscando?: boolean };
  /** Abre el mapa para que el instalador corrija el punto del techo. */
  onAjustarUbicacion?: () => void;
}

export default function AnalysisView({ address, city, design: d, onChange, onSave, saved, bosRates, onSetBos, onClearBos, resolucion, onAjustarUbicacion }: Props) {
  const [tab, setTab] = useState<Tab>("diseno");
  // La libreta se lee al montar. Si el instalador la edita, vuelve aquí y se relee: la vista se
  // desmonta al cambiar de sección, así que no hace falta observar el almacenamiento.
  const contactos = useMemo(() => leerContactos(), []);
  const responsables = useMemo(
    () => contactos.filter((c) => c.rol === "electricista"),
    [contactos]
  );
  const [layer, setLayer] = useState<RoofLayer>("sat");
  const [sat, setSat] = useState<SolarLookup>({ status: "no-key" });
  // URL del documento cuando la ventana emergente fue bloqueada. Null mientras no lo sea.
  const [propuestaBloqueada, setPropuestaBloqueada] = useState<string | null>(null);

  // Consulta el techo real al abrir el análisis. Sin clave devuelve no-key sin gastar nada;
  // el resultado se cachea por coordenada para no pagar dos veces el mismo edificio.
  useEffect(() => {
    let vivo = true;
    buildingInsights(d.lat, d.lng).then((r) => { if (vivo) setSat(r); });
    return () => { vivo = false; };
  }, [d.lat, d.lng]);
  const r = useMemo(() => compute(d), [d]);

  // El unifilar se deriva del MISMO resultado que la propuesta, para que no puedan discrepar.
  const desconexionCC = useMemo(() => desconectadorCC(r.strings, r.circuito), [r]);
  const desconexionCA = useMemo(() => desconectadorCA(), []);

  // Los porcentajes del desglose se reparten para que sumen 100: redondear cada uno por su cuenta
  // daba 99 o 101 en el 54 % de los casos medidos.
  const pctsCosto = useMemo(
    () => porcentajesEnteros(r.costs.lines.map((l) => l.share)),
    [r.costs.lines]
  );
  const nodosUnifilar = useMemo(
    () => unifilar(r.strings, r.ventana, r.circuito, (d.panel.w * (r.placement?.count ?? 0)) / 1000,
                   desconexionCC, desconexionCA),
    [r, d.panel.w, desconexionCC, desconexionCA]
  );
  const ot = optTiltFor(d);
  // La etiqueta no afirma cuál es el óptimo con un valor escrito a mano: muestra lo que
  // esta orientación pierde contra el mejor azimut MEDIDO del sitio.
  const penal = azPenalty(d.az, d);
  const azHint =
    penal < 0.002
      ? "óptimo"
      : `−${(penal * 100).toFixed(1)}% vs ${azLabel(optAzFor(d))}`;
  const advice = orientationAdvice(d.tilt, d.az, d.lat, d.site);
  // "Óptima" describe la ORIENTACIÓN, no el techo entero. Antes incluía `d.shade === 0`, y
  // como la sombra ahora se calcula de los estorbos el deslizador se queda en cero: la
  // etiqueta aparecía junto a un techo con 30 % de pérdida por un árbol, avalando un diseño
  // arruinado. La sombra se informa aparte porque es otra cosa y se arregla de otra manera.
  const isOptimal = d.tilt === ot && Math.abs(d.az - 180) <= 2;
  const perdidaSombra = r.shading ? r.shading.loss : d.shade / 100;

  /**
   * Salida cuando el navegador bloquea la ventana emergente.
   *
   * Antes esto era `if (!w) return;`: el instalador tocaba «Propuesta», no pasaba NADA y no había
   * forma de saber por qué. En un teléfono —que es donde se usa esto, en la azotea o frente al
   * cliente— el bloqueo de emergentes es el comportamiento normal, no la excepción, así que el
   * caso silencioso era el caso frecuente y la app parecía descompuesta.
   *
   * En vez de pedirle que cambie la configuración del navegador, se le da el documento como
   * archivo: un enlace que él toca, y un toque suyo sí se permite.
   */
  function propuesta() {
    const w = window.open("", "_blank", "width=820,height=980");
    if (!w) {
      const html = buildProposal(address, city, d, r, contactos, isOwnBos(bosRates, d.type));
      setPropuestaBloqueada(URL.createObjectURL(new Blob([html], { type: "text/html" })));
      return;
    }
    setPropuestaBloqueada(null);
    // El documento tiene que decir si el costo por watt es el del instalador o la referencia
    // nacional: `bosFor` siempre devuelve un número, así que el dato no se puede deducir del
    // diseño y hay que pasarlo.
    w.document.write(buildProposal(address, city, d, r, contactos, isOwnBos(bosRates, d.type)));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-3xl tracking-tight">{address}</h1>
          <p className="mt-1 text-sm text-muted">{city}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onSave} disabled={saved}
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition hover:border-ink disabled:opacity-40 sm:min-h-0">
            {saved ? <Check size={15} className="text-leaf-600" /> : <Save size={15} />}
            {saved ? "Guardado" : "Guardar"}
          </button>
          <button onClick={propuesta}
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-solar-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-solar-600 sm:min-h-0">
            <FileDown size={15} /> Propuesta
          </button>
        </div>
      </div>

      <div className="mb-5">
        <PhysicsSource
              termico={r.termico} site={d.site} lat={d.lat} yieldKwh={d.yield} resolucion={resolucion} />
        {onAjustarUbicacion && (
          <button
            type="button"
            onClick={onAjustarUbicacion}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 txt-mini font-medium text-ink transition hover:border-ink"
          >
            <MapPinned size={13} /> Ajustar el punto del techo en el mapa
          </button>
        )}
      </div>

      {/* Cifras de cabecera */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={<Zap size={15} />} k="Producción anual" v={fmt(Math.round(r.kwh))} u="kWh" />
        <Metric icon={<PiggyBank size={15} />} k="Ahorro / año" v={`$${fmt(Math.round(r.save))}`} accent />
        <Metric icon={<TrendingUp size={15} />} k="Retorno"
          v={r.noCabe ? "—" : r.payback.toFixed(1)} u={r.noCabe ? "no cabe" : "años"} />
        <Metric icon={<Leaf size={15} />} k="CO₂ evitado / año" v={r.co2.toFixed(1)} u="ton" />
      </div>

      <div className="mb-5">
        {propuestaBloqueada && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-solar-500/30 bg-solar-500/5 px-4 py-3 text-xs leading-relaxed">
            <span>
              <b className="font-semibold">Tu navegador bloqueó la ventana de la propuesta.</b>{" "}
              El documento está listo: ábrelo desde aquí.
            </span>
            <a
              href={propuestaBloqueada}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-xs font-medium text-white transition hover:opacity-90"
            >
              <FileDown size={14} /> Abrir la propuesta
            </a>
          </div>
        )}

        <SatelliteStatus lookup={sat} />
      </div>

      {/* Pestañas */}
      <div className="mb-5 flex gap-6 border-b border-line text-sm">
        {([["diseno", "Diseño"], ["produccion", "Producción"], ["financiero", "Financiero"]] as [Tab, string][]).map(
          ([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`-mb-px min-h-11 border-b-2 pb-2.5 transition sm:min-h-0 ${
                tab === k ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}>
              {label}
            </button>
          )
        )}
      </div>

      {tab === "diseno" && (
        <div className="fade-up grid gap-6 [&>*]:min-w-0 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-xl border border-line bg-card p-2">
            <div className="relative overflow-hidden rounded-lg">
              <div className="aspect-[16/11]">
                <RoofView az={d.az} layer={layer} shade={d.shade}
                  side={Math.sqrt(Math.max(0, d.area))} placement={r.placement}
                  shading={r.shading} obstacles={d.obstacles ?? []}
                  outline={r.outline}
                  outlineMedido={r.outlineMedido}
                  outlineInvalido={r.outlineInvalido}
                  onAddVertex={(despuesDe, x, y) => {
                    const v = [...r.outline];
                    v.splice(despuesDe + 1, 0, { x, y });
                    onChange({ outline: v });
                  }}
                  onDeleteVertex={(i) => {
                    if (r.outline.length <= 3) return;
                    onChange({ outline: r.outline.filter((_, k) => k !== i) });
                  }}
                  onMoveVertex={(i, x, y) =>
                    onChange({
                      outline: r.outline.map((v, k) => (k === i ? { x, y } : v)),
                    })
                  }
                  onMoveObstacle={(id, x, y) =>
                    onChange({
                      obstacles: (d.obstacles ?? []).map((o) =>
                        o.id === id ? { ...o, x, y } : o,
                      ),
                    })
                  } />
              </div>
              {/* Control de capas superpuesto (patrón de apps de mapa).
                  La primera pestaña se llamaba «Satélite» siempre, y sin imagen aérea eso es una
                  promesa que la propia esquina de al lado desmiente: lo que se ve es un plano a
                  escala dibujado por la aplicación. La etiqueta ahora depende de lo que hay. */}
              <div className="absolute left-3 top-3 flex overflow-hidden rounded-lg border border-line bg-card/95 text-[12px] shadow-sm backdrop-blur">
                {([
                  ["sat", sat.status === "ok" ? "Satélite" : "Plano"],
                  ["flux", "Irradiación"],
                  ["shade", "Sombra"],
                ] as [RoofLayer, string][])
                  .map(([k, label]) => (
                    <button key={k} onClick={() => setLayer(k)}
                      className={`min-h-11 px-2.5 py-1.5 transition sm:min-h-0 ${
                        layer === k ? "bg-ink font-medium text-white" : "text-muted hover:text-ink"}`}>
                      {label}
                    </button>
                  ))}
              </div>
              {/* Esta esquina llevaba un texto fijo que nombraba al proveedor de satélite como
                  plan futuro. Dos problemas: era una nota de hoja de ruta asomando en la interfaz,
                  y al ser fija se contradecía con la franja de arriba, que con una clave puesta
                  declara el techo como medido mientras aquí seguía diciéndose simulado, del mismo
                  techo. Ahora dice de dónde sale la geometría, igual que la propuesta impresa. */}
              <p className="absolute right-3 top-3 rounded bg-card/85 px-2 py-1 txt-micro text-faint backdrop-blur">
                {sat.status === "ok"
                  ? "Plano a escala del techo medido"
                  : r.outlineMedido
                    ? "Plano a escala del contorno que trazaste"
                    : "Plano a escala · cuadrado equivalente"}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
              <div className="flex flex-wrap gap-5 text-muted">
                <span><b className="font-semibold text-ink tabular-nums">{r.n}</b> módulos</span>
                <span><b className="font-semibold text-ink tabular-nums">{r.kwp.toFixed(1)}</b> kWp</span>
                <span className="truncate">{d.panel.brand} {d.panel.model}</span>
              </div>
              <span className="flex shrink-0 items-center gap-2.5 text-xs">
                {isOptimal && <span className="text-leaf-600">✓ orientación óptima</span>}
                {perdidaSombra > 0.02 && (
                  <span className="text-solar-600">
                    sombra −{(perdidaSombra * 100).toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium">Ajustes de instalación</h3>
              <span className="text-xs text-faint tabular-nums">Cubre {r.cov}% del consumo</span>
            </div>

            {/* Un tope invisible limitaría el diseño en silencio: el instalador ampliaría el techo y
                el conteo no subiría, sin explicación. Se declara y se puede quitar de un clic. */}
            {d.arregloTope && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-paper px-3 py-2">
                <p className="txt-mini">
                  Arreglo limitado a{" "}
                  <strong>
                    {d.arregloTope.filas} × {d.arregloTope.columnas}
                  </strong>{" "}
                  <span className="text-faint">
                    · el techo admite {r.placement.rows > 0 ? `${r.placement.rows} filas` : "más"}
                  </span>
                </p>
                <button
                  onClick={() => onChange({ arregloTope: undefined })}
                  className="min-h-11 rounded px-1 txt-micro font-medium text-solar-600 underline decoration-line underline-offset-2 transition hover:decoration-solar-600 sm:min-h-0"
                >
                  Quitar el límite y llenar el techo
                </button>
              </div>
            )}
            {/* El deslizador cede ante el contorno trazado, igual que el de sombra cede ante
                los estorbos capturados: dos cifras compitiendo por definir la misma superficie
                dejaban al deslizador mostrando 35 m² mientras el cálculo usaba otra. */}
            <Control
              icon={<Ruler size={14} />}
              label="Área utilizable"
              value={`${r.area.toFixed(r.outlineMedido ? 1 : 0)} m²`}
              hint={r.outlineMedido ? "del contorno" : undefined}
            >
              {r.outlineMedido ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-faint">
                    Sale del contorno que trazaste en el plano.
                  </p>
                  <button
                    onClick={() => onChange({ outline: undefined })}
                    className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted transition hover:bg-line hover:text-ink"
                  >
                    Volver al área
                  </button>
                </div>
              ) : (
                <input type="range" aria-label="Área utilizable en metros cuadrados" min={15} max={400} value={d.area}
                  onChange={(e) => onChange({ area: +e.target.value })} className="w-full" />
              )}
            </Control>
            <Control icon={<SunMedium size={14} />} label="Inclinación" value={`${d.tilt}°`}
              hint={d.tilt === ot ? "óptimo" : `óptimo ${ot}°`}>
              <input type="range" aria-label="Inclinación en grados" min={0} max={60} value={d.tilt}
                onChange={(e) => onChange({ tilt: +e.target.value })} className="w-full" />
            </Control>
            <Control icon={<Compass size={14} />} label="Orientación" value={azLabel(d.az)}
              hint={azHint}>
              <input type="range" aria-label="Orientación en grados de azimut" min={90} max={270} value={d.az}
                onChange={(e) => onChange({ az: +e.target.value })} className="w-full" />
            </Control>
            {/* El deslizador cede cuando hay estorbos capturados: aplicar los dos
                descontaría la misma sombra dos veces. */}
            <Control icon={<CloudSun size={14} />} label="Sombreado"
              value={
                r.shading
                  ? `${(r.shading.loss * 100).toFixed(1)}% calculado`
                  : d.shade === 0 ? "Sin sombra" : `${d.shade}% estimado`
              }>
              {r.shading ? (
                <p className="text-xs text-faint">
                  {(d.obstacles ?? []).length === 1
                    ? "Sale del estorbo capturado abajo, no de este control."
                    : `Sale de los ${(d.obstacles ?? []).length} estorbos capturados abajo, no de este control.`}
                </p>
              ) : (
                <input type="range" aria-label="Sombreado estimado en por ciento" min={0} max={35} value={d.shade}
                  onChange={(e) => onChange({ shade: +e.target.value })} className="w-full" />
              )}
            </Control>

            <span className="mb-2 mt-4 block text-xs text-muted">Tipo de proyecto</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-line p-1">
              {(["res", "com", "ind"] as ProjectType[]).map((t) => (
                <button key={t} onClick={() => onChange({ type: t, area: { res: 35, com: 180, ind: 400 }[t] })}
                  className={`min-h-11 rounded-md py-1.5 text-[13px] font-medium transition sm:min-h-0 ${
                    d.type === t ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                  {{ res: "Residencial", com: "Comercial", ind: "Industrial" }[t]}
                </button>
              ))}
            </div>

            {!isOptimal && (
              <button onClick={() => onChange({ tilt: ot, az: 180, shade: 0 })}
                className="mt-4 min-h-11 w-full rounded-lg border border-line py-2 text-[13px] text-muted transition hover:border-ink hover:text-ink sm:min-h-0">
                Restablecer configuración óptima
              </button>
            )}
          </div>

          <div className="lg:col-span-2">
            <StringSizing
              strings={r.strings}
              ventana={r.ventana}
              inversor={r.inversor}
              site={d.site}
              kwp={r.kwp}
              circuito={r.circuito}
              metros={d.runMeters ?? RUN_METERS_INICIAL}
              onMetros={(m: number) => onChange({ runMeters: m })}
              responsables={responsables}
              responsableId={d.responsableId}
              onResponsable={(id) => onChange({ responsableId: id })}
              onVentana={(clave: Ventana["clave"]) => onChange({ inverterWindow: clave })}
            />
          </div>

          <div className="mt-4">
            <Unifilar
              nodos={nodosUnifilar}
              faltan={nodosIncompletos(nodosUnifilar)}
              cc={desconexionCC}
              ca={desconexionCA}
            />
          </div>

          <div className="lg:col-span-2">
            <ObstacleCapture
              obstacles={d.obstacles ?? []}
              areaM2={d.area}
              shading={r.shading}
              onChange={(obstacles) => onChange({ obstacles })}
            />
          </div>

          {/* Geometría antisombra: el pasillo entre filas que decide cuántos módulos caben
              de verdad. Se calcula con el sol del solsticio de invierno. */}
          <div className="rounded-xl border border-line bg-card p-5 lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">Geometría de filas</h3>
              <span className="text-xs text-faint">
                Solsticio de invierno · sol a {r.spacing.sunElevation}° sobre el horizonte
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Geo k="Pasillo mínimo" v={`${r.spacing.gap} m`}
                hint="Entre borde trasero y fila siguiente" />
              {/* «Pitch de fila» era el único anglicismo que quedaba en una etiqueta visible.
                  La propuesta ya dice «paso de fila», y tener dos nombres para la misma medida
                  —uno en la pantalla y otro en el papel que se entrega— obliga al instalador a
                  traducir mentalmente cuando compara ambos. */}
              <Geo k="Paso de fila" v={`${r.spacing.pitch} m`}
                hint="Borde delantero a borde delantero" />
              {/* Con un estorbo el arreglo deja de ser un rectángulo: caben 8 módulos en una
                  rejilla de 2 × 5 porque una fila queda incompleta. Rotularlo "2 × 5" a secas
                  describe una cuadrícula que no existe. */}
              <Geo
                k="Arreglo"
                v={
                  r.n === r.layout.rows * r.layout.perRow
                    ? `${r.layout.rows} × ${r.layout.perRow}`
                    : `${r.layout.rows} filas · ${r.n}`
                }
                hint={
                  r.n === r.layout.rows * r.layout.perRow
                    ? "Filas × módulos por fila"
                    : `Filas incompletas: ${r.placement.bloqueadas} posición${r.placement.bloqueadas === 1 ? "" : "es"} descartada${r.placement.bloqueadas === 1 ? "" : "s"} por sombra`
                }
              />
              <Geo k="Techo aprovechado" v={`${Math.round(r.utilizacion * 100)}%`}
                hint="Superficie que ocupan los módulos colocados" />
            </div>

            <div className={`mt-4 rounded-lg border px-4 py-3 text-xs leading-relaxed ${
              advice.level === "ok"
                ? "border-leaf-600/25 bg-leaf-600/5 text-ink"
                : advice.level === "warn"
                  ? "border-solar-500/30 bg-solar-500/5 text-ink"
                  : "border-solar-600/40 bg-solar-600/8 text-ink"
            }`}>
              {advice.text}
            </div>

            {r.exceedsGD && (
              <div className="mt-3 rounded-lg border border-solar-600/40 bg-solar-600/8 px-4 py-3 text-xs leading-relaxed">
                <b className="font-semibold">{r.kwp.toFixed(0)} kWp supera el límite de generación
                distribuida exenta (499 kW).</b> Este proyecto requiere contrato de interconexión
                distinto ante la CRE. Verifícalo antes de cotizar.
              </div>
            )}

            <p className="mt-3 txt-mini leading-relaxed text-faint">
              El pasillo se dimensiona para que la fila delantera no sombree la trasera al mediodía
              del 21 de diciembre, el peor momento del año. A mayor latitud el sol invernal está más
              bajo, el pasillo crece y caben menos módulos en la misma superficie.
            </p>
          </div>
        </div>
      )}

      {tab === "produccion" && (
        <div className="fade-up space-y-6">
          <MonthlyChart annualKwh={r.kwh} site={d.site} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat k="Rendimiento específico" v={`${Math.round(r.kwh / Math.max(r.kwp, 0.01))} kWh/kWp`} />
            <Stat k="Factor de orientación" v={`${(r.of * 100).toFixed(0)}%`} />
            <Stat k="Pérdidas por sombra" v={d.shade === 0 ? "—" : `${d.shade}%`} />
          </div>
          <p className="rounded-lg border border-line bg-card px-4 py-3 text-xs text-muted">
            Reparto mensual modelado para latitudes de México: pico en primavera y descenso en
            temporada de lluvias. En producción se sustituye por series horarias de PVWatts/PVGIS.
          </p>
        </div>
      )}

      {tab === "financiero" && (
        /* Tres columnas a partir de 1024 px dejaban cada una en unos 280 px de contenido útil en un
           portátil de 1280: los conceptos del desglose salían cortados («Mano de obr…»), que es
           justo lo que el instalador necesita leer para revisar su costo. Se pasa a dos columnas
           anchas, y la tercera solo aparece en pantallas que de verdad la sostienen. */
        <div className="fade-up grid gap-6 [&>*]:min-w-0 lg:grid-cols-2 2xl:grid-cols-3">
          <BillCapture
            bill={d.bill}
            onChange={(bill) => onChange({ bill })}
            fallback={{ res: 6000, com: 34000, ind: 170000 }[d.type]}
          />
          <div className="rounded-xl border border-line bg-card p-5">
            <div className="mb-4 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">Resumen económico</h3>
              <span className={`txt-micro font-medium uppercase tracking-wide ${
                r.fromBill ? "text-leaf-600" : "text-faint"}`}>
                {r.fromBill ? "recibo real" : "promedio"}
              </span>
            </div>
            <Row k="Inversión estimada" v={`$${fmt(Math.round(r.capex))} MXN`} />

            {/* Desglose por partidas, con el patrón de renglones de Jobber y Xero. Lo que se
                añade es la procedencia: el renglón de módulos sale del precio del módulo
                elegido; el resto es un reparto del costo por watt de la operación. */}
            <div className="mt-3 rounded-lg border border-line">
              <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <span className="txt-mini font-semibold uppercase tracking-wider text-faint">
                  De dónde sale la inversión
                </span>
                <span className="txt-mini tabular-nums text-faint">
                  {r.costs.mxnPerWp.toFixed(1)} MXN/Wp
                </span>
              </div>
              <ul className="@container">
                {r.costs.lines.map((l, i) => (
                  <li
                    key={l.key}
                    className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-0"
                    title={l.note}
                  >
                    {/* Antes con `truncate`: un concepto cortado a media palabra no se puede leer,
                        y el ancho depende de la columna, así que no hay tamaño de pantalla que lo
                        garantice. Dos líneas siempre son legibles, y `break-words` evita que una
                        palabra que no cabe desborde su caja y se meta por debajo de la insignia
                        «medido» —eso pasó, y se vio en la captura de 390 px, no en la de escritorio. */}
                    <span className="min-w-0 flex-1 break-words text-[13px] leading-snug">
                      {l.label}
                    </span>
                    {l.origin === "medido" && (
                      <span className="shrink-0 rounded bg-green-50 px-1.5 py-0.5 txt-micro font-medium text-leaf-600">
                        medido
                      </span>
                    )}
                    {/* En un teléfono, con el concepto, la insignia, el porcentaje y el importe en
                        la misma línea, al concepto le quedan 82 px y «fotovoltaicos» se parte por
                        la mitad. De los cuatro, el porcentaje es el único prescindible: se deduce
                        del importe y del total, sigue en la propuesta impresa, y cediéndolo el
                        concepto gana el ancho que necesita para leerse entero. */}
                    <span className="hidden w-10 shrink-0 text-right txt-mini tabular-nums text-faint @xs:block">
                      {pctsCosto[i]}%
                    </span>
                    <span className="w-24 shrink-0 text-right text-[13px] tabular-nums">
                      ${fmt(Math.round(l.mxn))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <BosRateField
              type={d.type}
              rates={bosRates}
              onSet={onSetBos}
              onClear={onClearBos}
            />

            {!r.costs.inBand && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 txt-mini leading-relaxed text-amber-900">
                <b className="font-semibold">{r.costs.mxnPerWp.toFixed(1)} MXN/Wp queda fuera de
                la banda de mercado</b> de sistemas llave en mano (15-28 MXN/Wp). Revisa el costo
                del módulo o el del resto del sistema antes de cotizar.
              </p>
            )}
            <Row k="Tarifa considerada" v={`$${r.tariff.toFixed(2)} / kWh`} />
            <Row k="Consumo anual del cliente" v={`${fmt(r.consumption)} kWh`} />
            <Row k="Energía que desplaza a CFE" v={`${fmt(Math.round(r.offset))} kWh`} />
            <Row k="Ahorro primer año" v={`$${fmt(Math.round(r.save))}`} strong />
            <Row k="Retorno de inversión" v={paybackLabel(r)} strong />
            <Row k="Ahorro a 25 años" v={`$${fmt(Math.round(r.save * 25))}`} strong />

            {r.surplus > 0 && (
              <div className="mt-4 rounded-lg border border-solar-500/30 bg-solar-500/5 px-4 py-3">
                <p className="text-xs font-medium">
                  Excedente: {fmt(Math.round(r.surplus))} kWh/año no valorados
                </p>
                <p className="mt-1 txt-mini leading-relaxed text-muted">
                  El sistema produce más de lo que el cliente consume. Bajo medición neta ese saldo
                  se compensa hasta 12 meses, pero la normativa consultada no establece que el
                  excedente sobre el consumo anual se pague a tarifa minorista. No se cuenta como
                  ahorro: cotizarlo así infla la propuesta. Si el cliente quiere monetizarlo, hay
                  que negociar facturación neta o venta total.
                </p>

                {/* La mitad accionable: la caja explicaba el problema y no decía cuánto cuesta.
                    Informa, no prescribe: un cliente puede querer holgura para un coche eléctrico
                    o para crecer, y ese margen es su decisión, no un error de dimensionado. */}
                {(() => {
                  const a = ajustarAlConsumo(r);
                  if (!a || a.sobrantes === 0) return null;
                  return (
                    <div className="mt-3 border-t border-solar-500/25 pt-3">
                      <p className="txt-mini leading-relaxed text-muted">
                        <strong className="text-ink">
                          {a.sobrantes} de {a.actual} módulos no desplazan ninguna compra a CFE.
                        </strong>{" "}
                        Con {a.ajustado}
                        {a.arreglo ? ` (${a.arreglo.filas} filas de ${a.arreglo.columnas}, mismo techo)` : ""}
                        {" "}la inversión baja{" "}
                        <strong className="text-ink">${fmt(Math.round(a.ahorroCapex))}</strong> y el
                        retorno pasa a {a.paybackAjustado.toFixed(1)} años en vez de{" "}
                        {r.payback.toFixed(1)}. El ahorro anual baja poco, de $
                        {fmt(Math.round(r.save))} a{" "}
                        <strong className="text-ink">
                          ${fmt(Math.round(a.ahorroAnualAjustado))}
                        </strong>
                        : el arreglo ajustado cubre casi todo el consumo.
                      </p>
                      <p className="mt-1.5 txt-micro text-faint">
                        Bajar más del consumo no empeora el retorno, pero reduce el ahorro total: por
                        debajo del 100 % la decisión es de capital disponible, no de eficiencia.
                      </p>

                      {/* Aplicarlo deja el techo como está y simplemente no lo llena. Reversible a
                          la vista: un tope invisible limitaría el diseño en silencio. */}
                      {a.arreglo && (
                        <button
                          onClick={() => onChange({ arregloTope: a.arreglo! })}
                          className="mt-2.5 min-h-11 rounded-lg border border-ink bg-ink px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 sm:min-h-0"
                        >
                          Ajustar el arreglo a {a.arreglo.filas} × {a.arreglo.columnas}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-line bg-card p-5">
            <h3 className="mb-4 text-sm font-medium">Retorno acumulado</h3>
            <Payback capex={r.capex} annual={r.save} />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ icon, k, v, u, accent }: {
  icon: React.ReactNode; k: string; v: string; u?: string; accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted">{icon}{k}</div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${accent ? "text-leaf-600" : "text-ink"}`}>
        {v}{u && <span className="ml-1 text-sm font-normal text-faint">{u}</span>}
      </div>
    </div>
  );
}

function Control({ icon, label, value, hint, children }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted">{icon}{label}</span>
        <span className="flex items-center gap-2">
          <b className="font-semibold text-ink tabular-nums">{value}</b>
          {hint && <span className="text-xs text-leaf-600">{hint}</span>}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Celda de una magnitud geométrica, con la explicación de qué significa en obra. */
function Geo({ k, v, hint }: { k: string; v: string; hint: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{k}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{v}</p>
      <p className="mt-0.5 txt-mini leading-snug text-faint">{hint}</p>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="text-xs text-muted">{k}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums">{v}</p>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 text-sm last:border-0">
      <span className="text-muted">{k}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : "font-medium"}`}>{v}</span>
    </div>
  );
}

/** Barras de flujo acumulado: años hasta cruzar la inversión. */
function Payback({ capex, annual }: { capex: number; annual: number }) {
  const years = 12;
  const data = Array.from({ length: years }, (_, i) => (i + 1) * annual - capex);
  const max = Math.max(...data.map(Math.abs), 1);
  return (
    <div className="flex h-40 items-center gap-1">
      {data.map((v, i) => (
        <div key={i} className="group relative flex h-full flex-1 flex-col justify-center">
          <div className="relative h-full">
            <div className="absolute left-0 right-0 top-1/2 h-px bg-line" />
            <div
              className={`absolute left-0 right-0 rounded-sm ${v >= 0 ? "bg-leaf-600/80" : "bg-line"}`}
              style={{
                height: `${(Math.abs(v) / max) * 46}%`,
                [v >= 0 ? "bottom" : "top"]: "50%",
              } as React.CSSProperties}
            />
          </div>
          <span className="mt-1 text-center txt-micro text-faint">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
