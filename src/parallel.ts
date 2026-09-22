/** Bound requests, cancel siblings on failure, and settle them before returning. */
export async function parallel<T>(
  tasks: readonly T[],
  concurrency: number,
  controller: AbortController,
  run: (task: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failed = false;
  let failure: unknown;
  const worker = async () => {
    try {
      while (next < tasks.length) {
        controller.signal.throwIfAborted();
        const task = tasks[next++]!;
        await run(task);
      }
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
        controller.abort(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  if (failed) throw failure;
}
