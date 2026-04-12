import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import type { PcapAnalyzeResult, PcapAnalyzedHost, PcapApplyAction, DeviceType } from 'shared/types';
import { DEVICE_TYPE_LABELS } from 'shared/types';
import { applyPcapActions } from '../../api/pcapImport';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useToast } from '../ui/Toast';

interface Props {
  result: PcapAnalyzeResult;
  projectId: number;
  source: 'pcap' | 'arp';
  onClose: () => void;
  onApplied: () => void;
}

interface HostAction {
  action: 'create' | 'merge' | 'skip';
  name: string;
  type: DeviceType;
}

function defaultAction(host: PcapAnalyzedHost): HostAction {
  return {
    action: host.matchedDevice ? 'merge' : 'create',
    name: host.ip,
    type: 'server',
  };
}

function PortsList({ ports }: { ports: { port: number; protocol: string }[] }) {
  const max = 4;
  const shown = ports.slice(0, max);
  const rest = ports.length - max;
  return (
    <span>
      {shown.map((p, i) => (
        <span key={i}>
          {i > 0 && ', '}
          <span className="badge badge-neutral" style={{ fontSize: '0.72rem', padding: '1px 5px' }}>
            {p.port}/{p.protocol}
          </span>
        </span>
      ))}
      {rest > 0 && <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}> +{rest} more</span>}
    </span>
  );
}

export default function PcapImportModal({ result, projectId, source, onClose, onApplied }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const toast = useToast();

  const [actions, setActions] = useState<Map<string, HostAction>>(() => {
    const map = new Map<string, HostAction>();
    for (const host of result.hosts) {
      map.set(host.ip, defaultAction(host));
    }
    return map;
  });

  const updateAction = (ip: string, update: Partial<HostAction>) => {
    setActions(prev => {
      const next = new Map(prev);
      const current = next.get(ip)!;
      next.set(ip, { ...current, ...update });
      return next;
    });
  };

  const applyMut = useMutation({
    mutationFn: (payload: PcapApplyAction[]) => applyPcapActions(projectId, payload),
    onSuccess: (data) => {
      const parts: string[] = [];
      if (data.created) parts.push(`${data.created} created`);
      if (data.merged) parts.push(`${data.merged} merged`);
      if (data.skipped) parts.push(`${data.skipped} skipped`);
      toast(parts.join(', ') || 'No changes', 'success');
      onApplied();
      onClose();
    },
    onError: () => toast('Failed to apply PCAP import', 'error'),
  });

  const handleApply = () => {
    const payload: PcapApplyAction[] = result.hosts.map(host => {
      const a = actions.get(host.ip)!;
      return {
        ip: host.ip,
        macs: host.macs,
        ports: host.ports,
        action: a.action,
        mergeDeviceId: a.action === 'merge' && host.matchedDevice ? host.matchedDevice.id : undefined,
        newDeviceName: a.action === 'create' ? a.name : undefined,
        newDeviceType: a.action === 'create' ? a.type : undefined,
      };
    });
    applyMut.mutate(payload);
  };

  const actionCount = [...actions.values()].filter(a => a.action !== 'skip').length;

  return createPortal(
    <div className="confirm-overlay" onClick={onClose}>
      <div
        className="confirm-dialog"
        ref={trapRef}
        style={{ maxWidth: 850, width: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="confirm-dialog-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{source === 'arp' ? 'ARP Import' : 'PCAP Import'}</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>

        <div style={{ padding: '0 1rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          Found <strong>{result.hosts.length}</strong> host{result.hosts.length !== 1 ? 's' : ''} in{' '}
          <strong>{result.totalPackets.toLocaleString()}</strong> {source === 'arp' ? 'entries' : 'packets'} from <em>{result.filename}</em>
        </div>

        {result.hosts.length === 0 ? (
          <div className="empty-state" style={{ margin: '2rem 1rem' }}>
            {source === 'arp'
              ? 'No hosts found in this ARP output. Expected format: output from `arp -avn` or `arp -a`.'
              : 'No hosts found in this capture file. Only IPv4 TCP/UDP traffic over Ethernet is extracted.'}
          </div>
        ) : (
          <div className="table-container" style={{ flex: 1, overflow: 'auto', margin: '0.5rem 0' }}>
            <table>
              <thead>
                <tr>
                  <th>IP Address</th>
                  <th>MAC</th>
                  <th>Ports</th>
                  <th>Packets</th>
                  <th>Match</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {result.hosts.map(host => {
                  const a = actions.get(host.ip)!;
                  return (
                    <tr key={host.ip}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{host.ip}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {host.macs[0] || '—'}
                      </td>
                      <td>{host.ports.length > 0 ? <PortsList ports={host.ports} /> : '—'}</td>
                      <td>{host.packetCount}</td>
                      <td>
                        {host.matchedDevice ? (
                          <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                            {host.matchedDevice.name} ({host.matchedDevice.matchType})
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>New</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <select
                            value={a.action}
                            onChange={e => updateAction(host.ip, { action: e.target.value as HostAction['action'] })}
                            style={{ fontSize: '0.8rem', padding: '0.2rem 0.3rem' }}
                          >
                            {host.matchedDevice && (
                              <option value="merge">Merge into {host.matchedDevice.name}</option>
                            )}
                            <option value="create">Create New</option>
                            <option value="skip">Skip</option>
                          </select>
                          {a.action === 'create' && (
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <input
                                type="text"
                                value={a.name}
                                onChange={e => updateAction(host.ip, { name: e.target.value })}
                                style={{ fontSize: '0.78rem', padding: '0.15rem 0.3rem', width: '110px' }}
                                placeholder="Device name"
                              />
                              <select
                                value={a.type}
                                onChange={e => updateAction(host.ip, { type: e.target.value as DeviceType })}
                                style={{ fontSize: '0.78rem', padding: '0.15rem 0.3rem' }}
                              >
                                {Object.entries(DEVICE_TYPE_LABELS).map(([val, label]) => (
                                  <option key={val} value={val}>{label}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="confirm-dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {result.hosts.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={handleApply}
              disabled={applyMut.isPending || actionCount === 0}
            >
              {applyMut.isPending ? 'Applying...' : `Apply (${actionCount})`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
