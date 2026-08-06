import { useEffect, useRef } from "react";

const focusableSelector = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

export function useRoutineDialogFocusTrap(active = true) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    returnFocusRef.current = document.activeElement;
    const first = dialogRef.current?.querySelector(focusableSelector);
    first?.focus();
    return () => returnFocusRef.current?.focus?.();
  }, [active]);

  const trapFocus = (event) => {
    if (event.key !== "Tab") return;
    const controls = [...(dialogRef.current?.querySelectorAll(focusableSelector) || [])];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return { dialogRef, trapFocus };
}
