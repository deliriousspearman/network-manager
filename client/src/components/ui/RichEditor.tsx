import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered,
  Heading1, Heading2, Heading3,
  Quote, Code, Pilcrow, Eraser,
  ChevronDown, Table,
} from 'lucide-react';
import TableContextMenu from './TableContextMenu';

 
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
  const [colorPanelOpen, setColorPanelOpen] = useState(false);
  const [tablePanelOpen, setTablePanelOpen] = useState(false);
  const [tableHover, setTableHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; cell: HTMLTableCellElement } | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const tablePanelRef = useRef<HTMLDivElement>(null);
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
      {/* Text style */}
      <div className="rich-toolbar-group">
        <button type="button" className={cls('bold')} onMouseDown={prevent} onClick={() => run('bold')} title="Bold"><Bold size={13} /></button>
        <button type="button" className={cls('italic')} onMouseDown={prevent} onClick={() => run('italic')} title="Italic"><Italic size={13} /></button>
        <button type="button" className={cls('underline')} onMouseDown={prevent} onClick={() => run('underline')} title="Underline"><Underline size={13} /></button>
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
      </div>

      <div className="rich-toolbar-sep" />

      {/* Lists */}
      <div className="rich-toolbar-group">
        <button type="button" className={cls('insertUnorderedList')} onMouseDown={prevent} onClick={() => run('insertUnorderedList')} title="Bullet list"><List size={13} /></button>
        <button type="button" className={cls('insertOrderedList')} onMouseDown={prevent} onClick={() => run('insertOrderedList')} title="Numbered list"><ListOrdered size={13} /></button>
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

      {/* Clear all formatting */}
      <div className="rich-toolbar-group">
        <button type="button" className="rich-tb-btn" onMouseDown={prevent} onClick={() => run('removeFormat')} title="Clear formatting"><Eraser size={13} /></button>
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
