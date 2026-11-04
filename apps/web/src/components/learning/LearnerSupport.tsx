"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PracticeNextResponse } from "@cogna/shared";
import { api } from "@/lib/api";
import { readRecovery, writeRecovery, recoveryKey } from "@/lib/learner-recovery";
type Identity = { source: "EXERCISE" | "LOTUS"; sessionId: string; questionId: string; questionVersion: number | null };
type Cycle = { offer: any; offerId: string; choiceId?: string; delivered?: boolean; pending?: any; paused?: boolean; hintAttempted?: boolean; unavailable?: boolean; rechecked?: boolean; checkAttempted?: boolean; message?: string };
export function LearnerSupport({ studentId, identity, onHint, onPause, onPracticeCheck }: { studentId: string; identity: Identity; onHint?: () => Promise<string | null>; onPause: (paused: boolean) => void; onPracticeCheck?: (next: PracticeNextResponse) => void | Promise<void> }) {
 const [cycle,setCycle]=useState<Cycle|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const current=useRef<Cycle|null>(null);
 const key=recoveryKey("SUPPORT",studentId,`${identity.source}:${identity.sessionId}:${identity.questionId}:${identity.questionVersion}`);
 function save(next:Cycle|null){current.current=next;setCycle(next);try{writeRecovery(key,next);}catch{setMessage("Keep this page open; local support recovery is unavailable.");}}
 useEffect(()=>{
  try{const saved=readRecovery<Cycle>(key);if(saved&&typeof saved.offerId==="string"&&(!saved.offer||Array.isArray(saved.offer.options)&&typeof saved.offer.message==="string")&&(!saved.pending||saved.pending.sessionId===identity.sessionId&&saved.pending.questionId===identity.questionId&&saved.pending.questionVersion===identity.questionVersion)){
    if(saved.hintAttempted&&!saved.delivered&&!saved.pending&&!saved.unavailable){saved.unavailable=true;saved.message="The earlier hint request has an unknown outcome. Continue or ask for support again.";}
    save(saved);if(saved.paused)onPause(true);
  }}catch{setMessage("Support recovery is unavailable.");}
  const offered=(event:Event)=>{const d=(event as CustomEvent).detail;if(d.sessionId===identity.sessionId&&d.questionId===identity.questionId&&d.receipt.offer&&!current.current?.choiceId&&!current.current?.pending)save({offer:d.receipt.offer,offerId:d.receipt.eventId});};
  const warning=()=>setMessage("Some viewing records were not confirmed. Reload the current question to restore its context.");
  window.addEventListener("cogna-presentation-warning",warning);
  window.addEventListener("cogna-support-offer",offered);return()=>{window.removeEventListener("cogna-support-offer",offered);window.removeEventListener("cogna-presentation-warning",warning);};
 },[key]);
 function request(kind:string,value:string,supportRef?:string,deliveryRef?:string){return{schemaVersion:1,eventId:crypto.randomUUID(),...identity,kind,value,...(supportRef?{supportRef}:{}),...(deliveryRef?{deliveryRef}:{})};}
 async function perform(body:any,base:Cycle|null=current.current){
  setBusy(true);setMessage("Saving…");
  const initial:Cycle={offer:base?.offer??null,offerId:base?.offerId??"",...base,pending:body};save(initial);
  let receipt;
  try{receipt=await api.recordLearnerObservation(body);}catch{setMessage("Not confirmed saved. Retry the same request.");setBusy(false);return;}
  let next:Cycle={...initial,pending:undefined};
  if(body.kind==="CHECK_IN")next={offer:receipt.offer,offerId:receipt.eventId,message:receipt.offer?undefined:"Your check-in is recorded. Keep going at your pace."};
  if(body.kind==="SUPPORT_CHOICE"){
   next.choiceId=receipt.eventId;
   if(body.value==="BREAK"){next.paused=true;onPause(true);}
   if(["KEEP_GOING","NOT_NEEDED"].includes(body.value))next={offer:null,offerId:"",message:"Your choice is saved. You can ask for support any time."};
  }
  if(body.kind==="SUPPORT_DELIVERED")next.delivered=true;
  if(body.kind==="SUPPORT_RECHECK")next={...next,rechecked:true,message:"Experience check saved. Mathematics results remain separate."};
  if(body.kind==="SUPPORT_CHECK"){
    next.checkAttempted=true;
    if(receipt.next){try{await onPracticeCheck?.(receipt.next);save({...next,pending:undefined});setMessage("Practice check confirmed.");}catch{save({...next,pending:body});setMessage("The check is saved but its current view needs confirmation. Retry to continue.");}setBusy(false);return;}
    next={...next,rechecked:true,message:"No suitable unseen reviewed question is available yet. Continue your existing work."};
  }
  save(next);setMessage("Saved.");setBusy(false);
  if(body.kind==="SUPPORT_CHOICE"&&body.value==="HINT"&&!next.hintAttempted){
   // Persist issuance stage before invoking help; delivery retries must never issue another hint.
   next={...next,hintAttempted:true};save(next);setBusy(true);
   const hintId=await onHint?.().catch(()=>null);
   if(!hintId){save({...next,unavailable:true});setMessage("Hint delivery was not confirmed. You can keep going or request support again.");setBusy(false);return;}
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   await perform(request("SUPPORT_DELIVERED","HINT",next.choiceId,hintId),next);
  }
 }
 function send(kind:string,value:string,ref?:string){if(!busy&&!current.current?.pending)void perform(request(kind,value,ref));}
 return <aside aria-label="Learning support" style={{border:"1px solid var(--line,#ccd8ce)",borderRadius:16,padding:16,marginTop:20}}>
  <p><strong>Your pace, your choice</strong> · <Link href="/student/learning-history">Your learning record</Link></p>
  {!cycle?.offer&&!cycle?.pending&&<div className="actions">{[["FRUSTRATED","I’m frustrated"],["CONFUSED","I’m confused"],["INTERRUPTED","I was interrupted"],["NOTEBOOK","I’m working in my notebook"]].map(([value,label])=><button className="btn btn-ghost" type="button" key={value} disabled={busy} onClick={()=>send("CHECK_IN",value)}>{label}</button>)}</div>}
  {cycle?.offer&&!cycle.choiceId&&!cycle.pending&&<div><p>{cycle.offer.message}</p><div className="actions">
   {onHint&&cycle.offer.options.includes("HINT")&&<button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>send("SUPPORT_CHOICE","HINT",cycle.offerId)}>A smaller step</button>}
   <button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>send("SUPPORT_CHOICE","BREAK",cycle.offerId)}>Pause</button>
   <button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>send("SUPPORT_CHOICE","KEEP_GOING",cycle.offerId)}>Keep going</button>
   <button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>send("SUPPORT_CHOICE","NOT_NEEDED",cycle.offerId)}>That’s not what I need</button>
  </div></div>}
  {cycle?.paused&&<div><p>Your work is paused and your draft stays here.</p><button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>{onPause(false);const resumed={...cycle,paused:false};save(resumed);void perform(request("SUPPORT_DELIVERED","BREAK",cycle.choiceId),resumed);}}>Resume my work</button></div>}
  {cycle?.unavailable&&<button className="btn btn-ghost" type="button" onClick={()=>save({offer:null,offerId:"",message:"You can continue or ask for support again."})}>Continue learning</button>}
  {cycle?.delivered&&!cycle.rechecked&&!cycle.paused&&!cycle.pending&&<div><p>Did that support help?</p>{["BETTER","SAME","WORSE"].map(value=><button className="btn btn-ghost" type="button" key={value} disabled={busy} onClick={()=>send("SUPPORT_RECHECK",value,cycle.choiceId)}>{value==="BETTER"?"It helped":value==="SAME"?"About the same":"Still difficult"}</button>)}</div>}
  {cycle?.delivered&&!cycle.checkAttempted&&!cycle.paused&&!cycle.pending&&onPracticeCheck&&<button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>send("SUPPORT_CHECK","REQUEST",cycle.choiceId)}>Try a fresh practice check</button>}
  {cycle?.pending&&!busy&&<button className="btn btn-ghost" type="button" onClick={()=>void perform(cycle.pending,cycle)}>Retry support save</button>}
  <p role="status">{message||cycle?.message}</p>
 </aside>;
}
