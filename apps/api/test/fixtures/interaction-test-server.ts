/** Local-only controller/validation/storage harness for browser collection verification. */
import "reflect-metadata";
import { createServer } from "node:http";
import { ValidationPipe, BadRequestException } from "@nestjs/common";
import { createInteractionFixture, isolatedDatabase } from "../../../../scripts/interaction-test-fixture";
import { LearnerEventsService } from "../../src/learning-evidence/learner-events.service";
import { LearnerEventsController } from "../../src/learning-evidence/learner-events.controller";
import { StudentAccessService } from "../../src/access/student-access.service";
import { AnswerSubmittedDto } from "../../src/learning-loop/dto/answer-submitted.dto";
import { SubmitLotusAnswerDto } from "../../src/lotus/lotus.dto";
async function main() {
  const db = isolatedDatabase(); const f = await createInteractionFixture(db);
  const learnerEvents = new LearnerEventsController(new LearnerEventsService(db as any));
  const access = new StudentAccessService(db as any, {} as any);
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const path = new URL(req.url!, "http://localhost").pathname;
      let raw=""; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      let result: unknown;
      if (path === "/fixture") result = { studentId: f.studentId, token: f.token, sessionId:f.sessionId, lotusId:f.lotusId, questionId:f.questionId };
      else if (path === "/fixture/state") result = { raw: await db.rawEvent.findMany({ where:{studentId:f.studentId} }), attempts: await db.attempt.findMany({where:{studentId:f.studentId}}), lotus: await db.lotusSessionRecord.findUnique({where:{sessionId:f.lotusId},include:{evidence:true}}) };
      else if (path === "/learning-evidence/observations") result = await learnerEvents.record(req.headers, body);
      else if (path === "/learning-evidence/history") result = await learnerEvents.history(req.headers, new URL(req.url!,"http://localhost").searchParams.get("cursor")??undefined);
      else if (path === `/sessions/${f.sessionId}` && req.method === "GET") {
        await access.readLearningSession(req.headers,f.sessionId);
        const session=await db.learningSession.findUniqueOrThrow({where:{id:f.sessionId},include:{attempts:true,decisions:true}});
        const delivery=await db.rawEvent.findUnique({where:{eventId:`current-delivery-${f.sessionId}`}});
        const hints=await db.rawEvent.findMany({where:{sessionId:f.sessionId,eventType:"HINT_REQUESTED"}});
        result={...session,currentDelivery:(delivery?.payload as any)?.next??null,issuedHints:hints.map(h=>({eventId:h.eventId,questionId:(h.payload as any).questionId,level:(h.payload as any).hintLevel}))};
      }
      else if (path === "/sessions" && req.method === "POST") {
        if(body.studentId !== f.studentId) throw new BadRequestException("Not this fixture learner");
        result = { sessionId:f.sessionId,sessionMode:"ADAPTIVE_PRACTICE",next:f.next };
      } else if (path === "/practice/answer") result = await f.practice.submitAnswer(req.headers, await pipe.transform(body,{type:"body",metatype:AnswerSubmittedDto}));
      else if (path === "/practice/hint") result = await f.practice.requestHint(req.headers,body);
      else if (path === "/lotus/status") result = {ready:true,models:{primary:"no-provider-fixture",challenger:"no-provider-fixture"},missingConfiguration:[],progressiveStreamingEnabled:false};
      else if (path === "/lotus/sessions" && req.method === "POST") {
        if(body.studentId !== f.studentId) throw new BadRequestException("Not this fixture learner");
        result = await f.lotusController.get(req.headers,f.lotusId);
      } else if (path === `/lotus/sessions/${f.lotusId}/answers`) result = await f.lotusController.answer(req.headers,f.lotusId,await pipe.transform(body,{type:"body",metatype:SubmitLotusAnswerDto}));
      else if (path === `/lotus/sessions/${f.lotusId}`) result = await f.lotusController.get(req.headers,f.lotusId);
      else { res.statusCode=404;result={message:"Unsupported isolated fixture route"}; }
      res.end(JSON.stringify(result));
    } catch(error) {
      const e=error as {getStatus?:()=>number;getResponse?:()=>unknown;message?:string};
      res.statusCode=e.getStatus?.()??500;res.end(JSON.stringify(e.getResponse?.()??{message:e.message}));
    }
  });
  const reviewPort=process.env.COGNA_INTERACTION_FIXTURE_PORT==="4323"?4323:4313;
  server.listen(reviewPort,"127.0.0.1",()=>console.log(`Isolated interaction controller/storage fixture ready on ${reviewPort}`));
  let stopping=false;
  async function stop(){if(stopping)return;stopping=true;server.close();await f.cleanup();await db.$disconnect();process.exit(0);}
  process.on("SIGINT",stop);process.on("SIGTERM",stop);
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
