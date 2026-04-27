import sanitizeHtml from 'sanitize-html';

/**
 * Server-side sanitizer for rich-text fields (device rich_notes, project description,
 * project about_title). This is defense-in-depth: the client already runs DOMPurify
 * before rendering, but API callers can bypass that entirely — stored XSS payloads
 * must be scrubbed before they touch the database.
 *
 * The allowlist matches what the RichToolbar in client/src/components/ui/RichEditor.tsx
 * can actually produce: basic formatting, headings, lists, blockquotes, code blocks,
 * tables, and execCommand-generated <font> / style attributes for colour/size/alignment.
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span', 'a',
    'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // <font> is emitted by document.execCommand('foreColor' / 'fontSize') in some browsers
    'font',
  ],
  allowedAttributes: {
    '*': ['style', 'align'],
    a: ['href', 'target', 'rel'],
    font: ['color', 'size', 'face'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    col: ['span'],
    colgroup: ['span'],
  },
  allowedStyles: {
    '*': {
      color: [/^.*$/],
      'background-color': [/^.*$/],
      'text-align': [/^(left|right|center|justify)$/],
      'font-size': [/^[\d.]+(px|em|rem|%|pt)$/],
      'font-weight': [/^(normal|bold|bolder|lighter|[1-9]00)$/],
      'font-style': [/^(normal|italic|oblique)$/],
      'text-decoration': [/^(none|underline|line-through|overline)$/],
      width: [/^[\d.]+(px|em|rem|%)$/],
      height: [/^[\d.]+(px|em|rem|%)$/],
    },
  },
  transformTags: {
    // Force safe link attributes regardless of what the client sent. Any href
    // that isn't in allowedSchemes (http/https/mailto) is stripped by sanitize-html
    // before this runs, so we only rewrite survivors.
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
  // Drop anything that isn't on the allowlist rather than escaping it to text, so the
  // output stays renderable.
  disallowedTagsMode: 'discard',
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
  },
};

/**
 * Sanitize untrusted HTML for storage. Returns an empty string for null/undefined so
 * callers don't have to special-case. For non-string inputs we return an empty string
 * rather than throwing — routes handle their own required-field validation upstream.
 */
export function sanitizeRichText(input: string | null | undefined): string {
  if (input == null) return '';
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, RICH_TEXT_OPTIONS);
}

/**
 * Strip ALL HTML tags. Used for fields that should be plain text but might receive
 * HTML from a copy-paste (e.g. project about_title).
 */
export function stripHtml(input: string | null | undefined): string {
  if (input == null) return '';
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
}
