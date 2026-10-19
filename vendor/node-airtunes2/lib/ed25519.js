// RadioCLI modification, 2026-10-16. Distributed under the accompanying AGPLv3.
// Preserve the sender's synchronous hex API using Node's Ed25519 implementation.
const crypto = require('node:crypto')
const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex')

function bytes(hex, length) {
  if (typeof hex !== 'string' || !/^(?:[a-f\d]{2})*$/i.test(hex) || (length !== undefined && hex.length !== length * 2)) {
    throw new TypeError('Invalid Ed25519 hexadecimal input')
  }
  return Buffer.from(hex, 'hex')
}

function privateKey(seed) {
  return crypto.createPrivateKey({key: Buffer.concat([pkcs8Prefix, bytes(seed, 32)]), format: 'der', type: 'pkcs8'})
}

function publicKey(seed) {
  const key = crypto.createPublicKey(privateKey(seed)).export({format: 'jwk'})
  return Buffer.from(key.x, 'base64url').toString('hex')
}

function sign(seed, message) {
  return crypto.sign(null, bytes(message), privateKey(seed)).toString('hex').toUpperCase()
}

module.exports = {publicKey, sign}
