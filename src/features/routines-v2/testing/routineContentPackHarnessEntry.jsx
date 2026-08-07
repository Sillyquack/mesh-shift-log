import React from "react";
import { createRoot } from "react-dom/client";
import contentPack from "../../../../content/routine-engine/mesh-routine-content-v1.json";
import "../../../styles.css";
import "../components/RoutineEngineShell.css";
import "../manager/RoutineManager.css";
import RoutineContentPackManager from "../manager/RoutineContentPackManager.jsx";
import { StatusPill } from "../manager/RoutineManagerPrimitives.jsx";

const scenario = new URLSearchParams(location.search).get("scenario") || "content-preview-desktop";
const allTasks = [...contentPack.opening.tasks, ...contentPack.closing.tasks];
const countItems = allTasks.reduce((total, task) => total + task.items.length, 0);
const basePreview = {
  packMetadata: { packKey: contentPack.packKey, packVersion: contentPack.packVersion, schemaVersion: contentPack.schemaVersion, name: contentPack.name, packHash: contentPack.packHash },
  valid: true, alreadyInstalled: false, installStatus: "not_installed", blockers: [], warnings: [], conflicts: [],
  resourcesToCreate: [
    { resourceType: "templateDraft", key: "opening" }, { resourceType: "templateDraft", key: "closing" },
    { resourceType: "locationSet", key: "serviceware-recovery-route" }, { resourceType: "standard", key: "coffee-cups-full-target" },
  ],
  resourcesToReuse: [{ resourceType: "location", key: "workbar" }, { resourceType: "location", key: "atrium" }],
  unresolvedRequirements: contentPack.unresolvedRequirements,
  counts: { sections: contentPack.sections.length, openingTasks: 37, closingTasks: 46, doubleShiftSteps: 4, items: countItems, relations: contentPack.opening.relations.length + contentPack.closing.relations.length, references: contentPack.references.length },
  organizationStateHash: "d".repeat(64), readinessImpact: { releaseReadiness: "blocked", publication: "blocked_by_unresolved_requirements", modeChanged: false, releaseStageChanged: false },
  existingTemplates: {},
};
const installedResult = { installStatus: "installed", installationId: "60000000-0000-4000-8000-000000000001", packHash: contentPack.packHash, openingTemplateId: "60000000-0000-4000-8000-000000000002", openingDraftVersionId: "60000000-0000-4000-8000-000000000003", closingTemplateId: "60000000-0000-4000-8000-000000000004", closingDraftVersionId: "60000000-0000-4000-8000-000000000005", published: false, runsCreated: false };
const installedPreview = { ...basePreview, alreadyInstalled: true, installStatus: "installed", resourcesToCreate: [], resourcesToReuse: [{ resourceType: "installation", key: contentPack.packKey }], existingTemplates: { openingTemplateId: installedResult.openingTemplateId, openingDraftVersionId: installedResult.openingDraftVersionId, closingTemplateId: installedResult.closingTemplateId, closingDraftVersionId: installedResult.closingDraftVersionId } };
const previewer = async () => installedPreview;
const auditLoader = async () => ({ semanticDivergence: { opening: false, closing: false } });
const frame = (children) => <main className="rm-workspace" data-visual-scenario={scenario}><header className="rm-topbar"><div><p className="eyebrow">Visual harness · {scenario}</p><h1>Operational content</h1></div><button type="button" className="ghost-button">Back to preview home</button></header><section className="rm-panel rm-stack">{children}</section></main>;

function ContentManager({ failure, alreadyInstalled = false }) {
  let installed = alreadyInstalled;
  const scenarioPreviewer = async () => installed ? installedPreview : basePreview;
  const installer = async () => {
    if (failure) { const error = new Error(failure === "stale" ? "Stale organization state." : "Network unavailable."); error.kind = failure; throw error; }
    installed = true;
    return installedResult;
  };
  return frame(<RoutineContentPackManager previewer={scenarioPreviewer} installer={installer} auditLoader={auditLoader} onOpenTemplates={() => {}} />);
}

