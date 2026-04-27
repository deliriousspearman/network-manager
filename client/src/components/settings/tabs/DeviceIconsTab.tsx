import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import Modal from '../../ui/Modal';
import {
  fetchTypeDefaults,
  typeDefaultIconUrl,
  uploadTypeDefault,
  deleteTypeDefault,
  type IconUploadPayload,
  type TypeDefaultRow,
} from '../../../api/diagramIcons';
import { useProject } from '../../../contexts/ProjectContext';
import { DEVICE_TYPE_LABELS } from 'shared/types';
import DeviceIconPicker, { type DeviceIconPickerValue } from '../DeviceIconPicker';
import { libraryIconUrl } from '../../../iconLibraries/manifest';
import IconRenderer from '../../ui/IconRenderer';

import iotIcon from '../../../assets/device-icons/iot.svg?url';

// Defaults shown when no per-project type-default row exists. Keep aligned
// with DEFAULT_DEVICE_ICONS in DeviceNode.tsx so the settings preview matches
// what the diagram actually renders.
const DEFAULT_ICONS: Record<string, string> = {
  server:       libraryIconUrl('network2018', 'server'),
  workstation:  libraryIconUrl('network2018', 'pc'),
  router:       libraryIconUrl('network2018', 'router'),
  switch:       libraryIconUrl('network2018', 'switch'),
  nas:          libraryIconUrl('network2018', 'storage'),
  firewall:     libraryIconUrl('network2018', 'firewall'),
  access_point: libraryIconUrl('network2018', 'wireless_modem'),
  camera:       libraryIconUrl('network2018', 'camera'),
  phone:        libraryIconUrl('network2018', 'mobile'),
  iot:          iotIcon,
  hypervisor:   libraryIconUrl('network2018', 'mainframe'),
};

const ICON_LABELS: Record<string, string> = {
  ...DEVICE_TYPE_LABELS,
  hypervisor: 'Hypervisor',
};

const ALL_ICON_TYPES: string[] = ['access_point', 'camera', 'firewall', 'hypervisor', 'iot', 'nas', 'phone', 'router', 'server', 'switch', 'workstation'];

function rowToInitialPickerValue(row: TypeDefaultRow | undefined): DeviceIconPickerValue | null {
  if (!row) return null;
  if (row.icon_source === 'library' && row.library_id && row.library_icon_key) {
    return { icon_source: 'library', library_id: row.library_id, library_icon_key: row.library_icon_key, color: row.color };
  }
  return null; // upload-source: starts blank in the upload tab; the existing custom upload preview is shown in the cell.
}

function resolveCellSrc(projectId: number, deviceType: string, row: TypeDefaultRow | undefined): string {
  if (!row) return DEFAULT_ICONS[deviceType];
  if (row.icon_source === 'library' && row.library_id && row.library_icon_key) {
    return libraryIconUrl(row.library_id, row.library_icon_key);
  }
  return typeDefaultIconUrl(projectId, deviceType) + `?t=${Date.now()}`;
}

export default function DeviceIconsTab() {
  const { projectId } = useProject();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: typeDefaults = [] } = useQuery({
    queryKey: ['type-default-icons', projectId],
    queryFn: () => fetchTypeDefaults(projectId),
  });
  const rowByType = new Map(typeDefaults.map(t => [t.device_type, t]));

  const uploadIconMut = useMutation({
    mutationFn: ({ deviceType, payload }: { deviceType: string; payload: IconUploadPayload }) =>
      uploadTypeDefault(projectId, deviceType, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['type-default-icons', projectId] }),
    onError: (e: unknown) => toast(e instanceof Error ? e.message : 'Failed to set icon', 'error'),
  });

  const deleteIconMut = useMutation({
    mutationFn: (deviceType: string) => deleteTypeDefault(projectId, deviceType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['type-default-icons', projectId] }),
    onError: (err: Error) => toast(err.message || 'Failed to delete icon', 'error'),
  });

  // Modal state
  const [editingType, setEditingType] = useState<string | null>(null);
  const [pickerValue, setPickerValue] = useState<DeviceIconPickerValue | null>(null);

  function openPicker(deviceType: string) {
    setEditingType(deviceType);
    setPickerValue(rowToInitialPickerValue(rowByType.get(deviceType)));
  }
  function closePicker() {
    setEditingType(null);
    setPickerValue(null);
  }
  async function savePicker() {
    if (!editingType || !pickerValue) { closePicker(); return; }
    const color = pickerValue.color ?? null;
    let payload: IconUploadPayload;
    if (pickerValue.icon_source === 'library') {
      payload = {
        icon_source: 'library',
        library_id: pickerValue.library_id,
        library_icon_key: pickerValue.library_icon_key,
        color,
      };
    } else {
      payload = {
        icon_source: 'upload',
        filename: pickerValue.filename,
        mime_type: pickerValue.mime_type,
        data: pickerValue.data,
        color,
      };
    }
    await uploadIconMut.mutateAsync({ deviceType: editingType, payload });
    closePicker();
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-header-title">Default Device Icons</h3>
          <div className="card-header-subtitle">Pick an icon from the bundled libraries (drawio: Cisco, Networking) or upload your own (max 512 KB) to replace the built-in icon for each type.</div>
        </div>
      </div>
      <div className="settings-icon-grid">
        {ALL_ICON_TYPES.map(dt => {
          const row = rowByType.get(dt);
          const hasCustom = !!row;
          const src = resolveCellSrc(projectId, dt, row);
          const tint = row?.color ?? null;
          return (
            <div key={dt} className="settings-icon-card">
              <IconRenderer src={src} color={tint} size={48} alt={dt} className="settings-icon-preview" />
              <div className="settings-icon-label">{ICON_LABELS[dt] || dt}</div>
              <div className="settings-icon-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => openPicker(dt)}
                  disabled={uploadIconMut.isPending}
                >
                  Change…
                </button>
                {hasCustom && (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={async () => { if (await confirm(`Reset ${ICON_LABELS[dt] || dt} icon to default?`)) deleteIconMut.mutate(dt); }}
                    disabled={deleteIconMut.isPending}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editingType && (
        <Modal open={true} onClose={closePicker} title={`Choose icon for ${ICON_LABELS[editingType] || editingType}`}>
          <DeviceIconPicker
            value={pickerValue}
            onChange={setPickerValue}
            suggestedType={editingType}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="button" className="btn" onClick={closePicker}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={savePicker}
              disabled={!pickerValue || uploadIconMut.isPending}
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
