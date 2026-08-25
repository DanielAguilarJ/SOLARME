import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Download, Plus, WifiOff } from "lucide-react";
import Sidebar, { type ViewKey } from "./components/shell/Sidebar";
import Topbar from "./components/shell/Topbar";
import MobileNav from "./components/shell/MobileNav";
import NewAnalysisDialog from "./components/NewAnalysisDialog";
import { resolveSite, type ResolucionOrigen, type PrecisionPunto } from "./lib/geocode";
import { cargarCarteraSegura, fusionar } from "./lib/transfer";
import { hayConexion, observarConexion } from "./lib/offline";
import CommandPalette from "./components/CommandPalette";
import AvisoPrivacidad from "./components/AvisoPrivacidad";
import MiNegocio from "./components/MiNegocio";
import MapaUbicacion from "./components/MapaUbicacion";
import { nearestSite } from "./lib/site";
import ProjectsView from "./views/ProjectsView";
import HomeView from "./views/HomeView";
import AnalysisView from "./views/AnalysisView";
import Catalog from "./components/Catalog";
import Installers from "./components/Installers";
import { AREA_INICIAL, CITIES, designForNewAddress, matchCity, cityOfProject, optTiltFor, type Design, type Panel, type ProjectType } from "./lib/solar";
import { MAX_NOTA,
  addProject, removeProject, replaceProjects, newId, guardadoFallo, suscribirGuardado,
  type Project,
} from "./lib/storage";
import panelsData from "./data/panels.json";
import { enrichPanels, modulePrice } from "./lib/price";
import {
  loadQuotes, setQuote, clearQuote, clearAllQuotes, type Quotes,
} from "./lib/quotes";
import { loadBosRates, setBos, clearBos, bosFor, type BosRates } from "./lib/bos";

// Sin `as unknown as`: ese casteo era justo lo que impedía al compilador ver que el catálogo
// no traía precio. enrichPanels calcula el MXN/Wp y su procedencia en un único punto.
const RAW = panelsData.panels;
const FALLBACK: Panel = {
  brand: "LONGi", model: "Hi-MO 6 555W", w: 555, eff: 22.6,
  temp: -0.29, area: 2.57, voc: 49.9, vmp: 41.8, isc: 14.0, imp: 13.2, betaVoc: -0.125, ppw: 5.2, priceOrigin: "banda", warr: null,
};

