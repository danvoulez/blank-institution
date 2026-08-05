// JSON Canonicalization Scheme (RFC 8785).
//
// Anything that becomes a hash — effect keys, artifact digests — must serialize
// byte for byte the same at every call site. `JSON.stringify` does not: it
// emits object keys in insertion order, so two callers building the same
// logical record from different code paths produce different bytes.
//
// One deliberate deviation from the RFC: object entries whose value is
// `undefined` are dropped instead of rejected. JSON has no `undefined`, but
// TypeScript callers routinely build partial records, and a field that was
// never set must canonicalize identically to one explicitly left out.

const MAX_DEPTH = 64;

export function canonicalJson(value: unknown): string {
  return write(value, 0);
}

function write(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH) {
    throw new Error("canonicalJson: value nests deeper than the supported limit or contains a cycle");
  }
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error("canonicalJson: non-finite numbers are not valid JSON");
      // RFC 8785 mandates the ECMAScript Number-to-String algorithm as-is,
      // including its signed exponent form ("1e+21"). Negative zero is the one
      // case String() would not already normalize.
      return Object.is(value, -0) ? "0" : String(value);
    case "string":
      // JSON.stringify is the string serializer RFC 8785 specifies, and since
      // ES2019 it escapes lone surrogates rather than emitting them raw.
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new Error(`canonicalJson: cannot canonicalize ${typeof value}`);
  }

  if (Array.isArray(value)) {
    // Arrays keep insertion order; only object keys are sorted.
    return `[${value.map(item => write(item === undefined ? null : item, depth + 1)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    // RFC 8785 sorts keys by UTF-16 code unit, which is what `<` gives on
    // JavaScript strings.
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${write(item, depth + 1)}`).join(",")}}`;
}
