import React from 'react';

import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import LinkIcon from '@mui/icons-material/Link';
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
	TextField,
	Typography,
} from '@mui/material';

import { I18n } from '@iobroker/gui-components';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

interface PairingCandidate {
	deviceId: string;
	name: string;
	model: string;
	paired: boolean;
}

interface ManagedDevice extends PairingCandidate {
	discovered: boolean;
	connected: boolean;
	appCount: number;
	enabled: boolean;
}

type PairingState = 'idle' | 'starting' | 'pinRequired' | 'completing' | 'paired' | 'error';

interface PairingStatus {
	status: PairingState;
	deviceId?: string;
	pairingError?: string;
}

interface AppleTvManagementState extends ConfigGenericState {
	candidates: PairingCandidate[];
	managedDevices: ManagedDevice[];
	pairingStatus: PairingStatus;
	pins: Record<string, string>;
	busyDeviceId?: string;
	error?: string;
	loaded: boolean;
}

const REFRESH_INTERVAL_MS = 10_000;

/** Dynamic non-secret Apple TV pairing and enablement tables for ioBroker Admin. */
export default class AppleTvManagement extends ConfigGeneric<ConfigGenericProps, AppleTvManagementState> {
	private refreshTimer: number | undefined;

	/**
	 * Creates one table component without writing to native configuration.
	 *
	 * @param props - JSON Config component context.
	 */
	public constructor(props: ConfigGenericProps) {
		super(props);
		this.state = {
			...this.state,
			candidates: [],
			managedDevices: [],
			pairingStatus: { status: 'idle' },
			pins: {},
			loaded: false,
		};
	}

	/** Starts initial and bounded periodic inventory refreshes. */
	public async componentDidMount(): Promise<void> {
		await super.componentDidMount();
		void this.refreshData();
		this.refreshTimer = window.setInterval(() => void this.refreshData(true), REFRESH_INTERVAL_MS);
	}

	/** Stops the browser-side refresh timer. */
	public componentWillUnmount(): void {
		if (this.refreshTimer !== undefined) {
			window.clearInterval(this.refreshTimer);
		}
		super.componentWillUnmount();
	}

	private instanceId(): string {
		return `${this.props.oContext.adapterName}.${this.props.oContext.instance}`;
	}

