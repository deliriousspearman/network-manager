import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered,
  Heading1, Heading2, Heading3,
  Quote, Code, Pilcrow, Eraser,
  ChevronDown, Table, Link as LinkIcon, Unlink,
  Undo2, Redo2, Minus,
} from 'lucide-react';
import TableContextMenu from './TableContextMenu';

// Normalize a user-entered URL. If the user typed "example.com" without a
// scheme, prefix https://. Anything using javascript:/data:/file: etc. is
// rejected (the sanitizer would strip it anyway, but blocking client-side
// gives immediate feedback).
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

 
export function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

export const TRACKABLE_CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight', 'insertUnorderedList', 'insertOrderedList'];

export const PRESET_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
  '#ea4335', '#e67c00', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#9900ff', '#c90076',
  '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#1c4587', '#660099',
  '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#ff00ff',
];

export function RichToolbar({ editorRef }: { editorRef: React.RefObject<HTMLDivElement | null> }) {
  const [active, setActive] = useState<Set<string>>(new Set());
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [currentHighlight, setCurrentHighlight] = useState('#ffff00');
  const [colorPanelOpen, setColorPanelOpen] = useState(false);
  const [highlightPanelOpen, setHighlightPanelOpen] = useState(false);
  const [tablePanelOpen, setTablePanelOpen] = useState(false);
  const [tableHover, setTableHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; cell: HTMLTableCellElement } | null>(null);
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const highlightPickerRef = useRef<HTMLDivElement>(null);
  const tablePanelRef = useRef<HTMLDivElement>(null);
  const linkPanelRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const hiddenHighlightInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!highlightPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (highlightPickerRef.current && !highlightPickerRef.current.contains(e.target as Node)) {
        setHighlightPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [highlightPanelOpen]);

  useEffect(() => {
    if (!tablePanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (tablePanelRef.current && !tablePanelRef.current.contains(e.target as Node)) {
        setTablePanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tablePanelOpen]);

  useEffect(() => {
    if (!linkPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (linkPanelRef.current && !linkPanelRef.current.contains(e.target as Node)) {
        setLinkPanelOpen(false);
        setLinkError('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [linkPanelOpen]);

  const handleEditorContextMenu = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const cell = target.closest('td, th') as HTMLTableCellElement | null;
    if (cell && editorRef.current?.contains(cell)) {
      e.preventDefault();
      setTableMenu({ x: e.clientX, y: e.clientY, cell });
    }
  }, [editorRef]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.addEventListener('contextmenu', handleEditorContextMenu);
    return () => el.removeEventListener('contextmenu', handleEditorContextMenu);
  }, [editorRef, handleEditorContextMenu]);

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

  const applyColor = (color: string) => {
    setCurrentColor(color);
    setColorPanelOpen(false);
    focus();
    exec('foreColor', color);
  };

  // Reset the foreground colour on the current selection. execCommand has no
  // dedicated "no colour" option, so we force CSS output and set the colour
  // to the CSS keyword `inherit` — the sanitizer keeps the style attribute
  // but the value resolves back to the editor's base text colour at render
  // time, which is what the user actually wants here.
  const clearColor = () => {
    setColorPanelOpen(false);
    focus();
    exec('styleWithCSS', 'true');
    exec('foreColor', 'inherit');
  };

  // Highlight / background colour. Chrome only recognises `backColor` for
  // inline text ranges; Firefox uses `hiliteColor`. Firing both lets the
  // browser pick whichever it actually implements.
  const applyHighlight = (color: string) => {
    setCurrentHighlight(color);
    setHighlightPanelOpen(false);
    focus();
    exec('styleWithCSS', 'true');
    exec('hiliteColor', color);
    exec('backColor', color);
  };

  const clearHighlight = () => {
    setHighlightPanelOpen(false);
    focus();
    exec('styleWithCSS', 'true');
    exec('hiliteColor', 'transparent');
    exec('backColor', 'transparent');
  };

  // execCommand('fontSize') only accepts legacy 1-7 values that browsers map
  // to inconsistent pixel sizes. Instead, wrap the selected range in a
  // <span style="font-size: …"> via insertHTML so the browser gets to record
  // one undoable step and the output uses real CSS units that match what
  // the sanitizer already allows.
  const applyFontSize = (sizePx: string) => {
    editorRef.current?.focus();
    if (savedRangeRef.current) {
      const sel = document.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current); }
    }
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const container = document.createElement('div');
    container.appendChild(sel.getRangeAt(0).cloneContents());
    exec('insertHTML', `<span style="font-size: ${sizePx}">${container.innerHTML}</span>`);
  };

  // Open the link popover, capturing the selection first. If the caret is
  // already inside an existing <a>, prefill the input with its href so the
  // user can edit it.
  const openLinkPanel = () => {
    saveSelection();
    const sel = document.getSelection();
    const anchorEl = sel?.anchorNode?.parentElement?.closest('a');
    setLinkUrl(anchorEl?.getAttribute('href') ?? '');
    setLinkError('');
    setLinkPanelOpen(true);
    // Focus the input on next tick so it's ready after the panel mounts.
    setTimeout(() => linkInputRef.current?.focus(), 0);
  };

  const applyLink = () => {
    const normalized = normalizeUrl(linkUrl);
    if (!normalized) {
      setLinkError('Enter a valid http(s) or mailto URL');
      return;
    }
    editorRef.current?.focus();
    if (savedRangeRef.current) {
      const sel = document.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current); }
    }
    // If the selection is collapsed, createLink inserts nothing — insert the
    // URL text itself so there's visible anchor content.
    const sel = document.getSelection();
    if (sel && sel.isCollapsed) {
      exec('insertHTML', `<a href="${normalized}">${normalized}</a>`);
    } else {
      exec('createLink', normalized);
    }
    setLinkPanelOpen(false);
    setLinkUrl('');
    setLinkError('');
  };

  const removeLink = () => {
    focus();
    exec('unlink');
  };

  // Ctrl/Cmd+K opens the link popover when the editor has focus. Ctrl+B/I/U
  // are handled by the browser's own contenteditable shortcuts — no custom
  // wiring needed there.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openLinkPanel();
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [editorRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const insertTable = (rows: number, cols: number) => {
    setTablePanelOpen(false);
    focus();
    const headerCells = Array.from({ length: cols }, (_, i) => `<th>Header ${i + 1}</th>`).join('');
    const bodyRow = '<td>&nbsp;</td>'.repeat(cols);
    const bodyRows = Array.from({ length: rows - 1 }, () => `<tr>${bodyRow}</tr>`).join('');
    const html = `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table><p><br></p>`;
    exec('insertHTML', html);
  };

  const TABLE_GRID = 6;

  return (
    <div className="rich-toolbar">
      {/* Undo / Redo — the browser handles Ctrl+Z on contentEditable, but
          re-initialising innerHTML from React can nuke the stack silently,
          so exposing explicit buttons gives a reliable fallback. */}
      <div className="rich-toolbar-group">
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('undo')} title="Undo (Ctrl+Z)"><Undo2 size={13} /></button>
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('redo')} title="Redo (Ctrl+Shift+Z)"><Redo2 size={13} /></button>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Text style */}
      <div className="rich-toolbar-group">
        <button type="button" className={cls('bold')} onMouseDown={prevent} onClick={() => run('bold')} title="Bold (Ctrl+B)"><Bold size={13} /></button>
        <button type="button" className={cls('italic')} onMouseDown={prevent} onClick={() => run('italic')} title="Italic (Ctrl+I)"><Italic size={13} /></button>
        <button type="button" className={cls('underline')} onMouseDown={prevent} onClick={() => run('underline')} title="Underline (Ctrl+U)"><Underline size={13} /></button>
        <button type="button" className={cls('strikeThrough')} onMouseDown={prevent} onClick={() => run('strikeThrough')} title="Strikethrough"><Strikethrough size={13} /></button>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Block formats */}
      <div className="rich-toolbar-group">
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'h1')} title="Heading 1"><Heading1 size={13} /></button>
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'h2')} title="Heading 2"><Heading2 size={13} /></button>
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'h3')} title="Heading 3"><Heading3 size={13} /></button>
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'blockquote')} title="Blockquote"><Quote size={13} /></button>
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'pre')} title="Code block"><Code size={13} /></button>
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('formatBlock', 'p')} title="Normal paragraph"><Pilcrow size={13} /></button>
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('insertHorizontalRule')} title="Horizontal rule"><Minus size={13} /></button>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Lists */}
      <div className="rich-toolbar-group">
        <button type="button" className={cls('insertUnorderedList')} onMouseDown={prevent} onClick={() => run('insertUnorderedList')} title="Bullet list"><List size={13} /></button>
        <button type="button" className={cls('insertOrderedList')} onMouseDown={prevent} onClick={() => run('insertOrderedList')} title="Numbered list"><ListOrdered size={13} /></button>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Links */}
      <div className="rich-toolbar-group">
        <div className="rich-tb-linkpicker" ref={linkPanelRef}>
          <button
            type="button"
            className="rich-tb-btn"
            onMouseDown={prevent}
            onClick={openLinkPanel}
            title="Insert link (Ctrl+K)"
          >
            <LinkIcon size={13} />
          </button>
          {linkPanelOpen && (
            <div className="rich-tb-linkpicker-panel">
              <input
                ref={linkInputRef}
                type="url"
                className="rich-tb-linkpicker-input"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={e => { setLinkUrl(e.target.value); if (linkError) setLinkError(''); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                  if (e.key === 'Escape') { setLinkPanelOpen(false); setLinkError(''); }
                }}
              />
              {linkError && <div className="rich-tb-linkpicker-error">{linkError}</div>}
              <div className="rich-tb-linkpicker-actions">
                <button type="button" className="btn btn-sm btn-primary" onMouseDown={prevent} onClick={applyLink}>Apply</button>
                <button type="button" className="btn btn-sm" onMouseDown={prevent} onClick={() => { setLinkPanelOpen(false); setLinkError(''); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={removeLink} title="Remove link"><Unlink size={13} /></button>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Font size */}
      <div className="rich-toolbar-group">
        <select
          onMouseDown={saveSelection}
          onChange={e => { applyFontSize(e.target.value); e.target.value = ''; }}
          defaultValue=""
          className="rich-tb-select"
          title="Font size"
        >
          <option value="" disabled>Size</option>
          <option value="10px">10</option>
          <option value="12px">12</option>
          <option value="14px">14</option>
          <option value="16px">16</option>
          <option value="18px">18</option>
          <option value="24px">24</option>
          <option value="32px">32</option>
          <option value="48px">48</option>
        </select>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Font colour */}
      <div className="rich-toolbar-group">
        <div className="rich-tb-colorpicker" ref={colorPickerRef}>
          <button
            type="button"
            className="rich-tb-colorpicker-btn"
            onMouseDown={prevent}
            onClick={() => { focus(); exec('foreColor', currentColor); }}
            title="Apply text colour"
          >
            <span className="rich-tb-color-letter">A</span>
            <span className="rich-tb-color-bar" style={{ backgroundColor: currentColor }} />
          </button>
          <button
            type="button"
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
                    type="button"
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
                  type="button"
                  className="rich-tb-colorpicker-more-btn"
                  onMouseDown={prevent}
                  onClick={clearColor}
                >
                  Remove colour
                </button>
                <button
                  type="button"
                  className="rich-tb-colorpicker-more-btn"
                  onMouseDown={prevent}
                  onClick={() => { setColorPanelOpen(false); hiddenInputRef.current?.click(); }}
                >
                  More colours...
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

        {/* Highlight / background colour */}
        <div className="rich-tb-colorpicker" ref={highlightPickerRef}>
          <button
            type="button"
            className="rich-tb-colorpicker-btn"
            onMouseDown={prevent}
            onClick={() => applyHighlight(currentHighlight)}
            title="Apply highlight colour"
          >
            <span className="rich-tb-color-letter" style={{ backgroundColor: currentHighlight, padding: '0 3px', borderRadius: 2 }}>A</span>
          </button>
          <button
            type="button"
            className="rich-tb-colorpicker-arrow"
            onMouseDown={prevent}
            onClick={() => setHighlightPanelOpen(o => !o)}
            title="Highlight colour options"
          >
            <ChevronDown size={10} />
          </button>
          {highlightPanelOpen && (
            <div className="rich-tb-colorpicker-panel">
              <div className="rich-tb-colorpicker-grid">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className="rich-tb-colorpicker-swatch"
                    style={{ backgroundColor: c }}
                    onMouseDown={prevent}
                    onClick={() => applyHighlight(c)}
                    title={c}
                  />
                ))}
              </div>
              <div className="rich-tb-colorpicker-more">
                <button
                  type="button"
                  className="rich-tb-colorpicker-more-btn"
                  onMouseDown={prevent}
                  onClick={clearHighlight}
                >
                  Remove highlight
                </button>
                <button
                  type="button"
                  className="rich-tb-colorpicker-more-btn"
                  onMouseDown={prevent}
                  onClick={() => { setHighlightPanelOpen(false); hiddenHighlightInputRef.current?.click(); }}
                >
                  More colours...
                </button>
              </div>
              <input
                ref={hiddenHighlightInputRef}
                type="color"
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                value={currentHighlight}
                onChange={e => applyHighlight(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Alignment */}
      <div className="rich-toolbar-group">
        <button type="button" className={cls('justifyLeft')} onMouseDown={prevent} onClick={() => run('justifyLeft')} title="Align left"><AlignLeft size={13} /></button>
        <button type="button" className={cls('justifyCenter')} onMouseDown={prevent} onClick={() => run('justifyCenter')} title="Align centre"><AlignCenter size={13} /></button>
        <button type="button" className={cls('justifyRight')} onMouseDown={prevent} onClick={() => run('justifyRight')} title="Align right"><AlignRight size={13} /></button>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Table */}
      <div className="rich-toolbar-group">
        <div className="rich-tb-tablepicker" ref={tablePanelRef}>
          <button
            className="rich-tb-btn"
            onMouseDown={prevent}
            onClick={() => setTablePanelOpen(o => !o)}
            title="Insert table"
          >
            <Table size={13} />
          </button>
          {tablePanelOpen && (
            <div className="rich-tb-tablepicker-panel">
              <div className="rich-tb-tablepicker-label">{tableHover.r > 0 ? `${tableHover.r} × ${tableHover.c}` : 'Select size'}</div>
              <div className="rich-tb-tablepicker-grid">
                {Array.from({ length: TABLE_GRID }, (_, r) =>
                  Array.from({ length: TABLE_GRID }, (_, c) => (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      className={`rich-tb-tablepicker-cell${r < tableHover.r && c < tableHover.c ? ' rich-tb-tablepicker-cell--active' : ''}`}
                      onMouseEnter={() => setTableHover({ r: r + 1, c: c + 1 })}
                      onMouseDown={prevent}
                      onClick={() => insertTable(r + 1, c + 1)}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rich-toolbar-sep" />

      {/* Clear all formatting — removeFormat only strips inline styles and
          leaves block wrappers like <h1>/<blockquote> behind, so pair it
          with a formatBlock:p call to fully reset the selection to a
          plain paragraph. */}
      <div className="rich-toolbar-group">
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => { focus(); exec('removeFormat'); exec('formatBlock', 'p'); }} title="Clear formatting"><Eraser size={13} /></button>
      </div>

      {tableMenu && (
        <TableContextMenu
          position={{ x: tableMenu.x, y: tableMenu.y }}
          cell={tableMenu.cell}
          onClose={() => setTableMenu(null)}
        />
      )}
    </div>
  );
}
