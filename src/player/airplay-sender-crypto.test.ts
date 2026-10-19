import {createPublicKey, verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {airPlaySenderRoot} from './airplay-sender-package.js';
import {airPlaySenderHealth} from './airplay-sender-health.js';

const require = createRequire(import.meta.url);
const ed25519 = require(join(airPlaySenderRoot, 'lib/ed25519.js')) as {publicKey: (seed: string) => string; sign: (seed: string, message: string) => string};
// Deterministic test-only seeds and outputs captured from verified upstream 2.5.0.
const vectors = JSON.parse(readFileSync(new URL('./fixtures/airplay-legacy-crypto.json', import.meta.url), 'utf8')) as Array<{
  seed: string; K: string; clientPublic: string; receiverPublic: string; shared: string; receiverData: string;
  public: string; confirm: {epk: string; authTag: string}; signed: string; signature: string;
}>;

describe('AirPlay legacy Ed25519 replacement', () => {
  it('matches RFC 8032 test vector 1 byte-for-byte with synchronous results', () => {
    const seed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
    expect(ed25519.publicKey(seed)).toBe('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
    expect(ed25519.sign(seed, '')).toBe(('e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555f' +
      'b8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b').toUpperCase());
    expect(ed25519.publicKey(seed.toUpperCase())).toBe(ed25519.publicKey(seed));
  });

  it.each(['', 'ff', 'ab'.repeat(31), 'ab'.repeat(33), 'z1'.repeat(32), ' ab'.repeat(32)])('rejects malformed seeds without exposing them: %s', seed => {
    expect(() => ed25519.publicKey(seed)).toThrow('Invalid Ed25519 hexadecimal input');
  });

  it.each(['0', 'gg', '01 02'])('rejects malformed messages instead of silently truncating: %s', message => {
    expect(() => ed25519.sign(vectors[0]!.seed, message)).toThrow('Invalid Ed25519 hexadecimal input');
  });

  it('ships the fixed primitive with no elliptic dependency', () => {
    const metadata = JSON.parse(readFileSync(join(airPlaySenderRoot, 'package.json'), 'utf8'));
    expect(metadata.radiocliLegacyPairing).toBe('node:crypto');
    expect(metadata.dependencies).not.toHaveProperty('elliptic');
    const source = readFileSync(join(airPlaySenderRoot, 'lib/atvAuthenticator.js'), 'utf8');
    expect(source).not.toContain("require('elliptic')");
    expect(source).toContain("require('./ed25519')");
  });
});

describe.skipIf(!airPlaySenderHealth().available)('AirPlay legacy pairing wire compatibility', () => {
  const load = () => require(join(airPlaySenderRoot, 'lib/atvAuthenticator.js')) as {
    a_pub: (seed: string) => string;
    confirm: (seed: string, key: string) => {epk: string; authTag: string};
    signed: (seed: string, clientPublic: string, receiverPublic: string) => string;
    signature: (shared: string, data: string, signed: string) => string;
    verifier: (seed: string) => {verifierBody: Buffer; v_pri: string; v_pub: string};
    shared: (privateKey: string, publicKey: string) => string;
  };

  it.each(vectors)('preserves public keys, encrypted confirmations and signatures for seed $seed', vector => {
    const auth = load();
    expect(auth.a_pub(vector.seed)).toBe(vector.public);
    expect(auth.confirm(vector.seed, vector.K)).toEqual(vector.confirm);
    const signed = auth.signed(vector.seed, vector.clientPublic, vector.receiverPublic);
    expect(signed).toBe(vector.signed);
    expect(auth.signature(vector.shared, vector.receiverData, signed)).toBe(vector.signature);
    const publicKey = createPublicKey({key: {kty: 'OKP', crv: 'Ed25519', x: Buffer.from(vector.public, 'hex').toString('base64url')}, format: 'jwk'});
    expect(verify(null, Buffer.from(vector.clientPublic + vector.receiverPublic, 'hex'), publicKey, Buffer.from(signed, 'hex'))).toBe(true);
  });

  it('retains the verifier body layout and symmetric X25519 shared secret', () => {
    const auth = load(); const first = auth.verifier(vectors[0]!.seed); const second = auth.verifier(vectors[1]!.seed);
    expect(first.verifierBody).toHaveLength(68);
    expect(first.verifierBody.subarray(0, 4)).toEqual(Buffer.from([1, 0, 0, 0]));
    expect(first.verifierBody.subarray(4, 36).toString('hex')).toBe(first.v_pub);
    expect(first.verifierBody.subarray(36).toString('hex')).toBe(vectors[0]!.public);
    expect(auth.shared(first.v_pri, second.v_pub)).toBe(auth.shared(second.v_pri, first.v_pub));
  });
});
