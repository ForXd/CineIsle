import type { LoadPolicy } from 'hls.js';

/** Current hls.js load-policy API, shared by live and on-demand engines. */
export function hlsLoadPolicy(
  retries: number,
  retryDelayMs: number,
  maxLoadTimeMs = 20_000
): LoadPolicy {
  const retry = {
    maxNumRetry: retries,
    retryDelayMs,
    maxRetryDelayMs: 8_000,
    backoff: 'exponential' as const,
  };
  return {
    default: {
      maxTimeToFirstByteMs: 10_000,
      maxLoadTimeMs,
      timeoutRetry: { ...retry },
      errorRetry: { ...retry },
    },
  };
}
