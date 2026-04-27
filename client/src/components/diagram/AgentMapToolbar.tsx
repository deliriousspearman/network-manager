import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot, Plus, ImagePlus, Lock, Unlock, Maximize,
  Download, Undo2, Redo2, Search,
  MousePointer2, Grid3x3, List, Map,
} from 'lucide-react';
import type { AgentWithDevice } from 'shared/types';
import { setStorage } from '../../utils/storage';

interface TooltipProps {
  text: string;
  children: ReactNode;
}

function Tooltip({ text, children }: TooltipProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = (e: React.MouseEvent | React.FocusEvent) => {
    if (!text) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ top: rect.top - 6, left: rect.left + rect.width / 2 });
  };
  const hide = () => setPos(null);

  return (
    <span
      style={{ display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos && createPortal(
        <div
          className="portal-tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
        >
          {text}
        </div>,
        document.body,
      )}
    </span>
  );
}

interface Props {
  projectSlug: string;

  locked: boolean;
  setLocked: (next: boolean | ((prev: boolean) => boolean)) => void;

  availableAgents: AgentWithDevice[];
  onAddAgent: (agentId: number) => void;
  onOpenImageLibrary: () => void;
  onFitView: () => void;

  onExportPng: () => void;
  onExportSvg: () => void;
  onExportDrawio: () => void;

  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  searchQuery: string;
  onSearchChange: (q: string) => void;

  showGrid: boolean;
  setShowGrid: (next: boolean | ((prev: boolean) => boolean)) => void;
  showMinimap: boolean;
  setShowMinimap: (next: boolean | ((prev: boolean) => boolean)) => void;
  showLegend: boolean;
  setShowLegend: (next: boolean | ((prev: boolean) => boolean)) => void;
  selectMode: boolean;
  setSelectMode: (next: boolean | ((prev: boolean) => boolean)) => void;
}

