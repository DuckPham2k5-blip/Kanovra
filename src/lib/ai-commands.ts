import { deaccent } from "@/lib/utils";

/**
 * Turning a typed request into an action the assistant performs.
 *
 * The assistant elsewhere *explains* and does not act — but that rule is about
 * not inventing controls and not obeying instructions found in untrusted
 * content. This is neither: the command is typed by the signed-in person
 * themselves, in their own chat, and every action it triggers still runs the
 * ordinary server-side permission check. So "tạo project tên Duc" can create the
 * project, the way it would if they had pressed New project — the assistant is a
 * second way to reach the same guarded action, not a way around it.
 *
 * This is a *deterministic* parser, not a language model: it works for the
 * built-in assistant with no API key and no network, which is the whole point —
 * creating things must not depend on a paid provider. It recognises the common
 * shapes of a create request in Vietnamese and English; anything it does not
 * recognise returns null and falls through to the normal answer path, so a
 * question like "làm sao để tạo project" is answered, never executed.
 */

export type MapTypeStr = "CIRCLE" | "BUBBLE" | "TREE" | "MULTI_FLOW" | "BRACE";

export type AiCommand =
  | { kind: "create-project"; name: string }
  | { kind: "create-map"; type: MapTypeStr; title: string }
  /** Recognised "create a project/map" but no name was given. */
  | { kind: "need-name"; resource: "project" | "map" }
  /** A map was asked for, but not one of the kinds this app has. */
  | { kind: "unsupported-map" };

export const MAP_TYPE_LABEL: Record<MapTypeStr, string> = {
  CIRCLE: "Circle",
  BUBBLE: "Bubble",
  TREE: "Tree",
  MULTI_FLOW: "Multi-flow",
  BRACE: "Brace",
};

/** Folded trigger words for each supported map kind. */
const MAP_TYPE_WORDS: [MapTypeStr, RegExp][] = [
  ["CIRCLE", /\b(circle|banh xe|vong tron|sunburst)\b/],
  ["BUBBLE", /\b(bubble|bong bong)\b/],
  ["TREE", /\b(tree|cay|phan cap)\b/],
  ["MULTI_FLOW", /\b(multi ?flow|multiflow|da luong|nguyen nhan)\b/],
  ["BRACE", /\b(brace|dau ngoac|ngoac)\b/],
];

/** A create verb — the message must have one to be a command at all. */
const CREATE_VERB =
  /\b(tao|khoi tao|lap|create|make|new|add|them|generate)\b/;

/**
 * Words that make a message a *question* rather than a command. A question is
 * answered, never executed: "how do I create a project" must not create one —
 * and, in image mode, "explain this logo" must be answered, not drawn.
 */
const QUESTION_WORD =
  /\b(lam sao|the nao|cach|huong dan|how|what|why|where|when|which|la gi|nghia la|giai thich|y nghia|tai sao|vi sao|meaning|explain|la ai|o dau|vi du)\b/;

/**
 * Whether a message reads as a question rather than an instruction.
 *
 * Used by the image path too: an image model turns everything it is given into
 * a picture, so "giải thích ý nghĩa logo này" came back as another logo. A
 * question is sent to the text assistant instead of the image generator.
 */
export function looksLikeQuestion(message: string): boolean {
  return message.includes("?") || QUESTION_WORD.test(deaccent(message).toLowerCase());
}

/**
 * Whether a message asks for a *picture* rather than an app project or map.
 *
 * "tạo cho tôi một ảnh về 1 mindmap" wants a drawing of a mind map, not a mind
 * map created in the app — the word "ảnh" (picture) is the intent, and the
 * command parser would otherwise grab "tạo … map" and apologise. Patterns are
 * kept specific — "một ảnh", "ảnh về", "tạo ảnh", "vẽ …" — so the bare pronoun
 * "anh" and words like "cấu hình" do not trip it.
 */
const IMAGE_REQUEST =
  /\b(tao anh|tao hinh|tao buc|lam anh|lam hinh|ve anh|hinh anh|buc anh|tam anh|mot anh|1 anh|anh ve|anh cua|hinh ve|buc tranh|ve mot|ve 1|ve cho|ve giup|ve buc|picture|image|photo|drawing|illustration|wallpaper)\b/;

export function looksLikeImageRequest(message: string): boolean {
  return IMAGE_REQUEST.test(deaccent(message).toLowerCase());
}

/**
 * The subject of an image request, with the "please make me a picture of …"
 * scaffolding peeled off.
 *
 * An image model renders *the whole prompt*, so "hãy tạo cho tôi một ảnh về 1
 * mindmap bất kỳ" was drawn literally — the request words and all — instead of
 * just a mind map, which is a large part of why the result looked strange. This
 * strips the leading command and the trailing vague qualifier ("bất kỳ", "any")
 * so the generator gets the subject alone. Diacritics and casing are kept — the
 * subject reaches the model as written. If stripping empties it, the original
 * stands.
 */
