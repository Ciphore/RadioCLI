const number = require('./homekit/number').default

const u = number.UInt16toBufferBE(287)
console.log(Buffer.concat([u.slice(1), u.slice(0, 1)]))
