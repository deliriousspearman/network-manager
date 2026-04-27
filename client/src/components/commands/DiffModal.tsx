import { Fragment, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchOutput } from '../../api/commandOutputs';
import Modal from '../ui/Modal';
import { computeLineDiff } from '../../utils/lineDiff';
import { diffRows, ROW_KEY_FNS, type ParsedTableKey, type RowDiff } from '../../utils/rowDiff';
import type { CommandOutput, CommandOutputWithParsed, CommandType } from 'shared/types';

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

const COMMAND_TO_TABLE: Partial<Record<CommandType, { field: keyof CommandOutputWithParsed; key: ParsedTableKey; columns: { key: string; label: string }[] }>> = {
  ps: {
    field: 'parsed_processes', key: 'parsed_processes',
    columns: [{ key: 'pid', label: 'PID' }, { key: 'user', label: 'User' }, { key: 'cpu_percent', label: 'CPU%' }, { key: 'mem_percent', label: 'Mem%' }, { key: 'command', label: 'Command' }],
  },
  netstat: {
    field: 'parsed_connections', key: 'parsed_connections',
    columns: [{ key: 'protocol', label: 'Proto' }, { key: 'local_addr', label: 'Local' }, { key: 'foreign_addr', label: 'Foreign' }, { key: 'state', label: 'State' }, { key: 'pid_program', label: 'PID/Program' }],
  },
  last: {
    field: 'parsed_logins', key: 'parsed_logins',
    columns: [{ key: 'user', label: 'User' }, { key: 'terminal', label: 'TTY' }, { key: 'source_ip', label: 'Source' }, { key: 'login_time', label: 'Login' }, { key: 'duration', label: 'Duration' }],
  },
  ip_a: {
    field: 'parsed_interfaces', key: 'parsed_interfaces',
    columns: [{ key: 'interface_name', label: 'Interface' }, { key: 'state', label: 'State' }, { key: 'ip_addresses', label: 'IPs' }, { key: 'mac_address', label: 'MAC' }],
  },
  mount: {
    field: 'parsed_mounts', key: 'parsed_mounts',
    columns: [{ key: 'device', label: 'Device' }, { key: 'mount_point', label: 'Mount' }, { key: 'fs_type', label: 'Type' }, { key: 'options', label: 'Options' }],
  },
  ip_r: {
    field: 'parsed_routes', key: 'parsed_routes',
    columns: [{ key: 'destination', label: 'Destination' }, { key: 'gateway', label: 'Gateway' }, { key: 'device', label: 'Device' }, { key: 'protocol', label: 'Proto' }, { key: 'scope', label: 'Scope' }, { key: 'metric', label: 'Metric' }],
  },
  systemctl_status: {
    field: 'parsed_services', key: 'parsed_services',
    columns: [{ key: 'unit_name', label: 'Unit' }, { key: 'load', label: 'Load' }, { key: 'active', label: 'Active' }, { key: 'sub', label: 'Sub' }, { key: 'description', label: 'Description' }],
  },
  arp: {
    field: 'parsed_arp', key: 'parsed_arp',
    columns: [{ key: 'ip', label: 'IP' }, { key: 'mac_address', label: 'MAC' }, { key: 'interface_name', label: 'Interface' }],
  },
  user_history: {
    field: 'parsed_user_history', key: 'parsed_user_history',
    columns: [{ key: 'timestamp', label: 'Timestamp' }, { key: 'command', label: 'Command' }],
  },
};

