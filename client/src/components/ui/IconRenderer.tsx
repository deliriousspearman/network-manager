import { useEffect, useState, useMemo } from 'react';

/**
 * Renders a device-icon URL with optional color tinting.
 *
 * Three modes:
 *  1. No `color` set → plain `<img>`.
 *  2. `color` set AND src is a bundled library SVG (`/icon-libraries/...`)
 *     → fetch the SVG once, inline it via dangerouslySetInnerHTML, and set
 *     CSS variables (`--icon-primary` / `--icon-secondary`) on a wrapper.
 *     The SVG's drawio default colors are written as `var(--icon-primary, fallback)`
 *     so swapping the variable replaces only the drawio-blue palette while
 *     explicit colors (e.g. white flame) stay literal — preserving structure.
 *  3. `color` set AND src is built-in or upload (likely monochrome) → CSS
 *     `mask-image` + `background-color`. The whole SVG becomes one tinted
 *     silhouette (correct behaviour for truly monochrome icons).
 *
 * The fetched SVG content is cached in module memory so repeated tints of
 * the same icon don't refetch.
 */

const svgCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function isLibraryUrl(src: string): boolean {
  return src.startsWith('/icon-libraries/');
}

// Derive a darker shade for the icon's secondary stroke. Multiplicative
// shrink in RGB — quick, perceptually fine for the small icon previews.
function darken(hex: string, amount: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const f = Math.max(0, Math.min(1, 1 - amount));
  const r = Math.round(((v >> 16) & 0xff) * f);
  const g = Math.round(((v >> 8) & 0xff) * f);
  const b = Math.round((v & 0xff) * f);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function useSvgContent(url: string | null): string | null {
  const [content, setContent] = useState<string | null>(
    url && svgCache.has(url) ? svgCache.get(url)! : null,
  );
  useEffect(() => {
    if (!url) { setContent(null); return; }
    if (svgCache.has(url)) { setContent(svgCache.get(url)!); return; }
    let cancelled = false;
    let p = inflight.get(url);
    if (!p) {
      p = fetch(url)
        .then(r => r.ok ? r.text() : '')
        .then(text => { svgCache.set(url, text); inflight.delete(url); return text; })
        .catch(() => { inflight.delete(url); return ''; });
      inflight.set(url, p);
    }
    p.then(text => { if (!cancelled) setContent(text); });
    return () => { cancelled = true; };
  }, [url]);
  return content;
}

interface Props {
  src: string;
  color?: string | null;
  size?: number;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function IconRenderer({ src, color, size = 64, alt, className, style }: Props) {
  const tinted = !!color;
  const useInline = tinted && isLibraryUrl(src);
  const inlineUrl = useInline ? src : null;
  const svgText = useSvgContent(inlineUrl);
  const darker = useMemo(() => (color ? darken(color, 0.3) : null), [color]);

  if (!tinted) {
    return (
      <img
        src={src}
        alt={alt ?? ''}
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'contain', ...style }}
        draggable={false}
      />
    );
  }

  if (useInline) {
    // Inline render with CSS vars. While loading, fall back to a clear box so
    // the layout doesn't jump; once content arrives the SVG paints over.
    return (
      <div
        role="img"
        aria-label={alt}
        className={`icon-inline-tint ${className ?? ''}`}
        style={{
          width: size,
          height: size,
          display: 'inline-block',
          ['--icon-primary' as string]: color,
          ['--icon-secondary' as string]: darker,
          ...style,
        }}
        dangerouslySetInnerHTML={svgText ? { __html: svgText } : undefined}
      />
    );
  }

  // Monochrome built-in or upload: CSS mask gives a single-colour silhouette.
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{
        width: size,
        height: size,
        WebkitMask: `url("${src}") center/contain no-repeat`,
        mask: `url("${src}") center/contain no-repeat`,
        backgroundColor: color!,
        ...style,
      }}
    />
  );
}
