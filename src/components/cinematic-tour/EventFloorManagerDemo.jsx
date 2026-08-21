import CinematicTour from "./CinematicTour.jsx";
import { julieEventDemo } from "../../data/julieEventDemo.js";
import "./cinematicTour.css";

function capabilityClass(capability) {
  if (capability === "PROPOSED NEXT") return "is-proposed";
  if (capability === "PARTIAL / PILOT") return "is-pilot";
  return "is-live";
}

function CapabilityBadge({ capability, label }) {
  return (
    <span className={`ct-capability ${capabilityClass(capability)}`}>
      <i aria-hidden="true" />
      {label || capability}
    </span>
  );
}

function SceneFrame({ chapter, children, aside, className = "" }) {
  return (
    <article className={`ct-scene ${className}`}>
      <div className="ct-scene-heading">
        <div>
          <p className="ct-kicker">{chapter.number} / {chapter.label}</p>
          <h1>{chapter.title}</h1>
          <p>{chapter.uiSummary}</p>
        </div>
        <CapabilityBadge capability={chapter.capability} />
      </div>
      <div className="ct-scene-body">{children}</div>
      {aside}
    </article>
  );
}

function StatusMark({ done = false, alert = false }) {
  return <span className={`ct-status-mark${done ? " is-done" : ""}${alert ? " is-alert" : ""}`} aria-hidden="true">{done ? "✓" : alert ? "!" : ""}</span>;
}

function EventHeader() {
  const { event } = julieEventDemo;
  return (
    <div className="ct-event-heading">
      <div>
        <span>DEMO SCENARIO · TODAY</span>
        <strong>{event.title}</strong>
      </div>
      <p>{event.venue}<br />{event.window} · {event.guests} guests</p>
    </div>
  );
}

