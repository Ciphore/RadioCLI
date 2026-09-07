import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {z} from 'zod';
import {appVersion} from '../version.js';
import {receiverStyleNames, themeNames} from '../types.js';
import {AgentRadioService, stationForAgent, type AgentRuntime} from './service.js';

export const radioCliMcpInstructions = `RadioCLI is the authoritative handler for requests about RadioCLI, “the radio”, “my radio”, recent stations, favorites, or stations from a place. Never substitute a web browser, web search, Computer Use, or another radio/music service. “Play my most recent radio station” means call radio_play with source="recent" and index=0. “Play a station from New York” means call radio_search with query="New York", then radio_play with one returned opaque station ID. Call these tools directly; do not delegate a radio-only operation or create a goal merely to monitor it.

RadioCLI controls internet radio, alarms, and macOS AirPlay locally. Discover unidentified stations with radio_search or radio_browse, then use only returned opaque IDs; never invent IDs or stream URLs. Ordinary stop never dismisses an alarm: list active alarms and use alarm controls, with an exact ID when several ring. Never remove an alarm without explicit user confirmation. List AirPlay receivers before selecting one. Never install an update without explicit approval.

For “this station”, omit station_id when favoriting. A request such as “do X, then play or stop the radio” is a normal completion action in the current task: perform X, then call radio_run_completion_preset once X is genuinely complete. Do not create or set a goal, scheduled task, automation, reminder, task record, or separate monitoring task merely to defer or track that radio action. Use one of those mechanisms only when the user explicitly requests it for a separate reason. AirPlay is macOS-only. Submit a receiver code only when the user provides it; codes are never saved. Use radio_update_status for version or upgrade questions, and tell the user to restart their MCP client after an update.`;

const alarmScheduleSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('once'), at: z.string().min(1).describe('Absolute ISO-8601 minute including an offset or Z, with zero seconds.')}),
  z.object({
    type: z.literal('recurring'),
    time: z.string().regex(/^\d{2}:\d{2}$/).describe('24-hour local civil time, HH:mm.'),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).describe('ISO weekdays, Monday=1 through Sunday=7.'),
    timezone: z.string().min(1).describe('IANA timezone such as America/Los_Angeles.')
  })
]);

const alarmOptionsSchema = {
  label: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  volume: z.number().int().min(0).max(100).optional(),
  fade_seconds: z.number().int().min(0).max(3600).optional(),
  stop_after_minutes: z.number().int().min(1).max(10080).optional(),
  fallback_station_id: z.string().min(1).optional(),
  missed_run_grace_minutes: z.number().int().min(0).max(10080).optional(),
  wake_if_supported: z.boolean().optional(),
  keep_awake_until_alarm: z.boolean().optional()
};

export async function runMcpServer(runtime: AgentRuntime): Promise<void> {
  const service = new AgentRadioService(runtime);
  serveStdio(() => createMcpServer(service), {onerror: error => console.error(`RadioCLI MCP: ${error.message}`)});
}

