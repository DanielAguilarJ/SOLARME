import { monthlyProduction, fmt } from "../lib/solar";
import { seasonalSwing, RESUMEN, type Site } from "../lib/site";
import { repartirEnteros } from "../lib/capex";

/**
 * Producción mes a mes. Antes repartía el año con una sola curva fija "aproximada para
 * México", y por eso mostraba la misma estacionalidad en Tijuana que en Mérida. Ahora usa
 * la forma medida del sitio, y cuando no la hay lo dice en vez de fingirla.
 *
 * La amplitud estacional no es un adorno: con medición neta la CFE compensa el excedente
 * hasta doce meses, así que un sitio parejo consume su propio excedente y uno muy
 * estacional lo acumula en una temporada para gastarlo en otra.
 */
export default function MonthlyChart({
  annualKwh,
  site,
}: {
  annualKwh: number;
  site?: Site;
}) {
  const { data, origen } = monthlyProduction(annualKwh, site);
  const mesesEnteros = repartirEnteros(data.map((d) => d.kwh), annualKwh);
  const max = Math.max(...data.map((d) => d.kwh), 1);
  const min = Math.min(...data.map((d) => d.kwh));
  const swing = seasonalSwing(data.map((d) => d.kwh));
  const pico = data.reduce((a, b) => (b.kwh > a.kwh ? b : a));
  const valle = data.reduce((a, b) => (b.kwh < a.kwh ? b : a));
  const medido = origen === "medido";

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Producción mensual</h3>
          <p className="mt-0.5 text-xs text-faint">
            {medido ? (
              <>
                Medida en {site!.nombre}
                <span className="ml-1.5 rounded bg-leaf-600/10 px-1.5 py-px font-medium text-leaf-600">
                  medido
                </span>
              </>
            ) : (
              <>
                Promedio de {RESUMEN.sitios} ciudades medidas
                <span className="ml-1.5 rounded bg-line px-1.5 py-px font-medium text-muted">
                  estimado
                </span>
              </>
            )}
          </p>
        </div>
        <span className="shrink-0 text-xs text-faint tabular-nums">
          {fmt(Math.round(annualKwh))} kWh/año
        </span>
      </div>

      {/* Los doce valores mostrados se reparten para que sumen el anual del titular: redondear cada
          mes por su cuenta descuadraba en el 59.5 % de los perfiles medidos. La diferencia era de 1
          a 3 kWh —consistencia, no exactitud— pero quien sume los meses debe obtener el anual. */}
      <div className="mt-4 flex h-32 items-end gap-1.5">
        {data.map((d, i) => {
          const esPico = d.m === pico.m;
          const esValle = d.m === valle.m;
          return (
            // El valor de cada mes vive en el hover, que es una ayuda de ratón: en una pantalla
            // táctil no hay hover. Lo que NO puede faltar es el dato para quien no ve el dibujo, así
            // que cada barra se anuncia con su mes y su cifra. `role="img"` es lo que hace válido un
            // `aria-label` en un elemento genérico; no se pone `tabIndex` porque la barra no hace
            // nada al activarse y doce paradas de tabulación falsas estorban a quien navega con
            // teclado. En táctil los tres datos que de verdad importan —pico, mínimo y amplitud—
            // están abajo, siempre visibles y sin depender del hover.
            <div
              key={d.m}
              role="img"
              aria-label={`${d.m}: ${fmt(mesesEnteros[i])} kWh`}
              className="group flex flex-1 flex-col items-center gap-1.5"
            >
              <div className="relative w-full">
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 txt-micro text-white opacity-0 transition group-hover:opacity-100 tabular-nums"
                >
                  {fmt(mesesEnteros[i])}
                </span>
                <div
                  className={`w-full rounded-t transition group-hover:bg-solar-500 ${
                    esPico ? "bg-slate-ink" : esValle ? "bg-slate-ink/40" : "bg-slate-ink/70"
                  }`}
                  style={{ height: `${Math.max(2, (d.kwh / max) * 96)}px` }}
                />
              </div>
              <span
                aria-hidden
                className={`txt-micro ${esPico || esValle ? "font-medium text-muted" : "text-faint"}`}
              >
                {d.m}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-line pt-3 text-xs">
        <span className="text-muted">
          Pico <span className="font-medium text-ink">{pico.m}</span>
          <span className="ml-1 text-faint tabular-nums">{fmt(Math.round(max))}</span>
        </span>
        <span className="text-muted">
          Mínimo <span className="font-medium text-ink">{valle.m}</span>
          <span className="ml-1 text-faint tabular-nums">{fmt(Math.round(min))}</span>
        </span>
        <span className="text-muted">
          Amplitud <span className="font-medium text-ink tabular-nums">{swing.toFixed(2)}×</span>
        </span>
      </div>
    </div>
  );
}
