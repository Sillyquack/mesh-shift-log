import { useState } from "react";
import { validateRoutineItemDraft } from "../data/routineTaskViewModel.js";

export default function RoutineTaskItemControl({ item, value, onChange, onSave, disabled }) {
  const type = item.item_type_snapshot ?? item.itemType ?? "text"; const [error, setError] = useState(null);
  const label = item.label_snapshot ?? item.label ?? "Task item"; const options = item.options_snapshot ?? item.options ?? [];
  const unit = item.unit_snapshot ?? item.unit; const identity = item.source_identity_snapshot ?? item.sourceIdentity;
  const update = (next) => { setError(validateRoutineItemDraft(item, next)); onChange(next); };
  let control;
  if (type === "check") control = <input type="checkbox" checked={value === true} onChange={(event) => update(event.target.checked)} disabled={disabled} />;
  else if (type === "count") control = <input type="number" inputMode="numeric" min="0" step="1" value={value ?? ""} onChange={(event) => update(event.target.value)} disabled={disabled} />;
  else if (["quantity", "measurement"].includes(type)) control = <span className="employee-measure"><input type="number" inputMode="decimal" value={value ?? ""} onChange={(event) => update(event.target.value)} disabled={disabled} /><strong>{unit}</strong></span>;
  else if (["choice", "status"].includes(type)) control = <select value={value ?? ""} onChange={(event) => update(event.target.value)} disabled={disabled}><option value="">Select…</option>{options.map((option) => <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? option}</option>)}</select>;
  else if (["location", "asset", "product"].includes(type)) control = <div className="employee-identity-control"><strong>{identity?.name ?? identity?.label ?? label}</strong><small>Source identity cannot be changed</small><textarea value={value ?? ""} onChange={(event) => update(event.target.value)} disabled={disabled} placeholder="Result or note" /></div>;
  else control = <><textarea maxLength={Number(item.max_length_snapshot ?? 500)} value={value ?? ""} onChange={(event) => update(event.target.value)} disabled={disabled} /><small>{String(value ?? "").length}/{item.max_length_snapshot ?? 500}</small></>;
  return <label className="employee-item"><span><strong>{label}</strong><small>{item.required_snapshot ?? item.required ? "Required" : "Optional"} · {type}</small></span>{control}
    {error && <em role="alert">{error}</em>}{onSave && <button type="button" onClick={onSave} disabled={disabled || Boolean(error)}>Save item</button>}</label>;
}
