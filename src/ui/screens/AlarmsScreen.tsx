import React from 'react';
import {Box, Text} from 'ink';
import type {Alarm, ThemeName} from '../../types.js';
import {draftNextOccurrence, type AlarmDraft, type AlarmEditorControl, type AlarmEditorField, type TimeSegment} from '../alarm-editor.js';
import type {AlarmRuntimeSummary, AlarmVerificationReport, TuiActiveAlarm} from '../alarm-tui-service.js';
import {nextOccurrenceForAlarm} from '../../alarms/schedule.js';
import {stationKey} from '../../storage/store.js';
import {visibleWindow} from '../list-window.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {textMuted, themeAccent} from '../theme.js';
import {truncate} from '../format.js';
import {useDisplay} from '../display-context.js';
import {toAsciiSafe} from '../ascii.js';
import {AdaptiveMarquee} from '../components/AdaptiveMarquee.js';

export type AlarmPickerChoice = {station?: Alarm['station']; source: string; key: string};
type AlarmDisplayMode = 'full' | 'compact' | 'micro';

export function AlarmsScreen({alarms, selected, runtime, verification, deletingId, busyAlarmIds = new Set(), theme, width, height, mode: requestedMode}: {
  alarms: Alarm[]; selected: number; runtime: AlarmRuntimeSummary | null; verification?:AlarmVerificationReport|null; deletingId?: string; busyAlarmIds?: Set<string>; theme: ThemeName; width: number; height: number; mode?: AlarmDisplayMode;
}): React.ReactElement {
  const accent = themeAccent(theme);
  const {ascii, reduceMotion} = useDisplay(); const a = (value:string) => ascii ? toAsciiSafe(value) : value;
  const mode = requestedMode ?? (width < 34 ? 'micro' : width < 68 ? 'compact' : 'full');
  if(verification)return <AlarmVerificationScreen report={verification} theme={theme} width={width} height={height}/>;
  const status = schedulerStatus(runtime, mode);
  const next = alarms.map(alarm => ({alarm, occurrence: nextOccurrenceForAlarm(alarm, new Date())})).filter(item => item.occurrence).sort((a, b) => a.occurrence!.getTime() - b.occurrence!.getTime())[0];
  const noticeRows=height>=11?2:1;
  const rows = Math.max(1, height - 5 - noticeRows);
  const items: Array<{kind: 'create'}|{kind:'verify'}|{kind: 'alarm'; alarm: Alarm}> = [{kind: 'create'}, ...alarms.map(alarm => ({kind: 'alarm' as const, alarm})), {kind:'verify'}];
  const window = visibleWindow(items, Math.min(selected, items.length - 1), rows);
  return <Box flexDirection="column" height={height} width={width} overflow="hidden">
    <ScreenHeader title="Alarms" subtitle={status} theme={theme} width={width} />
    <Text color={next ? accent : textMuted}>{a(truncate(next ? nextAlarmSummary(next.alarm, next.occurrence!, mode) : mode === 'full' ? 'No enabled future alarm.' : 'No upcoming alarms.', width))}</Text>
    <Box marginTop={1} flexDirection="column" height={rows} overflow="hidden">
      {window.items.map((item, offset) => {
        const index = window.start + offset;
        const active = index === selected;
        if (item.kind === 'create') return <Text key="create-alarm" color={active ? accent : undefined} bold={active}>
          {a(`${active ? '› ' : '  '}Create alarm`)}
        </Text>;
        if(item.kind==='verify')return <Box key="verify-alarm"><Text color={active?accent:undefined} bold={active}>{a(active?'› ':'  ')}</Text><Text color={active?accent:undefined} bold={active}>
          <AdaptiveMarquee text={a(verifyLabel(mode))} width={Math.max(0,width-2)} active={active} reduceMotion={reduceMotion}/>
        </Text></Box>;
        const alarm = item.alarm;
        const degraded = runtime?.degradedAlarmIds.has(alarm.id);
        const cue = degraded ? ' · needs repair' : '';
        const deleting = busyAlarmIds.has(alarm.id) ? ' · deleting…' : deletingId === alarm.id ? ' · press x again to delete' : '';
        const rowText = `${alarmRowSummary(alarm, mode)}${cue}${deleting}`;
        return <Box key={alarm.id}><Text color={active ? accent : alarm.enabled ? undefined : textMuted} bold={active}>
          {a(`${active ? '› ' : '  '}${alarm.enabled ? '●' : '○'} `)}
        </Text><Text color={active ? accent : alarm.enabled ? undefined : textMuted} bold={active}>
          <AdaptiveMarquee text={a(rowText)} width={Math.max(0,width-4)} active={active} reduceMotion={reduceMotion}/>
        </Text></Box>;
      })}
    </Box>
    {height>=11?<Text color={textMuted}>{a(staticAlarmMessage(backgroundPromise(runtime, mode),width))}</Text>:null}
    <Text backgroundColor={accent} color="black" bold>{a(staticAlarmMessage(betaNotice(mode),width))}</Text>
  </Box>;
}

