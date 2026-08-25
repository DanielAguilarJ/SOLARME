import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ProjectType } from "../lib/solar";
import { BOS_MXN_PER_W } from "../lib/capex";
import { bosFor, isOwnBos, isValidBos, MIN_BOS, MAX_BOS, type BosRates } from "../lib/bos";

interface Props {
  type: ProjectType;
  rates: BosRates;
  onSet: (type: ProjectType, mxnPerW: number) => void;
  onClear: (type: ProjectType) => void;
}

const LABEL: Record<ProjectType, string> = {
  res: "residencial",
  com: "comercial",
  ind: "industrial",
};

/**
 * Tarifa editable del resto del sistema.
 *
 * El patrón —total arriba, supuesto editable en línea debajo, con el valor de referencia a la
 * vista— viene de la calculadora hipotecaria de Zillow, revisada en Mobbin en modo deep. Lo que
 * cambia aquí es qué se edita: no un parámetro del cliente, sino el **costo de la operación del
 * instalador**, que es el dato que la app no puede adivinar y él sí conoce con exactitud.
 *
 * Cierra el camino que quedó abierto: `Design.bosPerW` y `buildCapex(..., bosOverride)` estaban
 * construidos y probados, pero ninguna interfaz los escribía.
 */
export default function BosRateField({ type, rates, onSet, onClear }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const current = bosFor(rates, type);
  const own = isOwnBos(rates, type);
  const reference = BOS_MXN_PER_W[type];

  const commit = () => {
    if (draft === null) return;
    const v = Number(draft.replace(",", "."));
    if (draft.trim() === "") onClear(type);
    else if (isValidBos(v)) onSet(type, v);
    setDraft(null);
  };

  return (
    <div className="mt-2 rounded-lg border border-line px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">Tu costo del resto del sistema</span>
          <span className="block txt-mini leading-relaxed text-faint">
            Inversor, estructura, cableado, obra y trámite por watt, en {LABEL[type]}.
            {own ? " Es tu tarifa." : ` Referencia de mercado: ${reference} MXN/W.`}
          </span>
        </span>

        <span
          className={`flex shrink-0 items-center gap-1 rounded-lg border bg-paper pl-2 pr-1 transition focus-within:border-ink ${
            own ? "border-leaf-600/40" : "border-line"
          }`}
        >
          <span className="text-xs text-faint">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={MIN_BOS}
            max={MAX_BOS}
            step={0.5}
            value={draft ?? (own ? String(current) : "")}
            placeholder={String(reference)}
            aria-label={`Costo del resto del sistema por watt en ${LABEL[type]}`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
            className="w-[3.75rem] bg-transparent py-1 text-right text-[13px] tabular-nums outline-none placeholder:text-faint"
          />
          <span className="pr-1 txt-micro text-faint">MXN/W</span>
        </span>

        <button
          onClick={() => onClear(type)}
          disabled={!own}
          aria-label="Volver a la referencia de mercado"
          className="grid h-7 w-7 shrink-0 place-items-center rounded text-faint transition hover:bg-paper hover:text-ink disabled:opacity-20 disabled:hover:bg-transparent"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  );
}
