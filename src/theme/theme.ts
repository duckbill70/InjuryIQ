// theme.ts
import { TextStyle, ViewStyle, ImageStyle } from 'react-native';

type TextStyles = {
	title: TextStyle;
	body: TextStyle;
	body2: TextStyle;
	xsmall: TextStyle;
	// Panel text styles
	panelTitle: TextStyle;
	deviceName: TextStyle;
	batteryPercentage: TextStyle;
	fatiguePercentage: TextStyle;
	stepCount: TextStyle;
	signalText: TextStyle;
	placeholderText: TextStyle;
	placeholderSubText: TextStyle;
	// Common text styles
	bold: TextStyle;
	dim: TextStyle;
	mono: TextStyle;
	buttonLabel: TextStyle;
	error: TextStyle;
	unsupported: TextStyle;
	lastUpdated: TextStyle;
};

type ViewStyles = {
	card: ViewStyle;
	button: ViewStyle;
	googleButton: ViewStyle;
	actionButton: ViewStyle;
	// Panel containers
	panelContainer: ViewStyle;
	panelTitle: ViewStyle;
	// Device layouts
	devicesRow: ViewStyle;
	deviceContainer: ViewStyle;
	deviceHeader: ViewStyle;
	deviceContent: ViewStyle;
	deviceButton: ViewStyle;
	// Common layouts
	rowBetween: ViewStyle;
	rowCenter: ViewStyle;
	column: ViewStyle;
	// Content sections
	batterySection: ViewStyle;
	signalSection: ViewStyle;
	servicesSection: ViewStyle;
	deviceCol: ViewStyle;
	// Placeholder
	placeholder: ViewStyle;
	placeholderContent: ViewStyle;
};

type ImageStyles = {
	googleIcon: ImageStyle;
};

const colors = {
	background: '#FFFFFF',
	text: '#1C1C1E',
	primary: '#007AFF',
	dgrey: '#f3f4f6',
	danger: '#ef4444', // red-500
	warn: '#f59e0b', // amber-500
	mid: '#eab308', // yellow-500
	good: '#10b981', // emerald-500
	charge: '#60a5fa', // blue-400
	muted: '#9ca3af', // gray-400 (unknown)
	border: '#e5e7eb',
	teal: '#008080',
	black: '#000000',
	white: '#ffffff',
	amber: '#FFBF00',
};

