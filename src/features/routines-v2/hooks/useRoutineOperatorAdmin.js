import { useCallback, useEffect, useState } from "react";
import { getRoutineOperatorAdminWorkspace, routineOperatorAdmin } from "../api/routineOperatorClient.js";
export function useRoutineOperatorAdmin({loader=getRoutineOperatorAdminWorkspace,api=routineOperatorAdmin}={}) {
  const [state,setState]=useState({status:"loading",data:{devices:[],operators:[],access:[],credentials:[],sessions:[],lockouts:[]},error:null});
  const refresh=useCallback(async()=>{try{const result=await loader();setState(result.ok?{status:"ready",data:result.data,error:null}:{status:"error",data:null,error:result.error});return result;}catch(error){setState((current)=>({...current,status:"error",error}));return {ok:false,error};}},[loader]);
  useEffect(()=>{refresh();},[refresh]);
  const mutate=useCallback(async(method,payload)=>{setState((s)=>({...s,status:"saving"}));try{const result=await api[method](payload);if(result.ok)await refresh();else setState((s)=>({...s,status:"error",error:result.error}));return result;}catch(error){setState((current)=>({...current,status:"error",error}));return {ok:false,error};}},[api,refresh]);
  return {...state,refresh,mutate};
}
