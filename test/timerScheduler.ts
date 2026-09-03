import type { TimerScheduler } from '../src/platform/timerScheduler';

/** Native scheduler used only by isolated unit tests outside an ioBroker adapter. */
export const testTimerScheduler: TimerScheduler = {
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout | undefined),
	setInterval: (callback, delayMs) => setInterval(callback, delayMs),
	clearInterval: handle => clearInterval(handle as NodeJS.Timeout | undefined),
};
