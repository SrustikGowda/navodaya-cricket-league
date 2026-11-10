// Server-side randomness for the draw. Uses node:crypto, so do not import this from client components.
//
// A draw is fully determined by (roster, seeded teams, 32 bytes of entropy). The entropy comes from the
// operating system's CSPRNG. Expanding it with SHA-256 in counter mode gives a deterministic stream that
// anyone can replay after publication to confirm the saved result, without weakening the draw: the entropy
// is created inside the transaction that publishes the result and is revealed only with it.

import { createHash, randomBytes } from "node:crypto";

export interface Rng {
  /** Uniform integer in [0, max). */
  int(max: number): number;
}

export function newEntropy(): string {
  return randomBytes(32).toString("hex");
}

export function seededRng(entropyHex: string): Rng {
  if (!/^[0-9a-f]{64}$/i.test(entropyHex)) throw new Error("Draw entropy must be 32 bytes of hex.");
  const key = Buffer.from(entropyHex, "hex");
  let counter = 0;
  let pool = Buffer.alloc(0);
  let offset = 0;

  const take = (bytes: number): Buffer => {
    if (offset + bytes > pool.length) {
      const block = createHash("sha256").update(key).update(Buffer.from(String(counter++))).digest();
      pool = block;
      offset = 0;
    }
    const out = pool.subarray(offset, offset + bytes);
    offset += bytes;
    return out;
  };

  return {
    int(max: number): number {
      if (!Number.isInteger(max) || max <= 0 || max > 0xffffffff) throw new Error("Random range must be a positive 32-bit integer.");
      if (max === 1) return 0;
      // Rejection sampling removes modulo bias.
      const limit = Math.floor(0x1_0000_0000 / max) * max;
      for (;;) {
        const value = take(4).readUInt32BE(0);
        if (value < limit) return value % max;
      }
    },
  };
}

/** Fisher-Yates over a copy. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const pick = rng.int(index + 1);
    [copy[index], copy[pick]] = [copy[pick] as T, copy[index] as T];
  }
  return copy;
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[rng.int(items.length)] as T;
}
