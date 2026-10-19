import type {AppSettings, Country, Station} from '../types.js';
import type {ListeningStats} from '../activity/stats.js';
import type {RadioSessionResult, RadioSessionStatus} from '../agent/session.js';
import {stationKey} from '../storage/store.js';
import {sanitizeTerminalText} from '../safety.js';
import {resolveTerminalCapabilities} from '../platform/terminal.js';
import {displayWidth, padDisplayEnd, truncate} from '../ui/format.js';
import {toAsciiSafe} from '../ui/ascii.js';
import {themeAccent} from '../ui/theme.js';
import type {CliFlags} from './arguments.js';

export const clean = (value: unknown): string => sanitizeTerminalText(value == null ? '' : String(value)) ?? '';

export class CliOutput {
  readonly mode: 'human' | 'plain' | 'json';
  readonly terminal;
  readonly width: number;
  private readonly color: boolean;

  constructor(readonly flags: CliFlags, private readonly settings: AppSettings, evidence = {isTTY: Boolean(process.stdout.isTTY), columns: process.stdout.columns || 100}, env = process.env) {
    this.mode = flags.json ? 'json' : flags.plain || !evidence.isTTY ? 'plain' : 'human';
    this.terminal = resolveTerminalCapabilities(env, {isTTY: evidence.isTTY, asciiMode: settings.asciiMode, reduceMotion: settings.reduceMotion});
    this.width = Math.max(12, evidence.columns - 1);
    this.color = this.mode === 'human' && evidence.isTTY && !flags.noColor && this.terminal.colorLevel > 0;
  }

  text(value: string): string { return this.terminal.unicode ? clean(value) : toAsciiSafe(clean(value)); }

  heading(value: string): string {
    return this.accent(this.text(value));
  }

  private accent(text: string): string {
    if (!this.color) return text;
    if (this.terminal.colorLevel < 3) return `\u001b[1m${text}\u001b[0m`;
    const hex = themeAccent(this.settings.theme).slice(1);
    const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(';');
    return `\u001b[1;38;2;${rgb}m${text}\u001b[0m`;
  }

  print(value: unknown, human: string, plain = human): void {
    if (this.flags.quiet) return;
    console.log(this.mode === 'json' ? JSON.stringify(value, null, 2) : this.mode === 'plain' ? plain : human);
  }

  stations(stations: Station[], favorites: Station[], empty = 'No stations found. Try a broader search or remove a filter.', showHint = true): void {
    const favoriteKeys = new Set(favorites.map(stationKey));
    const rows = stations.map(station => ({id: stationKey(station), name: station.name, country: station.country ?? '', countryCode: station.countryCode ?? '', codec: station.codec ?? '', bitrate: station.bitrate ?? null, language: station.language ?? '', tags: station.tags, favorite: favoriteKeys.has(stationKey(station))}));
    // Preserve the original five-column search TSV contract for existing pipes.
    const plain = rows.map(row => [row.id, row.name, row.country, row.codec, row.bitrate ?? ''].map(clean).join('\t')).join('\n');
    const hint = showHint ? '\n\n' + this.text('* Favorite · Tune by name with radiocli play "station name", or add --pick.') : '';
    const human = stations.length ? this.table(['#', 'STATION', 'COUNTRY', 'QUALITY'], rows.map((row, index) => [String(index + 1), `${row.favorite ? '* ' : ''}${row.name}`, row.country || row.countryCode || '—', [row.codec, row.bitrate ? `${row.bitrate} kbps` : ''].filter(Boolean).join(' ') || '—'])) + hint : this.text(empty);
    if (!stations.length && this.mode === 'plain') { if (!this.flags.quiet) process.stderr.write(`${this.text(empty)}\n`); return; }
    this.print(rows, human, plain);
  }

  countries(countries: Country[]): void {
    this.print(countries, countries.length ? this.table(['CODE', 'COUNTRY', 'STATIONS'], countries.map(country => [country.code, country.name, String(country.stationCount)])) : 'No countries found. Try again when the directory is available.', countries.map(country => [country.code, country.stationCount, country.name].map(clean).join('\t')).join('\n'));
  }

  now(status: RadioSessionStatus | null): void {
    const fields = this.nowFields(status);
    this.print(status, this.nowLines(status).map((line, index) => index === 0 ? this.accent(this.fit(line)) : this.fit(line)).join('\n'), Object.entries(fields).map(([key, value]) => `${key}\t${clean(value)}`).join('\n'));
  }

  nowLine(status: RadioSessionStatus | null): string {
    return this.text(this.nowLines(status).join(' · '));
  }

