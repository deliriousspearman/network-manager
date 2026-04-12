const MAX_LABEL_LENGTH = 40;

export function truncateLabel(label: string): string {
  if (!label || label.length <= MAX_LABEL_LENGTH) return label;
  return label.slice(0, MAX_LABEL_LENGTH - 1) + '…';
}
