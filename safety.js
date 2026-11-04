/* School-safe language check for Italian guided chat.
   One list, used by the student page and the teacher hub.
   Matching is case-insensitive, ignores accents and simple punctuation,
   and compares whole words so names like Assunta are not flagged. */
(function (root) {
  var LISTS = {
    harm: {
      words: [
        "suicide", "suicidal", "suicidio", "suicidarmi", "kys", "kms",
        "uccidere", "uccido", "uccidermi", "ucciderti", "ammazzare", "ammazzo",
        "ammazzarmi", "ammazzarti", "impiccarmi", "autolesionismo", "tagliarmi"
      ],
      phrases: [
        "kill myself", "kill yourself", "kill you", "kill him", "kill her", "kill them",
        "want to die", "wanna die", "want to kill", "wanna kill", "going to kill",
        "end my life", "end your life", "hurt myself", "hurt yourself", "cut myself",
        "hang myself", "i want to die", "shoot myself", "shoot you", "stab myself", "stab you",
        "voglio morire", "voglio uccidere", "voglio uccidermi", "voglio farmi male",
        "voglio farti male", "farmi del male", "farti del male", "mi faccio del male",
        "ti faccio male", "ti ammazzo", "mi ammazzo", "ti uccido", "mi uccido",
        "tagliarmi le vene", "mi voglio uccidere"
      ]
    },
    swear: {
      words: [
        "fuck", "fucking", "fucker", "fucked", "fck", "fk", "fuq", "fuk", "phuck", "motherfucker",
        "shit", "shitty", "shyt", "bullshit", "dipshit", "shithead",
        "bitch", "bitches", "biatch", "asshole", "asshat", "jackass", "bastard", "damn", "dammit",
        "goddamn", "crap", "crappy", "hell", "dick", "dickhead", "cock", "pussy", "slut", "whore",
        "piss", "pissed", "cunt", "wtf", "stfu", "ass",
        "cazzo", "cazzi", "cazzata", "cazzate", "cazzoni", "cazzone", "merda", "merde",
        "stronzo", "stronza", "stronzi", "stronze", "stronzate", "vaffanculo", "fanculo",
        "minchia", "minchie", "minchiata", "coglione", "coglioni", "puttana", "puttane",
        "troia", "troie", "fottiti", "fottuto", "fottuta", "incazzato", "incazzata",
        "mignotta", "sborra", "cacchio"
      ],
      phrases: [
        "fuck you", "screw you", "vai a fanculo", "va a fanculo", "porco dio", "porca dio",
        "dio cane", "dio porco", "dio boia", "che cazzo", "col cazzo"
      ]
    },
    putdown: {
      words: [
        "idiot", "idiots", "idiota", "idioti", "moron", "morons", "retard", "retarded", "ritardato",
        "ritardata", "loser", "losers", "dumbass", "cretino", "cretina", "cretini", "imbecille",
        "imbecilli", "deficiente", "deficienti", "zitto", "zitta", "taci", "frocio", "froci",
        "ricchione", "negro", "negra", "nigger", "nigga", "faggot", "fag"
      ],
      phrases: [
        "you are stupid", "youre stupid", "you are dumb", "youre dumb", "you are ugly", "youre ugly",
        "you are an idiot", "sei stupido", "sei stupida", "sei scemo", "sei scema", "sei un idiota",
        "sei idiota", "sei un imbecille", "ti odio", "i hate you", "hate you", "shut up",
        "sta zitto", "stai zitto", "sta zitta", "stai zitta", "fai schifo", "mi fai schifo",
        "you suck", "sei brutto", "sei brutta", "sei inutile", "nobody likes you", "nessuno ti vuole"
      ]
    }
  };

  function foldSafety(s) {
    var t = String(s || "").toLowerCase();
    t = t.replace(/[\u2019\u2018`]/g, "");
    if (t.normalize) t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    t = t.replace(/0/g, "o").replace(/[@4]/g, "a").replace(/3/g, "e").replace(/[1|]/g, "i").replace(/\$/g, "s").replace(/5/g, "s");
    t = t.replace(/([a-z])!([a-z])/g, "$1i$2");
    var prev;
    do {
      prev = t;
      t = t.replace(/([a-z])[^a-z\s]+([a-z])/g, "$1$2");
    } while (t !== prev);
    t = t.replace(/[^a-z\s]+/g, " ");
    t = t.replace(/(.)\1{2,}/g, "$1");
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }

  function dedupe(s) {
    return s.replace(/(.)\1+/g, "$1");
  }

  function hasPhrase(hay, phrase) {
    var p = foldSafety(phrase);
    if (!p) return false;
    return (" " + hay + " ").indexOf(" " + p + " ") !== -1;
  }

  function scan(text) {
    var hay = foldSafety(text);
    if (!hay) return null;
    var views = [hay];
    var tight = dedupe(hay);
    if (tight !== hay) views.push(tight);
    var order = ["harm", "swear", "putdown"];
    for (var i = 0; i < order.length; i++) {
      var cat = order[i];
      var spec = LISTS[cat];
      var phrases = spec.phrases || [];
      var words = spec.words || [];
      for (var v = 0; v < views.length; v++) {
        var view = views[v];
        var tokens = view.split(" ");
        var map = Object.create(null);
        for (var t = 0; t < tokens.length; t++) map[tokens[t]] = true;
        for (var p = 0; p < phrases.length; p++) {
          if (hasPhrase(view, phrases[p])) return { category: cat };
        }
        for (var w = 0; w < words.length; w++) {
          var word = foldSafety(words[w]);
          if (word && map[word]) return { category: cat };
        }
      }
    }
    return null;
  }

  var api = {
    scan: scan,
    label: function (category) {
      if (category === "harm") return "Harm";
      if (category === "putdown") return "Put-down";
      return "Swear";
    }
  };
  root.IgcSafety = api;
})(typeof window !== "undefined" ? window : globalThis);
