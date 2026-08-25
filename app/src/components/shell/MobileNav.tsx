import { LayoutGrid, PanelsTopLeft, Users, Plus } from "lucide-react";
import type { ViewKey } from "./Sidebar";

interface Props {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  onNew: () => void;
}

const TABS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: "proyectos", label: "Proyectos", icon: <LayoutGrid size={19} /> },
  { key: "paneles", label: "Módulos", icon: <PanelsTopLeft size={19} /> },
  { key: "instaladores", label: "Libreta", icon: <Users size={19} /> },
];

/** Navegación inferior para móvil: la barra lateral se oculta por debajo de md. */
export default function MobileNav({ view, onNavigate, onNew }: Props) {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {TABS.map((t) => {
        const active = view === t.key || (t.key === "proyectos" && view === "analisis");
        return (
          <button
            key={t.key}
            onClick={() => onNavigate(t.key)}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 txt-mini transition ${
              active ? "text-ink" : "text-faint"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
      <button
        onClick={onNew}
        aria-label="Nuevo análisis"
        className="min-h-11 flex flex-1 flex-col items-center gap-0.5 py-2.5 txt-mini text-solar-600"
      >
        <Plus size={19} />
        Nuevo
      </button>
    </nav>
  );
}
