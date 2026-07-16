export function buildSharedMessage(input: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}) {
  return [input.title, input.text, input.url]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index)
    .join("\n")
    .slice(0, 4_000);
}
