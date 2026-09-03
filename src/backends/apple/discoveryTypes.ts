/** Serializable subset of one upstream DNS-SD discovery result. */
export interface AppleDiscoveryService {
	/** Upstream service-instance identifier. */
	id: string;
	/** Fully qualified service name. */
	fqdn: string;
	/** Current non-durable network address. */
	address: string;
	/** Reported hardware model. */
	modelName: string;
	/** Optional service family name. */
	familyName: string | null;
	/** DNS-SD endpoint. */
	service: {
		/** Current non-durable service port. */
		port: number;
		/** Transport protocol. */
		protocol: 'tcp' | 'udp';
		/** Complete DNS-SD service type. */
		type: string;
	};
	/** TXT-record properties used by the backend only. */
	txt: Record<string, string>;
	/** Optional bigint feature flags serialized for child-process IPC. */
	features?: string;
}

/** Untrusted low-level combined result before project-owned correlation. */
export interface CombinedAppleDiscovery {
	/** Human-readable service name used only as a display value. */
	name: string;
	/** Optional AirPlay service. */
	airplay?: AppleDiscoveryService;
	/** Optional Companion Link service. */
	companionLink?: AppleDiscoveryService;
	/** Optional RAOP service. */
	raop?: AppleDiscoveryService;
}

/** One supported Apple TV with correlated protocol services. */
export interface DiscoveredAppleTv {
	/** Stable normalized 12-character protocol identifier. */
	deviceId: string;
	/** Human-readable display name; never an identity input. */
	name: string;
	/** Reported Apple hardware model. */
	model: string;
	/** Required AirPlay service. */
	airplay: AppleDiscoveryService;
	/** Optional correlated Companion Link service. */
	companionLink?: AppleDiscoveryService;
	/** Optional correlated RAOP service. */
	raop?: AppleDiscoveryService;
}

/** One HomePod with stable identity and a usable AirPlay service. */
export interface DiscoveredHomePod {
	/** Stable normalized 12-character AirPlay device identifier. */
	deviceId: string;
	/** Human-readable display name; never an identity input. */
	name: string;
	/** Reported AudioAccessory hardware model. */
	model: string;
	/** Required current AirPlay service used for transient pairing and control. */
	airplay: AppleDiscoveryService;
	/** Optional correlated RAOP service advertised by the same physical device. */
	raop?: AppleDiscoveryService;
}

/** One generic AirPlay receiver with durable protocol identity. */
export interface DiscoveredAirPlayReceiver {
	/** Stable normalized 12-character AirPlay or RAOP device identifier. */
	deviceId: string;
	/** Human-readable display name; never an identity input. */
	name: string;
	/** Reported hardware model, or an empty string when unavailable. */
	model: string;
	/** Optional currently advertised AirPlay service. */
	airplay?: AppleDiscoveryService;
	/** Optional currently advertised RAOP service. */
	raop?: AppleDiscoveryService;
}

/** Exclusive counts from one complete low-level Apple-device discovery scan. */
export interface AppleDeviceCounts {
	/** Recognized Apple TV services. */
	appletv: number;
	/** Recognized HomePod and HomePod mini services. */
	homepod: number;
	/** Remaining validated AirPlay or RAOP receivers. */
	airplayReceiver: number;
}

/** Device classes exposed by the exclusive project-owned discovery classifier. */
export type AppleDeviceClass = keyof AppleDeviceCounts;

/** Non-secret summary of one device observed in the latest discovery scan. */
export interface DiscoveredDeviceSummary {
	/** Scan identity used only to deduplicate and order the current snapshot. */
	identity: string;
	/** Exclusive project-owned device class. */
	deviceClass: AppleDeviceClass;
	/** Human-readable current display name. */
	name: string;
	/** Reported hardware model, or an empty string when unavailable. */
	model: string;
}

/** One bounded discovery result with controllable Apple TVs and class totals. */
export interface AppleDiscoverySnapshot {
	/** Apple TVs with sufficient stable identity for pairing and control. */
	devices: DiscoveredAppleTv[];
	/** HomePods with sufficient stable identity for transient connection and control. */
	homePods: DiscoveredHomePod[];
	/** Generic receivers with a durable AirPlay or RAOP device identifier. */
	airplayReceivers: DiscoveredAirPlayReceiver[];
	/** All recognized devices counted exclusively by class. */
	deviceCounts: AppleDeviceCounts;
	/** Redacted per-class details from the same latest scan. */
	deviceDetails: Record<AppleDeviceClass, DiscoveredDeviceSummary[]>;
}
