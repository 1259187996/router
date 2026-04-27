import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

const sizeClassName = {
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
} as const;

type ModalShellProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  eyebrow?: string;
  description?: string;
  size?: keyof typeof sizeClassName;
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
  );
}

export function ModalShell({
  open,
  title,
  onClose,
  children,
  eyebrow,
  description,
  size = 'lg',
}: ModalShellProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    lastFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const initialFocusTarget = getFocusableElements(dialogRef.current)[0] ?? dialogRef.current;
    initialFocusTarget?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      const lastFocusedElement = lastFocusedElementRef.current;

      if (lastFocusedElement?.isConnected) {
        lastFocusedElement.focus();
      }
    };
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const focusIsInsideDialog = dialogRef.current?.contains(activeElement) ?? false;

    if (event.shiftKey) {
      if (!focusIsInsideDialog || activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement.focus();
      }

      return;
    }

    if (!focusIsInsideDialog || activeElement === lastFocusableElement) {
      event.preventDefault();
      firstFocusableElement.focus();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[rgba(6,24,21,0.56)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleKeyDown}
        className={[
          'app-surface relative z-10 flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[32px] border border-white/45 shadow-[0_36px_90px_-42px_rgba(10,34,29,0.72)] sm:max-h-[calc(100vh-3rem)]',
          sizeClassName[size],
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5 sm:px-7">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
            ) : null}
            <h2 id={titleId} className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-full border border-line-soft bg-white/80 px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-line-strong hover:text-ink"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-6 sm:px-7">{children}</div>
      </div>
    </div>
  );
}
