"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { cn } from "@/lib/utils";

export interface TimelineCategory {
  label: string;
  count: number;
}

interface Props {
  categories: TimelineCategory[];
  /** Colonna della lista: i figli diretti con `data-catalog-section` sono le sezioni, nello stesso ordine di `categories`. */
  listRef: RefObject<HTMLElement | null>;
  className?: string;
}

/** Margine interno della traccia, così il primo e l'ultimo marcatore non escono dalla barra. */
const TRACK_PAD = 10;
/** Distanza minima tra due marcatori: una riga di etichetta (con il dito: un bersaglio alto 36px, etichetta su due righe). */
const MIN_SEGMENT = 24;
const MIN_SEGMENT_COARSE = 36;
/** Sotto questa distanza le etichette si sovrapporrebbero: se ne mostra una ogni tanto. */
const MIN_LABEL_GAP = 16;
const MIN_LABEL_GAP_COARSE = 28; // etichetta su due righe (11px, interlinea 1.25)
const COARSE_POINTER = "(pointer: coarse)";
const BOTTOM_GAP = 20;
const MIN_HEIGHT = 120;

interface Geometry {
  height: number;
  markers: number[];
  thumb: number;
  active: number;
  coarse: boolean;
}

/**
 * Corrispondenza tra scorrimento della pagina e traccia. La "linea di lettura" è il punto del documento subito
 * sotto l'header sticky; nell'ultima schermata scende fino al fondo della finestra, così anche le ultime
 * categorie (che non possono arrivare in cima) diventano attive e la barra arriva in fondo.
 */
interface Mapping {
  /** Confini delle sezioni in coordinate documento (n + 1 valori). */
  bounds: number[];
  /** Inizio e altezza di ogni segmento sulla traccia. */
  ys: number[];
  hs: number[];
  /** Offset dell'header sticky, scorrimento massimo, ampiezza della coda, altezza della finestra. */
  offset: number;
  maxScroll: number;
  tail: number;
  viewport: number;
}

function readingLine({ offset, maxScroll, tail, viewport }: Omit<Mapping, "bounds" | "ys" | "hs">, scrollY: number): number {
  const tailStart = maxScroll - tail;
  if (tail <= 0 || scrollY <= tailStart) return scrollY + offset;
  return scrollY + offset + ((scrollY - tailStart) / tail) * (viewport - offset);
}

/** Inversa di readingLine: lo scorrimento che porta la linea di lettura sul punto indicato. */
function scrollForReading({ offset, maxScroll, tail, viewport }: Mapping, reading: number): number {
  const tailStart = maxScroll - tail;
  if (tail <= 0 || reading - offset <= tailStart) return Math.min(maxScroll, Math.max(0, reading - offset));
  const slope = (viewport - offset) / tail;
  return Math.min(maxScroll, Math.max(0, (reading - offset + tailStart * slope) / (1 + slope)));
}

/** Divide la traccia in proporzione alla lunghezza delle sezioni, garantendo a ognuna almeno `min` px. */
function allocate(weights: number[], total: number, min: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n * min >= total) return weights.map(() => total / n);
  const fixed = weights.map(() => false);
  for (;;) {
    let fixedCount = 0;
    let freeWeight = 0;
    weights.forEach((w, i) => {
      if (fixed[i]) fixedCount++;
      else freeWeight += w;
    });
    const freeSpace = total - fixedCount * min;
    let changed = false;
    weights.forEach((w, i) => {
      if (!fixed[i] && (w / freeWeight) * freeSpace < min) {
        fixed[i] = true;
        changed = true;
      }
    });
    if (!changed) return weights.map((w, i) => (fixed[i] ? min : (w / freeWeight) * freeSpace));
  }
}

function sameGeometry(a: Geometry | null, b: Geometry): boolean {
  return (
    !!a &&
    a.height === b.height &&
    a.thumb === b.thumb &&
    a.active === b.active &&
    a.coarse === b.coarse &&
    a.markers.length === b.markers.length &&
    a.markers.every((y, i) => y === b.markers[i])
  );
}

const round = (value: number) => Math.round(value * 2) / 2;

/**
 * Barra laterale a timeline: segue lo scorrimento della lista come una scrollbar, con un marcatore per categoria.
 * Clic su una categoria per saltarci, trascinamento sulla traccia per scorrere il listino.
 */
