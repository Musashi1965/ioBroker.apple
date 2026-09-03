import { moduleFederationShared } from '@iobroker/gui-components/modulefederation.admin.config';
import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import commonjs from 'vite-plugin-commonjs';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(sourceDirectory, '../package.json'), 'utf8'));

export default {
	root: sourceDirectory,
	plugins: [
		federation({
			dts: false,
			manifest: true,
			name: 'AppleAdminComponents',
			filename: 'customComponents.js',
			exposes: {
				'./Components': resolve(sourceDirectory, 'src/Components.tsx'),
			},
			remotes: {},
			shared: moduleFederationShared(packageJson),
		}),
		react(),
		commonjs(),
	],
	resolve: {
		tsconfigPaths: true,
	},
	base: './',
	build: {
		target: 'chrome89',
		outDir: resolve(sourceDirectory, '../admin/custom'),
		emptyOutDir: true,
	},
};
