import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { useProject } from '../../contexts/ProjectContext';
import { fetchDevicePorts, createDevicePort, updateDevicePort, deleteDevicePort } from '../../api/devicePorts';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import type { DevicePort } from 'shared/types';

const STATE_STYLES: Record<string, React.CSSProperties> = {
  OPEN:     { background: '#22c55e20', color: '#16a34a', padding: '1px 7px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 },
  CLOSED:   { background: '#ef444420', color: '#dc2626', padding: '1px 7px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 },
  FILTERED: { background: '#f59e0b20', color: '#d97706', padding: '1px 7px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 },
};

export default function DevicePortsSection({ deviceId }: { deviceId: number }) {
  const { projectId } = useProject();
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [portNumber, setPortNumber] = useState('');
  const [state, setState] = useState('OPEN');
  const [service, setService] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPortNumber, setEditPortNumber] = useState('');
  const [editState, setEditState] = useState('OPEN');
  const [editService, setEditService] = useState('');

  const { data: ports = [] } = useQuery({
    queryKey: ['device-ports', projectId, deviceId],
    queryFn: () => fetchDevicePorts(projectId, deviceId),
  });

  const createMut = useMutation({
    mutationFn: (payload: { port_number: number; state: string; service?: string }) =>
      createDevicePort(projectId, deviceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-ports', projectId, deviceId] });
      setPortNumber('');
      setState('OPEN');
      setService('');
      setAdding(false);
    },
    onError: () => toast('Failed to save port', 'error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ portId, payload }: { portId: number; payload: { port_number: number; state: string; service?: string } }) =>
      updateDevicePort(projectId, deviceId, portId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-ports', projectId, deviceId] });
      setEditingId(null);
    },
    onError: () => toast('Failed to save port', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (portId: number) => deleteDevicePort(projectId, deviceId, portId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device-ports', projectId, deviceId] }),
    onError: () => toast('Failed to delete port', 'error'),
  });

  function startEdit(port: DevicePort) {
    setEditingId(port.id);
    setEditPortNumber(String(port.port_number));
    setEditState(port.state);
    setEditService(port.service ?? '');
    setAdding(false);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editPortNumber || !editingId) return;
    updateMut.mutate({
      portId: editingId,
      payload: { port_number: Number(editPortNumber), state: editState, service: editService || undefined },
    });
  }

  async function handleDelete(port: DevicePort) {
    if (await confirm(`Delete port ${port.port_number}?`)) {
      deleteMut.mutate(port.id);
    }
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!portNumber) return;
    createMut.mutate({
      port_number: Number(portNumber),
      state,
      service: service || undefined,
    });
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1rem', margin: 0 }}>Ports</h3>
        {!adding && (
          <button className="btn btn-outline" onClick={() => { setAdding(true); setEditingId(null); }}>+ Add Port</button>
        )}
      </div>

      {ports.length === 0 && !adding ? (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>No ports recorded. Click Add Port to add one.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Port</th>
              <th>State</th>
              <th>Service</th>
              <th style={{ width: 72 }}></th>
            </tr>
          </thead>
          <tbody>
            {ports.map(port => (
              port.id === editingId ? (
                <tr key={port.id}>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={editPortNumber}
                      onChange={e => setEditPortNumber(e.target.value)}
                      required
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <select value={editState} onChange={e => setEditState(e.target.value)} style={{ width: 110 }}>
                      <option value="OPEN">OPEN</option>
                      <option value="CLOSED">CLOSED</option>
                      <option value="FILTERED">FILTERED</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={editService}
                      onChange={e => setEditService(e.target.value)}
                      placeholder="Service"
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td className="actions">
                    <button
                      className="btn btn-primary btn-sm btn-icon"
                      onClick={handleSaveEdit}
                      disabled={updateMut.isPending}
                      title="Save"
                    >
                      {updateMut.isPending ? '…' : <Check size={14} />}
                    </button>
                    <button className="btn btn-secondary btn-sm btn-icon" onClick={cancelEdit} title="Cancel">
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={port.id}>
                  <td>{port.port_number}</td>
                  <td><span style={STATE_STYLES[port.state] ?? STATE_STYLES.OPEN}>{port.state}</span></td>
                  <td>{port.service || '—'}</td>
                  <td className="actions">
                    <button className="btn btn-secondary btn-sm btn-icon" onClick={() => startEdit(port)} title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn btn-danger btn-sm btn-icon"
                      onClick={() => handleDelete(port)}
                      title="Delete port"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: ports.length > 0 ? '0.75rem' : '0' }}>
          <input
            type="number"
            min={1}
            max={65535}
            value={portNumber}
            onChange={e => setPortNumber(e.target.value)}
            placeholder="Port"
            required
            style={{ width: 80 }}
          />
          <select value={state} onChange={e => setState(e.target.value)} style={{ width: 120 }}>
            <option value="OPEN">OPEN</option>
            <option value="CLOSED">CLOSED</option>
            <option value="FILTERED">FILTERED</option>
          </select>
          <input
            value={service}
            onChange={e => setService(e.target.value)}
            placeholder="Service (e.g. SSH)"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={createMut.isPending}>
            {createMut.isPending ? 'Adding...' : 'Add'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      )}
    </div>
  );
}
