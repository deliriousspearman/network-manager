import { useState, useEffect, useCallback } from 'react';
import { getStorage, setStorage, removeStorage } from '../../../utils/storage';
import { DEFAULT_LAYOUT_SETTINGS, type LayoutSettings } from '../../../api/diagram';

function readLayoutSettings(slug: string): LayoutSettings {
  const raw = getStorage(`diagram-layout-settings-${slug}`);
  if (!raw) return DEFAULT_LAYOUT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<LayoutSettings>;
    return { ...DEFAULT_LAYOUT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_LAYOUT_SETTINGS;
  }
}

// NOTE: persistence of the boolean toggles themselves is handled by DiagramToolbar
// (each toggle button writes to localStorage as part of its onClick). This hook
// only owns initial reads and the project-change reset effect.
export function useDiagramPrefs(projectSlug: string) {
  const [showGrid, setShowGrid] = useState(() => getStorage(`diagram-show-grid-${projectSlug}`) !== 'false');
  const [showEdges, setShowEdges] = useState(() => getStorage(`diagram-show-edges-${projectSlug}`) !== 'false');
  const [showCredentials, setShowCredentials] = useState(() => getStorage(`diagram-show-credentials-${projectSlug}`) !== 'false');
  const [showAv, setShowAv] = useState(() => getStorage(`diagram-show-av-${projectSlug}`) !== 'false');
  const [showAgents, setShowAgents] = useState(() => getStorage(`diagram-show-agents-${projectSlug}`) !== 'false');
  const [showLegend, setShowLegend] = useState(() => getStorage(`diagram-show-legend-${projectSlug}`) !== 'false');
  const [showMinimap, setShowMinimap] = useState(() => getStorage(`diagram-show-minimap-${projectSlug}`) === 'true');
  const [selectMode, setSelectMode] = useState(() => getStorage(`diagram-select-mode-${projectSlug}`) === 'true');

  const [typeFilter, setTypeFilter] = useState<string[]>(() => {
    const raw = getStorage(`diagram-type-filter-${projectSlug}`);
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  });

  const toggleTypeFilter = useCallback((t: string) => {
    setTypeFilter(prev => {
      const next = prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t];
      setStorage(`diagram-type-filter-${projectSlug}`, JSON.stringify(next));
      return next;
    });
  }, [projectSlug]);

  const clearTypeFilter = useCallback(() => {
    setTypeFilter([]);
    setStorage(`diagram-type-filter-${projectSlug}`, '[]');
  }, [projectSlug]);

  // Subnet filter works differently from type filter: when non-empty, nodes
  // outside the selected subnets are DROPPED from the render, not just dimmed.
  // This is the escape hatch for large diagrams where React Flow freezes at
  // 1000+ visible nodes — pre-filtering lets users zoom in on a single subnet.
  const [subnetFilter, setSubnetFilter] = useState<number[]>(() => {
    const raw = getStorage(`diagram-subnet-filter-${projectSlug}`);
    if (!raw) return [];
    try { return JSON.parse(raw) as number[]; } catch { return []; }
  });

  const toggleSubnetFilter = useCallback((id: number) => {
    setSubnetFilter(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      setStorage(`diagram-subnet-filter-${projectSlug}`, JSON.stringify(next));
      return next;
    });
  }, [projectSlug]);

  const clearSubnetFilter = useCallback(() => {
    setSubnetFilter([]);
    setStorage(`diagram-subnet-filter-${projectSlug}`, '[]');
  }, [projectSlug]);

  const [layoutSettings, setLayoutSettingsState] = useState<LayoutSettings>(() => readLayoutSettings(projectSlug));

  const setLayoutSettings = useCallback((next: LayoutSettings) => {
    setLayoutSettingsState(next);
    setStorage(`diagram-layout-settings-${projectSlug}`, JSON.stringify(next));
  }, [projectSlug]);

  const [currentViewId, setCurrentViewIdState] = useState<number | undefined>(() => {
    const stored = getStorage(`diagram-view-${projectSlug}`);
    return stored ? Number(stored) : undefined;
  });

  const setCurrentViewId = useCallback((id: number | undefined) => {
    setCurrentViewIdState(id);
    if (id === undefined) {
      removeStorage(`diagram-view-${projectSlug}`);
    } else {
      setStorage(`diagram-view-${projectSlug}`, String(id));
    }
  }, [projectSlug]);

  // Re-read all prefs from storage when the project changes.
  useEffect(() => {
    setShowGrid(getStorage(`diagram-show-grid-${projectSlug}`) !== 'false');
    setShowEdges(getStorage(`diagram-show-edges-${projectSlug}`) !== 'false');
    setShowCredentials(getStorage(`diagram-show-credentials-${projectSlug}`) !== 'false');
    setShowAv(getStorage(`diagram-show-av-${projectSlug}`) !== 'false');
    setShowAgents(getStorage(`diagram-show-agents-${projectSlug}`) !== 'false');
    setShowLegend(getStorage(`diagram-show-legend-${projectSlug}`) !== 'false');
    setShowMinimap(getStorage(`diagram-show-minimap-${projectSlug}`) === 'true');
    const storedView = getStorage(`diagram-view-${projectSlug}`);
    setCurrentViewIdState(storedView ? Number(storedView) : undefined);
    setLayoutSettingsState(readLayoutSettings(projectSlug));
  }, [projectSlug]);

  return {
    showGrid, setShowGrid,
    showEdges, setShowEdges,
    showCredentials, setShowCredentials,
    showAv, setShowAv,
    showAgents, setShowAgents,
    showLegend, setShowLegend,
    showMinimap, setShowMinimap,
    selectMode, setSelectMode,
    typeFilter, setTypeFilter, toggleTypeFilter, clearTypeFilter,
    subnetFilter, setSubnetFilter, toggleSubnetFilter, clearSubnetFilter,
    currentViewId, setCurrentViewId, setCurrentViewIdState,
    layoutSettings, setLayoutSettings,
  };
}
