export function mergeFeed<T extends { id: string; createdAt: string; version?: number }>(
   current: T[],
   incoming: T[]
): T[] {
   const items = new Map(current.map((item) => [item.id, item]));
   for (const item of incoming) {
      const previous = items.get(item.id);
      if (!previous || (item.version ?? 0) >= (previous.version ?? 0)) items.set(item.id, item);
   }
   return [...items.values()].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
   );
}
