type Props = { size?: number | string };

export function FavouriteStar({ size = '1em' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#facc15"
      stroke="#b7791f"
      strokeWidth="1.25"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <polygon points="12,2.5 14.85,8.68 21.5,9.55 16.5,14.17 17.85,20.95 12,17.55 6.15,20.95 7.5,14.17 2.5,9.55 9.15,8.68" />
    </svg>
  );
}
