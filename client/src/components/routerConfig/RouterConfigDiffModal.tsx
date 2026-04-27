import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchConfig } from '../../api/routerConfigs';
import Modal from '../ui/Modal';
import { computeLineDiff } from '../../utils/lineDiff';
import { diffRows, ROW_KEY_FNS, type ParsedTableKey, type RowDiff } from '../../utils/rowDiff';
import { ParsedRowDiffView } from '../commands/DiffModal';
import type { RouterConfig, RouterConfigWithParsed } from 'shared/types';

interface Props {
  configs: RouterConfig[];
  projectId: number;
  onClose: () => void;
}

function formatTimestamp(capturedAt: string, title: string | null): string {
  const date = new Date(capturedAt + 'Z');
  const dateStr = date.toLocaleString();
  return title ? `${title} — ${dateStr}` : dateStr;
}

interface ParsedSection {
  title: string;
  field: keyof RouterConfigWithParsed;
  key: ParsedTableKey;
  columns: { key: string; label: string }[];
}

const SECTIONS: ParsedSection[] = [
  { title: 'Interfaces', field: 'parsed_interfaces', key: 'parsed_router_interfaces', columns: [
    { key: 'interface_name', label: 'Interface' },
    { key: 'description', label: 'Description' },
    { key: 'ip_address', label: 'IP' },
    { key: 'subnet_mask', label: 'Mask' },
    { key: 'vlan', label: 'VLAN' },
    { key: 'admin_status', label: 'Status' },
    { key: 'mac_address', label: 'MAC' },
  ]},
  { title: 'VLANs', field: 'parsed_vlans', key: 'parsed_router_vlans', columns: [
    { key: 'vlan_id', label: 'VLAN' },
    { key: 'name', label: 'Name' },
  ]},
  { title: 'Static Routes', field: 'parsed_static_routes', key: 'parsed_router_static_routes', columns: [
    { key: 'destination', label: 'Destination' },
    { key: 'mask', label: 'Mask' },
    { key: 'next_hop', label: 'Next hop' },
    { key: 'metric', label: 'Metric' },
    { key: 'admin_distance', label: 'AD' },
  ]},
  { title: 'Access Lists', field: 'parsed_acls', key: 'parsed_router_acls', columns: [
    { key: 'acl_name', label: 'ACL' },
    { key: 'sequence', label: 'Seq' },
    { key: 'action', label: 'Action' },
    { key: 'protocol', label: 'Proto' },
    { key: 'src', label: 'Src' },
    { key: 'src_port', label: 'Sport' },
    { key: 'dst', label: 'Dst' },
    { key: 'dst_port', label: 'Dport' },
  ]},
  { title: 'NAT Rules', field: 'parsed_nat_rules', key: 'parsed_router_nat_rules', columns: [
    { key: 'nat_type', label: 'Type' },
    { key: 'protocol', label: 'Proto' },
    { key: 'inside_src', label: 'Inside src' },
    { key: 'inside_port', label: 'Inside port' },
    { key: 'outside_src', label: 'Outside src' },
    { key: 'outside_port', label: 'Outside port' },
  ]},
  { title: 'DHCP Pools', field: 'parsed_dhcp_pools', key: 'parsed_router_dhcp_pools', columns: [
    { key: 'pool_name', label: 'Pool' },
    { key: 'network', label: 'Network' },
    { key: 'netmask', label: 'Netmask' },
    { key: 'default_router', label: 'Default router' },
    { key: 'lease_time', label: 'Lease' },
    { key: 'domain_name', label: 'Domain' },
  ]},
  { title: 'Users', field: 'parsed_users', key: 'parsed_router_users', columns: [
    { key: 'username', label: 'User' },
    { key: 'privilege', label: 'Priv' },
    { key: 'auth_method', label: 'Auth' },
  ]},
];

