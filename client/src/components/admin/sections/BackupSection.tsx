import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirmDialog } from '../../ui/ConfirmDialog';
import { exportFullBackup, importFullBackup } from '../../../api/backup';
import ImportErrorList from '../../ui/ImportErrorList';

export default function BackupSection() {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();

  const [inclCmdOutputs, setInclCmdOutputs] = useState(true);
  const [inclCredentials, setInclCredentials] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [truncatedFields, setTruncatedFields] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setTruncatedFields([]);
    try {
      const result = await importFullBackup(parsed);
      queryClient.invalidateQueries();
      setImportSuccess(true);
      if (result.truncatedFields?.length) setTruncatedFields(result.truncatedFields);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  return (
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
          {importSuccess && (
            <>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-success, #16a34a)' }}>Restore complete.</p>
              {truncatedFields.length > 0 && (
                <ImportErrorList
                  errors={truncatedFields.map(f => `${f}: truncated to 10,000 characters`)}
                  title={`${truncatedFields.length} field${truncatedFields.length === 1 ? '' : 's'} truncated during restore`}
                  maxHeight={160}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
