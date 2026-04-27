import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useState } from 'react';
import {
  MonitorUp, Network as NetworkIcon, Grid3x3, Share2, ImagePlus, Upload, Download,
  Wand2, LayoutGrid, KeyRound, List, Map, Maximize, Undo2, Redo2, Type, Layers, Plus, Pencil,
  MousePointer2, Search, Lock, Unlock, Shield, Bot, Filter, Sliders,
} from 'lucide-react';
import { setStorage } from '../../utils/storage';
import { DEFAULT_LAYOUT_SETTINGS, type LayoutSettings } from '../../api/diagram';
import type { DiagramView, Subnet, DeviceWithIps } from 'shared/types';

export interface DiagramToolbarProps {
  projectSlug: string;

  // Views
  views: DiagramView[];
  activeViewId: number | undefined;
  setCurrentViewId: (id: number | undefined) => void;
  viewMenuOpen: boolean;
  setViewMenuOpen: Dispatch<SetStateAction<boolean>>;
  setEditingView: (v: { id: number; name: string } | null) => void;
  setEditingViewName: (s: string) => void;
  onCreateView: () => void;

  // Add-to-diagram
  locked: boolean;
  setLocked: Dispatch<SetStateAction<boolean>>;
  showLockHint: boolean;
  addDeviceOpen: boolean;
  setAddDeviceOpen: Dispatch<SetStateAction<boolean>>;
  addSubnetOpen: boolean;
  setAddSubnetOpen: Dispatch<SetStateAction<boolean>>;
  addDeviceId: string;
  setAddDeviceId: Dispatch<SetStateAction<string>>;
  addSubnetId: string;
  setAddSubnetId: Dispatch<SetStateAction<string>>;
  unplacedDevices: DeviceWithIps[];
  unplacedSubnets: Subnet[];
  onAddDevice: () => void;
  onAddSubnet: () => void;
  placingAnnotation: boolean;
  onAddAnnotation: () => void;
  imageFileInputRef: RefObject<HTMLInputElement>;
  setImageLibraryOpen: (b: boolean) => void;

  // Interaction mode
  selectMode: boolean;
  setSelectMode: Dispatch<SetStateAction<boolean>>;

  // Display toggles
  showGrid: boolean;
  setShowGrid: Dispatch<SetStateAction<boolean>>;
  showEdges: boolean;
  setShowEdges: Dispatch<SetStateAction<boolean>>;
  showCredentials: boolean;
  setShowCredentials: Dispatch<SetStateAction<boolean>>;
  showAv: boolean;
  setShowAv: Dispatch<SetStateAction<boolean>>;
  showAgents: boolean;
  setShowAgents: Dispatch<SetStateAction<boolean>>;
  showLegend: boolean;
  setShowLegend: Dispatch<SetStateAction<boolean>>;
  showMinimap: boolean;
  setShowMinimap: Dispatch<SetStateAction<boolean>>;

  // Layout
  onAutoLayoutGrid: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;

  // Export / import
  exportMenuOpen: boolean;
  setExportMenuOpen: Dispatch<SetStateAction<boolean>>;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportDiagramJson: () => void;
  onExportDrawio: () => void;
  importMenuOpen: boolean;
  setImportMenuOpen: Dispatch<SetStateAction<boolean>>;
  importFileRef: RefObject<HTMLInputElement>;
  drawioImportFileRef: RefObject<HTMLInputElement>;
  onImportDiagram: (file: File) => void;
  onImportDrawio: (file: File) => void;

  // Undo/redo
  onUndo: () => void;
  onRedo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Search
  searchQuery: string;
  setSearchQuery: (s: string) => void;

  // Type filter
  typeFilter: string[];
  typeFilterMenuOpen: boolean;
  setTypeFilterMenuOpen: Dispatch<SetStateAction<boolean>>;
  onToggleTypeFilter: (t: string) => void;
  onClearTypeFilter: () => void;

