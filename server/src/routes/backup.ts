import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { readBlob, writeBlob, deleteBlob, type BlobTable } from '../storage/blobStore.js';

const router = Router({ mergeParams: true });

/** Build parameterized IN clause: returns { ph: '?,?,?', params: [1,2,3] } */
function inParams(ids: number[]) {
  return { ph: ids.map(() => '?').join(','), params: ids };
}

type BlobBackupRow = {
  id: number;
  project_id: number | null;
  mime_type: string | null;
  file_path: string | null;
  data: string | null;
  [key: string]: unknown;
};

// For export: if row was migrated to disk (file_path set, data null), read from disk and
// inline base64 as `data` so the JSON backup format remains unchanged.
function hydrateBlobRows<T extends BlobBackupRow>(rows: T[]): T[] {
  return rows.map(row => {
    if (row.data || !row.file_path) return row;
    try {
      const buf = readBlob(row.file_path);
      return { ...row, data: buf.toString('base64') };
    } catch (err) {
      console.warn(`[backup] failed to read blob ${row.file_path}:`, err);
      return row;
    }
  });
}

// For import: queue a blob-disk write to run AFTER the SQL transaction commits.
// If we wrote files mid-transaction and a later SQL statement threw, the rows
// would roll back but files would already exist on disk as orphans.
interface PendingBlobWrite {
  table: BlobTable;
  id: number;
  projectId: number | null;
  mimeType: string | null;
  base64: string;
}
function queueBlobWrite(
  queue: PendingBlobWrite[],
  table: BlobTable,
  id: number,
  projectId: number | null,
  mimeType: string | null,
  base64: string | null | undefined,
): void {
  if (!base64) return;
  queue.push({ table, id, projectId, mimeType, base64 });
}

// After the SQL transaction commits, actually write the queued blobs to disk
// and update each row's file_path. A per-row write failure is logged but does
// not abort — the row keeps its `data` column so reads still work.
function flushBlobWrites(writes: PendingBlobWrite[]): void {
  for (const w of writes) {
    try {
      const buf = Buffer.from(w.base64, 'base64');
      const relPath = writeBlob(w.projectId, w.table, w.id, w.mimeType, buf);
      db.prepare(`UPDATE ${w.table} SET file_path = ?, data = NULL WHERE id = ?`).run(relPath, w.id);
    } catch (err) {
      console.warn(`[backup] failed to persist ${w.table}#${w.id} blob to disk:`, err);
    }
  }
}

type BackupRow = Record<string, unknown>;

interface InsertRowsOpts {
  // Untyped because data comes from JSON; helper coerces to BackupRow[] internally.
  rows: unknown;
  table: string;
  // Comma-separated column list, NOT including `id`. Both stmts are derived from this.
  cols: string;
  isScoped: boolean;
  // Build the value array matching `cols` (exclude id). Return null to skip the row
  // (e.g. an FK that couldn't be remapped). Remap helpers like remapDevice already
  // pass the original id through unchanged in full mode, so the same `values` body
  // works for both scoped and full inserts.
  values: (row: BackupRow) => unknown[] | null;
  // Called once per inserted row with the row's PK (auto-assigned in scoped mode,
  // original `row.id` in full mode). Use to populate id-remap maps or queue blob writes.
  onInserted?: (row: BackupRow, newId: number) => void;
}

// Collapse the scoped-vs-full INSERT duplication. In scoped mode the row's
// original id is dropped (SQLite assigns a fresh one to avoid collisions with
// other projects already in the DB); in full mode the id is preserved (the DB
// is wiped first, so cross-table FK references stay valid without remap maps).
function insertRows(opts: InsertRowsOpts): void {
  const rows = Array.isArray(opts.rows) ? (opts.rows as BackupRow[]) : null;
  if (!rows || rows.length === 0) return;
  const placeholderCount = opts.cols.split(',').length;
  const placeholders = Array(placeholderCount).fill('?').join(', ');
  const stmtScoped = db.prepare(`INSERT INTO ${opts.table} (${opts.cols}) VALUES (${placeholders})`);
  const stmtFull = db.prepare(`INSERT INTO ${opts.table} (id, ${opts.cols}) VALUES (?, ${placeholders})`);
  for (const row of rows) {
    const v = opts.values(row);
    if (v == null) continue;
    let newId: number;
    if (opts.isScoped) {
      const info = stmtScoped.run(...(v as unknown[]));
      newId = Number(info.lastInsertRowid);
    } else {
      stmtFull.run(row.id as number, ...(v as unknown[]));
      newId = Number(row.id);
    }
    opts.onInserted?.(row, newId);
  }
}