export default function AgentMapToolbar({
  projectSlug,
  locked, setLocked,
  availableAgents, onAddAgent, onOpenImageLibrary, onFitView,
  onExportPng, onExportSvg, onExportDrawio,
  onUndo, onRedo, canUndo, canRedo,
  searchQuery, onSearchChange,
  showGrid, setShowGrid,
  showMinimap, setShowMinimap,
  showLegend, setShowLegend,
  selectMode, setSelectMode,
}: Props) {
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addAgentOpen && !exportOpen) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setAddAgentOpen(false);
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [addAgentOpen, exportOpen]);

  const addAgentTooltip = locked
    ? 'Unlock the map to add agents'
    : availableAgents.length === 0
    ? 'All agents already on the map'
    : 'Add Agent';
  const imageLibraryTooltip = locked ? 'Unlock the map to add images' : 'Image Library';
  const lockTooltip = locked ? 'Locked (click to unlock)' : 'Unlocked (click to lock)';
  const selectModeTooltip = selectMode ? 'Selection Mode (click for Pan)' : 'Pan Mode (click for Select)';

  return (
    <div className="diagram-toolbar" ref={rootRef}>
      {/* Group: Add to Map */}
      <div className="diagram-tb-group">
        <div style={{ position: 'relative' }}>
          <Tooltip text={addAgentTooltip}>
            <button
              className={`diagram-tb-btn${addAgentOpen ? ' active' : ''}`}
              title={addAgentTooltip}
              disabled={locked || availableAgents.length === 0}
              onClick={() => setAddAgentOpen(v => !v)}
            >
              <span className="icon-bot-plus">
                <Bot size={17} />
                <Plus size={10} className="icon-bot-plus-badge" />
              </span>
            </button>
          </Tooltip>
          {addAgentOpen && availableAgents.length > 0 && (
            <div
              className="diagram-tb-popover"
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.15rem', minWidth: 220, maxHeight: 320, overflowY: 'auto' }}
            >
              {availableAgents.map(a => (
                <button
                  key={a.id}
                  className="btn btn-sm btn-secondary"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'nowrap' }}
                  onClick={() => { onAddAgent(a.id); setAddAgentOpen(false); }}
                >
                  {a.name} <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginLeft: '0.3rem' }}>({a.agent_type})</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Tooltip text={imageLibraryTooltip}>
          <button
            className="diagram-tb-btn"
            title={imageLibraryTooltip}
            disabled={locked}
            onClick={onOpenImageLibrary}
          >
            <ImagePlus size={17} />
          </button>
        </Tooltip>
      </div>

      {/* Group: Interaction Mode */}
      <div className="diagram-tb-group">
        <Tooltip text={lockTooltip}>
          <button
            className={`diagram-tb-btn${locked ? ' active' : ''}`}
            title={lockTooltip}
            onClick={() => setLocked(v => !v)}
          >
            {locked ? <Lock size={17} /> : <Unlock size={17} />}
          </button>
        </Tooltip>
        <Tooltip text={selectModeTooltip}>
          <button
            className={`diagram-tb-btn${selectMode ? ' active' : ''}`}
            title={selectModeTooltip}
            disabled={locked}
            onClick={() => setSelectMode(v => {
              const next = !v;
              setStorage(`agent-map-select-mode-${projectSlug}`, String(next));
              return next;
            })}
          >
            <MousePointer2 size={17} />
          </button>
        </Tooltip>
      </div>

      {/* Group: Display Toggles */}
      <div className="diagram-tb-group">
        <Tooltip text="Toggle Grid">
          <button
            className={`diagram-tb-btn${showGrid ? ' active' : ''}`}
            title="Toggle Grid"
            onClick={() => setShowGrid(v => {
              const next = !v;
              setStorage(`agent-map-show-grid-${projectSlug}`, String(next));
              return next;
            })}
          >
            <Grid3x3 size={17} />
          </button>
        </Tooltip>
        <Tooltip text="Toggle Legend">
          <button
            className={`diagram-tb-btn${showLegend ? ' active' : ''}`}
            title="Toggle Legend"
            onClick={() => setShowLegend(v => {
              const next = !v;
              setStorage(`agent-map-show-legend-${projectSlug}`, String(next));
              return next;
            })}
          >
            <List size={17} />
          </button>
        </Tooltip>
        <Tooltip text="Toggle Minimap">
          <button
            className={`diagram-tb-btn${showMinimap ? ' active' : ''}`}
            title="Toggle Minimap"
            onClick={() => setShowMinimap(v => {
              const next = !v;
              setStorage(`agent-map-show-minimap-${projectSlug}`, String(next));
              return next;
            })}
          >
            <Map size={17} />
          </button>
        </Tooltip>
      </div>

      {/* Group: Undo / Redo */}
      <div className="diagram-tb-group">
        <Tooltip text="Undo (Ctrl+Z)">
          <button
            className="diagram-tb-btn"
            title="Undo (Ctrl+Z)"
            onClick={onUndo}
            disabled={!canUndo}
          >
            <Undo2 size={17} />
          </button>
        </Tooltip>
        <Tooltip text="Redo (Ctrl+Shift+Z)">
          <button
            className="diagram-tb-btn"
            title="Redo (Ctrl+Shift+Z)"
            onClick={onRedo}
            disabled={!canRedo}
          >
            <Redo2 size={17} />
          </button>
        </Tooltip>
      </div>

      {/* Group: View */}
      <div className="diagram-tb-group">
        <Tooltip text="Fit to View">
          <button
            className="diagram-tb-btn"
            title="Fit to View"
            onClick={onFitView}
          >
            <Maximize size={17} />
          </button>
        </Tooltip>
      </div>

      {/* Group: Export */}
      <div className="diagram-tb-group" style={{ position: 'relative' }}>
        <Tooltip text="Export">
          <button
            className={`diagram-tb-btn${exportOpen ? ' active' : ''}`}
            title="Export"
            onClick={() => setExportOpen(v => !v)}
          >
            <Download size={17} />
          </button>
        </Tooltip>
        {exportOpen && (
          <div className="diagram-tb-popover diagram-tb-popover-narrow">
            <button
              className="btn btn-sm"
              onClick={() => { onExportPng(); setExportOpen(false); }}
            >
              Export PNG
            </button>
            <button
              className="btn btn-sm"
              onClick={() => { onExportSvg(); setExportOpen(false); }}
            >
              Export SVG
            </button>
            <button
              className="btn btn-sm"
              onClick={() => { onExportDrawio(); setExportOpen(false); }}
            >
              Export draw.io
            </button>
          </div>
        )}
      </div>

      {/* Search (pushed right) */}
      <div className="diagram-search-wrap ml-auto">
        <Search size={14} className="diagram-search-icon" />
        <input
          type="text"
          className="diagram-search"
          placeholder="Filter by name, type, device"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}
