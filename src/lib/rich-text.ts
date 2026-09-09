/**
 * The only formatting an assistant's answer is allowed to carry.
 *
 * ## Why this is a list of segments and not a string of HTML
 *
 * Model output is shaped by whatever the reader typed, exactly like a comment,
 * and this project already decided that an uploaded `.svg` downloads rather
 * than renders because rendering it same-origin is stored XSS. Running a
 * markdown pipeline over model output on this origin is that same risk wearing
 * better manners.
 *
 * So the answer stays text, with one exception: `**bold**`, because models
 * emphasise the answer and losing it makes a reply harder to skim. This
 * function returns *segments* — never markup — and the component turns each one
 * into an element. There is no string that becomes HTML anywhere on the path,
 * which is a property that can be read off the type rather than argued about.
 *
 * ## An unclosed delimiter must not swallow the rest
 *
 * `"use the **Export button"` has one delimiter and no closing pair. A plain
 * `split("**")` makes every odd-indexed piece bold, so the whole remainder of
 * the answer turns bold from that point on — and a model writing about a
 * literal `**` in a code sample does this often enough to matter. An odd number
 * of delimiters means the last run was never closed, so it is left plain.
 */

export type TextSegment = { text: string; bold: boolean };

const DELIMITER = "**";

export function emphasisSegments(input: string): TextSegment[] {
  const parts = input.split(DELIMITER);

  /*
   * `split` gives one more piece than there are delimiters, so an even number
   * of pieces means an *odd* number of delimiters — the last run was opened and
   * never closed. That final piece stays plain.
   */
  const lastIsUnclosed = parts.length % 2 === 0;

  return parts
    .map((text, index) => ({
      text,
      bold: index % 2 === 1 && !(lastIsUnclosed && index === parts.length - 1),
    }))
    // An empty piece renders nothing and only adds a node; `**a**` produces one
    // at each end.
    .filter((segment) => segment.text !== "");
}

/** The text with its emphasis removed, for anywhere that cannot draw elements. */
export function plainText(input: string): string {
  return emphasisSegments(input)
    .map((s) => s.text)
    .join("");
}
