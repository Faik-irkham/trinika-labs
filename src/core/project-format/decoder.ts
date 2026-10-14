/** Small strict decoders for JSON data. Never cast an unchecked input to a model. */
export interface FormatIssue {
  code: "invalid-data" | "unknown-field";
  path: string;
  message: string;
}

export type Decoder<T> = (value: unknown, path: string, issues: FormatIssue[]) => T | undefined;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(path: string, issues: FormatIssue[], message: string): undefined {
  issues.push({ code: "invalid-data", path, message });
}

export const text = (maxLength: number, allowEmpty = false): Decoder<string> => (value, path, issues) =>
  typeof value === "string" && value.length <= maxLength && (allowEmpty || value.trim().length > 0)
    ? value
    : invalid(path, issues, `Nilai harus berupa teks ${allowEmpty ? "" : "tidak kosong "}maksimal ${maxLength} karakter.`);

export const number = (predicate: (value: number) => boolean = () => true): Decoder<number> => (value, path, issues) =>
  typeof value === "number" && Number.isFinite(value) && predicate(value)
    ? value
    : invalid(path, issues, "Nilai angka tidak valid.");

export const literal = <T extends string | number>(expected: T): Decoder<T> => (value, path, issues) =>
  value === expected ? expected : invalid(path, issues, `Nilai harus ${expected}.`);

export const scalar: Decoder<string | number | boolean> = (value, path, issues) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return number()(value, path, issues);
  if (typeof value === "string") return text(10_000, true)(value, path, issues);
  return invalid(path, issues, "Properti hanya boleh berupa teks, angka finite, atau boolean.");
};

export function array<T>(decode: Decoder<T>, maxLength = 2_000): Decoder<T[]> {
  return (value, path, issues) => {
    if (!Array.isArray(value) || value.length > maxLength) {
      return invalid(path, issues, `Nilai harus berupa array maksimal ${maxLength} elemen.`);
    }
    const before = issues.length;
    const result: T[] = [];
    value.forEach((item, index) => {
      const decoded = decode(item, `${path}[${index}]`, issues);
      if (decoded !== undefined) result.push(decoded);
    });
    return issues.length === before ? result : undefined;
  };
}

type DecodedShape<S> = { [K in keyof S]: S[K] extends Decoder<infer T> ? T : never };

export function object<S extends Record<string, Decoder<unknown>>>(shape: S): Decoder<DecodedShape<S>> {
  return (value, path, issues) => {
    if (!isRecord(value)) return invalid(path, issues, "Nilai harus berupa objek.");
    const before = issues.length;
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(shape, key)) {
        issues.push({ code: "unknown-field", path: `${path}.${key}`, message: "Field tidak dikenal; data tidak dibuang diam-diam." });
      }
    }
    const fields: [string, unknown][] = [];
    for (const [key, decode] of Object.entries(shape)) {
      const decoded = decode(Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined, `${path}.${key}`, issues);
      fields.push([key, decoded]);
    }
    // Only the newly reconstructed, validated object is asserted as the inferred shape.
    return issues.length === before ? Object.fromEntries(fields) as DecodedShape<S> : undefined;
  };
}

export function record<T>(decode: Decoder<T>, maxLength = 2_000): Decoder<Record<string, T>> {
  return (value, path, issues) => {
    if (!isRecord(value) || Object.keys(value).length > maxLength) {
      return invalid(path, issues, `Nilai harus berupa dictionary maksimal ${maxLength} elemen.`);
    }
    const before = issues.length;
    const fields: [string, T][] = [];
    for (const [key, item] of Object.entries(value)) {
      const itemPath = `${path}[${JSON.stringify(key)}]`;
      if (!key.trim() || key.length > 256 || ["__proto__", "prototype", "constructor"].includes(key)) {
        invalid(itemPath, issues, "Identitas dictionary tidak valid.");
      }
      const decoded = decode(item, itemPath, issues);
      if (decoded !== undefined) fields.push([key, decoded]);
    }
    return issues.length === before ? Object.fromEntries(fields) : undefined;
  };
}
