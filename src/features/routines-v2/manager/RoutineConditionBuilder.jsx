import {
  CONDITION_FACTS,
  CONDITION_OPERATORS,
  conditionLeaf,
  isClosedCondition,
} from "../data/routineTemplateEditorModel.js";
import { Field } from "./RoutineManagerPrimitives.jsx";

const MAX_DEPTH = 5;
const EXTERNAL_FACTS = new Set([
  "event_zone_active",
  "booking_exists",
  "asset_used_today",
  "transfer_status",
]);

function ConditionNode({ value, onChange, onRemove, readOnly, depth = 0, path = "root" }) {
  const group = ["all", "any", "not"].find((key) => Object.hasOwn(value || {}, key));
  if (group) {
    const children = group === "not" ? [value.not] : value[group];
    const replace = (index, next) => {
      const updated = children.map((child, childIndex) => childIndex === index ? next : child);
      onChange(group === "not" ? { not: updated[0] } : { [group]: updated });
    };
    return <fieldset className="rm-condition-node">
      <legend>{group.toUpperCase()} group · depth {depth}</legend>
      {children.map((child, index) => <ConditionNode
        key={`${path}-${index}`}
        value={child}
        depth={depth + 1}
        path={`${path}-${index}`}
        readOnly={readOnly}
        onChange={(next) => replace(index, next)}
        onRemove={group === "not" ? null : () => onChange({ [group]: children.filter((_, childIndex) => childIndex !== index) })}
      />)}
      {!readOnly && group !== "not" && depth < MAX_DEPTH ? <div className="rm-actions">
        <button type="button" className="ghost-button" onClick={() => onChange({ [group]: [...children, conditionLeaf()] })}>Add condition</button>
        <button type="button" className="ghost-button" onClick={() => onChange({ [group]: [...children, { all: [conditionLeaf()] }] })}>Add nested group</button>
      </div> : null}
      {!readOnly && onRemove ? <button type="button" className="ghost-button" onClick={onRemove}>Remove group</button> : null}
    </fieldset>;
  }

  const leaf = { ...conditionLeaf(), ...(value || {}) };
  const patch = (next) => onChange({ ...leaf, ...next });
  return <div className="rm-condition-node rm-three-grid">
    <Field id={`${path}-fact`} label="Fact" help="Closed Phase 10B/10F vocabulary.">
      <select id={`${path}-fact`} disabled={readOnly} value={leaf.fact} onChange={(event) => patch({ fact: event.target.value })}>
        {CONDITION_FACTS.map((fact) => <option key={fact}>{fact}</option>)}
      </select>
    </Field>
    <Field id={`${path}-operator`} label="Operator" help="Unknown operators cannot be saved.">
      <select id={`${path}-operator`} disabled={readOnly} value={leaf.operator} onChange={(event) => {
        const operator = event.target.value;
        onChange(operator === "exists" ? { fact: leaf.fact, operator } : { ...leaf, operator, value: leaf.value ?? "" });
      }}>
        {CONDITION_OPERATORS.map((operator) => <option key={operator}>{operator}</option>)}
      </select>
    </Field>
    {leaf.operator !== "exists" ? <Field id={`${path}-value`} label="Value" help="Declarative value only; never code.">
      <input id={`${path}-value`} disabled={readOnly} value={Array.isArray(leaf.value) ? leaf.value.join(", ") : leaf.value ?? ""} onChange={(event) => patch({ value: leaf.operator === "in" ? event.target.value.split(",").map((part) => part.trim()).filter(Boolean) : event.target.value })} />
    </Field> : <span />}
    {EXTERNAL_FACTS.has(leaf.fact) ? <p className="rm-note">Pending external context.</p> : null}
    {!readOnly && onRemove ? <button type="button" className="ghost-button" onClick={onRemove}>Remove condition</button> : null}
  </div>;
}

export default function RoutineConditionBuilder({ value = {}, onChange, readOnly = false }) {
  const root = Object.keys(value).length ? value : null;
  return <section className="rm-subpanel">
    <header>
      <h4>Condition builder</h4>
      <span>{root && isClosedCondition(root) ? "Valid closed structure" : root ? "Incomplete condition" : "Always"}</span>
    </header>
    {!readOnly ? <div className="rm-actions">
      <button type="button" className="ghost-button" onClick={() => onChange({})}>Always</button>
      <button type="button" className="ghost-button" onClick={() => onChange(conditionLeaf())}>Single condition</button>
      {["all", "any", "not"].map((group) => <button type="button" className="ghost-button" key={group} onClick={() => onChange(group === "not" ? { not: conditionLeaf() } : { [group]: [conditionLeaf()] })}>{group}</button>)}
    </div> : null}
    {root ? <ConditionNode value={root} onChange={onChange} readOnly={readOnly} /> : <p>This task is always eligible, subject to authoritative server policy.</p>}
    <details>
      <summary>Generated read-only JSON</summary>
      <pre className="rm-json">{JSON.stringify(value, null, 2)}</pre>
    </details>
    <p className="rm-note">No JavaScript, SQL, eval, or unknown vocabulary is accepted. Server validation remains authoritative.</p>
  </section>;
}
