import type { TimerScheduler } from '../src/platform/timerScheduler';

/** Native scheduler used only by isolated unit tests outside an ioBroker adapter. */
export const testTimerScheduler: TimerScheduler = {
	scheduleTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	cancelTimeout: handle => clearTimeout(handle as NodeJS.Timeout | undefined),
	scheduleInterval: (callback, delayMs) => setInterval(callback, delayMs),
	cancelInterval: handle => clearInterval(handle as NodeJS.Timeout | undefined),
};
