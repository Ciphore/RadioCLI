import {describe, expect, it} from 'vitest';
import {patchAirTunesRtspSource} from './airplay-sender-patch.js';

describe('AirPlay sender compatibility patch', () => {
  it('adds AirPlay 2 digest retry before generic RTSP response handling', () => {
    const source = `
Client.prototype.processData = function (blob, rawData) {
  var response = parseResponse2(blob, this),
    headers = response.headers
  if (this.status != OPTIONS && this.status != OPTIONS2 && this.mode == 0) {
    return
  }
}`;

    const patched = patchAirTunesRtspSource(source);

    expect(patched).toContain('this.status === SETUP_AP2_1 && response.code === 401');
    expect(patched).toContain('headers = response.headers || {}');
    expect(patched).toContain("headers['WWW-Authenticate']");
    expect(patched).toContain('this.sendNextRequest(di)');
    expect(patched.indexOf('SETUP_AP2_1')).toBeLessThan(patched.indexOf('this.mode == 0'));
  });

  it('buffers RTSP response bodies before parsing AirPlay 2 setup plists', () => {
    const source = `
Client.prototype.connect = function () {
  var blob = ''
  this.socket.on('data', function (data) {
    if (self.encryptedChannel && self.credentials) {
      // if (self.debug != false) console.log("incoming", data)
      data = self.credentials.decrypt(data)
    }
    self.clearTimeout()

    /*
     * I wish I could use node's HTTP parser for this...
     * I assume that all responses have empty bodies.
     */
    var rawData = data
    data = data.toString()

    blob += data
    var endIndex = blob.indexOf('\\r\\n\\r\\n')

    if (endIndex < 0) {
      return
    }

    endIndex += 4

    blob = blob.substring(0, endIndex)
    self.processData(blob, rawData)

    blob = data.substring(endIndex)
  })
}`;

    const patched = patchAirTunesRtspSource(source);

    expect(patched).toContain('var blob = Buffer.alloc(0)');
    expect(patched).toContain('Buffer.concat([blob, Buffer.from(data)])');
    expect(patched).toContain('Content-Length');
    expect(patched).toContain('self.processData(headers, rawData)');
    expect(patched).not.toContain("I assume that all responses have empty bodies.");
  });

  it('tolerates empty AirPlay 2 setup responses from modern macOS receivers', () => {
    const source = `
switch (this.status) {
  case SETUP_AP2_1:
      let buf7 = Buffer.from(rawData).slice(rawData.length - parseInt(headers['Content-Length']), rawData.length)
      let sa1_bplist = bplistParser.parseBuffer(buf7)
      this.eventPort = sa1_bplist[0]['eventPort']
      if (sa1_bplist[0]['timingPort'])
        this.timingDestPort = sa1_bplist[0]['timingPort']
      console.log('timing port ok', sa1_bplist[0]['timingPort'])
      this.status = SETPEERS
      break
}`;

    const patched = patchAirTunesRtspSource(source);

    expect(patched).toContain('buf7.length > 0 ? bplistParser.parseBuffer(buf7) : [{}]');
    expect(patched).toContain("catch (_) {\n        sa1_bplist = [{}]\n      }");
    expect(patched).toContain("this.eventPort = sa1_bplist[0]['eventPort'] || this.eventPort || this.socket.remotePort || 7000");
  });

  it('is idempotent and leaves unknown source unchanged', () => {
    const patched = patchAirTunesRtspSource('if (this.status === SETUP_AP2_1 && response.code === 401) {}');

    expect(patchAirTunesRtspSource(patched)).toBe(patched);
    expect(patchAirTunesRtspSource('module.exports = {}')).toBe('module.exports = {}');
  });
});
