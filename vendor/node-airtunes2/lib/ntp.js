const config = require('./config')

function NTP() {
  this.timeRef = new Date().getTime() - config.ntp_epoch * 1000
}

NTP.prototype.timestamp = function () {
  const time = new Date().getTime() - this.timeRef
  const sec = Math.floor(time / 1000)

  const msec = time - sec * 1000
  const ntp_msec = Math.floor(msec * 4294967.296)

  const ts = new Buffer(8)

  ts.writeUInt32BE(sec, 0)
  ts.writeUInt32BE(ntp_msec, 4)

  return ts
}

NTP.prototype.getTime = function (time) {
  var time = new Date().getTime() - this.timeRef
  var sec = Math.floor(time / 1000)

  var msec = time - sec * 1000
  var ntp_msec = Math.floor(msec * 4294967.296)

  var ts = new Buffer(8)

  ts.writeUInt32BE(sec, 0)
  ts.writeUInt32BE(ntp_msec, 4)
  console.log(time, sec)
  return ntp_msec
}

module.exports = new NTP()
