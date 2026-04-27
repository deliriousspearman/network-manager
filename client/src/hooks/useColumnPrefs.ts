import { useCallback, useEffect, useRef, useState } from 'react';
import { getStorage, setStorage } from '../utils/storage';

export interface ColumnDefBase {
  key: string;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
}

interface ColConfig { visible: Set<string>; order: string[] }

function load(storageKey: string, columns: ColumnDefBase[]): ColConfig {
  const defaultVisible = new Set(columns.filter(c => c.defaultVisible).map(c => c.key));
  const defaultOrder = columns.map(c => c.key);
  const stored = getStorage(storageKey);
  if (!stored) return { visible: defaultVisible, order: defaultOrder };
  try {
    const cfg = JSON.parse(stored);
    const validKeys = new Set(columns.map(c => c.key));

    const vis = new Set<string>(
      Array.isArray(cfg.visible) ? cfg.visible.filter((k: string) => validKeys.has(k)) : [...defaultVisible],
    );
    for (const col of columns) { if (col.alwaysVisible) vis.add(col.key); }
    if (vis.size === 0) for (const k of defaultVisible) vis.add(k);

    const order: string[] = Array.isArray(cfg.order) ? cfg.order.filter((k: string) => validKeys.has(k)) : [];
    const inOrder = new Set(order);
    for (const k of defaultOrder) { if (!inOrder.has(k)) order.push(k); }

    return { visible: vis, order };
  } catch {
    return { visible: defaultVisible, order: defaultOrder };
  }
}

function save(storageKey: string, visible: Set<string>, order: string[]) {
  setStorage(storageKey, JSON.stringify({ visible: [...visible], order }));
}

export function useColumnPrefs<T extends ColumnDefBase>(columns: T[], storageKey: string) {
  const initial = load(storageKey, columns);
  const [visible, setVisible] = useState<Set<string>>(initial.visible);
  const [order, setOrder] = useState<string[]>(initial.order);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const dragItem = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      save(storageKey, next, order);
      return next;
    });
  }, [storageKey, order]);

  const handleDragStart = useCallback((key: string) => { dragItem.current = key; }, []);
  const handleDragOver = useCallback((e: React.DragEvent, key: string) => {
    e.preventDefault();
    setDragOver(key);
  }, []);
  const handleDrop = useCallback((targetKey: string) => {
    const srcKey = dragItem.current;
    dragItem.current = null;
    setDragOver(null);
    if (!srcKey || srcKey === targetKey) return;
    setOrder(prev => {
      const next = [...prev];
      const srcIdx = next.indexOf(srcKey);
      const tgtIdx = next.indexOf(targetKey);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, srcKey);
      save(storageKey, visible, next);
      return next;
    });
  }, [storageKey, visible]);
  const handleDragEnd = useCallback(() => { dragItem.current = null; setDragOver(null); }, []);

  const reset = useCallback(() => {
    const defaultVisible = new Set(columns.filter(c => c.defaultVisible).map(c => c.key));
    const defaultOrder = columns.map(c => c.key);
    setVisible(defaultVisible);
    setOrder(defaultOrder);
    save(storageKey, defaultVisible, defaultOrder);
  }, [columns, storageKey]);

  const apply = useCallback((nextVisible: string[], nextOrder: string[]) => {
    const validKeys = new Set(columns.map(c => c.key));
    const vis = new Set(nextVisible.filter(k => validKeys.has(k)));
    for (const col of columns) { if (col.alwaysVisible) vis.add(col.key); }
    const ord = nextOrder.filter(k => validKeys.has(k));
    const inOrd = new Set(ord);
    for (const col of columns) { if (!inOrd.has(col.key)) ord.push(col.key); }
    setVisible(vis);
    setOrder(ord);
    save(storageKey, vis, ord);
  }, [columns, storageKey]);

  const openMenuAt = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [menu]);

  const colMap = new Map(columns.map(c => [c.key, c]));
  const active = order.map(k => colMap.get(k)).filter((c): c is T => !!c && visible.has(c.key));

  return {
    visible,
    order,
    active,
    menu,
    menuRef,
    dragOver,
    toggle,
    reset,
    apply,
    openMenuAt,
    closeMenu,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
