import { Sun, LayoutGrid, PanelsTopLeft, Users, Plus, Command, Home, HardDrive, Download } from "lucide-react";
import { useSyncExternalStore } from "react";
import { contarContactos, suscribir } from "../../lib/contactos";
import { instalar, sePuedeInstalar, suscribirInstalacion } from "../../lib/instalacion";

export type ViewKey = "inicio" | "proyectos" | "analisis" | "paneles" | "instaladores";

interface Props {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  onNew: () => void;
  onAviso: () => void;
  projectCount: number;
}

const NAV: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: "inicio", label: "Inicio", icon: <Home size={16} /> },
  { key: "proyectos", label: "Proyectos", icon: <LayoutGrid size={16} /> },
  { key: "paneles", label: "Módulos", icon: <PanelsTopLeft size={16} /> },
  { key: "instaladores", label: "Libreta", icon: <Users size={16} /> },
];

/**
 * Botón para instalar la aplicación en el dispositivo.
 *
 * Solo aparece cuando el navegador ha dicho que se puede: si ya está instalada, o si el navegador no
 * lo ofrece —Safari en iPhone instala desde su menú Compartir—, no se pinta nada. Un botón que no
 * hace nada es peor que ningún botón.
 *
 * Vale la pena tenerlo porque instalada abre a pantalla completa: en una azotea, la franja que se
 * come la barra de direcciones es justo la que hace falta para ver el techo y los controles.
 */
function Instalar() {
  const puede = useSyncExternalStore(suscribirInstalacion, sePuedeInstalar, () => false);
  if (!puede) return null;

  return (
    <button
      onClick={() => void instalar()}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-2 py-1.5 txt-mini font-medium text-muted transition hover:border-ink hover:text-ink"
    >
      <Download size={12} aria-hidden /> Instalar en este dispositivo
    </button>
  );
}

/**
 * Pie de la barra lateral.
 *
 * Aquí había un perfil escrito a mano —nombre, iniciales y cargo— sin ninguna sesión detrás: la app
 * no tiene cuentas. Era la última cosa fabricada del armazón.
 *
 * Lo que sí es verdad y además es lo más importante que el instalador debe saber: todo su trabajo
 * vive en el almacenamiento de ESTE navegador. Si lo borra o cambia de máquina, se pierde. Así que
 * el pie dice cuánto hay, dónde está, y ofrece la única acción que lo protege.
 *
 * El patrón viene de los pies de Proton y Skiff: estado del almacenamiento y una sola acción, no una
 * identidad.
 */
function Almacen({ projectCount, onNavigate, onAviso }: {
  projectCount: number;
  onNavigate: (v: ViewKey) => void;
  onAviso: () => void;
}) {
  // La barra no se desmonta nunca, así que leer al montar la dejaba atrasada en silencio cada vez
  // que se editaba la libreta. Ahora se suscribe: se entera del cambio en esta pestaña y en otras.
  const contactos = useSyncExternalStore(suscribir, contarContactos, () => 0);

  const piezas = [
    `${projectCount} ${projectCount === 1 ? "proyecto" : "proyectos"}`,
    contactos > 0 ? `${contactos} ${contactos === 1 ? "contacto" : "contactos"}` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-line px-2.5 py-2">
      <p className="flex items-center gap-1.5 txt-mini font-medium">
        <HardDrive size={12} className="shrink-0 text-faint" aria-hidden />
        {piezas.join(" · ")}
      </p>
      <p className="mt-1 txt-micro text-faint">
        Sólo en este navegador. Si borras sus datos, se pierde.
      </p>
      <button
        onClick={() => onNavigate("proyectos")}
        // La barra sólo existe desde `md`, así que aquí no hace falta el área táctil de 44 px:
        // el objetivo es de ratón. Lo que sí hacía falta era relleno, porque 15 px de alto es poco.
        className="-mx-1 mt-1 rounded px-1 py-1.5 txt-micro font-medium text-solar-600 underline decoration-line underline-offset-2 transition hover:bg-paper hover:decoration-solar-600"
      >
        Respaldar en un archivo
      </button>
      <button
        onClick={onAviso}
        className="mt-1 block rounded px-1 py-1 txt-micro text-faint underline decoration-line underline-offset-2 transition hover:bg-paper hover:text-muted"
      >
        Aviso de privacidad
      </button>
    </div>
  );
}

export default function Sidebar({ view, onNavigate, onNew, projectCount, onAviso }: Props) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-card md:flex">
      <div className="flex h-14 items-center gap-2 px-5">
        <Sun size={18} className="text-solar-500" strokeWidth={2.4} />
        <span className="font-serif text-lg">SolarMe</span>
      </div>

      <div className="px-3">
        <button
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus size={15} /> Nuevo análisis
        </button>
      </div>

      <nav className="mt-5 flex-1 px-3">
        <p className="px-2 pb-2 txt-mini font-semibold tracking-wider text-faint">ESPACIO DE TRABAJO</p>
        {NAV.map((n) => {
          const active = view === n.key || (n.key === "proyectos" && view === "analisis");
          return (
            <button
              key={n.key}
              onClick={() => onNavigate(n.key)}
              className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition ${
                active ? "bg-paper font-medium text-ink" : "text-muted hover:bg-paper hover:text-ink"
              }`}
            >
              <span className="flex items-center gap-2.5">{n.icon}{n.label}</span>
              {n.key === "proyectos" && projectCount > 0 && (
                <span className="rounded bg-line px-1.5 txt-mini tabular-nums text-muted">{projectCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <Almacen projectCount={projectCount} onNavigate={onNavigate} onAviso={onAviso} />
        <Instalar />
        <p className="mt-2 flex items-center gap-1 px-2.5 txt-mini text-faint">
          <Command size={11} /> K para buscar
        </p>
      </div>
    </aside>
  );
}
