import { useEffect } from "react";
import { X, Check, Trophy } from "lucide-react";
import type { Panel } from "../lib/solar";

interface Props {
  panels: Panel[];
  onClose: () => void;
  onRemove: (p: Panel) => void;
  onPick: (p: Panel) => void;
}

/** Una fila de la comparación. `best` indica qué dirección gana. */
interface Row {
  label: string;
  unit: string;
  get: (p: Panel) => number | null;
  best: "high" | "low";
  hint: string;
  /** Decimales con los que se MUESTRA el valor. El trofeo se decide sobre esta misma cifra
   *  redondeada, no sobre el número crudo: si no, dos módulos que en pantalla se ven iguales
   *  podrían llevar un solo trofeo, o dos que se ven distintos podrían empatar. */
  dp: number;
}

const ROWS: Row[] = [
  { label: "Potencia nominal", unit: "W", get: (p) => p.w, best: "high", hint: "Más watts = menos módulos para la misma meta", dp: 0 },
  { label: "Eficiencia", unit: "%", get: (p) => p.eff, best: "high", hint: "Clave cuando el techo es chico", dp: 1 },
  { label: "Coef. de temperatura", unit: "%/°C", get: (p) => p.temp, best: "high", hint: "Menos negativo = pierde menos con el calor", dp: 2 },
  { label: "Precio de módulo", unit: "MXN/Wp", get: (p) => p.ppw, best: "low", hint: "Banda de mercado 2025-2026, no cotización", dp: 2 },
  { label: "Garantía de producto", unit: "años", get: (p) => p.warr, best: "high", hint: "La base CEC no publica garantía", dp: 0 },
  { label: "Área del módulo", unit: "m²", get: (p) => p.area, best: "low", hint: "Determina cuántos caben", dp: 2 },
];

export default function CompareTable({ panels, onClose, onRemove, onPick }: Props) {
  // Cerrar con Escape, igual que el diálogo de análisis y la paleta de comandos. Este modal era
  // el único que no lo hacía: quien navega con teclado quedaba atrapado sin salida.
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onClose]);

  if (panels.length === 0) return null;

  /** Índices ganadores por fila, para resaltar el mejor valor.
   *
   * Un atributo sin dato no tiene ganador: si la garantía es desconocida para todos, coronar
   * a uno sería inventar una diferencia. Los nulos se excluyen del cálculo del mejor valor. */
  // Se compara sobre el valor REDONDEADO a los decimales que se muestran, no sobre el crudo:
  // el trofeo y el número tienen que contar la misma historia.
  const redondear = (v: number, dp: number) => Number(v.toFixed(dp));
  const winners = ROWS.map((r) => {
    const vals = panels.map((p) => {
      const v = r.get(p);
      return v === null ? null : redondear(v, r.dp);
    });
    const known = vals.filter((v): v is number => v !== null);
    if (known.length === 0) return vals.map(() => false);
    const target = r.best === "high" ? Math.max(...known) : Math.min(...known);
    return vals.map((v) => v !== null && v === target);
  });

  /** Watts por m²: métrica derivada que los instaladores usan de verdad. */
  const density = panels.map((p) => Math.round(p.w / p.area));
  const bestDensity = Math.max(...density);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Comparación de módulos"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-line bg-card shadow-[0_24px_60px_rgba(0,0,0,.16)] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="font-serif text-xl tracking-tight">Comparación de módulos</h2>
            <p className="mt-0.5 text-xs text-muted">
              El mejor valor de cada fila queda marcado. Los datos provienen de la lista CEC.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar comparación"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted transition hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className="w-[30%] border-b border-line px-6 py-3 text-left text-xs font-medium text-muted">
                  Característica
                </th>
                {panels.map((p) => (
                  <th key={p.brand + p.model} className="border-b border-line px-4 py-3 text-left align-top">
                    <span className="block txt-mini font-medium text-faint">{p.brand}</span>
                    <span className="mt-0.5 block text-[13px] font-semibold leading-snug tracking-tight text-ink">
                      {p.model}
                    </span>
                    <button
                      onClick={() => onRemove(p)}
                      className="mt-1 txt-mini text-muted underline decoration-line underline-offset-2 transition hover:text-ink"
                    >
                      Quitar
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, ri) => (
                <tr key={r.label} className="align-top">
                  <th scope="row" className="border-b border-line px-6 py-3 text-left font-normal">
                    <span className="block text-[13px] text-ink">{r.label}</span>
                    <span className="mt-0.5 block txt-mini leading-snug text-faint">{r.hint}</span>
                  </th>
                  {panels.map((p, pi) => (
                    <td key={p.model} className="border-b border-line px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 tabular-nums ${
                          winners[ri][pi] && panels.length > 1
                            ? "bg-leaf-600/10 font-semibold text-leaf-600"
                            : "text-ink"
                        }`}
                      >
                        {winners[ri][pi] && panels.length > 1 && <Trophy size={11} />}
                        {(() => {
                          const v = r.get(p);
                          return v === null ? "n/d" : v.toFixed(r.dp);
                        })()}
                        <span className="txt-mini font-normal text-muted">{r.unit}</span>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" className="border-b border-line px-6 py-3 text-left font-normal">
                  <span className="block text-[13px] text-ink">Densidad de potencia</span>
                  <span className="mt-0.5 block txt-mini leading-snug text-faint">
                    Watts por m² de techo — decide en espacios limitados
                  </span>
                </th>
                {panels.map((p, pi) => (
                  <td key={p.model} className="border-b border-line px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 tabular-nums ${
                        density[pi] === bestDensity && panels.length > 1
                          ? "bg-leaf-600/10 font-semibold text-leaf-600"
                          : "text-ink"
                      }`}
                    >
                      {density[pi] === bestDensity && panels.length > 1 && <Trophy size={11} />}
                      {density[pi]}
                      <span className="txt-mini font-normal text-muted">W/m²</span>
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="px-6 py-4" />
                {panels.map((p) => (
                  <td key={p.model} className="px-4 py-4">
                    <button
                      onClick={() => onPick(p)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink py-2 text-xs font-medium text-paper transition hover:bg-ink/90"
                    >
                      <Check size={14} /> Usar este
                    </button>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
