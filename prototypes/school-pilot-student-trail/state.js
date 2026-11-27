/* Cogna prototype — progress model + Cogna's mastery rule + save/load.
   CONTRACT FILE (owned by the orchestrator). Agents call this API, never edit it.

   Mastery rule (exact):
     right answer  -> rights += 1
     wrong answer  -> rights = 0 and status drops one level (secure -> shaky -> missing; untaught -> missing)
     rights >= 2   -> secure   |  rights == 1 -> shaky  |  rights == 0 (taught) -> missing
     becoming secure on day N  -> revisitDay = N + 2
   Mix-ups:
     tagged wrong answer -> seen++, fixedStreak = 0, byDay[day]++
     right answer on a question whose `guards` include the mix-up -> fixedStreak++ ; fixedStreak >= 2 -> fixed
*/
(function () {
  "use strict";
  var KEY = "cogna-trail-v1"; // suffixed per student at first use (see keyFor)
  function keyFor() { return KEY + "-" + (window.Cogna.studentId || "aarav"); }
  var memory = null; // in-memory fallback when localStorage is unavailable
  var S = null;

  var LEVEL_DOWN = { secure: "shaky", shaky: "missing", missing: "missing", untaught: "missing" };
  var DAY0_RIGHTS = { secure: 2, shaky: 1, missing: 0, untaught: 0 };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function fresh() {
    var d = window.Cogna.data;
    var skills = {};
    (d.skills || []).forEach(function (s) {
      skills[s.id] = { status: s.day0, rights: DAY0_RIGHTS[s.day0], revisitDay: null };
    });
    var mixups = {};
    (d.mixups || []).forEach(function (m) {
      mixups[m.id] = { seen: m.day0Seen || 0, fixedStreak: 0, fixed: false, byDay: { 0: m.day0Seen || 0 } };
    });
    return {
      version: 1,
      unlockedDay: 1,
      completedDays: [0],
      completedSteps: {},
      skills: skills,
      history: { 0: clone(skills) },
      mixups: mixups,
      confidence: [],
      explains: {},
      log: [],
      retest: {},
      plans: {},
    };
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(keyFor());
      if (raw) { var parsed = JSON.parse(raw); if (parsed && parsed.version === 1) return parsed; }
    } catch (e) { /* storage blocked */ }
    if (memory) return clone(memory);
    return null;
  }

  function save() {
    memory = clone(S);
    try { window.localStorage.setItem(keyFor(), JSON.stringify(S)); } catch (e) { /* storage blocked: memory only */ }
    window.Cogna.bus.emit("state:changed", S);
  }

  function ensure() { if (!S) S = load() || fresh(); return S; }

  function applyMastery(skillId, correct, day) {
    var sk = S.skills[skillId];
    if (!sk) return;
    var before = sk.status;
    if (correct) {
      sk.rights += 1;
      sk.status = sk.rights >= 2 ? "secure" : "shaky";
      if (sk.status === "secure" && before !== "secure") sk.revisitDay = day + 2;
    } else {
      sk.rights = 0;
      sk.status = LEVEL_DOWN[before] || "missing";
      sk.revisitDay = null;
      // rights stays 0 even when dropping to shaky: two fresh rights are needed to be secure again
    }
  }

  var api = {
    /** Load saved progress or build day-0 state. Called once by the router at boot. */
    init: function () { ensure(); return S; },

    /** Full state object. Treat as read-only. */
    get: function () { return ensure(); },

    /**
     * Record one answer.
     * info = { day, stepId, qid, skill, correct, mixup?, guards?, sure?, answer?, noMastery? }
     *  - mixup: id of the mix-up this wrong answer shows (only meaningful when correct === false)
     *  - guards: mix-up ids this question could have triggered (a right answer counts toward "fixed")
     *  - sure: true / false / undefined (confidence picked before checking)
     *  - noMastery: log it but do not move the skill meter (used by "try first" steps)
     */
    recordAnswer: function (info) {
      ensure();
      var day = info.day;
      if (!info.noMastery && info.skill) applyMastery(info.skill, !!info.correct, day);
      if (!info.correct && info.mixup && S.mixups[info.mixup]) {
        var m = S.mixups[info.mixup];
        m.seen += 1; m.fixedStreak = 0; m.fixed = false;
        m.byDay[day] = (m.byDay[day] || 0) + 1;
      }
      if (info.correct && info.guards) {
        info.guards.forEach(function (g) {
          var m = S.mixups[g];
          if (!m) return;
          m.fixedStreak += 1;
          if (m.fixedStreak >= 2) m.fixed = true;
        });
      }
      if (typeof info.sure === "boolean") {
        S.confidence.push({ day: day, skill: info.skill, sure: info.sure, correct: !!info.correct });
      }
      S.log.push({
        day: day, stepId: info.stepId, qid: info.qid, skill: info.skill,
        answer: info.answer === undefined ? null : info.answer,
        correct: !!info.correct, mixup: info.correct ? null : (info.mixup || null),
        sure: typeof info.sure === "boolean" ? info.sure : null, ts: Date.now(),
      });
      save();
    },

    /** First time a skill is taught (animation or worked example finished): untaught -> missing. */
    markTaught: function (skillId, day) {
      ensure();
      var sk = S.skills[skillId];
      if (sk && sk.status === "untaught") { sk.status = "missing"; sk.rights = 0; save(); }
    },

    /** info = { day, stepId, skill, text, verdict:'strong'|'close'|'nudge', saveAs? } */
    recordExplain: function (info) {
      ensure();
      S.explains[info.saveAs || String(info.day)] = info.text;
      if (info.verdict === "strong" && info.skill) {
        api.recordAnswer({ day: info.day, stepId: info.stepId, qid: info.stepId + "-explain", skill: info.skill, correct: true, answer: "(explanation)" });
      } else { save(); }
    },

    completeStep: function (day, stepId) {
      ensure();
      var list = S.completedSteps[day] = S.completedSteps[day] || [];
      if (list.indexOf(stepId) === -1) { list.push(stepId); save(); }
    },

    isStepDone: function (day, stepId) {
      ensure();
      return (S.completedSteps[day] || []).indexOf(stepId) !== -1;
    },

    /** Snapshot skills into history[day] and unlock the next day. */
    completeDay: function (day) {
      ensure();
      S.history[day] = clone(S.skills);
      if (S.completedDays.indexOf(day) === -1) S.completedDays.push(day);
      S.unlockedDay = Math.max(S.unlockedDay, Math.min(day + 1, 10));
      save();
    },

    isDayDone: function (day) { ensure(); return S.completedDays.indexOf(day) !== -1; },

    /** info = { qid, skill, correct, sure, answer, mixup?, guards? } — day is always 10. */
    recordRetest: function (info) {
      ensure();
      S.retest[info.qid] = { skill: info.skill, correct: !!info.correct, sure: info.sure, answer: info.answer, mixup: info.correct ? null : (info.mixup || null) };
      var copy = {}; Object.keys(info).forEach(function (k) { copy[k] = info[k]; });
      copy.day = 10; copy.stepId = "retest";
      api.recordAnswer(copy);
    },

    /** True if this mix-up was triggered by a wrong answer earlier in this day's session. */
    shouldShowFix: function (day, mixupId) {
      ensure();
      return S.log.some(function (e) { return e.day === day && e.mixup === mixupId && !e.correct; });
    },

    /** Skills whose revisit is due on or before `day` (and that are still secure). */
    revisitsDue: function (day) {
      ensure();
      return Object.keys(S.skills).filter(function (id) {
        var sk = S.skills[id];
        return sk.revisitDay !== null && sk.revisitDay <= day;
      });
    },

    /** Mark a skill's revisit as done (called after a right answer in a recall step). */
    clearRevisit: function (skillId) {
      ensure();
      if (S.skills[skillId]) { S.skills[skillId].revisitDay = null; save(); }
    },

    /** The made-for-you plan decided for a day (see plan.js), or null if that day hasn't been decided yet. */
    plan: function (day) { ensure(); return (S.plans && S.plans[day]) || null; },

    /** Save a day's plan. Decided once, when the day is first opened. */
    setPlan: function (day, rec) { ensure(); S.plans = S.plans || {}; S.plans[day] = rec; save(); },

    reset: function () {
      memory = null;
      try { window.localStorage.removeItem(keyFor()); } catch (e) { /* ignore */ }
      S = fresh();
      save();
    },
  };

  window.Cogna.state = api;
})();
