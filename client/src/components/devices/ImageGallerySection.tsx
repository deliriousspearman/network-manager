import { useRef, useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, ChevronLeft, ChevronRight, Trash2, Upload } from 'lucide-react';
import { useProject } from '../../contexts/ProjectContext';
import { fetchDeviceImages, uploadDeviceImage, deleteDeviceImage, imageUrl } from '../../api/deviceImages';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import type { DeviceImage } from 'shared/types';

export default function ImageGallerySection({ deviceId }: { deviceId: number }) {
  const { projectId } = useProject();
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slideIndex, setSlideIndex] = useState<number | null>(null);

  const { data: images = [] } = useQuery({
    queryKey: ['device-images', projectId, deviceId],
    queryFn: () => fetchDeviceImages(projectId, deviceId),
  });

  const uploadMut = useMutation({
    mutationFn: (payload: { filename: string; mime_type: string; data: string }) =>
      uploadDeviceImage(projectId, deviceId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device-images', projectId, deviceId] }),
    onError: () => toast('Failed to upload image', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (imageId: number) => deleteDeviceImage(projectId, deviceId, imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-images', projectId, deviceId] });
      setSlideIndex(null);
    },
    onError: () => toast('Failed to delete image', 'error'),
  });

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:image/...;base64," prefix
      const base64 = dataUrl.split(',')[1];
      uploadMut.mutate({ filename: file.name, mime_type: file.type, data: base64 });
    };
    reader.readAsDataURL(file);
  }

  const openSlide = (idx: number) => setSlideIndex(idx);
  const closeSlide = useCallback(() => setSlideIndex(null), []);
  const prevSlide = useCallback(
    () => setSlideIndex(i => (i != null ? (i - 1 + images.length) % images.length : 0)),
    [images.length],
  );
  const nextSlide = useCallback(
    () => setSlideIndex(i => (i != null ? (i + 1) % images.length : 0)),
    [images.length],
  );

  useEffect(() => {
    if (slideIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSlide();
      else if (e.key === 'ArrowLeft') prevSlide();
      else if (e.key === 'ArrowRight') nextSlide();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slideIndex, closeSlide, prevSlide, nextSlide]);

  async function handleDelete(img: DeviceImage) {
    if (await confirm(`Delete "${img.filename}"?`)) {
      deleteMut.mutate(img.id);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1rem', margin: 0 }}>Image Gallery</h3>
        <button
          className="btn btn-outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
        >
          <Upload size={14} style={{ marginRight: '0.3rem' }} />
          {uploadMut.isPending ? 'Uploading...' : 'Upload Image'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>

      {images.length === 0 ? (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
          No images yet. Click Upload Image to add one.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {images.map((img, idx) => (
            <div
              key={img.id}
              style={{ position: 'relative', cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--color-border)' }}
              onClick={() => openSlide(idx)}
            >
              <img
                src={imageUrl(projectId, deviceId, img.id)}
                alt={img.filename}
                style={{ width: '100px', height: '80px', objectFit: 'cover', display: 'block' }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Slideshow overlay */}
      {slideIndex !== null && images[slideIndex] && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={closeSlide}
        >
          <div
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <img
              src={imageUrl(projectId, deviceId, images[slideIndex].id)}
              alt={images[slideIndex].filename}
              style={{ maxWidth: '85vw', maxHeight: '80vh', objectFit: 'contain', display: 'block', borderRadius: '6px' }}
            />
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: '0.4rem' }}>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDelete(images[slideIndex!])}
                title="Delete image"
              >
                <Trash2 size={14} />
              </button>
              <button className="btn btn-secondary btn-sm" onClick={closeSlide} title="Close">
                <X size={14} />
              </button>
            </div>
            {images.length > 1 && (
              <>
                <button
                  onClick={prevSlide}
                  style={{
                    position: 'absolute', left: -48, top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                    width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                  }}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={nextSlide}
                  style={{
                    position: 'absolute', right: -48, top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                    width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                  }}
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
            <div style={{ textAlign: 'center', color: '#ccc', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              {images[slideIndex].filename} — {slideIndex + 1} / {images.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
