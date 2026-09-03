/// <reference types="mocha" />

import { expect } from 'chai';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface ConfigItem {
	type?: string;
	label?: string;
	command?: string;
	src?: string;
	text?: string;
	url?: string;
	name?: string;
	guiApi?: number;
	style?: { width?: number; height?: number };
	items?: Record<string, ConfigItem>;
}

describe('Admin JSON configuration', () => {
	it('separates general, device, and Apple Music concerns into tabs', async () => {
		const config = JSON.parse(await readFile(resolve('admin/jsonConfig.json'), 'utf8')) as ConfigItem;
		expect(config.type).to.equal('tabs');
		expect(Object.keys(config.items ?? {})).to.deep.equal(['general', 'devices', 'appleMusic']);
		expect(config.items?.general?.label).to.equal('General');
		expect(config.items?.devices?.label).to.equal('Devices');
		expect(config.items?.appleMusic?.label).to.equal('Apple Music');
	});

	it('uses the reduced logo and exposes no speculative account credentials', async () => {
		const config = JSON.parse(await readFile(resolve('admin/jsonConfig.json'), 'utf8')) as ConfigItem;
		const general = config.items?.general?.items;
		expect(general?.adapterLogo?.style).to.deep.include({ width: 128, height: 128 });
		expect(general?.discoveryInterval?.type).to.equal('number');
		expect(general?.interfaceLanguage).to.deep.include({
			type: 'custom',
			name: 'AppleAdminComponents/Components/InterfaceLanguageSelector',
			guiApi: 2,
		});
		expect(Object.values(general ?? {}).some(item => item.type === 'password')).to.equal(false);
	});

	it('provides per-class discovery summaries and dynamic management tables', async () => {
		const config = JSON.parse(await readFile(resolve('admin/jsonConfig.json'), 'utf8')) as ConfigItem;
		const devices = config.items?.devices?.items;
		expect(devices?.appleTvDiscoveryOverview?.command).to.equal('getAppleTvDiscoveryOverview');
		expect(devices?.appleTvDiscoveryHint?.text).to.equal(
			'For reliable discovery, please make sure that all devices are switched on.',
		);
		expect(devices?.homePodDiscoveryOverview?.command).to.equal('getHomePodDiscoveryOverview');
		expect(devices?.airPlayReceiverDiscoveryOverview?.command).to.equal('getAirPlayReceiverDiscoveryOverview');
		expect(devices?.appleTvManagement).to.deep.include({
			type: 'custom',
			url: 'custom/customComponents.js',
			name: 'AppleAdminComponents/Components/AppleTvManagement',
			guiApi: 2,
		});
		expect(devices?.homePodManagement).to.deep.include({
			type: 'custom',
			url: 'custom/customComponents.js',
			name: 'AppleAdminComponents/Components/HomePodManagement',
			guiApi: 2,
		});
		expect(devices?.airPlayReceiverManagement).to.deep.include({
			type: 'custom',
			url: 'custom/customComponents.js',
			name: 'AppleAdminComponents/Components/AirPlayReceiverManagement',
			guiApi: 2,
		});
		expect(
			Object.values(devices ?? {}).some(item => ['selectSendTo', 'sendTo'].includes(item.type ?? '')),
		).to.equal(false);
	});

	it('ships the custom component source and generated entry point', async () => {
		const source = await readFile(resolve('src-admin/src/AppleTvManagement.tsx'), 'utf8');
		const managedSource = await readFile(resolve('src-admin/src/ManagedDiscoveryDevices.tsx'), 'utf8');
		const languageSource = await readFile(resolve('src-admin/src/InterfaceLanguage.tsx'), 'utf8');
		const entry = await readFile(resolve('admin/custom/customComponents.js'), 'utf8');
		expect(source).to.include('CheckCircleOutlineIcon');
		expect(source).to.include('PlayCircleOutlineIcon');
		expect(source).to.include('PauseCircleOutlineIcon');
		expect(source).to.include("I18n.t('Finish pairing')");
		expect(managedSource).to.include('PlayCircleOutlineIcon');
		expect(managedSource).to.include('PauseCircleOutlineIcon');
		expect(managedSource).to.include('DeleteOutlineIcon');
		expect(languageSource).to.include('ToggleButtonGroup');
		expect(languageSource).to.include('I18n.setLanguage(value)');
		expect(source).to.include("from '@iobroker/gui-components'");
		expect(managedSource).to.include("from '@iobroker/gui-components'");
		expect(languageSource).to.include("from '@iobroker/gui-components'");
		expect(entry.length).to.be.greaterThan(100);
	});

	it('requires Admin 8 for GUI API generation 2', async () => {
		const ioPackage = JSON.parse(await readFile(resolve('io-package.json'), 'utf8')) as {
			common?: { globalDependencies?: { admin?: string }[] };
		};
		const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as {
			devDependencies?: Record<string, string>;
		};
		const federationManifest = JSON.parse(await readFile(resolve('admin/custom/mf-manifest.json'), 'utf8')) as {
			shared?: { name?: string; version?: string }[];
		};
		const sharedVersions = Object.fromEntries(
			(federationManifest.shared ?? []).map(dependency => [dependency.name, dependency.version]),
		);
		expect(ioPackage.common?.globalDependencies).to.deep.include({ admin: '>=8.0.0 <9.0.0' });
		expect(packageJson.devDependencies?.['@iobroker/gui-components']).to.equal('10.0.5');
		expect(packageJson.devDependencies).not.to.have.property('@iobroker/adapter-react-v5');
		expect(sharedVersions['@iobroker/gui-components']).to.equal('10.0.5');
		expect(sharedVersions.react).to.equal('19.2.8');
		expect(sharedVersions['@mui/material']).to.equal('9.2.0');
		expect(sharedVersions).not.to.have.property('@iobroker/adapter-react-v5');
	});
});
