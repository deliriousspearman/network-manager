import { useState, useEffect, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { fetchDevicesPaged, fetchDevice } from '../../api/devices';
import { queryKeys } from '../../api/queryKeys';
import { useProject } from '../../contexts/ProjectContext';

interface Props {
  value: number | null;
  onChange: (id: number | null, name?: string, primaryIp?: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  id?: string;
}

export default function DevicePicker({ value, onChange, placeholder = 'Select device...', allowClear = true, disabled, id }: Props) {
  const { projectId } = useProject();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data: selected } = useQuery({
    queryKey: queryKeys.devices.detail(projectId, value!),
    queryFn: () => fetchDevice(projectId, value!),
    enabled: value != null,
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.devices.picker(projectId, debounced),
    queryFn: () => fetchDevicesPaged(projectId, { page: 1, limit: 50, search: debounced }),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setDebounced('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const selectedLabel = selected
    ? `${selected.name}${selected.primary_ip ? ` (${selected.primary_ip})` : ''}`
    : '';

  return (
    <div ref={wrapRef} className="device-picker" id={id}>
      {open ? (
        <div className="device-picker-trigger open">
          <Search size={14} className="device-picker-search-icon" />
          <input
            ref={inputRef}
            className="device-picker-input"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, IP, hostname..."
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          />
          <ChevronUp
            size={14}
            className="device-picker-chevron"
            onClick={() => setOpen(false)}
            role="button"
            aria-label="Close"
          />
        </div>
      ) : (
        <button
          type="button"
          className="device-picker-trigger"
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={selectedLabel ? 'device-picker-value' : 'device-picker-placeholder'}>
            {selectedLabel || placeholder}
          </span>
          {allowClear && value != null && !disabled && (
            <span
              role="button"
              className="device-picker-clear"
              aria-label="Clear selection"
              onClick={e => { e.stopPropagation(); onChange(null); }}
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={14} className="device-picker-chevron" />
        </button>
      )}
      {open && (
        <div className="device-picker-menu" role="listbox">
          <div className="device-picker-list">
            {isLoading && <div className="device-picker-empty">Loading...</div>}
            {!isLoading && data && data.items.length === 0 && (
              <div className="device-picker-empty">No matches</div>
            )}
            {data?.items.map(d => (
              <button
                key={d.id}
                type="button"
                role="option"
                aria-selected={d.id === value}
                className={`device-picker-item${d.id === value ? ' active' : ''}`}
                onClick={() => {
                  onChange(d.id, d.name, d.primary_ip ?? null);
                  setOpen(false);
                }}
              >
                <span className="device-picker-item-name">{d.name}</span>
                {d.primary_ip && <span className="device-picker-item-ip">{d.primary_ip}</span>}
              </button>
            ))}
            {data && data.total > data.items.length && (
              <div className="device-picker-empty">{data.total - data.items.length} more — refine your search</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
