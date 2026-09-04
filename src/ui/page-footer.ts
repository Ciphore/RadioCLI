import type {Screen} from '../types.js';
import {mediaActionLabel, type MediaTransportAction} from './app-state.js';
import {playbackBackendCapabilities} from '../player/backend-install.js';
import {displayWidth} from './format.js';

type PageFooterInput = {
  capturingTransportAction: MediaTransportAction | null;
  commandMode: boolean;
  commandText: string;
  editingCountryFilter: boolean;
  editingSearch: boolean;
  canEnterAirPlayCode?: boolean;
  playbackBackend?: string;
  screen: Screen;
};

export function fullFooterRowCount(screen: Screen): 3 | 4 {
  return screen === 'now-playing' ? 3 : 4;
}

export function fullStatusFooterRows(
  screen: Screen,
  message: string | null,
  footerMessage: string | null,
  playbackStatus: string | null
): Array<{key: 'notice' | 'playback'; text: string}> {
  if (screen === 'now-playing') {
    return [{key: 'playback', text: footerMessage ?? message ?? ' '}];
  }

  return [
    {key: 'notice', text: message ?? ' '},
    {key: 'playback', text: footerMessage ?? playbackStatus ?? ' '}
  ];
}

export function pageFooterText({
  capturingTransportAction,
  commandMode,
  commandText,
  editingCountryFilter,
  editingSearch,
  canEnterAirPlayCode,
  playbackBackend,
  screen
}: PageFooterInput): string {
  if (capturingTransportAction) {
    return `Learn ${mediaActionLabel(capturingTransportAction)} key: press key · Esc cancel`;
  }

  if (commandMode) {
    return `COMMAND :${commandText}`;
  }

  if (screen === 'home') {
    return '↑/↓ move · Enter open · number jump · l location · : command';
  }

  if (screen === 'search' && editingSearch) {
    return 'Type query · ↑/↓ move results · Ctrl+↑/↓ history · Enter search/tune · Esc finish';
  }

  if (screen === 'search') {
    return '/ edit query · ↑/↓ or n/p move · Enter tune · f favorite · b Overview';
  }

  if ((screen === 'countries' || screen === 'map') && editingCountryFilter) {
    return 'Type country filter · Enter/Esc apply';
  }

  if (screen === 'countries') {
    return '/ filter · ↑/↓ move · Enter open stations · w map · b Overview';
  }

  if (screen === 'map') {
    return '/ filter · ↑/↓ move · Enter open country · w list · b Overview';
  }

  if (screen === 'explore') {
    return 'Click map · WASD fine move · Shift+WASD jump · ↑/↓ station · Enter tune · f favorite · b Overview';
  }

  if (screen === 'nearby') {
    return '↑/↓ or n/p move · Enter tune · f favorite · l location · [/] page · b Overview';
  }

  if (screen === 'stations' || screen === 'library') {
    return '↑/↓ or n/p move · Enter tune · f favorite · [/] page · b Overview';
  }

  if (screen === 'now-playing') {
    const capabilities = playbackBackendCapabilities(playbackBackend);
    if (playbackBackend === 'ffplay' || playbackBackend === 'vlc') {
      return `${capabilities.label}: install mpv for pause/mute/media keys · f favorite · s sleep · d diagnostics · b Overview`;
    }

    if (playbackBackend === 'airplay') {
      return 'AirPlay: +/- volume · m mute · f favorite · s sleep · d diagnostics · b Overview';
    }

    return 'space/F8 pause · f favorite · m mute · s sleep · d diagnostics · b Overview';
  }

  if (screen === 'settings') {
    return 'Enter change selected · g Radio Garden · l location · x skip · o output · a AirPlay · r health · b Overview';
  }

  if (screen === 'airplay-settings') {
    return canEnterAirPlayCode
      ? '↑/↓ choose · Enter select receiver · c code · r refresh · b settings'
      : '↑/↓ choose · Enter select receiver · r refresh · b settings';
  }

  if (screen === 'airplay-code') {
    return 'Type receiver code · Backspace edit · Enter submit · Esc AirPlay';
  }

  if (screen === 'stats') {
    return 'b Overview';
  }

  if (screen === 'alarms') {
    return '↑/↓ or j/k/p move · Enter choose/create/edit · n new · Space toggle · g Guard · x twice delete · t station test · r repair · b Overview';
  }

  if (screen === 'alarm-editor') {
    return '↑/↓ field · ←/→ adjust · Enter open/control · Ctrl+S save · Esc cancel';
  }

  if (screen === 'alarm-picker') {
    return '↑/↓ choose · Enter select · Esc editor';
  }

  if (screen === 'alarm-ringing') {
    return 'Enter keep playing · Space snooze · ↑/↓ alarm · b return';
  }

  if (screen === 'help') {
    return '↑/↓ scroll · [/] page · ? or b close · : command';
  }

  return ': command';
}

export function microPlaybackControlsText(playbackBackend?: string): string {
  if (playbackBackend === 'airplay') {
    return '+/- volume · m mute · ,/. station';
  }

  if (playbackBackend === 'ffplay' || playbackBackend === 'vlc') {
    return ',/. station · mpv enables controls';
  }

  return 'space pause · +/- volume · ,/. station';
}

