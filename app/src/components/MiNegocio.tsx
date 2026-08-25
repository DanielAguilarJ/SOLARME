import { useEffect, useState } from "react";
import { X, Building2, AlertTriangle, Check } from "lucide-react";
import {
  faltaParaAviso,
  guardarNegocio,
  leerNegocio,
  type Negocio,
} from "../lib/negocio";

/**
 * Los datos del negocio del instalador.
 *
 * Se piden una vez y sirven para las dos cosas que los necesitan:
 *
 *   · la propuesta que entrega al cliente, que salía con el nombre de la herramienta y ningún dato
 *     suyo, de modo que el cliente no sabía a quién llamar;
 *   · el aviso de privacidad, que por ley tiene que decir quién responde por los datos, con
 *     domicilio y un medio de contacto.
 *
 * Ningún campo es obligatorio a propósito: quien solo quiere ver un cálculo no debería rellenar una
 * ficha de empresa antes de empezar. Lo que falte se declara como falta, en la propia pantalla y en
 * el aviso, en vez de dejar un hueco silencioso.
 *
 * Sigue la convención de modal de la aplicación: cierra con Escape, con el fondo y con la X, y se
 * anuncia como diálogo.
 */
export default function MiNegocio({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<Negocio>(leerNegocio);
  const [guardado, setGuardado] = useState(false);
  const [fallo, setFallo] = useState(false);

  // El efecto va antes de cualquier retorno: un hook detrás de un return temprano rompe la regla
  // de los hooks y el lint aborta la compilación.
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onClose]);

  const set = (k: keyof Negocio) => (v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setGuardado(false);
  };

  const guardar = () => {
    const ok = guardarNegocio(form);
    setFallo(!ok);
    setGuardado(ok);
  };

  const falta = faltaParaAviso(form);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Datos de mi negocio"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-card shadow-[0_24px_60px_rgba(0,0,0,.16)] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-serif text-xl tracking-tight">
              <Building2 size={17} className="text-muted" aria-hidden /> Mi negocio
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Con esto la propuesta sale con tu nombre y tu contacto, y el aviso de privacidad queda
              completo.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted transition hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-3 overflow-y-auto px-6 py-5">
          <Campo
            etiqueta="Nombre o razón social"
            valor={form.nombre}
            onChange={set("nombre")}
            ejemplo="Solar del Bajío S.A. de C.V."
          />
          <Campo
            etiqueta="Domicilio"
            valor={form.domicilio}
            onChange={set("domicilio")}
            ejemplo="Av. López Mateos 1200, León, Guanajuato"
            nota="Lo pide el aviso de privacidad."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etiqueta="Teléfono"
              valor={form.telefono}
              onChange={set("telefono")}
              ejemplo="477 123 4567"
              tipo="tel"
            />
            <Campo
              etiqueta="Correo"
              valor={form.correo}
              onChange={set("correo")}
              ejemplo="contacto@tunegocio.mx"
              tipo="email"
            />
          </div>
          <Campo
            etiqueta="Registro o licencia"
            valor={form.registro}
            onChange={set("registro")}
            ejemplo="CFE-GD-2024-0192"
            nota="Opcional. Si lo pones, aparece en la propuesta."
          />

          {falta.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-solar-500/40 bg-solar-500/10 px-3 py-2 txt-mini leading-relaxed">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-solar-600" aria-hidden />
              <span>
                Para que el aviso de privacidad quede completo{" "}
                {falta.length === 1 ? `falta el ${falta[0]}` : `faltan: ${lista(falta)}`}. La
                propuesta funciona igual con lo que ya pusiste.
              </span>
            </p>
          )}

          {fallo && (
            <p className="rounded-lg border border-solar-500/40 bg-solar-500/10 px-3 py-2 txt-mini leading-relaxed">
              <b className="font-semibold">No se pudo guardar.</b> El almacenamiento de este
              navegador rechazó la escritura, así que estos datos no quedaron. Suele ser falta de
              espacio o el modo privado.
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-4">
          <p className="txt-mini text-faint">Se guarda en este navegador, como el resto.</p>
          <button
            onClick={guardar}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white transition hover:opacity-90"
          >
            {guardado ? <Check size={14} aria-hidden /> : null}
            {guardado ? "Guardado" : "Guardar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Enumera en español: «a, b y c». Con la coma seca queda como una lista de sistema. */
function lista(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

function Campo({
  etiqueta,
  valor,
  onChange,
  ejemplo,
  nota,
  tipo = "text",
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  ejemplo: string;
  nota?: string;
  tipo?: string;
}) {
  return (
    <label className="block">
      <span className="block txt-mini font-medium text-muted">{etiqueta}</span>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ejemplo}
        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm outline-none transition focus:border-ink"
      />
      {nota && <span className="mt-1 block txt-micro text-faint">{nota}</span>}
    </label>
  );
}
