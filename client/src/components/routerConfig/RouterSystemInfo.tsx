import type { RouterConfigWithParsed } from 'shared/types';

export default function RouterSystemInfo({ config }: { config: RouterConfigWithParsed }) {
  const hasAny = config.hostname || config.os_version || config.model || config.domain || config.timezone || config.ntp_servers;
  if (!hasAny) return null;

  let ntp: string[] = [];
  if (config.ntp_servers) {
    try { ntp = JSON.parse(config.ntp_servers); } catch { /* ignore */ }
  }

  return (
    <div className="card" style={{ marginBottom: '0.75rem' }}>
      <h4 style={{ fontSize: '0.9rem', margin: '0 0 0.6rem 0' }}>System</h4>
      <div className="detail-grid">
        <div className="detail-item">
          <label>Hostname</label>
          <p>{config.hostname || '—'}</p>
        </div>
        <div className="detail-item">
          <label>OS Version</label>
          <p>{config.os_version || '—'}</p>
        </div>
        <div className="detail-item">
          <label>Model</label>
          <p>{config.model || '—'}</p>
        </div>
        <div className="detail-item">
          <label>Domain</label>
          <p>{config.domain || '—'}</p>
        </div>
        <div className="detail-item">
          <label>Timezone</label>
          <p>{config.timezone || '—'}</p>
        </div>
        <div className="detail-item">
          <label>NTP Servers</label>
          <p style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {ntp.length > 0 ? ntp.join(', ') : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
