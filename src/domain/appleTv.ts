/** Publicly normalized Apple TV connection lifecycle. */
export type AppleTvConnectionState =
	'discovered' | 'pairingRequired' | 'connecting' | 'online' | 'degraded' | 'recovering' | 'unavailable';

/** Stable public error vocabulary. */
export type AppleErrorCode =
	| 'not_paired'
	| 'not_discovered'
	| 'not_connected'
	| 'unsupported'
	| 'busy'
	| 'timeout'
	| 'protocol_error'
	| 'unavailable';

/** Directional and menu commands exposed below the Remote channel. */
export type AppleTvNavigationCommand = 'up' | 'down' | 'left' | 'right' | 'select' | 'menu' | 'home';

/** Media transport commands currently proven by the Apple TV backend. */
export type AppleTvPlaybackCommand = 'playPause';

/** Explicit power commands exposed below the Power channel. */
export type AppleTvPowerCommand = 'powerOn' | 'powerOff';

/** Complete writable Apple TV command vocabulary dispatched through the SDK remote controllers. */
export type AppleTvRemoteCommand = AppleTvNavigationCommand | AppleTvPlaybackCommand | AppleTvPowerCommand;

/** Capability projection independent from protocol packages. */
export interface AppleTvCapabilities {
	/** HID remote-control availability. */
	remote: boolean;
	/** Media transport availability. */
	playback: boolean;
	/** Read-only power-state availability. */
	power: boolean;
	/** Now Playing event/state availability. */
	nowPlaying: boolean;
	/** Current volume-state availability. */
	volume: boolean;
	/** App catalog and launch availability through Companion Link. */
	apps: boolean;
}

/** One normalized Apple TV app that the active backend reports as launchable. */
export interface AppleTvApp {
	/** Stable application bundle identifier. */
	bundleId: string;
	/** Current user-visible app name. */
	name: string;
}

/** Normalized scalar snapshot projected into ioBroker states. */
export interface AppleTvSnapshot {
	/** Current power/attention state. */
	powerState: string;
	/** Current title, or empty when unavailable. */
	title: string;
	/** Current artist, or empty when unavailable. */
	artist: string;
	/** Current album, or empty when unavailable. */
	album: string;
	/** Current app display name, or empty when unavailable. */
	app: string;
	/** Current app bundle identifier, or empty when unavailable. */
	appBundleId: string;
	/** Duration in seconds. */
	duration: number;
	/** Position in seconds. */
	position: number;
	/** Playback flag. */
	isPlaying: boolean;
	/** Whether volume state is currently available. */
	volumeAvailable: boolean;
	/** Normalized volume percent. */
	volume: number;
	/** Mute flag. */
	muted: boolean;
	/** Current normalized capabilities. */
	capabilities: AppleTvCapabilities;
}

/** Independent protocol health plus normalized lifecycle. */
export interface AppleTvConnectionStatus {
	/** Normalized aggregate state. */
	state: AppleTvConnectionState;
	/** Whether the target is usable. */
	online: boolean;
	/** AirPlay session health. */
	airplay: boolean;
	/** Companion Link session health. */
	companion: boolean;
	/** Optional stable error code. */
	error?: AppleErrorCode;
}

/** Creates the deterministic empty snapshot used before connection. */
export function emptyAppleTvSnapshot(): AppleTvSnapshot {
	return {
		powerState: 'unknown',
		title: '',
		artist: '',
		album: '',
		app: '',
		appBundleId: '',
		duration: 0,
		position: 0,
		isPlaying: false,
		volumeAvailable: false,
		volume: 0,
		muted: false,
		capabilities: {
			remote: false,
			playback: false,
			power: false,
			nowPlaying: false,
			volume: false,
			apps: false,
		},
	};
}
