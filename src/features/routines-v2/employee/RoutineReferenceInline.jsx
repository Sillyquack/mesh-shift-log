import { useEffect, useRef, useState } from "react";
import { downloadRoutineRunSnapshotImage } from "../api/routineEmployeeClient.js";
import RoutineReferenceViewer from "./RoutineReferenceViewer.jsx";

export default function RoutineReferenceInline({ reference, downloader = downloadRoutineRunSnapshotImage }) {
  const [open, setOpen] = useState(false); const [full, setFull] = useState(false); const [source, setSource] = useState(null); const [error, setError] = useState(null);
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { if (source?.startsWith("blob:")) URL.revokeObjectURL(source); }, [source]);
  const reveal = async () => {
    setOpen((value) => !value); if (source || reference.state !== "active_image") return;
    const response = await downloader(reference); if (!mounted.current) return;
    if (!response.ok) { setError("Reference image unavailable. You can continue the task."); return; }
    setSource(URL.createObjectURL(response.blob));
  };
  return <div className="employee-reference"><button type="button" className="employee-link-button" onClick={reveal}>{open ? "Hide reference" : "Show how it should look"}</button>
    {open && <div className="employee-reference-inline">{reference.state === "placeholder" ? <p>Reference image coming soon</p>
      : source ? <button type="button" className="employee-image-button" onClick={() => setFull(true)}><img loading="lazy" src={source} alt={reference.altText ?? reference.caption ?? "Task reference"} /><span>Open full screen</span></button>
        : error ? <p role="status">{error}</p> : <p role="status">Loading reference…</p>}{reference.caption && <small>{reference.caption}</small>}</div>}
    {full && source && <RoutineReferenceViewer reference={reference} source={source} onClose={() => setFull(false)} />}</div>;
}
