import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useProject } from '../../contexts/ProjectContext';
import { fetchSettings } from '../../api/settings';
import {
  fetchConfigsForDevice,
  fetchConfig,
  submitConfig,
  updateConfig,
  deleteConfig,
  toggleParseConfig,
} from '../../api/routerConfigs';
import type {
  RouterConfig,
  RouterConfigWithParsed,
  RouterVendor,
} from 'shared/types';
import { ROUTER_VENDORS, ROUTER_VENDOR_LABELS } from 'shared/types';
import RouterSystemInfo from './RouterSystemInfo';
import RouterInterfacesTable from './RouterInterfacesTable';
import RouterVlansTable from './RouterVlansTable';
import RouterStaticRoutesTable from './RouterStaticRoutesTable';
import RouterAclsTable from './RouterAclsTable';
import RouterNatTable from './RouterNatTable';
import RouterDhcpPoolsTable from './RouterDhcpPoolsTable';
import RouterUsersTable from './RouterUsersTable';
import RouterConfigDiffModal from './RouterConfigDiffModal';

const PARSED_VENDORS: RouterVendor[] = ['cisco'];

function toDatetimeLocal(capturedAt: string): string {
  return capturedAt.replace(' ', 'T').substring(0, 16);
}

function formatTimestamp(capturedAt: string, title: string | null, vendor: RouterVendor, timezone = 'UTC'): string {
  const date = new Date(capturedAt + 'Z');
  const dateStr = date.toLocaleString(undefined, { timeZone: timezone });
  const tzAbbr = new Intl.DateTimeFormat(undefined, { timeZone: timezone, timeZoneName: 'short' })
    .formatToParts(date)
    .find(p => p.type === 'timeZoneName')?.value ?? timezone;
  const ts = `${dateStr} ${tzAbbr}`;
  const label = ROUTER_VENDOR_LABELS[vendor];
  return title ? `${title} [${label}] - ${ts}` : `[${label}] ${ts}`;
}

interface ParsedCardProps {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function ParsedCard({ title, count, children, defaultOpen = true }: ParsedCardProps) {
  if (count === 0) return null;
  return (
    <details open={defaultOpen} style={{ marginBottom: '0.5rem', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
      <summary style={{ cursor: 'pointer', padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.9rem', background: 'var(--color-bg-secondary, var(--color-bg))' }}>
        {title} <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>({count})</span>
      </summary>
      <div style={{ padding: '0.5rem 0.75rem' }}>
        {children}
      </div>
    </details>
  );
}

export default function RouterConfigSection({ deviceId }: { deviceId: number }) {
  const { projectId } = useProject();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newVendor, setNewVendor] = useState<RouterVendor>('cisco');
  const [newTitle, setNewTitle] = useState('');
  const [newRaw, setNewRaw] = useState('');
  const [newParse, setNewParse] = useState(true);

  const [showDiff, setShowDiff] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editRaw, setEditRaw] = useState('');
  const [editCapturedAt, setEditCapturedAt] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editVendor, setEditVendor] = useState<RouterVendor>('cisco');

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: fetchSettings,
    staleTime: Infinity,
  });

  const { data: configs } = useQuery({
    queryKey: ['router-configs', projectId, deviceId],
    queryFn: () => fetchConfigsForDevice(projectId, deviceId),
  });

  const { data: viewedConfig } = useQuery({
    queryKey: ['router-config', projectId, selectedConfigId],
    queryFn: () => fetchConfig(projectId, selectedConfigId!),
    enabled: selectedConfigId !== null,
  });

