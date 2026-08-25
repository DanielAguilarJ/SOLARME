import { ChevronRight, Search } from "lucide-react";

interface Props {
  crumbs: string[];
  onSearch: () => void;
  actions?: React.ReactNode;
}

export default function Topbar({ crumbs, onSearch, actions }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-line bg-paper/90 px-6 backdrop-blur">
      <nav className="flex min-w-0 items-center gap-1.5 text-sm">
        {/* En pantalla angosta se muestra SOLO el nivel actual. El envoltorio llevaba `min-w-0`
            con un texto `shrink-0` dentro: se encogía por debajo de su contenido y el texto se
            derramaba encima del siguiente nivel, que en un teléfono se leía como
            "ProyectosAv. Reforma 100…" pegado y sin separador. */}
        {crumbs.map((c, i) => {
          const ultimo = i === crumbs.length - 1;
          return (
            <span
              key={c + i}
              className={`items-center gap-1.5 ${ultimo ? "flex min-w-0" : "hidden shrink-0 sm:flex"}`}
            >
              {i > 0 && <ChevronRight size={14} className="hidden shrink-0 text-faint sm:block" />}
              <span className={ultimo ? "truncate font-medium text-ink" : "text-muted"}>{c}</span>
            </span>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onSearch}
          aria-label="Buscar"
          className="grid h-11 w-11 place-items-center rounded-lg border border-line text-muted transition hover:border-ink hover:text-ink sm:h-8 sm:w-8"
        >
          <Search size={15} />
        </button>
        {actions}
      </div>
    </header>
  );
}
