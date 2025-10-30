import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * AlertOverlay - A reusable centered overlay alert component
 * 
 * Usage example:
 * ```tsx
 * const [alertMessage, setAlertMessage] = useState<string | null>(null);
 * 
 * // Show alert
 * setAlertMessage('Something went wrong!');
 * 
 * // Render
 * <AlertOverlay
 *   visible={!!alertMessage}
 *   message={alertMessage || ''}
 *   onDismiss={() => setAlertMessage(null)}
 *   dismissButtonText="OK"  // Optional, defaults to 'Dismiss'
 *   backgroundColor="#FF0000"  // Optional, defaults to theme.colors.warn
 * />
 * ```
 */
interface AlertOverlayProps {
	/** Controls whether the overlay is visible */
	visible: boolean;
	/** The alert message to display */
	message: string;
	/** Callback fired when the dismiss button is pressed */
	onDismiss: () => void;
	/** Optional custom text for the dismiss button (default: 'Dismiss') */
	dismissButtonText?: string;
	/** Optional custom background color (default: theme.colors.warn) */
	backgroundColor?: string;
}

export const AlertOverlay: React.FC<AlertOverlayProps> = ({
	visible,
	message,
	onDismiss,
	dismissButtonText = 'Dismiss',
	backgroundColor,
}) => {
	const { theme } = useTheme();

	if (!visible) return null;

	const alertBackgroundColor = backgroundColor || theme.colors.warn;

	return (
		<View
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: 'rgba(0, 0, 0, 0.6)',
				borderRadius: theme.viewStyles.panelContainer.borderRadius,
				padding: 20,
			}}
		>
			<View
				style={{
					backgroundColor: alertBackgroundColor,
					borderRadius: 12,
					padding: 16,
					maxWidth: '90%',
					shadowColor: '#000',
					shadowOffset: { width: 0, height: 4 },
					shadowOpacity: 0.3,
					shadowRadius: 8,
					elevation: 8,
				}}
			>
				<Text style={{ color: theme.colors.white, fontSize: 16, marginBottom: 16, lineHeight: 22 }}>
					{message}
				</Text>
				<Pressable
					onPress={onDismiss}
					style={({ pressed }) => [
						{
							paddingVertical: 10,
							paddingHorizontal: 16,
							borderRadius: 6,
							borderWidth: 2,
							borderColor: theme.colors.white,
							backgroundColor: 'transparent',
							alignItems: 'center',
						},
						pressed && { opacity: 0.8, backgroundColor: 'rgba(255, 255, 255, 0.1)' },
					]}
				>
					<Text style={{ color: theme.colors.white, fontWeight: '600', fontSize: 16 }}>
						{dismissButtonText}
					</Text>
				</Pressable>
			</View>
		</View>
	);
};
