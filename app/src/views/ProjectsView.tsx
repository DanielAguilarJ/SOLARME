import { useMemo, useRef, useState } from "react";
import { MapPin, Plus, Trash2, SunMedium, Search, X, TriangleAlert, Download, Upload, StickyNote, Pencil, Copy } from "lucide-react";
import { compute, fmt, GD_LIMIT_KW } from "../lib/solar";
import { modulePrice } from "../lib/price";
import { exportProjects, fusionarAjustes, importProjects, nombreArchivo } from "../lib/transfer";
import { guardarNegocio, leerNegocio } from "../lib/negocio";
import { guardarBosRates, loadBosRates } from "../lib/bos";
import { guardarQuotes, loadQuotes } from "../lib/quotes";
import { guardarContactos, leerContactos, ordenar, type Contacto } from "../lib/contactos";
import { matchCity } from "../lib/solar";
import { MAX_NOTA, relativeDate, type Project } from "../lib/storage";

interface Props {
  projects: Project[];
  onOpen: (p: Project) => void;
  onDelete: (id: string) => void;
  /** Cambia en qué punto del embudo está el proyecto. Sin esto, `status` se quedaba en
   *  «borrador» para siempre y los filtros de arriba no podían mostrar nada. */
  onStatus: (id: string, status: Project["status"]) => void;
  /** Guarda la nota de seguimiento. Sin ella la nota no se puede editar desde aquí. */
  onNota?: (id: string, nota: string) => void;
  /** Corrige el texto del domicilio. La ciudad no cambia: de ella depende la física del cálculo. */
  onDomicilio?: (id: string, address: string) => void;
  /** Duplica el proyecto para trabajar un segundo escenario sobre el mismo techo. */
  onDuplicar?: (id: string) => void;
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

/** Enumera en español: «a, b y c». */
function enumerar(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/** True si hay algo capturado a mano que valga la pena anunciar en el respaldo. */
function tieneAjustes(a: { negocio: { nombre: string; telefono: string; correo: string }; bos: object; quotes: object }): boolean {
  return Boolean(
    a.negocio.nombre || a.negocio.telefono || a.negocio.correo ||
    Object.keys(a.bos).length > 0 || Object.keys(a.quotes).length > 0
  );
}

export default function ProjectsView({ projects, onOpen, onDelete, onStatus, onNew, onImport, onNota, onDomicilio, onDuplicar }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<{ texto: string; mal?: boolean } | null>(null);
  /** Id del proyecto cuya nota se está editando. Uno a la vez: la fila crece y dos a la vez marean. */
  const [editandoNota, setEditandoNota] = useState<string | null>(null);
  /** Id del proyecto cuyo domicilio se está corrigiendo. */
  const [editandoDir, setEditandoDir] = useState<string | null>(null);

  /** Descarga la cartera como archivo. Se usa un blob local y se revoca la URL: nada sale a
   * la red, el archivo lo guarda el propio navegador donde el instalador decida. */
  const respaldar = () => {
    // La libreta viaja con la cartera: es dato del usuario que se pierde con el navegador.
    const contactos = leerContactos();
    // Y con ellos lo que el instalador capturó a mano: su identidad, su costo por watt y sus
    // precios por marca. Sin esto el respaldo era una promesa a medias: al restaurar en otro
    // equipo las propuestas volvían a la referencia nacional sin avisar de nada.
    const ajustes = { negocio: leerNegocio(), bos: loadBosRates(), quotes: loadQuotes() };
    const blob = new Blob([exportProjects(projects, new Date(), contactos, ajustes)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo();
    a.click();
    URL.revokeObjectURL(url);
    // El aviso enumera lo que de verdad va en el archivo. Antes empezaba siempre por los
    // proyectos, y desde que se puede respaldar sin ninguno decía «Respaldo de 0 proyectos, con
    // tus datos…», que suena a que no se guardó nada.
    const piezas: string[] = [];
    if (projects.length > 0) {
      piezas.push(`${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}`);
    }
    if (contactos.length > 0) {
      piezas.push(`${contactos.length} ${contactos.length === 1 ? "contacto" : "contactos"} de la libreta`);
    }
    if (tieneAjustes(ajustes)) piezas.push("tus datos y tus precios");
    setAviso({
      texto: piezas.length > 0
        ? `Respaldo descargado con ${enumerar(piezas)}.`
        : "Respaldo descargado. Todavía no hay nada guardado que meter en él.",
    });
  };

  /**
   * True si hay algo que valga la pena respaldar aunque la cartera esté vacía: la libreta, la
   * identidad del negocio o los precios capturados. Se consulta al almacén en el momento, no al
   * montar, porque el instalador puede acabar de rellenarlos en otra pantalla.
   */
  const hayAlgoQueRespaldar = () =>
    projects.length > 0 ||
    leerContactos().length > 0 ||
    tieneAjustes({ negocio: leerNegocio(), bos: loadBosRates(), quotes: loadQuotes() });

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

    // Los ajustes entran donde el equipo no tiene nada; lo local nunca se sobrescribe, porque un
    // respaldo se importa para recuperar algo y a veces el archivo es de un compañero.
    const ajustes = fusionarAjustes(
      { negocio: leerNegocio(), bos: loadBosRates(), quotes: loadQuotes() },
      r.ajustes,
    );
    if (ajustes.aplicados.length > 0) {
      if (ajustes.ajustes.negocio) guardarNegocio(ajustes.ajustes.negocio);
      if (ajustes.ajustes.bos) guardarBosRates(ajustes.ajustes.bos);
      if (ajustes.ajustes.quotes) guardarQuotes(ajustes.ajustes.quotes);
    }

    const partes = [`${agregados} ${agregados === 1 ? "proyecto restaurado" : "proyectos restaurados"}`];
    if (ajustes.aplicados.length > 0) partes.push(ajustes.aplicados.join(" y "));
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
  /** Domicilios distintos entre los visibles: dos escenarios del mismo techo cuentan uno. */
  const domicilios = new Set(visible.map(({ p }) => `${p.address}|${p.city}`.toLowerCase())).size;

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
          {/* Y respaldar también, cuando ya hay algo que perder aunque no sea un proyecto.
              El pie de la barra lateral ofrece «Respaldar en un archivo» y trae aquí; con la
              cartera vacía no había botón, así que quien dedicó el primer día a poner sus datos,
              sus precios y su libreta no tenía forma de guardarlos. Y esos datos se pierden con el
              navegador igual que los proyectos. */}
          {hayAlgoQueRespaldar() && (
            <button
              onClick={respaldar}
              className="flex items-center gap-1.5 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:border-ink hover:text-ink"
            >
              <Download size={15} /> Respaldar mis datos
            </button>
          )}
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
            {visible.length} análisis
            {/* Desde que se pueden duplicar proyectos para comparar escenarios, dos filas pueden
                ser el MISMO techo, y entonces el ahorro conjunto cuenta dos veces al mismo cliente.
                No se cambia la suma —es el total de los análisis, y así se llama—, pero se dice
                cuántos domicilios distintos hay para que nadie lea dos veces el mismo dinero. */}
            {domicilios < visible.length && (
              <span className="text-faint">
                {" "}de {domicilios} {domicilios === 1 ? "domicilio" : "domicilios"}
              </span>
            )}
            {" · ahorro anual conjunto "}
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
                          {/* El domicilio se puede corregir aquí. Antes un error de tecleo obligaba
                              a borrar el proyecto y rehacer el trazo del techo, y ese texto es el
                              que sale impreso en la propuesta que lee el cliente.
                              La CIUDAD no se toca: de ella salen el rendimiento medido, las
                              temperaturas y por tanto las series. Cambiarla aquí dejaría la física
                              de una ciudad con el nombre de otra. */}
                          {onDomicilio && editandoDir === p.id ? (
                            <input
                              autoFocus
                              defaultValue={p.address}
                              maxLength={200}
                              aria-label={`Domicilio de ${p.address}`}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                onDomicilio(p.id, e.target.value);
                                setEditandoDir(null);
                              }}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Escape") setEditandoDir(null);
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                              className="w-full rounded border border-line bg-paper px-1.5 py-0.5 text-sm font-medium outline-none focus:border-ink"
                            />
                          ) : (
                            <p className="truncate font-medium">{p.address}</p>
                          )}
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

                          {/* Nota de seguimiento. Va en la celda del domicilio y no en una columna
                              propia porque el texto es largo y variable: una columna la partiría o
                              la truncaría en todos los anchos. Se abre al pulsarla, se guarda al
                              salir del foco, y con Escape se cierra sin guardar. */}
                          {onNota && (editandoNota === p.id ? (
                            <textarea
                              autoFocus
                              defaultValue={p.nota ?? ""}
                              maxLength={MAX_NOTA}
                              aria-label={`Nota de ${p.address}`}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                onNota(p.id, e.target.value);
                                setEditandoNota(null);
                              }}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Escape") setEditandoNota(null);
                              }}
                              rows={2}
                              placeholder="Pidió financiamiento, volver en junio…"
                              className="mt-1.5 w-full resize-none rounded-lg border border-line bg-paper px-2 py-1.5 txt-mini leading-relaxed outline-none focus:border-ink"
                            />
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditandoNota(p.id);
                              }}
                              className="mt-1.5 flex w-full items-start gap-1 rounded px-1 py-0.5 text-left txt-mini leading-relaxed text-faint transition hover:bg-line/40 hover:text-muted"
                            >
                              <StickyNote size={11} className="mt-0.5 shrink-0" aria-hidden />
                              <span className="min-w-0 whitespace-normal">
                                {p.nota ? p.nota : "Agregar una nota"}
                              </span>
                            </button>
                          ))}
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
                      {/* Las acciones aparecen al pasar por encima en escritorio, y siempre en
                          teléfono: allí no hay «pasar por encima» y quedarían inalcanzables. */}
                      <div className="flex items-center gap-0.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                        {onDomicilio && (
                          <button
                            aria-label={`Corregir el domicilio de ${p.address}`}
                            onClick={(e) => { e.stopPropagation(); setEditandoDir(p.id); }}
                            className="grid h-7 w-7 place-items-center rounded text-faint transition hover:bg-line hover:text-ink"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {onDuplicar && (
                          <button
                            aria-label={`Duplicar ${p.address}`}
                            onClick={(e) => { e.stopPropagation(); onDuplicar(p.id); }}
                            className="grid h-7 w-7 place-items-center rounded text-faint transition hover:bg-line hover:text-ink"
                          >
                            <Copy size={13} />
                          </button>
                        )}
                        <button
                          aria-label="Eliminar proyecto"
                          onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                          className="grid h-7 w-7 place-items-center rounded text-faint transition hover:bg-line hover:text-ink"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
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
