/**
 * useOnlineStatus — track network connectivity for the offline toast.
 *
 * Combines two signals:
 *   1. `navigator.onLine` and the window `online` / `offline` events.
 *   2. A health-check ping to /api/v1/setup/status with a 4s timeout,
 *      so we also detect "have wifi, but the backend is unreachable".
 *
 * Returns refs that are reactive — feed straight into a v-snackbar.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

export function useOnlineStatus(pollMs = 30000) {
  const online = ref<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const apiReachable = ref<boolean>(true);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function updateOnline() {
    online.value = navigator.onLine;
    if (online.value) void checkApi();
  }

  async function checkApi(): Promise<boolean> {
    if (!online.value) {
      apiReachable.value = false;
      return false;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch('/api/v1/setup/status', {
        signal: controller.signal,
        cache: 'no-store',
      });
      apiReachable.value = res.ok;
      return res.ok;
    } catch {
      apiReachable.value = false;
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  onMounted(() => {
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    void checkApi();
    pollTimer = setInterval(checkApi, pollMs);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('online', updateOnline);
    window.removeEventListener('offline', updateOnline);
    if (pollTimer) clearInterval(pollTimer);
  });

  return { online, apiReachable, checkApi };
}
