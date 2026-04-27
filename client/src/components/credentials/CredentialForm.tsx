import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCredential, createCredential, updateCredential, fetchCredentialFileText } from '../../api/credentials';
import { queryKeys } from '../../api/queryKeys';
import { useProject } from '../../contexts/ProjectContext';
import DevicePicker from '../ui/DevicePicker';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { onCmdEnterSubmit } from '../../hooks/useCmdEnterSubmit';
import { useToast } from '../ui/Toast';
import { CREDENTIAL_TYPES } from 'shared/types';
import { formErrorMessage } from '../../utils/formError';
import PasswordHistorySection from './PasswordHistorySection';

interface Props {
  onClose?: () => void;
  editId?: number;
  defaultDeviceId?: number;
}

export default function CredentialForm({ onClose, editId, defaultDeviceId }: Props = {}) {
  const params = useParams();
  const isModal = !!onClose;
  const id = editId ?? (params.id ? Number(params.id) : undefined);
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId, project } = useProject();
  const toast = useToast();
  const base = `/p/${project.slug}`;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deviceId, setDeviceId] = useState<number | null>(defaultDeviceId ?? null);
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [type, setType] = useState('');
  const [source, setSource] = useState('');
  const [used, setUsed] = useState(false);
  const [existingFileName, setExistingFileName] = useState<string | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  // Paste mode (used by both SSH Key and VPN types): textarea content +
  // originating filename if the user used the Browse… button to load a file.
  const [fileText, setFileText] = useState('');
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Only block navigation for page-mode (not modal)
  useUnsavedChanges(!isModal && isDirty);

  const { data: credential } = useQuery({
    queryKey: queryKeys.credentials.detail(projectId, id!),
    queryFn: () => fetchCredential(projectId, id!),
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
      setUsed(!!credential.used);
      setExistingFileName(credential.file_name || null);
    }
  }, [credential]);

  // For SSH Key + VPN edits, fetch the existing file content into the textarea
  // so the user can see + tweak it. Failure (network, file gone) silently
  // leaves the textarea empty; on save the user can re-paste or browse again.
  useEffect(() => {
    if (!isEdit || !id || !credential?.file_name) return;
    if (credential.type !== 'SSH Key' && credential.type !== 'VPN') return;
    let cancelled = false;
    fetchCredentialFileText(projectId, id)
      .then(text => { if (!cancelled) { setFileText(text); setSourceFileName(credential.file_name); } })
      .catch(() => { /* ignore — user can re-paste */ });
    return () => { cancelled = true; };
  }, [credential, isEdit, projectId, id]);

  const handleDeviceChange = (val: number | null, _name?: string, primaryIp?: string | null) => {
    setDeviceId(val);
    if (val && primaryIp) setHost(primaryIp);
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    setType(newType);
    if (newType === 'VPN' || newType === 'SSH Key') {
      setPassword('');
    } else {
      setFileText('');
      setSourceFileName(null);
      setRemoveFile(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isFileType = type === 'VPN' || type === 'SSH Key';

  // Per-type UI config for the textarea + browse pair. Both SSH Key and VPN
  // use the same paste-friendly pattern; only the labels, placeholder, file
  // picker accept list, and default filename when pasting differ.
  const fileTypeConfig: Record<string, { label: string; placeholder: string; accept: string; defaultName: string }> = {
    'SSH Key': {
      label: 'SSH Key',
      placeholder: 'Paste the key contents here, or use Browse… to load a file\n\n-----BEGIN OPENSSH PRIVATE KEY-----\n…',
      accept: '.pem,.key,.pub,.ppk,text/plain,application/x-pem-file,*/*',
      defaultName: 'id_rsa',
    },
    VPN: {
      label: 'VPN Config',
      placeholder: 'Paste the config contents here, or use Browse… to load a file\n\n# OpenVPN client config\nclient\nremote vpn.example.com 1194\n…',
      accept: '.conf,.ovpn,.ini,.xml,.pcf,text/plain,*/*',
      defaultName: 'vpn.conf',
    },
  };
  const cfg = isFileType ? fileTypeConfig[type] : null;

  // text → base64. Works on plain ASCII (which keys/configs are); the
  // encodeURIComponent pass also handles any stray UTF-8 the user may have
  // pasted, since btoa() alone throws on chars > 0xFF.
  const textToBase64 = (text: string): string => {
    return btoa(unescape(encodeURIComponent(text)));
  };

  const handleFileBrowse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      setFileText(text);
      setSourceFileName(f.name);
      setRemoveFile(false);
      setIsDirty(true);
    } catch {
      toast('Failed to read file', 'error');
    } finally {
      // Reset so re-selecting the same file fires onChange again.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const done = () => {
    setIsDirty(false);
    if (isModal) onClose!();
    else navigate(`${base}/credentials`);
  };

  const mutation = useMutation({
    mutationFn: async (data: Parameters<typeof createCredential>[1]) => {
      return isEdit ? updateCredential(projectId, id!, data) : createCredential(projectId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials.all(projectId) });
      done();
    },
    onError: (err: Error) => toast(err.message || 'Failed to save credential', 'error'),
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
      used: used ? 1 : 0,
    };

    if (isFileType && cfg) {
      // Paste mode: encode textarea content as the saved blob. file_name
      // defaults to the type's defaultName when the user pasted without browsing.
      if (fileText.trim()) {
        data.file_data = textToBase64(fileText);
        data.file_name = sourceFileName || cfg.defaultName;
      } else if (existingFileName || removeFile) {
        // Empty textarea + had a stored file → clear it.
        data.file_name = '';
      }
    } else if (removeFile) {
      // Type changed away from a file-bearing one and there was an existing file → clear it.
      data.file_name = '';
    }

    if (isEdit && credential?.updated_at) {
      data.updated_at = credential.updated_at;
    }

    mutation.mutate(data);
  };

  const formContent = (
    <form onSubmit={handleSubmit} onKeyDown={onCmdEnterSubmit} onChange={() => setIsDirty(true)}>
      <div className="form-group">
        <label>Device</label>
        <DevicePicker value={deviceId} onChange={handleDeviceChange} placeholder="None" />
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

      {isFileType && cfg ? (
        <div className="form-group">
          <label>{cfg.label}</label>
          <textarea
            value={fileText}
            onChange={e => { setFileText(e.target.value); setRemoveFile(false); if (!e.target.value) setSourceFileName(null); }}
            rows={8}
            placeholder={cfg.placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            style={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
              Browse…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={cfg.accept}
              style={{ display: 'none' }}
              onChange={handleFileBrowse}
            />
            {sourceFileName && (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                Loaded from: {sourceFileName}
              </span>
            )}
            {(fileText || existingFileName) && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => { setFileText(''); setSourceFileName(null); setRemoveFile(true); }}
              >
                Clear
              </button>
            )}
          </div>
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

      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={used}
            onChange={e => setUsed(e.target.checked)}
            style={{ width: 'auto', margin: 0 }}
          />
          Credential has been used
        </label>
      </div>

      {mutation.isError && (
        <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          {formErrorMessage(mutation.error)}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Credential'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={done}>
          Cancel
        </button>
      </div>
    </form>
  );

  const historySection = isEdit && id ? (
    <PasswordHistorySection projectId={projectId} credentialId={id} />
  ) : null;

  if (isModal) return (
    <>
      {formContent}
      {historySection}
    </>
  );

  return (
    <div>
      <div className="page-header">
        <h2>{isEdit ? 'Edit Credential' : 'New Credential'}</h2>
      </div>
      <div className="card">
        {formContent}
        {historySection}
      </div>
    </div>
  );
}
