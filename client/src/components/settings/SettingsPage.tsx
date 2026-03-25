import { useState, useRef } from 'react';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchHighlightRules, createHighlightRule, deleteHighlightRule } from '../../api/highlightRules';
import { exportBackup, importBackup } from '../../api/backup';
import { fetchTypeDefaults, typeDefaultIconUrl, uploadTypeDefault, deleteTypeDefault } from '../../api/diagramIcons';
import { useProject } from '../../contexts/ProjectContext';
import type { HighlightRule, DeviceType } from 'shared/types';
import { DEVICE_TYPE_LABELS } from 'shared/types';

import serverIcon from '../../assets/device-icons/server.svg?url';
import workstationIcon from '../../assets/device-icons/workstation.svg?url';
import routerIcon from '../../assets/device-icons/router.svg?url';
import switchIcon from '../../assets/device-icons/switch.svg?url';
import nasIcon from '../../assets/device-icons/nas.svg?url';
import firewallIcon from '../../assets/device-icons/firewall.svg?url';
import accessPointIcon from '../../assets/device-icons/access_point.svg?url';
import iotIcon from '../../assets/device-icons/iot.svg?url';
import cameraIcon from '../../assets/device-icons/camera.svg?url';
import phoneIcon from '../../assets/device-icons/phone.svg?url';

const DEFAULT_ICONS: Record<string, string> = {
  server: serverIcon, workstation: workstationIcon, router: routerIcon, switch: switchIcon,
  nas: nasIcon, firewall: firewallIcon, access_point: accessPointIcon, iot: iotIcon,
  camera: cameraIcon, phone: phoneIcon,
};

const ALL_DEVICE_TYPES: DeviceType[] = ['server', 'workstation', 'router', 'switch', 'nas', 'firewall', 'access_point', 'iot', 'camera', 'phone'];