	private async sendCommand<T>(command: string, data: Record<string, unknown> | null = null): Promise<T> {
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
			const [candidates, managedDevices, pairingStatus] = await Promise.all([
				this.sendCommand<PairingCandidate[]>('listPairingCandidates'),
				this.sendCommand<ManagedDevice[]>('listPairedDevices'),
				this.sendCommand<PairingStatus>('getPairingStatus'),
			]);
			this.setState({ candidates, managedDevices, pairingStatus, loaded: true, error: undefined });
		} catch (error) {
			if (!quiet) {
				this.setState({ loaded: true, error: errorCode(error) });
			}
		}
	}

	private async runAction(deviceId: string, action: () => Promise<void>): Promise<void> {
		this.setState({ busyDeviceId: deviceId, error: undefined });
		try {
			await action();
			await new Promise<void>(resolve => this.setState({ busyDeviceId: undefined }, resolve));
			await this.refreshData();
		} catch (error) {
			this.setState({ busyDeviceId: undefined, error: errorCode(error) });
		}
	}

	private startPairing(deviceId: string): void {
		void this.runAction(deviceId, async () => {
			await this.sendCommand('startPairing', { deviceId });
			this.setState(state => ({ pins: { ...state.pins, [deviceId]: '' } }));
		});
	}

	private finishPairing(deviceId: string): void {
		const pin = this.state.pins[deviceId] ?? '';
		void this.runAction(deviceId, async () => {
			await this.sendCommand('finishPairing', { deviceId, pin });
			this.setState(state => {
				const pins = { ...state.pins };
				delete pins[deviceId];
				return { pins };
			});
		});
	}

	private cancelPairing(deviceId: string): void {
		void this.runAction(deviceId, async () => {
			await this.sendCommand('cancelPairing', {});
			this.setState(state => {
				const pins = { ...state.pins };
				delete pins[deviceId];
				return { pins };
			});
		});
	}

	private setDeviceEnabled(deviceId: string, enabled: boolean): void {
		if (
			!enabled &&
			!window.confirm(I18n.t('Set the selected device passive and remove its ioBroker object tree?'))
		) {
			return;
		}
		void this.runAction(deviceId, async () => {
			await this.sendCommand('setPairedDeviceEnabled', { deviceId, enabled });
		});
	}

	private forgetDevice(deviceId: string): void {
		if (!window.confirm(I18n.t('Really delete the selected local pairing and its complete object tree?'))) {
			return;
		}
		void this.runAction(deviceId, async () => {
			await this.sendCommand('removePairedDevice', { deviceId });
		});
	}

	private updatePin(deviceId: string, value: string): void {
		const pin = value.replace(/\D/g, '').slice(0, 4);
		this.setState(state => ({ pins: { ...state.pins, [deviceId]: pin } }));
	}

	/**
	 * Renders both per-device action tables.
	 *
	 * @param _error - JSON Config validation state, unused by this component.
	 * @param disabled - Whether JSON Config disabled the component.
	 */
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
						<Typography variant="h6">{I18n.t('Apple TV pairing')}</Typography>
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
						{I18n.t(
							'Start pairing for one Apple TV, enter the four-digit PIN displayed by that device, and finish or cancel the operation in the same row. The PIN is never saved.',
						)}
					</Alert>
					{this.renderPairingTable(unavailable)}
				</Box>
				<Box>
					<Typography
						variant="h6"
						sx={{ mb: 1 }}
					>
						{I18n.t('Managed Apple TVs')}
					</Typography>
					<Alert
						severity="info"
						sx={{ mb: 1 }}
					>
						{I18n.t(
							'Active devices connect and receive an ioBroker object tree. Passive devices retain their local pairing but are disconnected and removed from the object tree.',
						)}
					</Alert>
					{this.renderManagedTable(unavailable)}
					<Alert
						severity="warning"
						sx={{ mt: 1 }}
					>
						{I18n.t(
							'Forgetting a device deletes its local pairing credentials and complete ioBroker object tree. The controller entry can remain on the Apple TV until it is removed in tvOS settings.',
						)}
					</Alert>
				</Box>
			</Stack>
		);
	}

	private renderPairingTable(unavailable: boolean): React.JSX.Element {
		const activeDeviceId = this.state.pairingStatus.deviceId;
		const pairingActive = ['starting', 'pinRequired', 'completing'].includes(this.state.pairingStatus.status);
		return (
			<TableContainer
				component={Paper}
				variant="outlined"
			>
				<Table
					size="small"
					aria-label={I18n.t('Apple TV pairing')}
				>
					<TableHead>
						<TableRow>
							<TableCell>{I18n.t('Name / Model')}</TableCell>
							<TableCell>{I18n.t('Pairing status')}</TableCell>
							<TableCell align="center">{I18n.t('Start pairing')}</TableCell>
							<TableCell align="center">{I18n.t('Pairing PIN')}</TableCell>
							<TableCell align="center">{I18n.t('Finish pairing')}</TableCell>
							<TableCell align="center">{I18n.t('Cancel pairing')}</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{this.state.candidates.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6}>{I18n.t('No Apple TV devices detected')}</TableCell>
							</TableRow>
						) : (
							this.state.candidates.map(device => {
								const isActive = activeDeviceId === device.deviceId;
								const pin = this.state.pins[device.deviceId] ?? '';
								const busy = this.state.busyDeviceId === device.deviceId;
								return (
									<TableRow
										key={device.deviceId}
										hover
									>
										<TableCell>{deviceLabel(device)}</TableCell>
										<TableCell>{this.renderPairingStatus(device, isActive)}</TableCell>
										<TableCell align="center">
											<Button
												size="small"
												variant="outlined"
												startIcon={<LinkIcon />}
												disabled={
													unavailable ||
													pairingActive ||
													this.state.busyDeviceId !== undefined
												}
												onClick={() => this.startPairing(device.deviceId)}
											>
												{I18n.t('Start pairing')}
											</Button>
										</TableCell>
										<TableCell align="center">
											<TextField
												size="small"
												type="password"
												value={pin}
												disabled={
													unavailable ||
													!isActive ||
													this.state.pairingStatus.status !== 'pinRequired' ||
													busy
												}
												onChange={event => this.updatePin(device.deviceId, event.target.value)}
												slotProps={{
													htmlInput: {
														maxLength: 4,
														inputMode: 'numeric',
														pattern: '[0-9]*',
													},
												}}
												sx={{ width: 100 }}
											/>
										</TableCell>
										<TableCell align="center">
											<Button
												size="small"
												variant="contained"
												startIcon={<CheckCircleOutlineIcon />}
												disabled={
													unavailable ||
													!isActive ||
													this.state.pairingStatus.status !== 'pinRequired' ||
													!/^\d{4}$/.test(pin) ||
													busy
												}
												onClick={() => this.finishPairing(device.deviceId)}
											>
												{I18n.t('Finish pairing')}
											</Button>
										</TableCell>
										<TableCell align="center">
											<Button
												size="small"
												color="inherit"
												startIcon={<CancelOutlinedIcon />}
												disabled={unavailable || !isActive || !pairingActive || busy}
												onClick={() => this.cancelPairing(device.deviceId)}
											>
												{I18n.t('Cancel pairing')}
											</Button>
										</TableCell>
									</TableRow>
								);
							})
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
				<Table
					size="small"
					aria-label={I18n.t('Managed Apple TVs')}
				>
					<TableHead>
						<TableRow>
							<TableCell>{I18n.t('Name / Model')}</TableCell>
							<TableCell>{I18n.t('Pairing status')}</TableCell>
							<TableCell align="center">{I18n.t('Set active')}</TableCell>
							<TableCell align="center">{I18n.t('Set passive')}</TableCell>
							<TableCell align="center">{I18n.t('Forget paired device')}</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{this.state.managedDevices.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5}>{I18n.t('No paired Apple TV devices')}</TableCell>
							</TableRow>
						) : (
							this.state.managedDevices.map(device => {
								const busy = this.state.busyDeviceId === device.deviceId;
								return (
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
													unavailable ||
													device.enabled ||
													this.state.busyDeviceId !== undefined
												}
												onClick={() => this.setDeviceEnabled(device.deviceId, true)}
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
													unavailable ||
													!device.enabled ||
													this.state.busyDeviceId !== undefined
												}
												onClick={() => this.setDeviceEnabled(device.deviceId, false)}
											>
												{I18n.t('Set passive')}
											</Button>
										</TableCell>
										<TableCell align="center">
											<Button
												size="small"
												color="error"
												startIcon={<DeleteOutlineIcon />}
												disabled={unavailable || this.state.busyDeviceId !== undefined || busy}
												onClick={() => this.forgetDevice(device.deviceId)}
											>
												{I18n.t('Forget paired device')}
											</Button>
										</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</TableContainer>
		);
	}

	private renderPairingStatus(device: PairingCandidate, isActive: boolean): React.JSX.Element {
		if (isActive) {
			return (
				<Chip
					size="small"
					color="primary"
					label={I18n.t(pairingStatusLabel(this.state.pairingStatus.status))}
				/>
			);
		}
		return (
			<Chip
				size="small"
				color={device.paired ? 'success' : 'default'}
				label={I18n.t(device.paired ? 'Paired' : 'Not paired')}
			/>
		);
	}
}

function deviceLabel(device: Pick<PairingCandidate, 'name' | 'model'>): React.JSX.Element {
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
			<Typography variant="body2">{`${I18n.t(connection)}, ${device.appCount} ${I18n.t('app(s)')}`}</Typography>
		</Stack>
	);
}

function pairingStatusLabel(status: PairingState): string {
	const labels: Record<PairingState, string> = {
		idle: 'Not paired',
		starting: 'Starting pairing',
		pinRequired: 'PIN required',
		completing: 'Completing pairing',
		paired: 'Paired',
		error: 'Pairing error',
	};
	return labels[status];
}

function errorCode(error: unknown): string {
	return error instanceof Error && error.message ? error.message : 'unavailable';
}
