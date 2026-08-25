import { useMemo, useState } from "react";
import { RotateCcw, Receipt, X } from "lucide-react";
import type { Panel } from "../lib/solar";
import { brandTier, modulePrice } from "../lib/price";
import {
  isValidQuote, MIN_QUOTE, MAX_QUOTE, quoteFor, quoteCount, type Quotes,
} from "../lib/quotes";

interface Props {
  panels: Panel[];
  quotes: Quotes;
  onSet: (brand: string, mxnPerWp: number) => void;
  onClear: (brand: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

/**
 * Captura del costo real por marca.
 *
 * El patrón de fila editable con el prefijo de moneda dentro del campo viene de las tablas de
 * precios de Stripe, Etsy y Midday. Lo que se añade aquí es el contexto que el instalador
 * necesita para decidir: cuántos módulos del catálogo afecta esa marca, en qué gama está, y
 * cuál era la banda que se estaba usando en su lugar.
 *
 * Es la misma decisión que con el recibo CFE: la app no adivina el precio, lo pide.
 */
export default function CostCapture({
  panels, quotes, onSet, onClear, onClearAll, onClose,
}: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Marcas presentes en el catálogo, con cuántos módulos aporta cada una y la banda que se
  // aplicaría al módulo mediano de esa marca (para dar una referencia honesta, no un ancla).
  const brands = useMemo(() => {
    const byBrand = new Map<string, Panel[]>();
    for (const p of panels) {
      const list = byBrand.get(p.brand) ?? [];
      list.push(p);
      byBrand.set(p.brand, list);
    }
    return [...byBrand.entries()]
      .map(([brand, list]) => {
        const effs = list.map((p) => p.eff).sort((a, b) => a - b);
        const medianEff = effs[Math.floor(effs.length / 2)];
        return {
          brand,
          count: list.length,
          tier: brandTier(brand),
          band: modulePrice(brand, medianEff).mxnPerWp,
        };
      })
      .sort((a, b) => a.tier - b.tier || b.count - a.count);
  }, [panels]);

  const commit = (brand: string) => {
    const raw = draft[brand];
    if (raw === undefined) return;
    const v = Number(raw.replace(",", "."));
    if (raw.trim() === "") { onClear(brand); }
    else if (isValidQuote(v)) { onSet(brand, v); }
    setDraft((d) => { const n = { ...d }; delete n[brand]; return n; });
  };

  const n = quoteCount(quotes);

  return (
    <section className="rounded-xl border border-line bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <Receipt size={15} className="shrink-0 text-solar-600" />
          <h2 className="truncate text-sm font-medium">Tu costo por marca</h2>
          {n > 0 && (
            <span className="shrink-0 rounded bg-green-50 px-1.5 py-0.5 txt-micro font-medium text-leaf-600">
              {n} {n === 1 ? "cotizada" : "cotizadas"}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {n > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted transition hover:bg-paper hover:text-ink"
            >
              <RotateCcw size={12} /> Volver a bandas
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Cerrar captura de costos"
            className="grid h-7 w-7 place-items-center rounded text-faint transition hover:bg-paper hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      <p className="border-b border-line px-5 py-3 text-xs leading-relaxed text-muted">
        Escribe lo que <b className="font-medium text-ink">de verdad te cuesta</b> el watt con tu
        distribuidor. Ese número reemplaza la banda de mercado y el comparativo pasa a ordenar con
        tus precios, no con una estimación. Se guarda en este navegador.
      </p>

      <ul className="max-h-[52vh] overflow-y-auto">
        {brands.map((b) => {
          const q = quoteFor(quotes, b.brand);
          const value = draft[b.brand] ?? (q !== undefined ? String(q) : "");
          return (
            <li
              key={b.brand}
              className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{b.brand}</span>
                <span className="block truncate txt-mini text-faint tabular-nums">
                  Tier {b.tier} · {b.count} {b.count === 1 ? "módulo" : "módulos"} · banda {b.band.toFixed(2)}
                </span>
              </span>

              <span
                className={`flex shrink-0 items-center gap-1 rounded-lg border bg-paper pl-2 pr-1 transition focus-within:border-ink ${
                  q !== undefined ? "border-leaf-600/40" : "border-line"
                }`}
              >
                <span className="text-xs text-faint">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={MIN_QUOTE}
                  max={MAX_QUOTE}
                  step={0.05}
                  value={value}
                  placeholder={b.band.toFixed(2)}
                  aria-label={`Costo por watt de ${b.brand} en MXN`}
                  onChange={(e) => setDraft((d) => ({ ...d, [b.brand]: e.target.value }))}
                  onBlur={() => commit(b.brand)}
                  onKeyDown={(e) => { if (e.key === "Enter") commit(b.brand); }}
                  className="w-[4.5rem] bg-transparent py-1.5 text-right text-[13px] tabular-nums outline-none placeholder:text-faint"
                />
                <span className="pr-1 txt-micro text-faint">MXN/Wp</span>
              </span>

              <button
                onClick={() => onClear(b.brand)}
                disabled={q === undefined}
                aria-label={`Quitar el costo capturado de ${b.brand}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded text-faint transition hover:bg-paper hover:text-ink disabled:opacity-20 disabled:hover:bg-transparent"
              >
                <RotateCcw size={13} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