export default function SettingsPage() {
  const { projectId } = useProject();
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState('#fef9c3');
  const [textColor, setTextColor] = useState('');
  const [useTextColor, setUseTextColor] = useState(false);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const [iconUploadType, setIconUploadType] = useState<string | null>(null);

  const { data: typeDefaults = [] } = useQuery({
    queryKey: ['type-default-icons', projectId],
    queryFn: () => fetchTypeDefaults(projectId),
  });
  const customTypeSet = new Set(typeDefaults.map(t => t.device_type));

  const uploadIconMut = useMutation({
    mutationFn: ({ deviceType, payload }: { deviceType: string; payload: { filename: string; mime_type: string; data: string } }) =>
      uploadTypeDefault(projectId, deviceType, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['type-default-icons', projectId] }),
  });

  const deleteIconMut = useMutation({
    mutationFn: (deviceType: string) => deleteTypeDefault(projectId, deviceType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['type-default-icons', projectId] }),
  });

  function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const deviceType = iconUploadType;
    if (!file || !deviceType) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      uploadIconMut.mutate({ deviceType, payload: { filename: file.name, mime_type: file.type, data: base64 } });
    };
    reader.readAsDataURL(file);
  }

  const [inclCmdOutputs, setInclCmdOutputs] = useState(true);
  const [inclCredentials, setInclCredentials] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: rules = [] } = useQuery({
    queryKey: ['highlight-rules', projectId],
    queryFn: () => fetchHighlightRules(projectId),
  });

  const createMut = useMutation({
    mutationFn: (data: { keyword: string; category: string; color: string; text_color?: string | null }) =>
      createHighlightRule(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlight-rules', projectId] });
      setKeyword('');
      setCategory('');
      setColor('#fef9c3');
      setTextColor('');
      setUseTextColor(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteHighlightRule(projectId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['highlight-rules', projectId] }),
  });

  async function handleExport() {
    setExportLoading(true);
    try {
      await exportBackup(projectId, inclCmdOutputs, inclCredentials);
    } finally {
      setExportLoading(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setImportError('Could not read file — make sure it is a valid JSON backup.');
      return;
    }

    const ok = await confirm(
      'This will overwrite ALL existing data in this project including devices, subnets, connections, credentials, and settings. This cannot be undone. Continue?'
    );
    if (!ok) return;

    setImportLoading(true);
    setImportError(null);
    setImportSuccess(false);
    try {
      await importBackup(projectId, parsed);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['devices', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['subnets', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['connections', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['highlight-rules', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['credentials', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['diagram', projectId] }),
      ]);
      setImportSuccess(true);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Project Settings</h2>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Backup & Restore</h3>
        <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Export this project's data as a JSON file, or restore from a previous backup. Restoring will overwrite all data in this project.
        </p>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Export</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={inclCmdOutputs}
                  onChange={e => setInclCmdOutputs(e.target.checked)}
                  style={{ width: 'auto', margin: 0 }}
                />
                Include command outputs
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={inclCredentials}
                  onChange={e => setInclCredentials(e.target.checked)}
                  style={{ width: 'auto', margin: 0 }}
                />
                Include credentials
              </label>
              {inclCredentials && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0.1rem 0 0 1.4rem' }}>
                  Passwords will be stored as plaintext in the backup file.
                </p>
              )}
            </div>
            <button className="btn btn-primary" onClick={handleExport} disabled={exportLoading}>
              {exportLoading ? 'Exporting...' : 'Download Backup'}
            </button>
          </div>

          <div>
            <p style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Restore</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
              Select a backup file to restore from.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <button
              className="btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={importLoading}
            >
              {importLoading ? 'Restoring...' : 'Restore from Backup'}
            </button>
            {importError && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-danger)' }}>{importError}</p>
            )}
            {importSuccess && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-success, #16a34a)' }}>Restore complete.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Default Device Icons</h3>
        <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Customise the default icon used for each device type on the network diagram. Upload an image (max 512 KB) to replace the built-in icon, or reset to restore the default.
        </p>
        <input ref={iconInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleIconUpload} />
        <div className="settings-icon-grid">
          {ALL_DEVICE_TYPES.map(dt => {
            const hasCustom = customTypeSet.has(dt);
            const src = hasCustom ? typeDefaultIconUrl(projectId, dt) + `?t=${Date.now()}` : DEFAULT_ICONS[dt];
            return (
              <div key={dt} className="settings-icon-card">
                <img src={src} alt={dt} className="settings-icon-preview" draggable={false} />
                <div className="settings-icon-label">{DEVICE_TYPE_LABELS[dt]}</div>
                <div className="settings-icon-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => { setIconUploadType(dt); iconInputRef.current?.click(); }}
                    disabled={uploadIconMut.isPending}
                  >
                    Upload
                  </button>
                  {hasCustom && (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={async () => { if (await confirm(`Reset ${DEVICE_TYPE_LABELS[dt]} icon to default?`)) deleteIconMut.mutate(dt); }}
                      disabled={deleteIconMut.isPending}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Highlight Rules</h3>
        <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Rows in parsed command output that contain a matching keyword will be highlighted with the specified colours.
        </p>

        <div className="form-row" style={{ alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Keyword</label>
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="e.g. sudo"
            />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Category</label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. WARNING"
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Background</label>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              style={{ height: '38px', width: '100%', padding: '2px', cursor: 'pointer' }}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={useTextColor}
                onChange={e => setUseTextColor(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              Font colour
            </label>
            <input
              type="color"
              value={textColor || '#000000'}
              onChange={e => setTextColor(e.target.value)}
              disabled={!useTextColor}
              style={{ height: '38px', width: '100%', padding: '2px', cursor: useTextColor ? 'pointer' : 'not-allowed', opacity: useTextColor ? 1 : 0.4 }}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label style={{ visibility: 'hidden' }}>Add</label>
            <button
              className="btn btn-primary"
              disabled={!keyword.trim() || !category.trim() || createMut.isPending}
              onClick={() => createMut.mutate({
                keyword: keyword.trim(),
                category: category.trim(),
                color,
                text_color: useTextColor ? textColor : null,
              })}
              style={{ width: '100%' }}
            >
              Add Rule
            </button>
          </div>
        </div>

        {rules.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Category</th>
                  <th>Background</th>
                  <th>Font</th>
                  <th>Preview</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule: HighlightRule) => (
                  <tr key={rule.id}>
                    <td style={{ fontFamily: 'monospace' }}>{rule.keyword}</td>
                    <td>{rule.category}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: rule.color, border: '1px solid var(--color-border)', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{rule.color}</span>
                      </div>
                    </td>
                    <td>
                      {rule.text_color ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: rule.text_color, border: '1px solid var(--color-border)', flexShrink: 0 }} />
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{rule.text_color}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>default</span>
                      )}
                    </td>
                    <td>
                      <span style={{ background: rule.color, color: rule.text_color || undefined, padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                        {rule.keyword}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={async () => { if (await confirm(`Delete rule for "${rule.keyword}"?`)) deleteMut.mutate(rule.id); }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>No highlight rules yet.</p>
        )}
      </div>
    </div>
  );
}
