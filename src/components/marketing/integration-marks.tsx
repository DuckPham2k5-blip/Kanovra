/**
 * Simplified brand marks for the integrations grid, drawn inline.
 *
 * They are inline SVG rather than image files on purpose: the landing page
 * ships no external requests, so the grid paints with the first byte of HTML
 * and there is nothing to 404 when a CDN changes.
 */

type MarkProps = { className?: string };

export function GoogleDriveMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8.4 2h7.2l7.2 12.5h-7.2z" fill="#ffc107" />
      <path d="M1.2 14.5 8.4 2l3.6 6.25-3.6 6.25z" fill="#1976d2" />
      <path d="M1.2 14.5h21.6L19.2 21H4.8z" fill="#4caf50" />
    </svg>
  );
}

export function GmailMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M2 6.2 12 13l10-6.8V18a1.5 1.5 0 0 1-1.5 1.5H3.5A1.5 1.5 0 0 1 2 18z" fill="#e53935" />
      <path d="M2 6.2A1.7 1.7 0 0 1 3.7 4.5h.8L12 10l7.5-5.5h.8A1.7 1.7 0 0 1 22 6.2L12 13z" fill="#c62828" />
    </svg>
  );
}

export function SlackMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 14.5a2 2 0 1 1-2-2h2zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0z" fill="#e01e5a" />
      <path d="M9.5 6a2 2 0 1 1 2-2v2zm0 1a2 2 0 1 1 0 4h-5a2 2 0 1 1 0-4z" fill="#36c5f0" />
      <path d="M18 9.5a2 2 0 1 1 2 2h-2zm-1 0a2 2 0 1 1-4 0v-5a2 2 0 1 1 4 0z" fill="#2eb67d" />
      <path d="M14.5 18a2 2 0 1 1-2 2v-2zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4z" fill="#ecb22e" />
    </svg>
  );
}

export function GithubMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2"
      />
    </svg>
  );
}

export function NotionMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="3" y="2.5" width="18" height="19" rx="2.5" fill="currentColor" opacity="0.12" />
      <path
        d="M7.5 17V8.2l1.9-.3 5.1 6.6V7.7l1.9-.3v9l-1.8.3-5.2-6.7V17z"
        fill="currentColor"
      />
    </svg>
  );
}

export function FigmaMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8.5 2h3.5v4.5H8.5a2.25 2.25 0 0 1 0-4.5" fill="#f24e1e" />
      <path d="M12 2h3.5a2.25 2.25 0 0 1 0 4.5H12z" fill="#ff7262" />
      <path d="M8.5 6.5H12V11H8.5a2.25 2.25 0 0 1 0-4.5" fill="#a259ff" />
      <path d="M12 6.5h3.5a2.25 2.25 0 1 1-3.5 1.9z" fill="#1abcfe" />
      <path d="M8.5 11H12v4.5a2.25 2.25 0 1 1-3.5-1.9z" fill="#0acf83" />
    </svg>
  );
}

export function ClaudeMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#d97757"
        d="m6.6 16.4 3.6-2 .06-.18-.06-.1h-.18l-.6-.04-2.06-.05-1.79-.08-1.73-.09-.44-.09L3 13.13l.04-.28.36-.24.53.04 1.14.08 1.72.12 1.24.07 1.84.2h.3l.04-.12-.1-.08-.08-.07-1.85-1.25-2-1.32-1.05-.77-.57-.38-.28-.36-.13-.78.51-.56.68.05.18.05.69.53 1.48 1.14 1.93 1.42.28.24.11-.08.02-.06-.13-.21-1.05-1.9-1.12-1.93-.5-.8-.13-.48a2.3 2.3 0 0 1-.08-.57l.58-.79.32-.1.78.1.32.29.48 1.1.78 1.73 1.21 2.36.35.7.19.65.07.2h.13v-.12l.1-1.38.19-1.7.19-2.18.06-.61.3-.74.6-.39.47.22.39.55-.06.36-.23 1.51-.45 2.36-.3 1.58h.18l.2-.2.8-1.07 1.36-1.7.6-.67.7-.75.45-.35h.85l.62.93-.28.96-.87 1.1-.72.94-1.04 1.4-.65 1.12.06.09h.15l2.35-.5 1.27-.23 1.51-.26.69.32.07.32-.27.67-1.62.4-1.9.38-2.83.67-.03.02.04.05 1.27.12.55.03h1.33l2.49.18.65.43.39.52-.07.4-1 .51-1.35-.32-3.14-.75-1.08-.27h-.15v.09l.9.88 1.65 1.49 2.06 1.92.1.47-.26.38-.28-.04-1.8-1.36-.69-.61-1.57-1.32h-.1v.14l.36.53 1.91 2.87.1.88-.14.29-.5.17-.53-.09-1.11-1.55-1.14-1.75-.92-1.57-.11.07-.55 5.9-.25.3-.59.23-.49-.37-.26-.6.26-1.19.31-1.55.26-1.24.23-1.53.14-.51-.01-.03-.11.01-1.16 1.6-1.77 2.39-1.4 1.5-.34.13-.58-.3.05-.54.33-.48 1.94-2.47.29-.39v-.16h-.07l-2.65 1.72-.47.06-.34-.32.04-.52.16-.17 1.34-.92z"
      />
    </svg>
  );
}

export function OpenAiMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ZapierMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#ff4f00"
        d="M14.4 12a8.6 8.6 0 0 1-.56 3.05 8.6 8.6 0 0 1-3.05.55h-.02a8.6 8.6 0 0 1-3.05-.55A8.6 8.6 0 0 1 7.16 12v-.01c0-1.07.2-2.1.56-3.04A8.6 8.6 0 0 1 10.77 8.4h.02c1.07 0 2.1.2 3.05.56.36.94.56 1.97.56 3.04zM23 10.36h-6.86l4.85-4.85a11.6 11.6 0 0 0-2.5-2.5L13.64 7.86V1a11.7 11.7 0 0 0-3.54 0v6.86L5.25 3.01a11.6 11.6 0 0 0-2.5 2.5l4.85 4.85H.74a11.7 11.7 0 0 0 0 3.54h6.86l-4.85 4.85c.72.95 1.55 1.78 2.5 2.5l4.85-4.85V23a11.7 11.7 0 0 0 3.54 0v-6.86l4.85 4.85a11.6 11.6 0 0 0 2.5-2.5l-4.85-4.85H23a11.7 11.7 0 0 0 0-3.54z"
        transform="translate(0.4 0)"
      />
    </svg>
  );
}
