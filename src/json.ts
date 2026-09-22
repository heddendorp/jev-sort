import type { JsonValue } from "@typesafe-ai/sdk";

/** Snapshot state before the first await; reject values JSON would silently lose. */
export function snapshot(value: unknown, label: string): JsonValue {
  try {
    const encoded = JSON.stringify(value, (_key, part: unknown) => {
      if (
        part === undefined ||
        typeof part === "function" ||
        typeof part === "symbol" ||
        typeof part === "bigint" ||
        (typeof part === "number" && !Number.isFinite(part))
      ) {
        throw new TypeError("unsupported JSON value");
      }
      if (part !== null && typeof part === "object" && !Array.isArray(part)) {
        const prototype = Object.getPrototypeOf(part);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError("use project to convert non-JSON objects");
        }
      }
      return part;
    });
    if (encoded === undefined) throw new TypeError("unsupported JSON value");
    return JSON.parse(encoded) as JsonValue;
  } catch (cause) {
    throw new TypeError(`${label} must be JSON-serializable; use project for custom item types`, { cause });
  }
}
