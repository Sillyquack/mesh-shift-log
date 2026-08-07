import { useEffect, useRef } from "react";
import RoutineDialogSurface from "./RoutineDialogSurface.jsx";

export default function RoutineReferenceViewer({ reference, source, onClose }) {
  const image = useRef(null);
  useEffect(() => { image.current?.focus(); }, []);
  return <RoutineDialogSurface title={reference.caption ?? "Reference image"} description={reference.altText ?? "Pinned task reference"} onClose={onClose} className="employee-image-dialog">
    <div className="employee-image-stage"><img ref={image} tabIndex="0" src={source} alt={reference.altText ?? reference.caption ?? "Task reference"} /></div>
    <p>Use browser zoom or pinch to inspect the pinned image version.</p></RoutineDialogSurface>;
}
