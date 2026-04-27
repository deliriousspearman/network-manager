import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Upload, Download } from 'lucide-react';
import { useProject } from '../../contexts/ProjectContext';
import { fetchDeviceAttachments, uploadDeviceAttachment, deleteDeviceAttachment, attachmentUrl } from '../../api/deviceAttachments';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import type { DeviceAttachment } from 'shared/types';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DeviceAttachmentsSection({ deviceId }: { deviceId: number }) {
  const { projectId } = useProject();
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: attachments = [] } = useQuery({
    queryKey: ['device-attachments', projectId, deviceId],
    queryFn: () => fetchDeviceAttachments(projectId, deviceId),
  });

  const uploadMut = useMutation({
    mutationFn: (payload: { filename: string; mime_type: string; size: number; data: string }) =>
      uploadDeviceAttachment(projectId, deviceId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device-attachments', projectId, deviceId] }),
    onError: (err: Error) => toast(err.message || 'Failed to upload attachment', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (attachmentId: number) => deleteDeviceAttachment(projectId, deviceId, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device-attachments', projectId, deviceId] }),
    onError: (err: Error) => toast(err.message || 'Failed to delete attachment', 'error'),
  });

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);

    if (file.size > MAX_SIZE) {
      setError(`File "${file.name}" exceeds the 5 MB limit (${formatSize(file.size)}).`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      uploadMut.mutate({ filename: file.name, mime_type: file.type || 'application/octet-stream', size: file.size, data: base64 });
    };
    reader.readAsDataURL(file);
  }

  async function handleDelete(att: DeviceAttachment) {
    if (await confirm(`Delete "${att.filename}"?`)) {
      deleteMut.mutate(att.id);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1rem', margin: 0 }}>Attachments</h3>
        <button
          className="btn btn-outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
        >
          <Upload size={14} style={{ marginRight: '0.3rem' }} />
          {uploadMut.isPending ? 'Uploading...' : 'Upload File'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>

      {error && (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-danger)', marginBottom: '0.5rem' }}>{error}</p>
      )}

      {attachments.length === 0 ? (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
          No attachments yet. Click Upload File to add one (max 5 MB).
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Filename</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {attachments.map(att => (
              <tr key={att.id}>
                <td>{att.filename}</td>
                <td>{formatSize(att.size)}</td>
                <td>{new Date(att.created_at).toLocaleDateString()}</td>
                <td className="actions">
                  <a
                    href={attachmentUrl(projectId, deviceId, att.id)}
                    download={att.filename}
                    className="btn btn-secondary btn-sm"
                    title="Download"
                  >
                    <Download size={13} />
                  </a>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(att)}
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
