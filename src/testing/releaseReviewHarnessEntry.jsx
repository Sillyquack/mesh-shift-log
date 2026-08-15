import React from "react";
import { createRoot } from "react-dom/client";
import EventOperatorExperience from "../components/EventOperatorExperience.jsx";
import ProductionCandidateOrchestrator from "../experience/ProductionCandidateOrchestrator.jsx";
import "../styles.css";
import "../design-system/MeshExperienceSystem.css";
import "../components/EventOperatorExperience.css";
import "../experience/ProductionCandidateExperience.css";

const surface = new URLSearchParams(window.location.search).get("surface") || "manager";
const noop = () => {};

const eventOperation = {
  id: "release-review-event",
  title: "Monday community breakfast",
  venue: "Atrium",
  startsAt: "2026-08-17T05:00:00.000Z",
  endsAt: "2026-08-17T08:30:00.000Z",
  expectedGuests: 96,
};

const tasks = [
  { id: "prepare-room", title: "Restore the Atrium café layout", description: "Use the visual standard, then verify all walking routes.", phase: "prepare", zone: "main_floor", status: "done", dueAt: "2026-08-17T04:20:00.000Z", rigRef: "atrium-cafe-default" },
  { id: "welcome-client", title: "Meet the client and confirm the finish line", description: "Walk the room together before doors open.", phase: "welcome", zone: "entrance", status: "pending", dueAt: "2026-08-17T04:50:00.000Z" },
  { id: "service-check", title: "Refresh coffee, water and tea", description: "Record every new coffee placed out.", phase: "run", zone: "serving_zone", status: "pending", dueAt: "2026-08-17T06:00:00.000Z", rigRef: "coffee-water-tea" },
  { id: "final-reset", title: "Complete the final reset walk-through", description: "Leave every zone ready for the next team.", phase: "close", zone: "all", status: "pending", dueAt: "2026-08-17T08:40:00.000Z", rigRef: "atrium-cafe-default" },
];

const guides = [
  { id: "atrium-cafe-default", title: "Atrium Café / Default", checklist: ["Restore all six round tables and clear walking routes."] },
  { id: "coffee-water-tea", title: "Coffee / Water / Tea", checklist: ["Match guest count and record every new coffee."] },
];

function ManagerFixture() {
  window.localStorage.setItem("mesh-current-user-v1", JSON.stringify({ name: "Bobby Reviewer", role: "manager", isManager: true }));
  return (
    <>
      <ProductionCandidateOrchestrator />
      <main className="manager-page">
        <section className="intro"><p>Review fixture · no backend writes</p></section>
        <section><h2>Today&apos;s event board</h2><p>Atrium breakfast is prepared and ready for client arrival.</p></section>
        <section><h2>Needs attention</h2><p>One visual upload batch remains pending approval.</p></section>
        <section><h2>Shift progress</h2><p>Opening work is on schedule.</p></section>
        <section><h2>Visual Standards</h2><p>Review venue guides, zones, angles and upload readiness.</p></section>
        <section><h2>History</h2><p>Open immutable operational evidence.</p></section>
      </main>
    </>
  );
}

function EventFixture() {
  return (
    <EventOperatorExperience
      user={{ name: "Julie Bolid", role: "event_floor_manager" }}
      eventOperation={eventOperation}
      tasks={tasks}
      now="2026-08-17T04:48:00.000Z"
      openUpdates={[{ id: "review-update", title: "Client requested vegetarian labels", details: "Labels are with the serving team.", priority: "important", occurredAt: "2026-08-17T04:40:00.000Z" }]}
      guides={guides}
      onBack={noop}
      onRefresh={noop}
      onTaskStatus={async () => ({ ok: true })}
      onCreateLiveUpdate={async () => ({ ok: true })}
      onOpenGuide={noop}
    />
  );
}

createRoot(document.getElementById("root")).render(surface === "event" ? <EventFixture /> : <ManagerFixture />);
