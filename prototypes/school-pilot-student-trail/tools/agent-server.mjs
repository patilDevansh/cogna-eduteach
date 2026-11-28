// Local server for the prototype with a talking, listening Cogna guide.
// Serves the prototype's files and three small endpoints, so the AI keys in the repo's .env
// never reach the browser:
//   POST /api/hear   raw WAV (16 kHz mono)  -> Sarvam speech-to-text  -> { text }
//   POST /api/talk   { said, context, history } -> her reply -> { say, action, voice (a URL to stream) }
//   GET  /api/voice  ?t=<token> -> the reply's audio, streamed as it is made (mp3)
//   GET  /api/ping   -> { ok: true }   (the guide turns talking on only when this answers)
// Brain: Sarvam "sarvam-105b-conversations" (about 1 s); GUIDE_BRAIN=gemini uses the repo's
//   OpenAI-compatible settings instead (Gemini, but 5-15 s a reply when tested).
// Voice: Sarvam "aparna_en_edtech" streamed (first sound in about 1 s); GUIDE_VOICE=kiara uses
//   Cartesia "kiara" (needs Cartesia credits).
// Run from the repo root:  node prototypes/school-pilot-student-trail/tools/agent-server.mjs
// then open http://127.0.0.1:4490
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(ROOT, "../..");
const PORT = Number(process.env.PORT || 4490);
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, ".env"), "utf8").split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
);
// The repo's "OpenAI" settings point at an OpenAI-compatible endpoint (today: Gemini).
const LLM_URL = (env.OPENAI_BASE_URL || "https://api.openai.com/v1/").replace(/\/?$/, "/") + "chat/completions";
const LLM_MODEL = env.GUIDE_MODEL || env.LOTUS_OPENAI_MODEL || "gpt-4.1-mini";
// Cartesia voice. Kiara (f8f5f1b2…) left their catalogue in Nov 2026; Siya is their Indian woman's voice.
const KIARA = env.GUIDE_CARTESIA_VOICE || "4459a9a5-69d6-4680-b970-e13dc51845b6";
const BRAIN = (process.env.GUIDE_BRAIN || env.GUIDE_BRAIN || "sarvam").toLowerCase();
// Kiara by default; if Cartesia refuses (no credits), that reply falls back to Sarvam Aparna.
const VOICE = (process.env.GUIDE_VOICE || env.GUIDE_VOICE || "kiara").toLowerCase();
const pendingVoice = new Map(); // token -> text, picked up by GET /api/voice

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webp": "image/webp" };

function body(req, limit = 8e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function json(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }

/** Must match spoken() in tools/record-narration.mjs: maths read the Indian classroom way. */
function spoken(t) {
  return String(t)
    .replace(/\b([bch])\b/g, (m, l) => l.toUpperCase())
    .replace(/ \+ /g, " plus ").replace(/²/g, " square").replace(/³/g, " cube").replace(/√/g, "the square root of ")
    .replace(/−/g, " minus ").replace(/×/g, " times ").replace(/=/g, " equals ").replace(/½/g, "half").replace(/°/g, " degrees");
}

let sarvamDown = false; // set when Sarvam refuses for lack of credits; Gemini then hears and thinks
async function hearGemini(wav) {
  const res = await fetch(LLM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: LLM_MODEL, temperature: 0, max_tokens: 300, messages: [{ role: "user", content: [
      { type: "text", text: "A grade 8 Indian student is talking to their maths tutor. Write down exactly what they say, in English. Reply with only their words. If there is no clear speech, reply with nothing." },
      { type: "input_audio", input_audio: { data: wav.toString("base64"), format: "wav" } }] }] }),
  });
  if (!res.ok) throw new Error(`speech-to-text ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return String(j.choices?.[0]?.message?.content || "").trim();
}
async function hear(wav) {
  if (sarvamDown || BRAIN === "gemini" || !env.SARVAM_API_KEY) return hearGemini(wav);
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "speech.wav");
  form.append("model", env.GUIDE_STT_MODEL || "saarika:v2.5");
  form.append("language_code", "en-IN");
  const res = await fetch("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": env.SARVAM_API_KEY }, body: form });
  if (res.status === 402 || res.status === 429) { sarvamDown = true; console.error("sarvam has no credits: gemini hears and thinks from here"); return hearGemini(wav); }
  if (!res.ok) throw new Error(`speech-to-text ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return String(j.transcript || "").trim();
}

const RULES = `You are Cogna, a warm, lively Indian maths teacher who lives inside a learning app as a small green orb.
You talk out loud with one grade 8 CBSE student. Everything you write is spoken aloud by a voice, so:
- Answer in one to three short sentences, plain spoken English, the way a kind teacher talks in class. No lists, no markdown, no emoji.
- Write maths in words or simple symbols (², √, ×, =); never LaTeX.
- Use the student's first name now and then, not every time.
Teaching rules:
- If they ask about a question that is on screen, do NOT give the answer. Give one hint or ask one guiding question.
- Never say whether their answer to an on-screen question is right or wrong: the app checks answers itself. You may explain ideas and mistakes in general.
- Stay on maths, learning and this app. If they drift, bring them back kindly in one sentence.
- If they are upset or stuck, be encouraging and suggest one small next step.
You can also move them around the app. Choose one action:
- "report" (their check-in report), "trail" (their 2-week trail), "today" (start or continue today's lesson), or "none".
Only pick an action when they clearly ask to go somewhere or start something.
Reply with JSON only: {"say": "...", "action": "none"}`;

