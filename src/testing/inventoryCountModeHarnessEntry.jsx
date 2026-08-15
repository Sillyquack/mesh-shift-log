import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { StandardMatchPanel } from "../components/InventoryCounterExperience.jsx";
import "../styles.css";
import "../design-system/MeshExperienceSystem.css";
import "../components/InventoryCounterExperience.css";

const firstAssignment = {
  id: "count-review-cornerbar-fridge-1",
  location: { name: "Cornerbar Fridge 1", locationType: "fridge" },
};

const summary = {
  incomplete: [
    { id: "cola-cornerbar-1", standardQuantityExact: 12 },
    { id: "white-wine-cornerbar-1", standardQuantityExact: 8 },
  ],
  deviations: [],
  unsafeDrafts: [],
};

function Harness() {
  const [submitted, setSubmitted] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);

  return (
    <main className="counter-experience mesh-experience-shell" data-submit-count={submitCount}>
      <header className="mesh-experience-topbar">
        <span aria-hidden="true" />
        <div className="mesh-experience-brand">
          <span>COUNT MODE</span>
          <strong>Release review · no backend writes</strong>
        </div>
        <span aria-hidden="true" />
      </header>
      <div className="mesh-experience-content">
        {submitted ? (
          <section className="mesh-focus-card" aria-label="Next assigned fridge">
            <span className="mesh-section-label">Sent for manager review</span>
            <h1>Workbar Fridge 2 is next.</h1>
            <p>Only Cornerbar Fridge 1 was submitted. The next physical location is now ready to check.</p>
          </section>
        ) : (
          <StandardMatchPanel
            assignment={firstAssignment}
            summary={summary}
            busy={false}
            onApply={() => {
              setSubmitCount((count) => count + 1);
              setSubmitted(true);
            }}
            onManualCount={() => {}}
          />
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
