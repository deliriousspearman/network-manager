import { useEffect } from 'react';
import { useStoreApi } from '@xyflow/react';

/**
 * Auto-pan the React Flow canvas while the user is dragging a selection
 * box past the visible canvas edge. React Flow v12 has autoPanOnNodeDrag
 * and autoPanOnConnect built in, but no equivalent for selection drags —
 * so we drive it manually.
 *
 * Trigger is binary on "cursor outside the canvas" with a small inset
 * margin (so the pan also helps right at the edge). Speed ramps with
 * overshoot, capped at MAX_SPEED. Reference rect is React Flow's own
 * dom node (or the .react-flow element directly as a fallback) so the
 * trigger zone matches the visible canvas, not the outer page container.
 */
export function useDiagramAutoPan(locked: boolean, selectMode: boolean): void {
  const storeApi = useStoreApi();

  useEffect(() => {
    if (locked || !selectMode) return;
    const EDGE_MARGIN = 30;     // px inset where pan starts ramping up
    const MAX_SPEED = 22;       // px per frame, cap

    let raf = 0;
    const lastPointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => { lastPointer.x = e.clientX; lastPointer.y = e.clientY; };

    const axisDelta = (p: number, dim: number) => {
      if (p < EDGE_MARGIN) {
        const t = Math.min(1, (EDGE_MARGIN - p) / EDGE_MARGIN);
        return  t * MAX_SPEED;
      }
      if (p > dim - EDGE_MARGIN) {
        const t = Math.min(1, (p - (dim - EDGE_MARGIN)) / EDGE_MARGIN);
        return -t * MAX_SPEED;
      }
      return 0;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const state = storeApi.getState();
      if (!state.userSelectionActive) return;
      const flowEl = state.domNode ?? document.querySelector('.react-flow');
      if (!flowEl) return;
      const rect = flowEl.getBoundingClientRect();
      const px = lastPointer.x - rect.left;
      const py = lastPointer.y - rect.top;
      const dx = axisDelta(px, rect.width);
      const dy = axisDelta(py, rect.height);
      if (dx === 0 && dy === 0) return;
      // Both setViewport and panBy go through d3-zoom's transform(), and the
      // d3 'zoom' event handler is what normally writes back to the React Flow
      // store. But that handler is removed (and not re-registered) while
      // userSelectionActive is true (see XYPanZoom.update in @xyflow/system),
      // so any d3-routed pan is a silent no-op during a selection drag.
      // Bypass it: update the store's transform directly (which drives the
      // viewport CSS) and sync d3's __zoom so the d3 state matches when the
      // user releases the mouse.
      const tr = state.transform;
      const nextTransform: [number, number, number] = [tr[0] + dx, tr[1] + dy, tr[2]];
      storeApi.setState({ transform: nextTransform });
      state.panZoom?.syncViewport({ x: nextTransform[0], y: nextTransform[1], zoom: nextTransform[2] });
    };

    window.addEventListener('pointermove', onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, [locked, selectMode, storeApi]);
}
