/** Opaque timer handle owned by the scheduling implementation. */
export type TimerHandle = unknown;

/** Runtime-neutral scheduling boundary for owned deadlines and intervals. */
export interface TimerScheduler {
	/** Schedules one callback after the requested delay. */
	setTimeout(callback: () => void, delayMs: number): TimerHandle;
	/** Cancels one previously scheduled timeout. */
	clearTimeout(handle: TimerHandle): void;
	/** Schedules one repeating callback. */
	setInterval(callback: () => void, delayMs: number): TimerHandle;
	/** Cancels one previously scheduled interval. */
	clearInterval(handle: TimerHandle): void;
}

interface IoBrokerTimerAdapter {
	setTimeout(callback: () => void, delayMs: number): ioBroker.Timeout | undefined;
	clearTimeout(handle: ioBroker.Timeout | undefined): void;
	setInterval(callback: () => void, delayMs: number): ioBroker.Interval | undefined;
	clearInterval(handle: ioBroker.Interval | undefined): void;
}

/**
 * Adapts ioBroker-owned timers to the runtime-neutral scheduling boundary.
 *
 * @param adapter - Active ioBroker adapter instance that owns timer cleanup.
 */
export function createIoBrokerTimerScheduler(adapter: IoBrokerTimerAdapter): TimerScheduler {
	return {
		setTimeout: (callback, delayMs) => adapter.setTimeout(callback, delayMs),
		clearTimeout: handle => adapter.clearTimeout(handle as ioBroker.Timeout | undefined),
		setInterval: (callback, delayMs) => adapter.setInterval(callback, delayMs),
		clearInterval: handle => adapter.clearInterval(handle as ioBroker.Interval | undefined),
	};
}
