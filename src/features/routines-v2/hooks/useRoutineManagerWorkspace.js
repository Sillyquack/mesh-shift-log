import { useCallback, useEffect, useState } from "react";
import { getRoutineManagerControlCenter } from "../api/routineManagerClient.js";
import { normalizeManagerWorkspace } from "../data/routineManagerModel.js";
export function useRoutineManagerWorkspace({ loader = getRoutineManagerControlCenter } = {}) {
  const [state,setState]=useState({status:"loading",data:null,error:null});
  const refresh=useCallback(async()=>{ setState((s)=>({...s,status:"loading",error:null})); try { setState({status:"ready",data:normalizeManagerWorkspace(await loader()),error:null}); } catch(error){ setState((s)=>({...s,status:"error",error})); } },[loader]);
  useEffect(()=>{ refresh(); },[refresh]);
  return {...state,refresh,setData:(updater)=>setState((s)=>({...s,data:typeof updater==="function"?updater(s.data):updater}))};
}
