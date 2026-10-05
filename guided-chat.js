/* Italian guided chat — test copy. Not the live fill-in-the-blank apps. */
(function () {
  var script = document.currentScript;
  var base = new URL("./", script && script.src ? script.src : location.href);

  var NOTE = "Your partner only sees the corrected Italian. They never see your mistakes.";
  var BLOCKED = "Your partner will not see this until it is a phrase from the list, or one of the helped lines.";
  var FREE = "Now write your own message in Italian.";
  var NO_PARTNER = "No partner is connected, so this stayed here. Use Try both sides, or a 4-letter room code.";
  var WAITING = "Waiting for your partner.";

  var SWAPS = [
    { label: "hello -> Ciao!", keys: ["hello"], it: "Ciao!" },
    { label: "how are you -> Come stai?", keys: ["how are you"], it: "Come stai?" },
    { label: "I am good / I'm good -> Sto bene.", keys: ["i am good", "i'm good"], it: "Sto bene." },
    { label: "yes -> Sì.", keys: ["yes"], it: "Sì." },
    { label: "no -> No.", keys: ["no"], it: "No." },
    { label: "thanks -> Grazie!", keys: ["thanks"], it: "Grazie!" },
    { label: "I do not know -> Non lo so.", keys: ["i do not know"], it: "Non lo so." }
  ];

  var EN = Object.create(null);
  ("a about am an and are as at be because been but by can come did do does dont don't goodbye good have hello hey hi how hungry i i'm im in is it its it's just know like me my no not of oh ok okay on or please really so sorry thank thanks that the them then there they this thirsty to too want was we what when where who why with yes you your food water coffee today tomorrow morning night very think feel tired cold hot sleep home house friend friends going get go").split(/\s+/).forEach(function (w) {
    EN[w] = true;
  });

  var LEVEL_ORDER = ["1", "2", "3", "4", "AP"];
  var state = {
    conversations: [],
    convo: null,
    level: "1",
    step: 0,
    role: null,
    both: false,
    peer: null,
    conn: null,
    peerTimer: null,
    students: {},
    italian: Object.create(null),
    phraseMap: null
  };

  function foldIt(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[\u2019\u2018`]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchKey(s) {
    return foldIt(s)
      .replace(/[^a-z0-9' ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function foldEn(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[\u2019\u2018`]/g, "'")
      .replace(/[?!.,;:]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function wordTokens(text) {
    var raw = String(text || "").toLowerCase().replace(/[\u2019\u2018`]/g, "'");
    var m = raw.match(/[a-z\u00e0-\u024f']+/g);
    if (!m) return [];
    return m.map(function (w) {
      return w.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    });
  }

  function learnWord(raw) {
    var k = foldIt(raw).replace(/[^a-z']/g, "");
    if (!k) return;
    state.italian[k] = true;
    k.split("'").forEach(function (bit) {
      if (bit) state.italian[bit] = true;
    });
  }

  function learnPhrase(phrase) {
    String(phrase).split(/[^A-Za-z\u00C0-\u024F'\u2019]+/).forEach(function (part) {
      if (part) learnWord(part);
    });
  }

  function rebuildMap() {
    var map = Object.create(null);
    var phrases = [];
    (state.convo.steps || []).forEach(function (step) {
      (step.chips || []).forEach(function (chip) { phrases.push(chip); });
    });
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
    if (!words.length) return false;
    for (var i = 0; i < words.length; i++) {
      if (EN[words[i]] && !state.italian[words[i]]) return true;
    }
    return words.every(function (w) { return !!EN[w]; });
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
    for (var i = 2; i < arguments.length; i++) {
      if (arguments[i]) node.appendChild(arguments[i]);
    }
    return node;
  }

  function injectCss() {
    if (document.getElementById("guided-chat-css")) return;
    var style = document.createElement("style");
    style.id = "guided-chat-css";
    style.textContent = [
      "html.guided-fill, html.guided-fill body { height:100%; margin:0; overflow:hidden; background:#121216; }",
      "html.guided-fill #italian-guided-chat { height:100%; min-height:0; }",
      "#italian-guided-chat { box-sizing:border-box; min-height:640px; height:100%; display:flex; flex-direction:column; background:#121216; color:#fff; font-family:system-ui,-apple-system,'Segoe UI',sans-serif; }",
      "#italian-guided-chat * { box-sizing:border-box; }",
      "#italian-guided-chat button, #italian-guided-chat input, #italian-guided-chat select { font:inherit; color:inherit; }",
      "#italian-guided-chat .toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:8px 10px; background:#1c1c1e; }",
      "#italian-guided-chat .toolbar label { display:flex; align-items:center; gap:6px; font-size:14px; color:#d0d0d4; }",
      "#italian-guided-chat .toolbar label[hidden] { display:none !important; }",
      "#italian-guided-chat .toolbar select { min-height:40px; background:#2c2c2e; border:1px solid #3a3a3c; border-radius:10px; padding:6px 8px; }",
      "#italian-guided-chat .toolbar button { min-height:40px; background:#2c2c2e; border:1px solid #3a3a3c; border-radius:10px; padding:8px 12px; cursor:pointer; }",
      "#italian-guided-chat .toolbar button[aria-pressed='true'] { background:#0a84ff; border-color:#0a84ff; }",
      "#italian-guided-chat .room { padding:8px 12px 12px; background:#1c1c1e; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }",
      "#italian-guided-chat .room[hidden] { display:none !important; }",
      "#italian-guided-chat .room input { min-height:40px; width:6.5rem; letter-spacing:.2em; text-transform:uppercase; background:#000; border:1px solid #3a3a3c; border-radius:10px; padding:8px; }",
      "#italian-guided-chat .room button { min-height:40px; background:#2c2c2e; border:1px solid #3a3a3c; border-radius:10px; padding:8px 12px; cursor:pointer; }",
      "#italian-guided-chat .code { font-size:28px; font-weight:800; letter-spacing:.18em; min-width:5.2rem; }",
      "#italian-guided-chat .peer-status { flex:1 1 220px; font-size:14px; color:#d6e6ff; margin:0; }",
      "#italian-guided-chat .stage { flex:1; min-height:0; display:grid; grid-template-columns:1fr; }",
      "#italian-guided-chat .stage.both { grid-template-columns:1fr 1fr; gap:8px; padding:8px; }",
      "@media (max-width:800px) { #italian-guided-chat .stage.both { grid-template-columns:1fr; grid-template-rows:1fr 1fr; } }",
      "#italian-guided-chat .student { height:100%; min-height:0; display:flex; flex-direction:column; background:#000; overflow:hidden; }",
      "#italian-guided-chat .stage.both .student { border:1px solid #2a2a2e; border-radius:16px; }",
      "#italian-guided-chat .student[hidden] { display:none !important; }",
      "#italian-guided-chat .who { display:flex; gap:8px; align-items:center; padding:8px 12px 4px; }",
      "#italian-guided-chat .avatar { width:32px; height:32px; border-radius:50%; display:grid; place-items:center; font-weight:800; background:#0a84ff; }",
      "#italian-guided-chat .student[data-student='B'] .avatar { background:#30d158; color:#04140a; }",
      "#italian-guided-chat .who-name { font-weight:700; font-size:15px; }",
      "#italian-guided-chat .who-title { color:#aeaeb2; font-size:13px; }",
      "#italian-guided-chat .note { background:#1c2a3a; color:#d6e6ff; padding:8px 12px; font-size:13px; line-height:1.35; }",
      "#italian-guided-chat .thread { flex:1; min-height:72px; overflow:auto; padding:10px 12px; display:flex; flex-direction:column; gap:8px; }",
      "#italian-guided-chat .empty { color:#8e8e93; font-size:14px; text-align:center; margin:12px 8px; }",
      "#italian-guided-chat .bubble { max-width:82%; padding:8px 12px; border-radius:18px; font-size:16px; line-height:1.35; word-break:break-word; }",
      "#italian-guided-chat .bubble.me { align-self:flex-end; background:#0a84ff; color:#fff; border-bottom-right-radius:5px; }",
      "#italian-guided-chat .bubble.them { align-self:flex-start; background:#2c2c2e; color:#fff; border-bottom-left-radius:5px; }",
      "#italian-guided-chat .bubble.pending { align-self:flex-end; background:transparent; color:#ffd60a; border:1.5px dashed #ff9f0a; border-bottom-right-radius:5px; }",
      "#italian-guided-chat .bubble .why { display:block; margin-top:6px; font-size:12px; font-weight:650; color:#ffd7a8; }",
      "#italian-guided-chat .prompt { padding:4px 12px 0; font-size:14px; color:#fff; line-height:1.35; }",
      "#italian-guided-chat .prompt .step { color:#8e8e93; }",
      "#italian-guided-chat .prompt .waiting { color:#ffd60a; font-weight:650; }",
      "#italian-guided-chat .chips { display:flex; flex-wrap:wrap; gap:6px; padding:8px 12px; max-height:132px; overflow:auto; }",
      "#italian-guided-chat .chips button, #italian-guided-chat .swap button { min-height:40px; border-radius:999px; border:1px solid #3a3a3c; background:#2c2c2e; color:#fff; font-weight:650; padding:8px 12px; cursor:pointer; }",
      "#italian-guided-chat .help { margin:0 12px 8px; background:#3a2424; color:#ffd7d4; border-radius:12px; padding:8px 10px; max-height:150px; overflow:auto; font-size:14px; }",
      "#italian-guided-chat .help[hidden] { display:none !important; }",
      "#italian-guided-chat .help-lead { margin:0 0 6px; font-weight:700; }",
      "#italian-guided-chat .help-label { margin:0 0 4px; color:#ffb4a8; font-size:12px; font-weight:700; }",
      "#italian-guided-chat .swap { display:flex; align-items:center; gap:6px; margin:4px 0; }",
      "#italian-guided-chat .swap.match button { outline:2px solid #ffd60a; }",
      "#italian-guided-chat .composer { display:flex; gap:8px; padding:8px 12px 12px; }",
      "#italian-guided-chat .composer input { flex:1; min-width:0; border-radius:18px; border:1px solid #3a3a3c; background:#1c1c1e; padding:10px 12px; font-size:16px; }",
      "#italian-guided-chat .composer button { background:#0a84ff; color:#fff; border:0; border-radius:14px; min-width:72px; min-height:44px; font-weight:700; cursor:pointer; }"
    ].join("\n");
    document.head.appendChild(style);
  }

  function studentById(id) {
    return state.students[id];
  }

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
    help.textContent = "";
  }

  function scrollThread(student) {
    var thread = student.root.querySelector("[data-role='thread']");
    thread.scrollTop = thread.scrollHeight;
  }

  function addBubble(studentId, text, kind, pendingWhy) {
    var student = studentById(studentId);
    if (!student) return;
    var thread = student.root.querySelector("[data-role='thread']");
    var empty = thread.querySelector("[data-role='empty']");
    if (empty) empty.remove();
    var bubble = document.createElement("div");
    bubble.className = "bubble " + (pendingWhy ? "pending" : kind);
    bubble.setAttribute("data-text", text);
    bubble.setAttribute("data-sent", pendingWhy ? "false" : "true");
    var line = document.createElement("span");
    line.className = "line";
    line.textContent = text;
    bubble.appendChild(line);
    if (pendingWhy) {
      var why = document.createElement("span");
      why.className = "why";
      why.textContent = pendingWhy;
      bubble.appendChild(why);
    }
    thread.appendChild(bubble);
    scrollThread(student);
  }

  function shared() {
    return state.both || !!(state.conn && state.conn.open);
  }

  function stepOf(student) {
    return shared() ? state.step : student.step;
  }

  function hasTurn(student) {
    if (!shared()) return true;
    var steps = state.convo.steps || [];
    if (state.step >= steps.length) return true;
    var firstSpeaker = state.step % 2 === 0;
    if (state.both) return firstSpeaker ? student.id === "A" : student.id === "B";
    if (student.id !== "A") return false;
    return firstSpeaker === (state.role === "host");
  }

  function chipsFor(student) {
    var steps = state.convo.steps || [];
    var step = stepOf(student);
    if (step >= steps.length) {
      var seen = Object.create(null);
      var all = [];
      steps.forEach(function (step) {
        (step.chips || []).forEach(function (chip) {
          if (!seen[chip]) {
            seen[chip] = true;
            all.push(chip);
          }
        });
      });
      return all;
    }
    if (!hasTurn(student)) return [];
    return steps[step].chips || [];
  }

  function renderChrome(student) {
    var steps = state.convo.steps || [];
    var prompt = student.root.querySelector("[data-role='prompt']");
    prompt.textContent = "";
    var step = stepOf(student);
    var turn = hasTurn(student);
    student.root.setAttribute("data-turn", turn ? "yes" : "no");
    if (step >= steps.length) {
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
    chipsFor(student).forEach(function (chip) {
      var btn = el("button", { type: "button", "data-chip": chip, text: chip });
      box.appendChild(btn);
    });
    var title = student.root.querySelector("[data-role='title']");
    if (title) title.textContent = state.convo.title || "";
  }

  function renderAll() {
    ["A", "B"].forEach(function (id) {
      if (state.students[id]) renderChrome(state.students[id]);
    });
  }

  function canCross() {
    return shared();
  }

  function cross(fromId, canon) {
    if (state.both) {
      addBubble(fromId === "A" ? "B" : "A", canon, "them", null);
      return;
    }
    if (state.conn && state.conn.open) {
      try {
        state.conn.send({ t: "line", text: canon, step: state.step });
      } catch (err) {
        setPeerStatus("The message did not go through. The connection failed. Use Try both sides on this computer.");
      }
    }
  }

  function maybeAdvanceShared(student, canon) {
    var steps = state.convo.steps || [];
    if (state.step >= steps.length || !hasTurn(student)) return;
    var chips = steps[state.step].chips || [];
    if (chips.indexOf(canon) !== -1) state.step += 1;
  }

  function resetConversation() {
    state.step = 0;
    ["A", "B"].forEach(function (id) {
      if (state.students[id]) clearThread(state.students[id]);
    });
    renderAll();
  }

  function maybeAdvance(student, canon) {
    var steps = state.convo.steps || [];
    if (student.step >= steps.length) return;
    var chips = steps[student.step].chips || [];
    if (chips.indexOf(canon) !== -1) student.step += 1;
  }

  function showSwapList(help, match) {
    var label = el("p", { class: "help-label", text: "Known swaps" });
    help.appendChild(label);
    SWAPS.forEach(function (swap) {
      var row = el("div", { class: "swap" + (match && match.it === swap.it ? " match" : "") });
      var words = swap.label.split(" -> ");
      row.appendChild(el("span", { text: words[0] + " -> " }));
      row.appendChild(el("button", { type: "button", "data-chip": swap.it, text: swap.it }));
      help.appendChild(row);
    });
  }

  function showEnglishHelp(student, raw, swap) {
    var lead = swap
      ? "Write it in Italian."
      : "Write it in Italian. I do not have that phrase yet. Tap a phrase chip.";
    addBubble(student.id, raw, "me", lead);
    var help = student.root.querySelector("[data-role='help']");
    help.hidden = false;
    help.textContent = "";
    help.appendChild(el("p", { class: "help-lead", text: lead }));
    showSwapList(help, swap);
    scrollThread(student);
  }

  function showBlocked(student, raw) {
    addBubble(student.id, raw, "me", BLOCKED);
    var help = student.root.querySelector("[data-role='help']");
    help.hidden = false;
    help.textContent = "";
    help.appendChild(el("p", { class: "help-lead", text: BLOCKED }));
    scrollThread(student);
  }

  function attempt(student, raw) {
    var text = String(raw || "").trim();
    if (!text) return;
    var canon = canonical(text);
    if (canon) {
      hideHelp(student);
      if (canCross()) {
        addBubble(student.id, canon, "me", null);
        maybeAdvanceShared(student, canon);
        cross(student.id, canon);
        renderAll();
      } else {
        addBubble(student.id, canon, "me", NO_PARTNER);
        maybeAdvance(student, canon);
        renderChrome(student);
      }
      return;
    }
    var swap = matchSwap(text);
    if (swap || isEnglish(text)) {
      showEnglishHelp(student, text, swap);
      return;
    }
    showBlocked(student, text);
  }

  function convosFor(level) {
    return state.conversations.filter(function (c) { return String(c.level) === String(level); });
  }

  function setLevel(level, fromRemote) {
    var list = convosFor(level);
    if (!list.length) return;
    state.level = String(level);
    state.convo = list[0];
    state.step = 0;
    state.phraseMap = null;
    rebuildMap();
    var mount = document.getElementById("italian-guided-chat");
    if (mount) mount.setAttribute("data-level", state.level);
    var levelSelect = document.querySelector("#italian-guided-chat [data-role='level']");
    if (levelSelect && levelSelect.value !== state.level) levelSelect.value = state.level;
    fillConversationSelect();
    ["A", "B"].forEach(function (id) {
      if (state.students[id]) clearThread(state.students[id]);
    });
    renderAll();
    if (!fromRemote && state.conn && state.conn.open && !state.both) {
      try { state.conn.send({ t: "level", level: state.level }); } catch (err) {}
    }
  }

  function setConversation(id, fromRemote) {
    var found = null;
    state.conversations.forEach(function (c) {
      if (c.id === id) found = c;
    });
    if (!found) return;
    state.level = String(found.level);
    state.convo = found;
    state.step = 0;
    state.phraseMap = null;
    rebuildMap();
    var mount = document.getElementById("italian-guided-chat");
    if (mount) mount.setAttribute("data-level", state.level);
    ["A", "B"].forEach(function (sid) {
      if (state.students[sid]) clearThread(state.students[sid]);
    });
    fillConversationSelect();
    renderAll();
    if (!fromRemote && state.conn && state.conn.open && !state.both) {
      try { state.conn.send({ t: "convo", id: found.id }); } catch (err) {}
    }
  }

  function fillConversationSelect() {
    var select = document.querySelector("#italian-guided-chat [data-role='conversation']");
    var wrap = document.querySelector("#italian-guided-chat [data-role='conversation-wrap']");
    if (!select || !wrap) return;
    var list = convosFor(state.level);
    select.textContent = "";
    list.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.title;
      if (state.convo && c.id === state.convo.id) opt.selected = true;
      select.appendChild(opt);
    });
    wrap.hidden = list.length < 2;
  }

  function setPeerStatus(text) {
    var node = document.querySelector("#italian-guided-chat [data-role='peer-status']");
    if (node) node.textContent = text;
  }

  function clearPeerTimer() {
    if (state.peerTimer) {
      clearTimeout(state.peerTimer);
      state.peerTimer = null;
    }
  }

  function stopPeer() {
    clearPeerTimer();
    if (state.conn) {
      try { state.conn.close(); } catch (err) {}
      state.conn = null;
    }
    if (state.peer) {
      try { state.peer.destroy(); } catch (err) {}
      state.peer = null;
    }
  }

  function onRemote(data) {
    if (!data || typeof data !== "object" || state.both) return;
    if (data.t === "line") {
      var clean = canonical(data.text);
      if (!clean) return;
      addBubble("A", clean, "them", null);
      var total = (state.convo.steps || []).length;
      if (typeof data.step === "number" && data.step % 1 === 0 && data.step >= 0 && data.step <= total) {
        state.step = data.step;
      }
      renderAll();
      return;
    }
    if (data.t === "convo" && data.id && (!state.convo || data.id !== state.convo.id)) {
      setConversation(String(data.id), true);
      return;
    }
    if (data.t === "level" && data.level && String(data.level) !== state.level) {
      setLevel(String(data.level), true);
    }
  }

  function bindConn(conn, isHost) {
    state.conn = conn;
    conn.on("open", function () {
      clearPeerTimer();
      setPeerStatus("Connected. Your partner only sees Italian that passed the check.");
      resetConversation();
      if (isHost) {
        try {
          conn.send({ t: "level", level: state.level });
          if (state.convo) conn.send({ t: "convo", id: state.convo.id });
        } catch (err) {}
      }
    });
    conn.on("data", onRemote);
    conn.on("error", function () {
      clearPeerTimer();
      setPeerStatus("The connection failed. Try both sides still works on this computer.");
    });
    conn.on("close", function () {
      if (state.conn === conn) state.conn = null;
      setPeerStatus("The partner disconnected. Try both sides still works on this computer.");
      renderAll();
    });
  }

  function peerMissing() {
    setPeerStatus("The connection tool did not load. Use Try both sides on this computer.");
  }

  function armTimer() {
    clearPeerTimer();
    state.peerTimer = setTimeout(function () {
      if (!state.conn || !state.conn.open) {
        setPeerStatus("Could not connect. Check the 4-letter code and the network, or use Try both sides.");
      }
    }, 8000);
  }

  function showCode(code) {
    var node = document.querySelector("#italian-guided-chat [data-role='room-code']");
    if (node) node.textContent = code;
  }

  function createRoom() {
    if (typeof Peer !== "function") return peerMissing();
    stopPeer();
    state.role = "host";
    var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var code = "";
    for (var i = 0; i < 4; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
    showCode(code);
    armTimer();
    try {
      state.peer = new Peer("itguided" + code.toLowerCase(), { debug: 0 });
    } catch (err) {
      clearPeerTimer();
      setPeerStatus("Could not start the room. Use Try both sides on this computer.");
      return;
    }
    state.peer.on("open", function () {
      clearPeerTimer();
      setPeerStatus("Room " + code + " is open. Your partner types this code on their computer.");
    });
    state.peer.on("connection", function (conn) { bindConn(conn, true); });
    state.peer.on("error", function () {
      clearPeerTimer();
      setPeerStatus("Could not connect to the room. Check the network, or use Try both sides on this computer.");
    });
  }

  function joinRoom(raw) {
    var code = String(raw || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    if (code.length !== 4) {
      setPeerStatus("Enter the 4-letter room code.");
      return;
    }
    if (typeof Peer !== "function") return peerMissing();
    stopPeer();
    state.role = "guest";
    showCode(code);
    armTimer();
    try {
      state.peer = new Peer({ debug: 0 });
    } catch (err) {
      clearPeerTimer();
      setPeerStatus("Could not connect. Use Try both sides on this computer.");
      return;
    }
    state.peer.on("open", function () {
      var conn;
      try {
        conn = state.peer.connect("itguided" + code.toLowerCase(), { reliable: true });
      } catch (err) {
        clearPeerTimer();
        setPeerStatus("Could not connect. Check the 4-letter code and the network, or use Try both sides.");
        return;
      }
      bindConn(conn, false);
    });
    state.peer.on("error", function () {
      clearPeerTimer();
      setPeerStatus("Could not connect. Check the 4-letter code and the network, or use Try both sides.");
    });
  }

  function setBoth(on) {
    state.both = !!on;
    var stage = document.querySelector("#italian-guided-chat [data-role='stage']");
    var button = document.querySelector("#italian-guided-chat [data-role='try-both']");
    var b = state.students.B.root;
    if (state.both) {
      stage.classList.add("both");
      b.hidden = false;
      button.setAttribute("aria-pressed", "true");
      button.textContent = "One student";
    } else {
      stage.classList.remove("both");
      b.hidden = true;
      button.setAttribute("aria-pressed", "false");
      button.textContent = "Try both sides";
    }
    resetConversation();
  }

  function makeStudent(id, name) {
    var thread = el("div", { class: "thread", "data-role": "thread" });
    thread.appendChild(el("p", { class: "empty", "data-role": "empty", text: "No messages yet." }));
    var root = el("section", { class: "student", "data-student": id },
      el("div", { class: "who" },
        el("div", { class: "avatar", text: id }),
        el("div", {},
          el("div", { class: "who-name", text: name }),
          el("div", { class: "who-title", "data-role": "title", text: "" })
        )
      ),
      el("p", { class: "note", "data-role": "note", text: NOTE }),
      thread,
      el("p", { class: "prompt", "data-role": "prompt" }),
      el("div", { class: "chips", "data-role": "chips" }),
      el("div", { class: "help", "data-role": "help" }),
      el("form", { class: "composer", "data-role": "form" },
        el("input", {
          "data-role": "composer",
          type: "text",
          placeholder: "Type Italian",
          autocomplete: "off",
          autocorrect: "off",
          autocapitalize: "off",
          spellcheck: "false",
          "aria-label": "Type a phrase"
        }),
        el("button", { "data-role": "send", type: "submit", text: "Send" })
      )
    );
    var help = root.querySelector("[data-role='help']");
    help.hidden = true;
    var student = { id: id, step: 0, root: root };
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
      (convo.steps || []).forEach(function (step) {
        (step.chips || []).forEach(learnPhrase);
      });
    });
    SWAPS.forEach(function (swap) { learnPhrase(swap.it); });

    var levels = [];
    list.forEach(function (convo) {
      var level = String(convo.level);
      if (levels.indexOf(level) < 0) levels.push(level);
    });
    levels.sort(function (a, b) {
      var ia = LEVEL_ORDER.indexOf(a);
      var ib = LEVEL_ORDER.indexOf(b);
      if (ia < 0) ia = 50;
      if (ib < 0) ib = 50;
      if (ia !== ib) return ia - ib;
      return a < b ? -1 : 1;
    });

    mount.textContent = "";
    var levelSelect = el("select", { "data-role": "level", "aria-label": "Level" });
    levels.forEach(function (level) {
      var opt = document.createElement("option");
      opt.value = level;
      opt.textContent = "Level " + level;
      levelSelect.appendChild(opt);
    });
    var convoSelect = el("select", { "data-role": "conversation", "aria-label": "Conversation" });
    var convoWrap = el("label", { "data-role": "conversation-wrap", text: "Conversation " }, convoSelect);
    convoWrap.hidden = true;
    var tryBtn = el("button", { type: "button", "data-role": "try-both", text: "Try both sides" });
    tryBtn.setAttribute("aria-pressed", "false");
    var roomBtn = el("button", { type: "button", "data-role": "share-room", text: "Share a room" });
    var toolbar = el("div", { class: "toolbar" },
      el("label", { text: "Level " }, levelSelect),
      convoWrap,
      tryBtn,
      roomBtn
    );
    var room = el("div", { class: "room", "data-role": "room" },
      el("button", { type: "button", "data-role": "create-room", text: "Create a room" }),
      el("div", { class: "code", "data-role": "room-code", text: "----" }),
      el("input", {
        "data-role": "join-code",
        type: "text",
        maxlength: "4",
        placeholder: "CODE",
        "aria-label": "4-letter room code",
        autocomplete: "off"
      }),
      el("button", { type: "button", "data-role": "join-room", text: "Join" }),
      el("p", { class: "peer-status", "data-role": "peer-status", text: "Or use Try both sides on this computer." })
    );
    room.hidden = true;
    var stage = el("div", { class: "stage", "data-role": "stage" });
    state.students.A = makeStudent("A", "Student A");
    state.students.B = makeStudent("B", "Student B");
    state.students.B.root.hidden = true;
    stage.appendChild(state.students.A.root);
    stage.appendChild(state.students.B.root);
    mount.appendChild(toolbar);
    mount.appendChild(room);
    mount.appendChild(stage);

    var wanted = mount.getAttribute("data-level") || "1";
    if (!convosFor(wanted).length) wanted = levels[0] || "1";
    levelSelect.value = wanted;
    setLevel(wanted, true);

    levelSelect.addEventListener("change", function () { setLevel(levelSelect.value, false); });
    convoSelect.addEventListener("change", function () { setConversation(convoSelect.value); });
    tryBtn.addEventListener("click", function () { setBoth(!state.both); });
    roomBtn.addEventListener("click", function () { room.hidden = !room.hidden; });
    room.querySelector("[data-role='create-room']").addEventListener("click", createRoom);
    room.querySelector("[data-role='join-room']").addEventListener("click", function () {
      joinRoom(room.querySelector("[data-role='join-code']").value);
    });
  }

  function start(mount) {
    var only = true;
    Array.prototype.forEach.call(document.body.children, function (node) {
      if (node === mount || node.tagName === "SCRIPT" || node.tagName === "LINK") return;
      only = false;
    });
    if (only) {
      document.documentElement.classList.add("guided-fill");
      document.body.classList.add("guided-fill");
    }
    fetch(new URL("conversations.json", base).href, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("conversations");
        return res.json();
      })
      .then(function (data) { build(mount, data); })
      .catch(function () {
        mount.textContent = "The conversation list did not load.";
      });
  }

  function boot() {
    injectCss();
    var mount = document.getElementById("italian-guided-chat");
    if (!mount) return;
    var go = function () { start(mount); };
    if (typeof Peer === "function") {
      go();
      return;
    }
    var tag = document.createElement("script");
    tag.src = new URL("vendor/peerjs.min.js", base).href;
    tag.onload = go;
    tag.onerror = go;
    document.head.appendChild(tag);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
