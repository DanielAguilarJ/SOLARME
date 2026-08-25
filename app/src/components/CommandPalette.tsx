import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, LayoutGrid, PanelsTopLeft, Users, MapPin, CornerDownLeft, ShieldCheck } from "lucide-react";
import type { ViewKey } from "./shell/Sidebar";
import type { Project } from "../lib/storage";

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onNavigate: (v: ViewKey) => void;
  onNew: () => void;
  onOpenProject: (p: Project) => void;
  onAviso: () => void;
}

interface Item { id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void }

export default function CommandPalette({ open, onClose, projects, onNavigate, onNew, onOpenProject, onAviso }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      { id: "new", label: "Nuevo análisis", hint: "acción", icon: <Plus size={15} />, run: onNew },
      { id: "v-proj", label: "Ir a Proyectos", hint: "vista", icon: <LayoutGrid size={15} />, run: () => onNavigate("proyectos") },
      { id: "v-pan", label: "Ir a Catálogo de módulos", hint: "vista", icon: <PanelsTopLeft size={15} />, run: () => onNavigate("paneles") },
      { id: "v-inst", label: "Ir a la libreta de la obra", hint: "vista", icon: <Users size={15} />, run: () => onNavigate("instaladores") },
      { id: "aviso", label: "Aviso de privacidad", hint: "acción", icon: <ShieldCheck size={15} />, run: onAviso },
      ...projects.slice(0, 8).map<Item>((p) => ({
        id: p.id, label: p.address, hint: p.city, icon: <MapPin size={15} />, run: () => onOpenProject(p),
      })),
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((i) => (i.label + " " + (i.hint ?? "")).toLowerCase().includes(needle));
  }, [q, projects, onNavigate, onNew, onOpenProject, onAviso]);

  useEffect(() => {
    if (!open) return;
    setQ(""); setSel(0);
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => { setSel(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && items[sel]) { e.preventDefault(); items[sel].run(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, sel, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Paleta de comandos">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-card shadow-[0_24px_70px_-20px_rgba(0,0,0,.35)]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={16} className="shrink-0 text-faint" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar proyectos, vistas y acciones…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
          <kbd className="rounded border border-line px-1.5 py-0.5 txt-micro text-faint">ESC</kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-faint">Sin resultados</li>}
          {items.map((i, idx) => (
            <li key={i.id}>
              <button
                onMouseEnter={() => setSel(idx)}
                onClick={() => { i.run(); onClose(); }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  idx === sel ? "bg-paper" : ""}`}
              >
                <span className="text-muted">{i.icon}</span>
                <span className="min-w-0 flex-1 truncate">{i.label}</span>
                {i.hint && <span className="shrink-0 txt-mini text-faint">{i.hint}</span>}
                {idx === sel && <CornerDownLeft size={13} className="shrink-0 text-faint" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
