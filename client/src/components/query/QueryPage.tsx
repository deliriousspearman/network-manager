import { useState, useCallback } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { useProject } from '../../contexts/ProjectContext';
import { executeQuery, type QueryResult } from '../../api/sqlQuery';

interface SuggestedQuery {
  label: string;
  description: string;
  sql: string;
}

const SUGGESTED_QUERIES: SuggestedQuery[] = [
  {
    label: 'Hosts with root credentials',
    description: 'Find all devices/hosts where we have a credential with username "root"',
    sql: `SELECT d.name AS device, c.host, c.username, c.type, c.source
FROM credentials c
LEFT JOIN devices d ON c.device_id = d.id
WHERE c.project_id = $projectId AND c.username = 'root'
ORDER BY d.name`,
  },
  {
    label: 'Devices without credentials',
    description: 'Devices that have no stored credentials',
    sql: `SELECT d.name, d.type, d.os,
  (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1) AS primary_ip
FROM devices d
WHERE d.project_id = $projectId
  AND d.id NOT IN (SELECT device_id FROM credentials WHERE device_id IS NOT NULL AND project_id = $projectId)
ORDER BY d.name`,
  },
  {
    label: 'Open ports by device',
    description: 'All discovered open ports across devices',
    sql: `SELECT d.name AS device, dp.port_number, dp.state, dp.service
FROM device_ports dp
JOIN devices d ON dp.device_id = d.id
WHERE dp.project_id = $projectId
ORDER BY d.name, dp.port_number`,
  },
  {
    label: 'Subnet device counts',
    description: 'How many devices are in each subnet',
    sql: `SELECT s.name AS subnet, s.cidr, s.vlan_id,
  COUNT(ds.device_id) AS device_count
FROM subnets s
LEFT JOIN device_subnets ds ON ds.subnet_id = s.id
WHERE s.project_id = $projectId
GROUP BY s.id
ORDER BY device_count DESC`,
  },
  {
    label: 'VM to hypervisor mapping',
    description: 'Show which VMs run on which hypervisors',
    sql: `SELECT v.name AS vm, v.os AS vm_os,
  h.name AS hypervisor, h.os AS hypervisor_os
FROM devices v
JOIN devices h ON v.hypervisor_id = h.id
WHERE v.project_id = $projectId AND v.hosting_type = 'vm'
ORDER BY h.name, v.name`,
  },
  {
    label: 'Credentials summary by type',
    description: 'Overview of all stored credentials grouped by type',
    sql: `SELECT c.type, COUNT(*) AS count,
  GROUP_CONCAT(DISTINCT c.username) AS usernames
FROM credentials c
WHERE c.project_id = $projectId
GROUP BY c.type
ORDER BY count DESC`,
  },
  {
    label: 'Devices with AV',
    description: 'All devices that have antivirus software recorded',
    sql: `SELECT d.name, d.type, d.os, d.av,
  (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1) AS primary_ip
FROM devices d
WHERE d.project_id = $projectId AND d.av IS NOT NULL AND d.av != ''
ORDER BY d.name`,
  },
  {
    label: 'Devices without AV',
    description: 'All devices that have no antivirus software recorded',
    sql: `SELECT d.name, d.type, d.os,
  (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1) AS primary_ip
FROM devices d
WHERE d.project_id = $projectId AND (d.av IS NULL OR d.av = '')
ORDER BY d.name`,
  },
  {
    label: 'Devices with public IPs',
    description: 'Devices with at least one non-private (public) IP address',
    sql: `SELECT d.name, di.ip_address, di.label
FROM devices d
JOIN device_ips di ON di.device_id = d.id
WHERE d.project_id = $projectId
  AND di.ip_address NOT LIKE '10.%'
  AND di.ip_address NOT LIKE '192.168.%'
  AND di.ip_address NOT LIKE '127.%'
  AND di.ip_address NOT LIKE '169.254.%'
  AND di.ip_address NOT LIKE '0.%'
  AND di.ip_address NOT LIKE 'fe80:%'
  AND di.ip_address NOT LIKE 'fc%'
  AND di.ip_address NOT LIKE 'fd%'
  AND di.ip_address NOT LIKE '::1'
  AND NOT (
    di.ip_address LIKE '172.%'
    AND CAST(SUBSTR(di.ip_address, 5, INSTR(SUBSTR(di.ip_address, 5), '.') - 1) AS INTEGER) BETWEEN 16 AND 31
  )
ORDER BY d.name`,
  },
  {
    label: 'Devices with multiple IPs',
    description: 'Devices that have more than one IP address assigned',
    sql: `SELECT d.name, d.type, d.os,
  COUNT(di.id) AS ip_count,
  GROUP_CONCAT(di.ip_address) AS ip_addresses
FROM devices d
JOIN device_ips di ON di.device_id = d.id
WHERE d.project_id = $projectId
GROUP BY d.id
HAVING COUNT(di.id) > 1
ORDER BY ip_count DESC, d.name`,
  },
  {
    label: 'All domains',
    description: 'List of all unique domains from devices',
    sql: `SELECT d.domain, COUNT(*) AS device_count,
  GROUP_CONCAT(d.name) AS devices
FROM devices d
WHERE d.project_id = $projectId AND d.domain IS NOT NULL AND d.domain != ''
GROUP BY d.domain
ORDER BY device_count DESC`,
  },
];

export default function QueryPage() {
  const { projectId } = useProject();
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runQuery = useCallback(async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await executeQuery(projectId, sql);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  }, [projectId, sql]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  }, [runQuery]);

  return (
    <div>
      <div className="page-header">
        <h2>SQL Query</h2>
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {/* Suggested queries */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Sparkles size={16} style={{ color: 'var(--color-primary)' }} />
            <strong style={{ fontSize: '0.9rem' }}>Suggested Queries</strong>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q.label}
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                title={q.description}
                onClick={() => setSql(q.sql)}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* SQL editor */}
        <div className="card" style={{ padding: '1rem' }}>
          <textarea
            value={sql}
            onChange={e => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a SELECT query... Use $projectId to filter by current project."
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: '10rem',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              padding: '0.75rem',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              background: 'var(--color-input-bg)',
              color: 'var(--color-text)',
              resize: 'vertical',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              className="btn btn-primary"
              onClick={runQuery}
              disabled={loading || !sql.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Play size={14} />
              {loading ? 'Running...' : 'Run Query'}
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Ctrl+Enter to run
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--color-danger-bg, #fef2f2)', border: '1px solid var(--color-danger, #ef4444)', color: 'var(--color-danger, #ef4444)', borderRadius: 6, fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                {result.rowCount} row{result.rowCount !== 1 ? 's' : ''} returned
              </span>
              {result.truncated && (
                <span className="badge" style={{ background: 'var(--color-warning, #f59e0b)', color: '#fff', fontSize: '0.75rem' }}>
                  Results truncated to 1,000 rows
                </span>
              )}
            </div>
            {result.rowCount === 0 ? (
              <div className="empty-state">No results</div>
            ) : (
              <div className="card table-container">
                <table>
                  <thead>
                    <tr>
                      {result.columns.map(col => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {result.columns.map(col => (
                          <td key={col} style={{ fontSize: '0.8rem' }}>
                            {row[col] == null ? <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>NULL</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
