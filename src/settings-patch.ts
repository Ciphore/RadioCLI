/** Optional fields crossing structured-clone transports remain undefined.
 * Treat them exactly like omitted JSON properties at partial-update boundaries. */
export function definedFields<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}
