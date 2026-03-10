import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Monitor, Network, KeyRound, Star,
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered,
  Heading1, Heading2, Heading3,
  Quote, Code, Pilcrow, Eraser,
  ChevronDown,
} from 'lucide-react';
import { useProject } from '../../contexts/ProjectContext';
import { fetchProjectStats, updateProject } from '../../api/projects';
import { useParams } from 'react-router-dom';

function StatCard({ label, value, icon: Icon }: { label: string; value: number | undefined; icon: React.ElementType }) {
  return (
    <div className="card overview-stat-card">
      <div className="overview-stat-icon">
        <Icon size={20} />
      </div>
      <div className="overview-stat-value">{value ?? '—'}</div>
      <div className="overview-stat-label">{label}</div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exec(cmd: string, value?: string) {
  // execCommand is deprecated but remains the simplest cross-browser approach
  // for contenteditable formatting without a heavy library dependency
  document.execCommand(cmd, false, value);
}

const TRACKABLE_CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight', 'insertUnorderedList', 'insertOrderedList'];

const PRESET_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
  '#ea4335', '#e67c00', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#9900ff', '#c90076',
  '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#1c4587', '#660099',
  '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#ff00ff',
];

function RichToolbar({ editorRef }: { editorRef: React.RefObject<HTMLDivElement | null> }) {
  const [active, setActive] = useState<Set<string>>(new Set());
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [colorPanelOpen, setColorPanelOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => setActive(new Set(TRACKABLE_CMDS.filter(cmd => {
      try { return document.queryCommandState(cmd); } catch { return false; }
    })));
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  useEffect(() => {
    if (!colorPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPanelOpen]);

  const savedRangeRef = useRef<Range | null>(null);

  const prevent = (e: React.MouseEvent) => e.preventDefault();
  const focus = () => editorRef.current?.focus();
  const run = (cmd: string, value?: string) => { focus(); exec(cmd, value); };
  const cls = (cmd: string) => `rich-tb-btn${active.has(cmd) ? ' rich-tb-btn--active' : ''}`;

  const saveSelection = () => {
    const sel = document.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreAndRun = (cmd: string, value: string) => {
    editorRef.current?.focus();
    if (savedRangeRef.current) {
      const sel = document.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current); }
    }
    exec(cmd, value);
  };

  const applyColor = (color: string) => {
    setCurrentColor(color);
    setColorPanelOpen(false);
    focus();
    exec('foreColor', color);
  };

  return (
    <div className="rich-toolbar">
      {/* Text style */}
      <div className="rich-toolbar-group">
        <button className={cls('bold')} onMouseDown={prevent} onClick={() => run('bold')} title="Bold"><Bold size={13} /></button>
        <button className={cls('italic')} onMouseDown={prevent} onClick={() => run('italic')} title="Italic"><Italic size={13} /></button>
        <button className={cls('underline')} onMouseDown={prevent} onClick={() => run('underline')} title="Underline"><Underline size={13} /></button>
        <button className={cls('strikeThrough')} onMouseDown={prevent} onClick={() => run('strikeThrough')} title="Strikethrough"><Strikethrough size={13} /></button>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Block formats */}
      <div className="rich-toolbar-group">
        <button className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'h1')} title="Heading 1"><Heading1 size={13} /></button>
        <button className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'h2')} title="Heading 2"><Heading2 size={13} /></button>
        <button className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'h3')} title="Heading 3"><Heading3 size={13} /></button>
        <button className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'blockquote')} title="Blockquote"><Quote size={13} /></button>
        <button className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'pre')} title="Code block"><Code size={13} /></button>
        <button className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'p')} title="Normal paragraph"><Pilcrow size={13} /></button>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Lists */}
      <div className="rich-toolbar-group">
        <button className={cls('insertUnorderedList')} onMouseDown={prevent} onClick={() => run('insertUnorderedList')} title="Bullet list"><List size={13} /></button>
        <button className={cls('insertOrderedList')} onMouseDown={prevent} onClick={() => run('insertOrderedList')} title="Numbered list"><ListOrdered size={13} /></button>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Font size */}
      <div className="rich-toolbar-group">
        <select
          onMouseDown={saveSelection}
          onChange={e => { restoreAndRun('fontSize', e.target.value); e.target.value = ''; }}
          defaultValue=""
          className="rich-tb-select"
          title="Font size"
        >
          <option value="" disabled>Size</option>
          <option value="1">8</option>
          <option value="2">10</option>
          <option value="3">12</option>
          <option value="4">14</option>
          <option value="5">18</option>
          <option value="6">24</option>
          <option value="7">36</option>
        </select>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Font colour */}
      <div className="rich-toolbar-group">
        <div className="rich-tb-colorpicker" ref={colorPickerRef}>
          <button
            className="rich-tb-colorpicker-btn"
            onMouseDown={prevent}
            onClick={() => { focus(); exec('foreColor', currentColor); }}
            title="Apply text colour"
          >
            <span className="rich-tb-color-letter">A</span>
            <span className="rich-tb-color-bar" style={{ backgroundColor: currentColor }} />
          </button>
          <button
            className="rich-tb-colorpicker-arrow"
            onMouseDown={prevent}
            onClick={() => setColorPanelOpen(o => !o)}
            title="Text colour options"
          >
            <ChevronDown size={10} />
          </button>
          {colorPanelOpen && (
            <div className="rich-tb-colorpicker-panel">
              <div className="rich-tb-colorpicker-grid">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    className="rich-tb-colorpicker-swatch"
                    style={{ backgroundColor: c }}
                    onMouseDown={prevent}
                    onClick={() => applyColor(c)}
                    title={c}
                  />
                ))}
              </div>
              <div className="rich-tb-colorpicker-more">
                <button
                  className="rich-tb-colorpicker-more-btn"
                  onMouseDown={prevent}
                  onClick={() => { setColorPanelOpen(false); hiddenInputRef.current?.click(); }}
                >
                  More colors...
                </button>
              </div>
              <input
                ref={hiddenInputRef}
                type="color"
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                value={currentColor}
                onChange={e => applyColor(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Alignment */}
      <div className="rich-toolbar-group">
        <button className={cls('justifyLeft')} onMouseDown={prevent} onClick={() => run('justifyLeft')} title="Align left"><AlignLeft size={13} /></button>
        <button className={cls('justifyCenter')} onMouseDown={prevent} onClick={() => run('justifyCenter')} title="Align centre"><AlignCenter size={13} /></button>
        <button className={cls('justifyRight')} onMouseDown={prevent} onClick={() => run('justifyRight')} title="Align right"><AlignRight size={13} /></button>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Clear all formatting */}
      <div className="rich-toolbar-group">
        <button className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('removeFormat')} title="Clear formatting"><Eraser size={13} /></button>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { project, projectId } = useProject();
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  const { data: stats } = useQuery({
    queryKey: ['project-stats', projectId],
    queryFn: () => fetchProjectStats(projectId),
  });

  const updateMut = useMutation({
    mutationFn: (data: { description: string; about_title: string }) =>
      updateProject(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectSlug] });
      setEditing(false);
    },
  });

  // Populate editor innerHTML when edit mode opens
  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.innerHTML = project.description || '';
    }
  }, [editing]);

  const startEdit = () => {
    setDraftTitle(project.about_title || 'About this project');
    setEditing(true);
  };

  const handleSave = () => {
    const html = editorRef.current?.innerHTML || '';
    updateMut.mutate({ description: html, about_title: draftTitle });
  };

  // Check if stored description is HTML or plain text for backward compatibility
  const descIsHtml = !!(project.description && project.description.includes('<'));

  return (
    <div>
      <div className="page-header">
        <h2>{project.name}</h2>
      </div>

      {/* Stat cards */}
      <div className="overview-stats-row">
        <StatCard label="Hosts" value={stats?.device_count} icon={Monitor} />
        <StatCard label="Favourited" value={stats?.favourite_count} icon={Star} />
        <StatCard label="Subnets" value={stats?.subnet_count} icon={Network} />
        <StatCard label="Credentials" value={stats?.credential_count} icon={KeyRound} />
      </div>

      {/* About / Description */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          {editing ? (
            <input
              className="overview-title-input"
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              placeholder="Section title..."
            />
          ) : (
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              {project.about_title || 'About this project'}
            </h3>
          )}
          {!editing && (
            <button className="btn btn-secondary btn-sm" onClick={startEdit}>Edit</button>
          )}
        </div>

        {editing ? (
          <>
            <RichToolbar editorRef={editorRef} />
            <div
              ref={editorRef}
              className="overview-rich-editor"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Add a description for this project..."
            />
            {updateMut.isError && (
              <div className="error-message" style={{ marginTop: '0.5rem' }}>{String(updateMut.error)}</div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Saving...' : 'Save'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : project.description ? (
          descIsHtml
            ? <div className="overview-rich-content" dangerouslySetInnerHTML={{ __html: project.description }} />
            : <p className="overview-description-text">{project.description}</p>
        ) : (
          <p className="overview-description-text">
            <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>No description yet. Click Edit to add one.</span>
          </p>
        )}

        <div className="overview-meta">
          <span>Created {formatDate(project.created_at)}</span>
          <span>Updated {formatDate(project.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}
