import { useEffect, useMemo, useState } from "react";
import { Star, Check, Scale, SlidersHorizontal, RotateCcw, Receipt } from "lucide-react";
import { fmt, type Panel } from "../lib/solar";
import type { Roof } from "../lib/dims";
import { climaValido, scorePanels, topReason, type ClimaPuntaje } from "../lib/score";
import { climaDe } from "../lib/termico";
import type { Site } from "../lib/site";
import CostCapture from "./CostCapture";
import { quoteCount, type Quotes } from "../lib/quotes";
import CompareTable from "./CompareTable";

interface Props {
  panels: Panel[];
  /** Techo del proyecto abierto: sin él no se puede decir qué módulo le conviene. */
  roof: Roof;
  /** Sitio medido del proyecto: de aquí sale el clima, en vez de que lo adivine el instalador. */
  site?: Site;
  onPick: (p: Panel) => void;
  sourceLabel: string;
  quotes: Quotes;
  onSetQuote: (brand: string, mxnPerWp: number) => void;
  onClearQuote: (brand: string) => void;
  onClearAllQuotes: () => void;
}

type SortKey = "score" | "w" | "eff" | "ppw" | "density";

const SORTS: { key: SortKey; label: string; dir: "asc" | "desc" }[] = [
  { key: "score", label: "Compatibilidad", dir: "desc" },
  { key: "w", label: "Potencia", dir: "desc" },
  { key: "eff", label: "Eficiencia", dir: "desc" },
  { key: "ppw", label: "Precio por watt", dir: "asc" },
  { key: "density", label: "W por m²", dir: "desc" },
];

const MAX_COMPARE = 3;
// Techo de la banda de mercado (MXN/Wp) y del formato de módulo actual, para que los
// deslizadores abarquen el catálogo real sin dejar opciones fuera de alcance.
const MAX_PRICE = 7;
const MAX_AREA = 3.4;

