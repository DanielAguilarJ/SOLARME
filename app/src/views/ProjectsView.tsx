import { useMemo, useRef, useState } from "react";
import { MapPin, Plus, Trash2, SunMedium, Search, X, TriangleAlert, Download, Upload } from "lucide-react";
import { compute, fmt, GD_LIMIT_KW } from "../lib/solar";
import { modulePrice } from "../lib/price";
import { exportProjects, importProjects, nombreArchivo } from "../lib/transfer";
import { guardarContactos, leerContactos, ordenar, type Contacto } from "../lib/contactos";
import { matchCity } from "../lib/solar";
import { relativeDate, type Project } from "../lib/storage";

interface Props {
  projects: Project[];
  onOpen: (p: Project) => void;
  onDelete: (id: string) => void;
  /** Cambia en qué punto del embudo está el proyecto. Sin esto, `status` se quedaba en
   *  «borrador» para siempre y los filtros de arriba no podían mostrar nada. */
  onStatus: (id: string, status: Project["status"]) => void;
  onNew: () => void;
  /** Añade los proyectos de un respaldo. Sin este manejador no se ofrece restaurar. */
  onImport?: (entrantes: Project[]) => { agregados: number; repetidos: number };
}

const STATUS: Record<Project["status"], { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "bg-line text-muted" },
  propuesta: { label: "Propuesta enviada", cls: "bg-solar-50 text-solar-600" },
  ganado: { label: "Ganado", cls: "bg-green-50 text-leaf-600" },
};

type Filter = "todos" | Project["status"];
type Sort = "reciente" | "potencia" | "ahorro";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "borrador", label: "Borradores" },
  { key: "propuesta", label: "Propuestas" },
  { key: "ganado", label: "Ganados" },
];

/**
 * Lista densa de proyectos. La estructura —barra con búsqueda, pestañas de estado con
 * conteo, filas de una línea con la métrica alineada a la derecha— sigue el patrón de
 * Linear y de la lista de proyectos de Supabase: nada de tarjetas grandes, porque un
 * instalador con treinta domicilios necesita ver muchos a la vez y comparar cifras.
 */
/**
 * Une la libreta importada con la local sin sobrescribir nada.
 *
 * Misma regla que los proyectos: un id que ya existe es el mismo contacto, y reemplazar lo local
 * con una copia vieja del archivo sería la peor variante posible.
 */
function fusionarContactos(actuales: Contacto[], entrantes: Contacto[]) {
  const ids = new Set(actuales.map((c) => c.id));
  const nuevos = entrantes.filter((c) => !ids.has(c.id));
  return { lista: ordenar([...actuales, ...nuevos]), agregados: nuevos.length };
}

