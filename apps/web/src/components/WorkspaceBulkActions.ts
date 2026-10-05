/** Apply each selected item, retaining failures for a retry rather than losing the selection. */
export async function applyWorkspaceBulkAction<T extends { id: string; title: string }>(
  items: readonly T[],
  mutate: (item: T) => Promise<unknown>,
) {
  const completed = new Set<T["id"]>();
  const failures: string[] = [];
  for (const item of items) {
    try {
      await mutate(item);
      completed.add(item.id);
    } catch (error) {
      failures.push(
        `${item.title}: ${error instanceof Error ? error.message : "Could not update item"}`,
      );
    }
  }
  return { completed, failures };
}
