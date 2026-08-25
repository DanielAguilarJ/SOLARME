import { Receipt, TriangleAlert } from "lucide-react";
import { annualFromBill, tariffFromBill, fmt, type Bill } from "../lib/solar";

interface Props {
  bill: Bill | undefined;
  onChange: (b: Bill | undefined) => void;
  /** Consumo por defecto del tipo de proyecto, para contrastar. */
  fallback: number;
}

/**
 * Captura del recibo CFE del cliente.
 *
 * El instalador tiene el recibo en la mano durante la visita. Con dos números salen el
 * consumo anual real y el precio efectivo por kWh, que es lo que el sistema va a desplazar.
 * Esto evita asumir una tarifa: CFE cobra por escalones y el salto a DAC cambia el precio
 * radicalmente, así que el propio recibo es la única fuente fiable.
 */
export default function BillCapture({ bill, onChange, fallback }: Props) {
  const b: Bill = bill ?? { kwh: 0, amount: 0, period: "bim" };
  const active = b.kwh > 0 && b.amount > 0;

  const annual = active ? annualFromBill(b) : 0;
  const tariff = active ? tariffFromBill(b) : 0;

  function patch(next: Partial<Bill>) {
    const merged = { ...b, ...next };
    onChange(merged.kwh > 0 || merged.amount > 0 ? merged : undefined);
  }

  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="mb-1 flex items-center gap-1.5">
        <Receipt size={15} className="text-muted" />
        <h3 className="text-sm font-medium">Recibo CFE del cliente</h3>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted">
        Captura los dos datos del recibo y el ahorro se calcula con el precio que el cliente
        paga de verdad, escalones y cargos incluidos.
      </p>

      {/* Apilado en pantallas angostas. Dos `input` uno al lado del otro desbordaban 45 px en
          un iPhone: una columna de rejilla tiene `min-width: auto` y un campo numérico trae su
          propio ancho mínimo intrínseco, así que dos no caben en 390 px. `min-w-0` en cada
          columna es la otra mitad del arreglo. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-muted">Consumo del periodo</span>
          <div className="relative">
            <input
              type="number" min={0} step={10} inputMode="numeric"
              value={b.kwh || ""} placeholder="0"
              onChange={(e) => patch({ kwh: Math.max(0, +e.target.value || 0) })}
              className="fld pr-10"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">
              kWh
            </span>
          </div>
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-muted">Importe del periodo</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-faint">
              $
            </span>
            <input
              type="number" min={0} step={50} inputMode="numeric"
              value={b.amount || ""} placeholder="0"
              onChange={(e) => patch({ amount: Math.max(0, +e.target.value || 0) })}
              className="fld pl-7"
            />
          </div>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-line p-1">
        {([["bim", "Bimestral"], ["mes", "Mensual"]] as [Bill["period"], string][]).map(
          ([k, label]) => (
            <button
              key={k} onClick={() => patch({ period: k })}
              className={`min-h-11 rounded-md py-1.5 text-[13px] font-medium transition sm:min-h-0 ${
                b.period === k ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {/* Valores derivados en vivo: el instalador ve al instante si capturó bien */}
      {active ? (
        <div className="mt-4 space-y-2.5 border-t border-line pt-4">
          <Derived k="Consumo anual real" v={`${fmt(annual)} kWh`}
            note={`el promedio del tipo era ${fmt(fallback)} kWh`} />
          <Derived k="Precio efectivo" v={`$${tariff.toFixed(2)} / kWh`}
            note="incluye escalones y cargos fijos del recibo" />
          {tariff > 5 && (
            <div className="flex gap-2 rounded-lg border border-solar-500/30 bg-solar-500/5 px-3 py-2.5">
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-solar-600" />
              <p className="txt-mini leading-relaxed">
                Precio alto por kWh: es señal de tarifa <b className="font-semibold">DAC</b> o
                consumo excedente. Estos clientes son los que recuperan la inversión más rápido,
                porque cada kWh que dejan de comprar vale más.
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 border-t border-line pt-4 txt-mini leading-relaxed text-faint">
          Sin recibo se usa el promedio del tipo de proyecto ({fmt(fallback)} kWh/año), que es una
          hipótesis de arranque y no un dato del cliente.
        </p>
      )}
    </div>
  );
}

function Derived({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-ink">{k}</p>
        <p className="txt-mini leading-snug text-faint">{note}</p>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums">{v}</p>
    </div>
  );
}
