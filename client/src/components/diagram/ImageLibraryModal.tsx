import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Plus, Trash2 } from 'lucide-react';
import { fetchImageLibrary, imageLibraryImageUrl, fetchImageLibraryData, uploadImageToLibrary, deleteImageFromLibrary } from '../../api/imageLibrary';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import Modal from '../ui/Modal';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  projectId: number;
  open: boolean;
  onClose: () => void;
  onPlaceImage: (payload: { filename: string; mime_type: string; data: string }) => void;
}

export default function ImageLibraryModal({ projectId, open, onClose, onPlaceImage }: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [placingId, setPlacingId] = useState<number | null>(null);

  const { data: images, isLoading } = useQuery({
    queryKey: ['image-library', projectId],
    queryFn: () => fetchImageLibrary(projectId),
    enabled: open,
  });

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > MAX_SIZE) {
      toast(`File "${file.name}" exceeds the 2 MB limit`, 'error');
      return;
    }
    if (!ALLOWED_MIMES.includes(file.type)) {
      toast(`Unsupported file type. Allowed: JPEG, PNG, GIF, WebP, SVG`, 'error');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      try {
        await uploadImageToLibrary(projectId, {
          filename: file.name,
          mime_type: file.type,
          data: base64,
        });
        queryClient.invalidateQueries({ queryKey: ['image-library', projectId] });
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Failed to upload image', 'error');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }, [projectId, queryClient, toast]);

  const handlePlace = useCallback(async (imageId: number) => {
    setPlacingId(imageId);
    try {
      const payload = await fetchImageLibraryData(projectId, imageId);
      onPlaceImage(payload);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to place image', 'error');
    } finally {
      setPlacingId(null);
    }
  }, [projectId, onPlaceImage, toast]);

  const handleDelete = useCallback(async (imageId: number) => {
    if (!await confirm('Delete this image from the library?')) return;
    try {
      await deleteImageFromLibrary(projectId, imageId);
      queryClient.invalidateQueries({ queryKey: ['image-library', projectId] });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete image', 'error');
    }
  }, [projectId, queryClient, confirm, toast]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="image-library-modal"
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Image Library</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
      }
    >
      <div className="image-library-upload-area">
        <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload size={14} style={{ marginRight: 4 }} />
          {uploading ? 'Uploading...' : 'Upload Image'}
        </button>
        <span className="upload-info">Max 2 MB. JPEG, PNG, GIF, WebP, SVG.</span>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
      </div>

      {isLoading ? (
        <div className="image-library-empty">Loading...</div>
      ) : !images || images.length === 0 ? (
        <div className="image-library-empty">No images in library. Upload an image to get started.</div>
      ) : (
        <div className="image-library-grid">
          {images.map(img => (
            <div key={img.id} className="image-library-item">
              <img
                className="image-library-item-thumb"
                src={imageLibraryImageUrl(projectId, img.id)}
                alt={img.filename}
                draggable={false}
              />
              <div className="image-library-item-info">
                <div className="filename" title={img.filename}>{img.filename}</div>
                <div className="filesize">{formatFileSize(img.size)}</div>
              </div>
              <div className="image-library-item-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handlePlace(img.id)}
                  disabled={placingId === img.id}
                >
                  <Plus size={13} style={{ marginRight: 2 }} />
                  {placingId === img.id ? 'Adding...' : 'Add'}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(img.id)}
                  title="Delete from library"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
