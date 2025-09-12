// theme.ts
import { TextStyle, ViewStyle, ImageStyle } from 'react-native';

type TextStyles = {
	title: TextStyle;
	body: TextStyle;
	body2: TextStyle;
	xsmall: TextStyle;
};

type ViewStyles = {
	card: ViewStyle;
	button: ViewStyle;
	googleButton: ViewStyle;
};

type ImageStyles = {
	googleIcon: ImageStyle;
};

const colors = {
	background: '#FFFFFF',
	text: 		'#1C1C1E',
	primary:	'#007AFF',
	dgrey: 		'#f3f4f6',
	danger: 	'#ef4444',  // red-500
  	warn:  	 	'#f59e0b',  // amber-500
  	mid:   	 	'#eab308',  // yellow-500
  	good:  		'#10b981',  // emerald-500
  	charge:	 	'#60a5fa',  // blue-400
  	muted: 		'#9ca3af',  // gray-400 (unknown)
	border:		'#e5e7eb',
	teal:		'#008080',
	black: 		'#000000',
	white:		'#ffffff'
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
		margin: 10,


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
	} as TextStyles,
	viewStyles: {
		...lightTheme.viewStyles,
		card: {
			...lightTheme.viewStyles.card,
			backgroundColor: '#1C1C1E',
			borderColor: '#2C2C2E',
		},
	} as ViewStyles,
};

export type Theme = typeof lightTheme;
