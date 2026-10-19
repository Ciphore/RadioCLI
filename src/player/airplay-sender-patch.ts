import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {airPlaySenderRoot} from './airplay-sender-package.js';

const require = createRequire(import.meta.url);
const setupAp2DigestGuard = 'this.status === SETUP_AP2_1 && response.code === 401';
const responseHeadersMarker = '    headers = response.headers';
const processDataResponseMarker = '  if (this.status != OPTIONS && this.status != OPTIONS2 && this.mode == 0) {';
const setupAp2TimingPortMarker = `      let sa1_bplist = bplistParser.parseBuffer(buf7)
      this.eventPort = sa1_bplist[0]['eventPort']
      if (sa1_bplist[0]['timingPort'])
        this.timingDestPort = sa1_bplist[0]['timingPort']
      console.log('timing port ok', sa1_bplist[0]['timingPort'])`;
const setupAp2TimingPortFallback = `      let sa1_bplist
      try {
        sa1_bplist = buf7.length > 0 ? bplistParser.parseBuffer(buf7) : [{}]
      }
      catch (_) {
        sa1_bplist = [{}]
      }
      this.eventPort = sa1_bplist[0]['eventPort'] || this.eventPort || this.socket.remotePort || 7000
      if (sa1_bplist[0]['timingPort'])
        this.timingDestPort = sa1_bplist[0]['timingPort']
      console.log('timing port ok', sa1_bplist[0]['timingPort'])`;
const socketDataHandlerMarker = `  var blob = ''
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
  })`;
const bufferedSocketDataHandler = `  var blob = Buffer.alloc(0)
  this.socket.on('data', function (data) {
    if (self.encryptedChannel && self.credentials) {
      // if (self.debug != false) console.log("incoming", data)
      data = self.credentials.decrypt(data)
    }
    self.clearTimeout()

    blob = Buffer.concat([blob, Buffer.from(data)])
    if (blob.length > 1024 * 1024) {
      self.cleanup('invalid_response')
      return
    }
    while (blob.length > 0) {
      var endIndex = blob.indexOf('\\r\\n\\r\\n')

      if (endIndex < 0) {
        return
      }

      endIndex += 4
      var headers = blob.slice(0, endIndex).toString()
      var lengthMatch = /(?:^|\\r\\n)Content-Length:\\s*(\\d+)/i.exec(headers)
      var contentLength = lengthMatch ? parseInt(lengthMatch[1], 10) : 0
      if (!Number.isSafeInteger(contentLength) || contentLength > 1024 * 1024) {
        self.cleanup('invalid_response')
        return
      }
      var messageLength = endIndex + contentLength

      if (blob.length < messageLength) {
        return
      }

      var rawData = blob.slice(0, messageLength)
      self.processData(headers, rawData)

      blob = blob.slice(messageLength)
    }
  })`;

type CommonJsModule = {
  _compile: (content: string, filename: string) => void;
};

type ExtensionLoader = (module: CommonJsModule, filename: string) => void;

type ModuleLoader = {
  _extensions: Record<string, ExtensionLoader | undefined>;
};

let installed = false;

export function installAirPlaySenderPatch(packageName = airPlaySenderRoot): boolean {
  if (installed) {
    return true;
  }

  let rtspPath: string;
  let devicePath: string;
  try {
    rtspPath = require.resolve(`${packageName}/lib/rtsp.js`);
    devicePath = require.resolve(`${packageName}/lib/device_airtunes.js`);
  } catch {
    return false;
  }

  const moduleLoader = require('node:module') as ModuleLoader;
  const originalLoader = moduleLoader._extensions['.js'];
  if (!originalLoader) {
    return false;
  }

  moduleLoader._extensions['.js'] = (module, filename) => {
    if (filename !== rtspPath && filename !== devicePath) {
      originalLoader(module, filename);
      return;
    }

    const source = readFileSync(filename, 'utf8');
    module._compile(filename === rtspPath ? patchAirTunesRtspSource(source) : patchAirTunesDeviceSource(source), filename);
  };
  installed = true;
  return true;
}

export function patchAirTunesRtspSource(source: string): string {
  let patched = patchQueuedControls(patchLegacyDigest(source));
  if (patched.includes(socketDataHandlerMarker) && !patched.includes('Buffer.concat([blob, Buffer.from(data)])')) {
    patched = patched.replace(socketDataHandlerMarker, bufferedSocketDataHandler);
  }

  if (patched.includes(setupAp2TimingPortMarker) && !patched.includes("this.socket.remotePort || 7000")) {
    patched = patched.replace(setupAp2TimingPortMarker, setupAp2TimingPortFallback);
  }

  if (patched.includes(responseHeadersMarker) && !patched.includes('headers = response.headers || {}')) {
    patched = patched.replace(responseHeadersMarker, '    headers = response.headers || {}');
  }

  if (patched.includes(setupAp2DigestGuard) || !patched.includes(processDataResponseMarker)) {
    return patched;
  }

  const setupAp2DigestRetry = `  if (${setupAp2DigestGuard} && headers['WWW-Authenticate'] && this.password) {
    const auth = headers['WWW-Authenticate']
    const di = {
      realm: parseAuthenticate(auth, 'realm'),
      nonce: parseAuthenticate(auth, 'nonce'),
      username: 'iTunes',
      password: this.password,
    }
    this.sendNextRequest(di)
    return
  }
`;

  return patched.replace(processDataResponseMarker, `${setupAp2DigestRetry}${processDataResponseMarker}`);
}

