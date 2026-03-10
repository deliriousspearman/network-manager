import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCredential, createCredential, updateCredential } from '../../api/credentials';
import { fetchDevices } from '../../api/devices';
import { useProject } from '../../contexts/ProjectContext';
import { CREDENTIAL_TYPES } from 'shared/types';

export default function CredentialForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [type, setType] = useState('');
  const [source, setSource] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [existingFileName, setExistingFileName] = useState<string | null>(null);
  const [removeFile, setRemoveFile] = useState(false);

  const { data: devices } = useQuery({ queryKey: ['devices', projectId], queryFn: () => fetchDevices(projectId) });
  const { data: credential } = useQuery({
    queryKey: ['credential', projectId, Number(id)],
    queryFn: () => fetchCredential(projectId, Number(id)),
    enabled: isEdit,
  });

  useEffect(() => {
    if (credential) {
      setDeviceId(credential.device_id);
      setHost(credential.host || '');
      setUsername(credential.username);
      setPassword(credential.password || '');
      setType(credential.type || '');
      setSource(credential.source || '');
      setExistingFileName(credential.file_name || null);
    }
  }, [credential]);

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? Number(e.target.value) : null;
    setDeviceId(val);
    if (val) {
      const device = devices?.find(d => d.id === val);
      if (device?.primary_ip) setHost(device.primary_ip);
    }
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    setType(newType);
    if (newType === 'VPN' || newType === 'SSH Key') {
      setPassword('');
    } else {
      setFile(null);
      setRemoveFile(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const showFileUpload = type === 'VPN' || type === 'SSH Key';

  const readFileAsBase64 = (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  };

  const mutation = useMutation({
    mutationFn: async (data: Parameters<typeof createCredential>[1]) => {
      return isEdit ? updateCredential(projectId, Number(id), data) : createCredential(projectId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials', projectId] });
      navigate(`${base}/credentials`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: Parameters<typeof createCredential>[1] = {
      device_id: deviceId,
      host: host || undefined,
      username,
      password: password || undefined,
      type: type || undefined,
      source: source || undefined,
    };

    if (file) {
      data.file_data = await readFileAsBase64(file);
      data.file_name = file.name;
    } else if (removeFile && !showFileUpload) {
      // Type changed away from VPN/SSH Key — clear file
      data.file_name = '';
    } else if (removeFile) {
      data.file_name = '';
    }

    mutation.mutate(data);
  };

  return (
    <div>
      <div className="page-header">
        <h2>{isEdit ? 'Edit Credential' : 'New Credential'}</h2>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Device</label>
            <select value={deviceId ?? ''} onChange={handleDeviceChange}>
              <option value="">None</option>
              {devices?.map(d => (
                <option key={d.id} value={d.id}>{d.name}{d.primary_ip ? ` (${d.primary_ip})` : ''}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Host</label>
            <input
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="192.168.1.1 or hostname"
            />
          </div>

          <div className="form-group">
            <label>Username <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              placeholder="admin"
            />
          </div>

          <div className="form-group">
            <label>Type</label>
            <select value={type} onChange={handleTypeChange}>
              <option value="">Select type...</option>
              {CREDENTIAL_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {showFileUpload ? (
            <div className="form-group">
              <label>File {type === 'SSH Key' ? '(Key File)' : '(Config File)'}</label>
              {existingFileName && !removeFile && !file && (
                <div className="file-existing">
                  <span>{existingFileName}</span>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setRemoveFile(true)}>
                    Remove
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                onChange={e => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  if (f) setRemoveFile(false);
                }}
              />
            </div>
          ) : (
            <div className="form-group">
              <label>Password</label>
              <input
                type="text"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}

          <div className="form-group">
            <label>Source</label>
            <input
              type="text"
              value={source}
              onChange={e => setSource(e.target.value)}
              placeholder="config file, discovered, manual..."
            />
          </div>

          {mutation.isError && (
            <div className="error-message">{String(mutation.error)}</div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Credential'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(`${base}/credentials`)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
