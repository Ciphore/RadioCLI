These are public, test-only fixtures. Never use the TLS key or certificate for a
real service. The self-signed certificate trusts only `localhost` and expires in
October 2036; network-playback-smoke installs it in a temporary mpv trust store,
never in the host trust store. Regenerate before expiry with:

```
openssl req -x509 -newkey rsa:2048 -nodes -keyout localhost-key.pem -out localhost-cert.pem -subj /CN=localhost -addext subjectAltName=DNS:localhost -days 3650
openssl req -x509 -key localhost-key.pem -out wronghost-cert.pem -subj /CN=wrong.invalid -addext subjectAltName=DNS:wrong.invalid -days 3650
ffmpeg -f lavfi -i anullsrc=r=22050:cl=mono -t 3 -c:a libmp3lame -b:a 64k -write_xing 0 -id3v2_version 0 -f mp3 silence.mp3
```

The three-second MP3 contains only silence and has no duration/Xing header. The
HTTP fixture controls EOF and stalls; no public station or audio device is used.
