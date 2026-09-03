const fs = require('node:fs');
const os = require('node:os');
const path = require('path');
const { tests } = require('@iobroker/testing');

const packageJson = require('../package.json');

/**
 * Rebuilds generated dependencies and data inside the reusable test directory.
 * @iobroker/testing otherwise calls `setup first` against database ports whose
 * in-memory servers belonged to the previous process and no longer exist. A
 * partial controller removal is not sufficient because npm may retain its lock
 * state and omit restoring the controller package.
 */
function prepareReusableHarness() {
	const [appName, adapterName] = packageJson.name.split('.');
	const testDir = path.join(os.tmpdir(), `test-${appName}.${adapterName}`);
	const npmCacheDir = path.join(testDir, '.npm-cache');

	fs.mkdirSync(npmCacheDir, { recursive: true });
	process.env.npm_config_cache = npmCacheDir;

	for (const generatedPath of [
		path.join(testDir, 'node_modules'),
		path.join(testDir, `${appName}-data`),
	]) {
		fs.rmSync(generatedPath, { recursive: true, force: true });
	}
}

prepareReusableHarness();

// Keep the integration environment reproducible. The testing package otherwise
// installs the moving "dev" tag and may run a new controller against stale data.
tests.integration(path.join(__dirname, '..'), {
	controllerVersion: '7.2.2',
});