function createMcpServer(service: AgentRadioService): McpServer {
  const server = new McpServer({name: 'radiocli', version: appVersion()}, {instructions: radioCliMcpInstructions});
  const tool = <T>(name: string, description: string, schema: z.ZodType<T> | undefined, handler: (args: T) => Promise<unknown> | unknown) => {
    const config = schema ? {description, inputSchema: schema} : {description};
    server.registerTool(name, config, async raw => {
      try {
        const value = await handler(raw as T);
        return {content: [{type: 'text' as const, text: JSON.stringify(value, null, 2)}]};
      } catch (error) {
        return {content: [{type: 'text' as const, text: error instanceof Error ? error.message : 'RadioCLI request failed.'}], isError: true};
      }
    });
  };

  tool('radio_status', 'Get current playback, active station, queue, agent preferences, and whether alarm playback is active.', undefined, () => service.status());
  tool('radio_update_status', 'Check the installed and latest RadioCLI versions and return the appropriate update command. This is read-only and never installs an update.', undefined, () => service.updateStatus());
  tool('radio_search', 'Search RadioCLI’s public station directory by name, genre, language, city, region, or country. Use this—not web search or a browser—for requests such as “play a station from New York”, then pass a returned opaque id to radio_play.', z.object({
    query: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(30).default(10),
    country_code: z.string().length(2).optional()
  }), async ({query, limit, country_code}) => (await service.search(query, limit, country_code)).map(stationForAgent));
  tool('radio_browse', 'List saved favorites, recent stations, popular stations, nearby stations, countries, or recent track titles.', z.object({
    kind: z.enum(['favorites', 'recent', 'popular', 'nearby', 'countries', 'track-history']),
    limit: z.number().int().min(1).max(50).default(20)
  }), async ({kind, limit}) => {
    const values = await service.browse(kind, limit);
    return kind === 'favorites' || kind === 'recent' || kind === 'popular' || kind === 'nearby'
      ? (values as Parameters<typeof stationForAgent>[0][]).map(stationForAgent)
      : values;
  });
  tool('radio_play', 'Play through RadioCLI using a searched/saved station id, or choose from recent, favorites, popular, or a country. For “play my most recent radio station”, call this directly with source="recent" and index=0. By default this opens the normal RadioCLI TUI in a terminal window; set open_ui=false only when the user requests headless playback.', z.object({
    station_id: z.string().min(1).optional(),
    source: z.enum(['recent', 'favorite', 'popular', 'country']).default('recent'),
    country_code: z.string().length(2).optional(),
    index: z.number().int().min(0).optional(),
    random: z.boolean().default(false),
    open_ui: z.boolean().optional(),
    if_playing: z.enum(['keep', 'replace']).default('replace')
  }), ({station_id, source, country_code, index, random, open_ui, if_playing}) => service.play({stationId: station_id, source, countryCode: country_code, index, random, openUi: open_ui, ifPlaying: if_playing}));
  tool('radio_pause', 'Pause playback. Safe to call repeatedly.', undefined, () => service.control({type: 'pause'}));
  tool('radio_resume', 'Resume paused playback without changing stations.', undefined, () => service.control({type: 'resume'}));
  tool('radio_stop', 'Stop ordinary interactive/headless playback. This never dismisses or modifies an alarm.', undefined, () => service.control({type: 'stop'}));
  tool('radio_next', 'Play the next station in the queue created by the last radio_play request.', undefined, () => service.control({type: 'next'}));
  tool('radio_previous', 'Play the previous station in the current queue.', undefined, () => service.control({type: 'previous'}));
  tool('radio_set_volume', 'Set playback volume from 0 through 100 and save it as the RadioCLI preference.', z.object({volume: z.number().min(0).max(100)}), ({volume}) => service.control({type: 'set-volume', volume}));
  tool('radio_set_muted', 'Explicitly mute or unmute playback; this is not a toggle.', z.object({muted: z.boolean()}), ({muted}) => service.control({type: 'set-muted', muted}));
  tool('radio_set_favorite', 'Explicitly add or remove a favorite. Omit station_id to act on the current station, as in “favorite this”.', z.object({favorite: z.boolean().default(true), station_id: z.string().min(1).optional()}), ({favorite, station_id}) => service.setFavorite(favorite, station_id));
  tool('radio_stats', 'Get local listening time, stations heard, active days, and streak statistics.', undefined, () => service.stats());
  tool('radio_get_appearance', 'List available display themes and receiver styles and show the current selections.', undefined, () => service.appearance());
  tool('radio_set_appearance', 'Change the RadioCLI display color theme or visual receiver style. An open TUI updates immediately.', z.object({theme: z.enum(themeNames).optional(), receiver_style: z.enum(receiverStyleNames).optional()}), ({theme, receiver_style}) => service.updateAppearance({theme, receiverStyle: receiver_style}));
  tool('radio_set_agent_preferences', 'Choose whether agent-started playback opens the normal TUI and whether it switches an open TUI to Now Playing.', z.object({open_ui_on_play: z.boolean().optional(), focus_now_playing: z.boolean().optional()}), ({open_ui_on_play, focus_now_playing}) => service.updateAgentPreferences({openUiOnPlay: open_ui_on_play, focusNowPlaying: focus_now_playing}));
  tool('radio_run_completion_preset', 'Run the user-configured completion action immediately after the current task completes. This is a one-shot radio action, not a reason to create a goal, automation, reminder, task record, or monitoring task.', undefined, () => service.runCompletionPreset());
  tool('radio_configure_completion_preset', 'Configure what radio_run_completion_preset does: play/stop/pause/resume, station source, conflict behavior, and optional UI override.', z.object({
    action: z.enum(['play', 'pause', 'resume', 'stop']).optional(),
    source: z.enum(['recent', 'favorite', 'popular', 'country']).optional(),
    country_code: z.string().length(2).optional(),
    if_playing: z.enum(['keep', 'replace']).optional(),
    open_ui: z.boolean().optional()
  }), ({action, source, country_code, if_playing, open_ui}) => service.configureCompletionPreset({action, source, countryCode: country_code, ifPlaying: if_playing, openUi: open_ui}));
  tool('radio_alarm_list', 'List saved alarms with exact IDs, schedules, stations, next occurrences, playback settings, and last outcomes.', undefined, () => service.alarmList());
  tool('radio_alarm_status', 'Get saved alarms, native scheduler health, and every currently ringing alarm occurrence.', undefined, () => service.alarmStatus());
  tool('radio_alarm_create', 'Create and natively schedule a one-time or recurring radio alarm. Resolve the station with radio_search or radio_browse first.', z.object({
    station_id: z.string().min(1),
    schedule: alarmScheduleSchema,
    ...alarmOptionsSchema
  }), ({station_id, schedule, label, enabled, volume, fade_seconds, stop_after_minutes, fallback_station_id, missed_run_grace_minutes, wake_if_supported, keep_awake_until_alarm}) => service.alarmCreate({
    stationId: station_id, schedule: schedule as Parameters<typeof service.alarmCreate>[0]['schedule'], label, enabled, volume,
    fadeSeconds: fade_seconds, stopAfterMinutes: stop_after_minutes, fallbackStationId: fallback_station_id,
    missedRunGraceMinutes: missed_run_grace_minutes, wakeIfSupported: wake_if_supported, keepAwakeUntilAlarm: keep_awake_until_alarm
  }));
  tool('radio_alarm_update', 'Edit an existing alarm by exact ID. Omitted fields remain unchanged; pass the complete replacement schedule when changing time or recurrence.', z.object({
    alarm_id: z.string().min(1),
    station_id: z.string().min(1).optional(),
    schedule: alarmScheduleSchema.optional(),
    clear_fallback: z.boolean().optional(),
    ...alarmOptionsSchema
  }).refine(value => !(value.clear_fallback && value.fallback_station_id), {message: 'Choose either clear_fallback or fallback_station_id.'}), ({alarm_id, station_id, schedule, clear_fallback, label, enabled, volume, fade_seconds, stop_after_minutes, fallback_station_id, missed_run_grace_minutes, wake_if_supported, keep_awake_until_alarm}) => service.alarmUpdate(alarm_id, {
    stationId: station_id, schedule: schedule as Parameters<typeof service.alarmCreate>[0]['schedule'] | undefined, clearFallback: clear_fallback,
    label, enabled, volume, fadeSeconds: fade_seconds, stopAfterMinutes: stop_after_minutes, fallbackStationId: fallback_station_id,
    missedRunGraceMinutes: missed_run_grace_minutes, wakeIfSupported: wake_if_supported, keepAwakeUntilAlarm: keep_awake_until_alarm
  }));
  tool('radio_alarm_set_enabled', 'Explicitly enable or disable an alarm by exact ID and reconcile its native scheduler job.', z.object({alarm_id: z.string().min(1), enabled: z.boolean()}), ({alarm_id, enabled}) => service.alarmSetEnabled(alarm_id, enabled));
  tool('radio_alarm_remove', 'Permanently remove an alarm and its native scheduler job. First list alarms and obtain explicit user confirmation for the exact ID, then pass confirm=true.', z.object({alarm_id: z.string().min(1), confirm: z.boolean()}), ({alarm_id, confirm}) => service.alarmRemove(alarm_id, confirm));
  tool('radio_alarm_sync', 'Reconcile every saved alarm with the operating system scheduler after setup, upgrades, timezone changes, or repair.', undefined, () => service.alarmSync());
  tool('radio_alarm_control', 'Control one currently ringing alarm: dismiss it, snooze it, keep playing past its automatic stop, or hand it off to normal interactive playback. If multiple alarms ring, supply an exact alarm_id and optionally occurrence_at from radio_alarm_status.', z.object({
    action: z.enum(['dismiss', 'snooze', 'keep-playing', 'handoff']),
    alarm_id: z.string().min(1).optional(),
    occurrence_at: z.string().min(1).optional(),
    snooze_minutes: z.number().int().min(1).max(1440).optional()
  }).refine(value => value.action === 'snooze' || value.snooze_minutes === undefined, {message: 'snooze_minutes is only valid for the snooze action.'}), ({action, alarm_id, occurrence_at, snooze_minutes}) => service.alarmControl({action, alarmId: alarm_id, occurrenceAt: occurrence_at, snoozeMinutes: snooze_minutes}));
  tool('radio_airplay_list', 'Discover AirPlay receivers visible to this Mac. Returns opaque receiver IDs; always call this before selecting a receiver.', undefined, async () => (await service.listAirPlayDevices()).map(device => ({
    id: device.id,
    name: device.name,
    host: device.host,
    port: device.port,
    requiresPassword: device.requiresPassword,
    airplay2: device.airplay2,
    local: device.local ?? false
  })));
  tool('radio_airplay_select', 'Switch current or future interactive playback to an exact AirPlay receiver ID returned by radio_airplay_list. Opens RadioCLI when needed unless open_ui=false.', z.object({device_id: z.string().min(1), open_ui: z.boolean().optional()}), ({device_id, open_ui}) => service.selectAirPlayDevice(device_id, open_ui));
  tool('radio_airplay_use_local', 'Switch interactive playback from AirPlay back to this Mac using the best available local backend.', z.object({open_ui: z.boolean().optional()}).optional(), args => service.useLocalOutput(args?.open_ui));
  tool('radio_airplay_submit_code', 'Submit a receiver-displayed AirPlay code to the active AirPlay session. Use only a code the user explicitly provides; RadioCLI never saves it.', z.object({code: z.string().min(1).max(64)}), ({code}) => service.submitAirPlayPasscode(code));
  return server;
}