router.get('/export', (_req, res) => {
  const includeCommandOutputs = _req.query.includeCommandOutputs !== 'false';
  const includeCredentials = _req.query.includeCredentials !== 'false';
  const includeImages = _req.query.includeImages !== 'false';
  const projectId = res.locals.projectId as number | undefined;

  let data: Record<string, unknown[]>;

  if (projectId) {
    // Project-scoped export
    const deviceIds = (db.prepare('SELECT id FROM devices WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);
    const subnetIds = (db.prepare('SELECT id FROM subnets WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);

    data = {
      subnets: db.prepare('SELECT * FROM subnets WHERE project_id = ?').all(projectId),
      devices: db.prepare('SELECT * FROM devices WHERE project_id = ?').all(projectId),
      device_ips: deviceIds.length ? db.prepare(`SELECT * FROM device_ips WHERE device_id IN (${inParams(deviceIds).ph})`).all(...deviceIds) : [],
      device_tags: deviceIds.length ? db.prepare(`SELECT * FROM device_tags WHERE device_id IN (${inParams(deviceIds).ph})`).all(...deviceIds) : [],
      device_subnets: deviceIds.length ? db.prepare(`SELECT * FROM device_subnets WHERE device_id IN (${inParams(deviceIds).ph})`).all(...deviceIds) : [],
      connections: db.prepare('SELECT * FROM connections WHERE project_id = ?').all(projectId),
      diagram_views: db.prepare('SELECT * FROM diagram_views WHERE project_id = ?').all(projectId),
      diagram_positions: deviceIds.length ? db.prepare(`SELECT * FROM diagram_positions WHERE device_id IN (${inParams(deviceIds).ph})`).all(...deviceIds) : [],
      subnet_diagram_positions: subnetIds.length ? db.prepare(`SELECT * FROM subnet_diagram_positions WHERE subnet_id IN (${inParams(subnetIds).ph})`).all(...subnetIds) : [],
      highlight_rules: db.prepare('SELECT * FROM highlight_rules WHERE project_id = ?').all(projectId),
      command_outputs: includeCommandOutputs ? db.prepare('SELECT * FROM command_outputs WHERE project_id = ?').all(projectId) : [],
      parsed_processes: [],
      parsed_connections: [],
      parsed_logins: [],
      parsed_interfaces: [],
      parsed_mounts: [],
      parsed_routes: [],
      parsed_services: [],
      router_configs: includeCommandOutputs ? db.prepare('SELECT * FROM router_configs WHERE project_id = ?').all(projectId) : [],
      parsed_router_interfaces: [],
      parsed_router_vlans: [],
      parsed_router_static_routes: [],
      parsed_router_acls: [],
      parsed_router_nat_rules: [],
      parsed_router_dhcp_pools: [],
      parsed_router_users: [],
      credentials: includeCredentials ? db.prepare('SELECT * FROM credentials WHERE project_id = ?').all(projectId) : [],
      credential_password_history: includeCredentials ? db.prepare('SELECT * FROM credential_password_history WHERE project_id = ?').all(projectId) : [],
      device_type_icons: includeImages ? hydrateBlobRows(db.prepare('SELECT * FROM device_type_icons WHERE project_id = ?').all(projectId) as BlobBackupRow[]) : [],
      device_icon_overrides: includeImages && deviceIds.length ? hydrateBlobRows(db.prepare(`SELECT * FROM device_icon_overrides WHERE device_id IN (${inParams(deviceIds).ph})`).all(...deviceIds) as BlobBackupRow[]) : [],
      diagram_images: includeImages ? hydrateBlobRows(db.prepare('SELECT * FROM diagram_images WHERE project_id = ?').all(projectId) as BlobBackupRow[]) : [],
      agent_types: hydrateBlobRows(db.prepare('SELECT * FROM agent_types WHERE project_id = ?').all(projectId) as BlobBackupRow[]),
    };

    if (includeCommandOutputs) {
      const outputIds = (data.command_outputs as { id: number }[]).map(o => o.id);
      if (outputIds.length) {
        const { ph } = inParams(outputIds);
        data.parsed_processes = db.prepare(`SELECT * FROM parsed_processes WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_connections = db.prepare(`SELECT * FROM parsed_connections WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_logins = db.prepare(`SELECT * FROM parsed_logins WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_interfaces = db.prepare(`SELECT * FROM parsed_interfaces WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_mounts = db.prepare(`SELECT * FROM parsed_mounts WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_routes = db.prepare(`SELECT * FROM parsed_routes WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_services = db.prepare(`SELECT * FROM parsed_services WHERE output_id IN (${ph})`).all(...outputIds);
      }
      const configIds = (data.router_configs as { id: number }[]).map(c => c.id);
      if (configIds.length) {
        const { ph } = inParams(configIds);
        data.parsed_router_interfaces = db.prepare(`SELECT * FROM parsed_router_interfaces WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_vlans = db.prepare(`SELECT * FROM parsed_router_vlans WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_static_routes = db.prepare(`SELECT * FROM parsed_router_static_routes WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_acls = db.prepare(`SELECT * FROM parsed_router_acls WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_nat_rules = db.prepare(`SELECT * FROM parsed_router_nat_rules WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_dhcp_pools = db.prepare(`SELECT * FROM parsed_router_dhcp_pools WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_users = db.prepare(`SELECT * FROM parsed_router_users WHERE config_id IN (${ph})`).all(...configIds);
      }
    }
  } else {
    // Full-site export
    data = {
      projects: db.prepare('SELECT * FROM projects').all(),
      subnets: db.prepare('SELECT * FROM subnets').all(),
      devices: db.prepare('SELECT * FROM devices').all(),
      device_ips: db.prepare('SELECT * FROM device_ips').all(),
      device_tags: db.prepare('SELECT * FROM device_tags').all(),
      device_subnets: db.prepare('SELECT * FROM device_subnets').all(),
      connections: db.prepare('SELECT * FROM connections').all(),
      diagram_views: db.prepare('SELECT * FROM diagram_views').all(),
      diagram_positions: db.prepare('SELECT * FROM diagram_positions').all(),
      subnet_diagram_positions: db.prepare('SELECT * FROM subnet_diagram_positions').all(),
      highlight_rules: db.prepare('SELECT * FROM highlight_rules').all(),
      command_outputs: includeCommandOutputs ? db.prepare('SELECT * FROM command_outputs').all() : [],
      parsed_processes: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_processes').all() : [],
      parsed_connections: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_connections').all() : [],
      parsed_logins: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_logins').all() : [],
      parsed_interfaces: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_interfaces').all() : [],
      parsed_mounts: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_mounts').all() : [],
      parsed_routes: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_routes').all() : [],
      parsed_services: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_services').all() : [],
      router_configs: includeCommandOutputs ? db.prepare('SELECT * FROM router_configs').all() : [],
      parsed_router_interfaces: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_interfaces').all() : [],
      parsed_router_vlans: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_vlans').all() : [],
      parsed_router_static_routes: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_static_routes').all() : [],
      parsed_router_acls: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_acls').all() : [],
      parsed_router_nat_rules: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_nat_rules').all() : [],
      parsed_router_dhcp_pools: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_dhcp_pools').all() : [],
      parsed_router_users: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_users').all() : [],
      credentials: includeCredentials ? db.prepare('SELECT * FROM credentials').all() : [],
      credential_password_history: includeCredentials ? db.prepare('SELECT * FROM credential_password_history').all() : [],
      device_type_icons: includeImages ? hydrateBlobRows(db.prepare('SELECT * FROM device_type_icons').all() as BlobBackupRow[]) : [],
      device_icon_overrides: includeImages ? hydrateBlobRows(db.prepare('SELECT * FROM device_icon_overrides').all() as BlobBackupRow[]) : [],
      diagram_images: includeImages ? hydrateBlobRows(db.prepare('SELECT * FROM diagram_images').all() as BlobBackupRow[]) : [],
      agent_types: hydrateBlobRows(db.prepare('SELECT * FROM agent_types').all() as BlobBackupRow[]),
    };
  }

  const filename = `network-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  logActivity({ projectId: projectId ?? null, action: 'exported', resourceType: 'backup', details: { scope: projectId ? 'project' : 'full-site', includeCommandOutputs, includeCredentials, includeImages } });

  // Stream JSON to avoid holding entire export in memory
  const meta = JSON.stringify({
    version: projectId ? 2 : 3,
    scope: projectId ? 'project' : 'full',
    exportedAt: new Date().toISOString(),
    includesCommandOutputs: includeCommandOutputs,
    includesCredentials: includeCredentials,
    includesImages: includeImages,
  });
  // Write opening: merge meta fields + "data":{...tables...}}
  const metaObj = meta.slice(0, -1); // remove trailing }
  res.write(`${metaObj},"data":`);
  res.write(JSON.stringify(data));
  res.write('}');
  res.end();
  // Allow data to be GC'd
  data = {} as typeof data;
});

router.post('/import', (req, res) => {
  const backup = req.body;
  const projectId = res.locals.projectId as number | undefined;

  if (!backup || !backup.data) {
    res.status(400).json({ error: 'Invalid backup file format' });
    return;
  }

  if (![1, 2, 3, 4, 5].includes(backup.version)) {
    res.status(400).json({ error: 'Unsupported backup version' });
    return;
  }

  const { data } = backup;

  // Validate backup structure: ensure arrays are arrays and truncate oversized strings
  const arrayKeys = ['subnets', 'devices', 'device_ips', 'device_tags', 'device_subnets', 'connections',
    'diagram_views', 'diagram_positions', 'subnet_diagram_positions', 'highlight_rules', 'command_outputs',
    'parsed_processes', 'parsed_connections', 'parsed_logins', 'parsed_interfaces',
    'parsed_mounts', 'parsed_routes', 'parsed_services', 'credentials', 'credential_password_history', 'projects',
    'device_type_icons', 'device_icon_overrides', 'diagram_images', 'agent_types',
    'router_configs', 'parsed_router_interfaces', 'parsed_router_vlans',
    'parsed_router_static_routes', 'parsed_router_acls', 'parsed_router_nat_rules',
    'parsed_router_dhcp_pools', 'parsed_router_users'];
  for (const key of arrayKeys) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      res.status(400).json({ error: `data.${key} must be an array` });
      return;
    }
  }

  // Sanitize all string values in imported data: truncate to 10000 chars max
  const MAX_STR = 10000;
  const truncatedFields: string[] = [];
  function sanitizeRow(row: Record<string, unknown> | null | undefined, tableName: string) {
    if (!row || typeof row !== 'object') return row;
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string' && v.length > MAX_STR) {
        row[k] = v.slice(0, MAX_STR);
        const label = `${tableName}.${k}` + (row.id ? ` (id=${row.id})` : '');
        if (truncatedFields.length < 50) truncatedFields.push(label);
      }
    }
    return row;
  }
  for (const key of arrayKeys) {
    if (Array.isArray(data[key])) {
      data[key] = data[key].map((row: Record<string, unknown>) => sanitizeRow(row, key));
    }
  }

  // Collect filesystem side-effects here and apply them ONLY after the SQL
  // transaction commits, so a mid-transaction rollback can't leave orphan
  // files on disk or delete files whose rows roll back.
  const blobPathsToDelete: string[] = [];
  const blobWrites: PendingBlobWrite[] = [];

  try {
    db.transaction(() => {
      if (projectId) {
        // Project-scoped import: delete only this project's data
        const deviceIds = (db.prepare('SELECT id FROM devices WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);
        const subnetIds = (db.prepare('SELECT id FROM subnets WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);
        const outputIds = (db.prepare('SELECT id FROM command_outputs WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);

        if (outputIds.length) {
          const { ph } = inParams(outputIds);
          db.prepare(`DELETE FROM parsed_processes WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_connections WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_logins WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_interfaces WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_mounts WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_routes WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_services WHERE output_id IN (${ph})`).run(...outputIds);
        }
        db.prepare('DELETE FROM command_outputs WHERE project_id = ?').run(projectId);
        // Router configs cascade to parsed_router_* tables
        db.prepare('DELETE FROM router_configs WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM credentials WHERE project_id = ?').run(projectId);
        if (deviceIds.length) {
          const { ph } = inParams(deviceIds);
          db.prepare(`DELETE FROM diagram_positions WHERE device_id IN (${ph})`).run(...deviceIds);
          db.prepare(`DELETE FROM device_subnets WHERE device_id IN (${ph})`).run(...deviceIds);
          db.prepare(`DELETE FROM device_tags WHERE device_id IN (${ph})`).run(...deviceIds);
          db.prepare(`DELETE FROM device_ips WHERE device_id IN (${ph})`).run(...deviceIds);
        }
        if (subnetIds.length) {
          const { ph } = inParams(subnetIds);
          db.prepare(`DELETE FROM subnet_diagram_positions WHERE subnet_id IN (${ph})`).run(...subnetIds);
        }
        db.prepare('DELETE FROM diagram_views WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM connections WHERE project_id = ?').run(projectId);
        // Collect blob file paths before deletion so we can unlink from disk after SQL commits
        for (const tbl of ['device_type_icons', 'device_icon_overrides', 'diagram_images', 'agent_types'] as const) {
          const col = tbl === 'device_icon_overrides' ? 'device_id' : 'project_id';
          const ids = tbl === 'device_icon_overrides' ? deviceIds : [projectId];
          if (ids.length === 0) continue;
          const { ph } = inParams(ids as number[]);
          const rows = db.prepare(`SELECT file_path FROM ${tbl} WHERE ${col} IN (${ph})`).all(...(ids as number[])) as { file_path: string | null }[];
          for (const r of rows) if (r.file_path) blobPathsToDelete.push(r.file_path);
        }
        db.prepare('DELETE FROM device_type_icons WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM device_icon_overrides WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM diagram_images WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM agent_types WHERE project_id = ?').run(projectId);
        db.prepare('UPDATE devices SET hypervisor_id = NULL WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM devices WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM subnets WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM highlight_rules WHERE project_id = ?').run(projectId);
      } else {
        // Full-site import: delete everything
        db.prepare('UPDATE devices SET hypervisor_id = NULL').run();
        db.prepare('DELETE FROM parsed_processes').run();
        db.prepare('DELETE FROM parsed_connections').run();
        db.prepare('DELETE FROM parsed_logins').run();
        db.prepare('DELETE FROM parsed_interfaces').run();
        db.prepare('DELETE FROM parsed_mounts').run();
        db.prepare('DELETE FROM parsed_routes').run();
        db.prepare('DELETE FROM parsed_services').run();
        db.prepare('DELETE FROM command_outputs').run();
        // Router configs cascade to parsed_router_* tables
        db.prepare('DELETE FROM parsed_router_interfaces').run();
        db.prepare('DELETE FROM parsed_router_vlans').run();
        db.prepare('DELETE FROM parsed_router_static_routes').run();
        db.prepare('DELETE FROM parsed_router_acls').run();
        db.prepare('DELETE FROM parsed_router_nat_rules').run();
        db.prepare('DELETE FROM parsed_router_dhcp_pools').run();
        db.prepare('DELETE FROM parsed_router_users').run();
        db.prepare('DELETE FROM router_configs').run();
        db.prepare('DELETE FROM credentials').run();
        db.prepare('DELETE FROM diagram_positions').run();
        db.prepare('DELETE FROM subnet_diagram_positions').run();
        db.prepare('DELETE FROM connections').run();
        db.prepare('DELETE FROM device_subnets').run();
        db.prepare('DELETE FROM device_tags').run();
        db.prepare('DELETE FROM device_ips').run();
        db.prepare('DELETE FROM devices').run();
        db.prepare('DELETE FROM subnets').run();
        db.prepare('DELETE FROM highlight_rules').run();
        // Collect blob file paths before deletion so we can unlink from disk after SQL commits
        for (const tbl of ['device_type_icons', 'device_icon_overrides', 'diagram_images', 'agent_types', 'image_library', 'device_images', 'device_attachments']) {
          const rows = db.prepare(`SELECT file_path FROM ${tbl}`).all() as { file_path: string | null }[];
          for (const r of rows) if (r.file_path) blobPathsToDelete.push(r.file_path);
        }
        db.prepare('DELETE FROM device_type_icons').run();
        db.prepare('DELETE FROM device_icon_overrides').run();
        db.prepare('DELETE FROM diagram_images').run();
        db.prepare('DELETE FROM agent_types').run();
        db.prepare('DELETE FROM projects').run();
      }

      const targetProjectId = projectId ?? 1;
      // Project-scoped restore must tolerate id collisions with other projects already in the DB.
      // Auto-assign PKs in this mode and remap every cross-table FK via these maps.
      // Full-site mode wipes the DB first, so preserved ids are safe and we skip the maps.
      const isScoped = projectId != null;
      const subnetIdMap = new Map<number, number>();
      const deviceIdMap = new Map<number, number>();
      const outputIdMap = new Map<number, number>();
      const configIdMap = new Map<number, number>();
      const credentialIdMap = new Map<number, number>();
      const remapDevice = (id: number | null | undefined): number | null =>
        id == null ? null : (isScoped ? (deviceIdMap.get(id) ?? null) : id);
      const remapSubnet = (id: number | null | undefined): number | null =>
        id == null ? null : (isScoped ? (subnetIdMap.get(id) ?? null) : id);
      const remapOutput = (id: number | null | undefined): number | null =>
        id == null ? null : (isScoped ? (outputIdMap.get(id) ?? null) : id);
      const remapConfig = (id: number | null | undefined): number | null =>
        id == null ? null : (isScoped ? (configIdMap.get(id) ?? null) : id);
      const remapCredential = (id: number | null | undefined): number | null =>
        id == null ? null : (isScoped ? (credentialIdMap.get(id) ?? null) : id);

      if (!projectId && data.projects?.length) {
        const stmt = db.prepare('INSERT INTO projects (id, name, slug, description, created_at, updated_at, about_title, short_name, image_mime_type, image_file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.projects) {
          stmt.run(row.id, row.name, row.slug, row.description ?? null, row.created_at, row.updated_at, row.about_title ?? null, row.short_name ?? '', row.image_mime_type ?? null, row.image_file_path ?? null);
        }
      } else if (!projectId) {
        db.prepare("INSERT INTO projects (id, name, slug, description) VALUES (1, 'Default', 'default', 'Default project')").run();
      }

      insertRows({
        rows: data.subnets, table: 'subnets', isScoped,
        cols: 'name, cidr, vlan_id, description, project_id, created_at, updated_at',
        values: r => {
          const pid = projectId ?? r.project_id ?? targetProjectId;
          return [r.name, r.cidr, r.vlan_id ?? null, r.description ?? null, pid, r.created_at, r.updated_at];
        },
        onInserted: (r, newId) => { if (isScoped) subnetIdMap.set(r.id as number, newId); },
      });

      // devices: insert with hypervisor_id=NULL first so self-referential FKs
      // aren't violated by backup ordering, then resolve hypervisor_id in a
      // second pass once every row exists.
      const pendingHyps: Array<[number, number]> = [];
      insertRows({
        rows: data.devices, table: 'devices', isScoped,
        cols: 'name, type, mac_address, os, location, notes, subnet_id, hosting_type, project_id, created_at, updated_at, section_config, rich_notes, av, status, hostname, domain',
        values: r => {
          const pid = projectId ?? r.project_id ?? targetProjectId;
          const mappedSubnet = remapSubnet(r.subnet_id as number);
          return [r.name, r.type, r.mac_address ?? null, r.os ?? null, r.location ?? null, r.notes ?? null, mappedSubnet, r.hosting_type ?? null, pid, r.created_at, r.updated_at, r.section_config ?? null, r.rich_notes ?? null, r.av ?? null, r.status ?? null, r.hostname ?? null, r.domain ?? null];
        },
        onInserted: (r, newId) => {
          if (isScoped) deviceIdMap.set(r.id as number, newId);
          if (r.hypervisor_id) pendingHyps.push([r.hypervisor_id as number, newId]);
        },
      });
      if (pendingHyps.length) {
        const updateHyp = db.prepare('UPDATE devices SET hypervisor_id = ? WHERE id = ?');
        for (const [oldHid, newDid] of pendingHyps) {
          const newHid = isScoped ? deviceIdMap.get(oldHid) : oldHid;
          if (newHid != null) updateHyp.run(newHid, newDid);
        }
      }

      insertRows({
        rows: data.device_ips, table: 'device_ips', isScoped,
        cols: 'device_id, ip_address, label, is_primary, dhcp',
        values: r => {
          const did = remapDevice(r.device_id as number);
          if (did == null) return null;
          return [did, r.ip_address, r.label ?? null, r.is_primary ?? 0, r.dhcp ?? 0];
        },
      });

      insertRows({
        rows: data.device_tags, table: 'device_tags', isScoped,
        cols: 'device_id, tag, created_at',
        values: r => {
          const did = remapDevice(r.device_id as number);
          if (did == null) return null;
          return [did, r.tag, r.created_at];
        },
      });

      if (data.device_subnets?.length) {
        const stmt = db.prepare('INSERT OR IGNORE INTO device_subnets (device_id, subnet_id) VALUES (?, ?)');
        for (const row of data.device_subnets) {
          const did = remapDevice(row.device_id);
          const sid = remapSubnet(row.subnet_id);
          if (did == null || sid == null) continue;
          stmt.run(did, sid);
        }
      }

      insertRows({
        rows: data.connections, table: 'connections', isScoped,
        cols: 'source_device_id, target_device_id, label, connection_type, edge_type, project_id, created_at, updated_at, source_handle, target_handle, edge_color, edge_width, label_color, label_bg_color, source_port, target_port, source_subnet_id, target_subnet_id',
        values: r => {
          // Skip if any FK refers to a row we didn't import. remapDevice/Subnet
          // pass through unchanged in full mode, so this also no-ops there.
          if (r.source_device_id && remapDevice(r.source_device_id as number) == null) return null;
          if (r.target_device_id && remapDevice(r.target_device_id as number) == null) return null;
          if (r.source_subnet_id && remapSubnet(r.source_subnet_id as number) == null) return null;
          if (r.target_subnet_id && remapSubnet(r.target_subnet_id as number) == null) return null;
          const pid = projectId ?? r.project_id ?? targetProjectId;
          const sDev = r.source_device_id != null ? remapDevice(r.source_device_id as number) : null;
          const tDev = r.target_device_id != null ? remapDevice(r.target_device_id as number) : null;
          const sSubnet = r.source_subnet_id != null ? remapSubnet(r.source_subnet_id as number) : null;
          const tSubnet = r.target_subnet_id != null ? remapSubnet(r.target_subnet_id as number) : null;
          return [sDev, tDev, r.label ?? null, r.connection_type ?? null, r.edge_type ?? 'default', pid, r.created_at, r.updated_at ?? '1970-01-01 00:00:00', r.source_handle ?? null, r.target_handle ?? null, r.edge_color ?? null, r.edge_width ?? null, r.label_color ?? null, r.label_bg_color ?? null, r.source_port ?? null, r.target_port ?? null, sSubnet, tSubnet];
        },
      });

      // Maps old backup view_id -> new database view_id (populated by the diagram_views insert block below)
      const viewIdMap = new Map<number, number>();
      // Per-project default view cache, lazily populated for old backups that predate diagram_views
      const defaultViewByProject = new Map<number, number>();
      const selectDefaultViewStmt = db.prepare(
        'SELECT id FROM diagram_views WHERE project_id = ? AND is_default = 1 LIMIT 1'
      );
      const insertDefaultViewStmt = db.prepare(
        "INSERT INTO diagram_views (project_id, name, is_default) VALUES (?, 'Default', 1)"
      );
      const ensureDefaultView = (pid: number): number => {
        const cached = defaultViewByProject.get(pid);
        if (cached != null) return cached;
        const existing = selectDefaultViewStmt.get(pid) as { id: number } | undefined;
        if (existing) { defaultViewByProject.set(pid, existing.id); return existing.id; }
        const info = insertDefaultViewStmt.run(pid);
        const id = info.lastInsertRowid as number;
        defaultViewByProject.set(pid, id);
        return id;
      };

      if (data.diagram_views?.length) {
        const stmt = db.prepare(
          "INSERT INTO diagram_views (project_id, name, is_default, created_at) VALUES (?, ?, ?, ?)"
        );
        for (const row of data.diagram_views) {
          const pid = projectId ?? row.project_id ?? targetProjectId;
          const info = stmt.run(
            pid,
            row.name ?? 'Default',
            row.is_default ? 1 : 0,
            row.created_at ?? new Date().toISOString(),
          );
          const newId = info.lastInsertRowid as number;
          viewIdMap.set(row.id, newId);
          if (row.is_default) defaultViewByProject.set(pid, newId);
        }
      }

      if (data.diagram_positions?.length) {
        const deviceProjectMap = new Map<number, number>();
        for (const d of db.prepare('SELECT id, project_id FROM devices').all() as { id: number; project_id: number }[]) {
          deviceProjectMap.set(d.id, d.project_id);
        }
        const stmt = db.prepare(
          'INSERT OR IGNORE INTO diagram_positions (device_id, view_id, x, y) VALUES (?, ?, ?, ?)'
        );
        for (const row of data.diagram_positions) {
          const did = remapDevice(row.device_id);
          if (did == null) continue;
          const pid = deviceProjectMap.get(did);
          if (pid == null) continue;
          let viewId: number | undefined = row.view_id != null ? viewIdMap.get(row.view_id) : undefined;
          if (viewId == null) viewId = ensureDefaultView(pid);
          stmt.run(did, viewId, row.x, row.y);
        }
      }

      if (data.subnet_diagram_positions?.length) {
        const subnetProjectMap = new Map<number, number>();
        for (const s of db.prepare('SELECT id, project_id FROM subnets').all() as { id: number; project_id: number }[]) {
          subnetProjectMap.set(s.id, s.project_id);
        }
        const stmt = db.prepare(
          'INSERT OR IGNORE INTO subnet_diagram_positions (subnet_id, view_id, x, y, width, height) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const row of data.subnet_diagram_positions) {
          const sid = remapSubnet(row.subnet_id);
          if (sid == null) continue;
          const pid = subnetProjectMap.get(sid);
          if (pid == null) continue;
          let viewId: number | undefined = row.view_id != null ? viewIdMap.get(row.view_id) : undefined;
          if (viewId == null) viewId = ensureDefaultView(pid);
          stmt.run(sid, viewId, row.x, row.y, row.width, row.height);
        }
      }

      insertRows({
        rows: data.command_outputs, table: 'command_outputs', isScoped,
        cols: 'device_id, command_type, raw_output, project_id, captured_at, title, parse_output, updated_at',
        values: r => {
          const did = remapDevice(r.device_id as number);
          if (did == null) return null;
          const pid = projectId ?? r.project_id ?? targetProjectId;
          return [did, r.command_type, r.raw_output, pid, r.captured_at, r.title ?? null, r.parse_output ?? 1, r.updated_at ?? '1970-01-01 00:00:00'];
        },
        onInserted: (r, newId) => { if (isScoped) outputIdMap.set(r.id as number, newId); },
      });

      insertRows({
        rows: data.parsed_processes, table: 'parsed_processes', isScoped,
        cols: 'output_id, pid, user, cpu_percent, mem_percent, command',
        values: r => {
          const oid = remapOutput(r.output_id as number);
          if (oid == null) return null;
          return [oid, r.pid, r.user, r.cpu_percent, r.mem_percent, r.command];
        },
      });

      insertRows({
        rows: data.parsed_connections, table: 'parsed_connections', isScoped,
        cols: 'output_id, protocol, local_addr, foreign_addr, state, pid_program',
        values: r => {
          const oid = remapOutput(r.output_id as number);
          if (oid == null) return null;
          return [oid, r.protocol, r.local_addr, r.foreign_addr, r.state ?? null, r.pid_program ?? null];
        },
      });

      insertRows({
        rows: data.parsed_logins, table: 'parsed_logins', isScoped,
        cols: 'output_id, user, terminal, source_ip, login_time, duration',
        values: r => {
          const oid = remapOutput(r.output_id as number);
          if (oid == null) return null;
          return [oid, r.user, r.terminal ?? null, r.source_ip ?? null, r.login_time, r.duration ?? null];
        },
      });

      insertRows({
        rows: data.parsed_interfaces, table: 'parsed_interfaces', isScoped,
        cols: 'output_id, interface_name, state, ip_addresses, mac_address',
        values: r => {
          const oid = remapOutput(r.output_id as number);
          if (oid == null) return null;
          return [oid, r.interface_name, r.state ?? null, r.ip_addresses, r.mac_address ?? null];
        },
      });

      insertRows({
        rows: data.parsed_mounts, table: 'parsed_mounts', isScoped,
        cols: 'output_id, device, mount_point, fs_type, options',
        values: r => {
          const oid = remapOutput(r.output_id as number);
          if (oid == null) return null;
          return [oid, r.device, r.mount_point, r.fs_type ?? null, r.options ?? null];
        },
      });

      insertRows({
        rows: data.parsed_routes, table: 'parsed_routes', isScoped,
        cols: 'output_id, destination, gateway, device, protocol, scope, metric',
        values: r => {
          const oid = remapOutput(r.output_id as number);
          if (oid == null) return null;
          return [oid, r.destination, r.gateway ?? null, r.device ?? null, r.protocol ?? null, r.scope ?? null, r.metric ?? null];
        },
      });

      insertRows({
        rows: data.parsed_services, table: 'parsed_services', isScoped,
        cols: 'output_id, unit_name, load, active, sub, description',
        values: r => {
          const oid = remapOutput(r.output_id as number);
          if (oid == null) return null;
          return [oid, r.unit_name, r.load ?? null, r.active ?? null, r.sub ?? null, r.description ?? null];
        },
      });

      insertRows({
        rows: data.router_configs, table: 'router_configs', isScoped,
        cols: 'device_id, project_id, vendor, raw_config, captured_at, title, parse_output, hostname, os_version, model, domain, timezone, ntp_servers, updated_at',
        values: r => {
          const did = remapDevice(r.device_id as number);
          if (did == null) return null;
          const pid = projectId ?? r.project_id ?? targetProjectId;
          return [did, pid, r.vendor, r.raw_config, r.captured_at, r.title ?? null, r.parse_output ?? 1, r.hostname ?? null, r.os_version ?? null, r.model ?? null, r.domain ?? null, r.timezone ?? null, r.ntp_servers ?? null, r.updated_at ?? '1970-01-01 00:00:00'];
        },
        onInserted: (r, newId) => { if (isScoped) configIdMap.set(r.id as number, newId); },
      });

      insertRows({
        rows: data.parsed_router_interfaces, table: 'parsed_router_interfaces', isScoped,
        cols: 'config_id, interface_name, description, ip_address, subnet_mask, vlan, admin_status, mac_address',
        values: r => {
          const cid = remapConfig(r.config_id as number);
          if (cid == null) return null;
          return [cid, r.interface_name, r.description ?? null, r.ip_address ?? null, r.subnet_mask ?? null, r.vlan ?? null, r.admin_status ?? null, r.mac_address ?? null];
        },
      });

      insertRows({
        rows: data.parsed_router_vlans, table: 'parsed_router_vlans', isScoped,
        cols: 'config_id, vlan_id, name',
        values: r => {
          const cid = remapConfig(r.config_id as number);
          if (cid == null) return null;
          return [cid, r.vlan_id, r.name ?? null];
        },
      });

      insertRows({
        rows: data.parsed_router_static_routes, table: 'parsed_router_static_routes', isScoped,
        cols: 'config_id, destination, mask, next_hop, metric, admin_distance',
        values: r => {
          const cid = remapConfig(r.config_id as number);
          if (cid == null) return null;
          return [cid, r.destination, r.mask ?? null, r.next_hop ?? null, r.metric ?? null, r.admin_distance ?? null];
        },
      });

      insertRows({
        rows: data.parsed_router_acls, table: 'parsed_router_acls', isScoped,
        cols: 'config_id, acl_name, sequence, action, protocol, src, src_port, dst, dst_port',
        values: r => {
          const cid = remapConfig(r.config_id as number);
          if (cid == null) return null;
          return [cid, r.acl_name, r.sequence ?? null, r.action, r.protocol ?? null, r.src ?? null, r.src_port ?? null, r.dst ?? null, r.dst_port ?? null];
        },
      });

      insertRows({
        rows: data.parsed_router_nat_rules, table: 'parsed_router_nat_rules', isScoped,
        cols: 'config_id, nat_type, protocol, inside_src, inside_port, outside_src, outside_port',
        values: r => {
          const cid = remapConfig(r.config_id as number);
          if (cid == null) return null;
          return [cid, r.nat_type, r.protocol ?? null, r.inside_src ?? null, r.inside_port ?? null, r.outside_src ?? null, r.outside_port ?? null];
        },
      });

      insertRows({
        rows: data.parsed_router_dhcp_pools, table: 'parsed_router_dhcp_pools', isScoped,
        cols: 'config_id, pool_name, network, netmask, default_router, dns_servers, lease_time, domain_name',
        values: r => {
          const cid = remapConfig(r.config_id as number);
          if (cid == null) return null;
          return [cid, r.pool_name, r.network ?? null, r.netmask ?? null, r.default_router ?? null, r.dns_servers ?? null, r.lease_time ?? null, r.domain_name ?? null];
        },
      });

      insertRows({
        rows: data.parsed_router_users, table: 'parsed_router_users', isScoped,
        cols: 'config_id, username, privilege, auth_method',
        values: r => {
          const cid = remapConfig(r.config_id as number);
          if (cid == null) return null;
          return [cid, r.username, r.privilege ?? null, r.auth_method ?? null];
        },
      });

      insertRows({
        rows: data.highlight_rules, table: 'highlight_rules', isScoped,
        cols: 'keyword, category, color, text_color, project_id, created_at, updated_at',
        values: r => {
          const pid = projectId ?? r.project_id ?? targetProjectId;
          return [r.keyword, r.category, r.color, r.text_color ?? null, pid, r.created_at, r.updated_at ?? '1970-01-01 00:00:00'];
        },
      });

      // JSON has no native binary; Buffer.toJSON() emits {type:'Buffer',data:[...]}. Convert back on import.
      const restoreBlob = (x: unknown): Buffer | null => {
        if (x == null) return null;
        if (Buffer.isBuffer(x)) return x;
        if (typeof x === 'object' && (x as { type?: string }).type === 'Buffer' && Array.isArray((x as { data?: unknown[] }).data)) {
          return Buffer.from((x as { data: number[] }).data);
        }
        return null;
      };

      insertRows({
        rows: data.credentials, table: 'credentials', isScoped,
        cols: 'device_id, host, username, password, type, source, project_id, created_at, updated_at, file_name, file_data, used, hidden',
        values: r => {
          const pid = projectId ?? r.project_id ?? targetProjectId;
          const fileData = restoreBlob(r.file_data);
          // device_id is nullable; remap when present, drop ref if unresolvable
          // (rather than skip the whole credential).
          const did = r.device_id != null ? remapDevice(r.device_id as number) : null;
          return [did, r.host ?? null, r.username, r.password ?? null, r.type ?? null, r.source ?? null, pid, r.created_at, r.updated_at, r.file_name ?? null, fileData, r.used ?? 0, r.hidden ?? 0];
        },
        onInserted: (r, newId) => { if (isScoped) credentialIdMap.set(r.id as number, newId); },
      });

      insertRows({
        rows: data.credential_password_history, table: 'credential_password_history', isScoped,
        cols: 'credential_id, project_id, password, file_name, file_data, status, note, created_at',
        values: r => {
          const cid = remapCredential(r.credential_id as number);
          // Drop history rows whose credential didn't make it across (e.g.
          // backup contained orphaned history); the credential's absence is
          // the surviving truth.
          if (cid == null) return null;
          const pid = projectId ?? r.project_id ?? targetProjectId;
          const fileData = restoreBlob(r.file_data);
          return [cid, pid, r.password ?? null, r.file_name ?? null, fileData, r.status ?? 'previous', r.note ?? null, r.created_at];
        },
      });

      insertRows({
        rows: data.device_type_icons, table: 'device_type_icons', isScoped,
        cols: 'project_id, device_type, filename, mime_type, data, created_at, icon_source, library_id, library_icon_key, color',
        values: r => {
          const rowProjectId = projectId ?? r.project_id ?? targetProjectId;
          const source = r.icon_source ?? 'upload';
          return [rowProjectId, r.device_type, r.filename ?? null, r.mime_type ?? null, r.data ?? null, r.created_at, source, r.library_id ?? null, r.library_icon_key ?? null, r.color ?? null];
        },
        // Library-source rows have no blob; queueBlobWrite short-circuits on falsy data.
        onInserted: (r, newId) => {
          if (r.icon_source !== 'upload' && r.icon_source != null) return;
          const rowProjectId = (projectId ?? r.project_id ?? targetProjectId) as number;
          queueBlobWrite(blobWrites, 'device_type_icons', newId, rowProjectId, r.mime_type as string | null, r.data as string | null);
        },
      });

      insertRows({
        rows: data.device_icon_overrides, table: 'device_icon_overrides', isScoped,
        cols: 'device_id, project_id, filename, mime_type, data, created_at, icon_source, library_id, library_icon_key, color',
        values: r => {
          const did = remapDevice(r.device_id as number);
          if (did == null) return null;
          const rowProjectId = projectId ?? r.project_id ?? targetProjectId;
          const source = r.icon_source ?? 'upload';
          return [did, rowProjectId, r.filename ?? null, r.mime_type ?? null, r.data ?? null, r.created_at, source, r.library_id ?? null, r.library_icon_key ?? null, r.color ?? null];
        },
        onInserted: (r, newId) => {
          if (r.icon_source !== 'upload' && r.icon_source != null) return;
          const rowProjectId = (projectId ?? r.project_id ?? targetProjectId) as number;
          queueBlobWrite(blobWrites, 'device_icon_overrides', newId, rowProjectId, r.mime_type as string | null, r.data as string | null);
        },
      });

      insertRows({
        rows: data.diagram_images, table: 'diagram_images', isScoped,
        cols: 'project_id, x, y, width, height, filename, mime_type, data, label, view_id, created_at',
        values: r => {
          const rowProjectId = projectId ?? r.project_id ?? targetProjectId;
          // view_id is nullable; remap through viewIdMap when present, null out if unresolvable.
          const mappedView = r.view_id != null ? (viewIdMap.get(r.view_id as number) ?? null) : null;
          return [rowProjectId, r.x, r.y, r.width, r.height, r.filename, r.mime_type, r.data, r.label ?? null, mappedView, r.created_at];
        },
        onInserted: (r, newId) => {
          const rowProjectId = (projectId ?? r.project_id ?? targetProjectId) as number;
          queueBlobWrite(blobWrites, 'diagram_images', newId, rowProjectId, r.mime_type as string | null, r.data as string | null);
        },
      });

      insertRows({
        rows: data.agent_types, table: 'agent_types', isScoped,
        cols: 'project_id, key, label, icon_source, icon_builtin_key, filename, mime_type, sort_order, created_at, updated_at',
        values: r => {
          const rowProjectId = projectId ?? r.project_id ?? targetProjectId;
          return [rowProjectId, r.key, r.label, r.icon_source, r.icon_builtin_key ?? null, r.filename ?? null, r.mime_type ?? null, r.sort_order ?? 0, r.created_at, r.updated_at];
        },
        onInserted: (r, newId) => {
          if (r.icon_source !== 'upload') return;
          const rowProjectId = (projectId ?? r.project_id ?? targetProjectId) as number;
          queueBlobWrite(blobWrites, 'agent_types', newId, rowProjectId, r.mime_type as string | null, r.data as string | null);
        },
      });
    })();

    // SQL transaction has committed. Now safe to touch the filesystem:
    // write new blobs first (so rows point to them before old files vanish),
    // then unlink the old blobs.
    flushBlobWrites(blobWrites);
    for (const p of blobPathsToDelete) {
      try { deleteBlob(p); } catch (err) { console.warn(`[backup] failed to unlink ${p}:`, err); }
    }

    logActivity({ projectId: projectId ?? null, action: 'imported', resourceType: 'backup', details: { scope: projectId ? 'project' : 'full-site', version: backup.version } });
    res.json({ success: true, truncatedFields });
  } catch (err: unknown) {
    console.error('Backup import error:', err);
    const msg = err instanceof Error ? err.message : 'Import failed';
    res.status(500).json({ error: msg || 'Import failed' });
  }
});

export default router;
