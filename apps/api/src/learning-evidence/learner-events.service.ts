import { lessonContentVersion } from "../personalized-videos/lesson-evidence";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@cogna/database";
import { createHash } from "node:crypto";
import { validInteractionContext } from "@cogna/shared";
import { PrismaService } from "../prisma/prisma.service";

export type LearnerObservation = { schemaVersion: 1; eventId: string; source: "EXERCISE" | "LOTUS"; sessionId: string; questionId: string; questionVersion: number | null; kind: "PRESENTED" | "DRAFT_CHECKPOINT" | "CHECK_IN" | "SUPPORT_CHOICE" | "SUPPORT_RECHECK" | "SUPPORT_DELIVERED" | "SUPPORT_CHECK"; value?: string; supportRef?: string; deliveryRef?: string; context?: unknown; draft?: { candidate: string; action: "ENTERED" | "REVISED" | "CLEARED"; elapsedMs: number } };
const POLICY = "contextual-support-v1";
const choices = ["FRUSTRATED", "CONFUSED", "TIRED", "NOTEBOOK", "INTERRUPTED", "KEEP_GOING", "BREAK", "HINT", "NOT_NEEDED", "BETTER", "SAME", "WORSE", "REQUEST"];
const wire = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(wire).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${wire(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
};
@Injectable()
export class LearnerEventsService {
  constructor(private readonly prisma: PrismaService) {}
  private validate(body: LearnerObservation) {
    if (!body || typeof body !== "object" || Object.keys(body).some(k => !["schemaVersion","eventId","source","sessionId","questionId","questionVersion","kind","value","supportRef","deliveryRef","context","draft"].includes(k)) || body.schemaVersion !== 1 || !/^[\w-]{16,100}$/.test(body.eventId) || !["EXERCISE","LOTUS"].includes(body.source) || !["PRESENTED","DRAFT_CHECKPOINT","CHECK_IN","SUPPORT_CHOICE","SUPPORT_RECHECK","SUPPORT_DELIVERED","SUPPORT_CHECK"].includes(body.kind) || ![body.sessionId,body.questionId].every(v => typeof v === "string" && v.length > 0 && v.length <= 200)) throw new BadRequestException("Invalid learner observation.");
    if (body.source === "EXERCISE" ? !Number.isInteger(body.questionVersion) || body.questionVersion! < 1 : body.questionVersion !== null) throw new BadRequestException("Invalid question version.");
    if (["SUPPORT_CHOICE","SUPPORT_DELIVERED","SUPPORT_RECHECK","SUPPORT_CHECK"].includes(body.kind) && !body.supportRef)throw new BadRequestException("A source support reference is required.");
    if (body.kind === "PRESENTED" && (body.value !== undefined || body.supportRef !== undefined || body.deliveryRef !== undefined)) throw new BadRequestException("Presentation cannot include a support choice.");
    if (body.kind !== "SUPPORT_DELIVERED" && body.deliveryRef !== undefined) throw new BadRequestException("Delivery reference is not valid here.");
    if (body.supportRef !== undefined && !/^[\w-]{16,100}$/.test(body.supportRef) || body.deliveryRef !== undefined && !/^[\w-]{16,100}$/.test(body.deliveryRef)) throw new BadRequestException("Invalid support reference.");
    if (body.kind !== "PRESENTED" && body.context !== undefined) throw new BadRequestException("Context belongs to presentation events only.");
    if (body.kind === "DRAFT_CHECKPOINT") {
      const d=body.draft;
      if (!d || Object.keys(d).sort().join(",")!=="action,candidate,elapsedMs" || !["ENTERED","REVISED","CLEARED"].includes(d.action) || typeof d.candidate!=="string" || d.candidate.length>200 || !Number.isInteger(d.elapsedMs) || d.elapsedMs<0 || d.elapsedMs>86400000 || (d.action==="CLEARED" ? d.candidate!=="" : !d.candidate.trim()) || body.value!==undefined || body.supportRef!==undefined || body.deliveryRef!==undefined || body.context!==undefined) throw new BadRequestException("Invalid draft checkpoint.");
    } else if (body.draft!==undefined) throw new BadRequestException("Draft data belongs to a checkpoint only.");
    if (body.kind === "SUPPORT_CHECK" && body.value !== "REQUEST") throw new BadRequestException("Invalid practice check request.");
    if (body.kind === "SUPPORT_DELIVERED" && !["HINT","BREAK"].includes(body.value!)) throw new BadRequestException("Invalid delivery.");
    if (body.kind === "PRESENTED") {
      if (!validInteractionContext(body.context) || body.context.presentedAt === null || body.context.source !== body.source || body.context.questionId !== body.questionId || body.context.questionVersion !== body.questionVersion) throw new BadRequestException("Invalid presentation context.");
    } else if (body.kind !== "DRAFT_CHECKPOINT" && !choices.includes(body.value ?? "")) throw new BadRequestException("Choose a supported check-in.");
    if (body.kind === "CHECK_IN" && !["FRUSTRATED","CONFUSED","TIRED","NOTEBOOK","INTERRUPTED","KEEP_GOING"].includes(body.value!)) throw new BadRequestException("Invalid check-in.");
    if (body.kind === "SUPPORT_CHOICE" && !["HINT","BREAK","KEEP_GOING","NOT_NEEDED"].includes(body.value!)) throw new BadRequestException("Invalid support choice.");
    if (body.kind === "SUPPORT_RECHECK" && !["BETTER","SAME","WORSE"].includes(body.value!)) throw new BadRequestException("Invalid support recheck.");
  }
  private async scope(studentId: string, body: LearnerObservation) {
    if (body.source === "EXERCISE") {
      const session = await this.prisma.learningSession.findFirst({ where: { id: body.sessionId, studentId } });
      if (!session) throw new NotFoundException("Session not found.");
      const issued = await this.prisma.rawEvent.findUnique({ where: { eventId: `current-delivery-${body.sessionId}` } });
      const current = (issued?.payload as any)?.next?.payload;
      if (["PRESENTED","CHECK_IN","DRAFT_CHECKPOINT"].includes(body.kind) && (!current || current.id !== body.questionId || current.version !== body.questionVersion)) {
        const answered = body.kind === "PRESENTED" && await this.prisma.rawEvent.findFirst({where:{studentId,sessionId:body.sessionId,eventType:"ANSWER_SUBMITTED",payload:{path:["interactionContext","observationId"],equals:(body.context as any)?.observationId}}});
        if (!answered) throw new ConflictException("The issued question changed.");
      }
      const question = await this.prisma.question.findUnique({ where: { id_version: { id: body.questionId, version: body.questionVersion ?? 0 } } });
      if (!question || question.reviewStatus !== "APPROVED") throw new NotFoundException("Reviewed question not found.");
      return { purpose: session.sessionMode, conceptId: question.conceptId, contentVersion: `${question.id}:${question.version}`, question: { id: question.id, version: question.version, stem: question.stem, type: question.type, conceptId: question.conceptId, difficulty: question.difficulty, hintLadder: question.hintLadder }, practice: session.sessionMode === "ADAPTIVE_PRACTICE", current: current?.id === body.questionId && current?.version === body.questionVersion && !(issued?.payload as any)?.pendingAnswerEventId, active: session.status === "ACTIVE" };
    }
    const row = await this.prisma.lotusSessionRecord.findFirst({ where: { sessionId: body.sessionId, studentId } });
    if (!row) throw new NotFoundException("Session not found.");
    const session = row.payload as any;
    const question = session.currentQuestion?.id === body.questionId ? session.currentQuestion : session.audits?.find((a: any) => a.question.id === body.questionId)?.question;
    if (!question || body.questionVersion !== null) throw new NotFoundException("Issued question not found.");
    return { purpose: "DIAGNOSTIC", conceptId: question.subtopic ?? null, contentVersion: createHash("sha256").update(wire(question)).digest("hex"), question: { id: question.id, prompt: question.prompt, type: question.type }, practice: false, current: session.currentQuestion?.id === body.questionId, active: session.status === "ACTIVE" };
  }
  async record(studentId: string, body: LearnerObservation) {
    this.validate(body);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${studentId}:${body.sessionId}`}, 0))::text AS locked`;
      return new LearnerEventsService(tx as unknown as PrismaService).recordLocked(studentId, body);
    });
  }
  private async recordLocked(studentId: string, body: LearnerObservation) {
    const previous = await this.prisma.rawEvent.findUnique({ where: { eventId: body.eventId } });
    if (previous) {
      if (previous.studentId !== studentId || wire((previous.payload as any).request) !== wire(body)) throw new ConflictException("Observation identity already used.");
      const parent = body.source === "EXERCISE" ? await this.prisma.learningSession.findFirst({where:{id:body.sessionId,studentId}}) : await this.prisma.lotusSessionRecord.findFirst({where:{sessionId:body.sessionId,studentId}});
      if(!parent)throw new NotFoundException("Session not found.");
      return (previous.payload as any).receipt;
    }
    const scope = await this.scope(studentId, body);
    if (!scope.active && ["PRESENTED","CHECK_IN","SUPPORT_CHOICE","DRAFT_CHECKPOINT"].includes(body.kind)) throw new ConflictException("This learning session has ended.");
    if (body.kind === "DRAFT_CHECKPOINT" && !scope.current) throw new ConflictException("The issued question changed.");
    let offer: any = null;
    const recent = await this.prisma.rawEvent.findMany({ where: { studentId, sessionId: body.sessionId, eventType: { startsWith: "LEARNER_" } }, orderBy: [{ createdAt: "desc" }, { eventId: "desc" }], take: 100 });
    if (["SUPPORT_CHOICE","SUPPORT_RECHECK","SUPPORT_DELIVERED","SUPPORT_CHECK"].includes(body.kind)) {
      const origin = body.supportRef && await this.prisma.rawEvent.findUnique({ where: { eventId: body.supportRef } });
      if (!origin || origin.studentId !== studentId || origin.sessionId !== body.sessionId || (origin.payload as any).request?.questionId !== body.questionId || (origin.payload as any).request?.source !== body.source || (origin.payload as any).request?.questionVersion !== body.questionVersion || (origin.payload as any).receipt?.contentVersion !== scope.contentVersion) throw new BadRequestException("Support reference does not belong to this question.");
      if (body.kind === "SUPPORT_CHOICE" && !(origin.payload as any).receipt?.offer?.options?.includes(body.value)) throw new BadRequestException("No matching support offer.");
      if (["SUPPORT_RECHECK","SUPPORT_DELIVERED","SUPPORT_CHECK"].includes(body.kind) && (origin.payload as any).request?.kind !== "SUPPORT_CHOICE") throw new BadRequestException("Recheck needs a chosen support.");
      if (["SUPPORT_DELIVERED", "SUPPORT_RECHECK", "SUPPORT_CHECK"].includes(body.kind) && !["HINT","BREAK"].includes((origin.payload as any).request?.value)) throw new BadRequestException("Declined support cannot be delivered or rechecked.");
      if (body.kind === "SUPPORT_DELIVERED" && (origin.payload as any).request?.value !== body.value) throw new BadRequestException("Delivered support differs from the chosen support.");
      const existingTransition = await this.prisma.rawEvent.findFirst({ where: { studentId, sessionId: body.sessionId, eventType: `LEARNER_${body.kind}`, payload: { path: ["request","supportRef"], equals: body.supportRef } } });
      if (existingTransition) throw new ConflictException("This support transition is already recorded.");
      if (["SUPPORT_RECHECK","SUPPORT_CHECK"].includes(body.kind)) {
        const delivered = await this.prisma.rawEvent.findFirst({ where: { studentId, sessionId: body.sessionId, eventType: "LEARNER_SUPPORT_DELIVERED", payload: { path: ["request","supportRef"], equals: body.supportRef } } });
        if (!delivered) throw new BadRequestException("Support delivery must be confirmed before recheck.");
      }
      if (body.kind === "SUPPORT_DELIVERED" && body.value === "HINT") {
        const hint = body.deliveryRef && await this.prisma.rawEvent.findUnique({ where: { eventId: body.deliveryRef } });
        if (!hint || hint.studentId !== studentId || hint.sessionId !== body.sessionId || hint.eventType !== "HINT_REQUESTED" || hint.createdAt < origin.createdAt || (hint.payload as any).questionId !== body.questionId || (hint.payload as any).questionVersion !== body.questionVersion) throw new BadRequestException("No matching issued hint.");
      }
      if (body.value === "HINT" && (!scope.practice || !scope.current)) throw new BadRequestException("Diagnostic answers cannot receive instructional hints.");
    }
    const lastOffer = await this.prisma.rawEvent.findFirst({ where: { studentId, sessionId: body.sessionId, eventType: "LEARNER_SUPPORT_OFFER" }, orderBy: { createdAt: "desc" } });
    const cooldown = Boolean(lastOffer && Date.now() - lastOffer.createdAt.getTime() < 300000);
    let interpretation = "UNKNOWN";
    if (body.kind === "CHECK_IN") {
      interpretation = `SELF_REPORTED_${body.value}`;
      if (["FRUSTRATED","CONFUSED","TIRED","INTERRUPTED"].includes(body.value!)) offer = { policyVersion: POLICY, reason: interpretation, options: scope.practice ? ["HINT","BREAK","KEEP_GOING","NOT_NEEDED"] : ["BREAK","KEEP_GOING","NOT_NEEDED"], message: scope.practice ? "Would a smaller step or a pause help?" : "You can pause this diagnostic and return to the same question." };
    }
    if (body.kind === "PRESENTED" && scope.practice && !cooldown) {
      const attempts = await this.prisma.attempt.findMany({ where: { studentId, sessionId: body.sessionId, question: { conceptId: scope.conceptId } }, orderBy: { createdAt: "desc" }, take: 3 });
      const distinct = [...new Map(attempts.map(a => [`${a.questionId}:${a.questionVersion}`, a])).values()];
      if (distinct.filter(a => !a.isCorrect && a.grade === "INCORRECT").length >= 2 && (!lastOffer || distinct.some(a => !a.isCorrect && a.createdAt > lastOffer.createdAt))) {
        interpretation = "REPEATED_VERIFIED_DIFFICULTY";
        offer = { policyVersion: POLICY, reason: interpretation, options: ["HINT","BREAK","KEEP_GOING","NOT_NEEDED"], message: "The last questions were difficult. Would a smaller step help?" };
      }
    }
    let next: any = undefined;
    let checkItem: any = undefined;
    if (body.kind === "SUPPORT_CHECK") {
      if(!scope.practice || !scope.active || !scope.current)throw new BadRequestException("Fresh support checks are available only in active practice.");
      const views=await this.prisma.rawEvent.findMany({where:{studentId,eventType:{in:["LEARNER_PRESENTED","LEARNER_SUPPORT_OFFER"]}},select:{payload:true},take:5001});
      const seen=views.map(r=>(r.payload as any).request?.questionId).filter(Boolean);
      const current=await this.prisma.rawEvent.findUnique({where:{eventId:`current-delivery-${body.sessionId}`}});
      const currentNext=(current?.payload as any)?.next;
      if(!current||currentNext?.payload?.id!==body.questionId||currentNext?.payload?.version!==body.questionVersion||(current.payload as any)?.pendingAnswerEventId)throw new ConflictException("The current question changed before selecting the check.");
      const candidate=views.length>5000?null:await this.prisma.question.findFirst({where:{conceptId:scope.conceptId!,difficulty:(scope.question as any).difficulty,reviewStatus:"APPROVED",type:{in:["NUMERIC","WORD_PROBLEM"]},id:{notIn:[...seen,body.questionId,currentNext?.payload?.id].filter(Boolean)},attempts:{none:{studentId}}},orderBy:[{id:"asc"},{version:"desc"}]});
      if(candidate){
        next={decision:{...(currentNext?.decision??{}),uiAction:"SHOW_QUESTION",learningIntent:"CONCEPT_REINFORCEMENT",parameters:{conceptId:candidate.conceptId}},decisionId:body.eventId,studentMessage:"Try this different reviewed practice question.",payload:{id:candidate.id,version:candidate.version,stem:candidate.stem,type:candidate.type,difficulty:candidate.difficulty,conceptId:candidate.conceptId,hintLadder:candidate.hintLadder}};
        checkItem={questionId:candidate.id,questionVersion:candidate.version,purpose:"PRACTICE",selection:"NOT_PREVIOUSLY_RECORDED_ANSWERED_OR_VIEWED"};
        const changed=await this.prisma.rawEvent.updateMany({where:{eventId:`current-delivery-${body.sessionId}`,payload:{equals:current.payload as Prisma.InputJsonValue}},data:{payload:{next}}});
        if(changed.count!==1)throw new ConflictException("The current question changed while selecting the check.");
      }
    }
    // Explicit reports can request support during cooldown; timing alone never infers affect.
    const receipt = { eventId: body.eventId, studentId, receivedAt: new Date().toISOString(), interpretation, offer, purpose: scope.purpose, contentVersion: scope.contentVersion, policyVersion: POLICY, ...(body.kind === "SUPPORT_CHECK" ? {next:next??null,checkItem:checkItem??null,checkStatus:next?"ISSUED":"UNAVAILABLE"}: {}) };
    const payload = { request: body, receipt, conceptId: scope.conceptId, question: scope.question };
    const saved = await this.prisma.rawEvent.upsert({ where: { eventId: body.eventId }, create: { eventId: body.eventId, eventType: offer ? "LEARNER_SUPPORT_OFFER" : `LEARNER_${body.kind}`, studentId, sessionId: body.sessionId, payload: payload as any }, update: {} });
    if (saved.studentId !== studentId || wire((saved.payload as any).request) !== wire(body)) throw new ConflictException("Observation identity already used.");
    return (saved.payload as any).receipt;
  }
  async history(studentId: string, cursor?: string) {
    let positions: Record<string,string|null> = {raw:"",lotus:"",video:""};
    if (cursor) {
      try { const decoded=JSON.parse(Buffer.from(cursor,"base64url").toString());
        if(cursor.length>1600||Object.keys(decoded).sort().join(",")!=="lotus,raw,video"||Object.values(decoded).some(v=>v!==null&&(typeof v!=="string"||!/^[\w-]{0,200}$/.test(v)))) throw new Error();
        positions=decoded;
      } catch { throw new BadRequestException("Invalid history cursor."); }
    }
    for (const [kind,id] of Object.entries(positions)) {
      if (!id) continue;
      const row=kind==="raw"?await this.prisma.rawEvent.findUnique({where:{eventId:id}}):kind==="lotus"?await this.prisma.lotusSessionRecord.findUnique({where:{id}}):await this.prisma.personalizedVideoAssignment.findUnique({where:{id}});
      if(!row||row.studentId!==studentId)throw new NotFoundException("History cursor not found.");
    }
    const records = positions.raw===null?[]:await this.prisma.rawEvent.findMany({ where: { studentId }, orderBy: [{ createdAt: "desc" }, { eventId: "desc" }], take: 101, ...(positions.raw ? { cursor: { eventId: positions.raw }, skip: 1 } : {}) });
    const page = records.slice(0,100);
    const [attempts, lotus, videos] = await Promise.all([
      this.prisma.attempt.findMany({ where: { studentId, eventId: { in: page.map(r => r.eventId) } }, select: { eventId: true, submittedAnswer: true, totalTimeMs: true, isCorrect: true, grade: true, questionId: true, questionVersion: true, hintCount: true, question:{select:{stem:true}}, session:{select:{sessionMode:true}} } }),
      positions.lotus===null?Promise.resolve([]):this.prisma.lotusSessionRecord.findMany({ where: { studentId }, orderBy: [{startedAt:"desc"},{id:"desc"}], take: 21, ...(positions.lotus?{cursor:{id:positions.lotus},skip:1}:{}) }),
      positions.video===null?Promise.resolve([]):this.prisma.personalizedVideoAssignment.findMany({ where: { studentId }, orderBy: [{createdAt:"desc"},{id:"desc"}], take: 21, include:{events:{where:{kind:"INDEPENDENT_EXIT"},orderBy:{createdAt:"asc"}}}, ...(positions.video?{cursor:{id:positions.video},skip:1}:{}) }),
    ]);
    const events = page.map(r => {
      const p = r.payload as any, a = attempts.find(a => a.eventId === r.eventId);
      return { id: r.eventId, source: p.request?.source ?? (a ? "EXERCISE" : "EXERCISE_LEGACY"), sessionId: r.sessionId, receivedAt: r.createdAt.toISOString(), kind: r.eventType, questionId: p.request?.questionId ?? p.questionId ?? null, questionVersion: p.request?.questionVersion ?? p.questionVersion ?? null, purpose: p.receipt?.purpose ?? a?.session.sessionMode ?? "LEGACY_UNKNOWN", questionLabel:p.question?.stem??p.question?.prompt??a?.question.stem??p.next?.payload?.stem??null, contentVersion: p.receipt?.contentVersion ?? (a?`${a.questionId}:${a.questionVersion}`:null), policyVersion: p.receipt?.policyVersion ?? (validInteractionContext(p.interactionContext)?"interaction-context-v1":null), interpretation: p.receipt?.interpretation ?? null, offer: p.receipt?.offer ?? null, value: p.request?.value ?? null, supportRef: p.request?.supportRef ?? null, context: p.request?.context ?? p.interactionContext ?? null, draft:p.request?.kind==="DRAFT_CHECKPOINT"?p.request.draft:null, submittedAnswer:a?.submittedAnswer??null, answerTimeMs:a?.totalTimeMs??null, result: a ? { grade: a.grade, isCorrect: a.isCorrect, recordedHintCount: a.hintCount } : null };
    });
    const lotusEvents = lotus.slice(0,20).flatMap(row => ((row.payload as any).audits ?? []).filter((a:any)=>a.response?.submissionId).map((a: any) => ({ id: a.response.submissionId, source: "LOTUS", sessionId: row.sessionId, questionId: a.question.id, questionLabel:a.question.prompt, receivedAt: a.createdAt, kind: "ANSWER", purpose: "DIAGNOSTIC", submittedAnswer:a.response.answer??null, answerTimeMs:a.response.responseTimeMs??null, result: a.verification?.status ?? "UNKNOWN", context: a.response?.interactionContext ?? null, assistance: "DIAGNOSTIC", contentVersion: createHash("sha256").update(wire(a.question)).digest("hex") })));
    const lessonEvents = videos.slice(0,20).flatMap(row => { const currentVersion=lessonContentVersion((row.script??{}) as Record<string,unknown>); return (((row.script as any)?.learningEvidence?.receipts) ?? []).map((e: any) => ({ id: e.receipt.eventId, source: "LESSON_PRACTICE", sessionId: row.id, questionId: e.receipt.itemId ?? null, questionLabel:e.receipt.contentVersion!==currentVersion?"Historical lesson item (prompt unavailable)":e.receipt.itemId?((row.script as any)?.practice?.items?.filter((i:any)=>i.id===e.receipt.itemId).map((i:any)=>[i.prompt,i.expression].filter(Boolean).join(" "))[0]??"Lesson practice"):"Lesson", kind: e.receipt.kind, receivedAt: e.receipt.receivedAt, purpose: e.receipt.purpose, contentVersion: e.receipt.contentVersion, assistance: e.receipt.assistance, result: e.receipt.result ? { verdict: e.receipt.result.verdict } : null })); });
    for(const row of videos.slice(0,20)){
      const hasMain=row.events.some(e=>(e.exitItem??0)===0);
      const hasTransfer=row.events.some(e=>e.exitItem===1);
      const sealed=hasMain&&(!(row.script as any)?.transfer||hasTransfer);
      for(const exit of row.events)lessonEvents.push({id:exit.id,source:"INDEPENDENT_EXIT",sessionId:row.id,questionId:`exit-${exit.exitItem??0}`,questionLabel:exit.exitPrompt??"Independent exit",kind:"ANSWER_SUBMITTED",receivedAt:exit.createdAt.toISOString(),purpose:"INDEPENDENT_EXIT",contentVersion:null,assistance:"SEALED_EXIT",result:{verdict:!sealed?"WITHHELD_UNTIL_SEALED":exit.exitCorrect===null?"UNKNOWN":exit.exitCorrect?"CORRECT":"INCORRECT"}});
    }
    const nextPositions={raw:records.length>100?page.at(-1)!.eventId:null,lotus:lotus.length>20?lotus[19]!.id:null,video:videos.length>20?videos[19]!.id:null};
    const supportResults=await Promise.all(page.filter(r=>r.eventType==="LEARNER_SUPPORT_DELIVERED").map(async r=>{
      const p=r.payload as any;
      const check=await this.prisma.rawEvent.findFirst({where:{studentId,sessionId:r.sessionId,eventType:"LEARNER_SUPPORT_CHECK",payload:{path:["request","supportRef"],equals:p.request.supportRef}},orderBy:{createdAt:"asc"}});
      const item=(check?.payload as any)?.receipt?.checkItem;
      const formal=item?await this.prisma.attempt.findFirst({where:{studentId,sessionId:r.sessionId!,questionId:item.questionId,questionVersion:item.questionVersion,createdAt:{gte:check!.createdAt}},orderBy:{createdAt:"asc"}}):null;
      const future=await this.prisma.attempt.findFirst({where:{studentId,sessionId:r.sessionId!,createdAt:{gt:r.createdAt},questionId:{not:p.request.questionId},question:{conceptId:p.conceptId}},orderBy:{createdAt:"asc"},include:{session:{select:{sessionMode:true}}}});
      return {supportEventId:r.eventId,sourceQuestionId:p.request.questionId,freshPracticeCheck:item?{...item,eventId:check!.eventId,result:formal?{eventId:formal.eventId,isCorrect:formal.isCorrect,recordedHintCount:formal.hintCount}:null}:null,nextRecordedConceptAnswer:future?{eventId:future.eventId,questionId:future.questionId,isCorrect:future.isCorrect,recordedHintCount:future.hintCount,purpose:future.session.sessionMode,receivedAt:future.createdAt.toISOString()}:null};
    }));
    return { schemaVersion: 1, studentId, events, related: [...lotusEvents,...lessonEvents], supportResults, nextCursor: Object.values(nextPositions).some(v=>v!==null)?Buffer.from(JSON.stringify(nextPositions)).toString("base64url"):null, coverage: { relatedSessionsLimit: 20, relatedHistoryComplete: nextPositions.lotus===null&&nextPositions.video===null, unansweredMeaning: "Presented without a recorded answer is an unanswered observation, not proven abandonment.", retention: "Delayed retention is unknown without a fresh delayed check." } };
  }
}
