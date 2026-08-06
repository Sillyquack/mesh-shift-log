import { useCallback, useEffect, useMemo, useState } from "react";
import { getRoutineTemplateEditorWorkspace } from "../api/routineManagerClient.js";
import { classifyManagerError, managerErrorMessage } from "../data/routineManagerModel.js";
export function useRoutineTemplateEditor({ templateId, versionId, loader=getRoutineTemplateEditorWorkspace }) {
  const [server,setServer]=useState(null),[draft,setDraft]=useState(null),[status,setStatus]=useState("loading"),[conflict,setConflict]=useState(null);
  const load=useCallback(async({preserve=true}={})=>{ setStatus("loading"); try { const next=await loader(templateId,versionId); setServer(next); if(!preserve||!draft) setDraft(next); setStatus("ready"); return next; } catch(error){ const kind=classifyManagerError(error); setConflict({kind,message:managerErrorMessage(kind),error,local:draft,server}); setStatus("error"); return null; } },[draft,loader,server,templateId,versionId]);
  useEffect(()=>{ setDraft(null); load({preserve:false}); },[templateId,versionId]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty=useMemo(()=>Boolean(server&&draft&&JSON.stringify(server)!==JSON.stringify(draft)),[server,draft]);
  useEffect(()=>{ if(!dirty)return undefined; const warn=(event)=>{event.preventDefault();event.returnValue="";}; addEventListener("beforeunload",warn); return()=>removeEventListener("beforeunload",warn); },[dirty]);
  const runMutation=useCallback(async(action)=>{ setStatus("saving"); try { const result=await action(); setConflict(null); await load({preserve:false}); return result; } catch(error){ const kind=classifyManagerError(error); setConflict({kind,message:managerErrorMessage(kind),error,local:draft,server}); setStatus("error"); return null; } },[draft,load,server]);
  return {server,draft,setDraft,status,dirty,conflict,refresh:()=>load({preserve:true}),keepLocal:()=>setConflict(null),discardLocal:()=>{setDraft(server);setConflict(null);},runMutation};
}