export function cleanImagePrompt(message: string): string {
  let s = message.trim();
  const lead: RegExp[] = [
    /^(hãy|xin|làm ơn|please|help me)\s+/i,
    /^(vẽ|tạo|làm|make|create|draw|generate|paint|render)\s+/i,
    /^(cho tôi|cho mình|giúp tôi|giúp mình|for me|me)\s+/i,
    /^(một|mot|1|a|an|the|cái|bức|tấm)\s+/i,
    /^(ảnh|hình ảnh|hình|bức tranh|bức ảnh|picture|image|photo|drawing|illustration|poster)\s+/i,
    /^(về|của|of|about|showing|with)\s+/i,
    /^(một|mot|1|a|an|the)\s+/i,
  ];
  for (const re of lead) s = s.replace(re, "").trim();
  s = s
    .replace(
      /\s+(bất kỳ|bat ky|nào đó|nao do|gì đó|gi do|ngẫu nhiên|ngau nhien|any|random)\s*$/i,
      "",
    )
    .trim();
  return s || message.trim();
}

const NAME_MARKER =
  /(?:tên\s+là|tên|ten\s+la|ten|gọi\s+là|goi\s+la|đặt\s+là|dat\s+la|named|called|name\s+is|name|title|tiêu\s+đề|tieu de)\s+(.+)$/i;

const QUOTED = /["“”'']([^"“”'']{1,60})["“”'']/;

/**
 * Trim a captured name down to the name itself: drop a leading article and the
 * trailing politeness particles Vietnamese and English hang off a request
 * ("… đi", "… nhé", "… please").
 */
export function cleanName(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^(là|la|một|mot|the|a|an|cái|cai|con|bản|ban)\s+/i, "").trim();
  s = s.replace(/[.!?,;:]+$/g, "").trim();
  // Twice, so "giúp mình đi" loses both words.
  for (let i = 0; i < 2; i += 1) {
    s = s
      .replace(
        /\s+(đi|di|nhé|nhe|nha|nhá|ạ|à|với|voi|giúp\s*mình|giup\s*minh|giúp|giup|dùm|dum|hộ|ho|please|thanks|luôn|luon)\s*$/i,
        "",
      )
      .trim();
  }
  return s.slice(0, 60).trim();
}

/** The map kind named in the message, or null if none of the five is. */
function detectMapType(flat: string): MapTypeStr | null {
  for (const [type, re] of MAP_TYPE_WORDS) if (re.test(flat)) return type;
  return null;
}

/** Pull a name out of the original message (keeping its diacritics and case). */
function extractName(message: string, afterWord: RegExp): string {
  const quoted = QUOTED.exec(message);
  if (quoted) return cleanName(quoted[1]);

  const marked = NAME_MARKER.exec(message);
  if (marked) return cleanName(marked[1]);

  // Fallback: whatever follows the noun (and, for a map, its type word).
  const after = afterWord.exec(message);
  if (after && after[1]) return cleanName(after[1]);

  return "";
}

/**
 * The action a message asks for, or null when it is not a create command.
 *
 * Returns null for questions and for anything with no create verb, so only a
 * genuine imperative reaches an action.
 */
export function parseAiCommand(message: string): AiCommand | null {
  const flat = deaccent(message).toLowerCase();

  if (message.includes("?") || QUESTION_WORD.test(flat)) return null;
  if (!CREATE_VERB.test(flat)) return null;

  const wantsMap = /\b(map|so do|ban do|mind ?map|mindmap)\b/.test(flat);
  const wantsProject = /\b(project|du an)\b/.test(flat);

  if (wantsMap) {
    const type = detectMapType(flat);
    if (!type) return { kind: "unsupported-map" };
    // The title is optional for a map; the route supplies a default when blank.
    // Strip a leading type word so "tạo map circle" gives an empty title (→
    // default) rather than the title "circle".
    const raw = extractName(message, /(?:map|sơ đồ|so do|bản đồ|ban do)\b\s*(.+)$/i);
    const title = raw
      .replace(
        /^(circle|bubble|tree|brace|multi[- ]?flow|multiflow|sunburst|bánh xe|banh xe|vòng tròn|vong tron|bong bóng|bong bong|cây|cay|phân cấp|phan cap|đa luồng|da luong|nguyên nhân|nguyen nhan)\s*/i,
        "",
      )
      .trim();
    return { kind: "create-map", type, title };
  }

  if (wantsProject) {
    const name = extractName(message, /(?:project|dự án|du an)\b\s*(.+)$/i);
    if (!name) return { kind: "need-name", resource: "project" };
    return { kind: "create-project", name };
  }

  return null;
}
