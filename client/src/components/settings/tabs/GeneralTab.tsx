import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import { exportBackup, importBackup } from '../../../api/backup';
import { uploadProjectImage, deleteProjectImage } from '../../../api/projects';
import { queryKeys } from '../../../api/queryKeys';
import { useProject } from '../../../contexts/ProjectContext';
import { projectImageUrl } from '../../../utils/projectAvatar';
import { fileToDataUrl } from '../../../utils/cropImage';
import ProjectImageCropper from '../ProjectImageCropper';
import ImportErrorList from '../../ui/ImportErrorList';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export default function GeneralTab() {
  const { projectId, project } = useProject();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [inclCmdOutputs, setInclCmdOutputs] = useState(true);
  const [inclCredentials, setInclCredentials] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [truncatedFields, setTruncatedFields] = useState<string[]>([]);
  const [cropper, setCropper] = useState<{ src: string; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const invalidateProjects = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['project', project.slug] });
  };

  const uploadImageMut = useMutation({
    mutationFn: (payload: { filename: string; mime_type: string; data: string }) =>
      uploadProjectImage(projectId, payload),
    onSuccess: () => {
      invalidateProjects();
      toast('Project image updated', 'success');
      setCropper(null);
    },
    onError: (err: Error) => toast(err.message || 'Failed to upload image', 'error'),
  });

  const deleteImageMut = useMutation({
    mutationFn: () => deleteProjectImage(projectId),
    onSuccess: () => { invalidateProjects(); toast('Project image removed', 'success'); },
    onError: (err: Error) => toast(err.message || 'Failed to remove image', 'error'),
  });

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast('Unsupported image type. Use PNG, JPG, GIF, WEBP, or SVG.', 'error');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast('Image exceeds 5 MB limit', 'error');
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      if (file.type === 'image/svg+xml') {
        const comma = dataUrl.indexOf(',');
        const data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        uploadImageMut.mutate({ filename: file.name, mime_type: file.type, data });
        return;
      }
      setCropper({ src: dataUrl, filename: file.name });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to read file', 'error');
    }
  }

  function handleCropSave(base64: string) {
    if (!cropper) return;
    uploadImageMut.mutate({
      filename: cropper.filename.replace(/\.[^.]+$/, '') + '.png',
      mime_type: 'image/png',
      data: base64,
    });
  }

  async function handleImageRemove() {
    const ok = await confirm(
      'Remove the project image? The sidebar will fall back to the short name chip.',
      'Remove project image',
    );
    if (!ok) return;
    deleteImageMut.mutate();
  }

  const currentImageUrl = projectImageUrl(project);
  const imageBusy = uploadImageMut.isPending || deleteImageMut.isPending;

  async function handleExport() {
    setExportLoading(true);
    try {
      await exportBackup(projectId, inclCmdOutputs, inclCredentials);
    } finally {
      setExportLoading(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setImportError('Could not read file — make sure it is a valid JSON backup.');
      return;
    }

    const ok = await confirm(
      'This will overwrite ALL existing data in this project including devices, subnets, connections, credentials, and settings. This cannot be undone. Continue?'
    );
    if (!ok) return;

    setImportLoading(true);
    setImportError(null);
    setImportSuccess(false);
    setTruncatedFields([]);
    try {
      const result = await importBackup(projectId, parsed);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.subnets.all(projectId) }),
        queryClient.invalidateQueries({ queryKey: ['connections', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['highlight-rules', projectId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.credentials.all(projectId) }),
        queryClient.invalidateQueries({ queryKey: ['diagram', projectId] }),
      ]);
      setImportSuccess(true);
      if (result.truncatedFields?.length) setTruncatedFields(result.truncatedFields);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-header-title">Project Image</h3></div>
        <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Shown in the sidebar when collapsed, and next to the project name in the switcher.
          Replaces the short-name chip when set. PNG, JPG, WEBP, GIF, or SVG — up to 5 MB.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="project-image-preview" aria-hidden="true">
            {currentImageUrl ? (
              <img src={currentImageUrl} alt="" />
            ) : (
              <span>{project.short_name || (project.name || 'P').substring(0, 2).toUpperCase()}</span>
            )}
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            style={{ display: 'none' }}
            onChange={handleImagePick}
          />
          <button
            className="btn btn-primary"
            onClick={() => imageInputRef.current?.click()}
            disabled={imageBusy}
          >
            {uploadImageMut.isPending ? 'Uploading...' : currentImageUrl ? 'Replace Image' : 'Upload Image'}
          </button>
          {currentImageUrl && (
            <button
              className="btn btn-danger"
              onClick={handleImageRemove}
              disabled={imageBusy}
            >
              {deleteImageMut.isPending ? 'Removing...' : 'Remove Image'}
            </button>
          )}
        </div>
      </div>

    <div className="card">
      <div className="card-header"><h3 className="card-header-title">Backup & Restore</h3></div>
      <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
        Export this project's data as a JSON file, or restore from a previous backup. Restoring will overwrite all data in this project.
      </p>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Export</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={inclCmdOutputs}
                onChange={e => setInclCmdOutputs(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              Include command outputs
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={inclCredentials}
                onChange={e => setInclCredentials(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              Include credentials
            </label>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0.1rem 0 0 1.4rem', visibility: inclCredentials ? 'visible' : 'hidden' }}>
              Passwords will be stored as plaintext in the backup file.
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleExport} disabled={exportLoading}>
            {exportLoading ? 'Exporting...' : 'Download Backup'}
          </button>
        </div>

        <div>
          <p style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Restore</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
            Select a backup file to restore from.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
          >
            {importLoading ? 'Restoring...' : 'Restore from Backup'}
          </button>
          {importError && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-danger)' }}>{importError}</p>
          )}
          {importSuccess && (
            <>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-success, #16a34a)' }}>Restore complete.</p>
              {truncatedFields.length > 0 && (
                <ImportErrorList
                  errors={truncatedFields.map(f => `${f}: truncated to 10,000 characters`)}
                  title={`${truncatedFields.length} field${truncatedFields.length === 1 ? '' : 's'} truncated during restore`}
                  maxHeight={160}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>

    {cropper && (
      <ProjectImageCropper
        srcDataUrl={cropper.src}
        saving={uploadImageMut.isPending}
        onCancel={() => setCropper(null)}
        onSave={handleCropSave}
      />
    )}
    </>
  );
}
