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
