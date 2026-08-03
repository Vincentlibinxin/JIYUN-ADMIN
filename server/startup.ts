export interface RetryOptions {
  retries: number;
  delayMs: number;
  backoffMs?: number;
  label?: string;
  timeoutMs?: number;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export const runWithRetry = async <T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> => {
  const { retries, delayMs, backoffMs = delayMs, label = 'operation', timeoutMs } = options;
  let attempt = 0;

  while (true) {
    try {
      if (timeoutMs) {
        return await Promise.race([
          operation(),
          sleep(timeoutMs).then(() => {
            throw new Error(`${label} timed out after ${timeoutMs}ms`);
          }),
        ]);
      }

      return await operation();
    } catch (error) {
      attempt += 1;
      if (attempt > retries) {
        throw error;
      }

      const waitMs = delayMs + (attempt - 1) * backoffMs;
      console.warn(`[API] ${label} failed (attempt ${attempt}/${retries + 1}), retrying in ${waitMs}ms`, error);
      await sleep(waitMs);
    }
  }
};