export default function ProjectsView({ projects, onOpen, onDelete, onStatus, onNew, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<{ texto: string; mal?: boolean } | null>(null);

  /** Descarga la cartera como archivo. Se usa un blob local y se revoca la URL: nada sale a
   * la red, el archivo lo guarda el propio navegador donde el instalador decida. */
  const respaldar = () => {
    // La libreta viaja con la cartera: es dato del usuario que se pierde con el navegador.
    const contactos = leerContactos();
    const blob = new Blob([exportProjects(projects, new Date(), contactos)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo();
    a.click();
    URL.revokeObjectURL(url);
    const conLibreta = contactos.length > 0
      ? ` y ${contactos.length} ${contactos.length === 1 ? "contacto" : "contactos"} de la libreta`
      : "";
    setAviso({
      texto: `Respaldo de ${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}${conLibreta} descargado.`,
    });
  };

  const restaurar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!archivo || !onImport) return;

    const texto = await archivo.text();
    const r = importProjects(texto);
    if (r.error) {
      setAviso({ texto: r.error, mal: true });
      return;
    }
    const { agregados, repetidos } = onImport(r.proyectos);
    // Los contactos se funden por id, igual que los proyectos: lo local no se sobrescribe.
    const nuevosContactos = fusionarContactos(leerContactos(), r.contactos);
    if (nuevosContactos.agregados > 0) guardarContactos(nuevosContactos.lista);

    const partes = [`${agregados} ${agregados === 1 ? "proyecto restaurado" : "proyectos restaurados"}`];
    if (nuevosContactos.agregados > 0) {
      partes.push(`${nuevosContactos.agregados} ${nuevosContactos.agregados === 1 ? "contacto" : "contactos"} a la libreta`);
    }
    if (repetidos > 0) {
      partes.push(`${repetidos} ya ${repetidos === 1 ? "estaba" : "estaban"} en la cartera y no se sobrescribieron`);
    }
    if (r.omitidos > 0) {
      partes.push(`${r.omitidos} ${r.omitidos === 1 ? "se omitió" : "se omitieron"} por venir con datos inválidos`);
    }
    setAviso({ texto: partes.join(" · "), mal: agregados === 0 });
  };

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [sort, setSort] = useState<Sort>("reciente");

  // Se calcula una sola vez por proyecto y se reutiliza para ordenar, sumar y pintar.
  // El precio del módulo se recalcula con el modelo vigente en lugar de confiar en el que quedó
  // guardado: un proyecto anterior al cambio de moneda traía el valor viejo en dólares y
  // producía una inversión y un retorno sin sentido en la lista.
  const rows = useMemo(
    () =>
      projects.map((p) => {
        const fresh = modulePrice(p.design.panel.brand, p.design.panel.eff);
        const ciudad = matchCity(p.address).city;
        const design = {
          ...p.design,
          site: ciudad.site,
          yield: ciudad.yield,
          panel: { ...p.design.panel, ppw: fresh.mxnPerWp, priceOrigin: fresh.origin },
        };
        return { p, r: compute(design) };
      }),
    [projects]
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { todos: rows.length, borrador: 0, propuesta: 0, ganado: 0 };
    for (const { p } of rows) c[p.status]++;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(
      ({ p }) =>
        (filter === "todos" || p.status === filter) &&
        (!q || p.address.toLowerCase().includes(q) || p.city.toLowerCase().includes(q))
    );
    const sorted = [...filtered];
    if (sort === "potencia") sorted.sort((a, b) => b.r.kwp - a.r.kwp);
    else if (sort === "ahorro") sorted.sort((a, b) => b.r.save - a.r.save);
    else sorted.sort((a, b) => b.p.createdAt - a.p.createdAt);
    return sorted;
  }, [rows, query, filter, sort]);

  // Los totales son de lo que se ve, no de todo: si filtras por "ganados", la suma
  // que importa es la de los ganados.
  const totals = useMemo(
    () => visible.reduce((a, { r }) => ({ kwp: a.kwp + r.kwp, save: a.save + r.save }), { kwp: 0, save: 0 }),
    [visible]
  );

  if (projects.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-card">
          <SunMedium size={24} className="text-solar-500" strokeWidth={1.8} />
        </div>
        <h2 className="mt-5 font-serif text-2xl tracking-tight">Aún no tienes proyectos</h2>
        <p className="mt-2 text-sm text-muted">
          Empieza con una dirección. SolarMe proyecta la instalación óptima sobre el techo y calcula
          producción, ahorro y retorno en segundos.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={onNew}
            className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus size={15} /> Analizar un domicilio
          </button>
          {/* Restaurar tiene que estar AQUÍ. El estado vacío es justo el de quien acaba de
              cambiar de computadora, y antes los botones vivían solo en la cabecera de la
              lista: con la cartera vacía no había manera de traer el respaldo. */}
          {onImport && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:border-ink hover:text-ink"
              >
                <Upload size={15} /> Restaurar un respaldo
              </button>
              <input
                ref={fileRef} type="file" accept="application/json,.json" className="hidden"
                aria-label="Archivo de respaldo"
                onChange={restaurar}
              />
            </>
          )}
        </div>
        {aviso && (
          <p className={`mt-4 max-w-md rounded-lg border px-3 py-2.5 text-xs ${
            aviso.mal
              ? "border-solar-500/30 bg-solar-500/5 text-muted"
              : "border-leaf-600/25 bg-leaf-600/5 text-muted"
          }`}>
            {aviso.texto}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Proyectos</h1>
          <p className="mt-1 text-sm text-muted">
            <b className="font-medium text-ink tabular-nums">{totals.kwp.toFixed(1)} kWp</b>
            {" en "}
            {visible.length} {visible.length === 1 ? "análisis" : "análisis"} · ahorro anual conjunto{" "}
            <b className="font-medium text-ink tabular-nums">${fmt(Math.round(totals.save))}</b>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Respaldo en archivo. No sustituye a un servidor: los proyectos siguen viviendo en
              este navegador. Resuelve cambiar de computadora y pasarle un proyecto a un
              colega sin pedirle al instalador que confíe su trabajo a un solo perfil. */}
          {projects.length > 0 && (
            <button
              onClick={respaldar}
              title="Guardar la cartera en un archivo"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted transition hover:border-ink hover:text-ink"
            >
              <Download size={15} /> Respaldar
            </button>
          )}
          {onImport && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                title="Traer proyectos de un archivo de respaldo"
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted transition hover:border-ink hover:text-ink"
              >
                <Upload size={15} /> Restaurar
              </button>
              <input
                ref={fileRef} type="file" accept="application/json,.json" className="hidden"
                aria-label="Archivo de respaldo"
                onChange={restaurar}
              />
            </>
          )}
        <button
          onClick={onNew}
          className="flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus size={15} /> Nuevo análisis
        </button>
        </div>
      </div>

      {aviso && (
        <p className={`mb-4 rounded-lg border px-3 py-2.5 text-xs ${
          aviso.mal
            ? "border-solar-500/30 bg-solar-500/5 text-muted"
            : "border-leaf-600/25 bg-leaf-600/5 text-muted"
        }`}>
          {aviso.texto}
        </p>
      )}

      {/* Barra de control: búsqueda, estado y orden */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 focus-within:border-ink">
          <Search size={14} className="shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por dirección o ciudad"
            aria-label="Buscar proyectos"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-faint transition hover:bg-line hover:text-ink"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-[5px] px-2.5 py-1 text-[13px] transition ${
                filter === f.key ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {f.label}
              <span className={`ml-1.5 tabular-nums ${filter === f.key ? "text-white/60" : "text-faint"}`}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Ordenar proyectos"
          className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-[13px] text-muted outline-none transition hover:border-ink focus:border-ink"
        >
          <option value="reciente">Más recientes</option>
          <option value="potencia">Mayor potencia</option>
          <option value="ahorro">Mayor ahorro</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-card">
        {visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted">
            Ningún proyecto coincide{query && <> con “{query}”</>}.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left txt-mini font-semibold tracking-wider whitespace-nowrap text-faint">
                <th className="w-full px-4 py-2.5">DOMICILIO</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">SISTEMA</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">PRODUCCIÓN</th>
                <th className="hidden px-4 py-2.5 text-right sm:table-cell">AHORRO / AÑO</th>
                <th className="hidden px-4 py-2.5 md:table-cell">ESTADO</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">CREADO</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visible.map(({ p, r }) => {
                const s = STATUS[p.status];
                return (
                  <tr
                    key={p.id}
                    onClick={() => onOpen(p)}
                    className="group cursor-pointer border-b border-line last:border-0 transition hover:bg-paper"
                  >
                    <td className="max-w-0 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="shrink-0 text-faint" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.address}</p>
                          <p className="truncate text-xs text-faint">{p.city}</p>
                          {/* En móvil se ocultan las columnas SISTEMA y AHORRO para que la tabla
                              no se desborde ni recorte el ahorro; sus dos datos se pliegan aquí. */}
                          <p className="mt-0.5 text-xs tabular-nums text-muted sm:hidden">
                            {r.kwp.toFixed(1)} kWp · {r.n} {r.n === 1 ? "módulo" : "módulos"} ·{" "}
                            <span className="font-medium text-leaf-600">${fmt(Math.round(r.save))}/año</span>
                          </p>
                          {/* La columna ESTADO es `hidden md:table-cell`, así que en teléfono
                              desaparece y con ella la única forma de marcar un trabajo ganado. El
                              embudo quedaba de solo lectura en el dispositivo donde se usa. Aquí
                              va el mismo control, visible solo en móvil. */}
                          <select
                            aria-label={`Estado de ${p.address}`}
                            value={p.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              onStatus(p.id, e.target.value as Project["status"]);
                            }}
                            className={`mt-1.5 cursor-pointer appearance-none rounded px-2 py-0.5 txt-mini font-medium outline-none focus-visible:ring-2 focus-visible:ring-solar-500 md:hidden ${s.cls}`}
                          >
                            {(Object.keys(STATUS) as Project["status"][]).map((k) => (
                              <option key={k} value={k}>{STATUS[k].label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums sm:table-cell">
                      <span className="inline-flex items-center gap-1.5">
                        {r.kwp.toFixed(1)} kWp
                        {r.exceedsGD && (
                          <TriangleAlert
                            size={13}
                            className="shrink-0 text-amber-600"
                            aria-label={`Supera el límite de generación distribuida de ${GD_LIMIT_KW} kW`}
                          />
                        )}
                      </span>
                      <span className="text-faint"> · {r.n} {r.n === 1 ? "módulo" : "módulos"}</span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-muted sm:table-cell">
                      {fmt(Math.round(r.kwh))} kWh
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-leaf-600 sm:table-cell">
                      ${fmt(Math.round(r.save))}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">
                      {/* Era una insignia de solo lectura, y `status` únicamente se escribía como
                          «borrador» al crear el proyecto: nada en la app podía cambiarlo. O sea que
                          las pestañas «Propuestas» y «Ganados» de arriba, sus contadores y estas
                          insignias existían para un estado que jamás llegaba. Un instalador no
                          podía marcar un trabajo ganado, que es justo para lo que sirve una
                          cartera. Ahora se edita aquí, donde vive el filtro que lo lee. */}
                      <select
                        aria-label={`Estado de ${p.address}`}
                        value={p.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          onStatus(p.id, e.target.value as Project["status"]);
                        }}
                        className={`cursor-pointer appearance-none rounded px-2 py-0.5 txt-mini font-medium outline-none focus-visible:ring-2 focus-visible:ring-solar-500 ${s.cls}`}
                      >
                        {(Object.keys(STATUS) as Project["status"][]).map((k) => (
                          <option key={k} value={k}>{STATUS[k].label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-faint lg:table-cell">
                      {relativeDate(p.createdAt)}
                    </td>
                    <td className="px-2 py-3">
                      <button
                        aria-label="Eliminar proyecto"
                        onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                        className="grid h-7 w-7 place-items-center rounded text-faint opacity-0 transition hover:bg-line hover:text-ink group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