export default function DiffModal({ outputs, projectId, onClose }: Props) {
  const [baseId, setBaseId] = useState(outputs[1]?.id ?? outputs[0].id);
  const [compareId, setCompareId] = useState(outputs[0].id);
  const commandType = outputs[0].command_type;
  const parsedConfig = COMMAND_TO_TABLE[commandType];
  const [view, setView] = useState<'parsed' | 'raw'>(parsedConfig ? 'parsed' : 'raw');

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

  const rowDiff = useMemo<RowDiff<Record<string, unknown>> | null>(() => {
    if (!baseOutput || !compareOutput || !parsedConfig) return null;
    const before = (baseOutput[parsedConfig.field] as Record<string, unknown>[] | undefined) ?? [];
    const after = (compareOutput[parsedConfig.field] as Record<string, unknown>[] | undefined) ?? [];
    return diffRows(before, after, ROW_KEY_FNS[parsedConfig.key]);
  }, [baseOutput, compareOutput, parsedConfig]);

  const addCount = diffLines?.filter(l => l.type === 'add').length ?? 0;
  const removeCount = diffLines?.filter(l => l.type === 'remove').length ?? 0;

  return (
    <Modal
      onClose={onClose}
      style={{ maxWidth: 1000, width: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Diff</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
      }
    >
        <div style={{ display: 'flex', gap: '1rem', padding: '0 0 0.75rem 0', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Base (older)</label>
            <select value={baseId} onChange={e => setBaseId(Number(e.target.value))} style={{ width: '100%', fontSize: '0.82rem' }}>
              {outputs.map(o => (
                <option key={o.id} value={o.id}>{formatTimestamp(o.captured_at, o.title)}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Compare (newer)</label>
            <select value={compareId} onChange={e => setCompareId(Number(e.target.value))} style={{ width: '100%', fontSize: '0.82rem' }}>
              {outputs.map(o => (
                <option key={o.id} value={o.id}>{formatTimestamp(o.captured_at, o.title)}</option>
              ))}
            </select>
          </div>
        </div>

        {parsedConfig && (
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
            <button
              className={`btn btn-sm ${view === 'parsed' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('parsed')}
            >Parsed rows</button>
            <button
              className={`btn btn-sm ${view === 'raw' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('raw')}
            >Raw text</button>
          </div>
        )}

        {view === 'raw' && diffLines && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
            <span style={{ color: 'rgb(34,197,94)', marginRight: '1rem' }}>+{addCount} added</span>
            <span style={{ color: 'rgb(239,68,68)' }}>−{removeCount} removed</span>
          </div>
        )}

        {view === 'parsed' && rowDiff && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
            <span style={{ color: 'rgb(34,197,94)', marginRight: '1rem' }}>+{rowDiff.added.length} added</span>
            <span style={{ color: 'rgb(239,68,68)', marginRight: '1rem' }}>−{rowDiff.removed.length} removed</span>
            <span style={{ color: 'rgb(234,179,8)' }}>~{rowDiff.changed.length} changed</span>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }}>
          {view === 'raw' ? (
            !diffLines ? (
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
            )
          ) : (
            parsedConfig && rowDiff ? (
              <ParsedRowDiffView diff={rowDiff} columns={parsedConfig.columns} />
            ) : (
              <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Loading...</div>
            )
          )}
        </div>

        <div className="confirm-dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
    </Modal>
  );
}

interface ParsedRowDiffViewProps {
  diff: RowDiff<Record<string, unknown>>;
  columns: { key: string; label: string }[];
}

export function ParsedRowDiffView({ diff, columns }: ParsedRowDiffViewProps) {
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
    return <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No differences in parsed rows.</div>;
  }
  const cellStyle: React.CSSProperties = { padding: '4px 8px', fontSize: '0.78rem', fontFamily: 'monospace', wordBreak: 'break-all' };
  const headerStyle: React.CSSProperties = { padding: '6px 8px', fontSize: '0.72rem', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--color-border)' };
  const sectionHeader = (title: string, count: number, color: string): React.ReactNode => (
    <tr style={{ background: 'var(--color-bg, #fafafa)' }}>
      <td colSpan={columns.length} style={{ padding: '6px 10px', fontSize: '0.78rem', fontWeight: 600, color }}>{title} ({count})</td>
    </tr>
  );
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {columns.map(c => <th key={c.key} style={headerStyle}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {diff.added.length > 0 && sectionHeader('Added', diff.added.length, 'rgb(34,197,94)')}
        {diff.added.map((row, i) => (
          <tr key={`a-${i}`} style={{ background: 'rgba(34,197,94,0.10)' }}>
            {columns.map(c => <td key={c.key} style={cellStyle}>{String(row[c.key] ?? '')}</td>)}
          </tr>
        ))}
        {diff.removed.length > 0 && sectionHeader('Removed', diff.removed.length, 'rgb(239,68,68)')}
        {diff.removed.map((row, i) => (
          <tr key={`r-${i}`} style={{ background: 'rgba(239,68,68,0.10)' }}>
            {columns.map(c => <td key={c.key} style={cellStyle}>{String(row[c.key] ?? '')}</td>)}
          </tr>
        ))}
        {diff.changed.length > 0 && sectionHeader('Changed', diff.changed.length, 'rgb(234,179,8)')}
        {diff.changed.map((entry, i) => (
          <Fragment key={`c-${i}`}>
            <tr style={{ background: 'rgba(239,68,68,0.08)' }}>
              {columns.map(c => (
                <td key={c.key} style={{
                  ...cellStyle,
                  fontWeight: entry.fields.includes(c.key) ? 600 : 400,
                }}>
                  {entry.fields.includes(c.key) ? '− ' : ''}{String(entry.before[c.key] ?? '')}
                </td>
              ))}
            </tr>
            <tr style={{ background: 'rgba(34,197,94,0.08)', borderBottom: '1px solid var(--color-border)' }}>
              {columns.map(c => (
                <td key={c.key} style={{
                  ...cellStyle,
                  fontWeight: entry.fields.includes(c.key) ? 600 : 400,
                }}>
                  {entry.fields.includes(c.key) ? '+ ' : ''}{String(entry.after[c.key] ?? '')}
                </td>
              ))}
            </tr>
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
