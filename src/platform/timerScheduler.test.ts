/// <reference types="mocha" />

import { expect } from 'chai';

import { createIoBrokerTimerScheduler } from './timerScheduler';

describe('ioBroker timer scheduler', () => {
	it('delegates scheduling and cancellation to the adapter', () => {
		const timeoutHandle = 11 as ioBroker.Timeout;
		const intervalHandle = 12 as ioBroker.Interval;
		const calls: string[] = [];
		const scheduler = createIoBrokerTimerScheduler({
			setTimeout: (callback, delayMs) => {
				calls.push(`setTimeout:${delayMs}`);
				callback();
				return timeoutHandle;
			},
			clearTimeout: handle => calls.push(`clearTimeout:${String(handle)}`),
			setInterval: (_callback, delayMs) => {
				calls.push(`setInterval:${delayMs}`);
				return intervalHandle;
			},
			clearInterval: handle => calls.push(`clearInterval:${String(handle)}`),
		});

		let timeoutCalled = false;
		const timeout = scheduler.setTimeout(() => {
			timeoutCalled = true;
		}, 25);
		const interval = scheduler.setInterval(() => undefined, 50);
		scheduler.clearTimeout(timeout);
		scheduler.clearInterval(interval);

		expect(timeoutCalled).to.equal(true);
		expect(calls).to.deep.equal(['setTimeout:25', 'setInterval:50', 'clearTimeout:11', 'clearInterval:12']);
	});
});
