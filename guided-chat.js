/* Italian guided chat — phrase chips, turn-taking, free Italian, English blocked.
   Level 4 is an open Italian chat (no guided steps). Unsafe language is flagged
   in safety.js and is not delivered. Modes: Practice alone / Try both sides /
   Join class (teacher.html is the PeerJS hub). */
(function () {
  var script = document.currentScript;
  var base = new URL("./", script && script.src ? script.src : location.href);

  var NOTE = "Your partner only sees Italian that was sent. English, practice mistakes, and flagged messages stay on your screen.";
  var BLOCKED = "That does not look like Italian yet. Try a phrase chip, or write a real Italian sentence.";
  var FREE = "Now write your own message in Italian.";
  var NO_PARTNER = "No partner is connected, so this stayed here. Use Try both sides, or Join class.";
  var WAITING = "Waiting for your partner.";
  var CLASS_FAIL = "Could not reach the teacher's class. Check the code with your teacher, or use Try both sides on this computer.";
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
      R + " .stage { flex:1; min-height:0; display:flex; justify-content:stretch; align-items:stretch; gap:0; padding:0; }",
      R + " .student { position:relative; flex:1 1 auto; width:100%; max-width:none; min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--bg); overflow:hidden; border:0; border-radius:0; box-shadow:none; }",
      R + " .stage.both .student + .student { border-left:1px solid #2c2c2e; }",
      "@media (max-width:800px) { " + R + " .stage.both { flex-direction:column; } " + R + " .stage.both .student + .student { border-left:0; border-top:1px solid #2c2c2e; } }",
      R + " .who { display:flex; flex-direction:row; align-items:center; gap:12px; padding:10px 18px; background:rgba(28,28,30,.92); border-bottom:1px solid rgba(84,84,88,.55); flex-shrink:0; }",
      R + " .avatar { width:44px; height:44px; border-radius:50%; display:grid; place-items:center; font-weight:650; font-size:18px; color:#fff; background:linear-gradient(145deg,#64d2ff,#007AFF); flex-shrink:0; }",
      R + " .student[data-student='B'] .avatar { background:linear-gradient(145deg,#30d158,#64d2ff); }",
      R + " .who-text { display:flex; flex-direction:column; gap:2px; min-width:0; }",
      R + " .who-name { font-size:17px; font-weight:650; line-height:1.2; }",
      R + " .who-title { color:var(--soft); font-size:14px; line-height:1.3; }",
      R + " .note { flex-shrink:0; margin:0; color:var(--soft); padding:8px 18px; font-size:14px; line-height:1.4; text-align:center; }",
      R + " .thread { flex:1 1 auto; min-height:0; overflow:auto; padding:14px 18px; display:flex; flex-direction:column; gap:8px; }",
      R + " .empty { color:var(--dim); font-size:15px; text-align:center; margin:12px 8px; }",
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
      R + " button:focus-visible, " + R + " input:focus-visible, " + R + " select:focus-visible { outline:3px solid var(--orange); outline-offset:2px; }"
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ---------- threads ---------- */
  function clearThread(student) {
    var thread = student.root.querySelector("[data-role='thread']");
    thread.textContent = "";
    thread.appendChild(el("p", { class: "empty", "data-role": "empty", text: "No messages yet." }));
    student.step = 0;
    hideHelp(student);
  }
  function hideHelp(student) {
    var help = student.root.querySelector("[data-role='help']");
    help.hidden = true;
    help.className = "help";
    help.textContent = "";
  }
  function scrollThread(student) {
    var thread = student.root.querySelector("[data-role='thread']");
    thread.scrollTop = thread.scrollHeight;
  }
  function addBubble(studentId, text, kind, pendingWhy) {
    var student = state.students[studentId];
    if (!student) return;
    var thread = student.root.querySelector("[data-role='thread']");
    var empty = thread.querySelector("[data-role='empty']");
    if (empty) empty.remove();
    var bubble = document.createElement("div");
    bubble.className = "bubble " + (pendingWhy ? "pending" : kind);
    bubble.setAttribute("data-text", text);
    bubble.setAttribute("data-sent", pendingWhy ? "false" : "true");
    bubble.appendChild(el("span", { class: "line", text: text }));
    if (pendingWhy) bubble.appendChild(el("span", { class: "why", text: pendingWhy }));
    thread.appendChild(bubble);
    scrollThread(student);
  }

  /* ---------- turns ---------- */
  function classPaired() {
    var c = state.cls;
    return !!(c && c.pairId && c.conn && c.conn.open);
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
  function hasTurn(student) {
    if (isOpenConvo()) return true;
    if (!shared()) return true;
    var steps = state.convo.steps || [];
    if (state.step >= steps.length) return true;
    var firstSpeaker = state.step % 2 === 0;
    if (state.both) return firstSpeaker ? student.id === "A" : student.id === "B";
    if (student.id !== "A") return false;
    return firstSpeaker === (state.cls.role === "first");
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
      return state.cls.partner ? state.cls.partner : (state.cls.name || "You");
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
    if (state.mode === "class" && !classPaired()) {
      prompt.appendChild(el("span", { "data-role": "prompt-text", class: "waiting", text: state.cls && state.cls.joined ? "Waiting for the teacher to pair you." : "Join your teacher's class to start." }));
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
    if (!(state.mode === "class" && !classPaired())) {
      chipsFor(student).forEach(function (chip) {
        box.appendChild(el("button", { type: "button", "data-chip": chip, text: chip }));
      });
    }
    var name = whoLabel(student);
    student.root.querySelector("[data-role='who-name']").textContent = name;
    student.root.querySelector("[data-role='avatar']").textContent = (name.charAt(0) || "?").toUpperCase();
    student.root.querySelector("[data-role='title']").textContent = state.convo.title || "";
  }
  function renderAll() {
    ["A", "B"].forEach(function (id) { if (state.students[id]) renderChrome(state.students[id]); });
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
  function cross(fromId, line) {
    if (state.both) {
      addBubble(fromId === "A" ? "B" : "A", line, "them", null);
      return;
    }
    if (classPaired()) {
      classSend({
        type: "line", pairId: state.cls.pairId, from: state.cls.name, text: line,
        step: state.step, level: state.level, convoId: state.convo.id, at: Date.now()
      });
    }
  }
  function deliver(student, line, advanceWith) {
    hideHelp(student);
    if (shared()) {
      addBubble(student.id, line, "me", null);
      if (advanceWith) maybeAdvanceShared(student, advanceWith);
      cross(student.id, line);
      renderAll();
    } else {
      addBubble(student.id, line, "me", state.mode === "class" ? "You are not paired yet, so this stayed here." : NO_PARTNER);
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
  function attempt(student, raw) {
    var text = String(raw || "").trim();
    if (!text) return;
    var hit = safetyHit(text);
    if (hit) { holdFlag(student, text, hit); return; }
    var canon = canonical(text);
    if (canon) { deliver(student, canon, canon); return; }
    var swap = matchSwap(text);
    if (swap || isEnglish(text)) { showEnglishHelp(student, text, swap); return; }
    if (isGibberish(text)) { showBlocked(student, text); return; }
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
    sel.disabled = !!(state.mode === "class" && state.cls && state.cls.locked);
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
    try { id = sessionStorage.getItem(key); } catch (e) {}
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      try { sessionStorage.setItem(key, id); } catch (e) {}
    }
    return id;
  }
  function setClassStatus(text) {
    var node = q("[data-role='class-status']");
    if (node) node.textContent = text;
  }
  function refreshPairedStatus() {
    var c = state.cls;
    if (!c || !c.pairId || !c.partner) return;
    var extra = isOpenConvo() ? "Talk freely in Italian." : (c.role === "first" ? "You start." : c.partner + " starts.");
    setClassStatus("You are paired with " + c.partner + ". " + extra);
  }
  function classSend(msg) {
    var c = state.cls;
    if (!c || !c.conn || !c.conn.open) return false;
    try { c.conn.send(msg); return true; } catch (e) { setClassStatus(CLASS_FAIL); return false; }
  }
  window.addEventListener("pagehide", function () {
    var c = state.cls;
    if (c && c.peer) { try { c.peer.destroy(); } catch (e) {} }
  });
  function leaveClass(silent) {
    var c = state.cls;
    if (c) {
      if (c.timer) clearTimeout(c.timer);
      if (c.conn) { try { c.conn.close(); } catch (e) {} }
      if (c.peer) { try { c.peer.destroy(); } catch (e) {} }
    }
    state.cls = null;
    var leave = q("[data-role='leave-class']");
    var join = q("[data-role='join-class']");
    if (leave) leave.hidden = true;
    if (join) join.hidden = false;
    if (!silent) setClassStatus("You left the class.");
    syncLevelUi();
    fillConversationSelect();
    resetConversation();
  }
  function onTeacherMsg(data) {
    var c = state.cls;
    if (!c || !data || typeof data !== "object") return;
    if (data.type === "welcome") {
      c.joined = true;
      c.className = String(data.className || "your class");
      c.locked = !!data.locked;
      if (data.level && convosFor(data.level).length && String(data.level) !== state.level) setLevel(String(data.level), true);
      syncLevelUi();
      setClassStatus("You joined " + c.className + ". Waiting for the teacher to pair you.");
      renderAll();
      return;
    }
    if (data.type === "paired") {
      c.pairId = String(data.pairId);
      c.partner = String((data.partner && data.partner.name) || "Partner");
      c.role = data.role === "first" ? "first" : "second";
      c.locked = !!data.locked;
      setLevel(data.level && convosFor(data.level).length ? String(data.level) : state.level, true);
      if (data.convoId && data.convoId !== state.convo.id) setConversation(String(data.convoId), true);
      if (typeof data.step === "number" && data.step >= 0 && data.step <= (state.convo.steps || []).length) state.step = data.step;
      syncLevelUi();
      fillConversationSelect();
      refreshPairedStatus();
      renderAll();
      return;
    }
    if (data.type === "unpaired") {
      c.pairId = null; c.partner = null; c.role = null;
      setClassStatus("The teacher changed pairs. Waiting for the teacher to pair you.");
      resetConversation();
      return;
    }
    if (data.type === "partner_status") {
      if (c.partner) setClassStatus(data.online ? c.partner + " is back." : c.partner + " disconnected. Wait for them, or ask your teacher.");
      return;
    }
    if (data.type === "line") {
      if (!c.pairId || String(data.pairId) !== c.pairId) return;
      var clean = canonical(data.text);
      var line = clean || String(data.text || "").trim();
      if (!line || isEnglish(line) || isGibberish(line) || safetyHit(line)) return;
      addBubble("A", line, "them", null);
      var total = (state.convo.steps || []).length;
      if (typeof data.step === "number" && data.step % 1 === 0 && data.step >= 0 && data.step <= total) state.step = data.step;
      renderAll();
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
      leaveClass(true);
      setClassStatus("Your teacher ended the class session.");
    }
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
    var sid = studentId();
    var c = state.cls = { code: code, name: name, sid: sid, peer: null, conn: null, joined: false, pairId: null, partner: null, role: null, locked: false, timer: null };
    setClassStatus("Connecting to class " + code + "…");
    q("[data-role='join-class']").hidden = true;
    q("[data-role='leave-class']").hidden = false;
    var fail = function () {
      if (state.cls !== c) return;
      if (c.timer) { clearTimeout(c.timer); c.timer = null; }
      setClassStatus(CLASS_FAIL);
      q("[data-role='join-class']").hidden = false;
    };
    c.timer = setTimeout(function () { if (!c.joined) fail(); }, 12000);
    try {
      c.peer = new Peer(teacherPeerId(code) + "-s-" + sid, { debug: 0 });
    } catch (e) { fail(); return; }
    c.peer.on("open", function () {
      var conn;
      try { conn = c.peer.connect(teacherPeerId(code), { reliable: true, metadata: { studentId: sid } }); } catch (e) { fail(); return; }
      c.conn = conn;
      conn.on("open", function () {
        try { conn.send({ type: "join", name: name, studentId: sid }); } catch (e) { fail(); }
      });
      conn.on("data", onTeacherMsg);
      conn.on("close", function () {
        if (state.cls !== c) return;
        c.pairId = null;
        setClassStatus("Lost the connection to your teacher. Join again, or use Try both sides.");
        q("[data-role='join-class']").hidden = false;
        renderAll();
      });
      conn.on("error", fail);
    });
    c.peer.on("error", fail);
    renderAll();
  }

  /* ---------- modes ---------- */
  function setMode(mode) {
    if (mode === "class" && !state.standalone) mode = "solo";
    if (state.mode === "class" && mode !== "class") leaveClass(true);
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
      thread,
      el("div", { class: "dock" },
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
    var student = { id: id, step: 0, root: root };
    clearThread(student);
    root.addEventListener("click", function (event) {
      var btn = event.target.closest("button[data-chip]");
      if (!btn || !root.contains(btn)) return;
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
        el("button", { type: "button", class: "quiet", "data-role": "leave-class", text: "Leave class" }),
        el("p", { class: "class-status", "data-role": "class-status", text: "Enter the class code from your teacher and your first name." })
      );
      joinbar.hidden = true;
      joinbar.querySelector("[data-role='leave-class']").hidden = true;
      mount.appendChild(joinbar);
      joinbar.querySelector("[data-role='join-class']").addEventListener("click", joinClass);
      joinbar.querySelector("[data-role='leave-class']").addEventListener("click", function () { leaveClass(false); });
      joinbar.querySelector("[data-role='join-name']").addEventListener("keydown", function (e) { if (e.key === "Enter") joinClass(); });
    }
    var stage = el("div", { class: "stage", "data-role": "stage" });
    state.students.A = makeStudent("A");
    state.students.B = makeStudent("B");
    state.students.B.root.hidden = true;
    stage.appendChild(state.students.A.root);
    stage.appendChild(state.students.B.root);
    mount.appendChild(stage);

    var wanted = mount.getAttribute("data-level") || "1";
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
      var code = (params.get("join") || params.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (code) {
        setMode("class");
        q("[data-role='join-code']").value = code;
        q("[data-role='join-name']").focus();
      }
    }
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
    fetch(new URL("conversations.json", base).href, { cache: "no-store" })
      .then(function (res) { if (!res.ok) throw new Error("conversations"); return res.json(); })
      .then(function (data) { build(mount, data); })
      .catch(function () { mount.textContent = "The conversation list did not load."; });
  }

  function loadScript(url, next) {
    var tag = document.createElement("script");
    tag.src = url;
    tag.onload = next;
    tag.onerror = next;
    document.head.appendChild(tag);
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
    if (window.IgcSafety) loadPeer();
    else loadScript(new URL("safety.js", base).href, loadPeer);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
