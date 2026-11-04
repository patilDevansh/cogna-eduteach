import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInteractionFixture,isolatedDatabase,sampleContext } from "../../../../scripts/interaction-test-fixture";
import { lessonContentVersion } from "../../src/personalized-videos/lesson-evidence";
import { LearnerEventsService, type LearnerObservation } from "../../src/learning-evidence/learner-events.service";
import { LearnerEventsController } from "../../src/learning-evidence/learner-events.controller";
const enabled=Boolean(process.env.COGNA_LESSON_EVIDENCE_TEST_DATABASE_URL);
describe("durable presentation, history and contextual support",{skip:!enabled},()=>{
 it("keeps bounded draft history separate from submitted answers and displays their time",async()=>{
  const db=isolatedDatabase(),f=await createInteractionFixture(db),s=new LearnerEventsService(db as any);
  try{
   const draft=(candidate:string,action:"ENTERED"|"REVISED"|"CLEARED",elapsedMs:number):LearnerObservation=>({schemaVersion:1,eventId:randomUUID(),source:"EXERCISE",sessionId:f.sessionId,questionId:f.questionId,questionVersion:1,kind:"DRAFT_CHECKPOINT",draft:{candidate,action,elapsedMs}});
   const first=draft("9","ENTERED",1800),clear=draft("","CLEARED",2600),last=draft("1","ENTERED",4200);
   await s.record(f.studentId,first);await s.record(f.studentId,clear);await s.record(f.studentId,last);await s.record(f.studentId,last);
   assert.equal(await db.rawEvent.count({where:{eventId:last.eventId}}),1);
   await assert.rejects(()=>s.record(f.studentId,{...last,draft:{...last.draft!,candidate:"2"}}));
   await assert.rejects(()=>s.record("other-learner",draft("2","ENTERED",5000)));
   await assert.rejects(()=>s.record(f.studentId,draft("x".repeat(201),"ENTERED",5000)));
   const lotus=f.questions[0]!;
   await f.lotusController.answer(f.headers,f.lotusId,{studentId:f.studentId,answer:"9",working:"",confidence:60,responseTimeMs:3000,didNotKnow:false,questionId:lotus.id,nextQuestionId:f.questions[1]!.id,submissionId:`${f.lotusId}_answer`,interactionContext:sampleContext("LOTUS",lotus.id)});
   await assert.rejects(()=>f.practice.submitAnswer(f.headers,{eventId:randomUUID(),eventType:"ANSWER_SUBMITTED",studentId:f.studentId,sessionId:f.sessionId,questionId:f.questionId,questionVersion:1,submittedAnswer:"1",timeToFirstResponseMs:100,totalTimeMs:4200,idleTimeMs:0,attemptNumber:1,hintCount:0,highestHintLevel:0,selfRatedConfidence:null,answerChangedBeforeSubmit:true,clientTimestamp:new Date().toISOString(),interactionContext:sampleContext("EXERCISE",f.questionId)}));
   const history=await s.history(f.studentId);
   assert.deepEqual(history.events.filter(e=>e.kind==="LEARNER_DRAFT_CHECKPOINT").map(e=>e.draft?.candidate).sort(),["","1","9"]);
   assert.equal(history.events.find(e=>e.id===last.eventId)?.draft?.elapsedMs,4200);
   assert.equal(history.events.find(e=>e.kind==="ANSWER_SUBMITTED")?.submittedAnswer,"1");
   assert.equal(history.related.find(e=>e.source==="LOTUS"&&e.kind==="ANSWER")?.submittedAnswer,"9");
   assert.equal(JSON.stringify(history).includes("2x+6"),false);
  }finally{await f.cleanup();await db.$disconnect();}
 });
 it("records visible unanswered evidence, idempotent replay, owner isolation and strict payloads",async()=>{
  const db=isolatedDatabase(),f=await createInteractionFixture(db),service=new LearnerEventsService(db as any),controller=new LearnerEventsController(service);
  try{
   const body:LearnerObservation={schemaVersion:1,eventId:randomUUID(),source:"EXERCISE",sessionId:f.sessionId,questionId:f.questionId,questionVersion:1,kind:"PRESENTED",context:sampleContext("EXERCISE",f.questionId)};
   const results=await Promise.all(Array.from({length:4},()=>controller.record(f.headers,body)));
   assert.ok(results.every(r=>r.eventId===body.eventId));assert.equal(await db.rawEvent.count({where:{eventId:body.eventId}}),1);
   const history=await controller.history(f.headers);assert.ok(history.events.some(e=>e.id===body.eventId));assert.equal(await db.attempt.count({where:{studentId:f.studentId}}),0);
   const ambiguous={...body,eventId:randomUUID(),context:{...sampleContext("EXERCISE",f.questionId),timing:{basis:"CLIENT_ITEM_MOUNT",elapsedMs:100000,firstInputMs:50000,hiddenMs:40000,visibilityChanges:2,complete:true}}};
   assert.equal((await service.record(f.studentId,ambiguous as LearnerObservation)).offer,null);
   await assert.rejects(()=>service.record(f.studentId,{...body,eventId:randomUUID(),context:{...sampleContext("EXERCISE",f.questionId),presentedAt:null}}));
   await assert.rejects(()=>service.record("other-student",{...body,eventId:randomUUID()}));
   await assert.rejects(()=>service.record(f.studentId,{...body,context:{...body.context as object,format:"CHANGED"}}));
   await assert.rejects(()=>service.record(f.studentId,{...body,eventId:randomUUID(),kind:"CHECK_IN",value:"FRUSTRATED",context:{keystrokes:"not allowed"}}));
   await assert.rejects(()=>service.record(f.studentId,{...body,eventId:randomUUID(),questionId:"not-issued"}));
   assert.throws(()=>controller.history({"x-cogna-role":"teacher"}));
  }finally{await f.cleanup();await db.$disconnect();}
 });
 it("requires offer→choice→actual matching delivery→recheck, including lost acknowledgements",async()=>{
  const db=isolatedDatabase(),f=await createInteractionFixture(db),s=new LearnerEventsService(db as any);
  const base={schemaVersion:1 as const,source:"EXERCISE" as const,sessionId:f.sessionId,questionId:f.questionId,questionVersion:1};
  const event=(kind:LearnerObservation["kind"],value:string,supportRef?:string):LearnerObservation=>({...base,eventId:randomUUID(),kind,value,...(supportRef?{supportRef}:{})});
  try{
   const check=event("CHECK_IN","FRUSTRATED"),offer=await s.record(f.studentId,check);assert.equal(offer.interpretation,"SELF_REPORTED_FRUSTRATED");assert.ok(offer.offer.options.includes("HINT"));
   const choose=event("SUPPORT_CHOICE","HINT",check.eventId);await s.record(f.studentId,choose);
   await assert.rejects(()=>s.record(f.studentId,event("SUPPORT_RECHECK","BETTER",choose.eventId)));
   await assert.rejects(()=>s.record(f.studentId,event("SUPPORT_DELIVERED","BREAK",choose.eventId)));
   await assert.rejects(()=>s.record(f.studentId,{...event("SUPPORT_DELIVERED","HINT",choose.eventId),deliveryRef:randomUUID()}));
   const hintId=randomUUID();await f.practice.requestHint(f.headers,{eventId:hintId,eventType:"HINT_REQUESTED",studentId:f.studentId,sessionId:f.sessionId,questionId:f.questionId,questionVersion:1,clientTimestamp:new Date().toISOString()});
   const delivered={...event("SUPPORT_DELIVERED","HINT",choose.eventId),deliveryRef:hintId};await s.record(f.studentId,delivered);await s.record(f.studentId,delivered);
   assert.equal(await db.rawEvent.count({where:{eventId:delivered.eventId}}),1);
   await s.record(f.studentId,event("SUPPORT_RECHECK","BETTER",choose.eventId));
   await assert.rejects(()=>s.record(f.studentId,event("SUPPORT_RECHECK","WORSE",choose.eventId)));
   const refused=event("CHECK_IN","CONFUSED");await s.record(f.studentId,refused);const decline=event("SUPPORT_CHOICE","NOT_NEEDED",refused.eventId);await s.record(f.studentId,decline);
   await assert.rejects(()=>s.record(f.studentId,event("SUPPORT_RECHECK","BETTER",decline.eventId)));
   await assert.rejects(()=>s.record(f.studentId,event("SUPPORT_DELIVERED","BREAK",decline.eventId)));
   const lot={schemaVersion:1 as const,eventId:randomUUID(),source:"LOTUS" as const,sessionId:f.lotusId,questionId:f.questions[0]!.id,questionVersion:null,kind:"CHECK_IN" as const,value:"FRUSTRATED"};
   const diagnostic=await s.record(f.studentId,lot);assert.equal(diagnostic.offer.options.includes("HINT"),false);
   await assert.rejects(()=>s.record(f.studentId,{...lot,eventId:randomUUID(),kind:"SUPPORT_CHOICE",value:"HINT",supportRef:lot.eventId}));
   const nextQuestion=await db.question.create({data:{...f.question,id:`${f.questionId}_fresh`,stem:"What is 2+4?",acceptedAnswers:["6"],createdAt:undefined,updatedAt:undefined}});
   const checkRequest=event("SUPPORT_CHECK","REQUEST",choose.eventId);
   const checkReceipt=await s.record(f.studentId,checkRequest);
   assert.equal(checkReceipt.next.payload.id,nextQuestion.id);
   assert.equal((await s.record(f.studentId,checkRequest)).next.payload.id,nextQuestion.id);
   await assert.rejects(()=>f.practice.submitAnswer(f.headers,{eventId:randomUUID(),eventType:"ANSWER_SUBMITTED",studentId:f.studentId,sessionId:f.sessionId,questionId:nextQuestion.id,questionVersion:1,submittedAnswer:"6",timeToFirstResponseMs:10,totalTimeMs:100,idleTimeMs:0,attemptNumber:1,hintCount:0,highestHintLevel:0,selfRatedConfidence:null,answerChangedBeforeSubmit:false,clientTimestamp:new Date().toISOString(),interactionContext:sampleContext("EXERCISE",nextQuestion.id)}));
   const history=await s.history(f.studentId);const outcome=history.supportResults.find(r=>r.supportEventId===delivered.eventId);assert.equal(outcome?.freshPracticeCheck?.result?.isCorrect,true);assert.equal(outcome?.freshPracticeCheck?.purpose,"PRACTICE");assert.equal(outcome?.nextRecordedConceptAnswer?.purpose,"ADAPTIVE_PRACTICE");
  }finally{await f.cleanup();await db.$disconnect();}
 });
 it("serialises proactive offers and never reoffers unchanged mistakes after decline",async()=>{
  const db=isolatedDatabase(),f=await createInteractionFixture(db),s=new LearnerEventsService(db as any);
  try{
   for(let i=1;i<=2;i++){
    const q=await db.question.create({data:{...f.question,id:`${f.questionId}_wrong${i}`,createdAt:undefined,updatedAt:undefined}});
    await db.rawEvent.update({where:{eventId:`current-delivery-${f.sessionId}`},data:{payload:{next:{...f.next,payload:{...f.next.payload,id:q.id}}}}});
    await assert.rejects(()=>f.practice.submitAnswer(f.headers,{eventId:randomUUID(),eventType:"ANSWER_SUBMITTED",studentId:f.studentId,sessionId:f.sessionId,questionId:q.id,questionVersion:1,submittedAnswer:"99",timeToFirstResponseMs:10,totalTimeMs:100,idleTimeMs:0,attemptNumber:1,hintCount:0,highestHintLevel:0,selfRatedConfidence:null,answerChangedBeforeSubmit:false,clientTimestamp:new Date().toISOString(),interactionContext:sampleContext("EXERCISE",q.id)}));
   }
   await db.rawEvent.update({where:{eventId:`current-delivery-${f.sessionId}`},data:{payload:{next:f.next}}});
   const request=()=>({schemaVersion:1 as const,eventId:randomUUID(),source:"EXERCISE" as const,sessionId:f.sessionId,questionId:f.questionId,questionVersion:1,kind:"PRESENTED" as const,context:sampleContext("EXERCISE",f.questionId)});
   const receipts=await Promise.all([s.record(f.studentId,request()),s.record(f.studentId,request()),s.record(f.studentId,request())]);
   assert.equal(receipts.filter(r=>r.offer).length,1);
   const offered=receipts.find(r=>r.offer)!;
   await s.record(f.studentId,{schemaVersion:1,eventId:randomUUID(),source:"EXERCISE",sessionId:f.sessionId,questionId:f.questionId,questionVersion:1,kind:"SUPPORT_CHOICE",value:"NOT_NEEDED",supportRef:offered.eventId});
   // Expire the clock gate while keeping the old evidence older than that offer.
   const mistakes=await db.attempt.findMany({where:{studentId:f.studentId}});
   await db.attempt.updateMany({where:{id:{in:mistakes.map(a=>a.id)}},data:{createdAt:new Date(Date.now()-900000)}});
   await db.rawEvent.update({where:{eventId:offered.eventId},data:{createdAt:new Date(Date.now()-600000)}});
   assert.equal((await s.record(f.studentId,request())).offer,null);
  }finally{await f.cleanup();await db.$disconnect();}
 });
 it("an in-flight delivery cannot replace an atomically reserved pending answer",async()=>{
  const db=isolatedDatabase(),f=await createInteractionFixture(db);
  try{
   let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let entered!:()=>void;const computing=new Promise<void>(r=>{entered=r;});
   (f.loop as any).computeContent=async()=>{entered();await gate;return {...f.next,payload:{...f.next.payload,id:"not-installed"}};};
   const prepared=(f.loop as any).resolveContent(f.next.decision,f.studentId,f.sessionId);
   await computing;
   const eventId=randomUUID();
   await assert.rejects(()=>f.practice.submitAnswer(f.headers,{eventId,eventType:"ANSWER_SUBMITTED",studentId:f.studentId,sessionId:f.sessionId,questionId:f.questionId,questionVersion:1,submittedAnswer:"5",timeToFirstResponseMs:10,totalTimeMs:100,idleTimeMs:0,attemptNumber:1,hintCount:0,highestHintLevel:0,selfRatedConfidence:null,answerChangedBeforeSubmit:false,clientTimestamp:new Date().toISOString(),interactionContext:sampleContext("EXERCISE",f.questionId)}));
   release();await assert.rejects(()=>prepared);
   const saved=await db.rawEvent.findUniqueOrThrow({where:{eventId:`current-delivery-${f.sessionId}`}});assert.equal((saved.payload as any).pendingAnswerEventId,eventId);assert.equal((saved.payload as any).next.payload.id,f.questionId);
  }finally{await f.cleanup();await db.$disconnect();}
 });
 it("withholds independent exit correctness until main and transfer are both sealed",async()=>{
  const db=isolatedDatabase(),f=await createInteractionFixture(db),s=new LearnerEventsService(db as any);const id=`${f.sessionId}_exit`;
  try{
   await db.personalizedVideoAssignment.create({data:{id,studentId:f.studentId,schoolId:"isolated",status:"READY",diagnosticState:"SUFFICIENT",conceptId:f.question.conceptId,learningObjective:"fixture",evidenceSnapshot:{},script:{transfer:{prompt:"Transfer",answer:"SECRET_FUTURE"}}}});
   await db.personalizedVideoEvent.create({data:{assignmentId:id,studentId:f.studentId,kind:"INDEPENDENT_EXIT",exitItem:0,exitPrompt:"Main",exitAnswer:"student answer",exitCorrect:true}});
   const unsealed=await s.history(f.studentId);const main=unsealed.related.find(e=>e.source==="INDEPENDENT_EXIT")!;assert.equal(main.result?.verdict,"WITHHELD_UNTIL_SEALED");assert.equal(JSON.stringify(unsealed).includes("SECRET_FUTURE"),false);
   await db.personalizedVideoEvent.create({data:{assignmentId:id,studentId:f.studentId,kind:"INDEPENDENT_EXIT",exitItem:1,exitPrompt:"Transfer",exitAnswer:"student transfer",exitCorrect:false}});
   const sealed=await s.history(f.studentId);assert.deepEqual(sealed.related.filter(e=>e.source==="INDEPENDENT_EXIT").map(e=>e.result?.verdict),["CORRECT","INCORRECT"]);
  }finally{await db.personalizedVideoAssignment.deleteMany({where:{id}});await f.cleanup();await db.$disconnect();}
 });
 it("paginates related sessions and labels historical receipts without borrowing changed content",async()=>{
  const db=isolatedDatabase(),f=await createInteractionFixture(db),s=new LearnerEventsService(db as any);const ids:string[]=[];
  try{
   for(let i=0;i<21;i++){
    const id=`${f.sessionId}_video${i}`;ids.push(id);
    const script:any={practice:{items:[{id:"typed",prompt:"Factorise",expression:"x^2+5x+6"}]}};
    const version=lessonContentVersion(script);
    script.learningEvidence={receipts:[{receipt:{eventId:`record_video_${i}`,contentVersion:version,itemId:"typed",kind:"PRESENTED",receivedAt:new Date().toISOString(),purpose:"PRACTICE",assistance:"UNKNOWN"}}]};
    if(i===0)script.practice.items[0].expression="CHANGED_CURRENT_EXPRESSION";
    await db.personalizedVideoAssignment.create({data:{id,studentId:f.studentId,schoolId:"isolated",status:"READY",diagnosticState:"SUFFICIENT",conceptId:f.question.conceptId,learningObjective:"fixture",evidenceSnapshot:{},script}});
    await db.lotusSessionRecord.create({data:{sessionId:`${f.lotusId}_page${i}`,studentId:f.studentId,status:"ACTIVE",phase:"EXPLORE",startedAt:new Date(),payload:{...f.session,sessionId:`${f.lotusId}_page${i}`,audits:[{question:{id:`record_lotus_q${i}`,prompt:"A recorded question",answerKey:{canonicalAnswer:"NEVER_EXPOSED_KEY"}},response:{submissionId:`record_lotus_${i}`},verification:{status:"VERIFIED_INCORRECT"},createdAt:new Date().toISOString()}]} as any}});
   }
   const first=await s.history(f.studentId);assert.ok(first.nextCursor);const second=await s.history(f.studentId,first.nextCursor!);
   const related=[...first.related,...second.related];assert.equal(new Set(related.map(e=>`${e.source}:${e.id}`)).size,42);assert.equal(related.length,42);assert.equal(second.nextCursor,null);
   const historical=related.find(e=>e.id==="record_video_0")!;assert.equal(historical.questionLabel,"Historical lesson item (prompt unavailable)");assert.equal(related.find(e=>e.id==="record_video_1")!.questionLabel,"Factorise x^2+5x+6");assert.equal(JSON.stringify(related).includes("NEVER_EXPOSED_KEY"),false);
  }finally{await db.personalizedVideoAssignment.deleteMany({where:{id:{in:ids}}});await f.cleanup();await db.$disconnect();}
 });
 it("paginates owned history, preserves source records and never exposes future answer keys",async()=>{
  const db=isolatedDatabase(),f=await createInteractionFixture(db),s=new LearnerEventsService(db as any);
  try{
   await db.rawEvent.createMany({data:Array.from({length:105},(_,i)=>({eventId:`${f.sessionId}_${i}`,studentId:f.studentId,sessionId:f.sessionId,eventType:"TEST_CONTEXT",payload:{questionId:f.questionId}}))});
   const first=await s.history(f.studentId);assert.ok(first.nextCursor);const second=await s.history(f.studentId,first.nextCursor!);
   const ids=[...first.events,...second.events].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,106);
   assert.equal(JSON.stringify(first).includes("canonicalAnswer"),false);assert.equal(JSON.stringify(first).includes("acceptedAnswers"),false);
   const wrong=Buffer.from(JSON.stringify({raw:ids[0],lotus:null,video:null})).toString("base64url");await assert.rejects(()=>s.history("other-student",wrong));
  }finally{await f.cleanup();await db.$disconnect();}
 });
});
