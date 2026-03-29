import { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProject } from '../../contexts/ProjectContext';
import { updateDevice } from '../../api/devices';
import { RichToolbar } from '../ui/RichEditor';

interface Props {
  deviceId: number;
  initialHtml: string | null;
}

export default function DeviceNotesSection({ deviceId, initialHtml }: Props) {
  const { projectId } = useProject();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const saveMut = useMutation({
    mutationFn: (html: string) => updateDevice(projectId, deviceId, { rich_notes: html }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', projectId, deviceId] });
      setEditing(false);
    },
  });

  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.innerHTML = initialHtml || '';
    }
  }, [editing]);

  const handleSave = () => {
    const html = editorRef.current?.innerHTML || '';
    saveMut.mutate(html);
  };

  const isHtml = !!(initialHtml && initialHtml.includes('<'));

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1rem', margin: 0 }}>Notes</h3>
        {!editing && (
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>

      {editing ? (
        <>
          <RichToolbar editorRef={editorRef} />
          <div
            ref={editorRef}
            className="overview-rich-editor"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Add notes for this device..."
          />
          {saveMut.isError && (
            <div className="error-message" style={{ marginTop: '0.5rem' }}>{String(saveMut.error)}</div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : initialHtml ? (
        isHtml
          ? <div className="overview-rich-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(initialHtml) }} />
          : <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{initialHtml}</p>
      ) : (
        <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', fontSize: '0.9rem' }}>
          No notes yet. Click Edit to add some.
        </p>
      )}
    </div>
  );
}
