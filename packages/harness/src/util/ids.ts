const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function shortId(prefix: string, length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length] ?? "";
  }
  return `${prefix}_${id}`;
}
