import { Router } from 'express';
import db from '../db/connection.js';
import { getViewId } from '../db/diagramViews.js';
import { logActivity } from '../db/activityLog.js';
import { writeBlob } from '../storage/blobStore.js';
import { sanitizeFilename } from '../validation.js';
import { publishSafe } from '../events/bus.js';
import { isValidCidr } from '../utils/cidr.js';
import { isValidLibraryIcon } from '../iconLibraries.js';
import type {
  DrawioExtraction,
  DrawioAnalyzeResult,
  DrawioAnalyzedSubnet,
  DrawioAnalyzedDevice,
  DrawioApplyAction,
  DrawioApplyResult,
  DeviceType,
} from 'shared/types';
import { SMALL_IMAGE_MAX_BYTES as MAX_IMAGE_SIZE } from '../config/limits.js';

const router = Router({ mergeParams: true });

const DEVICE_TYPES: DeviceType[] = [
  'server', 'workstation', 'router', 'switch', 'nas',
  'firewall', 'access_point', 'iot', 'camera', 'phone',
];

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

// ── Prepared statements ─────────────────────────────────────────────

const findSubnetByCidr = db.prepare(
  'SELECT id, name FROM subnets WHERE project_id = ? AND cidr = ? LIMIT 1'
);
const findSubnetByVlanName = db.prepare(
  'SELECT id, name FROM subnets WHERE project_id = ? AND vlan_id = ? AND LOWER(name) = LOWER(?) LIMIT 1'
);
const findDeviceByIp = db.prepare(`
  SELECT d.id, d.name FROM devices d
  JOIN device_ips di ON di.device_id = d.id
  WHERE d.project_id = ? AND di.ip_address = ?
  LIMIT 1
`);
const findDeviceByName = db.prepare(
  'SELECT id, name FROM devices WHERE project_id = ? AND LOWER(name) = LOWER(?) LIMIT 1'
);

const insertSubnet = db.prepare(
  'INSERT INTO subnets (name, cidr, vlan_id, project_id) VALUES (?, ?, ?, ?)'
);
const insertDevice = db.prepare(
  'INSERT INTO devices (name, type, subnet_id, project_id, status, hostname, mac_address) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const insertIp = db.prepare(
  'INSERT INTO device_ips (device_id, ip_address, label, is_primary) VALUES (?, ?, ?, ?)'
);
// Library-icon override for newly imported devices that came from a
// recognised drawio stencil. We don't touch device_icon_overrides on a
// merge action — the existing device may have an override the user picked
// deliberately, and silently replacing it would be surprising.
const insertIconOverride = db.prepare(
  `INSERT INTO device_icon_overrides
     (device_id, project_id, icon_source, library_id, library_icon_key, filename, mime_type, data, file_path)
   VALUES (?, ?, 'library', ?, ?, NULL, NULL, NULL, NULL)
   ON CONFLICT(device_id, project_id) DO UPDATE SET
     icon_source = 'library',
     library_id = excluded.library_id,
     library_icon_key = excluded.library_icon_key,
     filename = NULL, mime_type = NULL, data = NULL, file_path = NULL,
     created_at = datetime('now')`
);
const ipExists = db.prepare(
  'SELECT 1 FROM device_ips WHERE device_id = ? AND ip_address = ?'
);
const getDevice = db.prepare(
  'SELECT id, subnet_id FROM devices WHERE id = ? AND project_id = ?'
);
const updateDeviceSubnet = db.prepare(
  'UPDATE devices SET subnet_id = ? WHERE id = ?'
);

const upsertDevicePos = db.prepare(
  `INSERT INTO diagram_positions (device_id, view_id, x, y) VALUES (?, ?, ?, ?)
   ON CONFLICT(device_id, view_id) DO UPDATE SET x = excluded.x, y = excluded.y`
);
const upsertSubnetPos = db.prepare(
  `INSERT INTO subnet_diagram_positions (subnet_id, view_id, x, y, width, height) VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(subnet_id, view_id) DO UPDATE SET x = excluded.x, y = excluded.y, width = excluded.width, height = excluded.height`
);