export default function Catalog({
  panels, roof, site, onPick, sourceLabel, quotes, onSetQuote, onClearQuote, onClearAllQuotes,
}: Props) {
  const [showCosts, setShowCosts] = useState(false);

  useEffect(() => {
    if (!showCosts) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowCosts(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCosts]);
  // El clima se DERIVA de la temperatura medida del sitio; antes era un desplegable que el
  // instalador adivinaba. `climaManual` sólo existe para que pueda contradecirlo a sabiendas.
  const derivado = climaDe(site);
  const [climaManual, setClimaManual] = useState<ClimaPuntaje | null>(null);
  const clima = climaManual ?? derivado.clima;
  const [prio, setPrio] = useState("balance");
  const [minW, setMinW] = useState(0);
  const [minEff, setMinEff] = useState(0);
  const [maxP, setMaxP] = useState(MAX_PRICE);
  const [maxArea, setMaxArea] = useState(MAX_AREA);
  const [sort, setSort] = useState<SortKey>("score");
  const [compare, setCompare] = useState<Panel[]>([]);
  const [open, setOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // El puntaje se normaliza contra el catálogo completo, así que hay que pasarlo entero.
  const scored = useMemo(() => scorePanels(panels, clima, prio, roof), [panels, clima, prio, roof]);

  const list = useMemo(() => {
    const dir = SORTS.find((s) => s.key === sort)!.dir;
    return scored
      .filter((p) => p.w >= minW && p.eff >= minEff && p.ppw <= maxP && p.area <= maxArea)
      .sort((a, b) => {
        const d = sort === "density" ? a.w / a.area - b.w / b.area : a[sort] - b[sort];
        return dir === "desc" ? -d : d;
      })
      ;
  }, [scored, minW, minEff, maxP, maxArea, sort]);

  /**
   * Se muestran solo los primeros, pero el conteo que ve el instalador es el de los que CUMPLEN.
   *
   * Antes la lista se recortaba con `.slice(0, 12)` y la cabecera imprimía el largo del recorte:
   * decía «Mostrando 12 de 140» con los rangos completamente abiertos. Mover un deslizador no
   * cambiaba el número mientras siguieran cumpliendo doce o más, así que los rangos parecían no
   * hacer nada y no había forma de saber cuántos módulos quedaban dentro de verdad.
   */
  const TOPE_VISIBLE = 12;
  const visibles = useMemo(() => list.slice(0, TOPE_VISIBLE), [list]);

  const isPicked = (p: Panel) => compare.some((c) => c.model === p.model && c.brand === p.brand);

  function toggleCompare(p: Panel) {
    setCompare((prev) => {
      if (prev.some((c) => c.model === p.model && c.brand === p.brand)) {
        return prev.filter((c) => !(c.model === p.model && c.brand === p.brand));
      }
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, p];
    });
  }

  function reset() {
    setMinW(0); setMinEff(0); setMaxP(MAX_PRICE); setMaxArea(MAX_AREA);
  }

  const dirty = minW > 0 || minEff > 0 || maxP < MAX_PRICE || maxArea < MAX_AREA;

  return (
    <div className="px-6 py-8">
      <header className="max-w-2xl">
        <h1 className="font-serif text-3xl tracking-tight">Catálogo de módulos</h1>
        <p className="mt-1 text-sm text-muted">
          {panels.length} módulos reales de la lista CEC. Cada uno se puntúa contra tu clima y tu
          prioridad; selecciona hasta {MAX_COMPARE} para compararlos ficha a ficha.
        </p>
      </header>

      <button
        onClick={() => setShowFilters((v) => !v)}
        className="mt-6 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3.5 py-2 text-sm font-medium lg:hidden"
      >
        <SlidersHorizontal size={15} /> Filtros {dirty && <span className="h-1.5 w-1.5 rounded-full bg-solar-500" />}
      </button>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        {/* Rail de filtros — patrón de catálogo profesional: siempre visible en desktop */}
        <aside
          className={`${showFilters ? "block" : "hidden"} shrink-0 lg:block lg:w-56`}
        >
          <div className="lg:sticky lg:top-6 space-y-5 rounded-2xl border border-line bg-card p-5 lg:border-0 lg:bg-transparent lg:p-0">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Contexto</h2>
              {dirty && (
                <button onClick={reset} className="flex items-center gap-1 txt-mini text-muted transition hover:text-ink">
                  <RotateCcw size={11} /> Limpiar
                </button>
              )}
            </div>

            <Field label="Clima del sitio">
              <select
                value={clima}
                onChange={(e) => {
                  // El valor de un <select> es `string`. Se valida en vez de forzar el tipo: si
                  // alguien renombra una opción del menú y no el perfil de pesos, esto lo ignora
                  // en voz alta en lugar de recomendar con el perfil equivocado en silencio.
                  const v = e.target.value;
                  if (climaValido(v)) setClimaManual(v);
                }}
                className="fld"
              >
                <option value="calido">Cálido — celda sobre 46 °C</option>
                <option value="templado">Templado</option>
                <option value="fresco">Fresco — celda bajo 41 °C</option>
                <option value="humedo">Húmedo / costa</option>
              </select>
              {derivado.medido && site && (
                <p className="mt-1 txt-micro text-faint">
                  {climaManual && climaManual !== derivado.clima ? (
                    <>
                      Lo medido en {site.nombre} es{" "}
                      <span className="font-medium text-solar-600">{derivado.clima}</span>:{" "}
                      {site.tMediaSol} °C de aire en horas de producción.{" "}
                      <button
                        onClick={() => setClimaManual(null)}
                        className="underline transition hover:text-ink"
                      >
                        volver a lo medido
                      </button>
                    </>
                  ) : (
                    <>Medido en {site.nombre}: {site.tMediaSol} °C de aire en horas de producción.</>
                  )}
                </p>
              )}
              {!derivado.medido && (
                <p className="mt-1 txt-micro text-faint">
                  Sin ciudad medida no se puede derivar: elígelo tú.
                </p>
              )}
            </Field>
            <Field label="Prioridad del cliente">
              <select value={prio} onChange={(e) => setPrio(e.target.value)} className="fld">
                <option value="balance">Equilibrado</option>
                <option value="espacio">Máx. potencia por m²</option>
                <option value="precio">Menor precio</option>
                <option value="calidad">Máx. calidad / garantía</option>
              </select>
            </Field>

            <div className="border-t border-line pt-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-faint">Rangos</h2>
              <div className="space-y-5">
                <Range label="Potencia mínima" value={minW} set={setMinW} min={0} max={700} step={10} unit="W" />
                <Range label="Eficiencia mínima" value={minEff} set={setMinEff} min={0} max={24} step={0.5} unit="%" />
                <Range label="Precio máx." value={maxP} set={setMaxP} min={3} max={MAX_PRICE} step={0.1} unit="MXN/Wp" />
                <Range label="Área máx. por módulo" value={maxArea} set={setMaxArea} min={1.6} max={MAX_AREA} step={0.05} unit="m²" />
              </div>
            </div>

            {/* Acceso a la captura del costo real. Va en el rail porque cambia cómo se
                ordena todo el catálogo, igual que un filtro. */}
            <div className="border-t border-line pt-5">
              <button
                onClick={() => setShowCosts((v) => !v)}
                aria-expanded={showCosts}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] transition ${
                  showCosts ? "border-ink" : "border-line hover:border-ink"
                }`}
              >
                <Receipt size={14} className="shrink-0 text-solar-600" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Capturar mi costo</span>
                  <span className="block txt-mini text-faint">
                    {quoteCount(quotes) > 0
                      ? `${quoteCount(quotes)} ${quoteCount(quotes) === 1 ? "marca" : "marcas"} con precio real`
                      : "usa tus precios, no una banda"}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <p className="text-xs text-muted">
              {list.length === panels.length ? (
                <>
                  Mostrando los{" "}
                  <b className="font-semibold text-ink tabular-nums">
                    {Math.min(TOPE_VISIBLE, list.length)}
                  </b>{" "}
                  mejores de los <span className="tabular-nums">{panels.length}</span> del catálogo
                </>
              ) : list.length > TOPE_VISIBLE ? (
                <>
                  Mostrando los{" "}
                  <b className="font-semibold text-ink tabular-nums">{TOPE_VISIBLE}</b> mejores de{" "}
                  <b className="font-semibold text-ink tabular-nums">{list.length}</b> que cumplen
                  tus rangos, sobre <span className="tabular-nums">{panels.length}</span> del
                  catálogo
                </>
              ) : (
                <>
                  Mostrando <b className="font-semibold text-ink tabular-nums">{list.length}</b>{" "}
                  {list.length === 1 ? "módulo que cumple" : "módulos que cumplen"} tus rangos, de{" "}
                  <span className="tabular-nums">{panels.length}</span> del catálogo
                </>
              )}
            </p>
            <label className="flex items-center gap-2 text-xs text-muted">
              Ordenar por
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-medium text-ink outline-none focus:border-ink"
              >
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>

          {list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line py-16 text-center">
              <p className="text-sm font-medium">Ningún módulo cumple estos rangos</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
                Los filtros son demasiado estrictos para el catálogo actual.
              </p>
              <button onClick={reset} className="mt-4 rounded-xl border border-line px-4 py-2 text-xs font-medium transition hover:border-ink">
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibles.map((p, i) => {
                const picked = isPicked(p);
                const top = i === 0 && sort === "score";
                return (
                  <article
                    key={p.brand + p.model}
                    className={`relative flex flex-col rounded-2xl border bg-card p-4 transition ${
                      picked
                        ? "border-ink ring-1 ring-ink"
                        : top
                          ? "border-solar-500"
                          : "border-line hover:border-faint"
                    }`}
                  >
                    {top && (
                      <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-solar-600 px-2 py-0.5 txt-micro font-semibold uppercase tracking-wide text-white">
                        <Star size={9} className="fill-white" /> Mejor opción
                      </span>
                    )}
                    <p className="txt-mini font-medium text-faint">{p.brand}</p>
                    <h3 className="mt-0.5 text-sm font-semibold leading-snug tracking-tight">{p.model}</h3>

                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-y border-line py-3">
                      <Stat k="Potencia" v={p.w} u="W" />
                      <Stat k="Eficiencia" v={p.eff} u="%" />
                      <Stat k="Temp." v={p.temp} u="%/°C" />
                      <Stat k="Área" v={p.area} u="m²" />
                    </div>

                    {/* Lo que este módulo entrega EN ESTE TECHO. Es la cifra que sustituyó a
                        premiar los watts de placa: el arreglo y el pasillo salen del largo real
                        del módulo, así que un módulo largo puede rendir menos que uno chico. */}
                    {p.fit && (
                      <div className="mt-3 rounded-lg bg-paper px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="txt-mini text-muted">
                            En tu techo de {roof.area} m²
                          </span>
                          <span className="txt-mini tabular-nums text-faint">
                            {p.fit.rows}×{p.fit.perRow} · pasillo {p.fit.gap} m
                          </span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold tabular-nums">
                            {p.fit.count} <span className="txt-mini font-normal text-faint">módulos</span>
                          </span>
                          <span className="text-sm font-semibold tabular-nums">
                            {fmt(Math.round(p.fit.kwh))}{" "}
                            <span className="txt-mini font-normal text-faint">kWh/año</span>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* El precio se muestra con su procedencia al lado. Una banda de mercado y
                        una cotización no valen lo mismo y el instalador tiene que distinguirlas
                        de un vistazo, igual que con el recibo CFE. */}
                    <div className="mt-3 flex items-baseline justify-between gap-2">
                      <span className="txt-mini text-muted">Precio de módulo</span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold tabular-nums">
                          {p.ppw.toFixed(2)}
                        </span>
                        <span className="txt-mini text-faint">MXN/Wp</span>
                        <span
                          title={p.priceOrigin === "cotizado"
                            ? "Costo capturado por ti"
                            : "Banda de mercado 2025-2026 por gama, no una cotización"}
                          className={`rounded px-1.5 py-0.5 txt-micro font-medium ${
                            p.priceOrigin === "cotizado"
                              ? "bg-green-50 text-leaf-600"
                              : "bg-line text-muted"
                          }`}
                        >
                          {p.priceOrigin === "cotizado" ? "cotizado" : "banda"}
                        </span>
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-baseline justify-between gap-2 txt-mini text-muted">
                        <span className="truncate">
                          Gana por <span className="text-ink">{topReason(p)}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-ink">{p.score}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-ink" style={{ width: `${p.score}%` }} />
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => onPick(p)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-xs font-medium transition sm:min-h-0 hover:border-ink"
                      >
                        <Check size={13} /> Usar
                      </button>
                      <button
                        onClick={() => toggleCompare(p)}
                        aria-pressed={picked}
                        title={picked ? "Quitar de la comparación" : "Agregar a la comparación"}
                        disabled={!picked && compare.length >= MAX_COMPARE}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          picked ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                        }`}
                      >
                        <Scale size={13} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <p className="mt-6 text-xs leading-relaxed text-faint">{sourceLabel}</p>
        </div>
      </div>

      {/* Barra de comparación: aparece al seleccionar, patrón de e-commerce comparativo */}
      {/* Diálogo, no sección al pie: el panel vive fuera del flujo porque su disparador está
          en el rail izquierdo y el catálogo es largo. Renderizarlo abajo hacía que pulsar el
          botón no produjera nada visible. */}
      {showCosts && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[10vh] backdrop-blur-sm"
          onClick={() => setShowCosts(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Capturar mi costo por marca"
        >
        <div className="w-full max-w-xl shadow-[0_24px_70px_-20px_rgba(0,0,0,.35)]" onClick={(e) => e.stopPropagation()}>
          <CostCapture
            panels={panels}
            quotes={quotes}
            onSet={onSetQuote}
            onClear={onClearQuote}
            onClearAll={onClearAllQuotes}
            onClose={() => setShowCosts(false)}
          />
        </div>
        </div>
      )}

      {compare.length > 0 && !open && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 px-6 py-3 backdrop-blur md:bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 text-xs text-muted">
                <b className="font-semibold text-ink tabular-nums">{compare.length}</b>/{MAX_COMPARE} para comparar
              </span>
              <div className="flex min-w-0 gap-1.5 overflow-hidden">
                {compare.map((p) => (
                  <span key={p.brand + p.model} className="truncate rounded-lg bg-paper px-2 py-1 txt-mini text-ink">
                    {p.model}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => setCompare([])} className="rounded-xl px-3 py-2 text-xs text-muted transition hover:text-ink">
                Limpiar
              </button>
              <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-medium text-paper transition hover:bg-ink/90"
              >
                <Scale size={13} /> Comparar
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <CompareTable
          panels={compare}
          onClose={() => setOpen(false)}
          onRemove={(p) => {
            const next = compare.filter((c) => !(c.model === p.model && c.brand === p.brand));
            setCompare(next);
            if (next.length === 0) setOpen(false);
          }}
          onPick={(p) => { onPick(p); setOpen(false); }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function Range({ label, value, set, min, max, step, unit }: {
  label: string; value: number; set: (n: number) => void;
  min: number; max: number; step: number; unit: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-semibold tabular-nums text-ink">
          {value}<span className="ml-0.5 font-normal text-faint">{unit}</span>
        </span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(+e.target.value)}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-line accent-ink"
      />
    </label>
  );
}

function Stat({ k, v, u }: { k: string; v: number; u: string }) {
  return (
    <div>
      <span className="block txt-micro uppercase tracking-wide text-faint">{k}</span>
      <span className="block text-[13px] font-semibold tabular-nums text-ink">
        {v}<span className="ml-0.5 txt-micro font-normal text-muted">{u}</span>
      </span>
    </div>
  );
}
