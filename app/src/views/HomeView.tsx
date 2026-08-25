import { useMemo } from "react";
import { RESUMEN } from "../lib/site";
// Se cuenta el catálogo, no se recuerda su tamaño: el scraper puede traer más marcas.
import catalogo from "../data/panels.json";
import {
  Plus, PanelsTopLeft, Users, ArrowRight, MapPin,
  TriangleAlert, CircleDashed, Check,
} from "lucide-react";
import { compute } from "../lib/solar";
import { revisarProyecto, resumenCartera, type Hallazgo } from "../lib/revision";
import { relativeDate, type Project } from "../lib/storage";
import type { ViewKey } from "../components/shell/Sidebar";

interface Props {
  projects: Project[];
  onNew: () => void;
  onOpen: (p: Project) => void;
  onNavigate: (v: ViewKey) => void;
}

export default function HomeView({ projects, onNew, onOpen, onNavigate }: Props) {
  const { resumen, pendientes, kwp } = useMemo(() => {
    const conHallazgos = projects
      .map((p) => ({ p, h: revisarProyecto(p) }))
      .filter((x) => x.h.length > 0)
      // los que impiden entregar, primero
      .sort((a, b) => {
        const ai = a.h.some((x) => x.gravedad === "impide") ? 0 : 1;
        const bi = b.h.some((x) => x.gravedad === "impide") ? 0 : 1;
        return ai - bi || b.p.createdAt - a.p.createdAt;
      });
    return {
      resumen: resumenCartera(projects),
      pendientes: conHallazgos,
      kwp: projects.reduce((a, p) => a + compute(p.design).kwp, 0),
    };
  }, [projects]);

  if (projects.length === 0) return <Vacio onNew={onNew} onNavigate={onNavigate} />;

  return (
    <div className="px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Cartera</h1>
          <p className="mt-1.5 text-sm text-muted">
            {projects.length} {projects.length === 1 ? "domicilio" : "domicilios"} ·{" "}
            {kwp.toFixed(1)} kWp propuestos
          </p>
        </div>
        <button
          onClick={onNew}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-solar-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-solar-700 sm:min-h-0"
        >
          <Plus size={15} /> Analizar un domicilio
        </button>
      </div>

      {/* Estado real de la cartera, no totales de vanidad. Sumar el ahorro de todos los
          clientes supone que todos firman; contar cuántos están listos, no. */}
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-y border-line py-3">
        <Cuenta n={resumen.listos} label="con datos completos" tono="bien" />
        <Cuenta n={resumen.estiman} label="con cifras estimadas" tono="tibio" />
        <Cuenta n={resumen.impiden} label="sin propuesta posible" tono="mal" />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">
              {pendientes.length > 0 ? "Antes de entregar" : "Todo listo"}
            </h2>
            <button
              onClick={() => onNavigate("proyectos")}
              className="flex items-center gap-1 txt-mini text-muted transition hover:text-ink"
            >
              Ver la cartera <ArrowRight size={13} />
            </button>
          </div>

          {pendientes.length === 0 ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-card px-4 py-3.5 txt-mini text-muted">
              <Check size={14} className="mt-px shrink-0 text-leaf-600" />
              <span>
                Cada proyecto tiene ciudad medida, recibo del cliente, contorno trazado y
                obstáculos capturados. Ninguna cifra descansa en un supuesto.
              </span>
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {pendientes.slice(0, 5).map(({ p, h }) => (
                <li key={p.id}>
                  <button
                    onClick={() => onOpen(p)}
                    className="w-full rounded-xl border border-line bg-card px-4 py-3 text-left transition hover:border-ink/25"
                  >
                    <div className="flex items-start gap-2.5">
                      <MapPin size={14} className="mt-0.5 shrink-0 text-faint" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.address}</div>
                        <div className="truncate txt-micro text-faint">
                          {p.city} · {relativeDate(p.createdAt)}
                        </div>
                      </div>
                    </div>
                    <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5">
                      {h.slice(0, 2).map((x) => (
                        <Falta key={x.clave} h={x} />
                      ))}
                      {h.length > 2 && (
                        <li className="pl-[19px] txt-micro text-faint">
                          y {h.length - 2} más
                        </li>
                      )}
                    </ul>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-medium">Ir a</h2>
          <div className="mt-3 space-y-1.5">
            <Quick
              icon={<PanelsTopLeft size={15} />}
              label="Catálogo de módulos"
              hint="140 modelos con datos eléctricos reales"
              onClick={() => onNavigate("paneles")}
            />
            <Quick
              icon={<Users size={15} />}
              label="La libreta de la obra"
              hint="quién firma, quién monta, quién surte"
              onClick={() => onNavigate("instaladores")}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Falta({ h }: { h: Hallazgo }) {
  const impide = h.gravedad === "impide";
  return (
    <li className="flex items-start gap-2 txt-micro">
      {impide ? (
        <TriangleAlert size={12} className="mt-0.5 shrink-0 text-solar-600" />
      ) : (
        <CircleDashed size={12} className="mt-0.5 shrink-0 text-faint" />
      )}
      <span className="min-w-0">
        <span className={impide ? "text-ink" : "text-muted"}>{h.texto}</span>
        <span className="text-faint"> — {h.accion}</span>
      </span>
    </li>
  );
}

function Cuenta({ n, label, tono }: { n: number; label: string; tono: "bien" | "tibio" | "mal" }) {
  const color = n === 0 ? "text-faint" : tono === "bien" ? "text-leaf-600" : tono === "mal" ? "text-solar-600" : "text-ink";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-xl font-medium tabular-nums ${color}`}>{n}</span>
      <span className="txt-mini text-muted">{label}</span>
    </div>
  );
}

function Quick({ icon, label, hint, onClick }: {
  icon: React.ReactNode; label: string; hint: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-left transition hover:border-ink/25"
    >
      <span className="text-faint">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block txt-micro text-faint">{hint}</span>
      </span>
      <ArrowRight size={14} className="shrink-0 text-faint" />
    </button>
  );
}

/** Sin cartera, la pantalla tiene un solo trabajo: explicar qué hace la herramienta y arrancar. */
function Vacio({ onNew, onNavigate }: { onNew: () => void; onNavigate: (v: ViewKey) => void }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-4xl tracking-tight">Empieza por una dirección</h1>
      <p className="mt-3 text-muted">
        Escribe el domicilio y SolarMe resuelve la ciudad medida más cercana, propone la
        inclinación y la orientación óptimas de ese sitio, coloca los módulos sobre el contorno que
        tracen y dimensiona las series con la temperatura mínima registrada ahí.
      </p>
      <button
        onClick={onNew}
        className="mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-solar-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-solar-700"
      >
        <Plus size={15} /> Analizar un domicilio
      </button>

      <dl className="mt-12 grid gap-x-8 gap-y-5 border-t border-line pt-8 sm:grid-cols-2">
        {/* Las dos cifras salen del dato, no de la memoria de quien escribió el texto: el conteo
            de sitios estaba escrito a mano y se quedó corto al ampliar el catálogo, en la primera
            pantalla que ve un cliente. Se detectó mirando la app en un teléfono. */}
        <Dato
          k={`${RESUMEN.sitios} sitios medidos`}
          v={`Rendimiento, inclinación óptima y temperaturas extremas de los ${RESUMEN.estados} estados, de PVGIS y NASA POWER.`}
        />
        <Dato
          k={`${catalogo.panels.length} módulos reales`}
          v="Del listado de la CEC, con voltaje, corriente y coeficiente térmico de cada uno."
        />
        <Dato k="Sin señal" v="Una vez cargada, funciona sin internet: la física va dentro de la aplicación." />
        <Dato k="Lo estimado se declara" v="Cada cifra que no salga de un dato medido lleva su etiqueta." />
      </dl>

      <button
        onClick={() => onNavigate("paneles")}
        className="mt-8 flex items-center gap-1 txt-mini text-muted transition hover:text-ink"
      >
        Ver el catálogo de módulos primero <ArrowRight size={13} />
      </button>
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-sm font-medium">{k}</dt>
      <dd className="mt-0.5 txt-mini text-muted">{v}</dd>
    </div>
  );
}
