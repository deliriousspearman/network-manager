import { useState, useEffect } from 'react';
import { getStorage } from '../../../utils/storage';

// Persistence of the boolean toggles themselves is handled by AgentMapToolbar
// (each toggle button writes to localStorage as part of its onClick). This hook
// only owns initial reads and the project-change reset effect.
export function useAgentMapPrefs(projectSlug: string) {
  const [showGrid, setShowGrid] = useState(() => getStorage(`agent-map-show-grid-${projectSlug}`) !== 'false');
  const [showMinimap, setShowMinimap] = useState(() => getStorage(`agent-map-show-minimap-${projectSlug}`) === 'true');
  const [showLegend, setShowLegend] = useState(() => getStorage(`agent-map-show-legend-${projectSlug}`) !== 'false');
  const [selectMode, setSelectMode] = useState(() => getStorage(`agent-map-select-mode-${projectSlug}`) === 'true');

  useEffect(() => {
    setShowGrid(getStorage(`agent-map-show-grid-${projectSlug}`) !== 'false');
    setShowMinimap(getStorage(`agent-map-show-minimap-${projectSlug}`) === 'true');
    setShowLegend(getStorage(`agent-map-show-legend-${projectSlug}`) !== 'false');
    setSelectMode(getStorage(`agent-map-select-mode-${projectSlug}`) === 'true');
  }, [projectSlug]);

  return {
    showGrid, setShowGrid,
    showMinimap, setShowMinimap,
    showLegend, setShowLegend,
    selectMode, setSelectMode,
  };
}
