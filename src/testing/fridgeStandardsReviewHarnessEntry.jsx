import React from "react";
import { createRoot } from "react-dom/client";
import { fridgeReviewStandards } from "../data/fridgeOperationalStandards.js";
import "../styles.css";
import "../design-system/MeshExperienceSystem.css";
import "./fridgeStandardsReviewHarness.css";

const scenario = new URLSearchParams(window.location.search).get("scenario") || "milk-fridge";

const standardByScenario = Object.freeze({
  "milk-fridge": fridgeReviewStandards.workbarMilkFridge,
  "espresso-reservoirs": fridgeReviewStandards.espressoMachineMilkReservoirs,
  "cornerbar-saved-standard": fridgeReviewStandards.cornerbarSavedStandards,
  "workbar-non-alco-fridge": fridgeReviewStandards.workbarNonAlcoFridge,
});

function WorkbarMilkFridgeDetails({ standard }) {
  return (
    <>
      <section aria-labelledby="top-shelf-heading">
        <p className="fridge-review-kicker">Permanent top shelf</p>
        <h2 id="top-shelf-heading">Exactly 2 regular milk + 2 Oatly</h2>
        <p>The reserve refills the espresso-machine milk reservoirs and the self-service milk jug.</p>
      </section>
      <section aria-labelledby="lower-shelves-heading">
        <p className="fridge-review-kicker">Permanent lower shelves</p>
        <h2 id="lower-shelves-heading">Opened, visibly date-labelled wine only</h2>
        <p>No extra milk, unopened wine, beer, soft drinks, food, event products, temporary storage or unlabelled bottles.</p>
      </section>
      <section aria-labelledby="done-heading">
        <p className="fridge-review-kicker">Done criteria</p>
        <h2 id="done-heading">The complete refrigerator must comply</h2>
        <ul>{standard.doneCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
      </section>
    </>
  );
}

function WorkbarNonAlcoFridgeDetails({ standard }) {
  return (
    <section aria-labelledby="non-alco-done-heading">
      <p className="fridge-review-kicker">Canonical physical location</p>
      <h2 id="non-alco-done-heading">One saved standard · one refrigerator</h2>
      <ul>{standard.doneCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
    </section>
  );
}

function StandardReview() {
  const standard = standardByScenario[scenario] || standardByScenario["milk-fridge"];
  const isMilkFridge = standard.key === fridgeReviewStandards.workbarMilkFridge.key;
  const isWorkbarNonAlcoFridge = standard.key === fridgeReviewStandards.workbarNonAlcoFridge.key;
  const instruction = standard.instruction || standard.mainInstruction;

  return (
    <main className="fridge-review-shell">
      <aside className="fridge-review-note" role="note">
        <strong>Review fixture · no backend writes</strong>
        <span>Organization-owned operational standard</span>
      </aside>
      <article className="fridge-review-card" data-standard-key={standard.key}>
        <header>
          <p className="fridge-review-kicker">Operations-approved standard</p>
          <h1>{standard.displayName}</h1>
          {standard.subtitle ? <p className="fridge-review-subtitle">{standard.subtitle}</p> : null}
        </header>
        <section className="fridge-review-instruction" aria-labelledby="instruction-heading">
          <p className="fridge-review-kicker">Current instruction</p>
          <h2 id="instruction-heading">Finish line</h2>
          <p>{instruction}</p>
        </section>
        {isMilkFridge ? <WorkbarMilkFridgeDetails standard={standard} /> : null}
        {isWorkbarNonAlcoFridge ? <WorkbarNonAlcoFridgeDetails standard={standard} /> : null}
        {standard.binding ? (
          <section aria-labelledby="runtime-heading">
            <p className="fridge-review-kicker">Runtime resolution</p>
            <h2 id="runtime-heading">Current manager-maintained location standards</h2>
            <p>{standard.binding.incompleteMessage}</p>
            <p>No Event or Closing product quantity is embedded in this fixture.</p>
          </section>
        ) : null}
        <footer>
          <strong>{isMilkFridge ? standard.provenance : standard.sourceStatus || "Operations-approved standard"}</strong>
          <span>{isMilkFridge ? "Image awaiting upload · written standard remains complete" : "Deterministic review-only fixture"}</span>
        </footer>
      </article>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<StandardReview />);
