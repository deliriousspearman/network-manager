import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, Settings as SettingsIcon, Monitor, Bot, Highlighter } from 'lucide-react';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import Tabs, { type TabDef } from '../ui/Tabs';
import PageHeader from '../layout/PageHeader';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchHighlightRules, createHighlightRule, updateHighlightRule, deleteHighlightRule } from '../../api/highlightRules';
import { exportBackup, importBackup } from '../../api/backup';
import {
  fetchTypeDefaults, typeDefaultIconUrl, uploadTypeDefault, deleteTypeDefault,
  fetchAgentTypeDefaults, agentTypeDefaultIconUrl, uploadAgentTypeDefault, deleteAgentTypeDefault,
} from '../../api/diagramIcons';
import { useProject } from '../../contexts/ProjectContext';
import type { HighlightRule } from 'shared/types';
import { DEVICE_TYPE_LABELS, AGENT_TYPES, AGENT_TYPE_LABELS } from 'shared/types';

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
import hypervisorIcon from '../../assets/device-icons/hypervisor.svg?url';

import { DEFAULT_AGENT_ICONS } from '../../assets/agent-icons';

const DEFAULT_ICONS: Record<string, string> = {
  server: serverIcon, workstation: workstationIcon, router: routerIcon, switch: switchIcon,
  nas: nasIcon, firewall: firewallIcon, access_point: accessPointIcon, iot: iotIcon,
  camera: cameraIcon, phone: phoneIcon, hypervisor: hypervisorIcon,
};

const ICON_LABELS: Record<string, string> = {
  ...DEVICE_TYPE_LABELS,
  hypervisor: 'Hypervisor',
};

const ALL_ICON_TYPES: string[] = ['access_point', 'camera', 'firewall', 'hypervisor', 'iot', 'nas', 'phone', 'router', 'server', 'switch', 'workstation'];

const ALL_AGENT_TYPES: string[] = [...AGENT_TYPES];

