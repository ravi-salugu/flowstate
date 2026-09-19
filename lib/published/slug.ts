/**
 * Slug for a published canvas.
 *
 * An unlisted link is only as private as its slug, so this must be
 * unguessable — never sequential, never derived from the title. 16 random
 * bytes in base62 gives ~95 bits, which is not enumerable.
 */
const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generatePublishedSlug(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += ALPHABET[b % ALPHABET.length];
  return out;
}
