import { useCallback, useEffect, useState } from "react";
import { getRoutineReferenceManagerWorkspace } from "../api/routineManagerClient.js";
import { uploadRoutineReferenceImage } from "../api/routineReferenceClient.js";
export function useRoutineReferenceManager({loader=getRoutineReferenceManagerWorkspace,uploader=uploadRoutineReferenceImage}={}) {
  const [state,setState]=useState({status:"loading",data:{references:[],usage:[]},error:null,progress:0});
  const refresh=useCallback(async()=>{try{setState((s)=>({...s,status:"loading"}));const data=await loader();setState({status:"ready",data,error:null,progress:0});}catch(error){setState((s)=>({...s,status:"error",error}));}},[loader]);
  useEffect(()=>{refresh();},[refresh]);
  const upload=useCallback(async(payload)=>{setState((s)=>({...s,status:"uploading",progress:15}));try{const result=await uploader(payload);setState((s)=>({...s,status:result.ok?"ready":"error",progress:result.ok?100:0,error:result.ok?null:result}));if(result.ok)await refresh();return result;}catch(error){setState((current)=>({...current,status:"error",progress:0,error}));return {ok:false,error,message:"Upload failed; the previous image remains active."};}},[refresh,uploader]);
  return {...state,refresh,upload};
}
