import { useMemo, useRef, useState } from 'react';
import { ICON_LIBRARIES, libraryIconUrl } from '../../iconLibraries/manifest';
import { ColourPicker } from '../ui/ColourPicker';
import IconRenderer from '../ui/IconRenderer';

export type DeviceIconPickerValue =
  | { icon_source: 'library'; library_id: string; library_icon_key: string; color?: string | null }
  | { icon_source: 'upload'; filename: string; mime_type: string; data: string; previewUrl: string; color?: string | null };

interface Props {
  value: DeviceIconPickerValue | null;
  onChange: (v: DeviceIconPickerValue) => void;
  // Optional hint: when picking for a known device type, libraries surface
  // matching `suggestedTypes` icons first.
  suggestedType?: string;
  // When true, only the library tab is shown (used by the drawio import
  // flow where we can't accept an arbitrary upload mid-import).
  librariesOnly?: boolean;
}

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 512 * 1024;

export default function DeviceIconPicker({ value, onChange, suggestedType, librariesOnly = false }: Props) {
  const [tab, setTab] = useState<'library' | 'upload'>(
    librariesOnly ? 'library' : (value?.icon_source === 'upload' ? 'upload' : 'library')
  );
  const [libraryId, setLibraryId] = useState<string>(
    (value?.icon_source === 'library' && value.library_id) || ICON_LIBRARIES[0]?.id || ''
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const currentLib = useMemo(() => ICON_LIBRARIES.find(l => l.id === libraryId), [libraryId]);

  // When a suggestedType is provided, surface matches first within the chosen library.
  const orderedIcons = useMemo(() => {
    if (!currentLib) return [];
    if (!suggestedType) return currentLib.icons;
    const matches: typeof currentLib.icons = [];
    const rest: typeof currentLib.icons = [];
    for (const i of currentLib.icons) {
      if (i.suggestedTypes?.includes(suggestedType)) matches.push(i);
      else rest.push(i);
    }
    return [...matches, ...rest];
  }, [currentLib, suggestedType]);

  // Color is decoupled from icon source: when the user changes only the color,
  // we keep the existing icon source and just merge in the new tint.
  const currentColor = value?.color ?? null;
  const handleColorChange = (c: string | null) => {
    if (!value) return; // No icon selected yet — color alone isn't a valid value.
    onChange({ ...value, color: c });
  };

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    if (file.size > MAX_BYTES) {
      setError('Icon must be 512 KB or smaller');
      return;
    }
    if (!ALLOWED_MIMES.includes(file.type)) {
      setError(`Unsupported image type. Allowed: ${ALLOWED_MIMES.join(', ')}`);
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
        color: currentColor,
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'library' ? 'btn-primary' : ''}`}
          onClick={() => setTab('library')}
        >
          Library
        </button>
        {!librariesOnly && (
          <button
            type="button"
            className={`btn btn-sm ${tab === 'upload' ? 'btn-primary' : ''}`}
            onClick={() => setTab('upload')}
          >
            Upload custom
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Tint:</span>
          <ColourPicker
            value={currentColor ?? undefined}
            onChange={handleColorChange}
            disabled={!value}
          />
        </div>
      </div>
      {!value && (
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
          Pick an icon first, then optionally tint it. The tint replaces the icon's native colors with a single hue — best for monochrome icons.
        </div>
      )}

      {tab === 'library' ? (
        <div>
          <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label htmlFor="device-icon-library-select" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Collection:
            </label>
            <select
              id="device-icon-library-select"
              value={libraryId}
              onChange={e => setLibraryId(e.target.value)}
              className="list-filter-select"
            >
              {ICON_LIBRARIES.map(l => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>
          <div
            className="device-icon-picker-grid"
            style={{ maxHeight: 320, overflowX: 'hidden', overflowY: 'auto' }}
          >
            {orderedIcons.map(icon => {
              const selected = value?.icon_source === 'library'
                && value.library_id === libraryId
                && value.library_icon_key === icon.key;
              return (
                <button
                  key={icon.key}
                  type="button"
                  onClick={() => onChange({ icon_source: 'library', library_id: libraryId, library_icon_key: icon.key, color: currentColor })}
                  className="device-icon-picker-card"
                  style={{
                    border: selected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: selected ? 'var(--color-primary-bg, rgba(59,130,246,0.08))' : 'transparent',
                  }}
                  title={icon.label}
                >
                  <IconRenderer
                    src={libraryIconUrl(libraryId, icon.key)}
                    color={currentColor}
                    size={48}
                    alt={icon.label}
                    className="device-icon-picker-preview"
                  />
                  <div className="device-icon-picker-card-label">{icon.label}</div>
                </button>
              );
            })}
            {orderedIcons.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '1rem', color: 'var(--color-text-secondary)' }}>
                No icons in this collection.
              </div>
            )}
          </div>
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
              {value?.icon_source === 'upload' ? (
                <img src={value.previewUrl} alt={value.filename} style={{ maxWidth: '100%', maxHeight: '100%' }} />
              ) : (
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>No image</span>
              )}
            </div>
            <div>
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                {value?.icon_source === 'upload' ? 'Replace' : 'Choose file'}
              </button>
              {value?.icon_source === 'upload' && (
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