export const lightTheme = {
	colors,
	fontSizes: {
		lg: 20,
		md: 16,
	},
	fontWeights: {
		bold: '700' as const,
		regular: '400' as const,
	},
	textStyles: {
		title: {
			fontSize: 20,
			fontWeight: '700',
			color: colors.text,
		},
		body: {
			fontSize: 16,
			fontWeight: '400',
			color: colors.text,
		},
		body2: {
			fontSize: 12,
			fontWeight: '400',
		},
		xsmall: {
			fontSize: 10,
			fontWeight: '400',
		},
		// Panel text styles
		panelTitle: {
			fontSize: 14,
			fontWeight: 'bold',
			textAlign: 'center',
			marginBottom: 12,
		},
		deviceName: {
			fontSize: 14,
			fontWeight: '600',
			color: '#374151',
			textAlign: 'center',
		},
		batteryPercentage: {
			fontSize: 18,
			fontWeight: 'bold',
		},
		fatiguePercentage: {
			fontSize: 30,
			fontWeight: 'bold',
		},
		stepCount: {
			fontSize: 30,
			fontWeight: '600',
			color: '#2196F3',
			marginBottom: 2,
		},
		signalText: {
			fontSize: 12,
			color: '#6B7280',
		},
		placeholderText: {
			fontSize: 16,
			fontWeight: '600',
			color: 'rgba(255, 255, 255, 0.8)',
			marginBottom: 4,
		},
		placeholderSubText: {
			fontSize: 12,
			color: 'rgba(255, 255, 255, 0.6)',
		},
		// Common text styles
		bold: {
			fontWeight: '700',
		},
		dim: {
			color: '#6b7280',
		},
		mono: {
			fontFamily: 'Menlo', // Platform.select({ ios: 'Menlo', android: 'monospace' })
		},
		buttonLabel: {
			color: 'white',
			fontWeight: '600',
		},
		error: {
			fontSize: 12,
			color: '#f44336',
			fontStyle: 'italic',
		},
		unsupported: {
			fontSize: 14,
			color: '#ff9800',
			fontStyle: 'italic',
		},
		lastUpdated: {
			fontSize: 12,
			color: '#999',
			marginBottom: 4,
		},
	} as TextStyles,
	viewStyles: {
		card: {
			padding: 12,
			borderWidth: 1,
			borderColor: '#e5e7eb',
			borderRadius: 12,
			gap: 8,
			backgroundColor: 'white',
			opacity: 0.8,
			//margin: 10,
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 1 },
			shadowOpacity: 0.2,
			shadowRadius: 3,
			elevation: 3,
		},
		button: {
			backgroundColor: colors.primary,
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 1 },
			shadowOpacity: 0.2,
			shadowRadius: 3,
			elevation: 3,
			paddingVertical: 12,
			paddingHorizontal: 20,
			borderRadius: 8,
			alignItems: 'center',
			flexDirection: 'row',
			justifyContent: 'center',
		},
		googleButton: {
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 1 },
			shadowOpacity: 0.2,
			shadowRadius: 3,
			elevation: 3,
			flexDirection: 'row',
			justifyContent: 'center',
			alignItems: 'center',
			backgroundColor: 'white',
			borderWidth: 1,
			borderColor: '#ddd',
			borderRadius: 4,
			padding: 10,
		},
		// Panel containers
		panelContainer: {
			backgroundColor: '#f5f5f5',
			borderRadius: 12,
			padding: 8,
			borderWidth: 1,
			borderColor: '#e5e7eb',
			opacity: 0.9,
		},
		panelTitle: {
			marginBottom: 10,
			textAlign: 'center',
		},
		// Device layouts
		devicesRow: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			gap: 12,
		},
		deviceContainer: {
			backgroundColor: 'white',
			padding: 8,
			flex: 1,
			borderRadius: 8,
			elevation: 2,
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 1 },
			shadowOpacity: 0.2,
			shadowRadius: 2,
			position: 'relative',
			minHeight: 60,
		},
		deviceHeader: {
			position: 'absolute',
			top: 6,
			right: 6,
			zIndex: 1,
		},
		deviceContent: {
			paddingTop: 4,
			paddingRight: 40,
			alignItems: 'center',
			justifyContent: 'center',
			flex: 1,
		},
		deviceButton: {
			flex: 1,
			alignItems: 'center',
			justifyContent: 'center',
			paddingVertical: 20,
			borderRadius: 8,
			margin: 4,
			minHeight: 120,
			backgroundColor: 'white',
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 1 },
			shadowOpacity: 0.2,
			shadowRadius: 2,
			elevation: 2,
		},
		actionButton: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: 5,
			paddingVertical: 8,
			paddingHorizontal: 12,
			borderRadius: 10,
			width: 100,
		},
		// Common layouts
		rowBetween: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
		},
		rowCenter: {
			flexDirection: 'row',
			alignItems: 'center',
		},
		column: {
			flexDirection: 'column',
		},
		// Content sections
		batterySection: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			marginBottom: 8,
			gap: 8,
		},
		signalSection: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			marginBottom: 8,
			gap: 6,
		},
		servicesSection: {
			flexDirection: 'column',
			justifyContent: 'space-between',
			alignItems: 'center',
			width: 24,
			marginRight: 12,
		},
		deviceCol: {
			maxWidth: '48%',
		},
		// Placeholder
		placeholder: {
			backgroundColor: 'transparent',
			borderStyle: 'dashed',
			borderColor: 'rgba(255, 255, 255, 0.6)',
			borderWidth: 2,
			elevation: 0,
			shadowOpacity: 0,
			minHeight: 120,
			maxHeight: 120,
			justifyContent: 'center',
		},
		placeholderContent: {
			flex: 1,
			justifyContent: 'center',
			alignItems: 'center',
		},
	} as ViewStyles,
	imageStyles: {
		googleIcon: {
			width: 18,
			height: 18,
			marginRight: 8,
		},
	} as ImageStyles,
};

export const darkTheme = {
	...lightTheme,
	colors: {
		...lightTheme.colors,
		background: '#1C1C1E',
		text: '#FFFFFF',
		primary: '#0A84FF',
	},
	textStyles: {
		...lightTheme.textStyles,
		title: {
			...lightTheme.textStyles.title,
			color: '#FFFFFF',
		},
		body: {
			...lightTheme.textStyles.body,
			color: '#FFFFFF',
		},
		deviceName: {
			...lightTheme.textStyles.deviceName,
			color: '#FFFFFF',
		},
		placeholderText: {
			...lightTheme.textStyles.placeholderText,
			color: 'rgba(255, 255, 255, 0.8)',
		},
		placeholderSubText: {
			...lightTheme.textStyles.placeholderSubText,
			color: 'rgba(255, 255, 255, 0.6)',
		},
	} as TextStyles,
	viewStyles: {
		...lightTheme.viewStyles,
		card: {
			...lightTheme.viewStyles.card,
			backgroundColor: '#1C1C1E',
			borderColor: '#2C2C2E',
		},
		panelContainer: {
			...lightTheme.viewStyles.panelContainer,
			backgroundColor: '#2C2C2E',
			borderColor: '#3C3C3E',
		},
		deviceContainer: {
			...lightTheme.viewStyles.deviceContainer,
			backgroundColor: '#2C2C2E',
		},
		deviceButton: {
			...lightTheme.viewStyles.deviceButton,
			backgroundColor: '#2C2C2E',
		},
	} as ViewStyles,
};

export type Theme = typeof lightTheme;
