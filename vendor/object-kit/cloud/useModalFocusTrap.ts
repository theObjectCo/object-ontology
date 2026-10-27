import { useEffect, useLayoutEffect, useRef } from 'react';

const FOCUSABLE = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'a[href]',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest('[inert]') || el.closest('[hidden]')) return false;
    const closedDetails = el.closest('details:not([open])');
    if (closedDetails && !(el.tagName === 'SUMMARY' && el.parentElement === closedDetails)) return false;
    return el.getClientRects().length > 0;
  });
}

export function safeHttpsHref(value?: string): string | undefined {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function useModalFocusTrap(isOpen: boolean, useDialogElement: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const modalDivRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!useDialogElement || !isOpen) return;
    const element = dialogRef.current;
    if (!element) return;
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => {
      element.close();
      prevFocus?.focus?.();
    };
  }, [useDialogElement, isOpen]);

  useEffect(() => {
    if (useDialogElement || !isOpen) return;
    const root = modalDivRef.current;
    if (!root) return;
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inerted: Array<[HTMLElement, boolean]> = [];
    let anc: HTMLElement | null = root;
    while (anc && anc.parentElement && anc.parentElement !== document.documentElement) {
      for (const sib of Array.from(anc.parentElement.children)) {
        if (sib !== anc && sib instanceof HTMLElement && !['SCRIPT', 'STYLE', 'LINK'].includes(sib.tagName)) {
          inerted.push([sib, sib.inert]);
          sib.inert = true;
        }
      }
      anc = anc.parentElement;
    }
    getFocusable(root)[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const list = getFocusable(root);
        if (!list.length) {
          e.preventDefault();
          return;
        }
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      for (const [el, wasInert] of inerted) el.inert = wasInert;
      prevFocus?.focus?.();
    };
  }, [useDialogElement, isOpen]);

  return { dialogRef, modalDivRef, onCloseRef };
}