export default function RouterConfigDiffModal({ configs, projectId, onClose }: Props) {
  const [baseId, setBaseId] = useState(configs[1]?.id ?? configs[0].id);
  const [compareId, setCompareId] = useState(configs[0].id);
  const [view, setView] = useState<'parsed' | 'raw'>('parsed');

  const { data: baseConfig } = useQuery({
    queryKey: ['router-config', projectId, baseId],
    queryFn: () => fetchConfig(projectId, baseId),
  });
  const { data: compareConfig } = useQuery({
    queryKey: ['router-config', projectId, compareId],
    queryFn: () => fetchConfig(projectId, compareId),
  });

  const diffLines = useMemo(() => {
    if (!baseConfig || !compareConfig) return null;
    return computeLineDiff(baseConfig.raw_config, compareConfig.raw_config);
  }, [baseConfig, compareConfig]);

  const sectionDiffs = useMemo(() => {
    if (!baseConfig || !compareConfig) return null;
    return SECTIONS.map(section => {
      const before = (baseConfig[section.field] as Record<string, unknown>[] | undefined) ?? [];
      const after = (compareConfig[section.field] as Record<string, unknown>[] | undefined) ?? [];
      return { section, diff: diffRows(before, after, ROW_KEY_FNS[section.key]) };
    });
  }, [baseConfig, compareConfig]);

  const addCount = diffLines?.filter(l => l.type === 'add').length ?? 0;
  const removeCount = diffLines?.filter(l => l.type === 'remove').length ?? 0;

  return (
    <Modal
      onClose={onClose}
      style={{ maxWidth: 1100, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Router Config Diff</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
      }
    >
        <div style={{ display: 'flex', gap: '1rem', padding: '0 0 0.75rem 0', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Base (older)</label>
            <select value={baseId} onChange={e => setBaseId(Number(e.target.value))} style={{ width: '100%', fontSize: '0.82rem' }}>
              {configs.map(c => (
                <option key={c.id} value={c.id}>{formatTimestamp(c.captured_at, c.title)}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Compare (newer)</label>
            <select value={compareId} onChange={e => setCompareId(Number(e.target.value))} style={{ width: '100%', fontSize: '0.82rem' }}>
              {configs.map(c => (
                <option key={c.id} value={c.id}>{formatTimestamp(c.captured_at, c.title)}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
          <button className={`btn btn-sm ${view === 'parsed' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('parsed')}>Parsed</button>
          <button className={`btn btn-sm ${view === 'raw' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('raw')}>Raw</button>
        </div>

        {view === 'raw' && diffLines && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
            <span style={{ color: 'rgb(34,197,94)', marginRight: '1rem' }}>+{addCount} added</span>
            <span style={{ color: 'rgb(239,68,68)' }}>−{removeCount} removed</span>
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
                        <td style={{ width: 28, padding: '1px 8px', color: prefixColor, userSelect: 'none', borderRight: '1px solid var(--color-border)' }}>{prefix}</td>
                        <td style={{ padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{dl.line}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            !sectionDiffs ? (
              <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Loading...</div>
            ) : (
              <SectionedParsedDiff sections={sectionDiffs} />
            )
          )}
        </div>

        <div className="confirm-dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
    </Modal>
  );
}

interface SectionedProps {
  sections: { section: ParsedSection; diff: RowDiff<Record<string, unknown>> }[];
}

function SectionedParsedDiff({ sections }: SectionedProps) {
  const hasAny = sections.some(s => s.diff.added.length || s.diff.removed.length || s.diff.changed.length);
  if (!hasAny) {
    return <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No differences in parsed sections.</div>;
  }
  return (
    <div>
      {sections.map(({ section, diff }) => {
        const total = diff.added.length + diff.removed.length + diff.changed.length;
        if (total === 0) return null;
        return (
          <details key={section.key} open style={{ borderBottom: '1px solid var(--color-border)' }}>
            <summary style={{ cursor: 'pointer', padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.85rem', background: 'var(--color-bg-secondary, var(--color-bg))' }}>
              {section.title}{' '}
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400, fontSize: '0.78rem' }}>
                (+{diff.added.length} −{diff.removed.length} ~{diff.changed.length})
              </span>
            </summary>
            <div>
              <ParsedRowDiffView diff={diff} columns={section.columns} />
            </div>
          </details>
        );
      })}
    </div>
  );
}
