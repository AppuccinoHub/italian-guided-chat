/* Italian guided chat — phrase chips, turn-taking, free Italian, English blocked.
   Level 4 is an open Italian chat (no guided steps). Unsafe language is flagged
   in safety.js and is not delivered. Modes: Practice alone / Try both sides /
   Join class (teacher.html is the PeerJS hub). */
(function () {
  var script = document.currentScript;
  var base = new URL("./", script && script.src ? script.src : location.href);

  var NOTE = "Mistakes stay on your screen. Your partner only sees the corrected Italian.";
  var BLOCKED = "That does not look like Italian yet. Try a phrase chip, or write a real Italian sentence.";
  var FREE = "Now write your own message in Italian.";
  var NO_PARTNER = "No partner is connected, so this stayed here. Use Try both sides, or Join class.";
  var WAITING = "Waiting for your partner.";
  var CLASS_FAIL = "Could not join the class. Ask the teacher to check that the hub says Live hub, then tap Join again.";
  var FLAG_COPY = {
    swear: "That message was not sent. Please keep this chat school-appropriate.",
    putdown: "That message was not sent. Please do not put people down.",
    harm: "That message was not sent. If someone might get hurt, tell a teacher or another trusted adult right away."
  };

  var SWAPS = [
    { label: "hello -> Ciao!", keys: ["hello"], it: "Ciao!" },
    { label: "how are you -> Come stai?", keys: ["how are you"], it: "Come stai?" },
    { label: "I am good / I'm good -> Sto bene.", keys: ["i am good", "i'm good"], it: "Sto bene." },
    { label: "yes -> Sì.", keys: ["yes"], it: "Sì." },
    { label: "no -> No.", keys: ["no"], it: "No." },
    { label: "thanks -> Grazie!", keys: ["thanks"], it: "Grazie!" },
    { label: "I do not know -> Non lo so.", keys: ["i do not know"], it: "Non lo so." }
  ];

  var EN_FUNC = Object.create(null);
  ("i am is are you the a an my your we they have has do does did what where when how why yes no thanks please want need like hungry thirsty today tomorrow weekend").split(/\s+/).forEach(function (w) {
    EN_FUNC[w] = true;
  });

  var LEVEL_ORDER = ["1", "2", "3", "4", "AP"];
  var state = {
    conversations: [],
    convo: null,
    level: "1",
    step: 0,
    mode: "solo",
    both: false,
    standalone: false,
    students: {},
    italian: Object.create(null),
    phraseMap: null,
    cls: null
  };

  /* ---------- text helpers ---------- */
  function foldIt(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[\u2019\u2018`]/g, "'").replace(/\s+/g, " ").trim();
  }
  function matchKey(s) {
    return foldIt(s).replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function foldEn(s) {
    return String(s || "").toLowerCase().replace(/[\u2019\u2018`]/g, "'").replace(/[?!.,;:]+/g, "")
      .replace(/\s+/g, " ").trim();
  }
  function wordTokens(text) {
    var raw = String(text || "").toLowerCase().replace(/[\u2019\u2018`]/g, "'");
    var m = raw.match(/[a-z\u00e0-\u024f']+/g);
    if (!m) return [];
    return m.map(function (w) { return w.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); });
  }
  function learnWord(raw) {
    var k = foldIt(raw).replace(/[^a-z']/g, "");
    if (!k) return;
    state.italian[k] = true;
    k.split("'").forEach(function (bit) { if (bit) state.italian[bit] = true; });
  }
  function learnPhrase(phrase) {
    String(phrase).split(/[^A-Za-z\u00C0-\u024F'\u2019]+/).forEach(function (part) { if (part) learnWord(part); });
  }
  function rebuildMap() {
    var map = Object.create(null);
    var phrases = [];
    (state.convo.steps || []).forEach(function (step) {
      (step.chips || []).forEach(function (chip) { phrases.push(chip); });
    });
    (state.convo.suggestions || []).forEach(function (chip) { phrases.push(chip); });
    SWAPS.forEach(function (swap) { phrases.push(swap.it); });
    phrases.forEach(function (phrase) {
      var key = matchKey(phrase);
      if (key && !map[key]) map[key] = phrase;
    });
    state.phraseMap = map;
  }
  function canonical(text) {
    if (!state.phraseMap) return null;
    var key = matchKey(text);
    return key ? state.phraseMap[key] || null : null;
  }
  function matchSwap(text) {
    var key = foldEn(text);
    for (var i = 0; i < SWAPS.length; i++) {
      if (SWAPS[i].keys.indexOf(key) !== -1) return SWAPS[i];
    }
    return null;
  }
  function isEnglish(text) {
    if (matchSwap(text)) return true;
    var words = wordTokens(text);
    for (var i = 0; i < words.length; i++) { if (EN_FUNC[words[i]]) return true; }
    return false;
  }
  function isGibberish(text) {
    if (/[\u00C0-\u024F]/.test(String(text || ""))) return false;
    var words = wordTokens(text);
    if (!words.length) return true;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (state.italian[w]) return false;
      if (w.length < 2) continue;
      if (!/[aeiou]/.test(w) || !/[bcdfghjklmnpqrstvwxyz]/.test(w)) continue;
      if (/^[qwertyuiop]+$/.test(w) || /^[asdfghjkl]+$/.test(w) || /^[zxcvbnm]+$/.test(w)) continue;
      return false;
    }
    return true;
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "class") node.className = attrs[key];
        else if (key === "text") node.textContent = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    for (var i = 2; i < arguments.length; i++) { if (arguments[i]) node.appendChild(arguments[i]); }
    return node;
  }
  function q(sel) { return document.querySelector("#italian-guided-chat " + sel); }

  /* ---------- look: Chromebook chat column (dark Solo tokens, no phone bezel) ---------- */
  function injectCss() {
    if (document.getElementById("guided-chat-css")) return;
    var style = document.createElement("style");
    style.id = "guided-chat-css";
    var R = "#italian-guided-chat";
    style.textContent = [
      "html.guided-fill, html.guided-fill body { height:100%; margin:0; overflow:hidden; background:#0a0a0c; }",
      "html.guided-fill " + R + " { height:100%; min-height:0; }",
      R + " { --bg-page:#0a0a0c; --bg:#000; --bar:#1c1c1e; --them:#262629; --me:#0a84ff; --text:#fff; --dim:#aeaeb2; --soft:#c7c7cc; --chip:#2c2c2e; --chip-border:#3a3a3c; --field:#1c1c1e; --orange:#ff9f0a; --red:#ff453a; --green:#30d158;",
      "  box-sizing:border-box; min-height:640px; height:100%; display:flex; flex-direction:column; background:var(--bg-page); color:var(--text); color-scheme:dark;",
      "  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; }",
      R + " * { box-sizing:border-box; }",
      R + " button, " + R + " input, " + R + " select { font:inherit; color:inherit; }",
      R + " [hidden] { display:none !important; }",
      R + " .toolbar { flex-shrink:0; display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:center; padding:8px 12px; background:var(--bar); border-bottom:1px solid rgba(84,84,88,.55); }",
      R + " .toolbar label { display:flex; align-items:center; gap:6px; font-size:15px; color:var(--soft); }",
      R + " .toolbar select { min-height:36px; background:var(--chip); border:1px solid var(--chip-border); border-radius:10px; padding:4px 8px; }",
      R + " .toolbar select:disabled { opacity:.6; }",
      R + " .modes { display:flex; background:var(--chip); border:1px solid var(--chip-border); border-radius:12px; padding:2px; gap:2px; }",
      R + " .modes button { min-height:34px; background:transparent; border:0; border-radius:10px; padding:6px 12px; cursor:pointer; font-size:15px; font-weight:600; color:var(--soft); }",
      R + " .modes button[aria-pressed='true'] { background:var(--me); color:#fff; }",
      R + " .joinbar { flex-shrink:0; display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:center; padding:8px 12px; background:var(--bar); border-bottom:1px solid rgba(84,84,88,.35); }",
      R + " .joinbar input { min-height:40px; background:var(--field); border:1px solid var(--chip-border); border-radius:12px; padding:8px 10px; font-size:16px; }",
      R + " .joinbar input[data-role='join-code'] { width:7.5rem; letter-spacing:.15em; text-transform:uppercase; font-weight:700; }",
      R + " .joinbar input[data-role='join-name'] { width:10rem; }",
      R + " .joinbar button { min-height:40px; background:var(--me); color:#fff; border:0; border-radius:12px; padding:8px 14px; font-weight:700; cursor:pointer; }",
      R + " .joinbar button.quiet { background:var(--chip); color:var(--text); border:1px solid var(--chip-border); }",
      R + " .class-status { flex:1 1 100%; text-align:center; margin:0; font-size:15px; color:var(--soft); }",
      R + " .stage { flex:1; min-height:0; display:flex; justify-content:center; align-items:flex-start; padding:18px 20px 20px; overflow:hidden; }",
      R + " .desk { display:flex; align-items:stretch; justify-content:center; gap:18px; width:min(1120px, 100%); height:100%; max-height:100%; min-height:0; }",
      R + " .student { position:relative; flex:1 1 720px; width:auto; max-width:840px; min-width:0; min-height:0; height:100%; max-height:100%; display:flex; flex-direction:column; background:var(--bg); overflow:hidden; border:1px solid #2c2c2e; border-radius:20px; box-shadow:0 16px 40px rgba(0,0,0,.35); }",
      R + " .tips { flex:0 0 280px; width:280px; max-height:100%; overflow:auto; background:#141416; border:1px solid #2c2c2e; border-radius:20px; padding:16px 16px 18px; }",
      R + " .tips h2 { margin:0 0 8px; font-size:18px; line-height:1.25; }",
      R + " .tips-who { margin:0 0 12px; color:#fff; font-size:15px; font-weight:650; line-height:1.35; }",
      R + " .tips ul { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:8px; }",
      R + " .tips li { margin:0; padding:10px 12px; background:#1c1c1e; border:1px solid #3a3a3c; border-radius:12px; color:var(--soft); font-size:14px; line-height:1.4; }",
      R + " .stage.both .tips { display:none; }",
      R + " .stage.both .desk { width:min(1080px, 100%); }",
      R + " .stage.both .student { max-width:520px; }",
      "@media (max-width:900px) { " + R + " .tips { display:none; } " + R + " .student, " + R + " .stage.both .student { max-width:none; } " + R + " .stage.both .desk { flex-direction:column; align-items:stretch; } }",
      R + " .who { display:flex; flex-direction:row; align-items:center; gap:12px; padding:10px 18px; background:rgba(28,28,30,.92); border-bottom:1px solid rgba(84,84,88,.55); flex-shrink:0; }",
      R + " .avatar { width:44px; height:44px; border-radius:50%; display:grid; place-items:center; font-weight:650; font-size:18px; color:#fff; background:linear-gradient(145deg,#64d2ff,#007AFF); flex-shrink:0; }",
      R + " .student[data-student='B'] .avatar { background:linear-gradient(145deg,#30d158,#64d2ff); }",
      R + " .who-text { display:flex; flex-direction:column; gap:2px; min-width:0; }",
      R + " .who-name { font-size:17px; font-weight:650; line-height:1.2; }",
      R + " .who-title { color:var(--soft); font-size:14px; line-height:1.3; }",
      R + " .note { flex-shrink:0; margin:0; color:var(--soft); padding:8px 16px; font-size:14px; line-height:1.35; text-align:center; }",
      R + " .toast-line { margin:0; padding:8px 12px; text-align:center; font-weight:700; color:#1c1400; background:#ffd60a; }",
      R + " .rotate-clock { flex-shrink:0; margin:0; padding:4px 12px; text-align:center; font-size:13px; font-weight:750; letter-spacing:.01em; color:#1c1400; background:#ffd60a; }",
      R + " .rotate-clock.paused { background:#ff9f0a; color:#1c1400; }",
      R + " .rotate-clock.bye { background:#0a84ff; color:#fff; }",
      R + " .today-q { flex-shrink:0; margin:0; padding:8px 14px; background:#1c1c1e; border-bottom:1px solid #3a3a3c; font-size:14px; line-height:1.35; }",
      R + " .today-q b { color:#ffd60a; }",
      R + " .thread { flex:1 1 auto; min-height:0; overflow:auto; padding:12px 14px; display:flex; flex-direction:column; gap:8px; }",
      R + " .thread-spacer { margin-top:auto; flex:0 0 0; }",
      R + " .empty { color:var(--soft); font-size:15px; line-height:1.4; text-align:left; margin:0; padding:12px 14px; background:#141416; border:1px solid #2c2c2e; border-radius:14px; }",
      R + " .bubble { max-width:36rem; padding:8px 14px; border-radius:18px; font-size:17px; line-height:1.35; word-break:break-word; }",
      R + " .bubble.me { align-self:flex-end; background:var(--me); color:#fff; border-bottom-right-radius:5px; }",
      R + " .bubble.them { align-self:flex-start; background:var(--them); color:#fff; border-bottom-left-radius:5px; }",
      R + " .bubble.pending { align-self:flex-end; background:transparent; color:var(--text); border:1.5px dashed var(--orange); border-bottom-right-radius:5px; }",
      R + " .bubble .why { display:block; margin-top:5px; font-size:13px; font-weight:650; color:var(--orange); }",
      R + " .dock { flex-shrink:0; display:flex; flex-direction:column; background:var(--bg); border-top:1px solid rgba(84,84,88,.55); }",
      R + " .prompt { margin:0; padding:10px 18px 0; font-size:16px; line-height:1.4; color:#fff; }",
      R + " .prompt .step { color:var(--soft); }",
      R + " .prompt .open-prompt { font-weight:650; }",
      R + " .prompt .waiting { color:var(--orange); font-weight:650; }",
      R + " .chips { display:flex; flex-wrap:wrap; gap:8px; padding:8px 16px 2px; }",
      R + " .chips:empty { display:none; }",
      R + " .chips button, " + R + " .swap button { min-height:38px; border-radius:999px; border:1px solid var(--chip-border); background:var(--chip); color:#fff; font-weight:650; padding:7px 14px; cursor:pointer; font-size:15px; }",
      R + " .chips button:active, " + R + " .swap button:active { background:#3a3a3c; }",
      R + " .help { margin:8px 16px; background:#3a1d1b; color:#ffd7d4; border:1px solid #5c2a27; border-radius:14px; padding:8px 12px; max-height:140px; overflow:auto; font-size:15px; line-height:1.4; }",
      R + " .help.flag { background:#2c2414; color:#ffe8c2; border-color:#7a5b20; }",
      R + " .help.flag.harm { background:#3a1d1b; color:#ffd7d4; border-color:#5c2a27; }",
      R + " .help-lead { margin:0 0 6px; font-weight:650; }",
      R + " .help.flag .help-lead { margin:0; }",
      R + " .help-label { margin:0 0 4px; color:#ff9f8f; font-size:13px; font-weight:700; }",
      R + " .swap { display:flex; align-items:center; gap:6px; margin:4px 0; }",
      R + " .swap.match button { outline:2px solid var(--orange); }",
      R + " .composer { display:flex; gap:8px; padding:8px 16px 12px; flex-shrink:0; }",
      R + " .composer input { flex:1; min-width:0; border-radius:20px; border:1px solid var(--chip-border); background:var(--field); padding:10px 14px; font-size:16px; }",
      R + " .composer input:focus { outline:0; border-color:var(--me); }",
      R + " .composer button { background:var(--me); color:#fff; border:0; border-radius:20px; min-width:72px; min-height:42px; font-weight:700; cursor:pointer; }",
      R + " .composer input:disabled, " + R + " .composer button:disabled { opacity:.45; cursor:default; }",
      R + " .idle-nudge { margin:8px 16px 0; background:#2c2414; color:#ffe8c2; border:1px solid #7a5b20; border-radius:14px; padding:8px 12px; font-size:14px; line-height:1.4; }",
      R + " .idea-row { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }",
      R + " .bubble .del { margin-left:8px; border:0; background:transparent; color:inherit; font-size:12px; font-weight:700; cursor:pointer; text-decoration:underline; }",
      R + " .bubble mark { background:transparent; color:#ffd60a; font-weight:750; }",
      R + " .gloss { flex:0 0 280px; width:280px; max-height:100%; overflow:auto; background:#141416; border:1px solid #2c2c2e; border-radius:20px; padding:14px; }",
      R + " .gloss h2 { margin:0 0 6px; font-size:18px; }",
      R + " .gloss p { margin:0 0 8px; color:var(--soft); font-size:14px; line-height:1.4; }",
      R + " .gloss input { width:100%; min-height:40px; border-radius:12px; border:1px solid #3a3a3c; background:#1c1c1e; padding:8px 10px; }",
      R + " .gloss-hit { display:block; width:100%; text-align:left; margin-top:6px; }",
      R + " @media (max-width:900px) { " + R + " .gloss { flex:1 1 auto; width:auto; max-height:220px; } }",
      R + " button:focus-visible, " + R + " input:focus-visible, " + R + " select:focus-visible { outline:3px solid var(--orange); outline-offset:2px; }"
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ---------- threads ---------- */
  function emptyCopy() {
    if (state.convo && isOpenConvo()) return "No messages yet. Type your own Italian, or tap an idea below.";
    return "No messages yet. Tap a phrase below, or type it in Italian.";
  }
  function clearThread(student) {
    var thread = student.root.querySelector("[data-role='thread']");
    thread.textContent = "";
    thread.appendChild(el("div", { class: "thread-spacer", "data-role": "thread-spacer" }));
    thread.appendChild(el("p", { class: "empty", "data-role": "empty", text: emptyCopy() }));
    student.step = 0;
    hideHelp(student);
  }
  function hideHelp(student) {
    var help = student.root.querySelector("[data-role='help']");
    help.hidden = true;
    help.className = "help";
    help.textContent = "";
  }
  function nearBottom(thread) {
    return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 48;
  }
  function scrollThread(student, force) {
    var thread = student.root.querySelector("[data-role='thread']");
    if (force || thread.getAttribute("data-stick") !== "no") thread.scrollTop = thread.scrollHeight;
  }
  function watchThread(student) {
    var thread = student.root.querySelector("[data-role='thread']");
    if (thread.getAttribute("data-watched") === "yes") return;
    thread.setAttribute("data-watched", "yes");
    thread.addEventListener("scroll", function () {
      thread.setAttribute("data-stick", nearBottom(thread) ? "yes" : "no");
    });
  }
  function addBubble(studentId, text, kind, pendingWhy, opts) {
    var student = state.students[studentId];
    if (!student) return;
    opts = opts || {};
    var thread = student.root.querySelector("[data-role='thread']");
    watchThread(student);
    var stick = nearBottom(thread);
    var empty = thread.querySelector("[data-role='empty']");
    if (empty) empty.remove();
    var bubble = document.createElement("div");
    bubble.className = "bubble " + (pendingWhy && !opts.sent ? "pending" : kind);
    bubble.setAttribute("data-text", text);
    bubble.setAttribute("data-sent", opts.sent || !pendingWhy ? "true" : "false");
    if (opts.lineId) bubble.setAttribute("data-line-id", opts.lineId);
    if (opts.mine) bubble.setAttribute("data-mine", "yes");
    if (opts.from) bubble.setAttribute("data-from", opts.from);
    var line = el("span", { class: "line", text: text });
    bubble.appendChild(line);
    if (opts.from) bubble.insertBefore(el("span", { class: "why", text: opts.from }), line);
    if (pendingWhy) {
      bubble.setAttribute("data-why", pendingWhy);
      bubble.appendChild(el("span", { class: "why", text: pendingWhy }));
    }
    if (opts.mine && opts.sent) {
      var del = el("button", { type: "button", class: "del", "data-delete-line": opts.lineId, text: "Delete" });
      bubble.appendChild(del);
    }
    thread.appendChild(bubble);
    scrollThread(student, opts.force || stick);
    try { rememberThread(); } catch (e) {}
  }
  function rememberThread() {
    var msgs = [];
    document.querySelectorAll("#italian-guided-chat [data-student='A'] .bubble").forEach(function (b) {
      msgs.push({
        text: b.getAttribute("data-text") || "",
        kind: /\bme\b/.test(b.className) ? "me" : "them",
        from: b.getAttribute("data-from") || "",
        why: b.getAttribute("data-why") || ""
      });
    });
    try { sessionStorage.setItem("italianGuidedThread", JSON.stringify(msgs.slice(-40))); } catch (e) {}
  }
  function restoreThread() {
    if (!state.students.A) return;
    var raw = null;
    try { raw = sessionStorage.getItem("italianGuidedThread"); } catch (e) { return; }
    if (!raw) return;
    var msgs = [];
    try { msgs = JSON.parse(raw) || []; } catch (e) { return; }
    msgs.slice(-40).forEach(function (m) {
      if (!m || !m.text) return;
      var mine = m.kind === "me";
      addBubble("A", m.text, mine ? "me" : "them", m.why || "", { sent: !m.why, mine: mine, from: m.from || "" });
    });
  }

  /* ---------- turns ---------- */
  function classPaired() {
    var c = state.cls;
    return !!(c && c.pairId && c.conn && c.conn.open);
  }
  function chatFrozen() {
    var c = state.cls;
    return !!(state.mode === "class" && c && (c.classFrozen || c.pairFrozen));
  }
  function shared() { return state.both || classPaired(); }
  function stepOf(student) { return shared() ? state.step : student.step; }
  function isOpenConvo() {
    var c = state.convo;
    if (c && (c.open === true || String(c.level) === "4")) return true;
    return String(state.level) === "4";
  }
  function openPrompt() {
    var ideas = (state.convo && state.convo.suggestions) || [];
    return ideas.length
      ? "Open Italian chat. Type whatever you want in Italian. The ideas below are optional."
      : "Open Italian chat. Type whatever you want in Italian.";
  }
  function groupSize() {
    if (state.both) return 2;
    var n = state.cls && state.cls.groupSize;
    return n && n > 1 ? n : 2;
  }
  function roleIndex(student) {
    if (state.both) return student.id === "A" ? 0 : 1;
    return (state.cls && typeof state.cls.roleIndex === "number") ? state.cls.roleIndex : (state.cls && state.cls.role === "second" ? 1 : 0);
  }
  function hasTurn(student) {
    if (isOpenConvo()) return true;
    if (!shared()) return true;
    var steps = state.convo.steps || [];
    if (state.step >= steps.length) return true;
    var size = groupSize();
    return (state.step % size) === roleIndex(student);
  }
  function chipsFor(student) {
    if (isOpenConvo()) return ((state.convo && state.convo.suggestions) || []).slice();
    var steps = state.convo.steps || [];
    var step = stepOf(student);
    if (step >= steps.length) {
      var seen = Object.create(null);
      var all = [];
      steps.forEach(function (s) {
        (s.chips || []).forEach(function (chip) { if (!seen[chip]) { seen[chip] = true; all.push(chip); } });
      });
      return all;
    }
    if (!hasTurn(student)) return [];
    return steps[step].chips || [];
  }
  function whoLabel(student) {
    if (state.mode === "class" && state.cls) {
      var names = state.cls.partners || (state.cls.partner ? [state.cls.partner] : []);
      if (names.length) return names.join(" + ");
      return state.cls.name || "You";
    }
    return student.id === "A" ? "Student A" : "Student B";
  }
  function renderChrome(student) {
    var steps = state.convo.steps || [];
    var prompt = student.root.querySelector("[data-role='prompt']");
    prompt.textContent = "";
    var step = stepOf(student);
    var turn = hasTurn(student);
    student.root.setAttribute("data-turn", turn ? "yes" : "no");
    student.root.setAttribute("data-open", isOpenConvo() ? "yes" : "no");
    if (chatFrozen()) {
      prompt.appendChild(el("span", { "data-role": "prompt-text", class: "waiting", text: "Teacher paused chat." }));
    } else if (state.mode === "class" && state.cls && state.cls.phase === "goodbye" && classPaired()) {
      prompt.appendChild(el("span", { "data-role": "prompt-text", class: "waiting", text: "Time to say goodbye in Italian." }));
    } else if (state.mode === "class" && !classPaired()) {
      var waitingText = "Join your teacher's class to start.";
      if (state.cls && state.cls.joined) waitingText = "Waiting for the teacher to pair you.";
      else if (state.cls) waitingText = "Joining the class. If this stays here, tap Reconnect.";
      prompt.appendChild(el("span", { "data-role": "prompt-text", class: "waiting", text: waitingText }));
    } else if (isOpenConvo()) {
      prompt.appendChild(el("span", { "data-role": "prompt-text", class: "open-prompt", text: openPrompt() }));
    } else if (step >= steps.length) {
      prompt.appendChild(el("span", { "data-role": "prompt-text", text: FREE }));
    } else if (!turn) {
      prompt.appendChild(el("span", { class: "step", text: "Step " + (step + 1) + " of " + steps.length + ". " }));
      prompt.appendChild(el("span", { "data-role": "prompt-text", class: "waiting", text: WAITING }));
    } else {
      prompt.appendChild(el("span", { class: "step", text: "Step " + (step + 1) + " of " + steps.length + ". " }));
      prompt.appendChild(el("span", { "data-role": "prompt-text", text: steps[step].prompt }));
    }
    var box = student.root.querySelector("[data-role='chips']");
    box.textContent = "";
    var chipSource = chipsFor(student);
    if (state.mode === "class" && state.cls && state.cls.phase === "goodbye" && classPaired() && window.IgcCoach) chipSource = IgcCoach.goodbyeList();
    if (!chatFrozen() && !(state.mode === "class" && !classPaired())) {
      chipSource.forEach(function (chip) {
        box.appendChild(el("button", { type: "button", "data-chip": chip, text: chip }));
      });
    }
    var frozenNow = chatFrozen();
    student.root.setAttribute("data-frozen", frozenNow ? "yes" : "no");
    var composer = student.root.querySelector("[data-role='composer']");
    var sendBtn = student.root.querySelector("[data-role='send']");
    if (composer) composer.disabled = frozenNow;
    if (sendBtn) sendBtn.disabled = frozenNow;
    var name = whoLabel(student);
    student.root.querySelector("[data-role='who-name']").textContent = name;
    student.root.querySelector("[data-role='avatar']").textContent = (name.charAt(0) || "?").toUpperCase();
    student.root.querySelector("[data-role='title']").textContent = state.convo.title || "";
    var empty = student.root.querySelector("[data-role='empty']");
    if (empty) empty.textContent = emptyCopy();
  }
  function renderTips() {
    var aside = q("[data-role='tips']");
    if (!aside) return;
    var title = aside.querySelector("[data-role='tips-title']");
    var who = aside.querySelector("[data-role='tips-who']");
    var list = aside.querySelector("[data-role='tips-list']");
    var lines;
    if (isOpenConvo()) {
      title.textContent = "Open Italian chat";
      lines = [
        "Write whatever you want in Italian.",
        "Idea buttons are optional.",
        "Your partner only sees Italian that was sent.",
        "Unkind or unsafe words are not sent. Your teacher sees a flag."
      ];
    } else {
      title.textContent = (state.convo && state.convo.title) || "Guided chat";
      lines = [
        "Follow the step under the messages.",
        "Tap a phrase, or type that Italian yourself.",
        "When it is your partner's turn, wait.",
        "English stays on your screen."
      ];
    }
    var partner = "Practice on this computer.";
    if (state.both) partner = "You are trying both sides on this computer.";
    else if (state.mode === "class") {
      if (chatFrozen()) partner = "Teacher paused chat.";
      else if (state.cls && classPaired()) partner = "Paired with " + state.cls.partner + ".";
      else if (state.cls && state.cls.joined) partner = "Waiting for the teacher to pair you.";
      else partner = state.linkLevel ? "Level " + state.linkLevel + " class link. Enter your name and tap Join." : "Enter your name and tap Join.";
    }
    who.textContent = partner;
    list.textContent = "";
    lines.forEach(function (line) { list.appendChild(el("li", { text: line })); });
  }
  function renderToday() {
    var text = (state.cls && state.cls.question) || "";
    ["A", "B"].forEach(function (id) {
      var student = state.students[id];
      if (!student) return;
      var node = student.root.querySelector("[data-role='today-q']");
      if (!node) return;
      if (!text || state.mode !== "class") { node.hidden = true; return; }
      node.hidden = false;
      node.textContent = "";
      node.appendChild(el("b", { text: "Today's question — ask your partner: " }));
      node.appendChild(document.createTextNode(text));
    });
  }
  function renderAll() {
    ["A", "B"].forEach(function (id) { if (state.students[id]) renderChrome(state.students[id]); });
    renderTips();
    renderToday();
    renderClock();
  }
  function maybeAdvanceShared(student, canon) {
    var steps = state.convo.steps || [];
    if (state.step >= steps.length || !hasTurn(student)) return;
    if ((steps[state.step].chips || []).indexOf(canon) !== -1) state.step += 1;
  }
  function maybeAdvance(student, canon) {
    var steps = state.convo.steps || [];
    if (student.step >= steps.length) return;
    if ((steps[student.step].chips || []).indexOf(canon) !== -1) student.step += 1;
  }
  function resetConversation() {
    state.step = 0;
    ["A", "B"].forEach(function (id) { if (state.students[id]) clearThread(state.students[id]); });
    renderAll();
  }

  /* ---------- sending ---------- */
  function cross(fromId, line, lineId, original) {
    if (state.both) {
      addBubble(fromId === "A" ? "B" : "A", line, "them", null, { lineId: lineId, from: state.students[fromId] ? (fromId === "A" ? "Student A" : "Student B") : "" });
      return;
    }
    if (classPaired()) {
      classSend({
        type: "line", pairId: state.cls.pairId, from: state.cls.name, text: line, original: original || line,
        lineId: lineId, step: state.step, level: state.level, convoId: state.convo && state.convo.id, at: Date.now(),
        answeredQuestion: !!answeredToday(line)
      });
    }
  }
  function deliver(student, line, advanceWith) {
    deliverCorrected(student, line, line, advanceWith, "");
  }
  function deliverCorrected(student, shown, outgoing, advanceWith, why) {
    hideHelp(student);
    hideIdle();
    var lineId = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (shared()) {
      addBubble(student.id, shown, "me", why || null, { lineId: lineId, mine: true, sent: true, force: true });
      if (advanceWith) maybeAdvanceShared(student, advanceWith || outgoing);
      cross(student.id, outgoing, lineId, shown);
      noteActivity();
      renderAll();
    } else {
      addBubble(student.id, shown, "me", why || (state.mode === "class" ? "You are not paired yet, so this stayed here." : NO_PARTNER), { lineId: lineId, mine: true });
      if (advanceWith && state.mode !== "class") maybeAdvance(student, advanceWith);
      renderChrome(student);
    }
  }
  function showSwapList(help, match) {
    help.appendChild(el("p", { class: "help-label", text: "Known swaps" }));
    SWAPS.forEach(function (swap) {
      var row = el("div", { class: "swap" + (match && match.it === swap.it ? " match" : "") });
      row.appendChild(el("span", { text: swap.label.split(" -> ")[0] + " -> " }));
      row.appendChild(el("button", { type: "button", "data-chip": swap.it, text: swap.it }));
      help.appendChild(row);
    });
  }
  function showEnglishHelp(student, raw, swap) {
    var lead = swap ? "Write it in Italian." : "Write it in Italian. I do not have that phrase yet. Tap a phrase chip.";
    addBubble(student.id, raw, "me", lead);
    var help = student.root.querySelector("[data-role='help']");
    help.hidden = false;
    help.className = "help";
    help.textContent = "";
    help.appendChild(el("p", { class: "help-lead", text: lead }));
    showSwapList(help, swap);
    scrollThread(student);
  }
  function showBlocked(student, raw) {
    addBubble(student.id, raw, "me", BLOCKED);
    var help = student.root.querySelector("[data-role='help']");
    help.hidden = false;
    help.className = "help";
    help.textContent = "";
    help.appendChild(el("p", { class: "help-lead", text: BLOCKED }));
    scrollThread(student);
  }
  function flagNotice(category, told) {
    var base = FLAG_COPY[category] || FLAG_COPY.swear;
    if (told) return base + " Your teacher was notified.";
    if (state.mode === "class") return base + " Your teacher will see the flag when the class connection is working.";
    return base;
  }
  function showFlag(student, category, told) {
    var help = student.root.querySelector("[data-role='help']");
    help.hidden = false;
    help.className = "help flag" + (category === "harm" ? " harm" : "");
    help.textContent = "";
    help.appendChild(el("p", { class: "help-lead", text: flagNotice(category, told) }));
  }
  function holdFlag(student, text, hit) {
    var told = false;
    if (state.mode === "class" && state.cls) {
      told = classSend({
        type: "flag",
        pairId: state.cls.pairId || null,
        from: state.cls.name,
        text: String(text).slice(0, 300),
        category: hit.category,
        level: state.level,
        convoId: state.convo && state.convo.id,
        at: Date.now()
      });
    }
    showFlag(student, hit.category, told);
  }
  function safetyHit(text) {
    return window.IgcSafety && window.IgcSafety.scan(text);
  }
  function coachPrep() {
    if (!window.IgcCoach) return null;
    if (!state.coachPrep) state.coachPrep = IgcCoach.prepare(state.conversations || []);
    return state.coachPrep;
  }
  function phrasePool() {
    var pool = [];
    var seen = Object.create(null);
    function add(list) {
      (list || []).forEach(function (p) {
        var k = window.IgcCoach ? IgcCoach.fold(p) : p;
        if (!k || seen[k]) return;
        seen[k] = true;
        pool.push(p);
      });
    }
    var convo = state.convo;
    if (convo) {
      var steps = convo.steps || [];
      var step = steps[state.step] || steps[0];
      if (step) add(step.chips);
      steps.forEach(function (s) { add(s.chips); });
      add(convo.suggestions);
    }
    convosFor(state.level).forEach(function (c) {
      (c.steps || []).forEach(function (s) { add(s.chips); });
      add(c.suggestions);
    });
    return pool;
  }
  function partnerAskedQuestion() {
    var last = state.lastIncoming || "";
    if (window.IgcCoach && IgcCoach.isQuestion(last)) return true;
    var q = state.cls && state.cls.question;
    return !!(q && window.IgcCoach && IgcCoach.fold(last) === IgcCoach.fold(q));
  }
  function currentStarters() {
    var list = (state.cls && state.cls.starters) || [];
    return list.filter(Boolean);
  }
  function ideaList(asAnswers) {
    if (asAnswers && partnerAskedQuestion() && currentStarters().length) return currentStarters().slice(0, 4);
    if (String(state.level) === "3") {
      var bank = (state.questions || []).filter(function (q) { return String(q.level) === "3"; });
      if (asAnswers) {
        var starters = [];
        bank.forEach(function (q) { (q.starters || []).forEach(function (s) { starters.push(s); }); });
        if (starters.length >= 2) return starters.slice(0, 4);
      } else {
        var qs = bank.map(function (q) { return q.q; }).filter(Boolean);
        if (qs.length >= 2) return qs.slice(0, 4);
      }
    }
    var pool = phrasePool();
    var wantQ = !asAnswers;
    var picked = pool.filter(function (p) { return (window.IgcCoach ? IgcCoach.isQuestion(p) : /\?\s*$/.test(p)) === wantQ; });
    if (picked.length < 2) picked = pool;
    return picked.slice(0, 4);
  }
  function starterStem(s) {
    return String(s || "").replace(/[…\.]+$/g, "").trim();
  }
  function extraWords(text, stem) {
    var rest = String(text || "").slice(stem.length);
    var toks = window.IgcCoach ? IgcCoach.tokens(rest) : rest.trim().split(/\s+/);
    return toks.filter(Boolean).length;
  }
  function starterBlock(text) {
    var stems = currentStarters();
    var built = (state.questions || []).filter(function (q) {
      return state.cls && state.cls.question && window.IgcCoach && IgcCoach.fold(q.q) === IgcCoach.fold(state.cls.question);
    })[0];
    for (var i = 0; i < stems.length; i++) {
      var stem = starterStem(stems[i]);
      if (!stem) continue;
      var folded = window.IgcCoach ? IgcCoach.fold(text) : text.toLowerCase();
      var stemFold = window.IgcCoach ? IgcCoach.fold(stem) : stem.toLowerCase();
      if (folded === stemFold || folded.indexOf(stemFold) === 0) {
        if (extraWords(text, stem) < 2 && folded.indexOf(stemFold) === 0) {
          return { stem: stems[i], example: (built && built.example) || (stem + " …") };
        }
        if (folded === stemFold) return { stem: stems[i], example: (built && built.example) || (stem + " …") };
      }
    }
    return null;
  }
  function showIdeas(student, raw, lead, ideas) {
    addBubble(student.id, raw, "me", lead, { force: true });
    var help = student.root.querySelector("[data-role='help']");
    help.hidden = false;
    help.className = "help";
    help.textContent = "";
    help.appendChild(el("p", { class: "help-lead", text: lead }));
    var row = el("div", { class: "idea-row" });
    (ideas || []).slice(0, 4).forEach(function (phrase) {
      var fill = /…/.test(phrase);
      row.appendChild(el("button", {
        type: "button",
        class: "swap",
        "data-fill": fill ? phrase : "",
        "data-chip": fill ? "" : phrase,
        text: phrase
      }));
    });
    if (row.childNodes.length) help.appendChild(row);
    scrollThread(student, true);
  }
  function hideIdle() {
    ["A", "B"].forEach(function (id) {
      var student = state.students[id];
      if (!student) return;
      var node = student.root.querySelector("[data-role='idle-nudge']");
      if (node) node.hidden = true;
    });
  }
  function noteActivity() {
    state.lastSentAt = Date.now();
    if (state.cls) state.cls.justRotated = false;
    hideIdle();
  }
  function idleMs() {
    var mount = document.getElementById("italian-guided-chat");
    var n = mount && parseInt(mount.getAttribute("data-idle-ms") || "", 10);
    return n > 0 ? n : 60000;
  }
  function idleEligible(student) {
    if (chatFrozen()) return false;
    if (state.cls && state.cls.phase === "goodbye") return false;
    if (state.mode === "class") {
      if (!classPaired()) return false;
      if (isOpenConvo()) return true;
      return hasTurn(student);
    }
    if (state.both) {
      if (isOpenConvo()) return true;
      return hasTurn(student);
    }
    return false;
  }
  function renderIdle() {
    ["A", "B"].forEach(function (id) {
      var student = state.students[id];
      if (!student || student.root.hidden) return;
      var node = student.root.querySelector("[data-role='idle-nudge']");
      if (!node) return;
      var show = idleEligible(student) && state.lastSentAt && (Date.now() - state.lastSentAt >= idleMs());
      node.hidden = !show;
      if (!show) return;
      var answers = partnerAskedQuestion();
      node.textContent = "";
      node.appendChild(el("p", { class: "help-lead", text: answers ? "Your partner asked you a question. Answer in Italian." : "Ask your partner a question in Italian." }));
      var row = el("div", { class: "idea-row" });
      ideaList(answers).forEach(function (phrase) {
        var fill = /…/.test(phrase);
        row.appendChild(el("button", { type: "button", "data-fill": fill ? phrase : "", "data-chip": fill ? "" : phrase, text: phrase }));
      });
      node.appendChild(row);
    });
  }
  function renderClock() {
    var node = q("[data-role='rotate-clock']");
    if (!node) return;
    var c = state.cls;
    if (state.mode !== "class" || !c || !c.pairId || c.autoRotate === false) { node.hidden = true; return; }
    node.hidden = false;
    node.className = "rotate-clock";
    if (c.clockPaused || chatFrozen()) { node.className = "rotate-clock paused"; node.textContent = "Paused"; return; }
    var left = Math.max(0, (c.clockEndsAt || 0) - Date.now());
    var sec = Math.ceil(left / 1000);
    var m = Math.floor(sec / 60);
    var r = sec % 60;
    var label = m + ":" + (r < 10 ? "0" : "") + r;
    if (c.phase === "goodbye") {
      node.className = "rotate-clock bye";
      node.textContent = "Time to say goodbye! Say ciao in Italian " + label;
    } else node.textContent = "Time left with this partner: " + label;
  }
  function applyClock(data) {
    var c = state.cls;
    if (!c || !data) return;
    if (typeof data.autoRotate === "boolean") c.autoRotate = data.autoRotate;
    if (data.phase) c.phase = data.phase;
    if (typeof data.paused === "boolean") c.clockPaused = data.paused;
    if (typeof data.endsAt === "number") c.clockEndsAt = data.endsAt;
    if (data.paused) c.clockEndsAt = 0;
    renderClock();
    if (c.phase === "goodbye" && !c._byeShown) {
      c._byeShown = true;
      setClassStatus("Time to say goodbye in Italian.");
      renderAll();
    }
    if (c.phase !== "goodbye") c._byeShown = false;
  }
  function answeredToday(line) {
    var q = state.cls && state.cls.question;
    if (!q) return false;
    var stems = currentStarters().map(starterStem);
    var folded = window.IgcCoach ? IgcCoach.fold(line) : line;
    return stems.some(function (stem) { return stem && folded.indexOf(window.IgcCoach.fold(stem)) === 0; });
  }
  function attempt(student, raw) {
    var text = String(raw || "").trim();
    if (!text) return;
    if (chatFrozen()) { setClassStatus("Teacher paused chat."); return; }
    var blockedStarter = starterBlock(text);
    if (blockedStarter) {
      showIdeas(student, text, "Add on! Finish the sentence in your own words, e.g. " + blockedStarter.example, [blockedStarter.stem]);
      return;
    }
    var swap = matchSwap(text);
    if (swap) {
      showIdeas(student, text, "Write it in Italian.", [swap.it].concat(ideaList(false)).slice(0, 4));
      return;
    }
    var prep = coachPrep();
    if (prep && window.IgcCoach) {
      var judged = IgcCoach.judge(text, prep);
      if (judged.action === "swear") { holdFlag(student, text, { category: judged.category || "swear" }); return; }
      if (judged.action === "english" || judged.action === "emoji" || judged.action === "fix") {
        var answers = judged.action === "english" ? false : partnerAskedQuestion();
        if (judged.action === "english") answers = partnerAskedQuestion();
        showIdeas(student, text, judged.why || "Write it in Italian.", ideaList(answers));
        return;
      }
      var outgoing = judged.send || text;
      if (judged.changed && judged.why) deliverCorrected(student, text, outgoing, outgoing, judged.why);
      else deliverCorrected(student, outgoing, outgoing, outgoing, "");
      return;
    }
    var hit = safetyHit(text);
    if (hit) { holdFlag(student, text, hit); return; }
    if (isEnglish(text)) { showEnglishHelp(student, text, matchSwap(text)); return; }
    deliver(student, text, null);
  }

  /* ---------- levels ---------- */
  function convosFor(level) {
    return state.conversations.filter(function (c) { return String(c.level) === String(level); });
  }
  function syncLevelUi() {
    var sel = q("[data-role='level']");
    if (!sel) return;
    if (sel.value !== state.level) sel.value = state.level;
    var inClass = state.mode === "class";
    var teacherLocked = !!(inClass && state.cls && state.cls.locked);
    var linkHolds = !!(state.linkLevel && inClass && !(state.cls && state.cls.joined && !state.cls.locked));
    sel.disabled = teacherLocked || linkHolds;
  }
  function setLevel(level, fromRemote) {
    var list = convosFor(level);
    if (!list.length) return;
    state.level = String(level);
    state.convo = list[0];
    state.step = 0;
    rebuildMap();
    var mount = document.getElementById("italian-guided-chat");
    if (mount) {
      mount.setAttribute("data-level", state.level);
      mount.setAttribute("data-open", isOpenConvo() ? "yes" : "no");
    }
    syncLevelUi();
    fillConversationSelect();
    ["A", "B"].forEach(function (id) { if (state.students[id]) clearThread(state.students[id]); });
    renderAll();
    refreshPairedStatus();
    if (!fromRemote && classPaired()) classSend({ type: "level_change", pairId: state.cls.pairId, level: state.level });
  }
  function setConversation(id, fromRemote) {
    var found = null;
    state.conversations.forEach(function (c) { if (c.id === id) found = c; });
    if (!found) return;
    state.level = String(found.level);
    state.convo = found;
    state.step = 0;
    rebuildMap();
    ["A", "B"].forEach(function (sid) { if (state.students[sid]) clearThread(state.students[sid]); });
    fillConversationSelect();
    renderAll();
    refreshPairedStatus();
    if (!fromRemote && classPaired()) classSend({ type: "convo_change", pairId: state.cls.pairId, id: found.id });
  }
  function fillConversationSelect() {
    var select = q("[data-role='conversation']");
    var wrap = q("[data-role='conversation-wrap']");
    if (!select || !wrap) return;
    var list = convosFor(state.level);
    select.textContent = "";
    list.forEach(function (c) {
      var opt = el("option", { value: c.id, text: c.title });
      if (state.convo && c.id === state.convo.id) opt.selected = true;
      select.appendChild(opt);
    });
    wrap.hidden = list.length < 2;
    select.disabled = !!(state.mode === "class" && state.cls && state.cls.locked);
  }

  /* ---------- Join class (teacher hub over PeerJS) ---------- */
  function teacherPeerId(code) { return "igc-" + String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function studentId() {
    var key = "italianGuidedStudentId";
    var id = null;
    try { id = localStorage.getItem(key); } catch (e) {}
    if (!id) { try { id = sessionStorage.getItem(key); } catch (e2) {} }
    if (!id) id = Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(key, id); } catch (e3) {}
    try { sessionStorage.setItem(key, id); } catch (e4) {}
    return id;
  }
  function readJoin() {
    try { return JSON.parse(sessionStorage.getItem("italianGuidedJoin") || "null"); } catch (e) { return null; }
  }
  function rememberJoin(code, name) {
    try { sessionStorage.setItem("italianGuidedJoin", JSON.stringify({ code: code, name: name })); } catch (e) {}
  }
  function forgetJoin() {
    try { sessionStorage.removeItem("italianGuidedJoin"); } catch (e) {}
  }
  function setClassStatus(text) {
    var node = q("[data-role='class-status']");
    if (node) node.textContent = text;
  }
  function syncReconnect() {
    var btn = q("[data-role='reconnect']");
    if (!btn) return;
    var c = state.cls;
    var open = !!(c && c.joined && c.conn && c.conn.open);
    btn.hidden = !(c && !open);
  }
  function peerOptions() {
    return window.IgcNet ? IgcNet.peerOptions() : { debug: 0 };
  }
  function sendJoin(c) {
    if (!c || !c.conn || !c.conn.open || c.joined) return false;
    try { c.conn.send({ type: "join", name: c.name, studentId: c.sid }); return true; }
    catch (e) { return false; }
  }
  function clearJoinPulse(c) {
    if (c && c.joinPulse) { clearInterval(c.joinPulse); c.joinPulse = null; }
  }
  function refreshPairedStatus() {
    var c = state.cls;
    if (!c || !c.pairId || !c.partner) return;
    if (c.classFrozen || c.pairFrozen) { setClassStatus("Teacher paused chat."); return; }
    if (c.justRotated) {
      var rotated = (c.partners || [c.partner]).join(" and ");
      setClassStatus("New partner: " + rotated + ". Say hello in Italian!");
      return;
    }
    var names = c.partners || (c.partner ? [c.partner] : ["your partner"]);
    var who = names.join(" and ");
    var extra = isOpenConvo() ? "Talk freely in Italian." : (c.roleIndex === 0 || c.role === "first" ? "You start." : names[0] + " starts.");
    setClassStatus("You are paired with " + who + ". " + extra);
  }
  function classSend(msg) {
    var c = state.cls;
    if (!c || !c.conn || !c.conn.open) return false;
    try { c.conn.send(msg); return true; } catch (e) { setClassStatus(CLASS_FAIL); return false; }
  }
  window.addEventListener("pagehide", function (event) {
    if (event && event.persisted) return;
    var c = state.cls;
    if (c && c.peer) { try { c.peer.destroy(); } catch (e) {} }
  });
  window.addEventListener("pageshow", function (event) {
    if (!event || !event.persisted) return;
    var c = state.cls;
    if (!c || c.cancelled) return;
    if (c.joined && c.conn && c.conn.open) return;
    c.stopped = false;
    c.retrying = false;
    c.tries = 1;
    c.lastError = "";
    attemptConnect(c);
  });
  function leaveClass(silent) {
    var c = state.cls;
    if (c) {
      c.cancelled = true;
      c.stopped = true;
      clearJoinPulse(c);
      if (c.timer) clearTimeout(c.timer);
      if (c.watch) clearTimeout(c.watch);
      if (c.conn) { try { c.conn.close(); } catch (e) {} }
      if (c.peer) { try { c.peer.destroy(); } catch (e) {} }
    }
    state.cls = null;
    if (!silent) forgetJoin();
    var leave = q("[data-role='leave-class']");
    var join = q("[data-role='join-class']");
    if (leave) leave.hidden = true;
    if (join) join.hidden = false;
    if (!silent) setClassStatus("You left the class.");
    syncReconnect();
    syncLevelUi();
    fillConversationSelect();
    resetConversation();
  }
  function onTeacherMsg(data) {
    var c = state.cls;
    if (!c || !data || typeof data !== "object") return;
    if (data.type === "welcome") {
      var already = c.joined;
      c.joined = true;
      c.wasConnected = true;
      c.retrying = false;
      clearJoinPulse(c);
      if (c.timer) { clearTimeout(c.timer); c.timer = null; }
      if (c.watch) { clearTimeout(c.watch); c.watch = null; }
      syncReconnect();
      var joinBtn = q("[data-role='join-class']");
      if (joinBtn) joinBtn.hidden = true;
      c.className = String(data.className || "your class");
      c.locked = !!data.locked;
      if (typeof data.classFrozen === "boolean") c.classFrozen = data.classFrozen;
      if (!already && data.level && convosFor(data.level).length && String(data.level) !== state.level) setLevel(String(data.level), true);
      syncLevelUi();
      if (c.classFrozen || c.pairFrozen) setClassStatus("Teacher paused chat.");
      else if (c.pairId) refreshPairedStatus();
      else setClassStatus("You joined " + c.className + ". Waiting for the teacher to pair you.");
      renderAll();
      return;
    }
    if (data.type === "freeze") {
      c.classFrozen = !!data.classFrozen;
      c.pairFrozen = !!data.pairFrozen;
      if (c.classFrozen || c.pairFrozen) setClassStatus("Teacher paused chat.");
      else if (c.pairId && c.partner) refreshPairedStatus();
      else if (c.joined) setClassStatus("You joined " + (c.className || "your class") + ". Waiting for the teacher to pair you.");
      renderAll();
      return;
    }
    if (data.type === "paired") {
      c.pairId = String(data.pairId);
      var names = (data.partners || []).map(function (p) { return String((p && p.name) || p || ""); }).filter(Boolean);
      if (!names.length && data.partner) names = [String(data.partner.name || data.partner)];
      c.partners = names;
      c.partner = names.join(" and ") || "Partner";
      c.groupSize = names.length + 1;
      c.roleIndex = typeof data.roleIndex === "number" ? data.roleIndex : (data.role === "second" ? 1 : data.role === "third" ? 2 : 0);
      c.role = c.roleIndex === 0 ? "first" : "second";
      c.locked = !!data.locked;
      if (typeof data.classFrozen === "boolean") c.classFrozen = data.classFrozen;
      if (typeof data.pairFrozen === "boolean") c.pairFrozen = data.pairFrozen;
      if (typeof data.question === "string") c.question = data.question;
      if (data.starters) c.starters = data.starters;
      if (data.clock) applyClock(data.clock);
      state.lastSentAt = Date.now();
      if (data.fresh) {
        c.justRotated = true;
        ["A", "B"].forEach(function (id) { if (state.students[id]) clearThread(state.students[id]); });
      }
      var nextLevel = data.level && convosFor(data.level).length ? String(data.level) : state.level;
      if (String(state.level) !== String(nextLevel)) setLevel(nextLevel, true);
      else if (data.convoId && state.convo && data.convoId !== state.convo.id) setConversation(String(data.convoId), true);
      if (!isOpenConvo() && typeof data.step === "number" && data.step >= 0 && data.step <= (state.convo.steps || []).length) state.step = data.step;
      syncLevelUi();
      fillConversationSelect();
      if (c.classFrozen || c.pairFrozen) setClassStatus("Teacher paused chat.");
      else if (!data.fresh) refreshPairedStatus();
      renderAll();
      return;
    }
    if (data.type === "unpaired") {
      c.pairId = null; c.partner = null; c.role = null; c.pairFrozen = false;
      setClassStatus(c.classFrozen ? "Teacher paused chat." : "The teacher changed pairs. Waiting for the teacher to pair you.");
      resetConversation();
      return;
    }
    if (data.type === "partner_status") {
      if (c.classFrozen || c.pairFrozen) return;
      if (c.partner) setClassStatus(data.online ? c.partner + " is back." : c.partner + " disconnected. Wait for them, or ask your teacher.");
      return;
    }
    if (data.type === "line") {
      if (c.classFrozen || c.pairFrozen) return;
      if (!c.pairId || String(data.pairId) !== c.pairId) return;
      var line = String(data.text || "").trim();
      if (!line || safetyHit(line)) return;
      var prep = coachPrep();
      if (prep && window.IgcCoach) {
        var judged = IgcCoach.judge(line, prep);
        if (judged.action === "swear" || judged.action === "english" || judged.action === "emoji") return;
      }
      state.lastIncoming = line;
      addBubble("A", line, "them", null, { lineId: data.lineId || "", from: data.from || "" });
      var total = (state.convo.steps || []).length;
      if (typeof data.step === "number" && data.step % 1 === 0 && data.step >= 0 && data.step <= total) state.step = data.step;
      renderAll();
      renderIdle();
      return;
    }
    if (data.type === "delete_line" || data.type === "remove_line") {
      var gone = document.querySelector("[data-line-id='" + String(data.lineId || "").replace(/'/g, "") + "']");
      if (gone) {
        var holder = gone.querySelector(".line");
        if (holder) holder.textContent = data.type === "remove_line" ? "Removed by teacher" : "Message deleted";
        var btn = gone.querySelector("[data-delete-line]");
        if (btn) btn.remove();
        gone.setAttribute("data-text", holder ? holder.textContent : "");
      }
      return;
    }
    if (data.type === "rotate_clock") { applyClock(data); return; }
    if (data.type === "question") {
      c.question = String(data.text || "");
      c.starters = data.starters || [];
      renderToday();
      return;
    }
    if (data.type === "gloss_answer" || data.type === "gloss_add") {
      state.glossAdds = state.glossAdds || [];
      state.glossAdds.push({ en: [String(data.en || "")], it: [String(data.it || "")] });
      showGlossAnswer(String(data.en || ""), String(data.it || ""));
      return;
    }
    if (data.type === "removed") {
      forgetJoin();
      leaveClass(true);
      setClassStatus("Your teacher removed you from this class. Ask your teacher if this is a mistake.");
      return;
    }
    if (data.type === "level") {
      if (typeof data.locked === "boolean") c.locked = data.locked;
      if (data.level && convosFor(data.level).length) setLevel(String(data.level), true);
      syncLevelUi();
      fillConversationSelect();
      return;
    }
    if (data.type === "convo" && data.id) { setConversation(String(data.id), true); return; }
    if (data.type === "ended") {
      forgetJoin();
      leaveClass(true);
      setClassStatus("Your teacher ended the class session.");
    }
  }
  function joinFailureText(c) {
    var type = c.lastError || "";
    if (type === "peer-unavailable") return "Class " + c.code + " is not live. Ask the teacher to wait until the hub says Live hub, then tap Reconnect.";
    if (type === "unavailable-id") return "This Chromebook was still connected from a moment ago. Tap Reconnect. The code is still " + c.code + ".";
    if (type === "timeout" || type === "webrtc" || type === "network" || type === "disconnected" || type === "server-error" || type === "socket-error" || type === "socket-closed") {
      return "Could not open the chat line to class " + c.code + ". The school network may be blocking peer connections. Tap Reconnect. If it still fails, use Try both sides on one computer with your partner.";
    }
    return CLASS_FAIL + " The code is " + c.code + ".";
  }
  function failFinal(c) {
    if (state.cls !== c || c.cancelled) return;
    c.stopped = true;
    if (c.timer) { clearTimeout(c.timer); c.timer = null; }
    if (c.watch) { clearTimeout(c.watch); c.watch = null; }
    try { if (c.conn) c.conn.close(); } catch (e) {}
    try { if (c.peer) c.peer.destroy(); } catch (e) {}
    clearJoinPulse(c);
    c.conn = null;
    c.peer = null;
    setClassStatus(joinFailureText(c));
    var join = q("[data-role='join-class']");
    if (join) join.hidden = false;
    syncReconnect();
  }
  function scheduleRetry(c, reason) {
    if (state.cls !== c || c.cancelled || c.stopped || c.retrying) return;
    if (c.joined && c.conn && c.conn.open) return;
    if (reason) c.lastError = reason;
    c.retrying = true;
    c.joined = false;
    clearJoinPulse(c);
    if (c.timer) { clearTimeout(c.timer); c.timer = null; }
    if (c.watch) { clearTimeout(c.watch); c.watch = null; }
    var oldConn = c.conn;
    var oldPeer = c.peer;
    c.conn = null;
    c.peer = null;
    try { if (oldConn) oldConn.close(); } catch (e) {}
    try { if (oldPeer) oldPeer.destroy(); } catch (e) {}
    if (c.tries >= 4) { c.retrying = false; failFinal(c); return; }
    var wait = c.lastError === "unavailable-id" ? 3000 : 1200;
    var waited = c.startedAt && (Date.now() - c.startedAt > 20000);
    setClassStatus(waited
      ? "The chat line is still not open. Tap Reconnect. If that does not work, close this tab and open the class link again."
      : (c.wasConnected
        ? "Reconnecting to class " + c.code + " (try " + (c.tries + 1) + " of 4). Stay on this page."
        : "Still opening the chat line to class " + c.code + " (try " + (c.tries + 1) + " of 4). If this keeps going, tap Reconnect."));
    syncReconnect();
    c.timer = setTimeout(function () {
      if (state.cls !== c || c.cancelled || c.stopped || c.joined) return;
      c.retrying = false;
      c.tries += 1;
      attemptConnect(c);
    }, wait);
  }
  function armWatch(c) {
    if (c.watch) clearTimeout(c.watch);
    c.watch = setTimeout(function () {
      if (state.cls !== c || c.cancelled || c.joined) return;
      scheduleRetry(c, "timeout");
    }, 20000);
  }
  function attemptConnect(c) {
    if (state.cls !== c || c.cancelled || c.stopped) return;
    if (c.tries === 1) setClassStatus("Connecting to class " + c.code + "…");
    else setClassStatus("Still opening the chat line to class " + c.code + " (try " + c.tries + " of 4)…");
    syncReconnect();
    armWatch(c);
    var peerObj;
    try { peerObj = new Peer(teacherPeerId(c.code) + "-s-" + c.sid, peerOptions()); }
    catch (e) { scheduleRetry(c, "invalid-id"); return; }
    c.peer = peerObj;
    peerObj.on("open", function () {
      if (state.cls !== c || c.cancelled || c.stopped || c.peer !== peerObj) return;
      if (c.conn) return;
      armWatch(c);
      setClassStatus("Found class " + c.code + ". Opening the chat line…");
      var conn;
      try {
        conn = peerObj.connect(teacherPeerId(c.code), {
          reliable: true,
          serialization: "json",
          metadata: { studentId: c.sid, browserId: c.sid, name: c.name }
        });
      } catch (e) { scheduleRetry(c, "network"); return; }
      c.conn = conn;
      conn.on("open", function () {
        if (state.cls !== c || c.conn !== conn) return;
        if (!sendJoin(c)) { scheduleRetry(c, "network"); return; }
        clearJoinPulse(c);
        c.joinPulse = setInterval(function () {
          if (state.cls !== c || c.joined || c.conn !== conn) { clearJoinPulse(c); return; }
          sendJoin(c);
        }, 1500);
      });
      conn.on("data", onTeacherMsg);
      conn.on("close", function () {
        if (state.cls !== c || c.cancelled || c.stopped || c.conn !== conn) return;
        c.wasConnected = true;
        scheduleRetry(c, "disconnected");
      });
      conn.on("error", function (err) {
        if (state.cls !== c || c.conn !== conn) return;
        scheduleRetry(c, (err && err.type) || "network");
      });
    });
    peerObj.on("error", function (err) {
      if (state.cls !== c || c.cancelled || c.stopped || c.peer !== peerObj) return;
      scheduleRetry(c, (err && err.type) || "network");
    });
    peerObj.on("disconnected", function () {
      if (state.cls !== c || c.stopped || c.peer !== peerObj) return;
      c.brokerRetries = (c.brokerRetries || 0) + 1;
      if (c.brokerRetries > 2) { scheduleRetry(c, "disconnected"); return; }
      try { peerObj.reconnect(); } catch (e) { scheduleRetry(c, "disconnected"); }
    });
  }
  function joinClass() {
    var codeIn = q("[data-role='join-code']");
    var nameIn = q("[data-role='join-name']");
    var code = String(codeIn.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    var name = String(nameIn.value || "").trim().split(/\s+/)[0] || "";
    name = name.slice(0, 18);
    if (code.length !== 6) { setClassStatus("Enter the 6-character class code from your teacher."); return; }
    if (!name) { setClassStatus("Enter your first name."); return; }
    if (typeof Peer !== "function") { setClassStatus("The connection tool did not load. " + CLASS_FAIL); return; }
    leaveClass(true);
    rememberJoin(code, name);
    var sid = studentId();
    var c = state.cls = {
      code: code, name: name, sid: sid, peer: null, conn: null, joined: false, pairId: null, partner: null,
      role: null, locked: false, classFrozen: false, pairFrozen: false, timer: null, watch: null, joinPulse: null, cancelled: false, stopped: false, retrying: false,
      tries: 1, wasConnected: false, lastError: "", brokerRetries: 0, startedAt: Date.now(),
      autoRotate: true, phase: "chat", clockEndsAt: 0, clockPaused: false, question: "", starters: []
    };
    q("[data-role='join-class']").hidden = true;
    q("[data-role='leave-class']").hidden = false;
    attemptConnect(c);
    renderAll();
  }

  /* ---------- modes ---------- */
  function setMode(mode) {
    if (mode === "class" && !state.standalone) mode = "solo";
    if (state.mode === "class" && mode !== "class") { forgetJoin(); leaveClass(true); }
    state.mode = mode;
    state.both = mode === "both";
    var stage = q("[data-role='stage']");
    stage.classList.toggle("both", state.both);
    state.students.B.root.hidden = !state.both;
    Array.prototype.forEach.call(document.querySelectorAll("#italian-guided-chat .modes button"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-mode") === mode ? "true" : "false");
    });
    var joinbar = q("[data-role='joinbar']");
    if (joinbar) joinbar.hidden = mode !== "class";
    syncLevelUi();
    fillConversationSelect();
    resetConversation();
  }

  function makeStudent(id) {
    var thread = el("div", { class: "thread", "data-role": "thread" });
    var root = el("section", { class: "student", "data-student": id },
      el("div", { class: "who" },
        el("div", { class: "avatar", "data-role": "avatar", text: id }),
        el("div", { class: "who-text" },
          el("div", { class: "who-name", "data-role": "who-name", text: "" }),
          el("div", { class: "who-title", "data-role": "title", text: "" })
        )
      ),
      el("p", { class: "note", "data-role": "note", text: NOTE }),
      el("p", { class: "rotate-clock", "data-role": "rotate-clock" }),
      el("p", { class: "today-q", "data-role": "today-q" }),
      thread,
      el("div", { class: "dock" },
        el("div", { class: "idle-nudge", "data-role": "idle-nudge" }),
        el("p", { class: "prompt", "data-role": "prompt" }),
        el("div", { class: "chips", "data-role": "chips" }),
        el("div", { class: "help", "data-role": "help", "aria-live": "polite" }),
        el("form", { class: "composer", "data-role": "form" },
          el("input", { "data-role": "composer", type: "text", placeholder: "Messaggio in italiano", autocomplete: "off", autocorrect: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Type a message in Italian" }),
          el("button", { "data-role": "send", type: "submit", text: "Send" })
        )
      )
    );
    root.querySelector("[data-role='help']").hidden = true;
    root.querySelector("[data-role='rotate-clock']").hidden = true;
    root.querySelector("[data-role='today-q']").hidden = true;
    root.querySelector("[data-role='idle-nudge']").hidden = true;
    var student = { id: id, step: 0, root: root };
    clearThread(student);
    root.addEventListener("click", function (event) {
      var del = event.target.closest("[data-delete-line]");
      if (del && root.contains(del)) {
        if (!window.confirm("Delete this message?")) return;
        var id = del.getAttribute("data-delete-line");
        var bubble = del.closest(".bubble");
        var holder = bubble && bubble.querySelector(".line");
        if (holder) holder.textContent = "Message deleted";
        del.remove();
        if (state.mode === "class" && state.cls && state.cls.pairId) {
          classSend({ type: "delete_line", pairId: state.cls.pairId, lineId: id });
        } else if (state.both) {
          var other = student.id === "A" ? "B" : "A";
          var twin = state.students[other] && state.students[other].root.querySelector("[data-line-id='" + id + "']");
          if (twin) {
            var line = twin.querySelector(".line");
            if (line) line.textContent = "Message deleted";
            var btn = twin.querySelector("[data-delete-line]");
            if (btn) btn.remove();
          }
        }
        return;
      }
      var fill = event.target.closest("[data-fill]");
      if (fill && root.contains(fill) && fill.getAttribute("data-fill")) {
        var input = root.querySelector("[data-role='composer']");
        input.value = fill.getAttribute("data-fill").replace(/…\s*$/, " ");
        input.focus();
        return;
      }
      var btn = event.target.closest("button[data-chip]");
      if (!btn || !root.contains(btn) || !btn.getAttribute("data-chip")) return;
      attempt(student, btn.getAttribute("data-chip"));
    });
    root.querySelector("[data-role='form']").addEventListener("submit", function (event) {
      event.preventDefault();
      var input = root.querySelector("[data-role='composer']");
      var value = input.value;
      input.value = "";
      attempt(student, value);
    });
    return student;
  }

  function build(mount, data) {
    var list = data && data.conversations ? data.conversations : (Array.isArray(data) ? data : []);
    state.conversations = list;
    list.forEach(function (convo) {
      (convo.steps || []).forEach(function (step) { (step.chips || []).forEach(learnPhrase); });
      (convo.suggestions || []).forEach(learnPhrase);
    });
    SWAPS.forEach(function (swap) { learnPhrase(swap.it); });
    var levels = [];
    list.forEach(function (convo) { var l = String(convo.level); if (levels.indexOf(l) < 0) levels.push(l); });
    levels.sort(function (a, b) {
      var ia = LEVEL_ORDER.indexOf(a), ib = LEVEL_ORDER.indexOf(b);
      if (ia < 0) ia = 50; if (ib < 0) ib = 50;
      return ia !== ib ? ia - ib : (a < b ? -1 : 1);
    });

    mount.textContent = "";
    var levelSelect = el("select", { "data-role": "level", "aria-label": "Level" });
    levels.forEach(function (level) { levelSelect.appendChild(el("option", { value: level, text: "Level " + level })); });
    var convoSelect = el("select", { "data-role": "conversation", "aria-label": "Conversation" });
    var convoWrap = el("label", { "data-role": "conversation-wrap", text: "Conversation " }, convoSelect);
    convoWrap.hidden = true;
    var modes = el("div", { class: "modes", role: "group", "aria-label": "Mode" },
      el("button", { type: "button", "data-mode": "solo", "data-role": "mode-solo", text: "Practice alone" }),
      el("button", { type: "button", "data-mode": "both", "data-role": "try-both", text: "Try both sides" }),
      state.standalone ? el("button", { type: "button", "data-mode": "class", "data-role": "mode-class", text: "Join class" }) : null
    );
    var toolbar = el("div", { class: "toolbar" }, el("label", { text: "Level " }, levelSelect), convoWrap, modes);
    mount.appendChild(toolbar);
    if (state.standalone) {
      var joinbar = el("div", { class: "joinbar", "data-role": "joinbar" },
        el("input", { "data-role": "join-code", type: "text", maxlength: "6", placeholder: "CODE", "aria-label": "Class code", autocomplete: "off", autocapitalize: "characters", spellcheck: "false" }),
        el("input", { "data-role": "join-name", type: "text", maxlength: "18", placeholder: "First name", "aria-label": "First name", autocomplete: "given-name" }),
        el("button", { type: "button", "data-role": "join-class", text: "Join" }),
        el("button", { type: "button", class: "quiet", "data-role": "reconnect", text: "Reconnect" }),
        el("button", { type: "button", class: "quiet", "data-role": "leave-class", text: "Leave class" }),
        el("p", { class: "class-status", "data-role": "class-status", text: "Enter the class code from your teacher and your first name." })
      );
      joinbar.hidden = true;
      joinbar.querySelector("[data-role='leave-class']").hidden = true;
      joinbar.querySelector("[data-role='reconnect']").hidden = true;
      mount.appendChild(joinbar);
      joinbar.querySelector("[data-role='join-class']").addEventListener("click", joinClass);
      joinbar.querySelector("[data-role='reconnect']").addEventListener("click", joinClass);
      joinbar.querySelector("[data-role='leave-class']").addEventListener("click", function () { leaveClass(false); });
      joinbar.querySelector("[data-role='join-name']").addEventListener("keydown", function (e) { if (e.key === "Enter") joinClass(); });
    }
    var stage = el("div", { class: "stage", "data-role": "stage" });
    var desk = el("div", { class: "desk", "data-role": "desk" });
    state.students.A = makeStudent("A");
    state.students.B = makeStudent("B");
    state.students.B.root.hidden = true;
    var tips = el("aside", { class: "tips", "data-role": "tips", "aria-label": "Chat tips" },
      el("h2", { "data-role": "tips-title", text: "Open Italian chat" }),
      el("p", { class: "tips-who", "data-role": "tips-who", text: "" }),
      el("ul", { "data-role": "tips-list" })
    );
    desk.appendChild(state.students.A.root);
    desk.appendChild(state.students.B.root);
    var gloss = el("aside", { class: "gloss", "data-role": "gloss", "aria-label": "Come si dice" },
      el("h2", { text: "Come si dice…?" }),
      el("p", { text: "Type a word or phrase in English to see how to say it in Italian." }),
      el("input", { "data-role": "gloss-q", type: "text", placeholder: "how old are you", "aria-label": "English word or phrase" }),
      el("div", { "data-role": "gloss-out" }),
      el("button", { type: "button", "data-role": "gloss-toggle", text: "Hide Come si dice…?" })
    );
    gloss.querySelector("[data-role='gloss-q']").addEventListener("input", function (e) { renderGloss(e.target.value); });
    gloss.addEventListener("click", function (e) {
      var b = e.target.closest("[data-gloss]");
      if (!b) return;
      var input = q("[data-role='composer']");
      if (!input) return;
      input.value = String(b.getAttribute("data-gloss") || "").replace(/…\s*$/, " ");
      input.focus();
    });
    gloss.querySelector("[data-role='gloss-toggle']").addEventListener("click", function () {
      var open = gloss.getAttribute("data-open") !== "no";
      gloss.setAttribute("data-open", open ? "no" : "yes");
      gloss.hidden = open;
    });
    desk.appendChild(tips);
    desk.appendChild(gloss);
    stage.appendChild(desk);
    mount.appendChild(stage);

    var wanted = levelFromSearch() || mount.getAttribute("data-level") || "1";
    if (levelFromSearch()) state.linkLevel = levelFromSearch();
    if (!convosFor(wanted).length) wanted = levels[0] || "1";
    levelSelect.value = wanted;
    setLevel(wanted, true);
    setMode("solo");

    levelSelect.addEventListener("change", function () { setLevel(levelSelect.value, false); });
    convoSelect.addEventListener("change", function () { setConversation(convoSelect.value, false); });
    modes.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-mode]");
      if (b) setMode(b.getAttribute("data-mode"));
    });

    if (state.standalone) {
      var params = new URLSearchParams(location.search);
      var savedJoin = readJoin();
      var code = (params.get("join") || params.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (!code && savedJoin && savedJoin.code) code = String(savedJoin.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (code) {
        setMode("class");
        q("[data-role='join-code']").value = code;
        if (state.linkLevel) setClassStatus("This link is for Level " + state.linkLevel + ". Enter your first name and tap Join.");
        var savedName = savedJoin && String(savedJoin.code || "").toUpperCase() === code ? String(savedJoin.name || "") : "";
        if (savedName) {
          q("[data-role='join-name']").value = savedName;
          joinClass();
        } else q("[data-role='join-name']").focus();
      }
    }
    restoreThread();
  }

  function foldGloss(s) {
    return String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z\s]/g, " ").replace(/\b(a|an|the)\b/g, " ").replace(/\s+/g, " ").trim();
  }
  function renderGloss(raw) {
    var out = q("[data-role='gloss-out']");
    if (!out) return;
    out.textContent = "";
    var qtext = String(raw || "").trim();
    if (!qtext) return;
    var hit = safetyHit(qtext);
    if (hit) {
      if (state.students.A) holdFlag(state.students.A, qtext, hit);
      out.appendChild(el("p", { text: "That was not looked up. Please keep this school-appropriate." }));
      return;
    }
    var key = foldGloss(qtext);
    var hits = [];
    (state.glossary || []).concat(state.glossAdds || []).forEach(function (entry) {
      var ens = entry.en || [];
      for (var i = 0; i < ens.length; i++) {
        var ek = foldGloss(ens[i]);
        if (ek === key || (key && ek.indexOf(key) >= 0) || (ek && key.indexOf(ek) >= 0)) { hits.push(entry); break; }
      }
    });
    if (!hits.length) {
      out.appendChild(el("p", { text: "Not in the list yet. Your teacher can answer." }));
      var ask = el("button", { type: "button", text: "Ask teacher" });
      ask.addEventListener("click", function () {
        if (state.mode === "class" && classSend({ type: "ask", text: qtext.slice(0, 200), at: Date.now() })) {
          out.appendChild(el("p", { text: "Sent to your teacher. Your partner cannot see it." }));
        } else out.appendChild(el("p", { text: "Join your teacher's class to ask them." }));
      });
      out.appendChild(ask);
      return;
    }
    hits.slice(0, 3).forEach(function (entry) {
      (entry.it || []).forEach(function (it) {
        out.appendChild(el("button", { type: "button", class: "gloss-hit", "data-gloss": it, text: it + " — " + (entry.en && entry.en[0] || "") }));
      });
    });
  }
  function showGlossAnswer(en, it) {
    var out = q("[data-role='gloss-out']");
    if (!out) return;
    out.appendChild(el("p", { text: "Your teacher answered \"" + en + "\": " + it }));
    var b = el("button", { type: "button", class: "gloss-hit", "data-gloss": it, text: "Use " + it });
    out.appendChild(b);
  }
  function levelFromSearch() {
    var params;
    try { params = new URLSearchParams(location.search); } catch (e) { return ""; }
    var raw = String(params.get("level") || params.get("lvl") || "").trim();
    if (/^ap$/i.test(raw)) return "AP";
    if (/^[1234]$/.test(raw)) return raw;
    return "";
  }

  function start(mount) {
    var only = true;
    Array.prototype.forEach.call(document.body.children, function (node) {
      if (node === mount || node.tagName === "SCRIPT" || node.tagName === "LINK" || node.tagName === "STYLE") return;
      only = false;
    });
    state.standalone = only || mount.getAttribute("data-class") === "on";
    if (only) {
      document.documentElement.classList.add("guided-fill");
      document.body.classList.add("guided-fill");
    }
    function grab(name) {
      return fetch(new URL(name, base).href, { cache: "no-store" }).then(function (res) {
        if (!res.ok) throw new Error(name);
        return res.json();
      });
    }
    grab("conversations.json")
      .then(function (data) {
        return Promise.all([
          Promise.resolve(data),
          grab("glossary.json").catch(function () { return { entries: [] }; }),
          grab("questions.json").catch(function () { return { questions: [] }; })
        ]);
      })
      .then(function (all) {
        state.glossary = (all[1] && all[1].entries) || [];
        state.questions = (all[2] && all[2].questions) || [];
        build(mount, all[0]);
        state.lastSentAt = Date.now();
        setInterval(function () { renderIdle(); renderClock(); }, 1000);
      })
      .catch(function () { mount.textContent = "The conversation list did not load."; });
  }

  function loadScript(url, next) {
    var id = document.documentElement.getAttribute("data-build") || "";
    if (id && url.indexOf("v=") < 0) url += (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(id);
    var tag = document.createElement("script");
    tag.src = url;
    tag.onload = next;
    tag.onerror = next;
    document.head.appendChild(tag);
  }
  var pendingBuild = "";
  var typedAt = 0;
  document.addEventListener("input", function (e) {
    var role = e.target && e.target.getAttribute && e.target.getAttribute("data-role");
    if (role === "composer" || role === "gloss-q") typedAt = Date.now();
  }, true);
  function composerBusy() {
    var nodes = document.querySelectorAll("[data-role='composer'], [data-role='gloss-q']");
    var has = false;
    for (var i = 0; i < nodes.length; i++) if (String(nodes[i].value || "").trim()) has = true;
    if (!has) return false;
    if (!typedAt) typedAt = Date.now();
    return Date.now() - typedAt < 30000;
  }
  function maybeUpdate() {
    if (!pendingBuild) return;
    if (composerBusy()) { setTimeout(maybeUpdate, 5000); return; }
    var status = document.querySelector("[data-role='class-status']");
    if (status) status.textContent = "Updating to the newest version…";
    var mount = document.getElementById("italian-guided-chat");
    if (mount && !mount.querySelector("[data-role='toast']")) {
      var toast = document.createElement("p");
      toast.className = "toast-line";
      toast.setAttribute("data-role", "toast");
      toast.textContent = "Updating to the newest version…";
      mount.insertBefore(toast, mount.firstChild);
    }
    var params = new URLSearchParams(location.search);
    params.set("v", pendingBuild);
    setTimeout(function () { location.replace(location.pathname + "?" + params.toString()); }, 1200);
  }
  function watchVersion() {
    function look() {
      fetch(new URL("version.json?t=" + Date.now(), base).href, { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (v) {
          var params = new URLSearchParams(location.search);
          var loaded = params.get("v") || document.documentElement.getAttribute("data-build") || "";
          if (!v || !v.id || !loaded || v.id === loaded) return;
          pendingBuild = v.id;
          maybeUpdate();
        }).catch(function () {});
    }
    look();
    setInterval(look, 60000);
    window.addEventListener("focus", look);
  }
  function boot() {
    injectCss();
    var mount = document.getElementById("italian-guided-chat");
    if (!mount) return;
    var go = function () { start(mount); };
    var loadPeer = function () {
      if (typeof Peer === "function") { go(); return; }
      loadScript(new URL("vendor/peerjs.min.js", base).href, go);
    };
    var loadSafety = function () {
      if (window.IgcSafety) loadPeer();
      else loadScript(new URL("safety.js", base).href, loadPeer);
    };
    var loadCoach = function () {
      if (window.IgcCoach) loadSafety();
      else loadScript(new URL("coach.js", base).href, loadSafety);
    };
    if (window.IgcNet) loadCoach();
    else loadScript(new URL("net.js", base).href, loadCoach);
    watchVersion();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
