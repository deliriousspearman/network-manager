import { useState } from 'react';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOutputsForDevice, fetchOutput, submitOutput, deleteOutput } from '../../api/commandOutputs';
import { fetchHighlightRules } from '../../api/highlightRules';
import { fetchSettings } from '../../api/settings';
import { useProject } from '../../contexts/ProjectContext';
import type { CommandType, CommandOutput, CommandOutputWithParsed, HighlightRule } from 'shared/types';
import ProcessTable from './ProcessTable';
import ConnectionsTable from './ConnectionsTable';
import LoginHistoryTable from './LoginHistoryTable';
import InterfacesTable from './InterfacesTable';
import MountTable from './MountTable';
import RoutesTable from './RoutesTable';
import ServicesTable from './ServicesTable';

const COMMAND_LABELS: Record<CommandType, string> = {
  ps: 'Processes',
  netstat: 'Network Connections',
  last: 'Logins',
  ip_a: 'IP Info',
  mount: 'Mount',
  ip_r: 'Routes',
  systemctl_status: 'Services',
  freeform: 'Notes',
};

const COMMAND_TYPES = Object.keys(COMMAND_LABELS) as CommandType[];

function formatTimestamp(capturedAt: string, title: string | null, timezone = 'UTC'): string {
  const date = new Date(capturedAt + 'Z');
  const dateStr = date.toLocaleString(undefined, { timeZone: timezone });
  const tzAbbr = new Intl.DateTimeFormat(undefined, { timeZone: timezone, timeZoneName: 'short' })
    .formatToParts(date)
    .find(p => p.type === 'timeZoneName')?.value ?? timezone;
  const timestamp = `${dateStr} ${tzAbbr}`;
  return title ? `${title} - ${timestamp}` : timestamp;
}

export default function CommandSection({ deviceId }: { deviceId: number }) {
  const { projectId } = useProject();
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<CommandType>('ps');
  const [selectedOutputId, setSelectedOutputId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const [noteTitle, setNoteTitle] = useState('');

  const { data: rules = [] } = useQuery({
    queryKey: ['highlight-rules', projectId],
    queryFn: () => fetchHighlightRules(projectId),
  });

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: fetchSettings,
    staleTime: Infinity,
  });

  const { data: outputs } = useQuery({
    queryKey: ['outputs', projectId, deviceId],
    queryFn: () => fetchOutputsForDevice(projectId, deviceId),
  });

  const { data: viewedOutput } = useQuery({
    queryKey: ['output', projectId, selectedOutputId],
    queryFn: () => fetchOutput(projectId, selectedOutputId!),
    enabled: selectedOutputId !== null,
  });

  const submitMut = useMutation({
    mutationFn: (data: { command_type: CommandType; raw_output: string; title?: string }) =>
      submitOutput(projectId, deviceId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['outputs', projectId, deviceId] });
      setSelectedOutputId(result.id);
      setShowForm(false);
      setRawInput('');
      setNoteTitle('');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteOutput(projectId, id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['outputs', projectId, deviceId] });
      if (deletedId === selectedOutputId) {
        const remaining = (outputs ?? []).filter(o => o.command_type === activeTab && o.id !== deletedId);
        setSelectedOutputId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
  });

  function handleTabChange(tab: CommandType) {
    setActiveTab(tab);
    setShowForm(false);
    setRawInput('');
    setNoteTitle('');
    const tabOutputs = (outputs ?? []).filter(o => o.command_type === tab);
    setSelectedOutputId(tabOutputs.length > 0 ? tabOutputs[0].id : null);
  }

  const tabOutputs = (outputs ?? []).filter(o => o.command_type === activeTab);
  const timezone = settings?.timezone ?? 'UTC';

  return (
    <div className="command-section">
      <h3 style={{ marginBottom: '1rem' }}>Command Outputs</h3>

      <div className="command-tabs">
        {COMMAND_TYPES.map(t => (
          <button
            key={t}
            className={`command-tab${activeTab === t ? ' active' : ''}`}
            onClick={() => handleTabChange(t)}
          >
            {COMMAND_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {tabOutputs.length > 0 ? (
            <>
              <select
                value={selectedOutputId ?? ''}
                onChange={e => setSelectedOutputId(Number(e.target.value))}
                style={{
                  flex: '1',
                  minWidth: '180px',
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
                {tabOutputs.map((o: CommandOutput) => (
                  <option key={o.id} value={o.id}>
                    {formatTimestamp(o.captured_at, o.title ?? null, timezone)}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-danger btn-sm"
                disabled={selectedOutputId === null || deleteMut.isPending}
                onClick={async () => {
                  if (selectedOutputId !== null && await confirm('Delete this capture?')) {
                    deleteMut.mutate(selectedOutputId);
                  }
                }}
              >
                Delete
              </button>
            </>
          ) : (
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              No captures yet for {COMMAND_LABELS[activeTab]}.
            </span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowForm(f => !f)}
          >
            {showForm ? 'Cancel' : '+ Add Capture'}
          </button>
        </div>

        {showForm && (
          <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
            {activeTab === 'freeform' && (
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  placeholder="e.g. Temporary Notes"
                />
              </div>
            )}
            <div className="form-group">
              <label>Raw Output</label>
              <textarea
                value={rawInput}
                onChange={e => setRawInput(e.target.value)}
                rows={8}
                placeholder={`Paste the output of "${COMMAND_LABELS[activeTab]}" here...`}
                style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={() => submitMut.mutate({
                command_type: activeTab,
                raw_output: rawInput,
                ...(activeTab === 'freeform' && noteTitle.trim() ? { title: noteTitle.trim() } : {}),
              })}
              disabled={!rawInput.trim() || submitMut.isPending}
            >
              {submitMut.isPending ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        )}

        {viewedOutput && viewedOutput.command_type === activeTab && (
          <>
            {renderParsedData(viewedOutput, rules)}
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                View Raw Output
              </summary>
              <pre style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--color-bg)', borderRadius: '6px', fontSize: '0.75rem', overflow: 'auto', maxHeight: '300px' }}>
                {viewedOutput.raw_output}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function renderParsedData(output: CommandOutputWithParsed, rules: HighlightRule[]) {
  switch (output.command_type) {
    case 'ps':
      return <ProcessTable processes={output.parsed_processes || []} rules={rules} />;
    case 'netstat':
      return <ConnectionsTable connections={output.parsed_connections || []} rules={rules} />;
    case 'last':
      return <LoginHistoryTable logins={output.parsed_logins || []} rules={rules} />;
    case 'ip_a':
      return <InterfacesTable interfaces={output.parsed_interfaces || []} rules={rules} />;
    case 'mount':
      return <MountTable mounts={output.parsed_mounts || []} rules={rules} />;
    case 'ip_r':
      return <RoutesTable routes={output.parsed_routes || []} rules={rules} />;
    case 'systemctl_status':
      return <ServicesTable services={output.parsed_services || []} rules={rules} />;
    case 'freeform':
      return (
        <pre style={{ padding: '0.75rem', background: 'var(--color-bg)', borderRadius: '6px', fontSize: '0.8rem', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
          {output.raw_output}
        </pre>
      );
    default:
      return null;
  }
}