  // Subnet filter (pre-render — drops nodes outside selected subnets,
  // used as an escape hatch for large diagrams where React Flow freezes)
  subnetOptions: Array<{ id: number; name: string; cidr: string }>;
  subnetFilter: number[];
  subnetFilterMenuOpen: boolean;
  setSubnetFilterMenuOpen: Dispatch<SetStateAction<boolean>>;
  onToggleSubnetFilter: (id: number) => void;
  onClearSubnetFilter: () => void;

  // Layout options (consumed by Auto-Layout / Auto-Generate)
  layoutSettings: LayoutSettings;
  setLayoutSettings: (s: LayoutSettings) => void;
}

const DEVICE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'server', label: 'Server' },
  { value: 'workstation', label: 'Workstation' },
  { value: 'router', label: 'Router' },
  { value: 'switch', label: 'Switch' },
  { value: 'nas', label: 'NAS' },
  { value: 'firewall', label: 'Firewall' },
  { value: 'access_point', label: 'Access Point' },
  { value: 'iot', label: 'IoT Device' },
  { value: 'camera', label: 'Camera' },
  { value: 'phone', label: 'Phone' },
];

export default function DiagramToolbar(props: DiagramToolbarProps) {
  const {
    projectSlug,
    views, activeViewId, setCurrentViewId, viewMenuOpen, setViewMenuOpen,
    setEditingView, setEditingViewName, onCreateView,
    locked, setLocked, showLockHint,
    addDeviceOpen, setAddDeviceOpen, addSubnetOpen, setAddSubnetOpen,
    addDeviceId, setAddDeviceId, addSubnetId, setAddSubnetId,
    unplacedDevices, unplacedSubnets,
    onAddDevice, onAddSubnet,
    placingAnnotation, onAddAnnotation,
    imageFileInputRef, setImageLibraryOpen,
    selectMode, setSelectMode,
    showGrid, setShowGrid, showEdges, setShowEdges,
    showCredentials, setShowCredentials, showAv, setShowAv,
    showAgents, setShowAgents, showLegend, setShowLegend,
    showMinimap, setShowMinimap,
    onAutoLayoutGrid, onAutoLayout, onFitView,
    exportMenuOpen, setExportMenuOpen,
    onExportPng, onExportSvg, onExportDiagramJson, onExportDrawio,
    importMenuOpen, setImportMenuOpen,
    importFileRef, drawioImportFileRef,
    onImportDiagram, onImportDrawio,
    onUndo, onRedo, canUndo, canRedo,
    searchQuery, setSearchQuery,
    typeFilter, typeFilterMenuOpen, setTypeFilterMenuOpen,
    onToggleTypeFilter, onClearTypeFilter,
    subnetOptions, subnetFilter, subnetFilterMenuOpen, setSubnetFilterMenuOpen,
    onToggleSubnetFilter, onClearSubnetFilter,
    layoutSettings, setLayoutSettings,
  } = props;

  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const updateLayout = (patch: Partial<LayoutSettings>) => setLayoutSettings({ ...layoutSettings, ...patch });
  const layoutIsDefault =
    layoutSettings.direction === DEFAULT_LAYOUT_SETTINGS.direction &&
    layoutSettings.subnetsPerRow === DEFAULT_LAYOUT_SETTINGS.subnetsPerRow &&
    layoutSettings.devicesPerSubnetRow === DEFAULT_LAYOUT_SETTINGS.devicesPerSubnetRow &&
    layoutSettings.spacing === DEFAULT_LAYOUT_SETTINGS.spacing &&
    layoutSettings.sort === DEFAULT_LAYOUT_SETTINGS.sort;

  return (
    <div className="diagram-toolbar">
      {/* Group: Views */}
      {views.length > 0 && (
        <div className="diagram-tb-group">
          <div style={{ position: 'relative' }}>
            <button
              className={`diagram-tb-btn${viewMenuOpen ? ' active' : ''}`}
              data-tooltip="Views"
              onClick={() => setViewMenuOpen(v => !v)}
            >
              <Layers size={17} />
            </button>
            {viewMenuOpen && (
              <div className="diagram-tb-popover" style={{ minWidth: 200, flexDirection: 'column', alignItems: 'stretch', gap: '0.15rem' }}>
                {views.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0' }}>
                    <button
                      className={`btn btn-sm${activeViewId === v.id ? ' btn-primary' : ' btn-secondary'}`}
                      style={{ flex: 1, textAlign: 'left', justifyContent: 'flex-start', whiteSpace: 'nowrap' }}
                      onClick={() => { setCurrentViewId(v.id); setViewMenuOpen(false); }}
                    >
                      {v.name}{v.is_default ? ' (default)' : ''}
                    </button>
                    {!v.is_default && (
                      <button className="btn btn-sm" title="Edit" aria-label="Edit" onClick={() => { setEditingView({ id: v.id, name: v.name }); setEditingViewName(v.name); setViewMenuOpen(false); }}>
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                ))}
                <button className="btn btn-sm btn-secondary" style={{ width: '100%', marginTop: '0.3rem', whiteSpace: 'nowrap' }} onClick={onCreateView}>
                  <Plus size={13} /> New View
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Group: Add to Diagram */}
      <div className="diagram-tb-group">
        <div style={{ position: 'relative' }}>
          <button
            className={`diagram-tb-btn${addDeviceOpen ? ' active' : ''}`}
            data-tooltip="Add Device"
            disabled={locked}
            onClick={() => { setAddDeviceOpen(v => !v); setAddSubnetOpen(false); }}
          >
            <MonitorUp size={17} />
          </button>
          {addDeviceOpen && (
            <div className="diagram-tb-popover">
              <select value={addDeviceId} onChange={e => setAddDeviceId(e.target.value)}>
                <option value="">Select device...</option>
                {unplacedDevices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}
              </select>
              <button className="btn btn-primary btn-sm" disabled={!addDeviceId} onClick={() => { onAddDevice(); setAddDeviceOpen(false); }}>
                Add
              </button>
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            className={`diagram-tb-btn${addSubnetOpen ? ' active' : ''}`}
            data-tooltip="Add Subnet"
            disabled={locked}
            onClick={() => { setAddSubnetOpen(v => !v); setAddDeviceOpen(false); }}
          >
            <NetworkIcon size={17} />
          </button>
          {addSubnetOpen && (
            <div className="diagram-tb-popover">
              <select value={addSubnetId} onChange={e => setAddSubnetId(e.target.value)}>
                <option value="">Select subnet...</option>
                {unplacedSubnets.map(s => <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>)}
              </select>
              <button className="btn btn-primary btn-sm" disabled={!addSubnetId} onClick={() => { onAddSubnet(); setAddSubnetOpen(false); }}>
                Add
              </button>
            </div>
          )}
        </div>
        <button className={`diagram-tb-btn${placingAnnotation ? ' active' : ''}`} data-tooltip={placingAnnotation ? 'Click on diagram to place text (Esc to cancel)' : 'Add Text'} disabled={locked} onClick={onAddAnnotation}>
          <Type size={17} />
        </button>
        <button className="diagram-tb-btn" data-tooltip="Upload Image" disabled={locked} onClick={() => imageFileInputRef.current?.click()}>
          <Upload size={17} />
        </button>
        <button className="diagram-tb-btn" data-tooltip="Image Library" disabled={locked} onClick={() => setImageLibraryOpen(true)}>
          <ImagePlus size={17} />
        </button>
      </div>

      {/* Group: Interaction Mode */}
      <div className="diagram-tb-group">
        <button
          className={`diagram-tb-btn${locked ? ' active' : ''}${locked && showLockHint ? ' diagram-tb-btn-pulse' : ''}`}
          data-tooltip={locked ? 'Locked (click to unlock)' : 'Unlocked (click to lock)'}
          onClick={() => setLocked(v => !v)}
        >
          {locked ? <Lock size={17} /> : <Unlock size={17} />}
        </button>
        <button
          className={`diagram-tb-btn${selectMode ? ' active' : ''}`}
          data-tooltip={selectMode ? 'Selection Mode (click for Pan)' : 'Pan Mode (click for Select)'}
          disabled={locked}
          onClick={() => setSelectMode(v => { const next = !v; setStorage(`diagram-select-mode-${projectSlug}`, String(next)); return next; })}
        >
          <MousePointer2 size={17} />
        </button>
      </div>

      {/* Group: Display Toggles */}
      <div className="diagram-tb-group">
        <button
          className={`diagram-tb-btn${showGrid ? ' active' : ''}`}
          data-tooltip="Toggle Grid"
          onClick={() => setShowGrid(v => { setStorage(`diagram-show-grid-${projectSlug}`, String(!v)); return !v; })}
        >
          <Grid3x3 size={17} />
        </button>
        <button
          className={`diagram-tb-btn${showEdges ? ' active' : ''}`}
          data-tooltip="Toggle Connections"
          onClick={() => setShowEdges(v => { setStorage(`diagram-show-edges-${projectSlug}`, String(!v)); return !v; })}
        >
          <Share2 size={17} />
        </button>
        <button
          className={`diagram-tb-btn${showCredentials ? ' active' : ''}`}
          data-tooltip="Toggle Credentials"
          onClick={() => setShowCredentials(v => { setStorage(`diagram-show-credentials-${projectSlug}`, String(!v)); return !v; })}
        >
          <KeyRound size={17} />
        </button>
        <button
          className={`diagram-tb-btn${showAv ? ' active' : ''}`}
          data-tooltip="Toggle AV"
          onClick={() => setShowAv(v => { setStorage(`diagram-show-av-${projectSlug}`, String(!v)); return !v; })}
        >
          <Shield size={17} />
        </button>
        <button
          className={`diagram-tb-btn${showAgents ? ' active' : ''}`}
          data-tooltip="Toggle Agents"
          onClick={() => setShowAgents(v => { setStorage(`diagram-show-agents-${projectSlug}`, String(!v)); return !v; })}
        >
          <Bot size={17} />
        </button>
        <button
          className={`diagram-tb-btn${showLegend ? ' active' : ''}`}
          data-tooltip="Toggle Legend"
          onClick={() => setShowLegend(v => { setStorage(`diagram-show-legend-${projectSlug}`, String(!v)); return !v; })}
        >
          <List size={17} />
        </button>
        <button
          className={`diagram-tb-btn${showMinimap ? ' active' : ''}`}
          data-tooltip="Toggle Minimap"
          onClick={() => setShowMinimap(v => { setStorage(`diagram-show-minimap-${projectSlug}`, String(!v)); return !v; })}
        >
          <Map size={17} />
        </button>
      </div>

      {/* Group: Layout & View */}
      <div className="diagram-tb-group" style={{ position: 'relative' }}>
        <button className="diagram-tb-btn" data-tooltip="Auto Layout (preserve content)" disabled={locked} onClick={onAutoLayout}>
          <LayoutGrid size={17} />
        </button>
        <button className="diagram-tb-btn" data-tooltip="Auto Generate (wipes view)" disabled={locked} onClick={onAutoLayoutGrid}>
          <Wand2 size={17} />
        </button>
        <button
          className={`diagram-tb-btn${(layoutMenuOpen || !layoutIsDefault) ? ' active' : ''}`}
          data-tooltip="Layout Options"
          onClick={() => setLayoutMenuOpen(v => !v)}
        >
          <Sliders size={17} />
        </button>
        {layoutMenuOpen && (
          <div
            className="diagram-tb-popover"
            style={{ minWidth: 240, flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-1)' }}
          >
            <div className="diagram-tb-popover-section-label">Direction</div>
            {(['vertical', 'horizontal', 'square'] as const).map(d => (
              <label key={d} className="diagram-tb-popover-option">
                <input
                  type="radio"
                  name="layout-direction"
                  checked={layoutSettings.direction === d}
                  onChange={() => updateLayout({ direction: d })}
                />
                {d === 'vertical' ? 'Vertical (rows)' : d === 'horizontal' ? 'Horizontal (columns)' : 'Square'}
              </label>
            ))}

            <div className="diagram-tb-popover-section-label">
              {layoutSettings.direction === 'horizontal' ? 'Subnets per column' : 'Subnets per row'}
            </div>
            <input
              type="number"
              min={1}
              max={12}
              disabled={layoutSettings.direction === 'square'}
              value={layoutSettings.subnetsPerRow}
              onChange={e => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) updateLayout({ subnetsPerRow: Math.max(1, Math.min(12, Math.floor(n))) });
              }}
            />

            <div className="diagram-tb-popover-section-label">Devices per row in subnet</div>
            <input
              type="number"
              min={1}
              max={8}
              value={layoutSettings.devicesPerSubnetRow}
              onChange={e => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) updateLayout({ devicesPerSubnetRow: Math.max(1, Math.min(8, Math.floor(n))) });
              }}
            />

            <div className="diagram-tb-popover-section-label">Spacing</div>
            {(['compact', 'normal', 'spacious'] as const).map(s => (
              <label key={s} className="diagram-tb-popover-option">
                <input
                  type="radio"
                  name="layout-spacing"
                  checked={layoutSettings.spacing === s}
                  onChange={() => updateLayout({ spacing: s })}
                />
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </label>
            ))}

            <div className="diagram-tb-popover-section-label">Sort</div>
            {(['connected', 'name', 'created'] as const).map(s => (
              <label key={s} className="diagram-tb-popover-option">
                <input
                  type="radio"
                  name="layout-sort"
                  checked={layoutSettings.sort === s}
                  onChange={() => updateLayout({ sort: s })}
                />
                {s === 'connected' ? 'Connected (BFS)' : s === 'name' ? 'Alphabetical' : 'Created (oldest first)'}
              </label>
            ))}

            <button
              className="btn btn-sm btn-secondary"
              style={{ marginTop: 'var(--space-2)' }}
              disabled={layoutIsDefault}
              onClick={() => setLayoutSettings(DEFAULT_LAYOUT_SETTINGS)}
            >
              Reset to defaults
            </button>
          </div>
        )}
        <button
          className="diagram-tb-btn"
          data-tooltip="Fit to View"
          onClick={onFitView}
        >
          <Maximize size={17} />
        </button>
      </div>

      {/* Group: Export / Import */}
      <div className="diagram-tb-group relative">
        <button className={`diagram-tb-btn${exportMenuOpen ? ' active' : ''}`} data-tooltip="Export" onClick={() => setExportMenuOpen(v => !v)}>
          <Download size={17} />
        </button>
        {exportMenuOpen && (
          <div className="diagram-tb-popover diagram-tb-popover-narrow">
            <button className="btn btn-sm" onClick={() => { onExportPng(); setExportMenuOpen(false); }}>Export PNG</button>
            <button className="btn btn-sm" onClick={() => { onExportSvg(); setExportMenuOpen(false); }}>Export SVG</button>
            <button className="btn btn-sm" onClick={() => { onExportDiagramJson(); setExportMenuOpen(false); }}>Export Diagram JSON</button>
            <button className="btn btn-sm" onClick={() => { onExportDrawio(); setExportMenuOpen(false); }}>Export draw.io</button>
          </div>
        )}
      </div>
      <div className="diagram-tb-group relative">
        <input
          ref={importFileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onImportDiagram(file);
            e.target.value = '';
          }}
        />
        <input
          ref={drawioImportFileRef}
          type="file"
          accept=".drawio,.xml"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onImportDrawio(file);
            e.target.value = '';
          }}
        />
        <button
          className={`diagram-tb-btn${importMenuOpen ? ' active' : ''}`}
          data-tooltip="Import"
          onClick={() => setImportMenuOpen(v => !v)}
        >
          <Upload size={17} />
        </button>
        {importMenuOpen && (
          <div className="diagram-tb-popover diagram-tb-popover-narrow">
            <button
              className="btn btn-sm"
              onClick={() => { setImportMenuOpen(false); importFileRef.current?.click(); }}
            >
              Import Diagram JSON
            </button>
            <button
              className="btn btn-sm"
              onClick={() => { setImportMenuOpen(false); drawioImportFileRef.current?.click(); }}
            >
              Import from draw.io
            </button>
          </div>
        )}
      </div>

      {/* Group: Undo/Redo */}
      <div className="diagram-tb-group">
        <button
          className="diagram-tb-btn"
          data-tooltip="Undo (Ctrl+Z)"
          onClick={onUndo}
          disabled={!canUndo()}
        >
          <Undo2 size={17} />
        </button>
        <button
          className="diagram-tb-btn"
          data-tooltip="Redo (Ctrl+Shift+Z)"
          onClick={onRedo}
          disabled={!canRedo()}
        >
          <Redo2 size={17} />
        </button>
      </div>

      {/* Subnet filter (drops nodes outside selected subnets) */}
      <div className="diagram-tb-group ml-auto" style={{ position: 'relative' }}>
        <button
          className={`diagram-tb-btn${subnetFilter.length > 0 ? ' active' : ''}${subnetFilterMenuOpen ? ' active' : ''}`}
          data-tooltip={subnetFilter.length > 0 ? `Subnet filter (${subnetFilter.length})` : 'Show only selected subnets'}
          onClick={() => setSubnetFilterMenuOpen(v => !v)}
        >
          <NetworkIcon size={17} />
        </button>
        {subnetFilterMenuOpen && (
          <div className="diagram-tb-popover" style={{ minWidth: 220, maxHeight: 320, overflowY: 'auto', flexDirection: 'column', alignItems: 'stretch', gap: '0.2rem', right: 0, left: 'auto' }}>
            {subnetOptions.length === 0 ? (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', padding: '0.3rem' }}>No subnets on diagram</span>
            ) : subnetOptions.map(s => (
              <label
                key={s.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.2rem 0.3rem', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  style={{ width: 'auto', margin: 0 }}
                  checked={subnetFilter.includes(s.id)}
                  onChange={() => onToggleSubnetFilter(s.id)}
                />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.name} <span style={{ color: 'var(--color-text-muted)' }}>({s.cidr})</span>
                </span>
              </label>
            ))}
            {subnetFilter.length > 0 && (
              <button
                className="btn btn-sm btn-secondary"
                style={{ marginTop: '0.3rem', width: '100%' }}
                onClick={onClearSubnetFilter}
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Type filter + search */}
      <div className="diagram-tb-group" style={{ position: 'relative' }}>
        <button
          className={`diagram-tb-btn${typeFilter.length > 0 ? ' active' : ''}${typeFilterMenuOpen ? ' active' : ''}`}
          data-tooltip={typeFilter.length > 0 ? `Type filter (${typeFilter.length})` : 'Filter by type'}
          onClick={() => setTypeFilterMenuOpen(v => !v)}
        >
          <Filter size={17} />
        </button>
        {typeFilterMenuOpen && (
          <div className="diagram-tb-popover" style={{ minWidth: 180, flexDirection: 'column', alignItems: 'stretch', gap: '0.2rem', right: 0, left: 'auto' }}>
            {DEVICE_TYPE_OPTIONS.map(opt => (
              <label
                key={opt.value}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.2rem 0.3rem', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  style={{ width: 'auto', margin: 0 }}
                  checked={typeFilter.includes(opt.value)}
                  onChange={() => onToggleTypeFilter(opt.value)}
                />
                {opt.label}
              </label>
            ))}
            {typeFilter.length > 0 && (
              <button
                className="btn btn-sm btn-secondary"
                style={{ marginTop: '0.3rem', width: '100%' }}
                onClick={onClearTypeFilter}
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>
      <div className="diagram-search-wrap">
        <Search size={14} className="diagram-search-icon" />
        <input
          type="text"
          className="diagram-search"
          placeholder="Filter by name, IP, tag"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>
    </div>
  );
}
