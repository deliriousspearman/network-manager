export interface PortInfo {
  port: number;
  protocol: string;
  service?: string;
  version?: string;
}

interface Props {
  ports: PortInfo[];
  max?: number;
}

export default function PortsList({ ports, max = 5 }: Props) {
  const shown = ports.slice(0, max);
  const rest = ports.length - max;
  return (
    <span>
      {shown.map((p, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <span
            className="badge badge-neutral"
            title={p.service ? `${p.service}${p.version ? ' ' + p.version : ''}` : undefined}
            style={{ fontSize: '0.72rem', padding: '1px 5px' }}
          >
            {p.port}/{p.protocol}
          </span>
        </span>
      ))}
      {rest > 0 && <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}> +{rest} more</span>}
    </span>
  );
}