function TaskCard({ id }) {
  const task = allTasks.find((entry) => entry.id === id);
  const unresolved = contentPack.unresolvedRequirements.filter((entry) => entry.affectedTaskIds.includes(id));
  return frame(<><header className="rm-section-heading"><div><p className="eyebrow">Editable draft task</p><h2>{task.id} — {task.title}</h2></div><StatusPill state={unresolved.length ? "blocked" : "warning"}>Unpublished draft</StatusPill></header><section className="rm-card rm-form"><dl className="rm-evidence"><div><dt>Type</dt><dd>{task.taskType}</dd></div><div><dt>Criticality</dt><dd>{task.criticality}</dd></div><div><dt>Assessment</dt><dd>{task.initialAssessmentPolicy}</dd></div><div><dt>Verification</dt><dd>{task.verificationPolicy}</dd></div><div><dt>Repeat</dt><dd>{task.repeatPolicy}</dd></div><div><dt>Location</dt><dd>{task.locationSetKey || task.locationKey || task.locationDescription}</dd></div></dl><h3>Employee instruction</h3><p>{task.instructions}</p><h3>Structured items</h3><div className="rm-list">{task.items.map((item) => <div className="rm-list-row" key={item.key}><span><strong>{item.key}</strong><small>{item.label} · {item.sourceKind}{item.standardKey ? ` · ${item.standardKey}` : ""}</small></span></div>)}</div><h3>Done criteria</h3><p className="rm-note">{task.doneCriteriaText}</p>{Object.keys(task.timing).length ? <><h3>Server timing</h3><pre className="rm-json">{JSON.stringify(task.timing, null, 2)}</pre></> : null}{unresolved.length ? <div className="rm-conflict"><h3>Publication blockers</h3><ul className="rm-issues rm-blockers">{unresolved.map((entry) => <li key={entry.standardKey}>{entry.label}</li>)}</ul></div> : null}</section></>);
}

function TemplateOverview({ routineKey }) {
  const routine = contentPack[routineKey];
  return frame(<><header className="rm-section-heading"><div><p className="eyebrow">Installed editable draft</p><h2>{routine.name}</h2></div><StatusPill state="warning">Draft · unpublished</StatusPill></header>{routine.sections.map((section) => <section className="rm-card" key={section.key}><header><h3>{section.title}</h3><strong>{routine.tasks.filter((task) => task.sectionKey === section.key).length} tasks</strong></header><ol>{routine.tasks.filter((task) => task.sectionKey === section.key).map((task) => <li key={task.id}>{task.id} — {task.title}</li>)}</ol></section>)}</>);
}

function ReferenceCards({ keys = contentPack.references.map((reference) => reference.key) }) {
  return frame(<><header className="rm-section-heading"><div><p className="eyebrow">Logical references</p><h2>Immutable placeholder versions</h2></div><StatusPill state="warning">Image optional</StatusPill></header><div className="rm-readiness-grid">{contentPack.references.filter((reference) => keys.includes(reference.key)).map((reference) => <article className="rm-card" key={reference.key}><h3>{reference.label}</h3><div className="rm-placeholder">{reference.placeholderText}</div><p><code>{reference.key}</code></p><button type="button" className="ghost-button">{reference.buttonLabel}</button></article>)}</div></>);
}

function Relations({ dependencies = false }) {
  const entries = dependencies ? [...contentPack.opening.dependencies, ...contentPack.closing.dependencies].filter((entry) => entry.dependencyType === "complete_predecessor_on_successor") : [...contentPack.opening.relations, ...contentPack.closing.relations];
  return frame(<section className="rm-card"><header><h2>{dependencies ? "Continuous completion dependencies" : "Cross-run and delivery relations"}</h2><StatusPill state="ready">{entries.length} declarative</StatusPill></header><div className="rm-table-wrap"><table><thead><tr><th>Source</th><th>Type</th><th>Target</th><th>Evidence</th></tr></thead><tbody>{entries.map((entry, index) => <tr key={index}><td>{entry.sourceTaskId || entry.predecessorTaskId}</td><td>{entry.relationType || entry.dependencyType}</td><td>{entry.targetTaskId || entry.successorTaskId}</td><td>{entry.metadata?.evidenceItemKeys?.join(", ") || "Server state"}</td></tr>)}</tbody></table></div></section>);
}

