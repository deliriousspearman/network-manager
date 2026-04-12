import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useStoreApi } from '@xyflow/react';
import { getStorage, setStorage } from '../../utils/storage';

export function useToolbarState(projectSlug: string) {
  const storeApi = useStoreApi();

  const [showGrid, setShowGrid] = useState(() => getStorage(`diagram-show-grid-${projectSlug}`) !== 'false');
  const [showEdges, setShowEdges] = useState(() => getStorage(`diagram-show-edges-${projectSlug}`) !== 'false');
  const [showCredentials, setShowCredentials] = useState(() => getStorage(`diagram-show-credentials-${projectSlug}`) !== 'false');
  const [showLegend, setShowLegend] = useState(() => getStorage(`diagram-show-legend-${projectSlug}`) !== 'false');
  const [showMinimap, setShowMinimap] = useState(() => getStorage(`diagram-show-minimap-${projectSlug}`) === 'true');
  const [selectMode, setSelectMode] = useState(() => getStorage(`diagram-select-mode-${projectSlug}`) === 'true');
  const [locked, setLocked] = useState(true);
  const [showLockHint, setShowLockHint] = useState(() => getStorage('diagram-lock-hint-seen') !== 'true');

  const showEdgesRef = useRef(showEdges);
  const showCredentialsRef = useRef(showCredentials);
  useEffect(() => { showEdgesRef.current = showEdges; }, [showEdges]);
  useEffect(() => { showCredentialsRef.current = showCredentials; }, [showCredentials]);

  // Sync lock state to React Flow store before paint
  useLayoutEffect(() => {
    storeApi.setState({ nodesDraggable: !locked, nodesConnectable: !locked, elementsSelectable: !locked });
  }, [locked, storeApi]);

  // Auto-dismiss lock hint on first unlock
  useEffect(() => {
    if (!locked && showLockHint) {
      setShowLockHint(false);
      setStorage('diagram-lock-hint-seen', 'true');
    }
  }, [locked]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissLockHint = useCallback(() => {
    setShowLockHint(false);
    setStorage('diagram-lock-hint-seen', 'true');
  }, []);

  // Toggle helpers that persist to localStorage
  const toggleGrid = useCallback(() => setShowGrid(v => { setStorage(`diagram-show-grid-${projectSlug}`, String(!v)); return !v; }), [projectSlug]);
  const toggleEdges = useCallback(() => setShowEdges(v => { setStorage(`diagram-show-edges-${projectSlug}`, String(!v)); return !v; }), [projectSlug]);
  const toggleCredentials = useCallback(() => setShowCredentials(v => { setStorage(`diagram-show-credentials-${projectSlug}`, String(!v)); return !v; }), [projectSlug]);
  const toggleLegend = useCallback(() => setShowLegend(v => { setStorage(`diagram-show-legend-${projectSlug}`, String(!v)); return !v; }), [projectSlug]);
  const toggleMinimap = useCallback(() => setShowMinimap(v => { setStorage(`diagram-show-minimap-${projectSlug}`, String(!v)); return !v; }), [projectSlug]);
  const toggleSelectMode = useCallback(() => setSelectMode(v => { setStorage(`diagram-select-mode-${projectSlug}`, String(!v)); return !v; }), [projectSlug]);

  return {
    showGrid, toggleGrid,
    showEdges, setShowEdges, toggleEdges,
    showCredentials, toggleCredentials,
    showLegend, toggleLegend,
    showMinimap, toggleMinimap,
    selectMode, toggleSelectMode,
    locked, setLocked,
    showLockHint, dismissLockHint,
    showEdgesRef, showCredentialsRef,
  };
}
