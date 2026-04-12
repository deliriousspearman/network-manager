import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { PRESET_COLORS } from './RichEditor';

interface Props {
  position: { x: number; y: number };
  cell: HTMLTableCellElement;
  onClose: () => void;
}

type SubMenu = 'insert' | 'delete' | 'colour' | null;

// ── Table helpers ────────────────────────────────────────────────────────────

function getTable(cell: HTMLTableCellElement): HTMLTableElement | null {
  return cell.closest('table');
}

function getTotalRows(table: HTMLTableElement): number {
  return table.querySelectorAll('tr').length;
}

function getTotalCols(table: HTMLTableElement): number {
  const firstRow = table.querySelector('tr');
  return firstRow ? firstRow.cells.length : 0;
}

function insertRow(cell: HTMLTableCellElement, position: 'above' | 'below') {
  const row = cell.closest('tr');
  const table = getTable(cell);
  if (!row || !table) return;

  const colCount = row.cells.length;
  const isInHead = !!cell.closest('thead');
  const newRow = document.createElement('tr');
  for (let i = 0; i < colCount; i++) {
    const tag = isInHead ? 'th' : 'td';
    const newCell = document.createElement(tag);
    newCell.innerHTML = '&nbsp;';
    newRow.appendChild(newCell);
  }

  if (position === 'above') {
    row.parentNode!.insertBefore(newRow, row);
  } else {
    row.parentNode!.insertBefore(newRow, row.nextSibling);
  }
}

function insertColumn(cell: HTMLTableCellElement, position: 'left' | 'right') {
  const table = getTable(cell);
  if (!table) return;

  const colIndex = cell.cellIndex;
  const insertIndex = position === 'left' ? colIndex : colIndex + 1;

  table.querySelectorAll('tr').forEach(row => {
    const isHeader = !!row.closest('thead');
    const tag = isHeader ? 'th' : 'td';
    const newCell = document.createElement(tag);
    newCell.innerHTML = '&nbsp;';
    if (insertIndex >= row.cells.length) {
      row.appendChild(newCell);
    } else {
      row.insertBefore(newCell, row.cells[insertIndex]);
    }
  });
}

function deleteRow(cell: HTMLTableCellElement) {
  const row = cell.closest('tr');
  const table = getTable(cell);
  if (!row || !table) return;

  if (getTotalRows(table) <= 1) return;
  row.remove();

  table.querySelectorAll('thead, tbody').forEach(section => {
    if (section.querySelectorAll('tr').length === 0) section.remove();
  });
}

function deleteColumn(cell: HTMLTableCellElement) {
  const table = getTable(cell);
  if (!table) return;

  const colIndex = cell.cellIndex;
  if (getTotalCols(table) <= 1) return;

  table.querySelectorAll('tr').forEach(row => {
    if (row.cells[colIndex]) row.cells[colIndex].remove();
  });
}

function deleteTable(cell: HTMLTableCellElement) {
  const table = getTable(cell);
  if (!table) return;
  table.remove();
}

function clearCell(cell: HTMLTableCellElement) {
  cell.innerHTML = '&nbsp;';
}

function duplicateRow(cell: HTMLTableCellElement) {
  const row = cell.closest('tr');
  if (!row) return;
  const clone = row.cloneNode(true) as HTMLTableRowElement;
  row.parentNode!.insertBefore(clone, row.nextSibling);
}

function toggleHeader(cell: HTMLTableCellElement) {
  const row = cell.closest('tr');
  if (!row) return;

  const isHeader = cell.tagName === 'TH';
  const newTag = isHeader ? 'td' : 'th';

  Array.from(row.cells).forEach(oldCell => {
    const newCell = document.createElement(newTag);
    newCell.innerHTML = oldCell.innerHTML;
    if (oldCell.style.backgroundColor) newCell.style.backgroundColor = oldCell.style.backgroundColor;
    oldCell.replaceWith(newCell);
  });
}

function setCellColour(cell: HTMLTableCellElement, colour: string | null) {
  cell.style.backgroundColor = colour || '';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TableContextMenu({ position, cell, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subMenu, setSubMenu] = useState<SubMenu>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const table = getTable(cell);
  const totalRows = table ? getTotalRows(table) : 0;
  const totalCols = table ? getTotalCols(table) : 0;
  const isHeader = cell.tagName === 'TH';
  const currentBg = cell.style.backgroundColor || null;

  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu table-context-menu"
      style={{ left: position.x, top: position.y, position: 'fixed' }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="context-menu-items">
        {/* Insert submenu */}
        <div
          className="context-menu-sub"
          onMouseEnter={() => setSubMenu('insert')}
          onMouseLeave={() => setSubMenu(s => (s === 'insert' ? null : s))}
        >
          <button className="context-menu-item context-menu-item--parent">
            Insert <ChevronRight size={12} />
          </button>
          {subMenu === 'insert' && (
            <div className="context-menu context-menu--sub">
              <div className="context-menu-items">
                <button className="context-menu-item" onClick={() => act(() => insertRow(cell, 'above'))}>Row above</button>
                <button className="context-menu-item" onClick={() => act(() => insertRow(cell, 'below'))}>Row below</button>
                <button className="context-menu-item" onClick={() => act(() => insertColumn(cell, 'left'))}>Column left</button>
                <button className="context-menu-item" onClick={() => act(() => insertColumn(cell, 'right'))}>Column right</button>
              </div>
            </div>
          )}
        </div>

        {/* Delete submenu */}
        <div
          className="context-menu-sub"
          onMouseEnter={() => setSubMenu('delete')}
          onMouseLeave={() => setSubMenu(s => (s === 'delete' ? null : s))}
        >
          <button className="context-menu-item context-menu-item--parent">
            Delete <ChevronRight size={12} />
          </button>
          {subMenu === 'delete' && (
            <div className="context-menu context-menu--sub">
              <div className="context-menu-items">
                <button className="context-menu-item danger" disabled={totalRows <= 1} onClick={() => act(() => deleteRow(cell))}>Row</button>
                <button className="context-menu-item danger" disabled={totalCols <= 1} onClick={() => act(() => deleteColumn(cell))}>Column</button>
                <button className="context-menu-item danger" onClick={() => act(() => deleteTable(cell))}>Table</button>
              </div>
            </div>
          )}
        </div>

        <div className="context-menu-divider" />

        {/* Cell colour submenu */}
        <div
          className="context-menu-sub"
          onMouseEnter={() => setSubMenu('colour')}
          onMouseLeave={() => setSubMenu(s => (s === 'colour' ? null : s))}
        >
          <button className="context-menu-item context-menu-item--parent">
            Cell colour <ChevronRight size={12} />
          </button>
          {subMenu === 'colour' && (
            <div className="context-menu context-menu--sub">
              <div className="context-menu-colour-grid">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    className={`context-menu-colour-swatch${currentBg === c ? ' active' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => act(() => setCellColour(cell, c))}
                    title={c}
                  />
                ))}
                <button
                  className="context-menu-colour-swatch reset"
                  onClick={() => act(() => setCellColour(cell, null))}
                  title="Remove colour"
                >
                  &times;
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="context-menu-divider" />

        <button className="context-menu-item" onClick={() => act(() => clearCell(cell))}>
          Clear cell
        </button>
        <button className="context-menu-item" onClick={() => act(() => duplicateRow(cell))}>
          Duplicate row
        </button>
        <button className="context-menu-item" onClick={() => act(() => toggleHeader(cell))}>
          {isHeader ? 'Convert to normal row' : 'Convert to header row'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
