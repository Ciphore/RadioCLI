import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

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
    while (blob.length > 0) {
      var endIndex = blob.indexOf('\\r\\n\\r\\n')

      if (endIndex < 0) {
        return
      }

      endIndex += 4
      var headers = blob.slice(0, endIndex).toString()
      var lengthMatch = /(?:^|\\r\\n)Content-Length:\\s*(\\d+)/i.exec(headers)
      var contentLength = lengthMatch ? parseInt(lengthMatch[1], 10) : 0
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

export function installAirPlaySenderPatch(packageName = 'node-airtunes2'): boolean {
  if (installed) {
    return true;
  }

  let rtspPath: string;
  try {
    rtspPath = require.resolve(`${packageName}/lib/rtsp.js`);
  } catch {
    return false;
  }

  const moduleLoader = require('node:module') as ModuleLoader;
  const originalLoader = moduleLoader._extensions['.js'];
  if (!originalLoader) {
    return false;
  }

  moduleLoader._extensions['.js'] = (module, filename) => {
    if (filename !== rtspPath) {
      originalLoader(module, filename);
      return;
    }

    module._compile(patchAirTunesRtspSource(readFileSync(filename, 'utf8')), filename);
  };
  installed = true;
  return true;
}

export function patchAirTunesRtspSource(source: string): string {
  let patched = source;
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
