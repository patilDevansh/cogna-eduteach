/* Cogna guide — everything Maji the guide says, in one place.
   guide/guide.js reads these lines; tools/record-guide.mjs records every one of them
   (allLines() lists them all), so the words on screen and in the voice never drift apart.
   Placeholders are filled from the prototype's data: {first} is the student's first name,
   {n} and {title} are a day's number and title. */
(function () {
  "use strict";
  var C = window.Cogna;

  var L = {
    welcomeFirst: "Hi {first}! I'm Maji, and I'll be with you the whole way. Your check-in is done, so let's see what it found. Tap See my report.",
    welcomeBack: "Welcome back, {first}. Your report is right here.",

    // the report, one stop per section
    report: [
      "This is your report. Everything in it comes from your real answers in the check-in.",
      "These are your skills from June onwards. Tap any one to see exactly what you answered.",
      "Area builds on these five skills. Any that aren't ready yet get a quick fix in your first two days.",
      "These are mix-ups. They're patterns, not careless slips, and we'll fix each one together.",
      "This shows how sure you felt. Being sure but wrong is the one to watch.",
      "And this is your plan for the next two weeks. Tap See your trail when you're ready.",
    ],
    reportBack: "Your report is always here. Your trail is at the bottom.",

    trailFirst: "This is your trail. You go one day at a time, and finishing a day opens the next.",
    trailMeters: "Your skill meters live here. Watch them move as you learn.",
    trailToday: "Today is Day {n}: {title}. Tap it to start.",
    trailCheck: "Last one, {first}: the check-in again. Let's see how far you've come.",

    sessionStart: "Day {n}. {title}. I'm right here with you.",
    step: {
      recall: "A quick recall first. This is from before, so take your time.",
      try: "Have a go before I show you. It's fine to get it wrong.",
      worked: "Here's a worked example. Follow it one line at a time.",
      practice: "Your turn to practise. I'll tell you how each one goes.",
      game: "Game time! Play it as many times as you like.",
      explain: "Now explain it in your own words, the way you'd tell a friend.",
      exit: "Last part: the exit check. Show me what you've learnt today.",
      adaptive: "A few questions now. They get harder as you get them right.",
    },
    // shown in the bubble only: these steps have their own narration
    stepQuiet: {
      animation: "Watch and listen.",
      fix: "Let's fix this mix-up together.",
      rive: "Over to you. Tap the lesson and have a go.",
    },
    continueHint: "Nice. Tap Continue when you're ready.",

    right: ["Yes, that's right!", "Spot on.", "Nice one, well done."],
    wrong: "Not quite. Have another look.",
    wrongFinal: "Not quite. Read how it works, then on to the next one.",   // the answer is on screen now
    mixup: {
      slant: "Careful! That's the slanted side. The height goes straight up, at a right angle.",
      perim: "That's the distance around, the perimeter. Area counts the squares inside.",
      half: "Check the half. A triangle is half of a rectangle, but a parallelogram isn't.",
      units: "Check the units. One square metre is ten thousand square centimetres.",
      looks: "It looks bigger, but count the squares to be sure.",
      addsides: "Don't add the sides. Square them first, then add.",
      noroot: "Almost! That's c squared. Now take the square root.",
      wrongc: "Check which side is the longest. That one is c.",
    },

    dayDone: "Day {n} done! Here's what moved today.",
    retest: "This is the check-in again, {first}. Same kind of questions as before. Just do your best.",
    growth: "Look at this, {first}! This is how far you've come in two weeks.",
  };

  function fill(t, v) {
    return String(t).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] !== undefined ? v[k] : m; });
  }

  /** Every line the guide can say, filled in for every student and day (for the recorder). */
  function allLines() {
    var d = C.data, out = [];
    function add(t) { if (out.indexOf(t) === -1) out.push(t); }
    var students = d.students ? Object.keys(d.students).map(function (k) { return d.students[k]; }) : [d.student];
    var days = (d.days || []).filter(function (x) { return x.n >= 1 && x.n <= 9; });
    students.forEach(function (s) {
      var v = { first: String(s.name).split(" ")[0] };
      [L.welcomeFirst, L.welcomeBack, L.trailCheck, L.retest, L.growth].forEach(function (t) { add(fill(t, v)); });
    });
    L.report.forEach(add);
    [L.reportBack, L.trailFirst, L.trailMeters, L.continueHint, L.wrong].forEach(add);
    days.forEach(function (x) {
      var v = { n: x.n, title: x.title };
      add(fill(L.trailToday, v)); add(fill(L.sessionStart, v)); add(fill(L.dayDone, v));
    });
    Object.keys(L.step).forEach(function (k) { add(L.step[k]); });
    L.right.forEach(add);
    Object.keys(L.mixup).forEach(function (k) { add(L.mixup[k]); });
    return out;
  }

  C.guideScript = { lines: L, fill: fill, allLines: allLines };
})();
