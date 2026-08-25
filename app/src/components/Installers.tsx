import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Phone, Mail, MapPin, BadgeCheck, Trash2, TriangleAlert, X,
} from "lucide-react";
import {
  ROLES, buscar, guardarContactos, leerContactos, ordenar, resumen,
  contactoValido, type Contacto, type Rol,
} from "../lib/contactos";

/**
 * La libreta de la obra.
 *
 * Antes esta vista era un directorio de empresas inventadas con un cartel de «datos de
 * demostración». Un directorio de verdad exige que los instaladores se den de alta en un lugar
 * compartido, o sea un servidor, y esta aplicación no tiene ninguno. Lo que sí puede existir aquí
 * —y hace falta— es la libreta del propio instalador: quién firma, quién sube los módulos y de
 * quién sale el material.
 */
export default function Installers() {
  const [contactos, setContactos] = useState<Contacto[]>(() => leerContactos());
  const [q, setQ] = useState("");
  const [alta, setAlta] = useState(false);

  const guardar = (cs: Contacto[]) => {
    setContactos(cs);
    guardarContactos(cs);
  };

  const vista = useMemo(() => ordenar(buscar(contactos, q)), [contactos, q]);
  const r = useMemo(() => resumen(contactos), [contactos]);
  const porRol = useMemo(
    () => ROLES.map((rol) => ({ rol, items: vista.filter((c) => c.rol === rol.clave) }))
      .filter((g) => g.items.length > 0),
    [vista]
  );

  return (
    <div className="px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">La libreta de la obra</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Quién firma, quién monta y de quién sale el material. Se guarda en este navegador y
            viaja en tu respaldo; no se publica en ningún lado.
          </p>
        </div>
        <button
          onClick={() => setAlta(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-solar-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-solar-700 sm:min-h-0"
        >
          <Plus size={15} /> Agregar contacto
        </button>
      </div>

      {r.sinResponsable && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-solar-500/30 bg-solar-500/5 px-4 py-3 txt-mini text-muted">
          <TriangleAlert size={14} className="mt-px shrink-0 text-solar-600" />
          <span>
            No hay electricista responsable en la libreta. La propuesta imprime una lista de
            trámites ante la CRE y un cálculo de conductor que alguien con registro tiene que
            firmar: sin ese contacto, el trabajo se queda en el escritorio.
          </span>
        </p>
      )}

      {contactos.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-y border-line py-3">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <Search size={14} className="shrink-0 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, ciudad, registro o nota"
              aria-label="Buscar en la libreta"
              className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-faint sm:min-h-0"
            />
          </label>
          <span className="txt-mini tabular-nums text-faint">
            {vista.length === contactos.length
              ? `${contactos.length} ${contactos.length === 1 ? "contacto" : "contactos"}`
              : `${vista.length} de ${contactos.length}`}
          </span>
        </div>
      )}

      {contactos.length === 0 ? (
        <Vacio onAdd={() => setAlta(true)} />
      ) : vista.length === 0 ? (
        <p className="mt-8 txt-mini text-muted">Nada coincide con «{q}».</p>
      ) : (
        <div className="mt-8 space-y-8">
          {porRol.map(({ rol, items }) => (
            <section key={rol.clave}>
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-medium">{rol.nombre}</h2>
                <span className="txt-micro text-faint">{rol.nota}</span>
              </div>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
                {items.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{c.nombre}</span>
                        {c.registro && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-1.5 txt-micro tabular-nums text-muted">
                            <BadgeCheck size={10} className="text-leaf-600" /> {c.registro}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 txt-micro text-faint">
                        {c.telefono && (
                          <a href={`tel:${c.telefono}`} className="flex items-center gap-1 transition hover:text-ink">
                            <Phone size={10} /> {c.telefono}
                          </a>
                        )}
                        {c.correo && (
                          <a href={`mailto:${c.correo}`} className="flex min-w-0 items-center gap-1 transition hover:text-ink">
                            <Mail size={10} className="shrink-0" />
                            <span className="truncate">{c.correo}</span>
                          </a>
                        )}
                        {c.ciudad && (
                          <span className="flex items-center gap-1"><MapPin size={10} /> {c.ciudad}</span>
                        )}
                      </div>
                      {c.notas && <p className="mt-1 txt-micro text-muted">{c.notas}</p>}
                    </div>
                    <button
                      onClick={() => guardar(contactos.filter((x) => x.id !== c.id))}
                      aria-label={`Quitar ${c.nombre} de la libreta`}
                      className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-paper hover:text-solar-600 sm:min-h-9 sm:min-w-9"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-10 max-w-xl border-t border-line pt-4 txt-micro text-faint">
        Esto no es un mercado de instaladores. Publicar contactos para que otros los encuentren
        exige un servidor con altas verificadas, y esta aplicación no lo tiene: todo vive en este
        navegador.
      </p>

      {alta && (
        <Alta
          onClose={() => setAlta(false)}
          onSave={(c) => {
            guardar([...contactos, c]);
            setAlta(false);
          }}
        />
      )}
    </div>
  );
}

function Vacio({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-10 max-w-lg">
      <p className="text-muted">
        Empieza por el electricista responsable: es quien firma el plano y la conformidad de la
        instalación. La propuesta se genera sin él, pero sale marcada «sin asignar» hasta que lo
        elijas aquí.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm transition hover:border-ink"
      >
        <Plus size={15} /> Agregar el primero
      </button>
    </div>
  );
}

function Alta({ onClose, onSave }: { onClose: () => void; onSave: (c: Contacto) => void }) {
  const [f, setF] = useState<Partial<Contacto>>({ rol: "electricista" });
  const set = (k: keyof Contacto, v: string) => setF((p) => ({ ...p, [k]: v }));
  const listo = contactoValido(f);

  /*
   * Escape cierra, y el fondo también. Era el único diálogo de la aplicación que no lo hacía —el
   * resto sigue esta convención— así que quien lo abría sin querer tenía que buscar la X con el
   * ratón, y en un teléfono, con el teclado abierto tapando media pantalla, la X queda arriba.
   */
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 grid place-items-end bg-ink/25 p-0 sm:place-items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Agregar contacto a la libreta"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-card p-5 sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-medium">Agregar contacto</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-faint transition hover:text-ink sm:min-h-8 sm:min-w-8"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <Campo label="Nombre o empresa">
            <input
              autoFocus
              value={f.nombre ?? ""}
              onChange={(e) => set("nombre", e.target.value)}
              className="fld"
              aria-label="Nombre o empresa"
            />
          </Campo>

          <Campo label="Rol en la obra">
            <select
              value={f.rol}
              onChange={(e) => setF((p) => ({ ...p, rol: e.target.value as Rol }))}
              className="fld"
              aria-label="Rol en la obra"
            >
              {ROLES.map((r) => (
                <option key={r.clave} value={r.clave}>{r.nombre}</option>
              ))}
            </select>
            <p className="mt-1 txt-micro text-faint">
              {ROLES.find((r) => r.clave === f.rol)?.nota}
            </p>
          </Campo>

          {f.rol === "electricista" && (
            <Campo label="Registro o cédula">
              <input
                value={f.registro ?? ""}
                onChange={(e) => set("registro", e.target.value)}
                className="fld"
                aria-label="Registro o cédula"
              />
              <p className="mt-1 txt-micro text-faint">
                Se muestra junto al nombre para tenerlo a mano al firmar.
              </p>
            </Campo>
          )}

          <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <Campo label="Teléfono">
              <input
                value={f.telefono ?? ""}
                onChange={(e) => set("telefono", e.target.value)}
                className="fld"
                inputMode="tel"
                aria-label="Teléfono"
              />
            </Campo>
            <Campo label="Ciudad">
              <input
                value={f.ciudad ?? ""}
                onChange={(e) => set("ciudad", e.target.value)}
                className="fld"
                aria-label="Ciudad"
              />
            </Campo>
          </div>

          <Campo label="Correo">
            <input
              value={f.correo ?? ""}
              onChange={(e) => set("correo", e.target.value)}
              className="fld"
              inputMode="email"
              aria-label="Correo"
            />
          </Campo>

          <Campo label="Nota">
            <input
              value={f.notas ?? ""}
              onChange={(e) => set("notas", e.target.value)}
              className="fld"
              placeholder="disponible fines de semana, factura a 30 días…"
              aria-label="Nota"
            />
          </Campo>
        </div>

        <button
          disabled={!listo}
          onClick={() =>
            onSave({
              id: `c${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
              nombre: (f.nombre ?? "").trim(),
              rol: f.rol as Rol,
              telefono: f.telefono?.trim() || undefined,
              correo: f.correo?.trim() || undefined,
              ciudad: f.ciudad?.trim() || undefined,
              registro: f.registro?.trim() || undefined,
              notas: f.notas?.trim() || undefined,
              creadoEn: Date.now(),
            })
          }
          className="mt-5 min-h-11 w-full rounded-lg bg-solar-600 py-2.5 text-sm font-medium text-white transition hover:bg-solar-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {listo ? "Guardar en la libreta" : "Falta el nombre"}
        </button>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 txt-micro uppercase tracking-wide text-faint">{label}</div>
      {children}
    </div>
  );
}
