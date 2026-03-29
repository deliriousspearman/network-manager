interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}

function getPageNumbers(page: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, Math.max(1, page - 1), page, Math.min(totalPages, page + 1), totalPages]);
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | '...')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...');
    result.push(sorted[i]);
  }
  return result;
}

export default function Pagination({ page, totalPages, total, limit, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return (
    <div className="pagination">
      <button className="pagination-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Prev
      </button>
      {getPageNumbers(page, totalPages).map((p, i) =>
        p === '...'
          ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
          : <button key={p} className={`pagination-btn${p === page ? ' active' : ''}`} onClick={() => onChange(p)}>{p}</button>
      )}
      <button className="pagination-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next →
      </button>
      <span className="pagination-info">{start}–{end} of {total}</span>
    </div>
  );
}
