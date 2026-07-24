import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const indexPath = path.join(rootDir, "index.html");
const outputPath = path.join(rootDir, "nce1-analysis.js");
const tokenAnalysisPath = path.join(rootDir, "content", "nce1-token-analysis.v1.json");

const html = fs.readFileSync(indexPath, "utf8");
const tokenAnalysis = fs.existsSync(tokenAnalysisPath)
  ? JSON.parse(fs.readFileSync(tokenAnalysisPath, "utf8")).sentences || {}
  : {};

function extractJsonAssignment(name) {
  const prefix = `window.${name} = `;
  const start = html.indexOf(prefix);
  if (start < 0) throw new Error(`Missing ${name} assignment`);
  const valueStart = start + prefix.length;
  const valueEnd = html.indexOf(";", valueStart);
  if (valueEnd < 0) throw new Error(`Unterminated ${name} assignment`);
  return JSON.parse(html.slice(valueStart, valueEnd));
}

function protectAbbreviations(text) {
  return String(text || "")
    .replace(/\b(Mr|Mrs|Ms|Dr|St)\./g, "$1<dot>")
    .replace(/\b([A-Z])\.([A-Z])\.([A-Z])\./g, "$1<dot>$2<dot>$3<dot>")
    .replace(/\b([A-Z])\.([A-Z])\./g, "$1<dot>$2<dot>")
    .replace(/\b(a|p)\.m\./gi, "$1<dot>m<dot>")
    .replace(/\bU\.S\./g, "U<dot>S<dot>");
}

function splitForPractice(text) {
  const protectedText = protectAbbreviations(text);
  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/<dot>/g, ".").trim())
    .filter(Boolean);
}

function expandForPractice(sentence) {
  const parts = splitForPractice(sentence);
  if (parts.length < 2) return [sentence];
  if (sentence.length < 120 && parts.length < 3) return [sentence];
  return parts;
}

