import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Download, RotateCcw } from "lucide-react";
import { exportProjects, nombreArchivo } from "../lib/transfer";
import { loadProjects } from "../lib/storage";
import { leerContactos } from "../lib/contactos";
import { leerNegocio } from "../lib/negocio";
import { loadBosRates } from "../lib/bos";
import { loadQuotes } from "../lib/quotes";

/**
 * Límite de error de la aplicación.
 *
 * Por qué hace falta para vender esto: TODO el trabajo del instalador vive en el navegador
 * —proyectos, contornos, estorbos, cotizaciones, libreta de obra—. Sin este límite, cualquier
 * fallo de renderizado deja la página EN BLANCO. El instalador no ve un error: ve que su
 * cartera desapareció, en casa de un cliente, y no tiene forma de recuperarla porque la única
 * copia está en un almacén al que ya no puede llegar por la interfaz.
 *
 * Así que esto no es un mensaje de cortesía. Hace tres cosas concretas:
 *
 * 1. Dice que los datos NO se perdieron, porque es verdad: el fallo es de la interfaz, no del
 *    almacén, y `localStorage` sigue intacto.
 * 2. Ofrece descargar el respaldo AHÍ MISMO, leyendo del almacén sin pasar por el árbol de
 *    componentes que acaba de fallar. Es la salida que convierte un fallo en un susto.
 * 3. Permite volver a intentar sin recargar, para el caso —el más común— de un estado
 *    concreto que rompe una vista y no la aplicación entera.
 *
 * Se escribe como clase porque React solo ofrece captura de errores por clase; no hay
 * equivalente con ganchos.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  respaldado: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, respaldado: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Queda en la consola para que un fallo reproducible se pueda diagnosticar. No se envía a
    // ningún servidor: no hay backend y mandar datos de clientes a un tercero sin permiso
    // explícito del instalador sería peor que el propio fallo.
    console.error("SolarMe: fallo de interfaz", error, info.componentStack);
  }

  /** Descarga el respaldo leyendo del almacén, sin tocar el árbol que falló. */
  private respaldar = (): void => {
    try {
      const proyectos = loadProjects();
      // Se incluye la libreta: es trabajo del instalador igual que los proyectos, y este
      // respaldo puede ser el último que consiga si el fallo se repite. Y con ella lo que capturó
      // a mano —su identidad, su costo por watt y sus precios—, que también se pierde con el
      // navegador y no se puede recuperar de ninguna parte.
      const texto = exportProjects(proyectos, new Date(), leerContactos(), {
        negocio: leerNegocio(),
        bos: loadBosRates(),
        quotes: loadQuotes(),
      });
      const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivo();
      a.click();
      URL.revokeObjectURL(url);
      this.setState({ respaldado: true });
    } catch (e) {
      console.error("SolarMe: no se pudo respaldar tras el fallo", e);
    }
  };

  private reintentar = (): void => this.setState({ error: null, respaldado: false });

  render(): ReactNode {
    const { error, respaldado } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-lg rounded-2xl border border-line bg-card p-7">
          <span className="inline-flex items-center gap-2 text-solar-600">
            <AlertTriangle size={18} />
            <b className="text-sm font-semibold">Algo se rompió en la pantalla</b>
          </span>

          <p className="mt-3 text-sm leading-relaxed text-muted">
            <b className="font-semibold text-ink">Tu trabajo no se perdió.</b> Los proyectos, los
            contornos y la libreta siguen guardados en este navegador; lo que falló es la vista,
            no lo guardado.
          </p>

          <p className="mt-2 text-sm leading-relaxed text-muted">
            Antes de nada, descarga una copia. Así queda a salvo aunque haya que cerrar.
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={this.respaldar}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              <Download size={14} />
              {respaldado ? "Copia descargada · descargar otra" : "Descargar una copia"}
            </button>
            <button
              type="button"
              onClick={this.reintentar}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-paper"
            >
              <RotateCcw size={14} />
              Volver a intentar
            </button>
          </div>

          <p className="mt-5 border-t border-line pt-3 txt-micro text-faint">
            Si vuelve a pasar en el mismo sitio, recarga la página: casi siempre basta. El detalle
            técnico queda en la consola del navegador.
          </p>
        </div>
      </div>
    );
  }
}
