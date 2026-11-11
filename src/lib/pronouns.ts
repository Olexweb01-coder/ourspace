export type Gender = "man" | "woman" | null;
/** "her" / "him" once you've said who you are; "them" until then. */
export function pron(g: Gender) {
  if (g === "woman") return { sub: "she", obj: "her", pos: "her", self: "herself" };
  if (g === "man") return { sub: "he", obj: "him", pos: "his", self: "himself" };
  return { sub: "they", obj: "them", pos: "their", self: "themselves" };
}