function AlarmVerificationScreen({report,theme,width,height}:{report:AlarmVerificationReport;theme:ThemeName;width:number;height:number}):React.ReactElement{
  const accent=themeAccent(theme);const {ascii}=useDisplay();const a=(value:string)=>ascii?toAsciiSafe(value):value;
  const heading=report.state==='running'?'Verification in progress':report.state==='passed'?'Alarm setup verified':report.state==='warning'?'Alarm setup verified with limitations':'Alarm setup has blockers';
  const subtitle=report.alarmLabel?`Rehearsing “${report.alarmLabel}” on this machine`:'Infrastructure check · create an alarm to include its real station';
  const rows=Math.max(1,height-5);const window=visibleWindow(report.steps,Math.max(0,report.steps.findIndex(step=>step.state==='running')),Math.max(1,Math.floor(rows/2)));
  return <Box flexDirection="column" height={height} width={width} overflow="hidden">
    <ScreenHeader title={heading} subtitle={subtitle} theme={theme} width={width}/>
    <Text color={report.state==='passed'?accent:report.state==='running'?accent:undefined} bold>{a(report.state==='running'?'A temporary terminal may open and a 3-second radio sample will play.':report.state==='passed'?'PASS · The complete alarm rehearsal succeeded.':report.state==='warning'?'READY WITH LIMITATIONS · Review warnings before relying on wake behavior.':'NOT READY · Fix failed critical steps and run Verify again.')}</Text>
    <Box marginTop={1} flexDirection="column" height={rows} overflow="hidden">
      {window.items.map(step=><Box key={step.id} flexDirection="column">
        <Text color={step.state==='passed'?accent:step.state==='running'?accent:step.state==='failed'?'red':step.state==='warning'?'yellow':textMuted} bold={step.state!=='pending'}>{a(`${verificationMark(step.state)} ${step.label}`)}</Text>
        <Text color={textMuted}>{a(`   ${truncate(step.detail,Math.max(1,width-3))}`)}</Text>
      </Box>)}
    </Box>
    <Text color={textMuted}>{a(report.state==='running'?'Please keep RadioCLI open until cleanup completes.':'Press Enter or b to return to Alarms. Run Verify again whenever the OS, terminal, or audio setup changes.')}</Text>
  </Box>;
}

