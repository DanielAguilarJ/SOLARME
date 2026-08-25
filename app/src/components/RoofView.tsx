import { useRef, useState } from "react";
import { CELDA_M, ETIQUETA_OBSTACULO, type Obstacle, type ShadingResult } from "../lib/shading";
import type { LayoutResult } from "../lib/layout";
import { aMetros, metrosAPixeles, type Esquinas } from "../lib/projection";
import { caja, type Punto } from "../lib/polygon";

export type RoofLayer = "sat" | "flux" | "shade";

interface Props {
  az: number;
  layer: RoofLayer;
  /** Lado del cuadrado equivalente del techo, en metros. */
  side: number;
  /** Posiciones reales de los módulos que salen del cálculo. */
  placement: LayoutResult;
  /** Sombra calculada, cuando el instalador capturó estorbos. */
  shading?: ShadingResult;
  obstacles: Obstacle[];
  /** Porcentaje estimado del deslizador, para cuando no hay estorbos capturados. */
  shade: number;
  /** Mover un estorbo. Sin este manejador el plano es de solo lectura. */
  onMoveObstacle?: (id: string, x: number, y: number) => void;
  /** Contorno del techo en metros: el dibujado o el cuadrado supuesto. */
  outline: Punto[];
  /** `true` si el contorno lo trazó el instalador. */
  outlineMedido: boolean;
  /** `true` si el contorno dibujado no se puede usar. */
  outlineInvalido?: boolean;
  /** Mover un vértice del contorno. Sin este manejador el contorno no se edita. */
  onMoveVertex?: (i: number, x: number, y: number) => void;
  /** Insertar un vértice después del índice dado. Sin esto no se puede trazar una azotea en
   * L: con cuatro vértices fijos solo se deforma un cuadrilátero. */
  onAddVertex?: (despuesDe: number, x: number, y: number) => void;
  /** Quitar un vértice. Nunca por debajo de tres, que es lo que encierra superficie. */
  onDeleteVertex?: (i: number) => void;
}

/** Cuánto avanza un estorbo con cada flecha del teclado, en metros. Arrastrar con el ratón
 * es cómodo pero no puede ser el único camino: media azotea se coloca con el teclado. */
const PASO_TECLA = 0.25;

/** Rampa de color para el mapa de irradiación (azul frío → amarillo cálido). */
const FLUX = ["#3b4a6b", "#4a6b8a", "#7d9a7a", "#c9b45c", "#e8a33d", "#f4842c"];

const COLOR_OBSTACULO: Record<string, string> = {
  tinaco: "#6b7280", chimenea: "#57534e", pretil: "#78716c",
  arbol: "#4d7c4a", edificio: "#52525b", otro: "#6b7280",
};

/**
 * Vista aérea del techo con la proyección de módulos.
 *
 * Las posiciones NO son decorativas: vienen de `placement`, el mismo cálculo del que sale
 * el número de módulos que se cotiza. Antes el dibujo era una rejilla genérica que podía
 * quedar encima del tinaco, o sea una contradicción visual entre el plano y el presupuesto.
 *
 * El sistema de coordenadas del modelo —metros desde la esquina suroeste, x al oriente,
 * y al norte— se proyecta al cuadrilátero con interpolación bilineal. Eso conserva la
 * perspectiva del dibujo sin mentir sobre dónde está cada cosa.
 */
