import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  DrawioAnalyzeResult,
  DrawioAnalyzedSubnet,
  DrawioAnalyzedDevice,
  DrawioImageCandidate,
  DrawioApplyAction,
  DeviceType,
} from 'shared/types';
import { DEVICE_TYPE_LABELS } from 'shared/types';
import { applyDrawioImport } from '../../api/drawioImport';
import { useToast } from '../ui/Toast';
import Modal from '../ui/Modal';
import IconRenderer from '../ui/IconRenderer';
import { libraryIconUrl } from '../../iconLibraries/manifest';
import DeviceIconPicker, { type DeviceIconPickerValue } from '../settings/DeviceIconPicker';

interface Props {
  result: DrawioAnalyzeResult;
  projectId: number;
  viewId?: number;
  onClose: () => void;
  onApplied: () => void;
}

interface SubnetRow {
  action: 'create' | 'merge' | 'skip';
  name: string;
  cidr: string;
  vlan_id: string;
}

interface DeviceRow {
  action: 'create' | 'merge' | 'skip';
  name: string;
  type: DeviceType;
  primary_ip: string;
  hostname: string;
  mac_address: string;
  // null when this row should fall back to the project's default icon for
  // its device type (no override row created).
  library_id: string | null;
  library_icon_key: string | null;
}

interface ImageRow {
  action: 'create' | 'skip';
  addToLibrary: boolean;
  placeOnDiagram: boolean;
}

function defaultSubnetRow(s: DrawioAnalyzedSubnet): SubnetRow {
  return {
    action: s.matchedSubnet ? 'merge' : (s.cidr ? 'create' : 'skip'),
    name: s.name,
    cidr: s.cidr || '',
    vlan_id: s.vlan_id != null ? String(s.vlan_id) : '',
  };
}

function defaultDeviceRow(d: DrawioAnalyzedDevice): DeviceRow {
  return {
    action: d.matchedDevice ? 'merge' : 'create',
    name: d.name,
    type: d.type,
    primary_ip: d.primary_ip || '',
    hostname: d.hostname || '',
    mac_address: d.mac_address || '',
    library_id: d.library_id,
    library_icon_key: d.library_icon_key,
  };
}