/** A zero starting volume is intentional, including when a session starts muted. */
export function patchAirTunesDeviceSource(source: string): string {
  return source.replaceAll('options.volume || 50', 'options.volume ?? 50').replaceAll('this.options.volume || 30', 'this.options.volume ?? 30');
}

function patchLegacyDigest(source: string): string {
  if (source.includes('// RadioCLI legacy Digest')) return source;
  return source.replace('  this.status = this.airplay2 ? PAIR_SETUP_1 : PAIR_PIN_SETUP_1\n  this.sendNextRequest()', `  if (!this.airplay2 && this.mode === 0 && (this.radioCliDigest || this.status === OPTIONS)) {
    if (this.radioCliDigest) {
      this.radioCliDigest.password = passcode
      this.radioCliDigestTried = true
      this.sendNextRequest(this.radioCliDigest)
    }
    return
  }
  this.status = this.airplay2 ? PAIR_SETUP_1 : PAIR_PIN_SETUP_1
  this.sendNextRequest()`)
    .replace("  var head = method + ' ' + uri + ' RTSP/1.0'", "  if (!this.airplay2 && this.mode === 0) di = di || this.radioCliDigest\n  var head = method + ' ' + uri + ' RTSP/1.0'")
    .replace("    if (dimode == 'airplay2') {", "    if (dimode == 'airplay2' || (!this.airplay2 && this.mode === 0)) {")
    .replace("      diResponse = md5(ha1 + ':' + di.nonce + ':' + ha2)", "      diResponse = (!this.airplay2 && this.mode === 0 ? md5norm : md5)(ha1 + ':' + di.nonce + ':' + ha2)")
    .replace(processDataResponseMarker, `  // RadioCLI legacy Digest: keep password authentication separate from PIN pairing.
  if (!this.airplay2 && this.mode === 0 && response.code === 401 &&
      (this.status === OPTIONS || /^Digest\\s/i.test(headers['WWW-Authenticate'] || headers['www-authenticate'] || ''))) {
    const auth = headers['WWW-Authenticate'] || headers['www-authenticate']
    if (this.radioCliDigestTried || typeof auth !== 'string' || !/^Digest\\s/i.test(auth)) {
      this.emit('pair_failed')
      this.cleanup('bad_password')
      return
    }
    const realm = parseAuthenticate(auth, 'realm')
    const nonce = parseAuthenticate(auth, 'nonce')
    if (!realm || !nonce || /[\\r\\n"]/.test(realm + nonce)) {
      this.emit('pair_failed')
      this.cleanup('bad_password')
      return
    }
    this.radioCliDigest = {realm, nonce, username: 'iTunes', password: this.password}
    if (!this.password) {
      this.emit('need_password')
      return
    }
    this.radioCliDigestTried = true
    this.sendNextRequest(this.radioCliDigest)
    return
  }
  if (response.code === 200) this.radioCliDigestTried = false
${processDataResponseMarker}`);
}

/** The upstream sender silently drops controls while another RTSP request is in flight. */
function patchQueuedControls(source: string): string {
  if (source.includes('this.radioCliPendingVolume')) return source;
  return source.replace(`Client.prototype.setVolume = function (volume, callback) {
  if (this.status !== PLAYING)
    return`, `Client.prototype.setVolume = function (volume, callback) {
  if (this.status !== PLAYING) {
    if (this.status !== CLOSED && this.status !== TEARDOWN) this.radioCliPendingVolume = [volume, callback]
    return
  }`)
    .replace(`Client.prototype.setTrackInfo = function (name, artist, album, callback) {
  if (this.status !== PLAYING)
    return`, `Client.prototype.setTrackInfo = function (name, artist, album, callback) {
  if (this.status !== PLAYING) {
    if (this.status !== CLOSED && this.status !== TEARDOWN) this.radioCliPendingTrack = [name, artist, album, callback]
    return
  }`)
    .replace(`  this.sendNextRequest()
}

Client.prototype.parseObject`, `  if (this.status === PLAYING && this.radioCliPendingVolume) {
    const pending = this.radioCliPendingVolume
    this.radioCliPendingVolume = null
    this.setVolume(...pending)
    return
  }
  if (this.status === PLAYING && this.radioCliPendingTrack) {
    const pending = this.radioCliPendingTrack
    this.radioCliPendingTrack = null
    this.setTrackInfo(...pending)
    return
  }
  this.sendNextRequest()
}

Client.prototype.parseObject`);
}