export function AlarmEditorScreen({draft, field, editing, control = null, timeSegment = 'hour', weekdayIndex = 0, error, saving = false, theme, width, height}: {
  draft: AlarmDraft; field: AlarmEditorField; editing: boolean; control?: AlarmEditorControl; timeSegment?: TimeSegment; weekdayIndex?: number; error: string | null; saving?: boolean; theme: ThemeName; width: number; height: number;
}): React.ReactElement {
  const accent = themeAccent(theme);
  const {ascii} = useDisplay(); const a = (value:string) => ascii ? toAsciiSafe(value) : value;
  const rows = editorRows(draft);
  const selectableIndex = rows.findIndex(row => row.field === field);
  const viewportHeight=Math.max(1,height-5);const window = visibleWindow(rows, Math.max(0, selectableIndex), viewportHeight);
  return <Box flexDirection="column" height={height} width={width} overflow="hidden">
    <ScreenHeader title={draft.id ? 'Edit alarm' : 'New alarm'} subtitle={saving ? 'Saving locally and synchronizing the native scheduler…' : error ?? 'Local-first · native OS job installed on save · terminal may close afterward'} theme={theme} width={width} />
    <Box marginTop={1} flexDirection="column" height={viewportHeight} overflow="hidden">
      {control === 'weekdays' ? <WeekdayControl draft={draft} selected={weekdayIndex} accent={accent} ascii={ascii} height={viewportHeight} /> : window.items.map(row => row.section
        ? <Text key={row.section} color={accent} bold>{a(row.section)}</Text>
        : row.field === 'time' && row.field === field && control === 'time'
          ? <EditorColumns key="time" width={width} help={a(editorHelp('time')??'')} ascii={ascii}><TimeControlRow value={draft.time} segment={timeSegment} accent={accent} ascii={ascii} /></EditorColumns>
          : <EditorFieldRow key={row.field} row={row} selected={row.field===field} editing={editing} control={row.field===field?control:null} draft={draft} accent={accent} ascii={ascii} width={width}/>)}
    </Box>
  </Box>;
}

export function AlarmPickerScreen({choices, selected, fallback, theme, width, height}: {choices: AlarmPickerChoice[]; selected: number; fallback: boolean; theme: ThemeName; width: number; height: number}): React.ReactElement {
  const window = visibleWindow(choices, selected, Math.max(1, height - 5)); const accent = themeAccent(theme);
  const {ascii} = useDisplay(); const a = (value:string) => ascii ? toAsciiSafe(value) : value;
  return <Box flexDirection="column" height={height} width={width} overflow="hidden">
    <ScreenHeader title={fallback ? 'Fallback station' : 'Primary station'} subtitle="Favorites, imports, recents, current station, and alarm stations" theme={theme} width={width} />
    <Box marginTop={1} flexDirection="column">
      {window.items.map((choice, offset) => { const index = window.start + offset; return <Text key={choice.key} color={index === selected ? accent : undefined} bold={index === selected}>
        {a(`${index === selected ? '› ' : '  '}${truncate(`${choice.station?.name ?? 'None'} · ${choice.source}`, Math.max(1, width - 2))}`)}
      </Text>; })}
    </Box>
  </Box>;
}

