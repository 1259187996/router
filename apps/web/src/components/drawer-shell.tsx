import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

const widthClassName = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

type DrawerShellProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  eyebrow?: string;
  description?: string;
  width?: keyof typeof widthClassName;
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

export function DrawerShell({
  open,
  title,
  onClose,
  children,
  eyebrow,
  description,
  width = 'md',
}: DrawerShellProps) {
  const titleId = useId();
  const descriptionId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    lastFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const initialFocusTarget = getFocusableElements(drawerRef.current)[0] ?? drawerRef.current;
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

    const focusableElements = getFocusableElements(drawerRef.current);

    if (focusableElements.length === 0) {
      event.preventDefault();
      drawerRef.current?.focus();
      return;
    }

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const focusIsInsideDrawer = drawerRef.current?.contains(activeElement) ?? false;

    if (event.shiftKey) {
      if (!focusIsInsideDrawer || activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement.focus();
      }

      return;
    }

    if (!focusIsInsideDrawer || activeElement === lastFocusableElement) {
      event.preventDefault();
      firstFocusableElement.focus();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[rgba(6,24,21,0.36)] backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="complementary"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        ref={drawerRef}
        onKeyDown={handleKeyDown}
        className={[
          'app-surface relative z-10 flex h-full w-full flex-col overflow-hidden border-l border-white/45 shadow-[-24px_0_80px_-50px_rgba(10,34,29,0.72)] sm:my-4 sm:mr-4 sm:h-[calc(100vh-2rem)] sm:rounded-[32px]',
          widthClassName[width],
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
