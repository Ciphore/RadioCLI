import {useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import type {Alarm, LibraryState, Screen, Station} from '../types.js';
import type {JsonLibraryStore} from '../storage/store.js';
import {applyTextInput, clamp, isEditableInput} from './app-state.js';
import {
  adjustTime, alarmEditorFields, alarmInputFromDraft, alarmTextFields, cycleWeekdays, defaultAlarmDraft,
  draftFromAlarm, toggleWeekday, validateAlarmDraft, type AlarmDraft, type AlarmEditorControl,
  type AlarmEditorField, type TimeSegment
} from './alarm-editor.js';
import {alarmPickerChoices} from './screens/AlarmsScreen.js';
import type {AlarmRuntimeSummary, AlarmTuiService, AlarmVerificationReport, TuiActiveAlarm} from './alarm-tui-service.js';

type InkKey = {upArrow?: boolean; downArrow?: boolean; leftArrow?: boolean; rightArrow?: boolean; return?: boolean; escape?: boolean; backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean; scrollDelta?: number};
type Params = {
  service: AlarmTuiService;
  store: JsonLibraryStore;
  library: LibraryState;
  setLibrary: Dispatch<SetStateAction<LibraryState>>;
  screen: Screen;
  selected: number;
  setSelected: Dispatch<SetStateAction<number>>;
  go(screen: Screen, options?: {resetSelection?: boolean; clearMessage?: boolean}): void;
  setMessage: Dispatch<SetStateAction<string | null>>;
  playingStation: Station | null;
  previewStation(station: Station): Promise<void>;
};

export type AlarmTuiController = {
  draft: AlarmDraft | null;
  editorField: AlarmEditorField;
  editingField: boolean;
  editorControl: AlarmEditorControl;
  timeSegment: TimeSegment;
  weekdayIndex: number;
  validationError: string | null;
  saving: boolean;
  pickerChoices: ReturnType<typeof alarmPickerChoices>;
  pickerFallback: boolean;
  runtime: AlarmRuntimeSummary | null;
  verification: AlarmVerificationReport | null;
  activeAlarms: TuiActiveAlarm[];
  activeSelected: number;
  snoozeMinutes: number;
  deletingId?: string;
  busyAlarmIds: Set<string>;
  itemCount(screen: Screen): number | undefined;
  handleInput(input: string, key: InkKey): boolean;
  openForStation(station?: Station | null): void;
  openActive(): void;
};

export function useAlarmTui(params: Params): AlarmTuiController {
  const {service, store, library, setLibrary, screen, selected, setSelected, go, setMessage, playingStation, previewStation} = params;
  const [draft, setDraft] = useState<AlarmDraft | null>(null);
  const [editingField, setEditingField] = useState(false);
  const [editorControl, setEditorControl] = useState<AlarmEditorControl>(null);
  const editorControlRef = useRef<AlarmEditorControl>(null);
  const [timeSegment, setTimeSegment] = useState<TimeSegment>('hour');
  const [weekdayIndex, setWeekdayIndex] = useState(0);
  const timeSegmentRef = useRef<TimeSegment>('hour');
  const weekdayIndexRef = useRef(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [pickerFallback, setPickerFallback] = useState(false);
  const [runtime, setRuntime] = useState<AlarmRuntimeSummary | null>(null);
  const [verification,setVerification]=useState<AlarmVerificationReport|null>(null);
  const verificationRunningRef=useRef(false);
  const [activeAlarms, setActiveAlarms] = useState<TuiActiveAlarm[]>([]);
  const activeAlarmsRef=useRef<TuiActiveAlarm[]>([]);
  const [activeSelected, setActiveSelected] = useState(0);
  const snoozeMinutes = 10;
  const [deletingId, setDeletingId] = useState<string>();
  const [busyAlarmIds, setBusyAlarmIds] = useState<Set<string>>(() => new Set());
  const deletingIdRef = useRef<string | undefined>(undefined);
  const busyAlarmIdsRef = useRef(new Set<string>());
  const alarmStateRef = useRef(library.alarms); alarmStateRef.current = library.alarms;
  const returnScreenRef = useRef<Screen>('home');
  const runtimePollingRef = useRef(false);
  const runtimeDirtyRef = useRef(false);
  const activePollingRef = useRef(false);
  const activeCountRef = useRef(0);
  const activeSelectedRef = useRef(0);
  const activeSelectedKeyRef = useRef<string | undefined>(undefined);
  const pendingActiveActionsRef = useRef(new Set<string>());
  const acknowledgedActiveKeysRef = useRef(new Set<string>());
  const screenRef = useRef(screen); screenRef.current = screen;
  const alarmsRef = useRef(library.alarms); alarmsRef.current = library.alarms;

  const visibleFields = useMemo(() => alarmEditorFields.filter(field => {
    if (field === 'date') return draft?.scheduleType === 'once';
    if (field === 'weekdays') return draft?.scheduleType === 'recurring';
    return true;
  }), [draft?.scheduleType]);
  const editorField = visibleFields[clamp(selected, visibleFields.length - 1)] ?? 'label';
  const pickerChoices = useMemo(() => alarmPickerChoices(library.alarms, library.favorites, library.imported, library.recent, playingStation, pickerFallback), [library.alarms, library.favorites, library.imported, library.recent, pickerFallback, playingStation]);

  const applyActiveSessions = useCallback((discovered:TuiActiveAlarm[])=>{
      const discoveredKeys=new Set(discovered.map(session=>session.key));
      for(const key of acknowledgedActiveKeysRef.current)if(!discoveredKeys.has(key))acknowledgedActiveKeysRef.current.delete(key);
      const sessions=discovered.filter(session=>!acknowledgedActiveKeysRef.current.has(session.key));
      const preferredKey = activeSelectedKeyRef.current;
      const preferredIndex = preferredKey ? sessions.findIndex(session => session.key === preferredKey) : -1;
      const nextIndex = preferredIndex >= 0 ? preferredIndex : clamp(activeSelectedRef.current, sessions.length - 1);
      activeSelectedRef.current = nextIndex;
      setActiveSelected(nextIndex);
      activeSelectedKeyRef.current = sessions[nextIndex]?.key;
      const liveKeys = new Set(sessions.map(session => session.key));
      for (const key of pendingActiveActionsRef.current) if (!liveKeys.has(key)) pendingActiveActionsRef.current.delete(key);
      activeAlarmsRef.current=sessions;setActiveAlarms(sessions);
      if (sessions.length > 0 && activeCountRef.current === 0 && screenRef.current !== 'alarm-ringing') {
        returnScreenRef.current = screenRef.current;
        go('alarm-ringing', {resetSelection: true, clearMessage: false});
      }
      activeCountRef.current = sessions.length;
  },[go]);

  const refreshActive = useCallback(async () => {
    if (activePollingRef.current) return;
    activePollingRef.current = true;
    try {
      const sessions = await service.activeAlarms();
      applyActiveSessions(sessions);
    } catch (error) {
      setMessage(`Active alarm controls unavailable: ${messageOf(error)}`);
    } finally { activePollingRef.current = false; }
  }, [applyActiveSessions, service, setMessage]);

  const refreshRuntime = useCallback(async () => {
    if (runtimePollingRef.current) { runtimeDirtyRef.current = true; return; }
    runtimePollingRef.current = true;
    try {
      do {
        runtimeDirtyRef.current = false;
        try { setRuntime(await service.runtimeStatus(alarmsRef.current)); }
        catch (error) { setMessage(`Alarm scheduler status unavailable: ${messageOf(error)}`); }
      } while (runtimeDirtyRef.current);
    }
    finally { runtimePollingRef.current = false; }
  }, [service, setMessage]);

  useEffect(() => {
    let canceled = false;
    void (async()=>{
      try{
        // Discover playback first. Reinstalling or removing the native job that
        // launched this process can terminate the currently ringing runner.
        const sessions=await service.activeAlarms();if(canceled)return;applyActiveSessions(sessions);
        const activeIds=new Set(sessions.map(session=>session.status.alarmId));
        const alarms=store.listAlarms().filter(alarm=>!busyAlarmIdsRef.current.has(alarm.id)&&!activeIds.has(alarm.id));
        const results=await service.syncAll(alarms);if(canceled)return;
        const failures=results.filter(result=>result.error);if(failures.length)setMessage(`Alarm startup sync: ${failures.length} need repair. Open Alarms and press r.`);
        void refreshRuntime();
      }catch(error){if(!canceled)setMessage(`Alarm startup safety check failed; native jobs were left untouched: ${messageOf(error)}`);}
    })();
    const activeTimer = setInterval(() => void refreshActive(), 1_500);
    const runtimeTimer = setInterval(() => void refreshRuntime(), 10 * 60_000);
    activeTimer.unref?.(); runtimeTimer.unref?.();
    return () => { canceled = true; clearInterval(activeTimer); clearInterval(runtimeTimer); };
  }, [applyActiveSessions, refreshActive, refreshRuntime, service, setMessage, store]);

  useEffect(() => { if (screen === 'alarms') { setSelected(alarmsRef.current.length ? 1 : 0); void refreshRuntime(); } }, [refreshRuntime, screen, setSelected]);

  const openForStation = useCallback((station?: Station | null) => {
    setDraft(defaultAlarmDraft(station ?? playingStation ?? undefined));
    setEditingField(false); editorControlRef.current=null; setEditorControl(null); timeSegmentRef.current='hour'; setTimeSegment('hour'); weekdayIndexRef.current=0; setWeekdayIndex(0); setValidationError(null); setSelected(0);
    go('alarm-editor', {resetSelection: true});
  }, [go, playingStation, setSelected]);

  const syncPersisted = useCallback(async (alarm: Alarm, success: string) => {
    if(activeAlarmsRef.current.some(session=>session.status.alarmId===alarm.id)){setMessage(`${success} Current playback was left untouched; the headless runner will reconcile the saved schedule when it ends.`);return;}
    let terminalWarning:string|undefined;try{await service.prepareTerminalAccess?.();}catch(error){terminalWarning=messageOf(error);}
    try { await service.sync(alarm); setMessage(terminalWarning?`${success} Scheduled, but automatic terminal controls need attention: ${terminalWarning}`:success); }
    catch (error) { setMessage(`${success} Saved locally, but scheduling is degraded: ${messageOf(error)} Press r to repair.`); }
    await refreshRuntime();
  }, [refreshRuntime, service, setMessage]);

  const saveDraft = useCallback(() => {
    if (!draft || savingRef.current) return;
    const error = validateAlarmDraft(draft);
    if (error) { setValidationError(error); setMessage(error); return; }
    savingRef.current = true; setSaving(true);
    try {
      const input = alarmInputFromDraft(draft);
      const alarm = draft.id ? store.updateAlarm(draft.id, input) : store.addAlarm(input);
      setLibrary(store.snapshot());
      setValidationError(null);
      go('alarms', {resetSelection: true, clearMessage: false});
      // Keep the guard set through any buffered input from this render, then let a
      // newly opened editor save independently while native reconciliation continues.
      queueMicrotask(() => { savingRef.current = false; setSaving(false); });
      void syncPersisted(alarm, `${draft.id ? 'Alarm updated.' : 'Alarm created.'}`);
      return;
    } catch (error) { const text = messageOf(error); setValidationError(text); setMessage(text); }
    savingRef.current = false; setSaving(false);
  }, [draft, go, setLibrary, setMessage, store, syncPersisted]);

  const editSelected = useCallback(() => {
    const alarm = alarmStateRef.current[selected - 1]; if (!alarm) return;
    setDraft(draftFromAlarm(alarm)); setEditingField(false); editorControlRef.current=null; setEditorControl(null); timeSegmentRef.current='hour'; setTimeSegment('hour'); weekdayIndexRef.current=0; setWeekdayIndex(0); setValidationError(null); setSelected(0); go('alarm-editor', {resetSelection: true});
  }, [go, library.alarms, selected, setSelected]);

  const runVerification=useCallback(()=>{
    if(verificationRunningRef.current)return;
    if(!service.verifySetup){setMessage('Alarm setup verification is unavailable in this build.');return;}
    const candidates=store.listAlarms();const alarm=candidates.find(item=>item.enabled)??candidates[0];
    verificationRunningRef.current=true;
    const initial:AlarmVerificationReport={state:'running',alarmLabel:alarm?.label,startedAt:new Date().toISOString(),steps:[]};setVerification(initial);setMessage('Verifying the complete alarm path. A short audible sample and terminal window are expected.');
    void service.verifySetup(alarm,library.settings,update=>setVerification(update)).then(report=>{setVerification(report);setMessage(report.state==='passed'?'Alarm setup verified. This machine completed every rehearsal step.':report.state==='warning'?'Alarm setup works, with limitations shown in the verification report.':'Alarm setup verification found blockers. Review the failed steps before relying on it.');}).catch(error=>{setVerification(current=>({...current??initial,state:'failed',finishedAt:new Date().toISOString(),steps:[...(current?.steps??[]),{id:'internal',label:'Verification runner',state:'failed',detail:messageOf(error),critical:true}]}));setMessage(`Alarm setup verification failed: ${messageOf(error)}`);}).finally(()=>{verificationRunningRef.current=false;void refreshRuntime();});
  },[library.settings,refreshRuntime,service,setMessage,store]);

  const handleInput = useCallback((input: string, key: InkKey): boolean => {
    if (!['alarms', 'alarm-editor', 'alarm-picker', 'alarm-ringing'].includes(screen)) return false;
    if (key.scrollDelta) {
      if (screen === 'alarm-editor') {
        if (editorControlRef.current==='weekdays'){const index=clamp(weekdayIndexRef.current+key.scrollDelta,6);weekdayIndexRef.current=index;setWeekdayIndex(index);return true;}
        if (editingField || editorControlRef.current) return true;
        setSelected(value => clamp(value + key.scrollDelta!, visibleFields.length - 1));
      } else if (screen === 'alarm-ringing') {
        const index=clamp(activeSelectedRef.current + key.scrollDelta, activeAlarms.length - 1);activeSelectedRef.current=index;activeSelectedKeyRef.current=activeAlarms[index]?.key;setActiveSelected(index);
      } else {
        const maximum=screen === 'alarms' ? alarmStateRef.current.length + 1 : pickerChoices.length - 1;
        setSelected(value => clamp(value + key.scrollDelta!, maximum));
      }
      return true;
    }
    if (screen === 'alarms') {
      if(verification){
        if(verificationRunningRef.current){if(input||key.escape||key.return||key.leftArrow||key.rightArrow)setMessage('Verification is still running; RadioCLI will return after cleanup finishes.');return true;}
        if(input==='b'||key.escape||key.return){setVerification(null);setSelected(alarmStateRef.current.length+1);return true;}
        return false;
      }
      const verifyIndex=alarmStateRef.current.length+1;
      const alarm = alarmStateRef.current[selected - 1];
      const alarmIsActive=Boolean(alarm&&activeAlarmsRef.current.some(session=>session.status.alarmId===alarm.id));
      if (input === 'n') { openForStation(); return true; }
      if (key.return && selected === 0) { openForStation(); return true; }
      if (key.return && selected === verifyIndex) { runVerification(); return true; }
      if (alarm && busyAlarmIdsRef.current.has(alarm.id)) {
        if (key.downArrow || input === 'j') { setSelected(value => clamp(value + 1, alarmStateRef.current.length + 1)); return true; }
        if (key.upArrow || input === 'k' || input === 'p') { setSelected(value => clamp(value - 1, alarmStateRef.current.length + 1)); return true; }
        if (input === 'b' || key.escape) { go('home'); return true; }
        if (key.return || ['e',' ','x','t','g'].includes(input)) { setMessage(`Cleanup is still running for ${alarm.label}.`); return true; }
      }
      if ((key.return || input === 'e') && alarm) { editSelected(); return true; }
      if (input === ' ' && alarm) { const updated = store.toggleAlarm(alarm.id); const snapshot = store.snapshot(); alarmStateRef.current = snapshot.alarms; setLibrary(snapshot); void syncPersisted(updated, `${updated.enabled ? 'Enabled' : 'Disabled'} ${updated.label}.`); return true; }
      if (input === 'x' && alarm) {
        if(alarmIsActive){setMessage(`Dismiss or snooze ${alarm.label} before deleting it; current playback was left untouched.`);return true;}
        if (deletingIdRef.current !== alarm.id) { deletingIdRef.current = alarm.id; setDeletingId(alarm.id); setMessage(`Press x again to delete “${alarm.label}”.`); return true; }
        deletingIdRef.current = undefined; setDeletingId(undefined); busyAlarmIdsRef.current.add(alarm.id); setBusyAlarmIds(new Set(busyAlarmIdsRef.current));
        void service.remove(alarm).then(() => {
          if (store.getAlarm(alarm.id)) store.removeAlarm(alarm.id); const snapshot = store.snapshot(); alarmStateRef.current = snapshot.alarms; setLibrary(snapshot); setSelected(value => clamp(value, snapshot.alarms.length + 1)); setMessage(`Deleted ${alarm.label}.`);
        }).catch(error => {
          const existing = store.getAlarm(alarm.id);
          if (existing) { const disabled = store.toggleAlarm(alarm.id, false); const snapshot = store.snapshot(); alarmStateRef.current = snapshot.alarms; setLibrary(snapshot); setMessage(`Delete cleanup failed; ${disabled.label} was kept disabled so Repair can retry: ${messageOf(error)}`); }
          else setMessage(`Delete cleanup failed after the local alarm disappeared: ${messageOf(error)}`);
        }).finally(() => { busyAlarmIdsRef.current.delete(alarm.id); setBusyAlarmIds(new Set(busyAlarmIdsRef.current)); void refreshRuntime(); }); return true;
      }
      if (input !== 'x') { deletingIdRef.current = undefined; setDeletingId(undefined); }
      if (input === 't' && alarm) { void previewStation(alarm.station).then(() => setMessage(`Test-tuning ${alarm.station.name}; no alarm state changed.`)).catch(error => setMessage(`Test tune failed: ${messageOf(error)}`)); return true; }
      if (input === 'r') { const activeIds=new Set(activeAlarmsRef.current.map(session=>session.status.alarmId));const repairable = store.listAlarms().filter(item => !busyAlarmIdsRef.current.has(item.id)&&!activeIds.has(item.id)); void (async()=>{let terminalWarning:string|undefined;try{await service.prepareTerminalAccess?.();}catch(error){terminalWarning=messageOf(error);}try{const results=await service.syncAll(repairable);const failed=results.filter(item=>item.error);setMessage(failed.length?`${failed.length} alarms still degraded: ${failed[0]!.error}`:terminalWarning?`Native jobs repaired, but automatic terminal controls need attention: ${terminalWarning}`:activeIds.size?'Inactive alarms repaired; currently playing alarms were left untouched.':'All alarms repaired and synchronized.');void refreshRuntime();}catch(error){setMessage(`Alarm repair failed: ${messageOf(error)}`);}})(); return true; }
      if (input === 'g' && alarm) { const updated = store.updateAlarm(alarm.id, {reliability: {...alarm.reliability, keepAwakeUntilAlarm: !alarm.reliability.keepAwakeUntilAlarm}}); const snapshot = store.snapshot(); alarmStateRef.current = snapshot.alarms; setLibrary(snapshot); void syncPersisted(updated, `Alarm Guard ${updated.reliability.keepAwakeUntilAlarm ? 'on' : 'off'} for ${alarm.label}.`); return true; }
      if (input === 'b' || key.escape) { go('home'); return true; }
      if (key.downArrow || input === 'j') { setSelected(value => clamp(value + 1, library.alarms.length + 1)); return true; }
      if (key.upArrow || input === 'k' || input === 'p') { setSelected(value => clamp(value - 1, library.alarms.length + 1)); return true; }
      return false;
    }
    if (screen === 'alarm-picker') {
      if (key.escape || input === 'b') { go('alarm-editor', {clearMessage: false}); setSelected(visibleFields.indexOf(pickerFallback ? 'fallbackStation' : 'station')); return true; }
      if (key.downArrow || input === 'j') { setSelected(value => clamp(value + 1, pickerChoices.length - 1)); return true; }
      if (key.upArrow || input === 'k') { setSelected(value => clamp(value - 1, pickerChoices.length - 1)); return true; }
      if (key.return) { const choice = pickerChoices[selected]; if (choice && draft) setDraft({...draft, [pickerFallback ? 'fallbackStation' : 'station']: choice.station}); go('alarm-editor', {clearMessage: false}); setSelected(visibleFields.indexOf(pickerFallback ? 'fallbackStation' : 'station')); return true; }
      return false;
    }
    if (screen === 'alarm-ringing') {
      if (input === 'b' || key.escape) { go(returnScreenRef.current === 'alarm-ringing' ? 'home' : returnScreenRef.current); return true; }
      if (key.downArrow || input === 'j') { const index=clamp(activeSelectedRef.current + 1, activeAlarms.length - 1);activeSelectedRef.current=index;activeSelectedKeyRef.current=activeAlarms[index]?.key;setActiveSelected(index); return true; }
      if (key.upArrow) { const index=clamp(activeSelectedRef.current - 1, activeAlarms.length - 1);activeSelectedRef.current=index;activeSelectedKeyRef.current=activeAlarms[index]?.key;setActiveSelected(index); return true; }
      const active = activeAlarms[activeSelectedRef.current]; if (!active) return false;
      if(key.return){
        if(active.status.state==='starting'){setMessage(`Still preparing ${active.status.stationName}; handoff will be available once playback starts.`);return true;}
        if(pendingActiveActionsRef.current.has(active.key)){setMessage(`An alarm control request is already pending for ${active.status.stationName}.`);return true;}
        const station=active.status.station??store.getAlarm(active.status.alarmId)?.station;
        if(!station){setMessage('This older alarm session cannot transfer into interactive playback. Snooze it or return to the app.');return true;}
        pendingActiveActionsRef.current.add(active.key);
        void (async()=>{
          try{
            await previewStation(station);
            if(active.handoff)await active.handoff();else await active.dismiss();
            acknowledgedActiveKeysRef.current.add(active.key);
            const remaining=activeAlarmsRef.current.filter(session=>session.key!==active.key);activeAlarmsRef.current=remaining;setActiveAlarms(remaining);activeCountRef.current=remaining.length;activeSelectedRef.current=0;activeSelectedKeyRef.current=remaining[0]?.key;setActiveSelected(0);
            setMessage(null);go('now-playing',{resetSelection:true,clearMessage:false});
          }catch(error){setMessage(`Playback handoff failed; the alarm is still available: ${messageOf(error)}`);}
          finally{pendingActiveActionsRef.current.delete(active.key);}
        })();
        return true;
      }
      const actionKind = input === ' ' ? 'snooze' : null;
      if (actionKind && pendingActiveActionsRef.current.has(active.key)) { setMessage(`An alarm control request is already pending for ${active.status.stationName}.`); return true; }
      const action = actionKind === 'snooze' ? active.snooze(snoozeMinutes) : null;
      if (action) { pendingActiveActionsRef.current.add(active.key);void action.then(() => { setMessage(`Snoozed ${snoozeMinutes} minutes; it will ring again at ${formatSnoozeTime(snoozeMinutes)}.`);const remaining=activeAlarmsRef.current.filter(session=>session.key!==active.key);activeAlarmsRef.current=remaining;setActiveAlarms(remaining);activeCountRef.current=remaining.length;activeSelectedRef.current=0;activeSelectedKeyRef.current=remaining[0]?.key;setActiveSelected(0);if(remaining.length===0)go('alarms',{resetSelection:true,clearMessage:false}); }).catch(error => {pendingActiveActionsRef.current.delete(active.key);setMessage(`Alarm control failed: ${messageOf(error)}`);}); return true; }
      return false;
    }
    if (!draft) { go('alarms'); return true; }
    if ((key.ctrl || key.meta) && input.toLowerCase() === 's') { void saveDraft(); return true; }
    if (editorControlRef.current === 'time') {
      if (key.escape || input === 'b') { editorControlRef.current=null;setEditorControl(null); return true; }
      if (key.return) {
        if (timeSegmentRef.current === 'hour') { timeSegmentRef.current='minute';setTimeSegment('minute'); }
        else { editorControlRef.current=null;setEditorControl(null); }
        return true;
      }
      if (key.leftArrow) { timeSegmentRef.current='hour'; setTimeSegment('hour'); return true; }
      if (key.rightArrow) { timeSegmentRef.current='minute'; setTimeSegment('minute'); return true; }
      if (key.upArrow || key.downArrow || input === 'j' || input === 'k') {
        const direction: 1 | -1 = key.upArrow || input === 'k' ? 1 : -1;
        setDraft(value => value ? {...value, time: adjustTime(value.time, timeSegmentRef.current, direction)} : value); return true;
      }
      return true;
    }
    if (editorControlRef.current === 'weekdays') {
      if (key.escape || key.leftArrow || input === 'b') { editorControlRef.current=null;setEditorControl(null); return true; }
      if (key.return) { editorControlRef.current=null;setEditorControl(null); return true; }
      if (key.downArrow || input === 'j') { const next=clamp(weekdayIndexRef.current + 1, 6);weekdayIndexRef.current=next;setWeekdayIndex(next); return true; }
      if (key.upArrow || input === 'k') { const next=clamp(weekdayIndexRef.current - 1, 6);weekdayIndexRef.current=next;setWeekdayIndex(next); return true; }
      if (input === ' ') { setDraft(value => value ? {...value, weekdays: toggleWeekday(value.weekdays, (weekdayIndexRef.current + 1) as 1|2|3|4|5|6|7)} : value); return true; }
      return true;
    }
    if (editorControlRef.current === 'number') {
      if (key.escape || key.return || input === 'b') { editorControlRef.current=null;setEditorControl(null); return true; }
      if (key.leftArrow || key.downArrow || input === 'j') { adjustDraft(editorField, -1, setDraft); return true; }
      if (key.rightArrow || key.upArrow || input === 'k') { adjustDraft(editorField, 1, setDraft); return true; }
      return true;
    }
    if (editingField) {
      if (key.return) { setEditingField(false); setValidationError(validateAlarmDraft(draft)); return true; }
      if (key.escape) { setEditingField(false); return true; }
      if (alarmTextFields.has(editorField) && isEditableInput(input, key as never)) {
        setDraft(value => value ? {...value, [editorField]: applyTextInput(textFieldValue(value, editorField), input, key as never)} : value);
      }
      return true;
    }
    if (key.escape || input === 'b') { go('alarms'); return true; }
    if (key.downArrow || input === 'j') { editorControlRef.current=null;setEditorControl(null); setSelected(value => clamp(value + 1, visibleFields.length - 1)); return true; }
    if (key.upArrow || input === 'k') { editorControlRef.current=null;setEditorControl(null); setSelected(value => clamp(value - 1, visibleFields.length - 1)); return true; }
    if (key.leftArrow || key.rightArrow) {
      if (editorField === 'time') { const segment=key.leftArrow ? 'hour' : 'minute';timeSegmentRef.current=segment;setTimeSegment(segment);editorControlRef.current='time';setEditorControl('time'); }
      else adjustDraft(editorField, key.rightArrow ? 1 : -1, setDraft);
      return true;
    }
    if (key.return) {
      if (alarmTextFields.has(editorField)) setEditingField(true);
      else if (editorField === 'time') {editorControlRef.current='time';setEditorControl('time');}
      else if (editorField === 'weekdays') {editorControlRef.current='weekdays';setEditorControl('weekdays');}
      else if (numericEditorFields.has(editorField)) {editorControlRef.current='number';setEditorControl('number');}
      else if (editorField === 'station' || editorField === 'fallbackStation') { setPickerFallback(editorField === 'fallbackStation'); setSelected(0); go('alarm-picker', {resetSelection: true, clearMessage: false}); }
      else if (editorField === 'preview' && draft.station) void previewStation(draft.station).then(() => setMessage(`Test-tuning ${draft.station!.name}; no alarm state changed.`)).catch(error => setMessage(`Test tune failed: ${messageOf(error)}`));
      else if (editorField === 'save') void saveDraft();
      else if (editorField === 'cancel') go('alarms');
      else adjustDraft(editorField, 1, setDraft);
      return true;
    }
    return false;
  }, [activeAlarms, deletingId, draft, editSelected, editingField, editorControl, editorField, go, library.alarms, openForStation, pickerChoices, pickerFallback, previewStation, refreshActive, refreshRuntime, runVerification, saveDraft, screen, selected, service, setLibrary, setMessage, setSelected, snoozeMinutes, store, syncPersisted, timeSegment, verification, visibleFields, weekdayIndex]);

  const openActive = useCallback(() => {
    if (!activeAlarms.length) { setMessage('No alarm is currently playing.'); return; }
    if (screenRef.current !== 'alarm-ringing') returnScreenRef.current = screenRef.current;
    activeSelectedRef.current=0;activeSelectedKeyRef.current=activeAlarms[0]?.key;setActiveSelected(0); go('alarm-ringing', {resetSelection: true, clearMessage: false});
  }, [activeAlarms, go, setMessage]);

  return {draft, editorField, editingField, editorControl, timeSegment, weekdayIndex, validationError, saving, pickerChoices, pickerFallback, runtime, verification, activeAlarms, activeSelected, snoozeMinutes, deletingId, busyAlarmIds, itemCount(current) { if (current === 'alarms') return library.alarms.length + 2; if (current === 'alarm-editor') return visibleFields.length; if (current === 'alarm-picker') return pickerChoices.length; if (current === 'alarm-ringing') return activeAlarms.length; return undefined; }, handleInput, openForStation, openActive};
}

const numericEditorFields = new Set<AlarmEditorField>(['volume', 'fadeSeconds', 'stopAfterMinutes', 'missedRunGraceMinutes']);

function adjustDraft(field: AlarmEditorField, direction: 1 | -1, setDraft: Dispatch<SetStateAction<AlarmDraft | null>>): void {
  setDraft(draft => {
    if (!draft) return draft;
    if (field === 'enabled' || field === 'wakeIfSupported' || field === 'keepAwakeUntilAlarm') return {...draft, [field]: !draft[field]};
    if (field === 'scheduleType') return {...draft, scheduleType: draft.scheduleType === 'once' ? 'recurring' : 'once'};
    if (field === 'weekdays') return {...draft, weekdays: cycleWeekdays(draft.weekdays, direction)};
    if (field === 'volume') return {...draft, volume: String(clamp(Number(draft.volume) + direction * 5, 100))};
    if (field === 'fadeSeconds') return {...draft, fadeSeconds: String(clamp(Number(draft.fadeSeconds) + direction * 5, 3600))};
    if (field === 'stopAfterMinutes') return {...draft, stopAfterMinutes: String(clamp(Number(draft.stopAfterMinutes) + direction * 5, 10080))};
    if (field === 'missedRunGraceMinutes') return {...draft, missedRunGraceMinutes: String(clamp(Number(draft.missedRunGraceMinutes) + direction * 5, 10080))};
    return draft;
  });
}
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function formatSnoozeTime(minutes:number):string{return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(Date.now()+minutes*60_000));}
function textFieldValue(draft: AlarmDraft, field: AlarmEditorField): string {
  if (field === 'label' || field === 'date' || field === 'time' || field === 'weekdays' || field === 'timezone' || field === 'volume' || field === 'fadeSeconds' || field === 'stopAfterMinutes' || field === 'missedRunGraceMinutes') return draft[field];
  return '';
}