function OpeningScene({ chapter, progress }) {
  const signals = [
    ["READY", "Setup", progress > 0.18],
    ["OWNED", "Responsibilities", progress > 0.38],
    ["LIVE", "Event state", progress > 0.58],
    ["NEXT", "Operational cue", progress > 0.76],
  ];
  return (
    <SceneFrame chapter={chapter} className="ct-opening-scene">
      <div className="ct-opening-visual" aria-label="Event plan becoming a live operational view">
        <div className="ct-plan-document">
          <span>EVENT PLAN</span>
          <i /><i /><i /><i />
        </div>
        <div className="ct-plan-route" aria-hidden="true"><span /></div>
        <div className="ct-live-board">
          <div className="ct-live-board-top"><span><i /> LIVE</span><small>18:04</small></div>
          <strong>Nordic Leadership Forum</strong>
          <div className="ct-live-signal-grid">
            {signals.map(([value, label, active]) => (
              <div key={value} className={active ? "is-active" : ""}>
                <small>{label}</small><span>{active ? value : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}

function ReadinessScene({ chapter, progress }) {
  const tasks = [
    "Room setup matches event plan",
    "Tech and microphone tested",
    "Bar and fridge restock confirmed",
    "Coffee and self-service station ready",
    "Allergy information visible",
    "Host contact and arrival confirmed",
    "Critical doors-open check",
  ];
  const completeCount = Math.min(tasks.length, 3 + Math.floor(progress * 5));
  const readiness = Math.min(100, 62 + completeCount * 5 + (completeCount === tasks.length ? 3 : 0));
  return (
    <SceneFrame chapter={chapter}>
      <div className="ct-app-frame ct-readiness-frame">
        <EventHeader />
        <div className="ct-readiness-layout">
          <div className="ct-readiness-score">
            <div className="ct-ring" style={{ "--ct-score": `${readiness * 3.6}deg` }}><strong>{readiness}%</strong><span>Ready</span></div>
            <div><span>DOORS</span><strong>18:30</strong><small>{tasks.length - completeCount ? `${tasks.length - completeCount} checks remain` : "All checks confirmed"}</small></div>
          </div>
          <div className="ct-task-list">
            {tasks.map((task, index) => {
              const done = index < completeCount;
              const critical = index === tasks.length - 1;
              return (
                <div key={task} className={`${done ? "is-done" : ""}${critical ? " is-critical" : ""}`}>
                  <StatusMark done={done} />
                  <span>{task}</span>
                  <small>{done ? "Confirmed" : critical ? "Critical · Julie" : "Due before doors"}</small>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}

function StandardsScene({ chapter, progress }) {
  const activeIndex = Math.min(julieEventDemo.standards.length - 1, Math.floor(progress * julieEventDemo.standards.length));
  const active = julieEventDemo.standards[activeIndex];
  return (
    <SceneFrame chapter={chapter}>
      <div className="ct-app-frame ct-standard-frame">
        <div className="ct-standard-nav" aria-label="Example visual standards">
          {julieEventDemo.standards.map((standard, index) => (
            <div key={standard.id} className={index === activeIndex ? "is-active" : ""}>
              <span>0{index + 1}</span><strong>{standard.title}</strong>
            </div>
          ))}
        </div>
        <div key={active.id} className="ct-standard-detail">
          <div className="ct-standard-copy">
            <span>POINT-OF-WORK INSTRUCTION</span>
            <h2>{active.title}</h2>
            <p>{active.detail}</p>
            <ul>
              <li><StatusMark done /> Clean and reset before restocking</li>
              <li><StatusMark done /> Match placement, labels and quantities</li>
              <li><StatusMark /> Note exceptions before confirming</li>
            </ul>
          </div>
          <div className="ct-reference-placeholder" role="img" aria-label={active.referenceLabel}>
            <span className="ct-reference-grid" aria-hidden="true"><i /><i /><i /><i /></span>
            <strong>{active.referenceLabel}</strong>
            <small>Approved photo can replace this placeholder</small>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}

function OwnershipScene({ chapter, progress }) {
  const highlighted = Math.min(julieEventDemo.responsibilities.length, Math.floor(progress * 8));
  return (
    <SceneFrame chapter={chapter}>
      <div className="ct-app-frame ct-ownership-frame">
        <div className="ct-lead-card">
          <span className="ct-avatar is-large">JU</span>
          <div><span>EVENT RESPONSIBLE</span><strong>Julie leads this event</strong><small>Coordinates the whole floor</small></div>
        </div>
        <div className="ct-owner-connector" aria-hidden="true"><span /></div>
        <div className="ct-owner-grid">
          {julieEventDemo.responsibilities.map((item, index) => (
            <div key={item.role} className={`${item.emphasis ? "is-julie" : ""}${index < highlighted ? " is-revealed" : ""}`}>
              <span className="ct-avatar">{item.initials}</span>
              <p><small>{item.role}</small><strong>{item.owner}</strong></p>
              <StatusMark done={index < highlighted} />
            </div>
          ))}
        </div>
        <p className="ct-callout"><i aria-hidden="true">↳</i> Leading the event assigns one responsibility—not all six.</p>
      </div>
    </SceneFrame>
  );
}

function LiveControlScene({ chapter, progress }) {
  const issueVisible = progress > 0.12;
  const issueAcknowledged = progress > 0.42;
  const issueResolved = progress > 0.76;
  const issueStatus = issueResolved ? "RESOLVED" : issueAcknowledged ? "ACKNOWLEDGED" : "NEW ISSUE";
  return (
    <SceneFrame chapter={chapter}>
      <div className="ct-app-frame ct-live-frame">
        <EventHeader />
        <div className="ct-live-strip">
          <div><span>NOW</span><strong>Guest arrival</strong><small>Julie · All zones</small></div>
          <div><span>NEXT</span><strong>{progress > 0.56 ? "Speech in 12 min" : "Speech in 18 min"}</strong><small>Stage · Tech cue follows</small></div>
          <div className={issueVisible && !issueResolved ? "has-risk" : ""}><span>AT RISK</span><strong>{issueVisible && !issueResolved ? "1 open" : "All clear"}</strong><small>Live operational exceptions</small></div>
        </div>
        <div className="ct-live-content">
          <div className="ct-mini-timeline">
            <span className="is-complete"><time>18:00</time><i />Doors open</span>
            <span className="is-active"><time>18:15</time><i />Guest arrival</span>
            <span className={progress > 0.56 ? "is-shifted" : ""}><time>{progress > 0.56 ? "18:42" : "18:36"}</time><i />Welcome speech <small>{progress > 0.56 ? "Updated +6 min" : "Next cue"}</small></span>
            <span><time>19:05</time><i />Service begins</span>
          </div>
          <div className={`ct-issue-card${issueVisible ? " is-visible" : ""}${issueResolved ? " is-resolved" : ""}`}>
            <div><span className="ct-alert-icon">!</span><p><small>WORKBAR · TECHNICAL</small><strong>Presenter adapter is missing</strong></p><em>{issueStatus}</em></div>
            <p>{issueResolved ? "Adapter delivered. Speech cue updated and Julie notified." : "Owner: Mircea · Needed before welcome speech"}</p>
            {issueAcknowledged && <small className="ct-context-line">Context follows the event → timeline · owner · handover</small>}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}

function FinancialScene({ chapter, progress }) {
  const steps = ["Customer / table checked", "All sales punched", "Invoice report prepared", "Settlement completed"];
  const complete = Math.min(steps.length, 1 + Math.floor(progress * 5));
  const signed = progress > 0.74;
  return (
    <SceneFrame chapter={chapter}>
      <div className="ct-app-frame ct-financial-frame">
        <div className="ct-financial-heading">
          <div><span>CASH / INVOICE</span><h2>Event settlement</h2><p>Responsible: Rebekka</p></div>
          <span className={`ct-state-pill${signed ? " is-complete" : ""}`}>{signed ? "SIGNED OFF" : "IN PROGRESS"}</span>
        </div>
        <div className="ct-financial-steps">
          {steps.map((step, index) => <div key={step} className={index < complete ? "is-done" : ""}><StatusMark done={index < complete} /><span>{step}</span><small>{index < complete ? "Confirmed" : "Open"}</small></div>)}
        </div>
        <div className={`ct-signature${signed ? " is-signed" : ""}`}>
          <span>{signed ? "Rebekka" : "Responsible sign-off"}</span><i /><small>{signed ? "22:18 · recorded" : "Available after settlement"}</small>
        </div>
      </div>
    </SceneFrame>
  );
}

function AssetsScene({ chapter, progress }) {
  const attention = progress > 0.14;
  const assigned = progress > 0.62;
  const assets = [
    { name: "Terminal YG-01", place: "Atrium bar", state: "Ready", serial: "···4821" },
    { name: "Terminal YG-02", place: "Cornerbar", state: "Ready", serial: "···7754" },
    { name: "POS iPad 03", place: attention ? "Expected: Workbar" : "Workbar", state: attention ? "Wrong location" : "Ready", serial: "···1093", issue: attention },
    { name: "POS iPad 04", place: "Charging cabinet", state: "Charging", serial: "···6288" },
  ];
  return (
    <SceneFrame chapter={chapter}>
      <div className="ct-app-frame ct-assets-frame">
        <div className="ct-assets-heading"><div><span>EVENT ASSETS</span><h2>4 required devices</h2></div><strong className={attention ? "has-attention" : ""}>{attention ? "1 NEEDS ATTENTION" : "ALL CHECKED"}</strong></div>
        <div className="ct-asset-list">
          {assets.map((asset) => (
            <div key={asset.name} className={asset.issue ? "needs-attention" : ""}>
              <span className="ct-device-icon" aria-hidden="true"><i /></span>
              <p><strong>{asset.name}</strong><span>{asset.place}</span><small>Serial {asset.serial}</small></p>
              <div><em>{asset.state}</em><small>{asset.issue ? "Location" : asset.state === "Charging" ? "82%" : "Present · condition OK"}</small></div>
            </div>
          ))}
        </div>
        <div className={`ct-asset-action${assigned ? " is-visible" : ""}`}><span>Action assigned</span><strong>Mircea · Return POS iPad 03 to Workbar</strong><small>Before settlement · serial verified</small></div>
      </div>
    </SceneFrame>
  );
}

function CloseoutScene({ chapter, progress }) {
  const tasks = ["Client goodbye", "Sales complete", "Settlement signed", "Assets checked", "Venue reset", "Waste handled", "Handover written", "Lock / alarm confirmed"];
  const complete = Math.min(tasks.length, Math.floor(progress * 10));
  const closed = complete === tasks.length;
  return (
    <SceneFrame chapter={chapter} className={closed ? "ct-is-closed" : ""}>
      <div className="ct-app-frame ct-closeout-frame">
        <div className="ct-closeout-state">
          <div className="ct-closeout-orbit"><span>{closed ? "✓" : `${complete}/${tasks.length}`}</span></div>
          <div><span>EVENT CLOSEOUT</span><h2>{closed ? "Event closed" : "Finishing with certainty"}</h2><p>{closed ? "Completed 22:34 · Julie" : `${tasks.length - complete} confirmations remain`}</p></div>
        </div>
        <div className="ct-closeout-grid">
          {tasks.map((task, index) => <div key={task} className={index < complete ? "is-done" : ""}><StatusMark done={index < complete} /><span>{task}</span></div>)}
        </div>
        <div className={`ct-closeout-confirmation${closed ? " is-visible" : ""}`}><strong>Nothing critical left open.</strong><span>History and handover remain available.</span></div>
      </div>
    </SceneFrame>
  );
}

function ManagementScene({ chapter, progress }) {
  const visible = Math.floor(progress * 8);
  const metrics = [
    ["EVENT", "Closed", "100%"],
    ["CRITICAL", "0 open", "Clear"],
    ["HANDOVER", "Recorded", "22:31"],
    ["ASSETS", "1 resolved", "History"],
  ];
  return (
    <SceneFrame chapter={chapter}>
      <div className="ct-app-frame ct-management-frame">
        <div className="ct-management-top"><div><span>MANAGEMENT VIEW</span><h2>Youngs · live operations</h2></div><span className="ct-live-label"><i /> LIVE VIEW</span></div>
        <div className="ct-management-metrics">
          {metrics.map(([label, value, note], index) => <div key={label} className={index < visible ? "is-visible" : ""}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
        </div>
        <div className="ct-management-lower">
          <div className="ct-management-list"><span>OPERATIONAL RECORD</span>{["Julie confirmed event closeout", "Rebekka signed settlement", "Asset exception resolved by Mircea", "Handover recorded for opening team"].map((item, index) => <p key={item} className={index + 3 < visible ? "is-visible" : ""}><StatusMark done /><span>{item}</span><small>{["22:34", "22:18", "22:12", "22:31"][index]}</small></p>)}</div>
          <div className="ct-interruption-card"><span>MANAGEMENT INTERRUPTIONS</span><strong>{progress > 0.66 ? "Fewer" : "↓"}</strong><p>The status is already visible.</p></div>
        </div>
      </div>
    </SceneFrame>
  );
}

function RunbookScene({ chapter, progress }) {
  const phases = julieEventDemo.runbookPhases;
  const activeIndex = Math.min(phases.length - 1, Math.floor(progress * phases.length));
  const activePhase = phases[activeIndex];
  const phaseTimes = ["15:30", "16:00", "17:45", "18:00", "18:20", "19:10", "19:13", "19:40", "20:10", "21:45", "22:00", "22:15", "22:30"];
  return (
    <SceneFrame chapter={chapter} className="ct-runbook-scene">
      <div className="ct-app-frame ct-runbook-frame">
        <div className="ct-runbook-heading">
          <div><span>LIVE KJØREPLAN</span><h2>{julieEventDemo.event.title}</h2></div>
          <CapabilityBadge capability="PROPOSED NEXT" label="PLANNED CAPABILITY" />
        </div>
        <div className="ct-runbook-content">
          <div className="ct-runbook-timeline">
            {phases.map((phase, index) => (
              <div key={phase} className={`${index < activeIndex ? "is-complete" : ""}${index === activeIndex ? " is-active" : ""}`}>
                <time>{phaseTimes[index]}</time><i /><span>{phase}</span>
              </div>
            ))}
          </div>
          <div key={activePhase} className="ct-runbook-detail">
            <div className="ct-runbook-detail-top"><span>ACTIVE CUE</span><em>{activeIndex === 6 ? "CRITICAL" : activeIndex === 8 ? "CHANGED LIVE" : "ON PLAN"}</em></div>
            <h3>{activePhase}</h3>
            <dl>
              <div><dt>Exact time</dt><dd>{phaseTimes[activeIndex]}</dd></div>
              <div><dt>Owner</dt><dd>{activeIndex > 9 ? "Ivana" : activeIndex === 6 ? "Mircea" : "Julie"}</dd></div>
              <div><dt>Role</dt><dd>{activeIndex === 6 ? "Tech support" : activeIndex > 9 ? "Closing responsible" : "Event responsible"}</dd></div>
              <div><dt>Dependency</dt><dd>{activeIndex ? phases[activeIndex - 1] : "Event brief"}</dd></div>
              <div><dt>Status</dt><dd>{activeIndex === 8 ? "Changed +10 min" : activeIndex === 6 ? "Critical cue" : "Ready"}</dd></div>
              <div><dt>Reference</dt><dd>Notes · setup photo · attachment</dd></div>
            </dl>
            <div className="ct-runbook-tags"><span>Live changes</span><span>Blocked / late</span><span>Handover</span><span>Escalation</span></div>
          </div>
        </div>
        <div className="ct-runbook-foundation"><span>CURRENT FOUNDATION</span><p>Unified run-of-show · timed tasks · owners · live updates · handovers</p><i aria-hidden="true">→</i><span>NEXT STEP</span><p>Document-complete event plan operated live</p></div>
      </div>
    </SceneFrame>
  );
}

function FinalScene({ chapter, replay, exit }) {
  return (
    <SceneFrame chapter={chapter} className="ct-final-scene">
      <div className="ct-final-content">
        <div className="ct-final-mark" aria-hidden="true"><span /><i>✓</i></div>
        <p>Preparation → live control → verified closeout</p>
        <div className="ct-final-actions">
          <button type="button" className="ct-primary-action" onClick={exit}>Enter Event Floor Manager <span aria-hidden="true">→</span></button>
          <button type="button" className="ct-secondary-action" onClick={replay}>Replay the event</button>
        </div>
        <small>Demo state is isolated. No operational records were changed.</small>
      </div>
    </SceneFrame>
  );
}

function renderJulieScene({ chapter, chapterProgress, replay, exit }) {
  const props = { chapter, progress: chapterProgress, replay, exit };
  switch (chapter.scene) {
    case "readiness": return <ReadinessScene {...props} />;
    case "standards": return <StandardsScene {...props} />;
    case "ownership": return <OwnershipScene {...props} />;
    case "live-control": return <LiveControlScene {...props} />;
    case "financial": return <FinancialScene {...props} />;
    case "assets": return <AssetsScene {...props} />;
    case "closeout": return <CloseoutScene {...props} />;
    case "management": return <ManagementScene {...props} />;
    case "runbook": return <RunbookScene {...props} />;
    case "final": return <FinalScene {...props} />;
    default: return <OpeningScene {...props} />;
  }
}

export default function EventFloorManagerDemo({ onExit }) {
  return (
    <CinematicTour
      tour={julieEventDemo}
      renderScene={renderJulieScene}
      onExit={onExit}
    />
  );
}
