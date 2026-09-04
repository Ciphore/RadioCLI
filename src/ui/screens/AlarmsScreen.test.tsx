import {act} from 'react';
import {render} from 'ink-testing-library';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Alarm, Station} from '../../types.js';
import {DisplayContext, resolveDisplayMode} from '../display-context.js';
import {displayWidth} from '../format.js';
import {defaultAlarmDraft} from '../alarm-editor.js';
import {AlarmEditorScreen, AlarmPickerScreen, AlarmRingingScreen, AlarmsScreen, alarmPickerChoices} from './AlarmsScreen.js';

const station: Station = {id: 'kexp', provider: 'radio-browser', name: 'KEXP 90.3 FM', tags: ['indie']};
const alarm: Alarm = {id: 'morning', label: 'Morning radio', enabled: true, station, schedule: {type: 'recurring', time: '06:30', weekdays: [1,2,3,4,5], timezone: 'America/Los_Angeles'}, playback: {volume: 70, fadeSeconds: 30, stopAfterMinutes: 60}, reliability: {missedRunGraceMinutes: 15, wakeIfSupported: true, keepAwakeUntilAlarm: true}, createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z'};
const runtime = {capabilities: {supported: true, exactWake: false, catchUpAfterWake: true, message: 'ready'}, degradedAlarmIds: new Set<string>(), message: 'ready'};
const display = resolveDisplayMode({}, {});

describe('alarm TUI screens', () => {
  afterEach(() => vi.useRealTimers());

  it.each([{width: 90, height: 22}, {width: 48, height: 10}, {width: 26, height: 7}])('renders the alarm list inside $width x $height', ({width, height}) => {
    const frame = render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[alarm]} selected={0} runtime={runtime} theme="green" width={width} height={height} /></DisplayContext.Provider>).lastFrame() ?? '';
    expect(frame).toContain('Alarms'); expect(frame).toContain('Create alarm'); expect(frame).toContain(width < 34 ? 'Next ·' : 'Morning'); expect(frame.split('\n').length).toBeLessThanOrEqual(height);
    expect(frame).not.toContain('＋ Create alarm'); expect(frame).not.toContain('✓ Verify alarm setup');
  });

  it('surfaces scheduler capability limitations even when there are no degraded alarms', () => {
    const unsupported = {capabilities: {supported: false, exactWake: false, catchUpAfterWake: false, message: 'This Linux session has no systemd user manager.'}, degradedAlarmIds: new Set<string>(), message: 'unsupported'};
    const frame = render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[alarm]} selected={0} runtime={unsupported} theme="green" width={110} height={18} /></DisplayContext.Provider>).lastFrame() ?? '';
    expect(frame).toContain('Scheduler: Unsupported'); expect(frame).toContain('no systemd user manager');
  });

  it('marquees only the focused alarm while keeping its pointer and enabled state fixed', async () => {
    vi.useFakeTimers();
    const longAlarm = {...alarm, label: 'Extremely long early morning radio alarm for the whole household'};
    const view = render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[longAlarm]} selected={1} runtime={runtime} theme="green" width={32} height={9} mode="micro" /></DisplayContext.Provider>);
    const first = view.lastFrame() ?? '';
    expect(first).toContain('› ● Extremely long early morn');
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    const moved = view.lastFrame() ?? '';
    expect(moved).toContain('› ● xtremely long early morni');
    expect(moved).not.toBe(first);
  });

  it('removes repeated next-run details and avoids repeating a station used as the alarm label', () => {
    const stationLabelAlarm = {...alarm, label: station.name};
    const frame = render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[stationLabelAlarm]} selected={1} runtime={runtime} theme="green" width={130} height={14} mode="full" /></DisplayContext.Provider>).lastFrame() ?? '';
    expect(frame.match(/KEXP 90\.3 FM/g)).toHaveLength(2);
    expect(frame.split('\n').find(line => line.includes('› ●'))).not.toContain(' · next ');
  });

  it('uses short, non-scrolling scheduler and beta copy in compact and micro layouts', () => {
    const compact = render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[alarm]} selected={1} runtime={runtime} theme="green" width={48} height={12} mode="compact" /></DisplayContext.Provider>).lastFrame() ?? '';
    const micro = render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[alarm]} selected={1} runtime={runtime} theme="green" width={26} height={7} mode="micro" /></DisplayContext.Provider>).lastFrame() ?? '';
    expect(compact).toContain('Scheduler: Ready');
    expect(compact).toContain('safe to close');
    expect(compact).toContain('BETA · Keep a backup alarm');
    expect(micro).toContain('Scheduler ready');
    expect(micro).toContain('BETA · Keep a backup alarm');
    expect(micro).toMatch(/Next · \w{3} .*\d:\d{2}/);
    for (const frame of [compact, micro]) {
      expect(frame).not.toContain('terminal does not need to stay open');
      expect(frame).not.toContain('Experimental. Use a secondary device');
    }
    expect(Math.max(...compact.split('\n').map(displayWidth))).toBeLessThanOrEqual(48);
    expect(Math.max(...micro.split('\n').map(displayWidth))).toBeLessThanOrEqual(26);
  });

  it('renders a detailed machine rehearsal report instead of a vague pass/fail toast',()=>{const verification={state:'warning' as const,alarmLabel:'Morning radio',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),steps:[{id:'scheduler',label:'Native scheduler',state:'passed' as const,detail:'Disposable launchd job registered and queried.',critical:true},{id:'power',label:'Sleep protection',state:'warning' as const,detail:'Closed-lid policy cannot be overridden.',critical:false}]};const frame=render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[alarm]} selected={1} runtime={runtime} verification={verification} theme="green" width={100} height={16}/></DisplayContext.Provider>).lastFrame()??'';expect(frame).toContain('verified with limitations');expect(frame).toContain('Native scheduler');expect(frame).toContain('Sleep protection');expect(frame).toContain('Closed-lid policy');expect(frame).toContain('Press Enter or b');});

  it('keeps the alarm list concise without historical outcomes or platform caveat prose',()=>{const dismissed:Alarm={...alarm,lastRun:{status:'dismissed',scheduledAt:'2026-09-01T12:00:00Z',finishedAt:'2026-09-01T12:01:00Z'}};const noisy={...runtime,capabilities:{...runtime.capabilities,message:'exact wake is unavailable. Resync after changing the host timezone.'}};const frame=render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[dismissed]} selected={1} runtime={noisy} theme="green" width={130} height={14}/></DisplayContext.Provider>).lastFrame()??'';expect(frame).toContain('Scheduler: Ready');expect(frame).not.toContain('last dismissed');expect(frame).not.toContain('exact wake');expect(frame).not.toContain('Resync');expect(frame).not.toContain('n new');});

  it('uses truthful empty-state promises for supported and unsupported schedulers', () => {
    const ready = render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[]} selected={0} runtime={runtime} theme="green" width={100} height={12} /></DisplayContext.Provider>).lastFrame() ?? '';
    const unsupported = render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[]} selected={0} runtime={{capabilities:{supported:false,exactWake:false,catchUpAfterWake:false,message:'systemd unavailable'},degradedAlarmIds:new Set(),message:'unsupported'}} theme="green" width={100} height={12} /></DisplayContext.Provider>).lastFrame() ?? '';
    expect(ready).toContain('terminal does not need to stay open'); expect(ready).toContain('BETA · Experimental'); expect(unsupported).toContain('Background scheduling unavailable'); expect(unsupported).not.toContain('does not need to stay open');
  });

  it('labels converted next occurrences as the user’s local time while retaining the civil timezone', () => {
    const ny: Alarm={...alarm,schedule:{type:'recurring',time:'06:30',weekdays:[1,2,3,4,5],timezone:'America/New_York'}};
    const frame=render(<DisplayContext.Provider value={display}><AlarmsScreen alarms={[ny]} selected={0} runtime={runtime} theme="green" width={130} height={14}/></DisplayContext.Provider>).lastFrame()??'';
    expect(frame).toContain('New York');expect(frame).toContain('(your time)');
  });

  it('replaces alarm chrome glyphs in ASCII-safe mode', () => {
    const asciiDisplay=resolveDisplayMode({asciiMode:true},{});const active={key:'one',status:{alarmId:'morning',scheduledAt:new Date().toISOString(),stationName:'KEXP',startedAt:new Date().toISOString()},dismiss:vi.fn(),snooze:vi.fn(),keepPlaying:vi.fn()};
    const frames=[render(<DisplayContext.Provider value={asciiDisplay}><AlarmsScreen alarms={[alarm]} selected={0} runtime={runtime} theme="green" width={100} height={14}/></DisplayContext.Provider>).lastFrame()??'',render(<DisplayContext.Provider value={asciiDisplay}><AlarmEditorScreen draft={defaultAlarmDraft(station)} field="label" editing theme="green" error={null} width={100} height={20}/></DisplayContext.Provider>).lastFrame()??'',render(<DisplayContext.Provider value={asciiDisplay}><AlarmPickerScreen choices={alarmPickerChoices([alarm],[station],[],[],station,true)} selected={0} fallback theme="green" width={80} height={12}/></DisplayContext.Provider>).lastFrame()??'',render(<DisplayContext.Provider value={asciiDisplay}><AlarmRingingScreen sessions={[active]} alarms={[alarm]} selected={0} snoozeMinutes={10} theme="green" width={80} height={14}/></DisplayContext.Provider>).lastFrame()??''];
    for(const frame of frames)expect(frame).not.toMatch(/[›●○·…↑↓–█]/);
  });

  it('renders progressive editor sections, truthful fade support, next run, and Guard limitations', () => {
    const frame = render(<DisplayContext.Provider value={display}><AlarmEditorScreen draft={defaultAlarmDraft(station)} field="fadeSeconds" editing={false} error={null} theme="green" width={100} height={30} /></DisplayContext.Provider>).lastFrame() ?? '';
    expect(frame).toContain('BASICS'); expect(frame).toContain('PLAYBACK'); expect(frame).toContain('RELIABILITY');
    expect(frame).toContain('mpv only'); expect(frame).toContain('next '); expect(frame).toContain('Fade-in requires mpv'); expect(frame).toContain('terminal may close afterward');
  });

  it('places only specific field guidance in the second column',()=>{const frame=render(<DisplayContext.Provider value={display}><AlarmEditorScreen draft={defaultAlarmDraft(station)} field="station" editing={false} error={null} theme="green" width={120} height={20}/></DisplayContext.Provider>).lastFrame()??'';const stationRow=frame.split('\n').find(line=>line.includes('Station:'))??'';expect(stationRow).toContain('Choose the primary stream');expect(frame).not.toContain('Enter edits or activates this field');});

  it('keeps a selected field near the end of the editor visible in a short viewport',()=>{const frame=render(<DisplayContext.Provider value={display}><AlarmEditorScreen draft={defaultAlarmDraft(station)} field="save" editing={false} error={null} theme="green" width={60} height={9}/></DisplayContext.Provider>).lastFrame()??'';expect(frame).toContain('Save alarm');expect(frame).toContain('› Save alarm');expect(frame).not.toContain('BASICS');});

  it('renders segmented time, weekday checklist, and volume slider controls', () => {
    const draft = defaultAlarmDraft(station, new Date('2026-08-22T12:00:00.000Z'));
    const time = render(<DisplayContext.Provider value={display}><AlarmEditorScreen draft={{...draft,time:'06:30'}} field="time" editing={false} control="time" timeSegment="minute" error={null} theme="green" width={90} height={20}/></DisplayContext.Provider>).lastFrame() ?? '';
    const weekdays = render(<DisplayContext.Provider value={display}><AlarmEditorScreen draft={draft} field="weekdays" editing={false} control="weekdays" weekdayIndex={2} error={null} theme="green" width={90} height={20}/></DisplayContext.Provider>).lastFrame() ?? '';
    const volume = render(<DisplayContext.Provider value={display}><AlarmEditorScreen draft={draft} field="volume" editing={false} control="number" error={null} theme="green" width={90} height={20}/></DisplayContext.Provider>).lastFrame() ?? '';
    expect(time).toContain('Time:'); expect(time).not.toContain('[30]'); expect(time).toContain('chooses hour');
    expect(weekdays).toContain('● Monday'); expect(weekdays).toContain('› ● Wednesday'); expect(weekdays).toContain('○ Saturday');
    expect(volume).toContain('[███████···]'); expect(volume).toContain('raises/unmutes');
  });

  it('scrolls the weekday checklist viewport to keep Sunday visible',()=>{const draft=defaultAlarmDraft(station);const frame=render(<DisplayContext.Provider value={display}><AlarmEditorScreen draft={draft} field="weekdays" editing={false} control="weekdays" weekdayIndex={6} error={null} theme="green" width={55} height={11}/></DisplayContext.Provider>).lastFrame()??'';expect(frame).toContain('› ○ Sunday');expect(frame).not.toContain('Monday');});

  it('deduplicates picker sources and includes None only for fallback', () => {
    const choices = alarmPickerChoices([alarm], [station], [station], [{station}], station, true);
    expect(choices.map(choice => choice.station?.name ?? 'None')).toEqual(['None', 'KEXP 90.3 FM']);
    const frame = render(<DisplayContext.Provider value={display}><AlarmPickerScreen choices={choices} selected={0} fallback theme="green" width={60} height={12} /></DisplayContext.Provider>).lastFrame() ?? '';
    expect(frame).toContain('Fallback station'); expect(frame).toContain('None');
  });

  it('renders keep-playing and fixed snooze as the two primary alarm actions', () => {
    const frame = render(<DisplayContext.Provider value={display}><AlarmRingingScreen sessions={[{key: 'one', status: {alarmId: 'morning', scheduledAt: new Date('2026-09-01T22:48:00.000Z').toISOString(), stationName: 'KEXP', startedAt: new Date().toISOString(), state: 'playing'}, dismiss: vi.fn(), snooze: vi.fn(), keepPlaying: vi.fn()}]} alarms={[alarm]} selected={0} snoozeMinutes={15} theme="green" width={70} height={18} /></DisplayContext.Provider>).lastFrame() ?? '';
    expect(frame).toContain('ALARM ACTIVE'); expect(frame).toContain('Morning radio'); expect(frame).toContain('SPACE  SNOOZE 15 MIN'); expect(frame).toContain('ENTER  KEEP PLAYING'); expect(frame).toContain('Enter opens Playing');expect(frame).not.toContain('[ / ]');expect(frame).not.toContain('█');
  });

  it.each([{width: 90, height: 22}, {width: 48, height: 10}, {width: 26, height: 7}])('bounds editor, picker, and ringing at $width x $height', ({width, height}) => {
    const active = {key: 'one', status: {alarmId: 'morning', scheduledAt: new Date().toISOString(), stationName: 'KEXP', startedAt: new Date().toISOString(), state: 'playing' as const}, dismiss: vi.fn(), snooze: vi.fn(), keepPlaying: vi.fn()};
    const choices = alarmPickerChoices([alarm], [station], [], [], station, true);
    const frames = [
      render(<DisplayContext.Provider value={display}><AlarmEditorScreen draft={defaultAlarmDraft(station)} field="keepAwakeUntilAlarm" editing={false} error={null} theme="green" width={width} height={height} /></DisplayContext.Provider>).lastFrame() ?? '',
      render(<DisplayContext.Provider value={display}><AlarmPickerScreen choices={choices} selected={0} fallback theme="green" width={width} height={height} /></DisplayContext.Provider>).lastFrame() ?? '',
      render(<DisplayContext.Provider value={display}><AlarmRingingScreen sessions={[active]} alarms={[alarm]} selected={0} snoozeMinutes={10} theme="green" width={width} height={height} /></DisplayContext.Provider>).lastFrame() ?? ''
    ];
    for (const frame of frames) {
      const lines = frame.split('\n'); expect(lines.length).toBeLessThanOrEqual(height); expect(Math.max(...lines.map(displayWidth))).toBeLessThanOrEqual(width);
    }
  });
});