export default function DrawioImportModal({ result, projectId, viewId, onClose, onApplied }: Props) {
  const toast = useToast();

  const [subnetRows, setSubnetRows] = useState<Map<string, SubnetRow>>(() => {
    const m = new Map<string, SubnetRow>();
    for (const s of result.subnets) m.set(s.cellId, defaultSubnetRow(s));
    return m;
  });
  const [deviceRows, setDeviceRows] = useState<Map<string, DeviceRow>>(() => {
    const m = new Map<string, DeviceRow>();
    for (const d of result.devices) m.set(d.cellId, defaultDeviceRow(d));
    return m;
  });
  const [imageRows, setImageRows] = useState<Map<string, ImageRow>>(() => {
    const m = new Map<string, ImageRow>();
    for (const i of result.images) {
      m.set(i.cellId, { action: 'create', addToLibrary: true, placeOnDiagram: true });
    }
    return m;
  });
  const [createConnections, setCreateConnections] = useState(true);

  const updateSubnet = (cellId: string, patch: Partial<SubnetRow>) => {
    setSubnetRows(prev => {
      const next = new Map(prev);
      const cur = next.get(cellId)!;
      next.set(cellId, { ...cur, ...patch });
      return next;
    });
  };
  const updateDevice = (cellId: string, patch: Partial<DeviceRow>) => {
    setDeviceRows(prev => {
      const next = new Map(prev);
      const cur = next.get(cellId)!;
      next.set(cellId, { ...cur, ...patch });
      return next;
    });
  };
  const updateImage = (cellId: string, patch: Partial<ImageRow>) => {
    setImageRows(prev => {
      const next = new Map(prev);
      const cur = next.get(cellId)!;
      next.set(cellId, { ...cur, ...patch });
      return next;
    });
  };

  const applyMut = useMutation({
    mutationFn: (payload: DrawioApplyAction[]) => applyDrawioImport(projectId, payload, viewId),
    onSuccess: (data) => {
      const parts: string[] = [];
      if (data.subnets.created) parts.push(`${data.subnets.created} subnets created`);
      if (data.subnets.merged) parts.push(`${data.subnets.merged} subnets merged`);
      if (data.devices.created) parts.push(`${data.devices.created} devices created`);
      if (data.devices.merged) parts.push(`${data.devices.merged} devices merged`);
      if (data.images.libraryAdded) parts.push(`${data.images.libraryAdded} images to library`);
      if (data.images.diagramPlaced) parts.push(`${data.images.diagramPlaced} images placed`);
      if (data.connections.created) parts.push(`${data.connections.created} connections`);
      toast(parts.join(', ') || 'Nothing to import', 'success');
      onApplied();
      onClose();
    },
    onError: (err: Error) => toast(err.message || 'Failed to apply draw.io import', 'error'),
  });

  const { actionCount, payload } = useMemo(() => {
    const out: DrawioApplyAction[] = [];
    let count = 0;

    for (const s of result.subnets) {
      const r = subnetRows.get(s.cellId)!;
      if (r.action !== 'skip') count++;
      out.push({
        kind: 'subnet',
        cellId: s.cellId,
        action: r.action,
        name: r.name.trim(),
        cidr: r.cidr.trim() || null,
        vlan_id: r.vlan_id.trim() ? parseInt(r.vlan_id, 10) : null,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        mergeSubnetId: r.action === 'merge' && s.matchedSubnet ? s.matchedSubnet.id : undefined,
      });
    }
    for (const d of result.devices) {
      const r = deviceRows.get(d.cellId)!;
      if (r.action !== 'skip') count++;
      out.push({
        kind: 'device',
        cellId: d.cellId,
        action: r.action,
        name: r.name.trim(),
        type: r.type,
        primary_ip: r.primary_ip.trim() || null,
        hostname: r.hostname.trim() || null,
        mac_address: r.mac_address.trim() || null,
        library_id: r.library_id,
        library_icon_key: r.library_icon_key,
        subnetCellId: d.subnetCellId,
        x: d.x,
        y: d.y,
        mergeDeviceId: r.action === 'merge' && d.matchedDevice ? d.matchedDevice.id : undefined,
      });
    }
    for (const i of result.images) {
      const r = imageRows.get(i.cellId)!;
      const noop = r.action !== 'create' || (!r.addToLibrary && !r.placeOnDiagram);
      if (!noop) count++;
      if (noop) {
        out.push({
          kind: 'image',
          cellId: i.cellId,
          action: 'skip',
          filename: i.filename,
          mime_type: i.mime_type,
          data: '',
          label: i.label,
          x: i.x,
          y: i.y,
          width: i.width,
          height: i.height,
          addToLibrary: false,
          placeOnDiagram: false,
        });
      } else {
        out.push({
          kind: 'image',
          cellId: i.cellId,
          action: r.action,
          filename: i.filename,
          mime_type: i.mime_type,
          data: i.data,
          label: i.label,
          x: i.x,
          y: i.y,
          width: i.width,
          height: i.height,
          addToLibrary: r.addToLibrary,
          placeOnDiagram: r.placeOnDiagram,
        });
      }
    }
    if (createConnections) {
      for (const c of result.connections) {
        out.push({
          kind: 'connection',
          cellId: c.cellId,
          sourceCellId: c.sourceCellId,
          targetCellId: c.targetCellId,
          label: c.label,
          connection_type: c.connection_type,
          edge_color: c.edge_color,
          edge_width: c.edge_width,
        });
      }
    }
    return { actionCount: count, payload: out };
  }, [result, subnetRows, deviceRows, imageRows, createConnections]);

  const handleApply = () => applyMut.mutate(payload);

  const isEmpty = result.subnets.length === 0 && result.devices.length === 0 && result.images.length === 0;

  return (
    <Modal
      onClose={onClose}
      style={{ maxWidth: 960, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Import from draw.io</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close" style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
      }
    >
      <div style={{ padding: '0 1rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
        Parsed <em>{result.filename}</em> — {result.subnets.length} subnet{result.subnets.length !== 1 ? 's' : ''},{' '}
        {result.devices.length} device{result.devices.length !== 1 ? 's' : ''},{' '}
        {result.images.length} image{result.images.length !== 1 ? 's' : ''},{' '}
        {result.connections.length} connection{result.connections.length !== 1 ? 's' : ''}.
      </div>

      {isEmpty ? (
        <div className="empty-state" style={{ margin: '2rem 1rem' }}>
          No recognizable devices, subnets, or images in this file. Expected Cisco stencils, containers with a CIDR label, or embedded images.
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {result.subnets.length > 0 && (
            <SubnetsSection
              subnets={result.subnets}
              rows={subnetRows}
              update={updateSubnet}
            />
          )}
          {result.devices.length > 0 && (
            <DevicesSection
              devices={result.devices}
              rows={deviceRows}
              update={updateDevice}
            />
          )}
          {result.images.length > 0 && (
            <ImagesSection
              images={result.images}
              rows={imageRows}
              update={updateImage}
            />
          )}
          {result.connections.length > 0 && (
            <div style={{ padding: '0.5rem 0.75rem', background: 'var(--color-surface-alt, #f8f8f8)', borderRadius: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={createConnections}
                  onChange={e => setCreateConnections(e.target.checked)}
                />
                Also create <strong>{result.connections.length}</strong> connection{result.connections.length !== 1 ? 's' : ''} between imported or matched items
              </label>
            </div>
          )}
        </div>
      )}

      <div className="confirm-dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {!isEmpty && (
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

// ── Subnets section ────────────────────────────────────────────────

function SubnetsSection({
  subnets, rows, update,
}: {
  subnets: DrawioAnalyzedSubnet[];
  rows: Map<string, SubnetRow>;
  update: (cellId: string, patch: Partial<SubnetRow>) => void;
}) {
  return (
    <section>
      <h4 style={{ margin: '0 0 0.4rem 0' }}>Subnets ({subnets.length})</h4>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>CIDR</th>
              <th>VLAN</th>
              <th>Match</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {subnets.map(s => {
              const r = rows.get(s.cellId)!;
              return (
                <tr key={s.cellId}>
                  <td>
                    <input
                      type="text"
                      value={r.name}
                      onChange={e => update(s.cellId, { name: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '0.15rem 0.3rem', width: '100%' }}
                      disabled={r.action !== 'create'}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={r.cidr}
                      onChange={e => update(s.cellId, { cidr: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '0.15rem 0.3rem', width: 140, fontFamily: 'monospace' }}
                      disabled={r.action !== 'create'}
                      placeholder="e.g. 10.0.0.0/24"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={r.vlan_id}
                      onChange={e => update(s.cellId, { vlan_id: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '0.15rem 0.3rem', width: 60 }}
                      disabled={r.action !== 'create'}
                    />
                  </td>
                  <td>
                    {s.matchedSubnet ? (
                      <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                        {s.matchedSubnet.name} ({s.matchedSubnet.matchType})
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>New</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={r.action}
                      onChange={e => update(s.cellId, { action: e.target.value as SubnetRow['action'] })}
                      style={{ fontSize: '0.8rem', padding: '0.2rem 0.3rem' }}
                    >
                      {s.matchedSubnet && <option value="merge">Merge into {s.matchedSubnet.name}</option>}
                      <option value="create" disabled={!r.cidr.trim()}>Create New{!r.cidr.trim() ? ' (needs CIDR)' : ''}</option>
                      <option value="skip">Skip</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Devices section ────────────────────────────────────────────────

function DevicesSection({
  devices, rows, update,
}: {
  devices: DrawioAnalyzedDevice[];
  rows: Map<string, DeviceRow>;
  update: (cellId: string, patch: Partial<DeviceRow>) => void;
}) {
  // Per-row icon picker state — only one row open at a time.
  const [pickingCellId, setPickingCellId] = useState<string | null>(null);
  const [pickerValue, setPickerValue] = useState<DeviceIconPickerValue | null>(null);

  const openPicker = (d: DrawioAnalyzedDevice, r: DeviceRow) => {
    setPickingCellId(d.cellId);
    setPickerValue(
      r.library_id && r.library_icon_key
        ? { icon_source: 'library', library_id: r.library_id, library_icon_key: r.library_icon_key }
        : null,
    );
  };
  const closePicker = () => { setPickingCellId(null); setPickerValue(null); };
  const savePicker = () => {
    if (pickingCellId && pickerValue?.icon_source === 'library') {
      update(pickingCellId, { library_id: pickerValue.library_id, library_icon_key: pickerValue.library_icon_key });
    }
    closePicker();
  };
  const clearPickerForRow = (cellId: string) => update(cellId, { library_id: null, library_icon_key: null });

  return (
    <section>
      <h4 style={{ margin: '0 0 0.4rem 0' }}>Devices ({devices.length})</h4>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Icon</th>
              <th>Name</th>
              <th>Type</th>
              <th>IP</th>
              <th>Match</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {devices.map(d => {
              const r = rows.get(d.cellId)!;
              const iconUrl = r.library_id && r.library_icon_key
                ? libraryIconUrl(r.library_id, r.library_icon_key)
                : null;
              return (
                <tr key={d.cellId}>
                  <td style={{ width: 64 }}>
                    <button
                      type="button"
                      onClick={() => openPicker(d, r)}
                      title={iconUrl ? `${r.library_id} / ${r.library_icon_key} — click to change` : 'No library icon detected — click to pick one'}
                      style={{
                        width: 40, height: 40, padding: 2,
                        background: 'transparent',
                        border: '1px dashed var(--color-border)',
                        borderRadius: 6,
                        cursor: r.action === 'create' ? 'pointer' : 'not-allowed',
                        opacity: r.action === 'create' ? 1 : 0.45,
                      }}
                      disabled={r.action !== 'create'}
                    >
                      {iconUrl ? (
                        <IconRenderer src={iconUrl} size={36} alt={`${r.library_id} ${r.library_icon_key}`} />
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>none</span>
                      )}
                    </button>
                    {iconUrl && r.action === 'create' && (
                      <button
                        type="button"
                        onClick={() => clearPickerForRow(d.cellId)}
                        title="Use the project default icon for this device type"
                        style={{
                          marginTop: 2,
                          fontSize: '0.65rem',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-text-secondary)',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        clear
                      </button>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      value={r.name}
                      onChange={e => update(d.cellId, { name: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '0.15rem 0.3rem', width: '100%' }}
                      disabled={r.action !== 'create'}
                    />
                  </td>
                  <td>
                    <select
                      value={r.type}
                      onChange={e => update(d.cellId, { type: e.target.value as DeviceType })}
                      style={{ fontSize: '0.8rem', padding: '0.2rem 0.3rem' }}
                      disabled={r.action !== 'create'}
                    >
                      {Object.entries(DEVICE_TYPE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    {!d.isClassified && r.action === 'create' && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>unclassified</div>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      value={r.primary_ip}
                      onChange={e => update(d.cellId, { primary_ip: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '0.15rem 0.3rem', width: 120, fontFamily: 'monospace' }}
                      disabled={r.action !== 'create'}
                    />
                    {(r.hostname || r.mac_address) && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                        {r.hostname && <span title="hostname">{r.hostname}</span>}
                        {r.hostname && r.mac_address && <span> · </span>}
                        {r.mac_address && <span title="MAC" style={{ fontFamily: 'monospace' }}>{r.mac_address}</span>}
                      </div>
                    )}
                  </td>
                  <td>
                    {d.matchedDevice ? (
                      <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                        {d.matchedDevice.name} ({d.matchedDevice.matchType})
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>New</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={r.action}
                      onChange={e => update(d.cellId, { action: e.target.value as DeviceRow['action'] })}
                      style={{ fontSize: '0.8rem', padding: '0.2rem 0.3rem' }}
                    >
                      {d.matchedDevice && <option value="merge">Merge into {d.matchedDevice.name}</option>}
                      <option value="create">Create New</option>
                      <option value="skip">Skip</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pickingCellId && (
        <Modal open={true} onClose={closePicker} title="Choose Library Icon">
          <DeviceIconPicker
            value={pickerValue}
            onChange={setPickerValue}
            librariesOnly
            suggestedType={rows.get(pickingCellId)?.type}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="button" className="btn" onClick={closePicker}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={savePicker}
              disabled={pickerValue?.icon_source !== 'library'}
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

// ── Images section ─────────────────────────────────────────────────

function ImagesSection({
  images, rows, update,
}: {
  images: DrawioImageCandidate[];
  rows: Map<string, ImageRow>;
  update: (cellId: string, patch: Partial<ImageRow>) => void;
}) {
  return (
    <section>
      <h4 style={{ margin: '0 0 0.4rem 0' }}>Images ({images.length})</h4>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 80 }}>Preview</th>
              <th>Filename</th>
              <th>Add to library</th>
              <th>Place on diagram</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {images.map(img => {
              const r = rows.get(img.cellId)!;
              const dataUrl = `data:${img.mime_type};base64,${img.data}`;
              return (
                <tr key={img.cellId}>
                  <td>
                    <img
                      src={dataUrl}
                      alt={img.label || img.filename}
                      style={{ width: 64, height: 64, objectFit: 'contain', background: '#fff', border: '1px solid var(--color-border, #ddd)' }}
                    />
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{img.filename}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.addToLibrary}
                      disabled={r.action !== 'create'}
                      onChange={e => update(img.cellId, { addToLibrary: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.placeOnDiagram}
                      disabled={r.action !== 'create'}
                      onChange={e => update(img.cellId, { placeOnDiagram: e.target.checked })}
                    />
                  </td>
                  <td>
                    <select
                      value={r.action}
                      onChange={e => update(img.cellId, { action: e.target.value as ImageRow['action'] })}
                      style={{ fontSize: '0.8rem', padding: '0.2rem 0.3rem' }}
                    >
                      <option value="create">Import</option>
                      <option value="skip">Skip</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
