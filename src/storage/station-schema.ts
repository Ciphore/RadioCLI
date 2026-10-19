import {z} from 'zod';
import type {Station} from '../types.js';

export const stationSchema: z.ZodType<Station> = z
  .object({
    id: z.string(),
    legacyIds: z.array(z.string()).optional(),
    provider: z.enum(['radio-browser', 'radio-garden', 'playlist']),
    name: z.string(),
    country: z.string().optional(),
    countryCode: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
    language: z.string().optional(),
    languageCodes: z.array(z.string()).optional(),
    tags: z.array(z.string()),
    codec: z.string().optional(),
    bitrate: z.number().optional(),
    homepage: z.string().optional(),
    favicon: z.string().optional(),
    streamUrl: z.string().optional(),
    clickCount: z.number().optional(),
    votes: z.number().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    distanceKm: z.number().optional(),
    hls: z.boolean().optional(),
    lastCheckedOk: z.boolean().optional()
});
