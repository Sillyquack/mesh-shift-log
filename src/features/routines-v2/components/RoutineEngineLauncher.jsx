import { useRoutineApplicationBootstrap } from "../hooks/useRoutineApplicationBootstrap.js";
import { routineLauncherLabel, shouldShowRoutineEngineLauncher } from "../data/routineApplicationModel.js";
import "./RoutineEngineShell.css";

export default function RoutineEngineLauncher({ user, onOpen, loader }) {
  const eligibleAuth = user?.loginSource === "supabase_auth";
  const bootstrap = useRoutineApplicationBootstrap({ enabled: eligibleAuth, loader });
  if (!eligibleAuth || ["idle", "loading"].includes(bootstrap.status)) return null;
  if (bootstrap.status === "error") return (
    <aside className="routine-launcher routine-launcher-error" aria-live="polite">
      <div><strong>Routine Engine preview unavailable</strong><span>The current shift log remains available.</span></div>
      <button type="button" className="ghost-button" onClick={bootstrap.refresh}>Retry</button>
    </aside>
  );
  if (!shouldShowRoutineEngineLauncher(bootstrap.data)) return null;
  return (
    <aside className="routine-launcher">
      <div><span className="routine-launcher-kicker">Server-gated preview</span><strong>{routineLauncherLabel(bootstrap.data)}</strong>
        <span>{bootstrap.data.accessState === "operator_required" ? "Choose your operator identity to continue." : "Read-only foundation · legacy remains active."}</span></div>
      <button type="button" className="primary-button" onClick={onOpen}>Open preview</button>
    </aside>
  );
}
