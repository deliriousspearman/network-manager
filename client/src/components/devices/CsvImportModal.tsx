import { useState, useRef } from 'react';
import Modal from '../ui/Modal';
import ImportErrorList from '../ui/ImportErrorList';
import { useProject } from '../../contexts/ProjectContext';
import { previewCsvImport, applyCsvImport, csvTemplateUrl, type CsvPreviewRow, type CsvImportResult } from '../../api/deviceCsvImport';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export default function CsvImportModal({ onClose, onImported }: Props) {
  const { projectId } = useProject();
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<CsvPreviewRow[] | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
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
      const data = await previewCsvImport(projectId, csvText);
      setPreview(data.rows);
      if (data.total === 0) setError('No valid rows found. Make sure the first row is a header with at least a "name" column.');
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
      const data = await applyCsvImport(projectId, csvText);
      setResult(data);
      onImported();
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      style={{ maxWidth: 700, width: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Import Devices from CSV</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
      }
    >
        <div style={{ flex: 1, overflow: 'auto', marginBottom: '0.75rem' }}>
          {!result ? (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                Upload a CSV file or paste CSV text. Required column: <strong>name</strong>.
                Optional: type, ip_address, mac_address, os, hostname, domain, location, tags.
                Multiple IPs or tags can be separated with semicolons.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                  Choose File
                </button>
                <a
                  href={csvTemplateUrl(projectId)}
                  download="device-import-template.csv"
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
                placeholder={'name,type,ip_address,mac_address,os,hostname,domain,location,tags\nWeb Server,server,192.168.1.10,,,web01,,,production'}
              />

              {preview && preview.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Preview ({preview.length} devices):</strong>
                  <div className="card table-container" style={{ marginTop: '0.5rem', maxHeight: 200, overflow: 'auto' }}>
                    <table style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>IP</th>
                          <th>OS</th>
                          <th>Tags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map(r => (
                          <tr key={r.row}>
                            <td>{r.name}</td>
                            <td style={{ color: r.type_valid ? undefined : 'var(--color-danger)' }}>
                              {r.type}{!r.type_valid && ' (invalid, will default to server)'}
                            </td>
                            <td>{r.ip_address || '—'}</td>
                            <td>{r.os || '—'}</td>
                            <td>{r.tags || '—'}</td>
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
                Import complete: {result.created} device{result.created !== 1 ? 's' : ''} created
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
                <button className="btn btn-primary" onClick={handleImport} disabled={loading || preview.length === 0}>
                  {loading ? 'Importing...' : `Import ${preview.length} Device${preview.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </>
          )}
        </div>
    </Modal>
  );
}
