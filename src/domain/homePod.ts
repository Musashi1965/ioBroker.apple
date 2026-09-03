import type { AppleErrorCode } from './appleTv';

/** Normalized HomePod connection lifecycle. */
export type HomePodConnectionState = 'discovered' | 'connecting' | 'online' | 'recovering' | 'unavailable';

/** Non-secret transient-pairing phase tied to one AirPlay session. */
export type HomePodPairingStatus = 'idle' | 'pairing' | 'paired' | 'error';

/** Capability-gated HomePod media transport commands. */
export type HomePodPlaybackCommand = 'play' | 'pause' | 'playPause' | 'stop' | 'next' | 'previous';

/** Writable HomePod volume operations. */
export type HomePodVolumeCommand = 'setVolume' | 'setMuted';

/** Complete HomePod command vocabulary used for result projection. */
export type HomePodCommand = HomePodPlaybackCommand | HomePodVolumeCommand;

/** Stable HomePod capability projection. */
export interface HomePodCapabilities {
	/** AirPlay media remote commands are supported by the connected receiver. */
	playback: boolean;
	/** Push-driven Now Playing state is available. */
	nowPlaying: boolean;
	/** Absolute volume and mute state/control are currently available. */
	volume: boolean;
}

/** Normalized HomePod state without protocol package types. */
export interface HomePodSnapshot {
	/** Current title, or empty when unavailable. */
	title: string;
	/** Current artist, or empty when unavailable. */
	artist: string;
	/** Current album, or empty when unavailable. */
	album: string;
	/** Duration in seconds. */
	duration: number;
	/** Elapsed position in seconds. */
	position: number;
	/** Whether the active player is playing. */
	isPlaying: boolean;
	/** Whether volume state is currently available. */
	volumeAvailable: boolean;
	/** Normalized volume percent. */
	volume: number;
	/** Current mute state. */
	muted: boolean;
	/** Current normalized capabilities. */
	capabilities: HomePodCapabilities;
}

/** HomePod connection and transient-pairing state. */
export interface HomePodConnectionStatus {
	/** Normalized connection state. */
	state: HomePodConnectionState;
	/** Whether the transient AirPlay session is usable. */
	online: boolean;
	/** Current non-secret transient-pairing phase. */
	pairing: HomePodPairingStatus;
	/** Optional stable error code. */
	error?: AppleErrorCode;
}

/** Creates deterministic safe state before or after a transient session. */
export function emptyHomePodSnapshot(): HomePodSnapshot {
	return {
		title: '',
		artist: '',
		album: '',
		duration: 0,
		position: 0,
		isPlaying: false,
		volumeAvailable: false,
		volume: 0,
		muted: false,
		capabilities: { playback: false, nowPlaying: false, volume: false },
	};
}
