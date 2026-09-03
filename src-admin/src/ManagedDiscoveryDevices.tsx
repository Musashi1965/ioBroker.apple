import React from 'react';

import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutlineOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlineOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
	Alert,
	Box,
	Button,
	Chip,
	LinearProgress,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Typography,
} from '@mui/material';

import { I18n } from '@iobroker/gui-components';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

type ManagedDeviceClass = 'homepod' | 'airplayReceiver';

interface DeviceCandidate {
	deviceClass: ManagedDeviceClass;
	deviceId: string;
	name: string;
	model: string;
}

interface ManagedDevice extends DeviceCandidate {
	enabled: boolean;
	discovered: boolean;
	connected: boolean;
	connectionState: string;
}

interface ManagedDiscoveryState extends ConfigGenericState {
	candidates: DeviceCandidate[];
	managedDevices: ManagedDevice[];
	busyDeviceId?: string;
	error?: string;
	loaded: boolean;
}

const REFRESH_INTERVAL_MS = 10_000;

abstract class ManagedDiscoveryDevices extends ConfigGeneric<ConfigGenericProps, ManagedDiscoveryState> {
	protected abstract readonly deviceClass: ManagedDeviceClass;
	private refreshTimer: number | undefined;

	public constructor(props: ConfigGenericProps) {
		super(props);
		this.state = {
			...this.state,
			candidates: [],
			managedDevices: [],
			loaded: false,
		};
	}

	public async componentDidMount(): Promise<void> {
		await super.componentDidMount();
		void this.refreshData();
		this.refreshTimer = window.setInterval(() => void this.refreshData(true), REFRESH_INTERVAL_MS);
	}

	public componentWillUnmount(): void {
		if (this.refreshTimer !== undefined) {
			window.clearInterval(this.refreshTimer);
		}
		super.componentWillUnmount();
	}

	private instanceId(): string {
		return `${this.props.oContext.adapterName}.${this.props.oContext.instance}`;
	}

	private async sendCommand<T>(command: string, data: Record<string, unknown>): Promise<T> {
		const response = (await this.props.oContext.socket.sendTo(this.instanceId(), command, data)) as unknown;
		if (
			typeof response === 'object' &&
			response !== null &&
			typeof (response as { error?: unknown }).error === 'string'
		) {
			throw new Error((response as { error: string }).error);
		}
		return response as T;
	}

	private async refreshData(quiet = false): Promise<void> {
		if (!this.props.alive || this.state.busyDeviceId !== undefined) {
			return;
		}
		try {
			const data = { deviceClass: this.deviceClass };
			const [candidates, managedDevices] = await Promise.all([
				this.sendCommand<DeviceCandidate[]>('listManagedDeviceCandidates', data),
				this.sendCommand<ManagedDevice[]>('listManagedDiscoveryDevices', data),
			]);
			this.setState({ candidates, managedDevices, loaded: true, error: undefined });
		} catch (error) {
			if (!quiet) {
				this.setState({ loaded: true, error: errorCode(error) });
			}
		}
	}

	private runAction(deviceId: string, command: string, data: Record<string, unknown>): void {
		this.setState({ busyDeviceId: deviceId, error: undefined });
		void this.sendCommand(command, { ...data, deviceClass: this.deviceClass, deviceId })
			.then(() => new Promise<void>(resolve => this.setState({ busyDeviceId: undefined }, resolve)))
			.then(() => this.refreshData())
			.catch(error => this.setState({ busyDeviceId: undefined, error: errorCode(error) }));
	}

	private setEnabled(device: ManagedDevice, enabled: boolean): void {
		if (
			!enabled &&
			!window.confirm(I18n.t('Set the selected device passive and remove its ioBroker object tree?'))
		) {
			return;
		}
		this.runAction(device.deviceId, 'setManagedDiscoveryDeviceEnabled', { enabled });
	}

	private forgetDevice(device: ManagedDevice): void {
		if (
			!window.confirm(
				I18n.t(
					'Remove the selected device from local management and delete its ioBroker object tree? If it is still detected, it will return to the detected-devices list.',
				),
			)
		) {
			return;
		}
		this.runAction(device.deviceId, 'removeManagedDiscoveryDevice', {});
	}

	public renderItem(_error: unknown, disabled: boolean): React.JSX.Element {
		const unavailable = disabled || !this.props.alive;
		return (
			<Stack
				spacing={2}
				sx={{ width: '100%' }}
			>
				{!this.state.loaded ? <LinearProgress /> : null}
				{this.state.error ? (
					<Alert severity="error">{`${I18n.t('Operation failed')}: ${this.state.error}`}</Alert>
				) : null}
				<Box>
					<Stack
						direction="row"
						sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
					>
						<Typography variant="h6">{I18n.t(this.detectedTitle())}</Typography>
						<Button
							size="small"
							startIcon={<RefreshIcon />}
							disabled={unavailable || this.state.busyDeviceId !== undefined}
							onClick={() => void this.refreshData()}
						>
							{I18n.t('Refresh')}
						</Button>
					</Stack>
					<Alert
						severity="info"
						sx={{ mb: 1 }}
					>
						{I18n.t(this.discoveryHelp())}
					</Alert>
					{this.renderCandidateTable(unavailable)}
				</Box>
				<Box>
					<Typography
						variant="h6"
						sx={{ mb: 1 }}
					>
						{I18n.t(this.managedTitle())}
					</Typography>
					<Alert
						severity="info"
						sx={{ mb: 1 }}
					>
						{I18n.t(
							'Only active managed devices receive an ioBroker object tree. Passive devices remain in local management without a device tree.',
						)}
					</Alert>
					{this.renderManagedTable(unavailable)}
				</Box>
			</Stack>
		);
	}