export function balancedFooterLegendRows(pageText: string, globalText: string, width: number, rowCount = 2, lastRowReservedWidth = 0): string[] {
  const safeWidth = Math.max(1, width);
  const safeRowCount = Math.max(1, rowCount);
  const rowWidths = Array.from({length:safeRowCount},(_,index)=>index===safeRowCount-1?Math.max(1,safeWidth-lastRowReservedWidth):safeWidth);
  const pageTokens = footerTokens(pageText).map(compactLegendToken);
  const globalTokens = footerTokens(globalText).map(compactLegendToken);
  const regular = fitLegendRows(pageTokens, globalTokens, rowWidths);
  const compressed = fitLegendRows(pageTokens, globalTokens.map(compactGlobalToken), rowWidths);
  if (regular && (!compressed || regular.retainedPageTokens >= compressed.retainedPageTokens)) return regular.rows;
  if (compressed) return compressed.rows;
  return packWholeTokens(globalTokens.map(compactGlobalToken), rowWidths);
}

export function microShortcutFooterText(pageText: string, width: number): string {
  const safeWidth = Math.max(1, width);
  const globalKeys = ['←/→', '?', 'q'];
  const pageKeys = footerTokens(pageText)
    .map(shortcutKey)
    .filter((value): value is string => Boolean(value) && !globalKeys.includes(value!));
  const uniquePageKeys = [...new Set(pageKeys)];

  while (uniquePageKeys.length > 0 && displayWidth([...uniquePageKeys, ...globalKeys].join('  ')) > safeWidth) {
    uniquePageKeys.pop();
  }

  const keys = [...uniquePageKeys, ...globalKeys];
  while (keys.length > 1 && displayWidth(keys.join('  ')) > safeWidth) keys.shift();
  return keys.join('  ');
}

function footerTokens(text: string): string[] {
  return text.split(' · ').map(value => value.trim()).filter(Boolean);
}

function compactLegendToken(token: string): string {
  return token
    .replace('↑/↓ or j/k/p move', '↑/↓/j/k/p move')
    .replace('↑/↓ or n/p move', '↑/↓/n/p move')
    .replace('Enter choose/create/edit', 'Enter select')
    .replace('Enter open/control', 'Enter control')
    .replace('F7/F9 or ,/. station', 'F7/F9 ,/. station')
    .replace('x twice delete', 'x×2 delete')
    .replace('t station test', 't test');
}

function compactGlobalToken(token: string): string {
  return token.replace('←/→ tabs', '←/→').replace('? help', '?').replace('q quit', 'q');
}

function shortcutKey(token: string): string | null {
  if (/^(?:ALARM PLAYING|mpv enables controls)/i.test(token)) return null;
  const match = token.match(/^(↑\/↓)(?: or ([^ ]+))?|^([^ ]+)/);
  if (!match) return null;
  return match[1] ? `${match[1]}${match[2] ? `/${match[2]}` : ''}` : match[3] ?? null;
}

function fitLegendRows(pageTokens: string[], globalTokens: string[], rowWidths: number[]): {rows:string[];retainedPageTokens:number}|null {
  for (let retained = pageTokens.length; retained >= 0; retained -= 1) {
    const rows = bestRowSplit([...pageTokens.slice(0,retained),...globalTokens],rowWidths);
    if (rows) return {rows,retainedPageTokens:retained};
  }
  return null;
}

function bestRowSplit(tokens: string[], rowWidths: number[]): string[] | null {
  const rowCount=rowWidths.length;
  if (tokens.length === 0) return Array.from({length:rowCount},()=> ' ');
  if (tokens.some(token=>displayWidth(token)>Math.max(...rowWidths))) return null;
  if (rowCount === 1) { const row=tokens.join(' · ');return displayWidth(row)<=rowWidths[0]!?[row]:null; }
  const candidates: Array<{rows:string[];difference:number}> = [];
  const visit=(start:number,rows:string[])=>{if(rows.length===rowCount-1){const final=tokens.slice(start).join(' · ');if(!final||displayWidth(final)>rowWidths[rows.length]!)return;const candidate=[...rows,final];const widths=candidate.map(displayWidth);candidates.push({rows:candidate,difference:Math.max(...widths)-Math.min(...widths)});return;}const remainingRows=rowCount-rows.length-1;for(let end=start+1;end<=tokens.length-remainingRows;end+=1){const row=tokens.slice(start,end).join(' · ');if(displayWidth(row)>rowWidths[rows.length]!)break;visit(end,[...rows,row]);}};
  if(tokens.length<rowCount){const row=tokens.join(' · ');return displayWidth(row)<=rowWidths[0]!?[row,...Array.from({length:rowCount-1},()=> ' ')]:null;}
  visit(0,[]);
  return candidates.sort((a,b)=>a.difference-b.difference)[0]?.rows ?? null;
}

function packWholeTokens(tokens: string[], rowWidths: number[]): string[] {
  const rows = Array.from({length: rowWidths.length}, () => '');
  for (const token of tokens) {
    const target = rows.findIndex((row,index) => displayWidth(row ? `${row} · ${token}` : token) <= rowWidths[index]!);
    if (target < 0) continue;
    rows[target] = rows[target] ? `${rows[target]} · ${token}` : token;
  }
  return rows.map(row => row || ' ');
}