export default function CategoryTimeline({ categories, listRef, className }: Props) {
  const railRef = useRef<HTMLElement>(null);
  const mappingRef = useRef<Mapping | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Trascinamento in corso: punto di partenza sullo schermo e sulla traccia. */
  const dragRef = useRef<{ startClientY: number; startY: number } | null>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    const rail = railRef.current;
    // Nascosta (mobile o colonna troppo stretta): niente da calcolare.
    if (!list || !rail || rail.getClientRects().length === 0) return;
    const sections = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-catalog-section]"));
    if (sections.length === 0) return;

    const scrollY = window.scrollY;
    const viewport = window.innerHeight;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewport);
    const offset = parseFloat(getComputedStyle(sections[0]).scrollMarginTop) || 0;
    const tail = Math.min(maxScroll, Math.max(0, viewport - offset));
    const base = { offset, maxScroll, tail, viewport };

    const tops = sections.map((section) => section.getBoundingClientRect().top + scrollY);
    const bounds = [
      Math.min(tops[0], readingLine(base, 0)),
      ...tops.slice(1),
      Math.max(readingLine(base, maxScroll), tops[tops.length - 1] + 1),
    ];

    // La barra occupa lo spazio fino al fondo della finestra: finché non è agganciata cresce man mano che la
    // pagina scorre. Non supera mai il fondo della lista a fine scorrimento, altrimenti lì verrebbe spinta su.
    const stickyTop = parseFloat(getComputedStyle(rail).top) || 0;
    const railTop = Math.max(rail.getBoundingClientRect().top, stickyTop);
    const listBottomAtEnd = list.getBoundingClientRect().bottom + scrollY - maxScroll;
    const height = Math.round(Math.max(MIN_HEIGHT, Math.min(viewport - BOTTOM_GAP, listBottomAtEnd) - railTop));

    const coarse = window.matchMedia(COARSE_POINTER).matches;
    const lengths = bounds.slice(1).map((b, i) => Math.max(1, b - bounds[i]));
    const hs = allocate(lengths, height - 2 * TRACK_PAD, coarse ? MIN_SEGMENT_COARSE : MIN_SEGMENT);
    const ys: number[] = [];
    hs.reduce((y, h) => {
      ys.push(y);
      return y + h;
    }, TRACK_PAD);

    const reading = readingLine(base, scrollY);
    let active = 0;
    // 1px di tolleranza: dopo un salto lo scorrimento può fermarsi a una frazione di pixel dal confine.
    bounds.slice(0, -1).forEach((b, i) => {
      if (reading + 1 >= b) active = i;
    });
    const progress = Math.min(1, Math.max(0, (reading - bounds[active]) / lengths[active]));

    mappingRef.current = { ...base, bounds, ys, hs };
    const next: Geometry = {
      height,
      markers: ys.map(round),
      thumb: round(ys[active] + progress * hs[active]),
      active,
      coarse,
    };
    setGeometry((prev) => (sameGeometry(prev, next) ? prev : next));
  }, [listRef]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Mouse o dito (tablet con tastiera/trackpad): cambiano la distanza minima tra i marcatori.
    const pointerQuery = window.matchMedia(COARSE_POINTER);
    pointerQuery.addEventListener("change", schedule);
    // Carte che si aprono, filtri, header sticky che cambia altezza: tutto sposta le sezioni.
    const observer = new ResizeObserver(schedule);
    if (listRef.current) observer.observe(listRef.current);
    observer.observe(document.body);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      pointerQuery.removeEventListener("change", schedule);
      observer.disconnect();
    };
  }, [measure, listRef, categories]);

  const scrollBehavior = (): ScrollBehavior =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  const jumpToCategory = (index: number) => {
    const mapping = mappingRef.current;
    if (!mapping) return;
    window.scrollTo({ top: scrollForReading(mapping, mapping.bounds[index]), behavior: scrollBehavior() });
  };

  /** Scorre la pagina fino al punto `y` della traccia. */
  const scrubTo = (y: number) => {
    const mapping = mappingRef.current;
    if (!mapping) return;
    let index = 0;
    mapping.ys.forEach((start, i) => {
      if (y >= start) index = i;
    });
    const progress = Math.min(1, Math.max(0, (y - mapping.ys[index]) / mapping.hs[index]));
    const target = mapping.bounds[index] + progress * (mapping.bounds[index + 1] - mapping.bounds[index]);
    window.scrollTo({ top: scrollForReading(mapping, target), behavior: "instant" });
  };

  // Il trascinamento è relativo al punto di partenza: il primo salto aggancia la barra (sticky) più in alto e
  // la allunga, e rileggere la posizione del dito rispetto alla barra spostata la farebbe saltare di migliaia di px.
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (e.button !== 0 || !rail) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startY = e.clientY - rail.getBoundingClientRect().top;
    dragRef.current = { startClientY: e.clientY, startY };
    setDragging(true);
    scrubTo(startY);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !geometry) return;
    const y = drag.startY + (e.clientY - drag.startClientY);
    scrubTo(Math.min(geometry.height - TRACK_PAD, Math.max(TRACK_PAD, y)));
  };

  const stopDragging = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const labelGap = geometry?.coarse ? MIN_LABEL_GAP_COARSE : MIN_LABEL_GAP;
  const labelEvery =
    geometry && categories.length > 0
      ? Math.max(1, Math.ceil(labelGap / ((geometry.height - 2 * TRACK_PAD) / categories.length)))
      : 1;

  return (
    <nav
      ref={railRef}
      aria-label="Categorie"
      className={cn(
        "sticky top-[calc(var(--catalog-sticky-top)+1.25rem)] self-start select-none",
        className
      )}
      style={{ height: geometry?.height ?? 0 }}
    >
      {geometry && (
        <>
          {/* Traccia e avanzamento */}
          <div
            aria-hidden
            className="absolute left-[7px] w-0.5 rounded-full bg-border pointer-coarse:left-[15px]"
            style={{ top: TRACK_PAD, bottom: TRACK_PAD }}
          />
          <div
            aria-hidden
            className="absolute left-[7px] w-0.5 rounded-full bg-primary pointer-coarse:left-[15px]"
            style={{ top: TRACK_PAD, height: Math.max(0, geometry.thumb - TRACK_PAD) }}
          />

          {/* Marcatori delle categorie */}
          {categories.map((category, i) => {
            const isActive = i === geometry.active;
            const isPast = i < geometry.active;
            const showLabel = isActive || i % labelEvery === 0;
            return (
              <button
                key={category.label}
                type="button"
                onClick={() => jumpToCategory(i)}
                aria-current={isActive ? "location" : undefined}
                title={`${category.label} · ${category.count} ${category.count === 1 ? "articolo" : "articoli"}`}
                className="group absolute inset-x-0 flex h-5 -translate-y-1/2 items-center gap-2 rounded-md pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:h-9"
                style={{ top: geometry.markers[i] }}
              >
                <span className="flex w-4 shrink-0 justify-center pointer-coarse:w-8">
                  <span
                    className={cn(
                      "rounded-full transition-all",
                      isActive
                        ? "size-2.5 bg-primary ring-4 ring-primary/15"
                        : isPast
                          ? "size-1.5 bg-primary"
                          : "size-1.5 bg-input group-hover:bg-muted-foreground"
                    )}
                  />
                </span>
                {showLabel && (
                  <>
                    <span
                      className={cn(
                        // Con il dito il title non si legge: i nomi lunghi vanno a capo invece di essere troncati.
                        "min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.08em] transition-colors pointer-coarse:line-clamp-2 pointer-coarse:leading-tight pointer-coarse:tracking-[0.04em] pointer-coarse:whitespace-normal",
                        isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      {category.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[11px] font-semibold tabular-nums",
                        isActive ? "text-primary/70" : "text-muted-foreground/70"
                      )}
                    >
                      {category.count}
                    </span>
                  </>
                )}
              </button>
            );
          })}

          {/* Area di trascinamento sulla traccia, con la maniglia della posizione corrente */}
          <div
            aria-hidden
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onLostPointerCapture={stopDragging}
            className={cn(
              "group/track absolute inset-y-0 left-0 z-10 w-4 touch-none pointer-coarse:w-8",
              dragging ? "cursor-grabbing" : "cursor-grab"
            )}
          >
            <span
              className={cn(
                "pointer-events-none absolute left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow-card transition-transform",
                dragging ? "scale-125" : "group-hover/track:scale-110"
              )}
              style={{ top: geometry.thumb }}
            />
          </div>
        </>
      )}
    </nav>
  );
}