export default function SettingsPage() {
  const { projectId } = useProject();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState('#fef9c3');
  const [textColor, setTextColor] = useState('');
  const [useTextColor, setUseTextColor] = useState(false);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const [iconUploadType, setIconUploadType] = useState<string | null>(null);

  const agentIconInputRef = useRef<HTMLInputElement>(null);
  const [agentIconUploadType, setAgentIconUploadType] = useState<string | null>(null);

  const { data: typeDefaults = [] } = useQuery({
    queryKey: ['type-default-icons', projectId],
    queryFn: () => fetchTypeDefaults(projectId),
  });
  const customTypeSet = new Set(typeDefaults.map(t => t.device_type));

  const { data: agentTypeDefaults = [] } = useQuery({
    queryKey: ['agent-type-default-icons', projectId],
    queryFn: () => fetchAgentTypeDefaults(projectId),
  });
  const customAgentTypeSet = new Set(agentTypeDefaults.map(t => t.agent_type));

  const uploadIconMut = useMutation({
    mutationFn: ({ deviceType, payload }: { deviceType: string; payload: { filename: string; mime_type: string; data: string } }) =>
      uploadTypeDefault(projectId, deviceType, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['type-default-icons', projectId] }),
    onError: () => toast('Failed to upload icon', 'error'),
  });

  const deleteIconMut = useMutation({
    mutationFn: (deviceType: string) => deleteTypeDefault(projectId, deviceType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['type-default-icons', projectId] }),
    onError: () => toast('Failed to delete icon', 'error'),
  });

  const uploadAgentIconMut = useMutation({
    mutationFn: ({ agentType, payload }: { agentType: string; payload: { filename: string; mime_type: string; data: string } }) =>
      uploadAgentTypeDefault(projectId, agentType, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-type-default-icons', projectId] }),
    onError: () => toast('Failed to upload icon', 'error'),
  });

  const deleteAgentIconMut = useMutation({
    mutationFn: (agentType: string) => deleteAgentTypeDefault(projectId, agentType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-type-default-icons', projectId] }),
    onError: () => toast('Failed to delete icon', 'error'),
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

  function handleAgentIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const agentType = agentIconUploadType;
    if (!file || !agentType) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      uploadAgentIconMut.mutate({ agentType, payload: { filename: file.name, mime_type: file.type, data: base64 } });
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
    onError: () => toast('Failed to create highlight rule', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteHighlightRule(projectId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['highlight-rules', projectId] }),
    onError: () => toast('Failed to delete highlight rule', 'error'),
  });

  const [editingRule, setEditingRule] = useState<HighlightRule | null>(null);
  const [editKeyword, setEditKeyword] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editColor, setEditColor] = useState('#fef9c3');
  const [editUseTextColor, setEditUseTextColor] = useState(false);
  const [editTextColor, setEditTextColor] = useState('#000000');

  const updateMut = useMutation({
    mutationFn: (data: { keyword: string; category: string; color: string; text_color?: string | null }) =>
      updateHighlightRule(projectId, editingRule!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlight-rules', projectId] });
      setEditingRule(null);
    },
    onError: () => toast('Failed to update highlight rule', 'error'),
  });

  useEffect(() => {
    if (!editingRule) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditingRule(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingRule]);

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

  const generalTab = (
    <>
      <div className="card">
        <div className="card-header"><h3 className="card-header-title">Backup & Restore</h3></div>
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
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0.1rem 0 0 1.4rem', visibility: inclCredentials ? 'visible' : 'hidden' }}>
                Passwords will be stored as plaintext in the backup file.
              </p>
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
    </>
  );

  const deviceIconsTab = (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-header-title">Default Device Icons</h3>
            <div className="card-header-subtitle">Customise the default icon used for each device type on the network diagram. Upload an image (max 512 KB) to replace the built-in icon.</div>
          </div>
        </div>
        <input ref={iconInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleIconUpload} />
        <div className="settings-icon-grid">
          {ALL_ICON_TYPES.map(dt => {
            const hasCustom = customTypeSet.has(dt);
            const src = hasCustom ? typeDefaultIconUrl(projectId, dt) + `?t=${Date.now()}` : DEFAULT_ICONS[dt];
            return (
              <div key={dt} className="settings-icon-card">
                <img src={src} alt={dt} className="settings-icon-preview" draggable={false} />
                <div className="settings-icon-label">{ICON_LABELS[dt] || dt}</div>
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
                      onClick={async () => { if (await confirm(`Reset ${ICON_LABELS[dt] || dt} icon to default?`)) deleteIconMut.mutate(dt); }}
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

    </>
  );

  const agentIconsTab = (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-header-title">Default Agent Icons</h3>
            <div className="card-header-subtitle">Customise the default icon used for each agent type. Upload an image (max 512 KB) to replace the built-in icon.</div>
          </div>
        </div>
        <input ref={agentIconInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAgentIconUpload} />
        <div className="settings-icon-grid">
          {ALL_AGENT_TYPES.map(at => {
            const hasCustom = customAgentTypeSet.has(at);
            const src = hasCustom ? agentTypeDefaultIconUrl(projectId, at) + `?t=${Date.now()}` : DEFAULT_AGENT_ICONS[at];
            return (
              <div key={at} className="settings-icon-card">
                <img src={src} alt={at} className="settings-icon-preview" draggable={false} />
                <div className="settings-icon-label">{AGENT_TYPE_LABELS[at as keyof typeof AGENT_TYPE_LABELS] || at}</div>
                <div className="settings-icon-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => { setAgentIconUploadType(at); agentIconInputRef.current?.click(); }}
                    disabled={uploadAgentIconMut.isPending}
                  >
                    Upload
                  </button>
                  {hasCustom && (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={async () => { if (await confirm(`Reset ${AGENT_TYPE_LABELS[at as keyof typeof AGENT_TYPE_LABELS] || at} icon to default?`)) deleteAgentIconMut.mutate(at); }}
                      disabled={deleteAgentIconMut.isPending}
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

    </>
  );

  const highlightRulesTab = (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-header-title">Highlight Rules</h3>
            <div className="card-header-subtitle">Rows in parsed command output that contain a matching keyword will be highlighted with the specified colours.</div>
          </div>
        </div>

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
                    <td style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        title="Edit"
                        onClick={() => {
                          setEditKeyword(rule.keyword);
                          setEditCategory(rule.category);
                          setEditColor(rule.color);
                          setEditUseTextColor(!!rule.text_color);
                          setEditTextColor(rule.text_color || '#000000');
                          setEditingRule(rule);
                        }}
                      ><Pencil size={13} /></button>
                      <button
                        className="btn btn-danger btn-sm"
                        title="Delete"
                        onClick={async () => { if (await confirm(`Delete rule for "${rule.keyword}"?`)) deleteMut.mutate(rule.id); }}
                      ><Trash2 size={13} /></button>
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
    </>
  );

  const tabs: TabDef[] = [
    { id: 'general', label: 'General', icon: <SettingsIcon size={14} /> },
    { id: 'device-icons', label: 'Device Icons', icon: <Monitor size={14} /> },
    { id: 'agent-icons', label: 'Agent Icons', icon: <Bot size={14} /> },
    { id: 'highlight-rules', label: 'Highlight Rules', icon: <Highlighter size={14} /> },
  ];

  const renderTab = (id: string) => {
    switch (id) {
      case 'general': return generalTab;
      case 'device-icons': return deviceIconsTab;
      case 'agent-icons': return agentIconsTab;
      case 'highlight-rules': return highlightRulesTab;
      default: return null;
    }
  };

  return (
    <>
    <div>
      <PageHeader
        title="Project Settings"
        subtitle="Manage backup, icons, and highlight rules"
      />
      <Tabs tabs={tabs} hashPersist>
        {renderTab}
      </Tabs>
    </div>

    {editingRule && createPortal(
      <div className="confirm-overlay" onClick={() => setEditingRule(null)}>
        <div className="confirm-dialog" onClick={e => e.stopPropagation()} style={{ minWidth: 420 }}>
          <div className="confirm-dialog-title">Edit Highlight Rule</div>
          <div className="confirm-dialog-message">
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Keyword</label>
                <input type="text" value={editKeyword} onChange={e => setEditKeyword(e.target.value)} placeholder="e.g. sudo" />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Category</label>
                <input type="text" value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="e.g. WARNING" />
              </div>
            </div>
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Background</label>
                <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={{ height: '38px', width: '100%', padding: '2px', cursor: 'pointer' }} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={editUseTextColor} onChange={e => setEditUseTextColor(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
                  Font colour
                </label>
                <input type="color" value={editTextColor} onChange={e => setEditTextColor(e.target.value)} disabled={!editUseTextColor} style={{ height: '38px', width: '100%', padding: '2px', cursor: editUseTextColor ? 'pointer' : 'not-allowed', opacity: editUseTextColor ? 1 : 0.4 }} />
              </div>
            </div>
          </div>
          <div className="confirm-dialog-actions">
            <button className="btn btn-secondary" onClick={() => setEditingRule(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!editKeyword.trim() || !editCategory.trim() || updateMut.isPending}
              onClick={() => updateMut.mutate({ keyword: editKeyword.trim(), category: editCategory.trim(), color: editColor, text_color: editUseTextColor ? editTextColor : null })}
            >Save</button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
