import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchProjects, createProject, updateProject, deleteProject } from '../../api/projects';
import { exportFullBackup, importFullBackup } from '../../api/backup';
import { fetchSettings, updateSettings } from '../../api/settings';
import type { Project } from 'shared/types';

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (US)' },
  { value: 'America/Chicago', label: 'Central (US)' },
  { value: 'America/Denver', label: 'Mountain (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific (US)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
];

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  // App settings
  const [timezone, setTimezone] = useState('UTC');
  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: fetchSettings,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (appSettings?.timezone) setTimezone(appSettings.timezone);
  }, [appSettings?.timezone]);
  const settingsMut = useMutation({
    mutationFn: (tz: string) => updateSettings({ timezone: tz }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-settings'] }),
  });

  // Notification bar settings
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifText, setNotifText] = useState('');
  const [notifBgColor, setNotifBgColor] = useState('#f59e0b');
  const [notifTextColor, setNotifTextColor] = useState('#000000');
  const [notifHeight, setNotifHeight] = useState(40);
  const [notifFontSize, setNotifFontSize] = useState(14);
  const [notifBold, setNotifBold] = useState(false);
  useEffect(() => {
    if (!appSettings) return;
    setNotifEnabled(appSettings.notification_enabled === 'true');
    setNotifText(appSettings.notification_text ?? '');
    setNotifBgColor(appSettings.notification_bg_color ?? '#f59e0b');
    setNotifTextColor(appSettings.notification_text_color ?? '#000000');
    setNotifHeight(parseInt(appSettings.notification_height ?? '40', 10));
    setNotifFontSize(parseInt(appSettings.notification_font_size ?? '14', 10));
    setNotifBold(appSettings.notification_bold === 'true');
  }, [appSettings]);
  const notifMut = useMutation({
    mutationFn: () => updateSettings({
      notification_enabled: notifEnabled ? 'true' : 'false',
      notification_text: notifText,
      notification_bg_color: notifBgColor,
      notification_text_color: notifTextColor,
      notification_height: String(notifHeight),
      notification_font_size: String(notifFontSize),
      notification_bold: notifBold ? 'true' : 'false',
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-settings'] }),
  });

  // Create project form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  function closeDeleteModal() {
    setDeleteTarget(null);
    setDeleteConfirmText('');
  }

  // Backup state
  const [inclCmdOutputs, setInclCmdOutputs] = useState(true);
  const [inclCredentials, setInclCredentials] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function autoSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function openCreateForm() {
    setEditId(null);
    setFormName('');
    setFormSlug('');
    setShowForm(true);
  }

  function openEditForm(project: Project) {
    setEditId(project.id);
    setFormName(project.name);
    setFormSlug(project.slug);
    setShowForm(true);
  }

  const createMut = useMutation({
    mutationFn: () => createProject({ name: formName.trim(), slug: formSlug.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowForm(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: () => updateProject(editId!, { name: formName.trim(), slug: formSlug.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowForm(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      closeDeleteModal();
    },
  });

  async function handleExport() {
    setExportLoading(true);
    try {
      await exportFullBackup(inclCmdOutputs, inclCredentials);
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
      'This will overwrite ALL data across ALL projects including devices, subnets, connections, credentials, and settings. This cannot be undone. Continue?'
    );
    if (!ok) return;

    setImportLoading(true);
    setImportError(null);
    setImportSuccess(false);
    try {
      await importFullBackup(parsed);
      queryClient.invalidateQueries();
      setImportSuccess(true);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  const isSubmitting = createMut.isPending || updateMut.isPending;

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Admin Settings</h2>

      {/* App Settings */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>App Settings</h3>
        <div className="form-group" style={{ maxWidth: '320px', marginBottom: '1rem' }}>
          <label>Timezone</label>
          <select value={timezone} onChange={e => setTimezone(e.target.value)}>
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.4rem' }}>
            Used for all timestamp displays (command outputs, etc.)
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => settingsMut.mutate(timezone)}
          disabled={settingsMut.isPending}
        >
          {settingsMut.isPending ? 'Saving...' : 'Save Settings'}
        </button>
        {settingsMut.isSuccess && (
          <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--color-success, #16a34a)' }}>Saved.</span>
        )}
      </div>

      {/* Notification Bar */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>Notification Bar</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          Display a banner at the top of every page for all users.
        </p>

        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={notifEnabled}
              onChange={e => setNotifEnabled(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            Enable notification bar
          </label>
        </div>

        <div className="form-group" style={{ marginBottom: '0.75rem', maxWidth: '480px' }}>
          <label>Message</label>
          <input
            type="text"
            value={notifText}
            onChange={e => setNotifText(e.target.value)}
            placeholder="Enter notification message..."
          />
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Background colour</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                type="color"
                value={notifBgColor}
                onChange={e => setNotifBgColor(e.target.value)}
                style={{ width: '36px', height: '36px', padding: '2px', cursor: 'pointer', borderRadius: '4px' }}
              />
              <input
                type="text"
                value={notifBgColor}
                onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setNotifBgColor(e.target.value); }}
                style={{ width: '90px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                maxLength={7}
              />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Text colour</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                type="color"
                value={notifTextColor}
                onChange={e => setNotifTextColor(e.target.value)}
                style={{ width: '36px', height: '36px', padding: '2px', cursor: 'pointer', borderRadius: '4px' }}
              />
              <input
                type="text"
                value={notifTextColor}
                onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setNotifTextColor(e.target.value); }}
                style={{ width: '90px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                maxLength={7}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Height (px)</label>
            <input
              type="number"
              value={notifHeight}
              min={24}
              max={80}
              onChange={e => setNotifHeight(Math.max(24, Math.min(80, parseInt(e.target.value) || 40)))}
              style={{ width: '80px' }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Font size (px)</label>
            <input
              type="number"
              value={notifFontSize}
              min={10}
              max={24}
              onChange={e => setNotifFontSize(Math.max(10, Math.min(24, parseInt(e.target.value) || 14)))}
              style={{ width: '80px' }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ display: 'block', marginBottom: '0.4rem' }}>Style</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifBold}
                onChange={e => setNotifBold(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              Bold text
            </label>
          </div>
        </div>

        {notifText.trim() && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Preview</p>
            <div
              className="notification-bar"
              style={{
                position: 'static',
                backgroundColor: notifBgColor,
                color: notifTextColor,
                height: `${notifHeight}px`,
                fontSize: `${notifFontSize}px`,
                fontWeight: notifBold ? 700 : 400,
                borderRadius: '6px',
              }}
            >
              {notifText}
            </div>
          </div>
        )}

        <button
          className="btn btn-primary btn-sm"
          onClick={() => notifMut.mutate()}
          disabled={notifMut.isPending}
        >
          {notifMut.isPending ? 'Saving...' : 'Save Notification Settings'}
        </button>
        {notifMut.isSuccess && (
          <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--color-success, #16a34a)' }}>Saved.</span>
        )}
      </div>

      {/* Projects Management */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>Projects</h3>
          <button className="btn btn-primary" onClick={openCreateForm}>New Project</button>
        </div>

        {showForm && (
          <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--color-bg-secondary, var(--color-bg))', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div className="form-row" style={{ marginBottom: '0.75rem' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => {
                    setFormName(e.target.value);
                    if (!editId) setFormSlug(autoSlug(e.target.value));
                  }}
                  placeholder="e.g. Home Network"
                />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Slug</label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={e => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="e.g. home-network"
                />
              </div>
            </div>
            {(createMut.error || updateMut.error) && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                {(createMut.error || updateMut.error)?.message}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-primary"
                disabled={!formName.trim() || !formSlug.trim() || isSubmitting}
                onClick={() => editId ? updateMut.mutate() : createMut.mutate()}
              >
                {isSubmitting ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {projects.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Devices</th>
                  <th>Subnets</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project: Project) => (
                  <tr key={project.id}>
                    <td style={{ fontWeight: 500 }}>{project.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{project.slug}</td>
                    <td>{project.device_count ?? 0}</td>
                    <td>{project.subnet_count ?? 0}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-sm" onClick={() => openEditForm(project)}>Edit</button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => { setDeleteTarget(project); setDeleteConfirmText(''); }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>No projects found.</p>
        )}
      </div>

      {/* Full-site Backup */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Full-Site Backup & Restore</h3>
        <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Export or restore ALL data across all projects. For per-project backup, use Project Settings within each project.
        </p>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Export</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={inclCmdOutputs} onChange={e => setInclCmdOutputs(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
                Include command outputs
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={inclCredentials} onChange={e => setInclCredentials(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
                Include credentials
              </label>
            </div>
            <button className="btn btn-primary" onClick={handleExport} disabled={exportLoading}>
              {exportLoading ? 'Exporting...' : 'Download Full Backup'}
            </button>
          </div>

          <div>
            <p style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Restore</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
              Select a full-site backup file to restore from.
            </p>
            <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileSelect} />
            <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={importLoading}>
              {importLoading ? 'Restoring...' : 'Restore Full Backup'}
            </button>
            {importError && <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-danger)' }}>{importError}</p>}
            {importSuccess && <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-success, #16a34a)' }}>Restore complete.</p>}
          </div>
        </div>
      </div>
      {deleteTarget && createPortal(
        <div className="confirm-overlay" onClick={closeDeleteModal}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="confirm-dialog-title">Delete Project</div>
            <div className="confirm-dialog-message">
              This will permanently delete <strong>{deleteTarget.name}</strong> and ALL its data
              (devices, subnets, credentials, diagram, logs). This cannot be undone.
            </div>
            <div style={{ margin: '1rem 0' }}>
              <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem' }}>
                Type <strong>DELETE PROJECT</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE PROJECT"
                autoFocus
                style={{ width: '100%' }}
              />
            </div>
            <div className="confirm-dialog-actions">
              <button className="btn btn-secondary" onClick={closeDeleteModal}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={deleteConfirmText !== 'DELETE PROJECT' || deleteMut.isPending}
                onClick={() => deleteMut.mutate(deleteTarget.id)}
              >
                {deleteMut.isPending ? 'Deleting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
