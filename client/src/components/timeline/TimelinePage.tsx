import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../ui/Toast';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { fetchSettings } from '../../api/settings';
import {
  fetchTimelineEntries,
  createTimelineEntry,
  updateTimelineEntry,
  deleteTimelineEntry,
} from '../../api/timeline';
import type { TimelineEntry, TimelineCategory } from 'shared/types';
import { TIMELINE_CATEGORIES, TIMELINE_CATEGORY_LABELS } from 'shared/types';
import LoadingSpinner from '../ui/LoadingSpinner';
import Pagination from '../ui/Pagination';
import TimelineList from './TimelineList';
import TimelineFormModal from './TimelineFormModal';

const PAGE_LIMIT = 50;

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

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    staleTime: 60_000,
  });

  const timezone = settings?.timezone ?? 'UTC';

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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTimelineEntry(projectId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
      toast('Timeline entry deleted', 'success');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

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

  return (
    <div>
      <div className="page-header">
        <h2>Timeline</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="diagram-search-wrap">
            <Search size={14} className="diagram-search-icon" />
            <input
              className="diagram-search"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search"
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
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Add Entry
          </button>
        </div>
      </div>

      {!isLoading && items.length === 0 ? (
        <div className="empty-state">
          No timeline entries yet. Add your first entry to document important decisions and changes.
        </div>
      ) : (
        <>
          <TimelineList
            entries={items}
            timezone={timezone}
            onEdit={handleEdit}
            onDelete={handleDelete}
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
