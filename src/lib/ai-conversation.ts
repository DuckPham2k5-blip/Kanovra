/**
 * A conversation's title, from the first thing said in it.
 *
 * In `lib/` rather than beside the actions because a `"use server"` module may
 * export nothing but server actions — the same rule that put the recurring-task
 * spawner here. Exporting a plain helper from an action file is a build error
 * at best; the worse version is a helper that becomes callable from any browser.
 *
 * Taken from the message rather than asked of a model. A generated title costs
 * a request, a delay before the conversation appears in the list, and a bill —
 * for a string the person can read the first line of anyway. They can rename it.
 */
export function titleFromMessage(message: string): string {
  const line = message.replace(/\s+/g, " ").trim();
  if (!line) return "New conversation";
  if (line.length <= 60) return line;
  // Cut on a word boundary when there is one nearby, so a title does not end
  // mid-word for the sake of three characters.
  const cut = line.slice(0, 57);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export type WindowTurn = { role: "user" | "assistant"; content: string };

/**
 * The slice of a conversation that is sent back with a new message.
 *
 * Three rules, and each one is a failure that has to be prevented rather than a
 * preference.
 *
 * ## It must begin with a user turn
 *
 * Turns alternate and the newest is always the message just written, so
 * counting back from the end gives user, assistant, user … — and an **even**
 * limit lands on an assistant turn. Anthropic refuses a conversation that does
 * not start with the user, so a chat would work perfectly until it passed the
 * limit and then fail on every message after that. Twenty turns is roughly ten
 * exchanges, which is far enough in for it to read as the assistant breaking
 * rather than as a window built wrong.
 *
 * ## Two turns of the same role are collapsed, not dropped
 *
 * If a stream produces nothing — a provider error, a closed tab — no assistant
 * row is written, and the next question puts two user turns side by side. They
 * are joined rather than one being discarded: both were really asked, and
 * losing the earlier one silently changes what the person believes they said.
 *
 * ## Trimming happens before the alternation is fixed
 *
 * The other order takes the limit, then drops a leading turn, and quietly
 * returns fewer turns than asked for.
 */
export function conversationWindow(messages: WindowTurn[], limit: number): WindowTurn[] {
  if (limit <= 0) return [];

  const recent = messages.filter((m) => m.content.trim()).slice(-limit);

  // Collapse runs of one role into a single turn.
  const merged: WindowTurn[] = [];
  for (const turn of recent) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${turn.content}`;
    } else {
      merged.push({ ...turn });
    }
  }

  // Drop anything before the first user turn.
  const start = merged.findIndex((m) => m.role === "user");
  return start === -1 ? [] : merged.slice(start);
}
