import crypto from 'crypto';

// Alphabet excludes easily confused characters (I, L, O, 0, 1).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LEN = 6;

export function generateCheckinCode(): string {
  let out = '';
  for (let i = 0; i < LEN; i++) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return out;
}
