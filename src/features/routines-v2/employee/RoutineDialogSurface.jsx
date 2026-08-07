import { useEffect, useRef } from "react";

export default function RoutineDialogSurface({ title, description, onClose, children, className = "" }) {
  const dialog = useRef(null); const returnFocus = useRef(null);
  useEffect(() => {
    returnFocus.current = document.activeElement;
    const node = dialog.current; const focusable = () => [...node.querySelectorAll("button,input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter((entry) => !entry.disabled);
    focusable()[0]?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const entries = focusable(); if (!entries.length) return;
      const first = entries[0]; const last = entries.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", keydown);
    return () => { node.removeEventListener("keydown", keydown); returnFocus.current?.focus?.(); };
  }, [onClose]);
  return <div className="employee-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className={`employee-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby="employee-dialog-title" aria-describedby="employee-dialog-description">
      <header><div><h2 id="employee-dialog-title">{title}</h2>{description && <p id="employee-dialog-description">{description}</p>}</div>
        <button type="button" className="employee-icon-button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</section></div>;
}
