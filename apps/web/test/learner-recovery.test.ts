import { describe,it,beforeEach } from "node:test";
import assert from "node:assert/strict";
import {readRecovery,writeRecovery,recoveryKey,RECOVERY_TTL} from "../src/lib/learner-recovery";
const entries=new Map<string,string>();
beforeEach(()=>{entries.clear();Object.defineProperty(globalThis,"sessionStorage",{configurable:true,value:{getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>entries.set(k,v),removeItem:(k:string)=>entries.delete(k)}});});
describe("bounded learner recovery envelopes",()=>{
 it("preserves exact mixed-case drafts, empty edits, working and frozen pending payloads",()=>{const key=recoveryKey("EXERCISE","learner","BASELINE");const state={answer:"(x+3)(X+2)",working:["x^2+5x+6"],pending:{eventId:"same-id",time:123}};writeRecovery(key,state);assert.deepEqual(readRecovery(key),state);writeRecovery(key,{...state,answer:""});assert.equal((readRecovery<any>(key)).answer,"");});
 it("separates learner, topic/assignment and fake/live backend",()=>{const key=recoveryKey("LOTUS","a","topic:class:live");writeRecovery(key,{answer:"a"});for(const scope of [["LOTUS","b","topic:class:live"],["LOTUS","a","topic:other:live"],["LOTUS","a","topic:class:fake"]])assert.equal(readRecovery(recoveryKey(...scope as [string,string,string])),null);});
 it("removes expired/malformed/oversized envelopes and surfaces unavailable storage",()=>{entries.set("old",JSON.stringify({schemaVersion:1,savedAt:Date.now()-RECOVERY_TTL-1,state:{}}));assert.equal(readRecovery("old"),null);entries.set("bad","{bad");assert.equal(readRecovery("bad"),null);assert.throws(()=>writeRecovery("big","a".repeat(150001)));Object.defineProperty(globalThis,"sessionStorage",{configurable:true,get(){throw new Error("blocked");}});assert.throws(()=>readRecovery("blocked"));});
});
