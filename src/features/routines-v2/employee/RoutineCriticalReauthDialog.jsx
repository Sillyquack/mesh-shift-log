import { useState } from "react";
import { useRoutineCriticalReauth } from "../hooks/useRoutineCriticalReauth.js";
import RoutineDialogSurface from "./RoutineDialogSurface.jsx";

export default function RoutineCriticalReauthDialog({ reason = "This critical action needs a fresh operator credential.", onClose, onAuthenticated, api }) {
  const auth = useRoutineCriticalReauth({ api }); const [pin, setPin] = useState("");
  const submit = async () => {
    try { const response = await auth.reauthenticate(pin); if (response?.ok) await onAuthenticated?.(); }
    finally { setPin(""); }
  };
  return <RoutineDialogSurface title="Operator reauthentication required" description={reason} onClose={onClose}>
    <p>Enter your personal operator PIN again. It is sent only to the session endpoint and is never stored.</p>
    <label>Operator PIN<input autoComplete="off" inputMode="numeric" pattern="[0-9]*" type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} /></label>
    <p aria-live="assertive">{auth.error}{auth.lockout ? ` Locked until ${new Date(auth.lockout).toLocaleTimeString()}.` : ""}</p>
    <div className="employee-dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="employee-primary" disabled={auth.pending || pin.length < 6} onClick={submit}>Reauthenticate and continue</button></div>
  </RoutineDialogSurface>;
}
