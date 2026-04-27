import { useRef, useState } from 'react';
import { BUILTIN_AGENT_ICON_KEYS } from 'shared/types';
import { DEFAULT_AGENT_ICONS } from '../../assets/agent-icons';

export type AgentIconValue =
  | { icon_source: 'builtin'; icon_builtin_key: string }
  | { icon_source: 'upload'; filename: string; mime_type: string; data: string; previewUrl: string };

interface Props {
  value: AgentIconValue;
  onChange: (v: AgentIconValue) => void;
}

export default function AgentIconPicker({ value, onChange }: Props) {
  const [tab, setTab] = useState<'gallery' | 'upload'>(value.icon_source === 'upload' ? 'upload' : 'gallery');
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function pickGallery(key: string) {
    onChange({ icon_source: 'builtin', icon_builtin_key: key });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    if (file.size > 512 * 1024) {
      setError('Icon must be 512 KB or smaller');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setError(`Unsupported image type. Allowed: ${allowed.join(', ')}`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const data = result.split(',')[1] ?? '';
      onChange({
        icon_source: 'upload',
        filename: file.name,
        mime_type: file.type,
        data,
        previewUrl: result,
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'gallery' ? 'btn-primary' : ''}`}
          onClick={() => setTab('gallery')}
        >
          Gallery
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'upload' ? 'btn-primary' : ''}`}
          onClick={() => setTab('upload')}
        >
          Upload custom
        </button>
      </div>

      {tab === 'gallery' ? (
        <div className="settings-icon-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {BUILTIN_AGENT_ICON_KEYS.map(key => {
            const selected = value.icon_source === 'builtin' && value.icon_builtin_key === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => pickGallery(key)}
                className="settings-icon-card"
                style={{
                  border: selected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: selected ? 'var(--color-primary-bg, rgba(59,130,246,0.08))' : 'transparent',
                  cursor: 'pointer',
                  padding: '0.5rem',
                }}
              >
                <img src={DEFAULT_AGENT_ICONS[key]} alt={key} className="settings-icon-preview" draggable={false} />
                <div className="settings-icon-label" style={{ textTransform: 'capitalize' }}>{key}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 80, height: 80, border: '1px dashed var(--color-border)', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              background: 'var(--color-input-bg)',
            }}>
              {value.icon_source === 'upload' ? (
                <img src={value.previewUrl} alt={value.filename} style={{ maxWidth: '100%', maxHeight: '100%' }} />
              ) : (
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>No image</span>
              )}
            </div>
            <div>
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                {value.icon_source === 'upload' ? 'Replace' : 'Choose file'}
              </button>
              {value.icon_source === 'upload' && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                  {value.filename}
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                Max 512 KB. PNG, JPEG, GIF, WebP, SVG.
              </div>
            </div>
          </div>
          {error && <div style={{ color: 'var(--color-danger)', marginTop: '0.5rem', fontSize: '0.8rem' }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