const insertDiagramImage = db.prepare(
  `INSERT INTO diagram_images (project_id, view_id, x, y, width, height, filename, mime_type, label)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const updateDiagramImagePath = db.prepare(
  'UPDATE diagram_images SET file_path = ? WHERE id = ?'
);
const insertLibraryImage = db.prepare(
  'INSERT INTO image_library (project_id, filename, mime_type, size) VALUES (?, ?, ?, ?)'
);
const updateLibraryImagePath = db.prepare(
  'UPDATE image_library SET file_path = ? WHERE id = ?'
);

const insertConnection = db.prepare(
  `INSERT INTO connections
    (source_device_id, target_device_id, source_subnet_id, target_subnet_id,
     label, connection_type, edge_color, edge_width, project_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

// ── POST /match ─────────────────────────────────────────────────────

router.post('/match', (req, res) => {
  const projectId = res.locals.projectId as number;
  const extraction = req.body as DrawioExtraction | undefined;

  if (!extraction || typeof extraction !== 'object' || !Array.isArray(extraction.subnets) || !Array.isArray(extraction.devices)) {
    return res.status(400).json({ error: 'Invalid extraction payload' });
  }

  const matchedSubnets: DrawioAnalyzedSubnet[] = extraction.subnets.map(s => {
    let matched: DrawioAnalyzedSubnet['matchedSubnet'] = null;
    if (s.cidr) {
      const byCidr = findSubnetByCidr.get(projectId, s.cidr) as { id: number; name: string } | undefined;
      if (byCidr) matched = { id: byCidr.id, name: byCidr.name, matchType: 'cidr' };
    }
    if (!matched && s.vlan_id != null && s.name) {
      const byVlan = findSubnetByVlanName.get(projectId, s.vlan_id, s.name) as { id: number; name: string } | undefined;
      if (byVlan) matched = { id: byVlan.id, name: byVlan.name, matchType: 'vlan_name' };
    }
    return { ...s, matchedSubnet: matched };
  });

  const matchedDevices: DrawioAnalyzedDevice[] = extraction.devices.map(d => {
    let matched: DrawioAnalyzedDevice['matchedDevice'] = null;
    if (d.primary_ip) {
      const byIp = findDeviceByIp.get(projectId, d.primary_ip) as { id: number; name: string } | undefined;
      if (byIp) matched = { id: byIp.id, name: byIp.name, matchType: 'ip' };
    }
    if (!matched && d.name) {
      const byName = findDeviceByName.get(projectId, d.name) as { id: number; name: string } | undefined;
      if (byName) matched = { id: byName.id, name: byName.name, matchType: 'name' };
    }
    return { ...d, matchedDevice: matched };
  });

  const result: DrawioAnalyzeResult = {
    filename: extraction.filename || 'diagram.drawio',
    subnets: matchedSubnets,
    devices: matchedDevices,
    images: extraction.images || [],
    connections: extraction.connections || [],
  };
  res.json(result);
});

// ── POST /apply ─────────────────────────────────────────────────────

function finite(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function applyCoreActions(
  actions: DrawioApplyAction[],
  projectId: number,
  viewId: number,
): { result: DrawioApplyResult; subnetIdByCell: Map<string, number>; deviceIdByCell: Map<string, number> } {
  const result: DrawioApplyResult = {
    subnets: { created: 0, merged: 0, skipped: 0 },
    devices: { created: 0, merged: 0, skipped: 0 },
    images: { libraryAdded: 0, diagramPlaced: 0, skipped: 0 },
    connections: { created: 0, skipped: 0 },
  };

  const subnetIdByCell = new Map<string, number>();
  const subnetAbsByCell = new Map<string, { x: number; y: number }>();
  const deviceIdByCell = new Map<string, number>();

  // Phase 1: subnets
  for (const a of actions) {
    if (a.kind !== 'subnet') continue;
    if (a.action === 'skip') {
      result.subnets.skipped++;
      continue;
    }
    const x = finite(a.x);
    const y = finite(a.y);
    const w = finite(a.width, 200);
    const h = finite(a.height, 150);
    if (a.action === 'merge' && a.mergeSubnetId) {
      subnetIdByCell.set(a.cellId, a.mergeSubnetId);
      subnetAbsByCell.set(a.cellId, { x, y });
      upsertSubnetPos.run(a.mergeSubnetId, viewId, x, y, w, h);
      result.subnets.merged++;
      continue;
    }
    if (a.action === 'create') {
      const name = (a.name || '').trim() || 'Imported Subnet';
      const cidr = a.cidr && isValidCidr(a.cidr) ? a.cidr : null;
      if (!cidr) {
        result.subnets.skipped++;
        continue;
      }
      try {
        const ins = insertSubnet.run(name, cidr, a.vlan_id ?? null, projectId);
        const sid = ins.lastInsertRowid as number;
        subnetIdByCell.set(a.cellId, sid);
        subnetAbsByCell.set(a.cellId, { x, y });
        upsertSubnetPos.run(sid, viewId, x, y, w, h);
        result.subnets.created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('UNIQUE') && cidr) {
          const existing = findSubnetByCidr.get(projectId, cidr) as { id: number } | undefined;
          if (existing) {
            subnetIdByCell.set(a.cellId, existing.id);
            subnetAbsByCell.set(a.cellId, { x, y });
            upsertSubnetPos.run(existing.id, viewId, x, y, w, h);
            result.subnets.merged++;
            continue;
          }
        }
        result.subnets.skipped++;
      }
    }
  }

  // Phase 2: devices. Parser emits absolute x/y; if the parent subnet was
  // applied, we write subnet-relative coords (what React Flow expects with
  // `parentId`). If the subnet was skipped, we fall back to absolute so the
  // device lands where it actually was in draw.io.
  for (const a of actions) {
    if (a.kind !== 'device') continue;
    if (a.action === 'skip') {
      result.devices.skipped++;
      continue;
    }
    const parentSubnetId = a.subnetCellId ? subnetIdByCell.get(a.subnetCellId) ?? null : null;
    const parentAbs = a.subnetCellId ? subnetAbsByCell.get(a.subnetCellId) : undefined;
    let x = finite(a.x);
    let y = finite(a.y);
    if (parentSubnetId != null && parentAbs) {
      x -= parentAbs.x;
      y -= parentAbs.y;
    }
    if (a.action === 'merge' && a.mergeDeviceId) {
      const existing = getDevice.get(a.mergeDeviceId, projectId) as { id: number; subnet_id: number | null } | undefined;
      if (!existing) {
        result.devices.skipped++;
        continue;
      }
      deviceIdByCell.set(a.cellId, existing.id);
      if (a.primary_ip && !ipExists.get(existing.id, a.primary_ip)) {
        insertIp.run(existing.id, a.primary_ip, null, 0);
      }
      if (parentSubnetId && !existing.subnet_id) {
        updateDeviceSubnet.run(parentSubnetId, existing.id);
      }
      upsertDevicePos.run(existing.id, viewId, x, y);
      result.devices.merged++;
      continue;
    }
    if (a.action === 'create') {
      const name = (a.name || '').trim() || 'Imported Device';
      const type = DEVICE_TYPES.includes(a.type) ? a.type : 'server';
      const hostname = (a.hostname || '').trim() || null;
      const mac = (a.mac_address || '').trim() || null;
      const ins = insertDevice.run(name, type, parentSubnetId, projectId, null, hostname, mac);
      const did = ins.lastInsertRowid as number;
      deviceIdByCell.set(a.cellId, did);
      if (a.primary_ip) {
        insertIp.run(did, a.primary_ip, null, 1);
      }
      upsertDevicePos.run(did, viewId, x, y);
      // Library icon: only when the action carries a valid (id, key) pair.
      // Validation guards against a malformed payload writing junk into
      // device_icon_overrides.
      if (a.library_id && a.library_icon_key && isValidLibraryIcon(a.library_id, a.library_icon_key)) {
        insertIconOverride.run(did, projectId, a.library_id, a.library_icon_key);
      }
      result.devices.created++;
    }
  }

  // Phase 3: connections
  for (const a of actions) {
    if (a.kind !== 'connection') continue;
    const srcDevId = deviceIdByCell.get(a.sourceCellId) ?? null;
    const srcSubId = srcDevId == null ? (subnetIdByCell.get(a.sourceCellId) ?? null) : null;
    const tgtDevId = deviceIdByCell.get(a.targetCellId) ?? null;
    const tgtSubId = tgtDevId == null ? (subnetIdByCell.get(a.targetCellId) ?? null) : null;
    if (srcDevId == null && srcSubId == null) { result.connections.skipped++; continue; }
    if (tgtDevId == null && tgtSubId == null) { result.connections.skipped++; continue; }
    insertConnection.run(
      srcDevId, tgtDevId, srcSubId, tgtSubId,
      a.label || null, a.connection_type || 'ethernet',
      a.edge_color || null, a.edge_width ?? null, projectId,
    );
    result.connections.created++;
  }

  return { result, subnetIdByCell, deviceIdByCell };
}

const runCoreApply = db.transaction(
  (actions: DrawioApplyAction[], projectId: number, viewId: number) => applyCoreActions(actions, projectId, viewId),
);

// Images are processed outside the main transaction so failed blob writes
// don't leave orphan DB rows with file_path = NULL. Each image is INSERT →
// writeBlob → UPDATE; on blob failure we DELETE the row. Matches the pattern
// in diagramIcons.ts.
function applyImageActions(
  actions: DrawioApplyAction[],
  projectId: number,
  viewId: number,
  result: DrawioApplyResult,
): void {
  for (const a of actions) {
    if (a.kind !== 'image') continue;
    if (a.action === 'skip') {
      result.images.skipped++;
      continue;
    }
    if (!ALLOWED_IMAGE_MIMES.includes(a.mime_type)) {
      result.images.skipped++;
      continue;
    }
    if (!a.addToLibrary && !a.placeOnDiagram) {
      result.images.skipped++;
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(a.data, 'base64');
    } catch {
      result.images.skipped++;
      continue;
    }
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_SIZE) {
      result.images.skipped++;
      continue;
    }
    const safeName = sanitizeFilename(a.filename || 'image.png');

    if (a.addToLibrary) {
      const libIns = insertLibraryImage.run(projectId, safeName, a.mime_type, bytes.length);
      const libId = Number(libIns.lastInsertRowid);
      try {
        const rel = writeBlob(projectId, 'image_library', libId, a.mime_type, bytes);
        updateLibraryImagePath.run(rel, libId);
        result.images.libraryAdded++;
      } catch (err) {
        db.prepare('DELETE FROM image_library WHERE id = ?').run(libId);
        console.error('draw.io image_library blob write failed:', err);
        result.images.skipped++;
      }
    }
    if (a.placeOnDiagram) {
      const w = Math.min(Math.max(finite(a.width, 128), 10), 2000);
      const h = Math.min(Math.max(finite(a.height, 128), 10), 2000);
      const imgIns = insertDiagramImage.run(
        projectId, viewId, finite(a.x), finite(a.y), w, h, safeName, a.mime_type, a.label || null,
      );
      const imgId = Number(imgIns.lastInsertRowid);
      try {
        const rel = writeBlob(projectId, 'diagram_images', imgId, a.mime_type, bytes);
        updateDiagramImagePath.run(rel, imgId);
        result.images.diagramPlaced++;
      } catch (err) {
        db.prepare('DELETE FROM diagram_images WHERE id = ?').run(imgId);
        console.error('draw.io diagram_images blob write failed:', err);
        result.images.skipped++;
      }
    }
  }
}

router.post('/apply', (req, res) => {
  const projectId = res.locals.projectId as number;
  const { actions, view_id } = req.body as { actions?: DrawioApplyAction[]; view_id?: string | number };

  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({ error: 'actions array is required' });
  }

  try {
    const viewId = getViewId(projectId, view_id);
    const { result } = runCoreApply(actions, projectId, viewId);
    applyImageActions(actions, projectId, viewId, result);

    logActivity({
      projectId,
      action: 'imported_drawio',
      resourceType: 'drawio',
      details: result as unknown as Record<string, unknown>,
    });

    publishSafe(projectId, 'diagram', 'updated');
    res.json(result);
  } catch (e) {
    console.error('draw.io apply error:', e);
    res.status(500).json({ error: 'Failed to apply draw.io import' });
  }
});

export default router;