  result(result: Pick<RadioSessionResult, 'ok' | 'message'> & Partial<Pick<RadioSessionResult, 'status'>>, background = false): void {
    const lines = [this.text(result.message)];
    if (result.status?.persistenceWarning) lines.push(this.text(result.status.persistenceWarning));
    if (background && result.ok && result.status?.owner === 'headless') lines.push('Playback continues in the background. Use radiocli now or radiocli stop.');
    this.print(result, lines.join('\n'), `${result.ok ? 'ok' : 'error'}\t${clean(result.message)}`);
  }

  presets(presets: {name: string; station: Station}[]): void {
    const rows = presets.map(preset => ({name: preset.name, stationId: stationKey(preset.station), stationName: preset.station.name}));
    this.print(rows, rows.length ? this.table(['PRESET', 'STATION'], rows.map(row => [row.name, row.stationName])) + '\n\nPlay a preset: radiocli play <name>' : 'No presets yet. Tune a station, then run radiocli preset save work.', rows.map(row => [row.name, row.stationId, row.stationName].map(clean).join('\t')).join('\n'));
  }

  stats(stats: ListeningStats): void {
    const hours = Math.floor(stats.totalSeconds / 3600);
    const minutes = Math.floor(stats.totalSeconds % 3600 / 60);
    const lines = ['Listening stats', `${hours}h ${minutes}m listened · ${stats.sessions} sessions · ${stats.listenedStationCount} stations`, `${stats.currentStreak} day streak · ${stats.longestStreak} day best · ${stats.activeDays} active days`, `Most listened: ${this.text(stats.favoriteStation?.name ?? 'Start listening with radiocli play "station name".')}`];
    this.print(stats, lines.map((line, index) => index === 0 ? this.heading(this.fit(line)) : this.fit(this.text(line))).join('\n'), Object.entries({total_seconds: stats.totalSeconds, sessions: stats.sessions, stations: stats.listenedStationCount, current_streak: stats.currentStreak, longest_streak: stats.longestStreak, active_days: stats.activeDays, favorite_station: stats.favoriteStation?.name ?? ''}).map(([key, value]) => `${key}\t${clean(value)}`).join('\n'));
  }

  table(headers: string[], rows: string[][]): string {
    const sanitized = [headers, ...rows].map(row => row.map(value => this.text(value)));
    const widths = headers.map((_, index) => Math.min(index === 1 ? 44 : 24, Math.max(...sanitized.map(row => displayWidth(row[index] ?? '')))));
    while (widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * 2 > this.width) {
      const biggest = widths.indexOf(Math.max(...widths));
      if (widths[biggest]! <= 3) break;
      widths[biggest] = widths[biggest]! - 1;
    }
    return sanitized.map((row, rowIndex) => {
      const line = row.map((value, index) => padDisplayEnd(this.fit(value, widths[index]), widths[index]!)).join('  ').trimEnd();
      return rowIndex === 0 ? this.accent(this.fit(line)) : this.fit(line);
    }).join('\n');
  }

  fit(value: string, width = this.width): string {
    const result = truncate(value, width);
    return this.terminal.unicode ? result : toAsciiSafe(result);
  }

  private nowFields(status: RadioSessionStatus | null) {
    return {
      state: status?.playback.state ?? 'idle', station_id: status?.station ? stationKey(status.station) : '',
      station: status?.station?.name ?? '', track: status?.nowPlaying?.title ?? '',
      output: status?.playback.airPlayDeviceName ?? (status?.playback.backend === 'airplay' ? 'AirPlay' : 'Local speakers'),
      volume: status?.playback.volume ?? this.settings.volume, muted: status?.playback.muted ?? false,
      backend: status?.playback.backend ?? 'none', warning: status?.persistenceWarning ?? ''
    };
  }

  private nowLines(status: RadioSessionStatus | null): string[] {
    if (!status?.station) return ['No station is playing. Start with radiocli play "station name".'];
    const fields = this.nowFields(status);
    const lines = [`${fields.station} · ${fields.state[0]!.toUpperCase()}${fields.state.slice(1)}`, fields.track || 'Track metadata unavailable', `${fields.output} · ${fields.backend} · Volume ${fields.volume}%${fields.muted ? ' (muted)' : ''}`];
    if (status.playback.message && clean(status.playback.message) !== clean(status.station.name)) lines.push(status.playback.message);
    if (status.persistenceWarning) lines.push(status.persistenceWarning);
    return lines.map(line => this.text(line));
  }
}