	private renderCandidateTable(unavailable: boolean): React.JSX.Element {
		return (
			<TableContainer
				component={Paper}
				variant="outlined"
			>
				<Table size="small">
					<TableHead>
						<TableRow>
							<TableCell>{I18n.t('Name / Model')}</TableCell>
							<TableCell>{I18n.t('Management status')}</TableCell>
							<TableCell align="center">{I18n.t('Set active')}</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{this.state.candidates.length === 0 ? (
							<TableRow>
								<TableCell colSpan={3}>{I18n.t(this.noDetectedDevicesText())}</TableCell>
							</TableRow>
						) : (
							this.state.candidates.map(device => (
								<TableRow
									key={device.deviceId}
									hover
								>
									<TableCell>{deviceLabel(device)}</TableCell>
									<TableCell>
										<Chip
											size="small"
											label={I18n.t('Not managed')}
										/>
									</TableCell>
									<TableCell align="center">
										<Button
											size="small"
											variant="outlined"
											startIcon={<PlayCircleOutlineIcon />}
											disabled={unavailable || this.state.busyDeviceId !== undefined}
											onClick={() =>
												this.runAction(device.deviceId, 'manageDiscoveredDevice', {})
											}
										>
											{I18n.t('Set active')}
										</Button>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</TableContainer>
		);
	}

	private renderManagedTable(unavailable: boolean): React.JSX.Element {
		return (
			<TableContainer
				component={Paper}
				variant="outlined"
			>
				<Table size="small">
					<TableHead>
						<TableRow>
							<TableCell>{I18n.t('Name / Model')}</TableCell>
							<TableCell>{I18n.t('Management status')}</TableCell>
							<TableCell align="center">{I18n.t('Set active')}</TableCell>
							<TableCell align="center">{I18n.t('Set passive')}</TableCell>
							<TableCell align="center">{I18n.t('Delete device')}</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{this.state.managedDevices.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5}>{I18n.t(this.noManagedDevicesText())}</TableCell>
							</TableRow>
						) : (
							this.state.managedDevices.map(device => (
								<TableRow
									key={device.deviceId}
									hover
								>
									<TableCell>{deviceLabel(device)}</TableCell>
									<TableCell>{managedStatus(device)}</TableCell>
									<TableCell align="center">
										<Button
											size="small"
											variant="outlined"
											startIcon={<PlayCircleOutlineIcon />}
											disabled={
												unavailable || device.enabled || this.state.busyDeviceId !== undefined
											}
											onClick={() => this.setEnabled(device, true)}
										>
											{I18n.t('Set active')}
										</Button>
									</TableCell>
									<TableCell align="center">
										<Button
											size="small"
											variant="outlined"
											startIcon={<PauseCircleOutlineIcon />}
											disabled={
												unavailable || !device.enabled || this.state.busyDeviceId !== undefined
											}
											onClick={() => this.setEnabled(device, false)}
										>
											{I18n.t('Set passive')}
										</Button>
									</TableCell>
									<TableCell align="center">
										<Button
											size="small"
											color="error"
											startIcon={<DeleteOutlineIcon />}
											disabled={unavailable || this.state.busyDeviceId !== undefined}
											onClick={() => this.forgetDevice(device)}
										>
											{I18n.t('Delete device')}
										</Button>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</TableContainer>
		);
	}

	private detectedTitle(): string {
		return this.deviceClass === 'homepod' ? 'Detected HomePods' : 'Detected AirPlay receivers';
	}

	private managedTitle(): string {
		return this.deviceClass === 'homepod' ? 'Managed HomePods' : 'Managed AirPlay receivers';
	}

	private noDetectedDevicesText(): string {
		return this.deviceClass === 'homepod'
			? 'No unmanaged HomePods with stable identity detected'
			: 'No unmanaged AirPlay receivers with stable identity detected';
	}

	private noManagedDevicesText(): string {
		return this.deviceClass === 'homepod' ? 'No managed HomePods' : 'No managed AirPlay receivers';
	}

	private discoveryHelp(): string {
		return this.deviceClass === 'homepod'
			? 'Activate a detected HomePod to create its object tree and start automatic transient pairing. No PIN or HomePod credential is stored.'
			: 'Activate a detected AirPlay receiver to create its read-only discovery object tree. Playback and streaming are not enabled by this setting.';
	}
}

/** HomePod adoption and enablement tables. */
export class HomePodManagement extends ManagedDiscoveryDevices {
	protected readonly deviceClass = 'homepod' as const;
}

/** Generic AirPlay Receiver adoption and enablement tables. */
export class AirPlayReceiverManagement extends ManagedDiscoveryDevices {
	protected readonly deviceClass = 'airplayReceiver' as const;
}

function deviceLabel(device: Pick<DeviceCandidate, 'name' | 'model'>): React.JSX.Element {
	return (
		<Box>
			<Typography sx={{ fontWeight: 600 }}>{device.name}</Typography>
			<Typography
				variant="body2"
				color="text.secondary"
			>
				{device.model || '—'}
			</Typography>
		</Box>
	);
}

function managedStatus(device: ManagedDevice): React.JSX.Element {
	const connection = device.connected ? 'Online' : device.discovered ? 'Detected' : 'Offline';
	return (
		<Stack
			direction="row"
			spacing={1}
			sx={{ alignItems: 'center' }}
		>
			<Chip
				size="small"
				color={device.enabled ? 'success' : 'default'}
				label={I18n.t(device.enabled ? 'Active' : 'Passive')}
			/>
			<Typography variant="body2">{I18n.t(connection)}</Typography>
		</Stack>
	);
}

function errorCode(error: unknown): string {
	return error instanceof Error && error.message ? error.message : 'unavailable';
}