export default function App() {
  const [quotes, setQuotes] = useState<Quotes>(() => loadQuotes());

  // El precio de cada módulo se resuelve en un solo punto: banda de mercado por gama, salvo
  // que el instalador haya capturado su costo real para esa marca.
  const panels = useMemo(() => {
    const list = enrichPanels(RAW, quotes) as Panel[];
    return list.length ? list : [FALLBACK];
  }, [quotes]);

  const putQuote = useCallback((brand: string, v: number) => {
    setQuotes((q) => setQuote(q, brand, v));
  }, []);
  const dropQuote = useCallback((brand: string) => {
    setQuotes((q) => clearQuote(q, brand));
  }, []);
  const dropAllQuotes = useCallback(() => setQuotes(clearAllQuotes()), []);

  // Tarifa del resto del sistema. Es un costo de la operación del instalador, así que vive
  // fuera del proyecto y se aplica a todos los análisis del mismo tipo.
  const [bosRates, setBosRates] = useState<BosRates>(() => loadBosRates());
  const putBos = useCallback((type: ProjectType, v: number) => {
    setBosRates((r) => setBos(r, type, v));
  }, []);
  const dropBos = useCallback((type: ProjectType) => {
    setBosRates((r) => clearBos(r, type));
  }, []);

  const [view, setView] = useState<ViewKey>("inicio");
  // Si el almacén dejó de aceptar escrituras. Se escucha en vez de comprobarlo tras cada
  // mutación, para que se entere sin importar qué función provocó el fallo.
  const noGuarda = useSyncExternalStore(suscribirGuardado, guardadoFallo, () => false);
  // Se carga con la MISMA validación que un respaldo importado. Con `loadProjects` a secas, un
  // proyecto malformado en el almacén entraba en el estado y rompía el renderizado; y con el
  // límite de error puesto eso deja al instalador encerrado, porque «volver a intentar» vuelve a
  // leer la misma entrada mala.
  // Se lee UNA vez y se conserva también cuántos proyectos se descartaron por estar dañados.
  // Quedarse solo con la lista era dejar el arreglo a medias: un proyecto corrupto desaparecía de
  // la cartera y el instalador nunca se enteraba, que es el mismo fallo silencioso que este
  // trabajo lleva cerrando. Un proyecto perdido sin aviso es peor que un error a la cara.
  const [carteraInicial] = useState(cargarCarteraSegura);
  const [projects, setProjects] = useState<Project[]>(carteraInicial.proyectos);
  const [avisoDescartados, setAvisoDescartados] = useState(carteraInicial.descartados > 0);
  const [dialog, setDialog] = useState(false);
  const [palette, setPalette] = useState(false);
  const [aviso, setAviso] = useState(false);
  // Los datos del negocio: los usa la propuesta y completan el aviso de privacidad.
  const [negocio, setNegocio] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const [saved, setSaved] = useState(false);

  const [address, setAddress] = useState("");
  /** Cómo se resolvió la física de esta dirección. Se guarda aparte del diseño porque no
   * es física: es la procedencia de la física, y la pantalla tiene que declararla. */
  /** Sin señal la app sigue sirviendo: la física, el catálogo y los proyectos viven en el
   * equipo. Solo la geocodificación de direcciones nuevas necesita red, y conviene decirlo
   * antes de que el instalador crea que algo se rompió.
   *
   * El aviso se basa en EVIDENCIA y no solo en `navigator.onLine`, que dice que hay una
   * interfaz de red y no que haya internet del otro lado —y que además vuelve a reportar
   * `true` al recargar una página servida por el trabajador de servicio—. Una petición que de
   * verdad falló por red es prueba; la promesa del navegador es un indicio. */
  const [navOnline, setNavOnline] = useState(hayConexion);
  const [falloRed, setFalloRed] = useState(false);
  useEffect(() => observarConexion((v) => {
    setNavOnline(v);
    if (v) setFalloRed(false); // volvió la interfaz: se le da otra oportunidad
  }), []);
  const enLinea = navOnline && !falloRed;

  const [resolucion, setResolucion] = useState<{
    origen: ResolucionOrigen; km?: number; cerca?: string; buscando?: boolean;
    motivo?: import("./lib/geocode").GeoEstado;
    /** Nombre completo que devolvió el servicio. Se guarda para MOSTRARLO: el campo existe
     *  «para que el instalador confirme» y hasta ahora se descartaba aquí, así que una
     *  dirección resuelta a otro municipio pasaba callada a la cotización. */
    encontrado?: string;
    /** Hasta dónde llegó la ubicación: edificio, calle o localidad. */
    precision?: PrecisionPunto;
  }>({ origen: "catalogo" });
  const [city, setCity] = useState("");
  // El diseño inicial se DERIVA de la física medida. Estaba escrito a mano con
  // `yield: 1760` y `tilt: 17`, o sea la constante inventada y la inclinación de la
  // fórmula corta: el arranque de la app contradecía a su propio modelo.
  const [design, setDesign] = useState<Design>(() => {
    const c = CITIES.cdmx;
    return {
      site: c.site, lat: c.lat, lng: c.lng, yield: c.yield,
      area: AREA_INICIAL, tilt: optTiltFor(c), az: 180, shade: 0, type: "res", panel: panels[0],
    };
  });

  // ⌘K abre la paleta de comandos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Arranca el análisis sin esperar a la red.
   *
   * Primero resuelve por nombre, que es instantáneo y exacto para las ciudades medidas, y
   * muestra la pantalla de inmediato. Solo si el nombre no casó se geocodifica en segundo
   * plano y, cuando llega, la física sube del promedio nacional al sitio medido más
   * cercano. Bloquear la interfaz por una llamada de un segundo sería peor: el instalador
   * está frente al cliente.
   */
  // El instalador movió el pin a su techo. Un punto confirmado a mano es de fiar como «edificio»,
  // aunque el geocodificador solo hubiera llegado a la calle: recalcula el sitio medido más
  // cercano y la física desde ahí, igual que la rama «cercano» del análisis automático.
  const confirmarUbicacion = useCallback((lat: number, lng: number) => {
    const { site, km } = nearestSite(lat, lng);
    const city = { lat, lng, yield: site.rendimiento, name: site.nombre, site };
    setDesign((s) => ({ ...s, site, lat, lng, yield: site.rendimiento, tilt: optTiltFor(city) }));
    setCity(`${site.nombre} · referencia a ${Math.round(km)} km`);
    setResolucion({
      origen: "cercano", km, cerca: site.nombre, buscando: false,
      encontrado: "Punto ajustado a mano sobre el mapa", precision: "edificio",
    });
    setAjustando(false);
  }, []);

  const startAnalysis = useCallback((addr: string) => {
    const m = matchCity(addr);
    setAddress(addr);
    setCity(m.city.name);
    setDesign((s) => designForNewAddress(s, m.city));
    setResolucion({
      origen: m.matched ? "catalogo" : "promedio",
      buscando: !m.matched || m.debil,
    });
    setSaved(false);
    setView("analisis");

    // Una coincidencia FUERTE es definitiva: el instalador nombró una ciudad medida. Una DÉBIL
    // vino del último segmento, donde va el estado, así que hay que intentar ubicar el domicilio
    // de verdad. Aquí estaba el cableado que faltaba: `resolveSite` ya sabía distinguirlas, pero
    // este `return` se disparaba con cualquier coincidencia y no lo llamaba nunca. Se vio en el
    // navegador —«Fortín de las Flores, Veracruz» seguía usando Veracruz puerto— no leyendo el
    // código.
    if (m.matched && !m.debil) return;
    let vigente = true;
    resolveSite(addr)
      .then((r) => {
        // Una respuesta que llega después de que el efecto se limpió es de otra dirección: se
        // descarta sin tocar el estado. Antes caía en la rama de abajo y pisaba con «promedio» lo
        // que ya había resuelto una búsqueda más nueva.
        if (!vigente) return;

        // `resolveSite` puede devolver «catalogo» con motivo: la coincidencia era débil, no se
        // pudo ubicar el domicilio y se queda con la ciudad del nombre escrito. Eso NO es el
        // promedio nacional —la física que se está usando es la de esa ciudad— así que declararlo
        // como promedio hacía que la interfaz dijera «promedio de 102 ciudades» mientras los
        // números venían de una sola. Y de paso dejaba inalcanzable el aviso de PhysicsSource que
        // explica justo este caso.
        if (r.origen === "catalogo") {
          setResolucion({ origen: "catalogo", buscando: false, motivo: r.motivo });
          if (r.motivo === "sin-red") setFalloRed(true);
          return;
        }

        if (r.origen !== "cercano") {
          setResolucion({ origen: "promedio", buscando: false, motivo: r.motivo });
          if (r.motivo === "sin-red") setFalloRed(true);
          return;
        }
        setDesign((s) => ({
          ...s, site: r.city.site, lat: r.city.lat, lng: r.city.lng, yield: r.city.yield,
          tilt: optTiltFor(r.city),
        }));
        // el subtítulo también sube: seguía diciendo "México (estimado)" mientras el
        // bloque de abajo ya declaraba que la física viene de otra ciudad
        setCity(`${r.city.name} · referencia a ${Math.round(r.km!)} km`);
        setFalloRed(false); // llegó una respuesta: hay red
        setResolucion({
          origen: "cercano", km: r.km, cerca: r.city.name, buscando: false,
          encontrado: r.punto?.descripcion, precision: r.precision,
        });
      })
      .catch(() => setResolucion({ origen: "promedio", buscando: false, motivo: "sin-red" }));
    return () => { vigente = false; };
  }, []);

  const patchDesign = useCallback((patch: Partial<Design>) => {
    setDesign((s) => ({ ...s, ...patch }));
    setSaved(false);
  }, []);

  const saveProject = useCallback(() => {
    const p: Project = {
      id: newId(), address, city, design, createdAt: Date.now(), status: "borrador",
    };
    setProjects((list) => addProject(list, p));
    setSaved(true);
  }, [address, city, design]);

  /** Restaura proyectos de un respaldo. Los ids repetidos NO se sobrescriben: son el mismo
   * proyecto, y reemplazar el trabajo local con una copia vieja del archivo sería la peor
   * variante posible. */
  const importProjectsInto = useCallback((entrantes: Project[]) => {
    let resultado = { agregados: 0, repetidos: 0 };
    setProjects((actuales) => {
      const r = fusionar(actuales, entrantes);
      resultado = { agregados: r.agregados, repetidos: r.repetidos };
      // `replaceProjects` DEVUELVE la lista despojada —`paraGuardar` le quita `site` y `bosPerW`
      // antes de escribir—, así que usar su retorno como estado le quitaba a TODOS los proyectos
      // la física medida y el costo BOS capturado, en memoria. Los números de la cartera cambiaban
      // solos. Se persiste con ella y se conserva la lista completa.
      replaceProjects(r.lista);
      return r.lista;
    });
    return resultado;
  }, []);

  const openProject = useCallback((p: Project) => {
    setAddress(p.address);
    setCity(p.city);
    // El precio del módulo NO se restaura de almacenamiento: se vuelve a calcular con el modelo
    // vigente. Un proyecto guardado antes del cambio de moneda traía `ppw: 0.34` —el valor viejo
    // en dólares— y al abrirlo revivía ese precio inventado, dejando los módulos en el 3 % del
    // costo instalado. La identidad del módulo (marca y modelo) es durable; su precio no.
    setDesign((prev) => {
      void prev;
      const fresh = modulePrice(
        p.design.panel.brand,
        p.design.panel.eff,
        quotes[p.design.panel.brand.toLowerCase()]
      );
      // La física del sitio tampoco se restaura. Un proyecto guardado antes de medir
      // traía `yield: 1760` —una constante inventada, y además con las pérdidas de
      // sistema ya dentro, que el modelo volvía a descontar— y ningún sitio medido. La
      // dirección es durable; el rendimiento y la forma estacional no.
      const ciudad = cityOfProject(p).city;
      return {
        ...p.design,
        site: ciudad.site,
        yield: ciudad.yield,
        panel: { ...p.design.panel, ppw: fresh.mxnPerWp, priceOrigin: fresh.origin },
      };
    });
    setSaved(true);
    setView("analisis");
  }, [quotes]);

  const crumbs =
    view === "analisis" ? ["Proyectos", address || "Análisis"]
    : view === "paneles" ? ["Catálogo de módulos"]
    : view === "instaladores" ? ["Libreta"]
    : view === "proyectos" ? ["Proyectos"]
    : ["Inicio"];

  return (
    <div className="flex min-h-screen">
      <Sidebar view={view} onNavigate={setView} onNew={() => setDialog(true)} projectCount={projects.length} onAviso={() => setAviso(true)} onNegocio={() => setNegocio(true)} />

      <main className="min-w-0 flex-1 pb-16 md:pb-0">
        {/* Proyectos que no se pudieron leer. Es un aviso de una sola vez y se puede cerrar,
            porque puede que no haya respaldo que importar y entonces no hay nada más que hacer;
            lo que no puede pasar es que la pérdida ocurra sin decirlo. */}
        {avisoDescartados && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-solar-500/40 bg-solar-500/10 px-6 py-2.5 txt-mini">
            <AlertTriangle size={13} className="shrink-0 text-solar-600" />
            <span className="text-muted">
              <span className="font-medium text-ink">
                {carteraInicial.descartados === 1
                  ? "Un proyecto guardado estaba dañado y no se pudo abrir."
                  : `${carteraInicial.descartados} proyectos guardados estaban dañados y no se pudieron abrir.`}
              </span>{" "}
              No se pueden reparar desde aquí. Si tienes un respaldo, impórtalo en la cartera.
            </span>
            <button
              type="button"
              onClick={() => setView("proyectos")}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-white transition hover:opacity-90"
            >
              Ir a la cartera
            </button>
            <button
              type="button"
              onClick={() => setAvisoDescartados(false)}
              className="inline-flex min-h-8 items-center rounded-lg px-2 py-1.5 text-muted underline decoration-line underline-offset-2 transition hover:text-ink"
            >
              Entendido
            </button>
          </div>
        )}

        {/* Franja de guardado fallido. Va ARRIBA de la de sin conexión porque es peor: sin
            conexión la app funciona igual, pero sin espacio el trabajo NO se está guardando y el
            instalador lo cree guardado porque lo ve en pantalla. Antes el fallo se ignoraba en
            silencio y se perdía todo al cerrar la pestaña. */}
        {noGuarda && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-solar-500/40 bg-solar-500/10 px-6 py-2.5 txt-mini">
            <AlertTriangle size={13} className="shrink-0 text-solar-600" />
            <span className="text-muted">
              <span className="font-medium text-ink">No se está guardando en este navegador.</span>{" "}
              Tu trabajo sigue en pantalla, pero se perderá al cerrar. Suele ser falta de espacio o
              el modo privado.
            </span>
            <button
              type="button"
              // Lleva a donde ya vive la exportación, igual que el enlace de la barra lateral. Una
              // tercera implementación del respaldo sería una tercera que se desvía.
              onClick={() => setView("proyectos")}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-white transition hover:opacity-90"
            >
              <Download size={12} /> Ir a respaldar
            </button>
          </div>
        )}

        {/* Franja de sin conexión. No es una disculpa: dice qué SÍ funciona, que es casi todo,
            porque la física, el catálogo y los proyectos viven en el equipo. Lo único que
            necesita red es ubicar una dirección nueva que no esté en el catálogo. */}
        {!enLinea && (
          <div className="flex items-start gap-2 border-b border-solar-500/30 bg-solar-500/5 px-6 py-2 txt-mini text-muted">
            <WifiOff size={13} className="mt-0.5 shrink-0 text-solar-600" />
            <span>
              <span className="font-medium text-ink">Sin conexión.</span> Todo sigue funcionando:
              la física de las {" "}
              ciudades medidas, el catálogo de módulos y tus proyectos están en este equipo. Solo
              ubicar un domicilio que no esté en el catálogo necesita señal.
            </span>
          </div>
        )}
        <Topbar
          crumbs={crumbs}
          onSearch={() => setPalette(true)}
          actions={
            <button onClick={() => setDialog(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 md:hidden">
              <Plus size={14} /> Nuevo
            </button>
          }
        />

        {view === "inicio" && (
          <HomeView projects={projects} onNew={() => setDialog(true)} onOpen={openProject} onNavigate={setView} />
        )}

        {view === "proyectos" && (
          <ProjectsView
            projects={projects}
            onOpen={openProject}
            onDelete={(id) => setProjects((l) => removeProject(l, id))}
            // El estado del embudo se persiste igual que el resto: `replaceProjects` escribe la
            // lista completa, así que el cambio sobrevive a recargar el navegador.
            onStatus={(id, status) =>
              setProjects((l) => {
                const next = l.map((p) => (p.id === id ? { ...p, status } : p));
                // Persiste despojado, memoria completa: ver la nota de `importProjectsInto`.
                replaceProjects(next);
                return next;
              })
            }
            onNota={(id, nota) =>
              setProjects((l) => {
                // Se recorta y se quita si queda vacía: guardar una cadena en blanco haría que la
                // fila mostrara una nota que no dice nada en lugar de la invitación a escribirla.
                const limpia = nota.trim().slice(0, MAX_NOTA);
                const next = l.map((p) =>
                  p.id === id ? { ...p, ...(limpia ? { nota: limpia } : { nota: undefined }) } : p,
                );
                replaceProjects(next);
                return next;
              })
            }
            onNew={() => setDialog(true)}
            onImport={importProjectsInto}
          />
        )}

        {view === "analisis" && address && (
          <AnalysisView
            address={address} city={city}
            // La tarifa del resto del sistema se resuelve aquí y entra al diseño, así el modelo
            // económico recibe un solo número ya decidido.
            design={{ ...design, bosPerW: bosFor(bosRates, design.type) }}
            onChange={patchDesign} onSave={saveProject} saved={saved}
            bosRates={bosRates} onSetBos={putBos} onClearBos={dropBos}
            resolucion={resolucion}
            onAjustarUbicacion={() => setAjustando(true)}
          />
        )}

        {view === "analisis" && !address && (
          <div className="px-6 py-24 text-center text-sm text-muted">
            No hay un análisis abierto.{" "}
            <button onClick={() => setDialog(true)} className="font-medium text-ink underline">
              Empieza uno nuevo
            </button>
          </div>
        )}

        {view === "paneles" && (
          <Catalog
            site={design.site}
            panels={panels}
            roof={{
              area: design.area, lat: design.lat, tilt: design.tilt,
              az: design.az, shade: design.shade, yield: design.yield,
            }}
            quotes={quotes}
            onSetQuote={putQuote}
            onClearQuote={dropQuote}
            onClearAllQuotes={dropAllQuotes}
            onPick={(p) => { patchDesign({ panel: p }); if (address) setView("analisis"); }}
            sourceLabel={`Catálogo real: ${panelsData.count} módulos de ${panelsData.source}. El precio es banda de mercado en MXN/Wp salvo que captures el tuyo.`}
          />
        )}

        {view === "instaladores" && <Installers />}
      </main>

      <NewAnalysisDialog open={dialog} onClose={() => setDialog(false)} onSubmit={startAnalysis} />
      {aviso && <AvisoPrivacidad onClose={() => setAviso(false)} />}
      {negocio && <MiNegocio onClose={() => setNegocio(false)} />}
      {ajustando && (
        <MapaUbicacion
          lat={design.lat}
          lon={design.lng}
          onConfirm={confirmarUbicacion}
          onCancel={() => setAjustando(false)}
        />
      )}
      <MobileNav view={view} onNavigate={setView} onNew={() => setDialog(true)} />
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        projects={projects}
        onNavigate={(v) => setView(v)}
        onNew={() => setDialog(true)}
        onOpenProject={openProject}
        onAviso={() => setAviso(true)}
        onNegocio={() => setNegocio(true)}
      />
    </div>
  );
}
