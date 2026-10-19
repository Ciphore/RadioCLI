// FFmpeg releases in circulation do not propagate tls_verify to resources
// opened by HLS/DASH/IMF demuxers. Restrict network fallbacks to self-contained
// media; mpv supplies verified networking for multi-resource inputs.
const mediaFormats = 'aac,ac3,aiff,amr,ape,asf,au,avi,caf,eac3,flac,flv,live_flv,matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,mp3,mpeg,mpegts,nut,ogg,w64,wav,wv';

export function ffmpegInputArguments(target: string, options: {plainHttp?: boolean; reconnect?: boolean} = {}): string[] {
  const network = /^https?:\/\//i.test(target);
  const plainHttp = options.plainHttp && /^http:\/\//i.test(target);
  if (!network) return ['-protocol_whitelist', 'file,crypto,data'];
  const args = ['-format_whitelist', mediaFormats];
  if (plainHttp) args.push('-protocol_blacklist', 'https,tls');
  else args.push('-tls_verify', '1');
  if (options.reconnect) args.push('-reconnect', '1', '-reconnect_on_network_error', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '2');
  return args;
}

/** First verify any HTTP -> HTTPS redirect. FFmpeg rejects the unused TLS
 * option on ordinary HTTP media; retry only that exact failure, with TLS
 * protocols blocked even if the server changes its redirect. */
export function canRetryPlainHttp(target: string, diagnostic: string): boolean {
  return /^http:\/\//i.test(target) && /(?:^|[\r\n])Option tls_verify not found\.?\s*(?:[\r\n]|$)/.test(diagnostic);
}

export function ffmpegInputFailure(diagnostic: string): string | undefined {
  if (/not on whitelist|on blacklist/i.test(diagnostic)) return 'This input is unavailable with FFmpeg. Use a direct audio stream, or select mpv for local playback of HLS/DASH and other network playlists.';
  return undefined;
}

export function ffmpegCertificateFailure(diagnostic: string): string | undefined {
  // Backends use different TLS libraries. Generic handshake/I/O errors can be
  // transient; only specific certificate failures are permanent here.
  if (/certificate (?:verify|verification) failed|peer certificate failed verification|certificate's owner does not match hostname|unable to verify peer certificate|invalid certificate chain|SNI or certificate check failed|Creating security context failed \(0x800903(?:25|27|28)\)/i.test(diagnostic)) {
    return 'The stream certificate could not be verified. Choose a valid HTTPS stream or repair the native certificate configuration.';
  }
  return undefined;
}
