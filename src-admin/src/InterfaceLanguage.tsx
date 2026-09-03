import React from 'react';

import LanguageIcon from '@mui/icons-material/Language';
import { FormControl, FormHelperText, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

import { I18n } from '@iobroker/gui-components';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

type InterfaceLanguage = 'de' | 'en';

interface InterfaceLanguageState extends ConfigGenericState {
	value: InterfaceLanguage;
}

/** Two-language, instance-local switch for the complete adapter configuration UI. */
export default class InterfaceLanguageSelector extends ConfigGeneric<ConfigGenericProps, InterfaceLanguageState> {
	public constructor(props: ConfigGenericProps) {
		super(props);
		this.state = {
			...this.state,
			value: configuredLanguage(props.data, props.attr),
		};
	}

	public async componentDidMount(): Promise<void> {
		await super.componentDidMount();
		void this.applyConfiguredLanguage();
	}

	private async applyConfiguredLanguage(): Promise<void> {
		if (I18n.getLanguage() === this.state.value) {
			return;
		}
		await this.loadTranslations(this.state.value);
		I18n.setLanguage(this.state.value);
		this.props.oContext.changeLanguage?.();
	}

	private async selectLanguage(value: InterfaceLanguage): Promise<void> {
		if (value === this.state.value) {
			return;
		}
		await this.loadTranslations(value);
		await this.onChange(this.props.attr ?? 'interfaceLanguage', value);
		this.setState({ value }, () => {
			I18n.setLanguage(value);
			this.props.oContext.changeLanguage?.();
		});
	}

	private async loadTranslations(language: InterfaceLanguage): Promise<void> {
		try {
			const response = (await this.props.oContext.socket.readFile(
				`${this.props.oContext.adapterName}.admin`,
				`i18n/${language}.json`,
			)) as unknown;
			if (typeof response !== 'object' || response === null || !('file' in response)) {
				return;
			}
			const file = (response as { file?: unknown }).file;
			if (typeof file === 'string') {
				I18n.extendTranslations(JSON.parse(file) as Record<string, string>, language);
			}
		} catch (error) {
			console.error(`Cannot load Apple Admin language ${language}: ${errorCode(error)}`);
		}
	}

	public renderItem(_error: unknown, disabled: boolean): React.JSX.Element {
		return (
			<FormControl fullWidth>
				<Stack
					direction="row"
					spacing={1}
					sx={{ alignItems: 'center', mb: 1 }}
				>
					<LanguageIcon color="primary" />
					<Typography>{I18n.t('User interface language')}</Typography>
				</Stack>
				<ToggleButtonGroup
					exclusive
					value={this.state.value}
					disabled={disabled}
					onChange={(_event, value: InterfaceLanguage | null) => {
						if (value !== null) {
							void this.selectLanguage(value);
						}
					}}
				>
					<ToggleButton value="de">Deutsch</ToggleButton>
					<ToggleButton value="en">English</ToggleButton>
				</ToggleButtonGroup>
				<FormHelperText>
					{I18n.t('This selection changes only the Apple adapter configuration and is saved per instance.')}
				</FormHelperText>
			</FormControl>
		);
	}
}

function configuredLanguage(data: Record<string, unknown>, attr: string | undefined): InterfaceLanguage {
	const value = attr === undefined ? undefined : ConfigGeneric.getValue(data, attr);
	if (value === 'de' || value === 'en') {
		return value;
	}
	return I18n.getLanguage() === 'de' ? 'de' : 'en';
}

function errorCode(error: unknown): string {
	return error instanceof Error && error.message ? error.message : 'unavailable';
}