// She only moves the student when they ask to go somewhere ("take me to…", "start…", "open my report").
const WANTS_TO_GO = /\b(take|go|open|show|start|begin|continue|let'?s|back to|move|bring|lead)\b/i;

async function think(said, context, history, retry = 0) {
  const messages = [{ role: "system", content: RULES + "\n\nWhat the app knows right now:\n" + JSON.stringify(context).slice(0, 6000) }];
  // Earlier turns go in as a short transcript: Sarvam's chat model returns an empty reply
  // when these long instructions are followed by separate user/assistant turns.
  const past = (history || []).slice(-10)
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && t.text)
    .map((t) => (t.role === "user" ? "Student: " : "Cogna: ") + String(t.text).slice(0, 400));
  messages.push({ role: "user", content: (past.length ? "The conversation so far:\n" + past.join("\n") + "\n\nThe student now says: " : "") + String(said).slice(0, 1000) });
  const useGemini = BRAIN === "gemini" || sarvamDown;
  const res = useGemini
    ? await fetch(LLM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: LLM_MODEL, messages, temperature: 0.6, max_tokens: 500, response_format: { type: "json_object" } }),
    })
    : await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": env.SARVAM_API_KEY },
      body: JSON.stringify({ model: "sarvam-105b-conversations", messages, temperature: 0.5, max_tokens: 600 }),
    });
  if (!useGemini && (res.status === 402 || res.status === 429)) { sarvamDown = true; console.error("sarvam has no credits: gemini thinks from here"); return think(said, context, history, retry); }
  if (!res.ok) throw new Error(`model ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const raw = j.choices?.[0]?.message?.content || "";
  if (!raw.trim()) {
    console.error("empty reply", JSON.stringify(j).slice(0, 300));
    if (retry < 1) return think(said, context, history, retry + 1);
  }
  let out;
  const m = raw.match(/\{[\s\S]*\}/);
  try { out = JSON.parse(m ? m[0] : raw); } catch { out = { say: raw.replace(/[{}"]/g, ""), action: "none" }; }
  const action = ["report", "trail", "today"].includes(out.action) && WANTS_TO_GO.test(said) ? out.action : "none";
  return { say: String(out.say || "").trim() || "Sorry, could you say that again?", action };
}

/** Pipe her voice for `text` into `res` as it is made. */
async function streamVoice(text, res, voice = VOICE) {
  let up;
  if (voice === "kiara") {
    up = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cartesia-Version": "2026-08-14", Authorization: `Bearer ${env.CARTESIA_API_KEY}` },
      body: JSON.stringify({ model_id: env.CARTESIA_MODEL || "sonic-3.6", transcript: spoken(text), language: "en",
        voice: { mode: "id", id: KIARA }, output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 } }),
    });
  } else {
    up = await fetch("https://api.sarvam.ai/text-to-speech/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": env.SARVAM_API_KEY },
      body: JSON.stringify({ text: spoken(text), target_language_code: "en-IN", speaker: "aparna_en_edtech",
        model: "bulbul:v4-flash", pace: 1, speech_sample_rate: 24000, output_audio_codec: "mp3" }),
    });
  }
  if (!up.ok) {
    const why = (await up.text()).slice(0, 160);
    if (voice === "kiara") { console.error(`kiara unavailable (${up.status}), using aparna: ${why}`); return streamVoice(text, res, "aparna"); }
    throw new Error(`voice ${up.status} ${why}`);
  }
  res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
  const reader = up.body.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); }
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/ping") return json(res, 200, { ok: true, brain: BRAIN, voice: VOICE });
    if (url.pathname === "/api/hear" && req.method === "POST") {
      const t0 = Date.now(); const text = await hear(await body(req));
      console.log(`heard (${Date.now() - t0} ms): ${text}`);
      return json(res, 200, { text });
    }
    if (url.pathname === "/api/talk" && req.method === "POST") {
      const t0 = Date.now();
      const { said, context, history } = JSON.parse((await body(req, 1e6)).toString("utf8") || "{}");
      const reply = await think(said, context, history);
      const token = Math.random().toString(36).slice(2);
      pendingVoice.set(token, reply.say);
      setTimeout(() => pendingVoice.delete(token), 60000);
      console.log(`said (${Date.now() - t0} ms think): ${reply.say} [${reply.action}]`);
      return json(res, 200, { ...reply, voice: `/api/voice?t=${token}` });
    }
    if (url.pathname === "/api/voice") {
      const text = pendingVoice.get(url.searchParams.get("t") || "");
      if (!text) return json(res, 404, { error: "no such line" });
      pendingVoice.delete(url.searchParams.get("t"));
      return await streamVoice(text, res);
    }
    // static files
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(url.pathname, e.message);
    json(res, 500, { error: e.message });
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`Cogna prototype with talking guide: http://127.0.0.1:${PORT}  (brain ${BRAIN === "gemini" ? LLM_MODEL : "sarvam-105b-conversations"}, voice ${VOICE})`));
