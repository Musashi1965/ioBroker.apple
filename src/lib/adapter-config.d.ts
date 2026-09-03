// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			/** Periodic local discovery interval in seconds. */
			discoveryInterval: number;
			/** Optional instance-local Admin interface language. */
			interfaceLanguage: '' | 'de' | 'en';
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