export function AlarmRingingScreen({sessions, alarms = [], selected, snoozeMinutes, theme, width, height}: {sessions: TuiActiveAlarm[]; alarms?: Alarm[]; selected: number; snoozeMinutes: number; theme: ThemeName; width: number; height: number}): React.ReactElement {
  const accent = themeAccent(theme); const session = sessions[selected]; const label = session ? alarms.find(alarm => alarm.id === session.status.alarmId)?.label : undefined;
  const starting = session?.status.state === 'starting';
  const {ascii} = useDisplay(); const a = (value:string) => ascii ? toAsciiSafe(value) : value;
  const roomy = width >= 42 && height >= 12;
  const clockText=session?formatClock(new Date(session.status.scheduledAt)):'';
  const displayClock=roomy&&!ascii?fullwidthClock(clockText):clockText;
  return <Box flexDirection="column" height={height} width={width} overflow="hidden">
    <ScreenHeader title="Alarm ringing" subtitle={sessions.length > 1 ? `${selected + 1} of ${sessions.length} active alarms` : starting ? 'Wake radio · preparing station' : 'Wake radio · playing now'} theme={theme} width={width} />
    {session ? <Box flexDirection="column" alignItems="center" width={width}>
      <Text backgroundColor={accent} color="black" bold>{a(starting ? '  ALARM STARTING  ' : '  ALARM ACTIVE  ')}</Text>
      <Box marginTop={roomy ? 1 : 0}>
        <Text backgroundColor={roomy ? accent : undefined} color={roomy ? 'black' : accent} bold>{a(roomy ? `      ${displayClock}      ` : displayClock)}</Text>
      </Box>
      <Box flexDirection="column" alignItems="center" marginTop={roomy ? 1 : 0} width={width}>
        <Text color={accent} bold>{a(truncate(label ? `${session.status.stationName} · ${label}` : session.status.stationName, width))}</Text>
        {height >= 12 ? <Text color={textMuted}>{a(truncate(`${starting ? 'Preparing' : 'Started'} ${formatElapsed(session.status.startedAt)} ago · scheduled ${formatWhen(new Date(session.status.scheduledAt))}`, width))}</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection={width >= 58 ? 'row' : 'column'} alignItems="center">
        <Text backgroundColor={accent} color="black" bold>{a(starting ? '  ENTER  WAIT FOR STATION  ' : '  ENTER  KEEP PLAYING  ')}</Text>
        {width >= 58 ? <Text>  </Text> : null}
        <Text backgroundColor={accent} color="black" bold>{a(`  SPACE  SNOOZE ${snoozeMinutes} MIN  `)}</Text>
      </Box>
      {height >= 14 ? <Text color={textMuted}>{a(starting ? 'Space snoozes before playback · b return' : 'Enter opens Playing · Space stops the radio until snooze ends · b return')}</Text> : null}
      {sessions.length > 1 && height >= 15 ? <Text color={textMuted}>{a(`↑/↓ choose active alarm · ${selected + 1}/${sessions.length}`)}</Text> : null}
    </Box> : <Text color={textMuted}>The alarm session ended. Press b to return.</Text>}
  </Box>;
}

function editorRows(draft: AlarmDraft): Array<{section?: string; field?: AlarmEditorField; label?: string; value?: string; hint?: boolean}> {
  const next = draftNextOccurrence(draft);
  return [
    {section: 'BASICS'},
    {field: 'label', label: 'Label', value: draft.label}, {field: 'enabled', label: 'Enabled', value: draft.enabled ? 'Yes' : 'No'},
    {field: 'station', label: 'Station', value: draft.station?.name ?? 'Choose…'}, {field: 'scheduleType', label: 'Schedule', value: draft.scheduleType === 'once' ? 'One time' : 'Recurring'},
    ...(draft.scheduleType === 'once' ? [{field: 'date' as const, label: 'Local date', value: draft.date}] : []),
    {field: 'time', label: 'Time (24h)', value: draft.time},
    ...(draft.scheduleType === 'recurring' ? [{field: 'weekdays' as const, label: 'Repeat', value: weekdayDraftLabel(draft.weekdays)}] : []),
    {field: 'timezone', label: 'Timezone', value: draft.timezone},
    {section: 'PLAYBACK'}, {field: 'volume', label: 'Volume', value: `${draft.volume}%`}, {field: 'fadeSeconds', label: 'Fade in', value: `${draft.fadeSeconds}s (mpv only)`},
    {field: 'stopAfterMinutes', label: 'Stop after', value: `${draft.stopAfterMinutes}m`}, {field: 'fallbackStation', label: 'Fallback', value: draft.fallbackStation?.name ?? 'None'}, {field: 'output', label: 'Output', value: 'Local speakers'},
    {section: 'RELIABILITY'}, {field: 'missedRunGraceMinutes', label: 'Run after wake within', value: `${draft.missedRunGraceMinutes}m`},
    {field: 'wakeIfSupported', label: 'Request OS wake', value: draft.wakeIfSupported ? 'Yes' : 'No'}, {field: 'keepAwakeUntilAlarm', label: 'Alarm Guard', value: draft.keepAwakeUntilAlarm ? 'On' : 'Off'},
    {field: 'preview', label: 'Test-tune station now (does not fire alarm)'}, {section: 'REVIEW'},
    {field: 'save', label: 'Save alarm', value: next ? `next ${formatWhen(next)}` : 'fix fields to preview next run'}, {field: 'cancel', label: 'Cancel'}
  ];
}

function editorHelp(field: AlarmEditorField): string|undefined {
  const help: Partial<Record<AlarmEditorField, string>> = {
    timezone: 'An explicit IANA timezone keeps civil schedules stable across travel and DST.',
    fadeSeconds: 'Fade-in requires mpv; other playback backends start at the target volume.',
    stopAfterMinutes: 'Playback stops automatically unless Keep playing is chosen while ringing.',
    fallbackStation: 'The fallback is tried when the primary stream cannot start. Choose None to clear it.',
    output: 'Scheduled alarms currently play through local speakers; AirPlay is not used unattended.',
    missedRunGraceMinutes: 'After sleep or logout, run only when the alarm is still inside this grace window.',
    wakeIfSupported: 'Asks supported systems to wake the computer for this alarm.',
    keepAwakeUntilAlarm: 'Alarm Guard prevents idle sleep until this occurrence. It is machine-local and consumes power.',
    time: 'Enter opens the time control; ←/→ chooses hours or minutes and ↑/↓ changes the value.',
    weekdays: 'Enter opens the weekday checklist. Choose any combination of Monday through Sunday.',
    volume: 'Sets player volume and raises/unmutes the local system output to this level while the alarm plays.',
    station: 'Choose the primary stream from current, favorites, imports, recents, or existing alarms.'
  };
  return help[field];
}

type EditorRow=ReturnType<typeof editorRows>[number];
function EditorFieldRow({row,selected,editing,control,draft,accent,ascii,width}:{row:EditorRow;selected:boolean;editing:boolean;control:AlarmEditorControl;draft:AlarmDraft;accent:string;ascii:boolean;width:number}){
  const safe=(value:string)=>ascii?toAsciiSafe(value):value;const field=row.field!;const value=`${row.label}${row.value===undefined?'':`: ${editorValue(field,row.value,draft,control)}`}${selected&&editing?' █':''}`;const leftWidth=editorLeftWidth(width);const content=safe(`${selected?'› ':'  '}${truncate(value,Math.max(1,leftWidth-2))}`);
  const action=field==='save'||field==='cancel';const actionText=safe(truncate(`${selected?'›':' '} ${row.label}${row.value?` · ${row.value}`:''}  `,leftWidth).padEnd(leftWidth));
  const left=action&&selected?<Text backgroundColor={accent} color="black" bold>{actionText}</Text>:<Text color={selected?accent:undefined} bold={selected}>{content}</Text>;
  return <EditorColumns width={width} help={safe(editorHelp(field)??'')} ascii={ascii}>{left}</EditorColumns>;
}
function EditorColumns({width,help,ascii,children}:{width:number;help?:string;ascii:boolean;children:React.ReactNode}){const leftWidth=editorLeftWidth(width);const showHelp=Boolean(help)&&width>=72;const description=truncate(help??'',Math.max(1,width-leftWidth-2));return <Box width={width}><Box width={showHelp?leftWidth:width}>{children}</Box>{showHelp?<Box marginLeft={2} width={Math.max(1,width-leftWidth-2)}><Text color={textMuted}>{ascii?toAsciiSafe(description):description}</Text></Box>:null}</Box>;}
function editorLeftWidth(width:number){return Math.min(width,54,Math.max(28,Math.floor(width*0.46)));}

function editorValue(field: AlarmEditorField | undefined, value: string, draft: AlarmDraft, control: AlarmEditorControl): string {
  if (field === 'time') {
    const [hour = '00', minute = '00'] = draft.time.split(':');
    return `${hour} : ${minute}`;
  }
  if (field === 'volume') {
    const level = Math.max(0, Math.min(10, Math.round(Number(draft.volume) / 10)));
    return `${value}  [${'█'.repeat(level)}${'·'.repeat(10 - level)}]${control === 'number' ? '  ←/→' : ''}`;
  }
  if (control === 'number' && ['fadeSeconds', 'stopAfterMinutes', 'missedRunGraceMinutes'].includes(field ?? '')) return `${value}  ←/→`;
  return value;
}

function TimeControlRow({value, segment, accent, ascii}: {value: string; segment: TimeSegment; accent: string; ascii: boolean}): React.ReactElement {
  const [hour = '00', minute = '00'] = value.split(':');
  const pointer = ascii ? '> ' : '› ';
  const digit = (text: string, active: boolean) => <Text backgroundColor={active ? accent : undefined} color={active ? 'black' : accent} bold>{` ${text} `}</Text>;
  return <Text color={accent} bold>{pointer}Time: {digit(hour, segment === 'hour')} : {digit(minute, segment === 'minute')}</Text>;
}

function WeekdayControl({draft, selected, accent, ascii, height}: {draft: AlarmDraft; selected: number; accent: string; ascii: boolean; height:number}): React.ReactElement {
  const chosen = new Set(draft.weekdays.split(',').map(Number));
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const decorated=height>=3;const window=visibleWindow(names,selected,decorated?Math.max(1,height-2):height);
  const safe = (value: string) => ascii ? toAsciiSafe(value) : value;
  return <Box flexDirection="column">
    {decorated?<Text color={accent} bold>WEEKDAYS</Text>:null}
    {window.items.map((name, offset) => {const index=window.start+offset;return <Text key={name} color={index === selected ? accent : undefined} bold={index === selected}>
      {safe(`${index === selected ? '› ' : '  '}${chosen.has(index + 1) ? '●' : '○'} ${name}`)}
    </Text>;})}
    {decorated?<Text color={textMuted}>{safe('Select one or more days. At least one day must remain checked.')}</Text>:null}
  </Box>;
}

export function alarmPickerChoices(alarms: Alarm[], favorites: Alarm['station'][], imported: Alarm['station'][], recent: Array<{station: Alarm['station']}>, playing: Alarm['station'] | null, fallback: boolean): AlarmPickerChoice[] {
  const result: AlarmPickerChoice[] = fallback ? [{key: 'none', source: 'No fallback'}] : [];
  const seen = new Set<string>();
  const add = (station: Alarm['station'] | null | undefined, source: string) => { if (!station) return; const key = stationKey(station); if (seen.has(key)) return; seen.add(key); result.push({station, source, key}); };
  add(playing, 'Now playing'); favorites.forEach(value => add(value, 'Favorite')); imported.forEach(value => add(value, 'Imported')); recent.forEach(value => add(value.station, 'Recent')); alarms.forEach(value => add(value.station, 'Alarm'));
  return result;
}
function weekdayLabel(days: number[]): string { if (days.join(',') === '1,2,3,4,5') return 'weekdays'; if (days.join(',') === '6,7') return 'weekends'; if (days.length === 7) return 'daily'; return days.map(day => ['','Mo','Tu','We','Th','Fr','Sa','Su'][day]).join(' '); }
function weekdayDraftLabel(value: string): string { return weekdayLabel(value.split(',').map(Number)); }
function shortZone(value: string): string { return value.replace('America/', '').replaceAll('_', ' '); }
function formatWhen(date: Date): string { return `${new Intl.DateTimeFormat(undefined, {weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}).format(date)} (your time)`; }
function formatCompactWhen(date: Date, mode: AlarmDisplayMode): string { return new Intl.DateTimeFormat(undefined, mode === 'micro' ? {weekday:'short',hour:'numeric',minute:'2-digit'} : {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date); }
function formatElapsed(startedAt: string): string { const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`; }
function formatClock(date: Date): string { return new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit'}).format(date); }
function fullwidthClock(value:string):string{return [...value].map(character=>character===' '? '　':character>='0'&&character<='9'?String.fromCodePoint(character.codePointAt(0)!+0xfee0):character===':'?'：':character>='A'&&character<='Z'?String.fromCodePoint(character.codePointAt(0)!+0xfee0):character).join('');}
function verificationMark(state:AlarmVerificationReport['steps'][number]['state']):string{return state==='passed'?'●':state==='warning'?'!':state==='failed'?'×':state==='running'?'›':'○';}
function schedulerStatus(runtime: AlarmRuntimeSummary | null, mode: AlarmDisplayMode): string { if (!runtime) return mode === 'micro' ? 'Checking scheduler…' : 'Scheduler: checking…'; if (!runtime.capabilities.supported) return mode === 'full' ? `Scheduler: Unsupported · ${runtime.capabilities.message}` : mode === 'compact' ? 'Scheduler: Unavailable' : 'Scheduler unavailable'; if (runtime.degradedAlarmIds.size) return mode === 'full' ? `Scheduler: Degraded · ${runtime.message}` : mode === 'compact' ? 'Scheduler: Repair needed' : 'Repair scheduler'; return mode === 'micro' ? 'Scheduler ready' : 'Scheduler: Ready'; }
function nextAlarmSummary(alarm: Alarm, occurrence: Date, mode: AlarmDisplayMode): string { const when=mode==='full'?formatWhen(occurrence):formatCompactWhen(occurrence,mode);return mode==='micro'?`Next · ${when}`:`${mode==='full'?'Next wake':'Next'} · ${when} · ${alarm.station.name}`; }
function alarmRowSummary(alarm: Alarm, mode: AlarmDisplayMode): string { const station=alarm.label.trim().toLocaleLowerCase()===alarm.station.name.trim().toLocaleLowerCase()?'':` · ${alarm.station.name}`;const schedule=alarm.schedule.type==='once'?(mode==='full'?`once ${formatWhen(new Date(alarm.schedule.at))}`:`once ${formatCompactWhen(new Date(alarm.schedule.at),mode)}`):`${alarm.schedule.time} ${weekdayLabel(alarm.schedule.weekdays)}${mode==='full'?` ${shortZone(alarm.schedule.timezone)}`:''}`;return `${alarm.label} · ${schedule}${station}`; }
function verifyLabel(mode: AlarmDisplayMode): string { return mode==='full'?'Verify alarm setup · full scheduler, terminal, controls, power, volume, and audio rehearsal':mode==='compact'?'Verify alarm setup · scheduler, terminal, power, and audio':'Verify alarm setup'; }
function backgroundPromise(runtime: AlarmRuntimeSummary | null, mode: AlarmDisplayMode): string[] { if (!runtime) return mode==='full'?['Checking whether the terminal may close after save…']:['Checking scheduler…']; if (!runtime.capabilities.supported) return mode==='full'?[`Background scheduling unavailable: ${runtime.capabilities.message}`]:['Background scheduling unavailable','Scheduler unavailable']; if (runtime.degradedAlarmIds.size) return mode==='full'?['Background scheduling needs repair; keep the alarm visible and press r.']:['Scheduling needs repair · press r','Repair needed · press r']; return mode==='full'?['Native scheduling is ready; the terminal does not need to stay open after save.']:['Native scheduling ready · safe to close after save','Scheduler ready · safe to close']; }
function betaNotice(mode: AlarmDisplayMode): string[] { return mode==='full'?[' BETA · Experimental. Use a secondary device for critical wake-ups. ']:mode==='compact'?['BETA · Keep a backup alarm for critical wakes','BETA · Keep a backup alarm']:['BETA · Keep a backup alarm','BETA · Keep backup','BETA']; }
function staticAlarmMessage(variants: string[], width: number): string { return variants.find(value=>value.length<=width)??truncate(variants.at(-1)??'',width); }