  const submitMut = useMutation({
    mutationFn: (data: { vendor: RouterVendor; raw_config: string; title?: string; parse_output?: boolean }) =>
      submitConfig(projectId, deviceId, data),
    onError: (err: Error) => toast(err.message || 'Failed to save router config', 'error'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['router-configs', projectId, deviceId] });
      setSelectedConfigId(result.id);
      setShowForm(false);
      setNewRaw('');
      setNewTitle('');
      setNewParse(true);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteConfig(projectId, id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['router-configs', projectId, deviceId] });
      if (deletedId === selectedConfigId) {
        const remaining = (configs ?? []).filter(c => c.id !== deletedId);
        setSelectedConfigId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    onError: (err: Error) => toast(err.message || 'Failed to delete router config', 'error'),
  });

  const toggleParseMut = useMutation({
    mutationFn: ({ id, enable }: { id: number; enable: boolean }) => toggleParseConfig(projectId, id, enable),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['router-config', projectId, selectedConfigId] });
      queryClient.invalidateQueries({ queryKey: ['router-configs', projectId, deviceId] });
    },
    onError: (err: Error) => toast(err.message || 'Failed to toggle parsing', 'error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { raw_config?: string; captured_at?: string; title?: string; vendor?: RouterVendor } }) =>
      updateConfig(projectId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['router-config', projectId, selectedConfigId] });
      queryClient.invalidateQueries({ queryKey: ['router-configs', projectId, deviceId] });
      setShowEdit(false);
    },
    onError: (err: Error) => toast(err.message || 'Failed to update router config', 'error'),
  });

  useEffect(() => {
    if (selectedConfigId === null && configs && configs.length > 0) {
      setSelectedConfigId(configs[0].id);
    }
  }, [configs, selectedConfigId]);

  function openEdit(config: RouterConfigWithParsed) {
    setEditRaw(config.raw_config);
    setEditCapturedAt(toDatetimeLocal(config.captured_at));
    setEditTitle(config.title ?? '');
    setEditVendor(config.vendor);
    setShowEdit(true);
    setShowForm(false);
  }

  const timezone = settings?.timezone ?? 'UTC';
  const hasConfigs = (configs ?? []).length > 0;
  const vendorHasParser = viewedConfig && PARSED_VENDORS.includes(viewedConfig.vendor);

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Router Config</h3>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {hasConfigs ? (
          <>
            <select
              value={selectedConfigId ?? ''}
              onChange={e => setSelectedConfigId(Number(e.target.value))}
              style={{
                flex: '1',
                minWidth: '220px',
                border: 'none',
                borderTop: '1px solid var(--color-border)',
                borderBottom: '1px solid var(--color-border)',
                borderRadius: 0,
                background: 'var(--color-bg-secondary, var(--color-bg))',
                color: 'var(--color-text)',
                outline: 'none',
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem',
              }}
            >
              {(configs ?? []).map((c: RouterConfig) => (
                <option key={c.id} value={c.id}>
                  {formatTimestamp(c.captured_at, c.title ?? null, c.vendor, timezone)}
                </option>
              ))}
            </select>
            <button
              className="btn btn-secondary btn-sm"
              disabled={selectedConfigId === null}
              onClick={() => viewedConfig && openEdit(viewedConfig)}
            >
              Edit
            </button>
            <button
              className="btn btn-danger btn-sm"
              disabled={selectedConfigId === null || deleteMut.isPending}
              onClick={async () => {
                if (selectedConfigId !== null && await confirm('Delete this router config?')) {
                  deleteMut.mutate(selectedConfigId);
                }
              }}
            >
              Delete
            </button>
            {(configs ?? []).length >= 2 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowDiff(true)}
              >
                Diff
              </button>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            No router configs captured yet.
          </span>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(f => !f); setShowEdit(false); }}>
          {showForm ? 'Cancel' : '+ Add Capture'}
        </button>
      </div>

      {showForm && (
        <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
          <div className="form-row">
            <div className="form-group">
              <label>Vendor</label>
              <select value={newVendor} onChange={e => setNewVendor(e.target.value as RouterVendor)}>
                {ROUTER_VENDORS.map(v => (
                  <option key={v} value={v}>{ROUTER_VENDOR_LABELS[v]}{PARSED_VENDORS.includes(v) ? '' : ' (raw only)'}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Title (optional)</label>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Before firewall change"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Raw Config</label>
            <textarea
              value={newRaw}
              onChange={e => setNewRaw(e.target.value)}
              rows={12}
              placeholder="Paste the full running-config here..."
              style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </div>
          {PARSED_VENDORS.includes(newVendor) && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
              <span className="toggle-switch">
                <input type="checkbox" checked={newParse} onChange={e => setNewParse(e.target.checked)} />
                <span className="toggle-switch-slider" />
              </span>
              Parse config
            </label>
          )}
          <button
            className="btn btn-primary"
            disabled={!newRaw.trim() || submitMut.isPending}
            onClick={() => submitMut.mutate({
              vendor: newVendor,
              raw_config: newRaw,
              ...(newTitle.trim() ? { title: newTitle.trim() } : {}),
              ...(PARSED_VENDORS.includes(newVendor) ? { parse_output: newParse } : { parse_output: false }),
            })}
          >
            {submitMut.isPending ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      )}

      {showEdit && viewedConfig && (
        <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
          <div className="form-row">
            <div className="form-group">
              <label>Vendor</label>
              <select value={editVendor} onChange={e => setEditVendor(e.target.value as RouterVendor)}>
                {ROUTER_VENDORS.map(v => (
                  <option key={v} value={v}>{ROUTER_VENDOR_LABELS[v]}{PARSED_VENDORS.includes(v) ? '' : ' (raw only)'}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Date &amp; Time (UTC)</label>
              <input
                type="datetime-local"
                value={editCapturedAt}
                onChange={e => setEditCapturedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="e.g. Before firewall change"
            />
          </div>
          <div className="form-group">
            <label>Raw Config</label>
            <textarea
              value={editRaw}
              onChange={e => setEditRaw(e.target.value)}
              rows={12}
              style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={updateMut.isPending}
              onClick={() => updateMut.mutate({
                id: viewedConfig.id,
                data: {
                  raw_config: editRaw,
                  captured_at: editCapturedAt,
                  title: editTitle,
                  vendor: editVendor,
                },
              })}
            >
              {updateMut.isPending ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowEdit(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!showEdit && viewedConfig && (
        <>
          {vendorHasParser && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
              <span className="toggle-switch">
                <input
                  type="checkbox"
                  checked={!!viewedConfig.parse_output}
                  disabled={toggleParseMut.isPending}
                  onChange={e => toggleParseMut.mutate({ id: viewedConfig.id, enable: e.target.checked })}
                />
                <span className="toggle-switch-slider" />
              </span>
              Parse config
            </label>
          )}

          {!vendorHasParser && (
            <div style={{ padding: '0.6rem 0.75rem', marginBottom: '0.75rem', background: 'var(--color-bg)', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Parsing for <strong>{ROUTER_VENDOR_LABELS[viewedConfig.vendor]}</strong> is not yet supported. Showing raw config below.
            </div>
          )}

          {vendorHasParser && viewedConfig.parse_output ? (
            <>
              <RouterSystemInfo config={viewedConfig} />
              <ParsedCard title="Interfaces" count={viewedConfig.parsed_interfaces?.length ?? 0}>
                <RouterInterfacesTable interfaces={viewedConfig.parsed_interfaces ?? []} />
              </ParsedCard>
              <ParsedCard title="VLANs" count={viewedConfig.parsed_vlans?.length ?? 0}>
                <RouterVlansTable vlans={viewedConfig.parsed_vlans ?? []} />
              </ParsedCard>
              <ParsedCard title="Static Routes" count={viewedConfig.parsed_static_routes?.length ?? 0}>
                <RouterStaticRoutesTable routes={viewedConfig.parsed_static_routes ?? []} />
              </ParsedCard>
              <ParsedCard title="Access Lists" count={viewedConfig.parsed_acls?.length ?? 0}>
                <RouterAclsTable acls={viewedConfig.parsed_acls ?? []} />
              </ParsedCard>
              <ParsedCard title="NAT" count={viewedConfig.parsed_nat_rules?.length ?? 0}>
                <RouterNatTable rules={viewedConfig.parsed_nat_rules ?? []} />
              </ParsedCard>
              <ParsedCard title="DHCP Pools" count={viewedConfig.parsed_dhcp_pools?.length ?? 0}>
                <RouterDhcpPoolsTable pools={viewedConfig.parsed_dhcp_pools ?? []} />
              </ParsedCard>
              <ParsedCard title="Users" count={viewedConfig.parsed_users?.length ?? 0}>
                <RouterUsersTable users={viewedConfig.parsed_users ?? []} />
              </ParsedCard>
              <details style={{ marginTop: '1rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  View Raw Config
                </summary>
                <pre style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--color-bg)', borderRadius: '6px', fontSize: '0.75rem', overflow: 'auto', maxHeight: '400px' }}>
                  {viewedConfig.raw_config}
                </pre>
              </details>
            </>
          ) : (
            <pre style={{ padding: '0.75rem', background: 'var(--color-bg)', borderRadius: '6px', fontSize: '0.8rem', overflow: 'auto', whiteSpace: 'pre-wrap', maxHeight: '600px' }}>
              {viewedConfig.raw_config}
            </pre>
          )}
        </>
      )}
      {showDiff && configs && configs.length >= 2 && (
        <RouterConfigDiffModal
          configs={configs}
          projectId={projectId}
          onClose={() => setShowDiff(false)}
        />
      )}
    </div>
  );
}
