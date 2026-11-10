/* Language gate for student chat.
   Blocks English and swears, allows real Italian (including words that
   look like English), and applies only corrections we can make safely. */
(function (root) {
  "use strict";

  var ALLOW = { pizza: true, i: true };
  var PRONOUNS = ["io", "tu", "lui", "lei", "noi", "voi", "loro"];
  var ENGLISH = (
    "hello hi hey goodbye bye please thanks thank what where when why how who " +
    "doing going coming want wanted need needs like likes liked love loved hate hates " +
    "happy sad tired hungry thirsty today tomorrow yesterday yes yeah ok okay good " +
    "morning night friend friends school homework cool awesome great bad ugly stupid " +
    "whatever something anything nothing this that these those they them their there " +
    "here was were been being have has had do does did done can could should would will " +
    "just really very much many not dont can't cant im ive ill its it's see look think " +
    "thought feel felt know knew say said tell told make made take took get got because " +
    "about into onto from with without over under again still already always never now " +
    "then than too also only own same other another every each both few more most some " +
    "any all thing things people person time day days week year years old age name boy " +
    "girl man woman way well better best right left big small new first last long little " +
    "am are is you the an my your we he she it and but or if so for on in at to of"
  ).split(/\s+/);

  function fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[\u2019\u2018`]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function tokens(text) {
    var raw = String(text || "").replace(/\p{Extended_Pictographic}/gu, " ");
    var m = raw.match(/[A-Za-zÀ-ÿ']+/g);
    if (!m) return [];
    return m.map(function (w) {
      return w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/'/g, "").toLowerCase();
    }).filter(Boolean);
  }

  function hasEmoji(text) {
    return /\p{Extended_Pictographic}/u.test(String(text || ""));
  }

  function learn(lex, phrase) {
    tokens(phrase).forEach(function (w) { lex[w] = true; });
  }

  function prepare(conversations) {
    var lex = Object.create(null);
    var phrases = [];
    var seen = Object.create(null);
    (conversations || []).forEach(function (c) {
      (c.steps || []).forEach(function (step) {
        (step.chips || []).forEach(function (chip) { addPhrase(chip); });
      });
      (c.suggestions || []).forEach(function (chip) { addPhrase(chip); });
    });
    function addPhrase(chip) {
      var key = fold(chip);
      if (!key || seen[key]) return;
      seen[key] = true;
      phrases.push(chip);
      learn(lex, chip);
    }
    ["Non c'è male."].forEach(addPhrase);
    PRONOUNS.forEach(function (w) { lex[w] = true; });
    Object.keys(ALLOW).forEach(function (w) { lex[w] = true; });
    var english = Object.create(null);
    ENGLISH.forEach(function (w) { if (w && !lex[w]) english[w] = true; });
    return { lex: lex, english: english, phrases: phrases };
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    var prev = [];
    var j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function exactPhrase(text, phrases) {
    var key = fold(text);
    for (var i = 0; i < phrases.length; i++) {
      if (fold(phrases[i]) === key) return phrases[i];
    }
    return null;
  }

  function fuzzyPhrase(text, phrases) {
    var key = fold(text);
    if (!key) return null;
    var best = null;
    var bestD = 99;
    var ties = 0;
    phrases.forEach(function (p) {
      var k = fold(p);
      var d = levenshtein(key, k);
      var limit = k.length < 8 ? 1 : 2;
      if (d > limit) return;
      if (d < bestD) { best = p; bestD = d; ties = 1; }
      else if (d === bestD) ties += 1;
    });
    if (!best || bestD === 0) return null;
    if (ties > 1) return null;
    return best;
  }

  function cap(word) {
    var w = String(word || "");
    if (!w) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  function repair(raw) {
    var text = String(raw || "").replace(/\s+/g, " ").trim();
    var m = text.match(/^(io)\s+e\s+di\s+(.+?)\s*[.!?]*$/i);
    if (m) {
      var place = m[2].replace(/[.!?]+$/g, "").trim();
      var bits = place.split(/\s+/).map(function (w, i) { return i === 0 ? cap(w) : w; });
      var nice = bits.join(" ");
      return {
        text: "Io sono di " + nice + ".",
        why: "Use sono, a form of essere (to be). Your partner sees: Io sono di " + nice + "."
      };
    }
    m = text.match(/^sono\s+di\s+(.+?)\s*[.!?]*$/i);
    if (m) {
      var where = m[1].replace(/[.!?]+$/g, "").trim();
      var parts = where.split(/\s+/).map(function (w, i) { return i === 0 ? cap(w) : w; });
      var city = parts.join(" ");
      var fixed = "Sono di " + city + ".";
      if (fixed.toLowerCase() === text.replace(/[.!?]+$/g, "").toLowerCase() + ".".toLowerCase() && /[.]$/.test(text) && text === fixed) return null;
      if (fold(fixed) === fold(text) && text === fixed) return null;
      return { text: fixed, why: "Your partner sees: " + fixed };
    }
    m = text.match(/^(io|tu|lui|lei|noi|voi|loro)\s+e\s+([A-Za-zÀ-ÿ]+)\s*[.!?]*$/i);
    if (m && fold(m[2]) !== "di") {
      var who = cap(m[1].toLowerCase());
      var adj = m[2].toLowerCase();
      var line = who + " è " + adj + ".";
      return {
        text: line,
        why: "e means and. The verb to be is è, with the accent. Your partner sees: " + line
      };
    }
    return null;
  }

  var ACCENT = { perche: "perché", citta: "città", caffe: "caffè", piu: "più", gia: "già" };

  function applyAccents(text) {
    var changed = false;
    var out = String(text).replace(/\b(perche|citta|caffe|piu|gia)\b/gi, function (w) {
      var rep = ACCENT[fold(w)];
      if (!rep) return w;
      changed = true;
      return w.charAt(0) === w.charAt(0).toUpperCase() ? cap(rep) : rep;
    });
    if (!changed) return null;
    var whyWord = /perch/i.test(text) ? "perché" : (/citt/i.test(text) ? "città" : "the accent");
    return { text: out, why: "Add the accent: " + whyWord + ". Your partner sees: " + out };
  }

  function englishHits(toks, prep) {
    var bad = [];
    toks.forEach(function (w) {
      if (prep.english[w] && !prep.lex[w]) bad.push(w);
    });
    return bad;
  }

  function wordsAreKnown(text, prep) {
    var rawWords = String(text).match(/[A-Za-zÀ-ÿ']+/g) || [];
    if (!rawWords.length) return false;
    for (var i = 0; i < rawWords.length; i++) {
      var w = rawWords[i];
      var f = fold(w);
      if (prep.lex[f]) continue;
      var isName = i > 0 && w.charAt(0) === w.charAt(0).toUpperCase() && w.slice(1) === w.slice(1).toLowerCase();
      if (isName) continue;
      return false;
    }
    return true;
  }

  function judge(raw, prep) {
    var original = String(raw || "").replace(/\s+/g, " ").trim();
    var base = { action: "send", send: original, why: "", category: "", changed: false, original: original };
    if (!original) { base.action = "empty"; base.send = ""; return base; }
    if (root.IgcSafety && root.IgcSafety.scan) {
      var hit = root.IgcSafety.scan(original);
      if (hit) { base.action = "swear"; base.category = hit.category; base.send = ""; return base; }
    }
    var toks = tokens(original);
    if (!toks.length) {
      base.action = hasEmoji(original) ? "emoji" : "fix";
      base.send = "";
      base.why = hasEmoji(original)
        ? "Add Italian. An emoji by itself is not a message."
        : "That does not look like Italian yet.";
      return base;
    }
    var exact = exactPhrase(original, prep.phrases);
    if (exact) {
      var send = exact;
      if (hasEmoji(original)) {
        var bare = original.replace(/\p{Extended_Pictographic}/gu, " ").replace(/\s+/g, " ").trim();
        if (fold(bare) === fold(exact)) {
          var lead = (original.match(/^(?:\p{Extended_Pictographic}|\s)+/u) || [""])[0].trim();
          var trail = (original.match(/(?:\p{Extended_Pictographic}|\s)+$/u) || [""])[0].trim();
          send = [lead, exact, trail].filter(Boolean).join(" ");
        }
      }
      base.send = send;
      base.changed = send !== original;
      if (base.changed && fold(send) !== fold(original)) base.why = "That matches the phrase " + exact + ".";
      else if (fold(send) === fold(original)) base.changed = false;
      return base;
    }
    var fixed = repair(original);
    if (fixed) {
      base.send = fixed.text;
      base.changed = true;
      base.why = fixed.why;
      return base;
    }
    var fuzzy = fuzzyPhrase(original, prep.phrases);
    if (fuzzy) {
      base.send = fuzzy;
      base.changed = true;
      base.why = "That matches the phrase " + fuzzy + ". Your partner sees: " + fuzzy;
      return base;
    }
    if (englishHits(toks, prep).length) {
      base.action = "english";
      base.send = "";
      base.why = "Write it in Italian.";
      return base;
    }
    var accented = applyAccents(original);
    var check = accented ? accented.text : original;
    if (wordsAreKnown(check, prep)) {
      if (accented) {
        base.send = accented.text;
        base.changed = true;
        base.why = accented.why;
      }
      return base;
    }
    base.action = "fix";
    base.send = "";
    base.why = "Fix this before it is sent. Use a phrase chip, or add the accent (è, perché, città).";
    return base;
  }

  function isQuestion(text) {
    return /\?\s*$/.test(String(text || "").trim());
  }

  root.IgcCoach = {
    prepare: prepare,
    judge: judge,
    isQuestion: isQuestion,
    fold: fold,
    tokens: tokens,
    hasEmoji: hasEmoji,
    goodbyeList: function () {
      return ["Ciao!", "A dopo!", "A domani!", "Arrivederci!", "Ci vediamo!", "Buona giornata!"];
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
