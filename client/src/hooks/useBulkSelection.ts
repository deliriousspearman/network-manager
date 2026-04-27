import { useCallback, useMemo, useState } from 'react';

export function useBulkSelection<T extends { id: number }>(visibleItems: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggle = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected = useMemo(
    () => visibleItems.length > 0 && visibleItems.every(i => selectedIds.has(i.id)),
    [visibleItems, selectedIds],
  );

  const someVisibleSelected = useMemo(
    () => visibleItems.some(i => selectedIds.has(i.id)),
    [visibleItems, selectedIds],
  );

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const every = visibleItems.length > 0 && visibleItems.every(i => next.has(i.id));
      if (every) {
        for (const i of visibleItems) next.delete(i.id);
      } else {
        for (const i of visibleItems) next.add(i.id);
      }
      return next;
    });
  }, [visibleItems]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return {
    selectedIds,
    count: selectedIds.size,
    toggle,
    toggleAll,
    clear,
    allVisibleSelected,
    someVisibleSelected,
  };
}
