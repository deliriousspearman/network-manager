import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchOutput } from '../../api/commandOutputs';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { computeLineDiff } from '../../utils/lineDiff';
import type { CommandOutput } from 'shared/types';

interface Props {
  outputs: CommandOutput[];
  projectId: number;
  onClose: () => void;
}

function formatTimestamp(capturedAt: string, title: string | null): string {
  const date = new Date(capturedAt + 'Z');
  const dateStr = date.toLocaleString();
  return title ? `${title} — ${dateStr}` : dateStr;
}

export default function DiffModal({ outputs, projectId, onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>();

  // Default: compare most recent (index 0) against the one before it (index 1)
  const [baseId, setBaseId] = useState(outputs[1]?.id ?? outputs[0].id);
  const [compareId, setCompareId] = useState(outputs[0].id);

  const { data: baseOutput } = useQuery({
    queryKey: ['output', projectId, baseId],
    queryFn: () => fetchOutput(projectId, baseId),
    enabled: baseId !== null,
  });

  const { data: compareOutput } = useQuery({
    queryKey: ['output', projectId, compareId],
    queryFn: () => fetchOutput(projectId, compareId),
    enabled: compareId !== null,
  });

  const diffLines = useMemo(() => {
    if (!baseOutput || !compareOutput) return null;
    return computeLineDiff(baseOutput.raw_output, compareOutput.raw_output);
  }, [baseOutput, compareOutput]);

  const addCount = diffLines?.filter(l => l.type === 'add').length ?? 0;
  const removeCount = diffLines?.filter(l => l.type === 'remove').length ?? 0;

  return createPortal(
    <div className="confirm-overlay" onClick={onClose}>
      <div
        ref={trapRef}
        className="confirm-dialog"
        style={{ maxWidth: 900, width: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="confirm-dialog-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Diff</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', padding: '0 0 0.75rem 0', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Base (older)</label>
            <select
              value={baseId}
              onChange={e => setBaseId(Number(e.target.value))}
              style={{ width: '100%', fontSize: '0.82rem' }}
            >
              {outputs.map(o => (
                <option key={o.id} value={o.id}>{formatTimestamp(o.captured_at, o.title)}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Compare (newer)</label>
            <select
              value={compareId}
              onChange={e => setCompareId(Number(e.target.value))}
              style={{ width: '100%', fontSize: '0.82rem' }}
            >
              {outputs.map(o => (
                <option key={o.id} value={o.id}>{formatTimestamp(o.captured_at, o.title)}</option>
              ))}
            </select>
          </div>
        </div>

        {diffLines && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
            <span style={{ color: 'rgb(34,197,94)', marginRight: '1rem' }}>+{addCount} added</span>
            <span style={{ color: 'rgb(239,68,68)' }}>−{removeCount} removed</span>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }}>
          {!diffLines ? (
            <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Loading...</div>
          ) : diffLines.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No differences found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '0.78rem' }}>
              <tbody>
                {diffLines.map((dl, i) => {
                  const bg =
                    dl.type === 'add' ? 'rgba(34,197,94,0.15)' :
                    dl.type === 'remove' ? 'rgba(239,68,68,0.15)' :
                    undefined;
                  const prefix = dl.type === 'add' ? '+' : dl.type === 'remove' ? '−' : ' ';
                  const prefixColor =
                    dl.type === 'add' ? 'rgb(34,197,94)' :
                    dl.type === 'remove' ? 'rgb(239,68,68)' :
                    'var(--color-text-secondary)';
                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td style={{ width: 28, padding: '1px 8px', color: prefixColor, userSelect: 'none', borderRight: '1px solid var(--color-border)' }}>
                        {prefix}
                      </td>
                      <td style={{ padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {dl.line}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="confirm-dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
