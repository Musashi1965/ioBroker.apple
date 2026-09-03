/** Opaque timer handle owned by the scheduling implementation. */
export type TimerHandle = unknown;

/** Runtime-neutral scheduling boundary for owned deadlines and intervals. */
export interface TimerScheduler {
	/** Schedules one callback after the requested delay. */
	scheduleTimeout(callback: () => void, delayMs: number): TimerHandle;
	/** Cancels one previously scheduled timeout. */
	cancelTimeout(handle: TimerHandle): void;
	/** Schedules one repeating callback. */
	scheduleInterval(callback: () => void, delayMs: number): TimerHandle;
	/** Cancels one previously scheduled interval. */
	cancelInterval(handle: TimerHandle): void;
}

interface IoBrokerTimerAdapter {
	setTimeout: (callback: () => void, delayMs: number) => ioBroker.Timeout | undefined;
	clearTimeout: (handle: ioBroker.Timeout | undefined) => void;
	setInterval: (callback: () => void, delayMs: number) => ioBroker.Interval | undefined;
	clearInterval: (handle: ioBroker.Interval | undefined) => void;
}

/**
 * Adapts ioBroker-owned timers to the runtime-neutral scheduling boundary.
 *
 * @param adapter - Active ioBroker adapter instance that owns timer cleanup.
 */
export function createIoBrokerTimerScheduler(adapter: IoBrokerTimerAdapter): TimerScheduler {
	return {
		scheduleTimeout: (callback, delayMs) => adapter.setTimeout(callback, delayMs),
		cancelTimeout: handle => adapter.clearTimeout(handle as ioBroker.Timeout | undefined),
		scheduleInterval: (callback, delayMs) => adapter.setInterval(callback, delayMs),
		cancelInterval: handle => adapter.clearInterval(handle as ioBroker.Interval | undefined),
	};
}