function Readiness() { return frame(<section className="rm-card"><header><h2>Operational content readiness</h2><StatusPill state="blocked">Blocked</StatusPill></header><ul className="rm-issues rm-blockers">{contentPack.unresolvedRequirements.map((entry) => <li key={entry.standardKey}>{entry.label}</li>)}</ul><dl className="rm-evidence"><div><dt>Opening</dt><dd>Draft 37/37</dd></div><div><dt>Closing</dt><dd>Draft 46/46</dd></div><div><dt>Double Shift</dt><dd>4 system steps</dd></div><div><dt>Published</dt><dd>No</dd></div></dl></section>); }
function NoInstaller({ shared = false }) { return frame(<section className="routine-state-card"><p className="eyebrow">{shared ? "Shared-device operator" : "Personal staff"}</p><h2>Manager content installation is unavailable</h2><p>Only an active, personal manager can preview or install editable operational content.</p></section>); }
function ProjectRooms() { const set = contentPack.locationSets.find((entry) => entry.key === "opening-project-rooms"); return frame(<section className="rm-card"><header><h2>Project-room route</h2><StatusPill state="ready">6 exact rooms</StatusPill></header><ol>{set.members.map((key) => <li key={key}>{contentPack.locations.find((location) => location.key === key).name}</li>)}</ol><p className="rm-note">Room 005 is not generated.</p></section>); }
function DoubleShift() { return frame(<section className="rm-card"><header><h2>Double Shift bundle copy</h2><StatusPill state="ready">4/4 system steps</StatusPill></header><ol>{contentPack.doubleShiftSteps.map((step) => <li key={step.id}><strong>{step.id} — {step.title}</strong><p>{step.stepKey}{step.systemGenerated ? " · system-generated" : ""}</p></li>)}</ol><p className="rm-note">No third template and no copied Opening or Closing tasks.</p></section>); }

const taskScenarios = { "o13-task": "O13", "o15-blocker": "O15", "o29-timing": "O29", "o35-deadline": "O35", "c27-serviceware": "C27", "c28-fridge-delivery": "C28", "c32-overnight": "C32", "c42-door-items": "C42", "c45-verification": "C45", "c46-final-gate": "C46" };
function App() {
  if (taskScenarios[scenario]) return <TaskCard id={taskScenarios[scenario]} />;
  if (scenario === "opening-draft-overview") return <TemplateOverview routineKey="opening" />;
  if (scenario === "closing-draft-overview") return <TemplateOverview routineKey="closing" />;
  if (scenario === "double-shift-steps") return <DoubleShift />;
  if (scenario === "reference-placeholders") return <ReferenceCards />;
  if (scenario === "self-service-opening-reference") return <ReferenceCards keys={["self-service-opening-standard"]} />;
  if (scenario === "self-service-overnight-reference") return <ReferenceCards keys={["self-service-overnight-standard"]} />;
  if (scenario === "project-rooms") return <ProjectRooms />;
  if (scenario === "delivery-relations") return <Relations />;
  if (scenario === "continuous-dependencies") return <Relations dependencies />;
  if (scenario === "readiness-blocked" || scenario === "drafts-unpublished") return <Readiness />;
  if (scenario === "staff-no-installer") return <NoInstaller />;
  if (scenario === "shared-no-installer") return <NoInstaller shared />;
  if (scenario === "stale-preserved") return <ContentManager failure="stale" />;
  if (scenario === "network-preserved") return <ContentManager failure="network" />;
  if (scenario === "install-success") return <ContentManager />;
  if (scenario === "installed-pack" || scenario === "pack-hash-counts") return <ContentManager alreadyInstalled />;
  if (scenario === "legacy-back-navigation") return frame(<section className="rm-card"><h2>Legacy navigation preserved</h2><button type="button" className="primary-button">Back to shift log</button></section>);
  return <ContentManager />;
}

createRoot(document.getElementById("root")).render(<App />);
