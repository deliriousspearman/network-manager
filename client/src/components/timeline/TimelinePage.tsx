import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, Search, Calendar, CheckSquare } from 'lucide-react';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../ui/Toast';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { fetchSettings } from '../../api/settings';
import { undoActivity } from '../../api/activityLogs';
import {
  fetchTimelineEntries,
  fetchTimelineSummary,
  createTimelineEntry,
  updateTimelineEntry,
  deleteTimelineEntry,
  bulkDeleteTimelineEntries,
} from '../../api/timeline';
import { undoMany } from '../../api/undo';
import type { TimelineEntry, TimelineCategory } from 'shared/types';
import { TIMELINE_CATEGORIES, TIMELINE_CATEGORY_LABELS } from 'shared/types';
import LoadingSpinner from '../ui/LoadingSpinner';
import Pagination from '../ui/Pagination';
import EmptyState from '../ui/EmptyState';
import TimelineList from './TimelineList';
import TimelineAxis from './TimelineAxis';
import TimelineFormModal from './TimelineFormModal';
import SimpleBulkDeleteBar from '../ui/SimpleBulkDeleteBar';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { PAGE_LIMIT } from '../../utils/constants';

export default function TimelinePage() {
  const { projectId } = useProject();
  const toast = useToast();
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);

  const handleSearch = useCallback((value: string) => { setSearch(value); setPage(1); }, []);
  const handleCategory = useCallback((value: string) => { setFilterCategory(value); setPage(1); }, []);
  const handleDateFrom = useCallback((value: string) => { setDateFrom(value); setPage(1); }, []);
  const handleDateTo = useCallback((value: string) => { setDateTo(value); setPage(1); }, []);

  const queryKey = ['timeline', projectId, page, PAGE_LIMIT, search, filterCategory, dateFrom, dateTo];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchTimelineEntries(projectId, {
      page, limit: PAGE_LIMIT, search,
      category: filterCategory, from: dateFrom, to: dateTo,
    }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: summary = [] } = useQuery({
    queryKey: ['timeline', projectId, 'summary', search, filterCategory, dateFrom, dateTo],
    queryFn: () => fetchTimelineSummary(projectId, {
      search, category: filterCategory, from: dateFrom, to: dateTo,
    }),
    staleTime: 30_000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    staleTime: 60_000,
  });

  const timezone = settings?.timezone ?? 'UTC';

  // When a user clicks a dot on the axis, highlight-scroll to the matching
  // entry row. The data-entry-id lookup falls back to a no-op if the entry
  // isn't on the current page (common with pagination), in which case we'd
  // need to navigate pages — left as a future refinement.
  const handleAxisClick = useCallback((id: number) => {
    const row = document.querySelector<HTMLDivElement>(`[data-entry-id="${id}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('timeline-item-flash');
      setTimeout(() => row.classList.remove('timeline-item-flash'), 1600);
    }
  }, []);

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createTimelineEntry>[1]) => createTimelineEntry(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
      toast('Timeline entry created', 'success');
      setShowForm(false);
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Parameters<typeof updateTimelineEntry>[2] & { id: number }) =>
      updateTimelineEntry(projectId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
      toast('Timeline entry updated', 'success');
      setEditingEntry(null);
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  // Track the activity log id of the last timeline delete on this page so
  // Ctrl+Z can undo it. Page-scoped: cleared on undo, error, or nav away.
  const lastDeletedLogId = useRef<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTimelineEntry(projectId, id),
    onSuccess: (data) => {
      lastDeletedLogId.current = data.log_id;
      queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
      toast('Timeline entry deleted — press Ctrl+Z to undo', 'success');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const undoMutation = useMutation({
    mutationFn: (logId: number) => undoActivity(projectId, logId),
    onSuccess: () => {
      lastDeletedLogId.current = null;
      queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
      toast('Delete undone', 'success');
    },
    onError: (err: Error) => {
      lastDeletedLogId.current = null;
      toast(err.message || 'Nothing to undo', 'error');
    },
  });

  const undoMutateRef = useRef(undoMutation.mutate);
  undoMutateRef.current = undoMutation.mutate;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
      if (!isUndo) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const logId = lastDeletedLogId.current;
      if (!logId) return;
      e.preventDefault();
      undoMutateRef.current(logId);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function handleDelete(entry: TimelineEntry) {
    const ok = await confirm(`Delete "${entry.title}"?`, 'Delete Entry');
    if (ok) deleteMutation.mutate(entry.id);
  }

  function handleEdit(entry: TimelineEntry) {
    setEditingEntry(entry);
  }

  const selectStyle: React.CSSProperties = {
    padding: '0.35rem 0.5rem',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    background: 'var(--color-input-bg)',
    color: 'var(--color-text)',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
  };

  if (isLoading && !data) return <LoadingSpinner />;

  const items = data?.items ?? [];
  const hasFilters = !!(search || filterCategory || dateFrom || dateTo);

  function clearFilters() {
    setSearch('');
    setFilterCategory('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const bulk = useBulkSelection<TimelineEntry>(items);
  const [selectMode, setSelectMode] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    bulk.clear();
  }, [bulk]);

  async function handleBulkDelete() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const ok = await confirm(
      `Delete ${ids.length} ${ids.length === 1 ? 'timeline entry' : 'timeline entries'}? They can be restored from Trash or with Ctrl+Z.`,
      'Delete Selected Entries',
    );
    if (!ok) return;
    setBulkPending(true);
    try {
      const { deleted, failed } = await bulkDeleteTimelineEntries(projectId, ids);
      queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
      if (deleted.length > 0) {
        toast(
          `Deleted ${deleted.length} ${deleted.length === 1 ? 'entry' : 'entries'}`,
          'success',
          {
            label: 'Undo all',
            onClick: async () => {
              const { restored } = await undoMany(projectId, deleted.length);
              queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
              queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
              toast(`Restored ${restored} ${restored === 1 ? 'entry' : 'entries'}`, 'success');
            },
          }
        );
      }
      if (failed.length > 0) {
        toast(`Failed to delete ${failed.length} ${failed.length === 1 ? 'entry' : 'entries'}`, 'error');
      }
      exitSelectMode();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete entries', 'error');
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Timeline</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="timeline-filter-bar">
            <div className="diagram-search-wrap">
              <Search size={14} className="diagram-search-icon" />
              <input
                className="diagram-search"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search title, description"
              />
            </div>
            <select value={filterCategory} onChange={e => handleCategory(e.target.value)} style={selectStyle}>
              <option value="">All categories</option>
              {TIMELINE_CATEGORIES.map(c => (
                <option key={c} value={c}>{TIMELINE_CATEGORY_LABELS[c as TimelineCategory]}</option>
              ))}
            </select>
            <div className="timeline-date-filter">
              <input type="date" value={dateFrom} onChange={e => handleDateFrom(e.target.value)} title="From date" />
              <span>to</span>
              <input type="date" value={dateTo} onChange={e => handleDateTo(e.target.value)} title="To date" />
            </div>
          </div>
          {items.length > 0 && (
            <button
              className={`btn btn-secondary btn-sm${selectMode ? ' active' : ''}`}
              onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}
              title={selectMode ? 'Exit select mode' : 'Select entries for bulk actions'}
              aria-pressed={selectMode}
            >
              <CheckSquare size={14} /> Select
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Add Entry
          </button>
        </div>
      </div>

      {selectMode && (
        <SimpleBulkDeleteBar
          count={bulk.count}
          noun="entry"
          pluralNoun="entries"
          onDelete={handleBulkDelete}
          onClose={exitSelectMode}
          pending={bulkPending}
        />
      )}

      {!isLoading && items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={<Calendar size={22} />}
            title="No entries match your filters"
            description="Try a different search term, category, or date range."
            action={<button className="btn" onClick={clearFilters}>Clear filters</button>}
          />
        ) : (
          <EmptyState
            icon={<Calendar size={22} />}
            title="No timeline entries yet"
            description="Document important decisions, incidents, and changes over time."
            action={<button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Add Your First Entry</button>}
          />
        )
      ) : (
        <>
          {summary.length > 1 && (
            <TimelineAxis items={summary} timezone={timezone} onItemClick={handleAxisClick} />
          )}
          <TimelineList
            entries={items}
            timezone={timezone}
            onEdit={handleEdit}
            onDelete={handleDelete}
            selectMode={selectMode}
            selectedIds={bulk.selectedIds}
            onToggleSelect={bulk.toggle}
          />
          {data && (
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              limit={data.limit}
              onChange={setPage}
            />
          )}
        </>
      )}

      {showForm && (
        <TimelineFormModal
          onClose={() => setShowForm(false)}
          onSave={data => createMutation.mutate(data)}
          isPending={createMutation.isPending}
        />
      )}

      {editingEntry && (
        <TimelineFormModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={data => updateMutation.mutate({ id: editingEntry.id, ...data })}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}