export default function RoofView({
  az, layer, side, placement, shading, obstacles, shade, onMoveObstacle,
  outline, outlineMedido, outlineInvalido, onMoveVertex, onAddVertex, onDeleteVertex,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  /** Posición temporal mientras se arrastra. El modelo NO se recalcula en cada movimiento:
   * la sombra recorre cada celda contra cada hora del año, y hacerlo sesenta veces por
   * segundo daría tirones. Se mueve el dibujo y al soltar se confirma. */
  const [arrastre, setArrastre] = useState<{ id: string; x: number; y: number } | null>(null);
  /** El foco se lleva en estado y no con un selector de CSS sobre el SVG: un aro de foco que
   * depende de `:focus` en un elemento `g` no se comporta igual en todos los navegadores, y
   * un foco invisible deja el plano inutilizable con teclado. */
  const [enfocado, setEnfocado] = useState<string | null>(null);
  /** Vértice del contorno que se está arrastrando. */
  const [vertice, setVertice] = useState<number | null>(null);
  const W = 640, H = 440;
  const rx = 96, ry = 66, rw = 448, rh = 300;

  // Vista en planta a escala uniforme, no en perspectiva. La perspectiva era decorativa y
  // con un contorno real distorsiona la forma: una azotea de 13.5 × 2 m se vería casi
  // cuadrada, que es exactamente la mentira que este trabajo vino a quitar. Un instalador
  // lee un plano, no un render.
  const cj = caja(outline);
  const anchoM = Math.max(cj.ancho, 0.001);
  const fondoM = Math.max(cj.alto, 0.001);
  const escala = Math.min(rw / anchoM, rh / fondoM);
  const dibujoW = anchoM * escala;
  const dibujoH = fondoM * escala;
  const x0 = rx + (rw - dibujoW) / 2;
  const y0 = ry + (rh - dibujoH) / 2;

  // rectángulo con la proporción real: es un cuadrilátero degenerado, así que la misma
  // interpolación bilineal (y su inversa, ya probada) sigue valiendo.
  const NO = { x: x0, y: y0 };
  const NE = { x: x0 + dibujoW, y: y0 };
  const SE = { x: x0 + dibujoW, y: y0 + dibujoH };
  const SO = { x: x0, y: y0 + dibujoH };

  const L = Math.max(anchoM, fondoM, 0.001);
  void side;
  /** Metros del modelo → píxeles del dibujo. */
  const P = (x: number, y: number) => {
    const u = Math.max(0, Math.min(1, x / L));
    const v = Math.max(0, Math.min(1, y / L));
    return {
      x: (1 - u) * (1 - v) * SO.x + u * (1 - v) * SE.x + (1 - u) * v * NO.x + u * v * NE.x,
      y: (1 - u) * (1 - v) * SO.y + u * (1 - v) * SE.y + (1 - u) * v * NO.y + u * v * NE.y,
    };
  };
  const esquinas: Esquinas = { so: SO, se: SE, no: NO, ne: NE };

  /** Coordenadas del puntero → metros del modelo, pasando por el sistema del SVG para que
   * funcione con la página desplazada y con el lienzo escalado. */
  const punteroAMetros = (e: React.PointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return aMetros(pt.x, pt.y, esquinas, L);
  };

  const quad = (x: number, y: number, w: number, h: number) =>
    [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)]
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");

  const filas = Math.max(1, placement.rows);

  const ang = ((az - 180) * Math.PI) / 180;
  const ox = 566, oy = 96, LN = 30;

  return (
    /* `touch-none` va en la RAÍZ del svg, no en los tiradores: `touch-action` no se honra en
       elementos hijos de un SVG, así que ponerlo ahí no impedía nada. Sin esto el navegador
       cancela el arrastre a los dos movimientos —`pointercancel`— para quedarse el gesto como
       desplazamiento, y en un teléfono los estorbos simplemente no se podían mover.

       El costo es que sobre el lienzo no se desplaza la página, que es el mismo trato que hacen
       los mapas y los editores de planos: el lienzo se queda con sus gestos. Queda todo el
       resto de la pantalla para desplazar. */
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={`block h-full w-full ${onMoveObstacle || onMoveVertex ? "touch-none" : ""}`}
    >
      <defs>
        <linearGradient id="ground" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eef1ee" />
          <stop offset="1" stopColor="#e4e7e2" />
        </linearGradient>
        <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0H0V26" fill="none" stroke="#dcdfd9" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#ground)" />
      <rect width={W} height={H} fill="url(#grid)" opacity={0.5} />

      {/* Huella del techo: el contorno REAL, no un cuadrilátero decorativo. */}
      <polygon
        points={outline.map((v) => {
          const p = metrosAPixeles(v.x, v.y, esquinas, L);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        }).join(" ")}
        fill="#cfd6dd"
        stroke={outlineMedido ? "#8d99a6" : "#aeb7bf"}
        strokeWidth={1.5}
        strokeDasharray={outlineMedido ? undefined : "5 4"}
      />

      {/* Sombra medida, celda por celda. La capa de sombreado ya no pinta un degradado
          inventado: pinta dónde cae la sombra de los estorbos capturados. */}
      {shading && layer === "shade" && shading.sombreadas.map((s) => (
        <polygon
          key={`s-${s.celda.x}-${s.celda.y}`}
          points={quad(s.celda.x - CELDA_M / 2, s.celda.y - CELDA_M / 2, CELDA_M, CELDA_M)}
          fill="#7c6a58"
          opacity={Math.min(0.75, 0.12 + s.fraccion * 1.8)}
        />
      ))}

      {/* Módulos en sus posiciones reales */}
      {placement.modules.map((m, i) => {
        const profundidad = filas > 1 ? m.row / (filas - 1) : 0.5;
        const idx = Math.min(
          FLUX.length - 1,
          Math.max(0, Math.round(profundidad * (FLUX.length - 1) - (shading ? shading.loss * 10 : shade / 14))),
        );
        const fill = layer === "flux" ? FLUX[idx] : "#243040";
        const pts = quad(m.x, m.y, m.w, m.h);
        return (
          <g key={i}>
            <polygon points={pts} fill={fill} stroke="#0f1720" strokeWidth={0.8} />
            {layer === "sat" && (
              <polygon points={quad(m.x, m.y + m.h / 2, m.w, m.h / 2)} fill="#2f3d4f" />
            )}
          </g>
        );
      })}

      {/* Estorbos. Se dibujan encima porque físicamente están encima, y se pueden mover
          arrastrándolos o con las flechas del teclado. */}
      {obstacles.map((o) => {
        const vista = arrastre?.id === o.id ? arrastre : o;
        const c = metrosAPixeles(vista.x, vista.y, esquinas, L);
        const a = metrosAPixeles(vista.x - o.width / 2, vista.y - o.depth / 2, esquinas, L);
        const b = metrosAPixeles(vista.x + o.width / 2, vista.y + o.depth / 2, esquinas, L);
        const r = Math.max(4, Math.abs(b.x - a.x) / 2);
        const color = COLOR_OBSTACULO[o.kind] ?? "#6b7280";
        const movible = !!onMoveObstacle;

        const mover = (dx: number, dy: number) => {
          onMoveObstacle?.(
            o.id,
            Math.max(0, Math.min(L, o.x + dx)),
            Math.max(0, Math.min(L, o.y + dy)),
          );
        };

        return (
          <g
            key={o.id}
            tabIndex={movible ? 0 : undefined}
            role={movible ? "button" : undefined}
            aria-label={
              movible
                ? `${ETIQUETA_OBSTACULO[o.kind]} de ${o.height} m. Usa las flechas para moverlo.`
                : undefined
            }
            className={movible ? "cursor-grab touch-none focus:outline-none" : undefined}
            onPointerDown={(e) => {
              if (!movible) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setArrastre({ id: o.id, x: o.x, y: o.y });
            }}
            onPointerMove={(e) => {
              if (!arrastre || arrastre.id !== o.id) return;
              const m = punteroAMetros(e);
              if (m) setArrastre({ id: o.id, x: m.x, y: m.y });
            }}
            onPointerUp={() => {
              if (arrastre?.id === o.id) {
                onMoveObstacle?.(o.id, arrastre.x, arrastre.y);
                setArrastre(null);
              }
            }}
            onPointerCancel={() => setArrastre(null)}
            onFocus={() => setEnfocado(o.id)}
            onBlur={() => setEnfocado(null)}
            onKeyDown={(e) => {
              if (!movible) return;
              const paso = e.shiftKey ? PASO_TECLA * 4 : PASO_TECLA;
              // arriba es el norte, o sea +y en el modelo
              const d: Record<string, [number, number]> = {
                ArrowUp: [0, paso], ArrowDown: [0, -paso],
                ArrowLeft: [-paso, 0], ArrowRight: [paso, 0],
              };
              const v = d[e.key];
              if (!v) return;
              e.preventDefault();
              mover(v[0], v[1]);
            }}
          >
            {/* mismo criterio para el estorbo: en una azotea grande el círculo se dibuja
                pequeño y hay que poder agarrarlo igual. */}
            <circle cx={c.x} cy={c.y} r={Math.max(r, 18)} fill="transparent" />
            {o.kind === "pretil" ? (
              <polygon
                points={quad(vista.x - o.width / 2, vista.y - o.depth / 2, o.width, o.depth)}
                fill={color} stroke="#3f3f46" strokeWidth={1}
              />
            ) : (
              <>
                <circle cx={c.x} cy={c.y} r={r} fill={color} stroke="#3f3f46" strokeWidth={1} />
                <circle cx={c.x} cy={c.y - r * 0.25} r={r * 0.55} fill="#ffffff" opacity={0.22} />
              </>
            )}
            {/* aro de foco y de arrastre, visible al enfocar con teclado */}
            {movible && (
              <circle
                cx={c.x} cy={c.y} r={r + 3}
                fill="none" stroke="#ea580c" strokeWidth={2}
                opacity={arrastre?.id === o.id || enfocado === o.id ? 1 : 0}
                className="transition-opacity"
              />
            )}
            <title>{`${ETIQUETA_OBSTACULO[o.kind]} · ${o.height} m`}</title>
          </g>
        );
      })}

      {/* Tiradores en el medio de cada lado: tocarlos inserta un vértice ahí. Es el gesto
          que usan los editores de polígonos, y sin él no se puede trazar una L. */}
      {onAddVertex && outline.map((v, i) => {
        const w = outline[(i + 1) % outline.length];
        const mx = (v.x + w.x) / 2;
        const my = (v.y + w.y) / 2;
        const p = metrosAPixeles(mx, my, esquinas, L);
        return (
          <g
            key={`m${i}`}
            tabIndex={0}
            role="button"
            aria-label={`Agregar un vértice en el lado ${i + 1}`}
            className="cursor-copy touch-none focus:outline-none"
            onClick={() => onAddVertex(i, mx, my)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onAddVertex(i, mx, my);
            }}
            onFocus={() => setEnfocado(`m${i}`)}
            onBlur={() => setEnfocado(null)}
          >
            <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
            <g pointerEvents="none">
              <circle cx={p.x} cy={p.y} r={enfocado === `m${i}` ? 6 : 3.5}
                fill="#ffffff" stroke="#9a968e" strokeWidth={1.5} />
              <line x1={p.x - 2} y1={p.y} x2={p.x + 2} y2={p.y} stroke="#6b6862" strokeWidth={1} />
              <line x1={p.x} y1={p.y - 2} x2={p.x} y2={p.y + 2} stroke="#6b6862" strokeWidth={1} />
            </g>
          </g>
        );
      })}

      {/* Vértices del contorno. Arrastrarlos redibuja la azotea y recalcula todo. */}
      {onMoveVertex && outline.map((v, i) => {
        const p = metrosAPixeles(v.x, v.y, esquinas, L);
        const activo = vertice === i;
        return (
          <g
            key={`v${i}`}
            tabIndex={0}
            role="button"
            aria-label={`Vértice ${i + 1} de ${outline.length}, a ${v.x.toFixed(1)} m al oriente y ${v.y.toFixed(1)} m al norte. Flechas para moverlo${outline.length > 3 ? ", Suprimir para quitarlo" : ""}.`}
            className="cursor-grab touch-none focus:outline-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setVertice(i);
            }}
            onPointerMove={(e) => {
              if (vertice !== i) return;
              const m = punteroAMetros(e);
              if (m) onMoveVertex(i, m.x, m.y);
            }}
            onPointerUp={() => setVertice(null)}
            onPointerCancel={() => setVertice(null)}
            onFocus={() => setEnfocado(`v${i}`)}
            onBlur={() => setEnfocado(null)}
            onKeyDown={(e) => {
              if ((e.key === "Delete" || e.key === "Backspace") && onDeleteVertex) {
                e.preventDefault();
                // por debajo de tres vértices no hay superficie que encerrar
                if (outline.length > 3) onDeleteVertex(i);
                return;
              }
              const paso = e.shiftKey ? PASO_TECLA * 4 : PASO_TECLA;
              const d: Record<string, [number, number]> = {
                ArrowUp: [0, paso], ArrowDown: [0, -paso],
                ArrowLeft: [-paso, 0], ArrowRight: [paso, 0],
              };
              const k = d[e.key];
              if (!k) return;
              e.preventDefault();
              onMoveVertex(i, Math.max(0, v.x + k[0]), Math.max(0, v.y + k[1]));
            }}
            onDoubleClick={() => {
              if (onDeleteVertex && outline.length > 3) onDeleteVertex(i);
            }}
          >
            {/* blanco táctil: invisible, pero es lo que recibe el dedo. El círculo visible de
                5 px de radio son unos 3 px reales en un teléfono, imposible de agarrar. */}
            <circle cx={p.x} cy={p.y} r={18} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={activo || enfocado === `v${i}` ? 7 : 5}
              fill="#ffffff" stroke="#ea580c" strokeWidth={2} pointerEvents="none" />
          </g>
        );
      })}

      {/* Brújula */}
      <circle cx={ox} cy={oy} r={24} fill="#ffffff" stroke="#e6e3dc" strokeWidth={1} />
      <line x1={ox} y1={oy} x2={ox + LN * Math.sin(ang)} y2={oy + LN * Math.cos(ang)}
        stroke="#ea580c" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={ox} cy={oy} r={2.4} fill="#1a1a17" />
      <text x={ox} y={oy - 30} fill="#9a968e" fontSize={10} textAnchor="middle" fontFamily="Inter">N</text>

      {/* Escala con valor REDONDO. Derivarla del techo daba etiquetas como "0.9 m", que en
          un plano se lee como un error de dibujo: una escala se rotula en metros enteros y
          es la barra la que se ajusta. */}
      {(() => {
        const pxPorMetro = (rw - 40) / L;
        const metros = [1, 2, 5, 10, 20, 50].find((m) => m * pxPorMetro >= 44) ?? 50;
        const largo = metros * pxPorMetro;
        return (
          <g transform={`translate(${rx - 8}, ${H - 26})`}>
            <line x1={0} y1={0} x2={largo} y2={0} stroke="#6b6862" strokeWidth={1.5} />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="#6b6862" strokeWidth={1.5} />
            <line x1={largo} y1={-4} x2={largo} y2={4} stroke="#6b6862" strokeWidth={1.5} />
            <text x={largo / 2} y={-7} fill="#6b6862" fontSize={9.5} textAnchor="middle"
              fontFamily="Inter">{metros} m</text>
          </g>
        );
      })()}

      {/* El aviso va en la franja inferior central: arriba lo tapaban los botones de capa,
          que están superpuestos al lienzo, y quedaba cortado a media palabra. */}
      {outlineInvalido && (
        <text x={W / 2 - 20} y={ry - 10} fill="#d94e0a" fontSize={10.5}
          textAnchor="middle" fontFamily="Inter">
          El contorno se cruza consigo mismo · se está usando el cuadrado supuesto
        </text>
      )}

      {obstacles.length > 0 && onMoveObstacle && (
        <text
          x={W / 2 - 20} y={H - 22} fill={arrastre ? "#1a1a17" : "#9a968e"}
          fontSize={10} textAnchor="middle" fontFamily="Inter"
        >
          {arrastre
            ? `${arrastre.x.toFixed(1)} m al oriente · ${arrastre.y.toFixed(1)} m al norte`
            : "Arrastra un estorbo para moverlo, o enfócalo y usa las flechas"}
        </text>
      )}

      {layer === "flux" && (
        <g transform={`translate(${W - 132}, ${H - 56})`}>
          {FLUX.map((c, i) => (
            <rect key={c} x={i * 18} y={0} width={18} height={7} fill={c} />
          ))}
          <text x={0} y={19} fill="#6b6862" fontSize={9} fontFamily="Inter">menor</text>
          <text x={108} y={19} fill="#6b6862" fontSize={9} textAnchor="end" fontFamily="Inter">mayor</text>
        </g>
      )}

      {shading && layer === "shade" && (
        <g transform={`translate(${W - 150}, ${H - 44})`}>
          <rect x={0} y={0} width={14} height={7} fill="#7c6a58" opacity={0.25} />
          <rect x={18} y={0} width={14} height={7} fill="#7c6a58" opacity={0.7} />
          <text x={38} y={7} fill="#6b6862" fontSize={9} fontFamily="Inter">
            sombra parcial → constante
          </text>
        </g>
      )}
    </svg>
  );
}