function normalizeKey(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?。！？]+$/g, "")
    .replace(/[,.!?;:"'()[\]{}，。！？；：“”‘’]/g, "")
    .replace(/\s+/g, " ");
}

function displayTokens(text) {
  return String(text || "")
    .trim()
    .replace(/[.!?。！？]+$/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function core(token) {
  return String(token || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z0-9£]+|[^a-z0-9']+$/g, "");
}

const auxiliaries = new Set([
  "am", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had",
  "can", "could", "may", "might", "must", "shall", "should", "will", "would",
  "can't", "couldn't", "mustn't", "shouldn't", "won't", "wouldn't",
  "don't", "doesn't", "didn't", "haven't", "hasn't", "hadn't",
  "isn't", "aren't", "wasn't", "weren't", "i'm", "you're", "he's", "she's",
  "it's", "we're", "they're", "i've", "you've", "we've", "they've", "i'll",
  "you'll", "he'll", "she'll", "we'll", "they'll", "i'd", "you'd", "he'd",
  "she'd", "we'd", "they'd", "there's", "here's", "that's", "what's", "who's", "where's", "how's"
]);

const linkingVerbs = new Set([
  "am", "is", "are", "was", "were", "be", "been", "being", "become", "became",
  "look", "looks", "looked", "seem", "seems", "seemed", "feel", "feels", "felt",
  "sound", "sounds", "smell", "smells", "taste", "tastes", "remain", "remains",
  "remained", "stay", "stays", "stayed", "get", "gets", "got", "grow", "grows",
  "grew", "turn", "turns", "turned", "i'm", "you're", "he's", "she's", "it's",
  "we're", "they're", "that's", "isn't", "aren't", "wasn't", "weren't"
]);

const commonVerbs = new Set([
  "accept", "add", "afford", "answer", "arrive", "ask", "believe", "belong", "break",
  "bring", "buy", "call", "carry", "catch", "change", "clean", "close", "come", "cook",
  "count", "cross", "cut", "decide", "describe", "drink", "drive", "drop", "eat", "enjoy",
  "enter", "fail", "fall", "fill", "find", "finish", "fly", "forget", "get", "give", "go",
  "happen", "hear", "help", "hold", "hope", "invite", "jump", "keep", "know", "laugh",
  "leave", "lend", "let", "like", "listen", "live", "look", "lose", "love", "make", "meet",
  "mind", "miss", "move", "need", "open", "paint", "pay", "play", "put", "read", "remember",
  "repeat", "retire", "return", "rise", "run", "say", "see", "sell", "send", "serve", "show",
  "set", "sit", "sleep", "speak", "spend", "stand", "start", "stay", "stop", "study", "swim", "take",
  "talk", "tell", "think", "throw", "travel", "try", "turn", "understand", "wait", "walk", "want",
  "wash", "watch", "wear", "win", "wonder", "work", "write", "beg", "feel", "offer", "sweep", "shut",
  "accepted", "added", "answered", "arrived", "asked", "believed", "belonged", "broke", "brought",
  "bought", "called", "carried", "caught", "changed", "cleaned", "closed", "came", "cooked", "counted",
  "crossed", "cut", "decided", "described", "drank", "drove", "dropped", "ate", "enjoyed", "entered",
  "failed", "fell", "filled", "found", "finished", "flew", "forgot", "gave", "went", "happened", "heard",
  "helped", "held", "hoped", "invited", "jumped", "kept", "knew", "laughed", "left", "lent", "liked",
  "listened", "lived", "looked", "lost", "loved", "made", "met", "minded", "missed", "moved", "needed",
  "opened", "painted", "paid", "played", "put", "read", "remembered", "repeated", "retired", "returned",
  "rose", "ran", "said", "saw", "sold", "sent", "served", "showed", "set", "sat", "slept", "spoke", "spent",
  "stood", "started", "stayed", "stopped", "studied", "swam", "took", "talked", "told", "thought", "threw",
  "travelled", "tried", "turned", "understood", "waited", "walked", "wanted", "washed", "watched", "wore",
  "won", "wondered", "worked", "wrote", "begged", "felt", "offered", "swept", "shut"
]);

const imperativeVerbs = new Set([
  "ask", "be", "bring", "call", "catch", "close", "come", "cut", "do", "don't", "drink",
  "eat", "follow", "give", "go", "have", "help", "hold", "keep", "let", "listen", "look",
  "make", "meet", "open", "pass", "please", "put", "read", "remember", "repeat", "show",
  "sit", "stand", "stop", "sweep", "shut", "take", "tell", "try", "turn", "wait", "wash", "watch"
]);

const pronouns = new Set([
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "this", "that", "these", "those", "someone", "somebody", "anyone", "anybody", "everyone",
  "everybody", "one", "ones", "mine", "yours", "his", "hers", "ours", "theirs", "who", "what"
]);

const determiners = new Set([
  "a", "an", "the", "my", "your", "his", "her", "its", "our", "their", "this", "that",
  "these", "those", "some", "any", "no", "every", "each", "which", "whose", "another"
]);

const prepositions = new Set([
  "about", "above", "across", "after", "against", "along", "among", "around", "at", "before",
  "behind", "below", "beside", "between", "by", "during", "except", "for", "from", "in", "inside",
  "into", "near", "of", "off", "on", "opposite", "out", "outside", "over", "past", "round", "since",
  "through", "to", "towards", "under", "until", "up", "with", "without"
]);

const timeWords = new Set([
  "today", "tomorrow", "yesterday", "tonight", "now", "then", "later", "early", "late", "always",
  "often", "usually", "sometimes", "never", "already", "yet", "ago", "morning", "afternoon", "evening",
  "night", "week", "month", "year", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
]);

const placeWords = new Set([
  "here", "there", "home", "abroad", "upstairs", "downstairs", "inside", "outside", "away", "everywhere",
  "anywhere", "somewhere", "nowhere"
]);

const discourseWords = new Set([
  "yes", "no", "well", "oh", "ah", "hello", "hi", "goodbye", "thanks", "thank", "sorry", "pardon",
  "please", "certainly", "perhaps", "maybe", "right", "okay", "ok", "and", "but", "so"
]);

const vocativeWords = new Set([
  "sir", "madam", "doctor", "mum", "mother", "dad", "father", "dear", "darling", "miss", "mr", "mrs",
  "bob", "sam", "peter", "ann", "amy", "dave", "tim", "jimmy", "carol", "george", "jane", "john",
  "mary", "sally", "susan", "tom", "polly", "richards", "williams", "bird"
]);

const whWords = new Set(["who", "whom", "whose", "what", "which", "where", "when", "why", "how"]);
const subordinateTypes = new Map([
  ["if", "condition_clause"], ["unless", "condition_clause"], ["because", "reason_clause"],
  ["although", "concession_clause"], ["though", "concession_clause"], ["when", "time_clause"],
  ["while", "time_clause"], ["before", "time_clause"], ["after", "time_clause"],
  ["since", "time_clause"], ["where", "place_clause"], ["as", "manner_clause"]
]);

function isVerb(word) {
  if (!word) return false;
  if (auxiliaries.has(word) || linkingVerbs.has(word) || commonVerbs.has(word)) return true;
  if (/^[a-z]+(ed|ing)$/.test(word)) return true;
  if (/^[a-z]+(s|es)$/.test(word) && !determiners.has(word) && !pronouns.has(word)) {
    const candidates = [word.slice(0, -1), word.slice(0, -2)];
    if (word.endsWith("ies")) candidates.push(`${word.slice(0, -3)}y`);
    return candidates.some((candidate) => commonVerbs.has(candidate));
  }
  return false;
}

function isFiniteVerb(word) {
  return isVerb(word) && !/ing$/.test(word);
}

function isLinkingWord(word) {
  return linkingVerbs.has(word) || /'s$/.test(word || "");
}

function isPunctuationBoundary(token) {
  return /[.!?;]["']?$/.test(token);
}

function makeAnalyzer(tokens) {
  const groups = [];
  const counters = new Map();
  const nextId = (type) => {
    const count = (counters.get(type) || 0) + 1;
    counters.set(type, count);
    return `${type}_${count}`;
  };
  const add = (type, startToken, endToken, parentGroupId = null, label = "") => {
    if (startToken > endToken || startToken < 0 || endToken >= tokens.length) return null;
    const item = { id: nextId(type), type, startToken, endToken, parentGroupId };
    if (label) item.label = label;
    groups.push(item);
    return item;
  };
  return { groups, add };
}

function findVerbIndex(words, start, end) {
  for (let index = start; index <= end; index += 1) {
    if (isFiniteVerb(words[index])) return index;
  }
  for (let index = start; index <= end; index += 1) {
    if (isVerb(words[index])) return index;
  }
  for (let index = start; index <= end; index += 1) {
    if (/'s$/.test(words[index] || "")) return index;
  }
  return -1;
}

function findMainVerbAfter(words, start, end) {
  for (let index = start; index <= end; index += 1) {
    if (isVerb(words[index])) return index;
  }
  return -1;
}

function findPreposition(words, start, end) {
  for (let index = start; index <= end; index += 1) {
    if (prepositions.has(words[index])) return index;
  }
  return -1;
}

function findTrailingVocative(words, start, end) {
  if (end < start) return -1;
  return vocativeWords.has(words[end]) ? end : -1;
}

function classifyAdverbial(words, start, end) {
  const slice = words.slice(start, end + 1);
  if (slice.some((word) => timeWords.has(word))) return "time_adverbial";
  if (slice.some((word) => placeWords.has(word))) return "place_adverbial";
  if (slice[0] === "because" || slice[0] === "for") return "reason_adverbial";
  if (slice[0] === "to") return "purpose_adverbial";
  return "adverbial";
}

function addPostVerbComplements(ctx, words, start, end, parentId, linking = false) {
  if (start > end) return;
  const vocativeIndex = findTrailingVocative(words, start, end);
  let contentEnd = vocativeIndex >= 0 ? vocativeIndex - 1 : end;
  if (vocativeIndex >= 0) ctx.add("vocative", vocativeIndex, vocativeIndex, parentId);
  if (contentEnd >= start && words[contentEnd] === "please") {
    ctx.add("independent_element", contentEnd, contentEnd, parentId);
    contentEnd -= 1;
  }
  if (start > contentEnd) return;

  const relativeIndex = words.findIndex((word, index) => index >= start + 1 && index <= contentEnd && ["who", "whom", "whose", "which", "that"].includes(word));
  if (relativeIndex >= 0) {
    const complement = ctx.add(linking ? "predicative" : "object", start, contentEnd, parentId);
    const relative = ctx.add("relative_clause", relativeIndex, contentEnd, complement?.id || parentId);
    parseClause(ctx, words, relativeIndex, contentEnd, relative?.id || complement?.id || parentId);
    return;
  }

  const prepIndex = findPreposition(words, start, contentEnd);
  let adverbStart = -1;
  for (let index = start; index <= contentEnd; index += 1) {
    if (timeWords.has(words[index]) || placeWords.has(words[index])) {
      adverbStart = index;
      break;
    }
  }
  const splitIndex = prepIndex >= 0 ? prepIndex : adverbStart;
  const coreEnd = splitIndex >= 0 ? splitIndex - 1 : contentEnd;
  if (start <= coreEnd) ctx.add(linking ? "predicative" : "object", start, coreEnd, parentId);
  if (splitIndex >= 0) {
    const type = classifyAdverbial(words, splitIndex, contentEnd);
    const adverbial = ctx.add(type, splitIndex, contentEnd, parentId);
    if (prepositions.has(words[splitIndex]) && splitIndex < contentEnd) {
      ctx.add("prepositional_object", splitIndex + 1, contentEnd, adverbial?.id || parentId);
    }
  }
}

function parseQuestion(ctx, words, start, end, parentId) {
  const first = words[start];
  if (whWords.has(first)) {
    if (first === "who" && findVerbIndex(words, start + 1, end) === start + 1) {
      ctx.add("subject", start, start, parentId);
      const verb = start + 1;
      ctx.add("predicate", verb, verb, parentId);
      addPostVerbComplements(ctx, words, verb + 1, end, parentId, isLinkingWord(words[verb]));
      return;
    }
    const aux = findVerbIndex(words, start + 1, Math.min(end, start + 3));
    if (first === "what" && aux === start + 1 && isLinkingWord(words[aux])) {
      ctx.add("predicative", start, start, parentId);
      ctx.add("predicate", aux, aux, parentId);
      if (aux < end) ctx.add("subject", aux + 1, end, parentId);
      return;
    }
    if (first === "whose" || first === "which" || (first === "what" && aux > start + 1)) {
      const phraseEnd = aux > start + 1 ? aux - 1 : start;
      ctx.add("predicative", start, phraseEnd, parentId);
    } else {
      const phraseEnd = aux > start ? aux - 1 : start;
      ctx.add(first === "where" ? "place_adverbial" : first === "when" ? "time_adverbial" : "adverbial", start, phraseEnd, parentId);
    }
    if (aux >= 0) {
      ctx.add("predicate", aux, aux, parentId);
      const mainVerb = findMainVerbAfter(words, aux + 2, end);
      const subjectEnd = mainVerb >= 0 ? mainVerb - 1 : Math.min(aux + 1, end);
      if (aux + 1 <= subjectEnd) ctx.add("subject", aux + 1, subjectEnd, parentId);
      if (mainVerb >= 0) {
        ctx.add("predicate", mainVerb, mainVerb, parentId);
        addPostVerbComplements(ctx, words, mainVerb + 1, end, parentId, isLinkingWord(words[mainVerb]));
      } else if (subjectEnd < end && first !== "whose" && first !== "which" && first !== "what") {
        addPostVerbComplements(ctx, words, subjectEnd + 1, end, parentId, isLinkingWord(words[aux]));
      }
    } else if (start + 1 <= end) {
      ctx.add("independent_element", start + 1, end, parentId);
    }
    return;
  }

  if (auxiliaries.has(first)) {
    ctx.add("predicate", start, start, parentId);
    if (isLinkingWord(first)) {
      const vocativeIndex = findTrailingVocative(words, start + 1, end);
      const contentEnd = vocativeIndex >= 0 ? vocativeIndex - 1 : end;
      if (vocativeIndex >= 0) ctx.add("vocative", vocativeIndex, vocativeIndex, parentId);
      if (words[start + 1] === "there") {
        ctx.add("independent_element", start + 1, start + 1, parentId);
        if (start + 2 <= contentEnd) ctx.add("subject", start + 2, contentEnd, parentId);
        return;
      }
      const subjectStart = start + 1;
      const subjectWord = words[subjectStart];
      const nextWord = words[subjectStart + 1];
      const personalSubject = new Set(["i", "you", "he", "she", "it", "we", "they"]);
      let subjectEnd = subjectStart;
      if (determiners.has(subjectWord) && !["this", "that", "these", "those"].includes(subjectWord)) {
        subjectEnd = Math.min(subjectStart + 1, contentEnd);
      } else if (["this", "that", "these", "those"].includes(subjectWord)) {
        const nextIsPossessive = ["my", "your", "his", "her", "our", "their"].includes(nextWord);
        if (!nextIsPossessive && subjectStart + 1 < contentEnd) subjectEnd = subjectStart + 1;
      } else if (!personalSubject.has(subjectWord) && subjectStart + 1 < contentEnd) {
        subjectEnd = subjectStart + 1;
      }
      if (subjectStart <= contentEnd) ctx.add("subject", subjectStart, subjectEnd, parentId);
      addPostVerbComplements(ctx, words, subjectEnd + 1, contentEnd, parentId, true);
      return;
    }
    const mainVerb = findMainVerbAfter(words, start + 2, end);
    let subjectEnd = mainVerb >= 0 ? mainVerb - 1 : Math.min(start + 2, end);
    const trailingVocative = findTrailingVocative(words, start + 1, end);
    if (trailingVocative >= 0 && trailingVocative <= subjectEnd) subjectEnd = trailingVocative - 1;
    if (start + 1 <= subjectEnd) ctx.add("subject", start + 1, subjectEnd, parentId);
    if (mainVerb >= 0) {
      ctx.add("predicate", mainVerb, mainVerb, parentId);
      addPostVerbComplements(ctx, words, mainVerb + 1, end, parentId, isLinkingWord(words[mainVerb]));
    } else if (subjectEnd < end) {
      addPostVerbComplements(ctx, words, subjectEnd + 1, end, parentId, isLinkingWord(first));
    }
    return;
  }

  parseStatement(ctx, words, start, end, parentId);
}

function parseImperative(ctx, words, start, end, parentId) {
  let predicateEnd = start;
  if (words[start] === "don't" && start < end) predicateEnd = start + 1;
  else if (words[start] === "please" && start < end) {
    ctx.add("independent_element", start, start, parentId);
    start += 1;
    predicateEnd = start;
  }
  if (words[start] === "let's" || (words[start] === "let" && words[start + 1] === "us")) {
    predicateEnd = words[start] === "let" ? Math.min(start + 2, end) : Math.min(start + 1, end);
  }
  ctx.add("predicate", start, predicateEnd, parentId);
  const predicateWord = words[start];
  const complementStart = predicateEnd + 1;
  if (["give", "show", "tell", "send", "lend", "offer"].includes(predicateWord) && complementStart <= end && pronouns.has(words[complementStart])) {
    const objectEnd = words[end] === "please" ? end - 1 : end;
    ctx.add("indirect_object", complementStart, complementStart, parentId);
    if (complementStart < objectEnd) ctx.add("direct_object", complementStart + 1, objectEnd, parentId);
    if (objectEnd < end) ctx.add("independent_element", end, end, parentId);
    return;
  }
  addPostVerbComplements(ctx, words, predicateEnd + 1, end, parentId, false);
}

function parseStatement(ctx, words, start, end, parentId) {
  if (start > end) return;
  let cursor = start;
  if (discourseWords.has(words[cursor]) && !isVerb(words[cursor])) {
    ctx.add("independent_element", cursor, cursor, parentId);
    cursor += 1;
  }
  if (cursor > end) return;
  if (["what", "who"].includes(words[cursor])) {
    const firstVerb = findVerbIndex(words, cursor + 1, end);
    const secondVerb = firstVerb >= 0 ? findVerbIndex(words, firstVerb + 1, end) : -1;
    if (firstVerb > cursor && secondVerb > firstVerb) {
      const subjectClause = ctx.add("subject_clause", cursor, firstVerb, parentId);
      if (cursor < firstVerb) ctx.add("subject", cursor, firstVerb - 1, subjectClause?.id || parentId);
      ctx.add("predicate", firstVerb, firstVerb, subjectClause?.id || parentId);
      ctx.add("predicate", secondVerb, secondVerb, parentId);
      addPostVerbComplements(ctx, words, secondVerb + 1, end, parentId, isLinkingWord(words[secondVerb]));
      return;
    }
  }
  if (imperativeVerbs.has(words[cursor]) && !pronouns.has(words[cursor])) {
    parseImperative(ctx, words, cursor, end, parentId);
    return;
  }

  let verbIndex = findVerbIndex(words, cursor, end);
  if (verbIndex < 0) {
    const vocativeIndex = findTrailingVocative(words, cursor, end);
    if (vocativeIndex > cursor) {
      ctx.add("independent_element", cursor, vocativeIndex - 1, parentId);
      ctx.add("vocative", vocativeIndex, vocativeIndex, parentId);
    } else {
      ctx.add("independent_element", cursor, end, parentId);
    }
    return;
  }

  let subjectStart = cursor;
  if (prepositions.has(words[cursor]) || timeWords.has(words[cursor])) {
    let leadEnd = verbIndex - 1;
    const commaIndex = tokensForCurrent.findIndex((token, index) => index >= cursor && index < verbIndex && /,$/.test(token));
    if (commaIndex >= 0) leadEnd = commaIndex;
    ctx.add(classifyAdverbial(words, cursor, leadEnd), cursor, leadEnd, parentId);
    subjectStart = leadEnd + 1;
    verbIndex = findVerbIndex(words, subjectStart, end);
  }

  if (verbIndex < 0) {
    ctx.add("independent_element", subjectStart, end, parentId);
    return;
  }
  if (subjectStart < verbIndex) ctx.add("subject", subjectStart, verbIndex - 1, parentId);

  let predicateEnd = verbIndex;
  while (predicateEnd + 1 <= end && (auxiliaries.has(words[predicateEnd]) || words[predicateEnd] === "not") && isVerb(words[predicateEnd + 1])) {
    predicateEnd += 1;
  }
  if (words[predicateEnd + 1] === "not") predicateEnd += 1;
  if (predicateEnd + 1 <= end && (words[predicateEnd + 1] === "up" || words[predicateEnd + 1] === "on" || words[predicateEnd + 1] === "off") && commonVerbs.has(words[predicateEnd])) {
    predicateEnd += 1;
  }
  ctx.add("predicate", verbIndex, predicateEnd, parentId);
  const complementStart = predicateEnd + 1;
  const predicateWord = words[verbIndex];
  const ditransitiveVerbs = new Set(["give", "gave", "show", "showed", "tell", "told", "send", "sent", "lend", "lent", "offer", "offered"]);
  if (ditransitiveVerbs.has(predicateWord) && complementStart <= end && pronouns.has(words[complementStart])) {
    ctx.add("indirect_object", complementStart, complementStart, parentId);
    const clauseStart = complementStart + 1;
    const clauseVerb = findVerbIndex(words, clauseStart + 1, end);
    if (clauseStart <= end && clauseVerb > clauseStart) {
      const objectClause = ctx.add("object_clause", clauseStart, end, parentId);
      parseClause(ctx, words, clauseStart, end, objectClause?.id || parentId);
    } else if (clauseStart <= end) {
      ctx.add("direct_object", clauseStart, end, parentId);
    }
    return;
  }
  const objectClauseMarker = words[complementStart] === "that" ? complementStart : -1;
  const embeddedStart = objectClauseMarker >= 0 ? complementStart + 1 : complementStart;
  const embeddedVerb = findVerbIndex(words, embeddedStart + 1, end);
  if (embeddedStart <= end && embeddedVerb > embeddedStart && (pronouns.has(words[embeddedStart]) || determiners.has(words[embeddedStart]))) {
    const objectClause = ctx.add("object_clause", complementStart, end, parentId);
    parseClause(ctx, words, embeddedStart, end, objectClause?.id || parentId);
    return;
  }
  addPostVerbComplements(ctx, words, complementStart, end, parentId, isLinkingWord(predicateWord));
}

function parseClause(ctx, words, start, end, parentId = null) {
  while (start <= end && !words[start]) start += 1;
  while (end >= start && !words[end]) end -= 1;
  if (start > end) return;
  const lastToken = tokensForCurrent[end] || "";
  const looksQuestion = /\?['"]?$/.test(lastToken) || (end === tokensForCurrent.length - 1 && currentSentenceIsQuestion);
  if (looksQuestion) parseQuestion(ctx, words, start, end, parentId);
  else parseStatement(ctx, words, start, end, parentId);
}

let tokensForCurrent = [];
let currentSentenceIsQuestion = false;

function sentenceSegments(tokens) {
  const segments = [];
  let start = 0;
  tokens.forEach((token, index) => {
    if (isPunctuationBoundary(token) && index < tokens.length - 1) {
      segments.push([start, index]);
      start = index + 1;
    }
  });
  if (start < tokens.length) segments.push([start, tokens.length - 1]);
  return segments;
}

function findClauseCoordinator(words, start, end) {
  const connectors = new Set(["and", "but", "or", "so"]);
  for (let index = start + 1; index < end; index += 1) {
    if (!connectors.has(words[index])) continue;
    const hasVerbBefore = findVerbIndex(words, start, index - 1) >= 0;
    const hasVerbAfter = findVerbIndex(words, index + 1, end) >= 0;
    if (hasVerbBefore && hasVerbAfter) return index;
  }
  return -1;
}

function analyzeSentence(text) {
  const tokens = displayTokens(text);
  tokensForCurrent = tokens;
  currentSentenceIsQuestion = /\?\s*$/.test(String(text || ""));
  const words = tokens.map(core);
  const ctx = makeAnalyzer(tokens);
  const segments = sentenceSegments(tokens);

  if (segments.length === 1) {
    const [start, end] = segments[0];
    const first = words[start];
    const commaIndex = tokens.findIndex((token, index) => index >= start && index <= end && /,$/.test(token));
    const coordinatorIndex = findClauseCoordinator(words, start, end);
    const subordinateVerb = subordinateTypes.has(first) ? findVerbIndex(words, start + 1, end) : -1;
    const inferredMainVerb = subordinateVerb >= 0 ? findVerbIndex(words, subordinateVerb + 2, end) : -1;
    if (subordinateTypes.has(first) && commaIndex > start && commaIndex < end) {
      const subordinate = ctx.add(subordinateTypes.get(first), start, commaIndex, null);
      parseClause(ctx, words, start, commaIndex, subordinate?.id || null);
      const main = ctx.add("main_clause", commaIndex + 1, end, null);
      parseClause(ctx, words, commaIndex + 1, end, main?.id || null);
    } else if (first === "if" && inferredMainVerb > subordinateVerb) {
      const subordinate = ctx.add("condition_clause", start, inferredMainVerb - 1, null);
      parseClause(ctx, words, start + 1, inferredMainVerb - 1, subordinate?.id || null);
      const main = ctx.add("main_clause", inferredMainVerb, end, null);
      parseClause(ctx, words, inferredMainVerb, end, main?.id || null);
    } else if (coordinatorIndex > start && coordinatorIndex < end) {
      const main = ctx.add("main_clause", start, coordinatorIndex - 1, null);
      parseClause(ctx, words, start, coordinatorIndex - 1, main?.id || null);
      ctx.add("independent_element", coordinatorIndex, coordinatorIndex, null);
      const coordinate = ctx.add("coordinate_clause", coordinatorIndex + 1, end, null);
      parseClause(ctx, words, coordinatorIndex + 1, end, coordinate?.id || null);
    } else {
      parseClause(ctx, words, start, end, null);
    }
  } else {
    segments.forEach(([start, end], index) => {
      const first = words[start];
      const clauseType = subordinateTypes.get(first) || (index === 0 ? "main_clause" : "coordinate_clause");
      const clause = ctx.add(clauseType, start, end, null);
      parseClause(ctx, words, start, end, clause?.id || null);
    });
  }

  return { groups: ctx.groups };
}

function validateAnalysis(text, analysis) {
  const tokens = displayTokens(text);
  const ids = new Set(analysis.groups.map((group) => group.id));
  for (const group of analysis.groups) {
    if (!Number.isInteger(group.startToken) || !Number.isInteger(group.endToken)) throw new Error(`Non-integer range: ${text}`);
    if (group.startToken < 0 || group.endToken >= tokens.length || group.startToken > group.endToken) throw new Error(`Invalid range: ${text}`);
    if (group.parentGroupId && !ids.has(group.parentGroupId)) throw new Error(`Missing parent: ${text}`);
    if (group.parentGroupId) {
      const parent = analysis.groups.find((candidate) => candidate.id === group.parentGroupId);
      if (group.startToken < parent.startToken || group.endToken > parent.endToken) throw new Error(`Child outside parent: ${text}`);
    }
  }
  const parentIds = new Set([null, ...analysis.groups.map((group) => group.id)]);
  parentIds.forEach((parentId) => {
    const siblings = analysis.groups
      .filter((group) => group.parentGroupId === parentId)
      .sort((a, b) => a.startToken - b.startToken || a.endToken - b.endToken);
    for (let index = 1; index < siblings.length; index += 1) {
      if (siblings[index].startToken <= siblings[index - 1].endToken) throw new Error(`Overlapping sibling groups: ${text}`);
    }
  });
  const covered = new Set();
  analysis.groups.forEach((group) => {
    for (let index = group.startToken; index <= group.endToken; index += 1) covered.add(index);
  });
  if (covered.size !== tokens.length) throw new Error(`Uncovered token in: ${text}`);
}

const lessonData = extractJsonAssignment("NCE_LESSON_DATA");
const sentences = lessonData.flatMap((lesson) => lesson.sentences.flatMap((sentence) => expandForPractice(sentence.english)));
const uniqueSentences = [...new Map(sentences.map((sentence) => [normalizeKey(sentence), sentence])).values()];
const catalog = {};
const reviewedOverrides = {
  [normalizeKey("Give me some glasses please, Jane.")]: {
    groups: [
      { id: "predicate_1", type: "predicate", startToken: 0, endToken: 0, parentGroupId: null },
      { id: "indirect_object_1", type: "indirect_object", startToken: 1, endToken: 1, parentGroupId: null },
      { id: "direct_object_1", type: "direct_object", startToken: 2, endToken: 3, parentGroupId: null },
      { id: "independent_element_1", type: "independent_element", startToken: 4, endToken: 4, parentGroupId: null },
      { id: "vocative_1", type: "vocative", startToken: 5, endToken: 5, parentGroupId: null }
    ]
  }
};

for (const sentence of uniqueSentences) {
  const key = normalizeKey(sentence);
  const analysis = reviewedOverrides[key] || analyzeSentence(sentence);
  validateAnalysis(sentence, analysis);
  catalog[key] = {
    ...analysis,
    ...(tokenAnalysis[key] || {})
  };
}

const output = `// Generated by scripts/generate-nce1-analysis.mjs. Do not edit manually.\nwindow.NCE1_SENTENCE_ANALYSIS = ${JSON.stringify(catalog, null, 2)};\n`;
fs.writeFileSync(outputPath, output, "utf8");

const roleCounts = {};
Object.values(catalog).forEach((analysis) => analysis.groups.forEach((group) => {
  roleCounts[group.type] = (roleCounts[group.type] || 0) + 1;
}));

console.log(`Generated ${Object.keys(catalog).length} sentence analyses at ${outputPath}`);
console.log(JSON.stringify(roleCounts, null, 2));
