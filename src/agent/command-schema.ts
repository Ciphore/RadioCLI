import {z} from 'zod';
import {receiverStyleNames, themeNames} from '../types.js';
import {stationSchema} from '../storage/station-schema.js';
import type {RadioSessionCommand} from './session.js';

const empty = <T extends string>(type: T) => z.strictObject({type: z.literal(type)});
const adjacent = {preservePause: z.boolean().optional(), preserveStop: z.boolean().optional()};
// A TUI list can contain many discovery pages, beyond one provider page.
const stationQueue = z.array(stationSchema).max(10_000);
const agentControl = z.strictObject({
  enabled: z.boolean(), openUiOnPlay: z.boolean(), focusNowPlaying: z.boolean(),
  completionPreset: z.strictObject({
    action: z.enum(['play', 'pause', 'resume', 'stop']), source: z.enum(['recent', 'favorite', 'popular', 'country']),
    countryCode: z.string().length(2).optional(), ifPlaying: z.enum(['keep', 'replace']), openUi: z.boolean().optional()
  })
});
const commandSchema: z.ZodType<RadioSessionCommand> = z.discriminatedUnion('type', [
  empty('status'), empty('pause'), empty('alarm-preempt'), empty('airplay-list'), empty('airplay-local'), empty('tui-cancel'), empty('tui-refresh'), empty('tui-toggle-muted'), empty('tui-toggle-pause'),
  z.strictObject({type: z.literal('tui-sleep'), until: z.number().int().nonnegative().max(8.64e15).nullable()}),
  z.strictObject({type: z.literal('tui-adjust-volume'), delta: z.number().min(-100).max(100)}),
  z.strictObject({type: z.literal('desktop-transport'), action: z.enum(['play', 'pause', 'toggle', 'stop', 'next', 'previous'])}),
  z.strictObject({type: z.literal('play'), station: stationSchema, queue: stationQueue.optional(), openNowPlaying: z.boolean().optional(), ifPlaying: z.enum(['keep', 'replace']).optional(), startPaused: z.boolean().optional()}),
  z.strictObject({type: z.literal('tui-attach'), pid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), clientId: z.string().uuid()}),
  z.strictObject({type: z.literal('tui-detach'), clientId: z.string().uuid()}),
  z.strictObject({type: z.literal('tui-select'), station: stationSchema, queue: stationQueue}),
  z.strictObject({type: z.literal('tui-output'), deviceId: z.string().min(1).max(4096).nullable()}),
  z.strictObject({type: z.literal('resume'), restartStopped: z.boolean().optional()}),
  z.strictObject({type: z.literal('stop'), retainSelection: z.boolean().optional()}),
  z.strictObject({type: z.literal('next'), ...adjacent}), z.strictObject({type: z.literal('previous'), ...adjacent}),
  z.strictObject({type: z.literal('set-volume'), volume: z.number().min(0).max(100), unmute: z.boolean().optional(), allowStopped: z.boolean().optional()}),
  z.strictObject({type: z.literal('set-muted'), muted: z.boolean(), allowStopped: z.boolean().optional()}),
  z.strictObject({type: z.literal('set-favorite'), favorite: z.boolean(), station: stationSchema.optional()}),
  z.strictObject({type: z.literal('airplay-select'), deviceId: z.string().min(1).max(4096)}),
  z.strictObject({type: z.literal('airplay-passcode'), code: z.string().min(1).max(128)}),
  z.strictObject({type: z.literal('update-settings'), settings: z.strictObject({theme: z.enum(themeNames).optional(), receiverStyle: z.enum(receiverStyleNames).optional(), agentControl: agentControl.optional()})})
]);

export function parseRadioCommand(value: unknown): RadioSessionCommand {
  const parsed = commandSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid radio command: ${parsed.error.issues.map(issue => `${issue.path.join('.') || 'command'}: ${issue.message}`).slice(0, 3).join('; ')}`);
  return parsed.data;
}

export function parseRadioRequest(value: unknown): {command: RadioSessionCommand; requestId?: string} {
  if (value && typeof value === 'object' && 'version' in value) {
    const envelope = z.strictObject({version: z.literal(2), requestId: z.string().uuid(), command: z.unknown()}).parse(value);
    return {command: parseRadioCommand(envelope.command), requestId: envelope.requestId};
  }
  return {command: parseRadioCommand(value)};
}
