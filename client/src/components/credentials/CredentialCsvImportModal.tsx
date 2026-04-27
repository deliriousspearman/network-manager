import { useState, useRef } from 'react';
import Modal from '../ui/Modal';
import ImportErrorList from '../ui/ImportErrorList';
import { useProject } from '../../contexts/ProjectContext';
import {
  previewCredentialCsv,
  applyCredentialCsv,
  credentialCsvTemplateUrl,
  type CredentialCsvPreviewRow,
  type CredentialCsvImportResult,
} from '../../api/credentialCsvImport';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export default function CredentialCsvImportModal({ onClose, onImported }: Props) {
  const { projectId } = useProject();
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<CredentialCsvPreviewRow[] | null>(null);
  const [result, setResult] = useState<CredentialCsvImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(reader.result as string);
      setPreview(null);
      setResult(null);
      setError('');
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await previewCredentialCsv(projectId, csvText);
      setPreview(data.rows);
      if (data.total === 0) setError('No valid rows found. Make sure the first row is a header with at least a "username" column.');
    } catch (err: any) {
      setError(err.message || 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await applyCredentialCsv(projectId, csvText);
      setResult(data);
      onImported();
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const validRowCount = preview?.filter(r => r.username_valid).length ?? 0;

  return (
    <Modal
      onClose={onClose}
      style={{ maxWidth: 800, width: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Import Credentials from CSV</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
      }
    >
        <div style={{ flex: 1, overflow: 'auto', marginBottom: '0.75rem' }}>
          {!result ? (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                Upload a CSV file or paste CSV text. Required column: <strong>username</strong>.
                Optional: password, type, host, device_name, source, used.
                Device is linked by matching <code>device_name</code> within this project; unmatched names create the credential with no device.
                Valid types: SSH, RDP, HTTP, SNMP, SQL, VPN, SSH Key, Other.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                  Choose File
                </button>
                <a
                  href={credentialCsvTemplateUrl(projectId)}
                  download="credential-import-template.csv"
                  className="btn btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  Download Template
                </a>
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
              </div>
              <textarea
                className="code-textarea"
                value={csvText}
                onChange={e => { setCsvText(e.target.value); setPreview(null); }}
                rows={6}
                placeholder={'username,password,type,host,device_name,source,used\nadmin,s3cret,SSH,192.168.1.1,Core Switch,Initial deploy,false'}
              />

              {preview && preview.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>
                    Preview ({preview.length} row{preview.length !== 1 ? 's' : ''}
                    {validRowCount !== preview.length && `, ${validRowCount} importable`})
                  </strong>
                  <div className="card table-container" style={{ marginTop: '0.5rem', maxHeight: 260, overflow: 'auto' }}>
                    <table style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Username</th>
                          <th>Type</th>
                          <th>Host</th>
                          <th>Device</th>
                          <th>Source</th>
                          <th>Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map(r => (
                          <tr key={r.row}>
                            <td>{r.row}</td>
                            <td style={{ color: r.username_valid ? undefined : 'var(--color-danger)' }}>
                              {r.username || '(missing)'}
                            </td>
                            <td style={{ color: r.type_valid ? undefined : 'var(--color-danger)' }}>
                              {r.type || '—'}{!r.type_valid && ' (invalid, will clear)'}
                            </td>
                            <td>{r.host || '—'}</td>
                            <td>
                              {r.device_name
                                ? (r.device_matched
                                    ? <span style={{ color: 'var(--color-success, #1a7f37)' }}>✓ {r.device_name}</span>
                                    : <span style={{ color: 'var(--color-text-secondary)' }}>— {r.device_name} (unmatched)</span>)
                                : '—'}
                            </td>
                            <td>{r.source || '—'}</td>
                            <td>{r.used ? 'yes' : 'no'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>
                Import complete: {result.imported} credential{result.imported !== 1 ? 's' : ''} created
                {result.skipped > 0 && `, ${result.skipped} skipped`}
              </p>
              <ImportErrorList errors={result.errors} />

            </div>
          )}

          {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</div>}
        </div>

        <div className="confirm-dialog-actions">
          {result ? (
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              {!preview ? (
                <button className="btn btn-primary" onClick={handlePreview} disabled={!csvText.trim() || loading}>
                  {loading ? 'Parsing...' : 'Preview'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleImport} disabled={loading || validRowCount === 0}>
                  {loading ? 'Importing...' : `Import ${validRowCount} Credential${validRowCount !== 1 ? 's' : ''}`}
                </button>
              )}
            </>
          )}
        </div>
    </Modal>
  );
}
