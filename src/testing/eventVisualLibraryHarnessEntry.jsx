import React from "react";
import { createRoot } from "react-dom/client";
import EventVisualGuideModal from "../components/EventVisualGuideModal.jsx";
import { eventRigGuides, eventVisualAngles } from "../data/eventRigGuides.js";
import RoutineReferenceManager from "../features/routines-v2/manager/RoutineReferenceManager.jsx";
import "../styles.css";
import "../design-system/MeshExperienceSystem.css";
import "../features/routines-v2/manager/RoutineManager.css";
import "../experience/RoutineStudioExperience.css";
import "../experience/VisualStandardsExperience.css";

const references = eventVisualAngles.map((angle, index) => ({
  id: `fixture-${index}`,
  stableKey: angle.stableKey,
  referenceKey: angle.stableKey,
  label: angle.label,
  description: angle.operationalDescription,
  placeholderText: angle.placeholderText,
  revision: 1,
  active: true,
  current: { state: "placeholder" },
  state: "placeholder",
  versions: [],
}));

const referenceLoader = async () => ({ references, usage: [] });
const referenceUploader = async () => ({ ok: false, message: "Uploads are disabled in the release harness." });
const scenario = new URLSearchParams(window.location.search).get("scenario") || "atrium";

function guide(key) {
  return eventRigGuides.find((item) => item.key === key);
}

function Harness() {
  if (scenario === "manager") {
    return (
      <main className="rm-workspace rm-experience-workspace">
        <RoutineReferenceManager loader={referenceLoader} uploader={referenceUploader} />
      </main>
    );
  }
  const guideByScenario = {
    atrium: guide("atrium-cafe-default"),
    cornerbar: guide("cornerbar-default-restore"),
    workbar: guide("workbar-conference-setup"),
    error: guide("atrium-stage-tech-default"),
  };
  const selected = guideByScenario[scenario] || guideByScenario.atrium;
  return (
    <main>
      <button type="button" id="return-focus">Open visual guide</button>
      <EventVisualGuideModal
        guide={selected}
        references={references}
        error={scenario === "error" ? "The current image service is unavailable." : ""}
        onClose={() => { document.body.dataset.closed = "true"; }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
