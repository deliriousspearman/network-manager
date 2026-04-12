interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({ width, height, className }: SkeletonProps) {
  return (
    <span
      className={`skeleton${className ? ' ' + className : ''}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
}

export function SkeletonTable({ rows = 6, columns = 4 }: SkeletonTableProps) {
  return (
    <div className="card table-container">
      <table>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="skeleton-row">
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c}>
                  <Skeleton />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Skeleton;
