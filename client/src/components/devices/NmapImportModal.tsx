import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { NmapAnalyzeResult, NmapAnalyzedHost, NmapApplyAction, DeviceType } from 'shared/types';
import { DEVICE_TYPE_LABELS } from 'shared/types';
import { applyNmapActions } from '../../api/pcapImport';
import { useToast } from '../ui/Toast';
import Modal from '../ui/Modal';
import PortsList from '../ui/PortsList';

interface Props {
  result: NmapAnalyzeResult;
  projectId: number;
  onClose: () => void;
  onApplied: () => void;
}

interface HostAction {
  action: 'create' | 'merge' | 'skip';
  name: string;
  type: DeviceType;
  addPorts: boolean;
}

function defaultAction(host: NmapAnalyzedHost): HostAction {
  return {
    action: host.matchedDevice ? 'merge' : 'create',
    name: host.hostnames[0] || host.ip,
    type: 'server',
    addPorts: true,
  };
}

export default function NmapImportModal({ result, projectId, onClose, onApplied }: Props) {
  const toast = useToast();

  const [actions, setActions] = useState<Map<string, HostAction>>(() => {
    const map = new Map<string, HostAction>();
    for (const host of result.hosts) map.set(host.ip, defaultAction(host));
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
    mutationFn: (payload: NmapApplyAction[]) => applyNmapActions(projectId, payload),
    onSuccess: (data) => {
      const parts: string[] = [];
      if (data.created) parts.push(`${data.created} created`);
      if (data.merged) parts.push(`${data.merged} merged`);
      if (data.skipped) parts.push(`${data.skipped} skipped`);
      if (data.portsAdded) parts.push(`${data.portsAdded} ports`);
      toast(parts.join(', ') || 'No changes', 'success');
      onApplied();
      onClose();
    },
    onError: (err: Error) => toast(err.message || 'Failed to apply Nmap import', 'error'),
  });

  const handleApply = () => {
    const payload: NmapApplyAction[] = result.hosts.map(host => {
      const a = actions.get(host.ip)!;
      return {
        ip: host.ip,
        macs: host.macs,
        hostnames: host.hostnames,
        ports: host.ports,
        action: a.action,
        mergeDeviceId: a.action === 'merge' && host.matchedDevice ? host.matchedDevice.id : undefined,
        newDeviceName: a.action === 'create' ? a.name : undefined,
        newDeviceType: a.action === 'create' ? a.type : undefined,
        addPorts: a.addPorts,
      };
    });
    applyMut.mutate(payload);
  };

  const actionCount = [...actions.values()].filter(a => a.action !== 'skip').length;

  return (
    <Modal
      onClose={onClose}
      style={{ maxWidth: 1000, width: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Nmap Import</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
      }
    >
        <div style={{ padding: '0 1rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          Found <strong>{result.hosts.length}</strong> host{result.hosts.length !== 1 ? 's' : ''} in <em>{result.filename}</em>
          {result.scanInfo.args ? <> · <code style={{ fontSize: '0.78rem' }}>{result.scanInfo.args}</code></> : null}
        </div>

        {result.hosts.length === 0 ? (
          <div className="empty-state" style={{ margin: '2rem 1rem' }}>
            No live hosts found in this scan file.
          </div>
        ) : (
          <div className="table-container" style={{ flex: 1, overflow: 'auto', margin: '0.5rem 0' }}>
            <table>
              <thead>
                <tr>
                  <th>IP</th>
                  <th>Hostname</th>
                  <th>MAC</th>
                  <th>OS</th>
                  <th>Ports</th>
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
                      <td style={{ fontSize: '0.8rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {host.hostnames[0] || '—'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {host.macs[0] || '—'}
                      </td>
                      <td style={{ fontSize: '0.78rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={host.osGuess ?? undefined}>
                        {host.osGuess || '—'}
                      </td>
                      <td>{host.ports.length > 0 ? <PortsList ports={host.ports} /> : '—'}</td>
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
                            {host.matchedDevice && <option value="merge">Merge into {host.matchedDevice.name}</option>}
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
                          {a.action !== 'skip' && host.ports.length > 0 && (
                            <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--color-text-secondary)' }}>
                              <input
                                type="checkbox"
                                checked={a.addPorts}
                                onChange={e => updateAction(host.ip, { addPorts: e.target.checked })}
                              />
                              Add ports
                            </label>
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
    </Modal>
  );
}
