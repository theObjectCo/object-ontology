import type { RefObject } from 'react';
import {
  BASE_OPACITY,
  GRID_MOTIF,
  GRID_TILE,
  PEAK_OPACITY,
  fieldAt,
  fieldCoverage,
  fieldThreshold,
  getMetaballCenters,
  getViewportMetric,
  lerp,
  smoothstep,
} from './gridBlobField';

import {
  POINTER_RADIUS, POINTER_PEAK_SCALE, SCALE_STEPS, SCALE_TAU_GROW,
  SCALE_TAU_SHRINK, PULSE_DURATION, MAX_SCALE_NODES, NS,
} from './gridBlobMotion';

// The field math is shared with the wallpaper generator and gridBlobCanvas.ts.
// This lifecycle owns the SVG node pool, event listeners and animation loop.
export function mountGridBlobSvg(
  svgRef: RefObject<SVGSVGElement | null>,
  groupRef: RefObject<SVGGElement | null>,
  pointerRef: RefObject<{ x: number; y: number }>,
  animationFrameRef: RefObject<number | null>,
  pulseRef: RefObject<{ start: number }>,
) {
  const svg = svgRef.current;
  const group = groupRef.current;
  if (!svg || !group) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let cols = 0;
  let rows = 0;
  let startX = 0;
  let baseOpacity = BASE_OPACITY;
  let nodes: SVGPathElement[] = [];
  let lastOpacity: number[] = [];
  let lastScale: number[] = [];
  // Skala aktualna (ciągła) obok docelowej: pierwsza dochodzi do drugiej
  // wykładniczo, dlatego trzyma się osobno od skwantyzowanej lastScale.
  let scaleNow: number[] = [];
  let cellX: number[] = [];
  let cellY: number[] = [];
  // Znormalizowane pozycje policzone raz w buildGrid: pole metaballi i plama
  // kursora czytają je co ramkę, więc dwa dzielenia na węzeł znikają z pętli.
  let cellNX: number[] = [];
  let cellNY: number[] = [];
  let scaleEnabled = false;
  // Dopóki kursor nie ruszy, nie skalujemy nic — startowe (0.5, 0.52) inaczej
  // powiększyłoby środek ekranu bez powodu. Wyjście kursora za okno cofa efekt.
  let pointerActive = false;
  let lastMove = 0;
  let lastRender = 0;
  // Czy któryś trójkąt jest jeszcze w drodze do swojej docelowej skali
  let settling = false;

  const buildGrid = () => {
    width = Math.max(window.innerWidth, 1);
    height = Math.max(window.innerHeight, 1);
    // Base dots hidden below 1024px, matching the old media query.
    baseOpacity = width > 1024 ? BASE_OPACITY : 0;

    const nextCols = Math.ceil(width / GRID_TILE) + 1;
    const nextRows = Math.ceil(height / GRID_TILE) + 1;
    startX = width % GRID_TILE; // anchor tiles to the top-right corner

    // Rebuild the node pool only when the grid dimensions actually change.
    if (nextCols !== cols || nextRows !== rows) {
      cols = nextCols;
      rows = nextRows;
      const fragment = document.createDocumentFragment();
      nodes = new Array(cols * rows);
      lastOpacity = new Array(cols * rows);
      lastScale = new Array(cols * rows);
      scaleNow = new Array(cols * rows);
      while (group.firstChild) group.removeChild(group.firstChild);

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const path = document.createElementNS(NS, 'path');
          path.setAttribute('d', GRID_MOTIF);
          const index = row * cols + col;
          nodes[index] = path;
          lastOpacity[index] = -1;
          fragment.appendChild(path);
        }
      }
      group.appendChild(fragment);
    }

    // Cache each cell's pixel position (and normalized field lookup).
    cellX = new Array(cols * rows);
    cellY = new Array(cols * rows);
    cellNX = new Array(cols * rows);
    cellNY = new Array(cols * rows);
    scaleEnabled = !prefersReducedMotion && cols * rows <= MAX_SCALE_NODES;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const x = startX + col * GRID_TILE;
        const y = row * GRID_TILE;
        cellX[index] = x;
        cellY[index] = y;
        cellNX[index] = x / width;
        cellNY[index] = y / height;
        lastScale[index] = 1;
        scaleNow[index] = 1;
        nodes[index].setAttribute('transform', `translate(${x} ${y})`);
      }
    }
  };

  const render = (time: number) => {
    // Wygładzanie liczone z realnego kroku czasu, więc tempo nie zależy od
    // tego, czy pętla jedzie 25 czy 60 fps. Clamp chroni przed skokiem po
    // powrocie do uśpionej karty.
    const delta = lastRender ? Math.min(time - lastRender, 100) : 16;
    lastRender = time;

    const centers = getMetaballCenters(pointerRef.current.x, pointerRef.current.y, time, width, height);
    const metric = getViewportMetric(width, height);
    const threshold = fieldThreshold(time);
    const total = cols * rows;

    // Impuls jest jednakowy dla całej siatki, więc liczy się raz na ramkę, a nie
    // per węzeł. sin daje symetryczne narastanie i powrót przez 0 -> 1 -> 0.
    let pulseScale = 1;
    const pulse = pulseRef.current;
    if (scaleEnabled && pulse.start >= 0) {
      const progress = (time - pulse.start) / PULSE_DURATION;
      if (progress >= 1) {
        pulse.start = -1;
      } else {
        pulseScale = 1 + (POINTER_PEAK_SCALE - 1) * Math.sin(progress * Math.PI);
      }
    }

    const chasing = scaleEnabled && pointerActive;
    const growK = 1 - Math.exp(-delta / SCALE_TAU_GROW);
    const shrinkK = 1 - Math.exp(-delta / SCALE_TAU_SHRINK);
    settling = false;
    const pointerX = pointerRef.current.x;
    const pointerY = pointerRef.current.y;
    const radiusSquared = POINTER_RADIUS * POINTER_RADIUS;

    for (let index = 0; index < total; index += 1) {
      const nx = cellNX[index];
      const ny = cellNY[index];

      const field = fieldAt(nx, ny, centers, metric);
      const coverage = fieldCoverage(field, threshold);
      // Quantize so tiny fluctuations don't trigger DOM writes.
      const opacity = Math.round(lerp(baseOpacity, PEAK_OPACITY, coverage) * 100) / 100;

      if (opacity !== lastOpacity[index]) {
        lastOpacity[index] = opacity;
        nodes[index].setAttribute('fill-opacity', String(opacity));
      }

      // Skala zależy tylko od odległości od kursora — pole metaballi rządzi
      // wyłącznie kryciem. Poza promieniem wracamy do 1 bez liczenia
      // pierwiastka, więc pełna pętla kosztuje tyle co wcześniej; zapisy
      // ograniczają się do pierścienia wokół kursora.
      let target = 1;
      if (chasing) {
        const dx = (nx - pointerX) * metric.x;
        const dy = (ny - pointerY) * metric.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < radiusSquared) {
          const falloff = smoothstep(POINTER_RADIUS, 0, Math.sqrt(distanceSquared));
          target = 1 + (POINTER_PEAK_SCALE - 1) * falloff;
        }
      }

      let current = scaleNow[index];
      if (current !== target) {
        current += (target - current) * (target > current ? growK : shrinkK);
        // Domknięcie: bez tego wykładnicze dojście nigdy nie trafia w cel
        // i pętla zostaje w trybie pełnej klatki na zawsze.
        if (Math.abs(target - current) < 0.004) current = target;
        else settling = true;
        scaleNow[index] = current;
      }

      // Impuls wchodzi przez max(), a nie przez wygładzanie: sam jest już gładki
      // w czasie, więc przepuszczenie go przez SCALE_TAU_SHRINK tylko rozciągnęłoby
      // powrót w wielosekundowy zanik. Przez max() nie mnoży się też ze skalą
      // pod kursorem — w obu miejscach szczyt zostaje szczytem.
      if (pulseScale > current) current = pulseScale;

      // Kwantyzacja dopiero tutaj: wygładzanie musi biegnąć po wartości
      // ciągłej, inaczej zatrzymałoby się na najbliższym stopniu.
      const scale = Math.round(current * SCALE_STEPS) / SCALE_STEPS;
      if (scale !== lastScale[index]) {
        lastScale[index] = scale;
        const base = `translate(${cellX[index]} ${cellY[index]})`;
        nodes[index].setAttribute('transform', scale === 1 ? base : `${base} scale(${scale})`);
      }
    }
  };

  buildGrid();
  render(prefersReducedMotion ? 0 : performance.now());

  const handleResize = () => {
    buildGrid();
    render(prefersReducedMotion ? 0 : performance.now());
  };
  window.addEventListener('resize', handleResize);

  // Throttle zszedł z 70ms, bo skala goni kursor. Handler nie dotyka DOM-u
  // (tylko ref), a częstotliwość rysowania jest bramkowana osobno w animate.
  const handlePointerMove = (event: PointerEvent) => {
    const now = performance.now();
    if (now - lastMove < 16) return;
    lastMove = now;
    pointerActive = true;
    pointerRef.current.x = event.clientX / Math.max(window.innerWidth, 1);
    pointerRef.current.y = event.clientY / Math.max(window.innerHeight, 1);
  };

  // Kursor opuścił okno: trójkąty wracają do rozmiaru bazowego.
  const handlePointerLeave = (event: PointerEvent) => {
    if (event.relatedTarget) return;
    pointerActive = false;
  };

  if (!prefersReducedMotion) {
    // Drift is slow, so ~25fps is plenty and keeps DOM churn low.
    let lastFrame = 0;
    // Impuls odpala każda nawigacja: zmiana slajdu, klik w chip drugiego rzędu,
    // wstecz/dalej w przeglądarce. Wszystkie idą przez history.pushState, więc
    // jedno porównanie ścieżki na klatkę zastępuje przekazywanie triggera
    // z App i z sześciu komponentów slajdów. Kliknięcie w już aktywny chip nie
    // zmienia ścieżki, więc słusznie nic nie robi.
    let lastPath = window.location.pathname;
    const animate = (now: number) => {
      const path = window.location.pathname;
      if (path !== lastPath) {
        lastPath = path;
        pulseRef.current.start = now;
      }

      // Dryf metaballi jest wolny i 25fps mu wystarcza, ale skala pod kursorem
      // przy tej częstotliwości widocznie się schodkuje. Pełna klatka wchodzi
      // więc tylko na czas ruchu myszy i sama się wycofuje po 400ms spokoju.
      // Pełna klatka na czas ruchu myszy oraz dopóki skale się nie ustabilizują
      // — powrót do rozmiaru bazowego jest wolny i też musi być gładki.
      const moving =
        scaleEnabled &&
        (settling || pulseRef.current.start >= 0 || (pointerActive && now - lastMove < 400));
      if (now - lastFrame >= (moving ? 16 : 40)) {
        lastFrame = now;
        render(now);
      }
      animationFrameRef.current = window.requestAnimationFrame(animate);
    };
    animationFrameRef.current = window.requestAnimationFrame(animate);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerout', handlePointerLeave, { passive: true });
  }

  return () => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerout', handlePointerLeave);
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
  };
}
