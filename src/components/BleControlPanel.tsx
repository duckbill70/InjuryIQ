import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useBle } from '../ble/BleProvider';
import { useTheme } from '../theme/ThemeContext';
import { 
	Bluetooth, 
	BluetoothSearching, 
	Wifi, 
	WifiOff, 
	//CheckCircle
} from 'lucide-react-native';

export const BleControlPanel: React.FC = () => {
	const { theme } = useTheme();
	const { 
		scanning, 
		isPoweredOn, 
		connected, 
		//devicesByPosition,
		startScan, 
		stopScan
	} = useBle();

	const [autoScanEnabled, setAutoScanEnabled] = useState(false);
	//const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

	// Auto-scan configuration
	const AUTO_SCAN_INTERVAL_MS = 30000; // 30 seconds
	const SCAN_DURATION_MS = 15000; // 15 seconds
	const MAX_DEVICES = 3;

	// Auto-scan when enabled and conditions are met
	useEffect(() => {
		if (!autoScanEnabled || !isPoweredOn) return;

		const connectedCount = Object.keys(connected).length;
		if (connectedCount >= MAX_DEVICES) return; // Already have max devices

		const interval = setInterval(async () => {
			if (scanning) return; // Don't interrupt ongoing scan

			const currentConnectedCount = Object.keys(connected).length;
			if (currentConnectedCount >= MAX_DEVICES) return; // Already have max devices

			try {
				console.log(`[AutoScan] Starting auto-scan (${currentConnectedCount}/${MAX_DEVICES} devices connected)`);
				//setLastScanTime(new Date());
				await startScan({ 
					timeoutMs: SCAN_DURATION_MS, 
					maxDevices: MAX_DEVICES - currentConnectedCount,
					clearFoundDevices: false // Don't clear existing devices during auto-scan
				});
			} catch (error) {
				console.warn('[AutoScan] Failed to start scan:', error);
			}
		}, AUTO_SCAN_INTERVAL_MS);

		// Initial scan if no devices connected
		if (connectedCount === 0) {
			const initialScan = async () => {
				try {
					console.log('[AutoScan] Starting initial scan');
					//setLastScanTime(new Date());
					await startScan({ 
						timeoutMs: SCAN_DURATION_MS, 
						maxDevices: MAX_DEVICES,
						clearFoundDevices: true // Clear for initial scan
					});
				} catch (error) {
					console.warn('[AutoScan] Initial scan failed:', error);
				}
			};
			
			// Delay initial scan by 2 seconds to let BLE initialize
			setTimeout(initialScan, 2000);
		}

		return () => clearInterval(interval);
	}, [autoScanEnabled, isPoweredOn, connected, scanning, startScan]);

	// Manual scan
	const handleManualScan = useCallback(async () => {
		if (scanning) {
			stopScan();
			return;
		}

		if (!isPoweredOn) {
			Alert.alert('Bluetooth Required', 'Please enable Bluetooth to scan for devices.');
			return;
		}

		try {
			//setLastScanTime(new Date());
			await startScan({ 
				timeoutMs: SCAN_DURATION_MS, 
				maxDevices: MAX_DEVICES,
				clearFoundDevices: true // Clear for manual scan
			});
		} catch (error) {
			Alert.alert('Scan Failed', `Unable to start scan: ${error}`);
		}
	}, [scanning, stopScan, isPoweredOn, startScan]);

	// Toggle auto-scan
	const toggleAutoScan = useCallback(() => {
		setAutoScanEnabled(prev => !prev);
	}, []);

	const connectedCount = Object.keys(connected).length;
	//const hasAllPositions = !!(devicesByPosition.leftFoot && devicesByPosition.rightFoot && devicesByPosition.racket);

	return (
		<View style={[theme.viewStyles.panelContainer, { backgroundColor: theme.colors.background }]}>
           {/* Header */}
           <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, minHeight: 40 }}>
               {/* Bluetooth icon left */}
               <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
                   <Bluetooth
                       size={28}
                       color={isPoweredOn ? theme.colors.primary : theme.colors.muted}
                   />
               </View>
               {/* Title center */}
               <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                   <Text style={[theme.textStyles.panelTitle, {marginBottom: 0, fontSize: theme.fontSizes.lg}]}>BLE Device Control</Text>
               </View>
               {/* Connected count right */}
               <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
                   <Text style={[theme.textStyles.panelTitle, { marginBottom: 0, fontWeight: '600', color: connectedCount === 3 ? theme.colors.good : theme.colors.black, fontSize: theme.fontSizes.lg }]}> 
                       {connectedCount}/3
                   </Text>
               </View>
           </View>			
		   {/* Status Row 
			<View style={[theme.viewStyles.rowBetween, { marginBottom: 16 }]}>
				<View style={theme.viewStyles.rowCenter}>
					{isPoweredOn ? (
						<Bluetooth size={20} color={theme.colors.good} />
					) : (
						<Bluetooth size={20} color={theme.colors.muted} />
					)}
					<Text style={[theme.textStyles.body, { 
						fontSize: theme.fontSizes.lg,
						color: isPoweredOn ? theme.colors.good : theme.colors.muted,
						marginLeft: 8 
					}]}>
						{isPoweredOn ? 'Bluetooth Ready' : 'Bluetooth Off'}
					</Text>
				</View>

				<View style={theme.viewStyles.rowCenter}>
					<Text style={[theme.textStyles.body, { 
						color: hasAllPositions ? theme.colors.good : theme.colors.warn 
					}]}>
						{connectedCount}/{MAX_DEVICES} Connected
					</Text>
					{hasAllPositions && (
						<CheckCircle size={16} color={theme.colors.good} style={{ marginLeft: 4 }} />
					)}
				</View>
			</View> */}

			{/* Control Buttons */}
			<View style={[theme.viewStyles.rowBetween, { marginBottom: 16, gap: 12 }]}>
				   {/* Manual Scan Button */}
				   <Pressable
					   style={({ pressed }) => [
						   theme.viewStyles.button,
						   {
							   flex: 1,
							   height: 48,
							   borderRadius: 10,
							   backgroundColor: scanning ? theme.colors.warn : theme.colors.primary,
							   opacity: isPoweredOn ? 1 : 0.5,
							   transform: [{ scale: pressed ? 0.97 : 1 }],
							   shadowColor: '#000',
							   shadowOffset: { width: 0, height: 2 },
							   shadowOpacity: 0.08,
							   shadowRadius: 4,
							   elevation: 2,
						   },
						   pressed && { backgroundColor: scanning ? 'rgba(255, 186, 0, 0.85)' : 'rgba(0,122,255,0.85)' },
					   ]}
					   onPress={handleManualScan}
					   disabled={!isPoweredOn}
					   accessibilityLabel="Manual Scan"
					   accessibilityRole="button"
				   >
					   <View style={theme.viewStyles.rowCenter}>
						   {scanning ? (
							   <BluetoothSearching size={18} color={theme.colors.white} />
						   ) : (
							   <Bluetooth size={18} color={theme.colors.white} />
						   )}
						   <Text style={[theme.textStyles.buttonLabel, { marginLeft: 8, fontSize: theme.fontSizes.lg, }]}> 
							   {scanning ? 'Stop Scan' : 'Manual Scan'}
						   </Text>
					   </View>
				   </Pressable>

				   {/* Auto-Scan Toggle */}
				   <Pressable
					   style={({ pressed }) => [
						   theme.viewStyles.button,
						   {
							   flex: 1,
							   height: 48,
							   borderRadius: 10,
							   backgroundColor: autoScanEnabled ? theme.colors.good : theme.colors.muted,
							   transform: [{ scale: pressed ? 0.97 : 1 }],
							   shadowColor: '#000',
							   shadowOffset: { width: 0, height: 2 },
							   shadowOpacity: 0.08,
							   shadowRadius: 4,
							   elevation: 2,
						   },
						   pressed && { backgroundColor: autoScanEnabled ? 'rgba(52,199,89,0.85)' : 'rgba(142,142,147,0.85)' },
					   ]}
					   onPress={toggleAutoScan}
					   accessibilityLabel="Toggle Auto-Scan"
					   accessibilityRole="button"
				   >
					   <View style={theme.viewStyles.rowCenter}>
						   {autoScanEnabled ? (
							   <Wifi size={18} color={theme.colors.white} />
						   ) : (
							   <WifiOff size={18} color={theme.colors.white} />
						   )}
						   <Text style={[theme.textStyles.buttonLabel, { marginLeft: 8,fontSize: theme.fontSizes.lg, }]}> 
							   Auto-Scan
						   </Text>
					   </View>
				   </Pressable>
			</View>

			{/* Last Scan Time 
			{lastScanTime && (
				<Text style={[theme.textStyles.lastUpdated, { textAlign: 'center', marginTop: 8 }]}>
					Last scan: {lastScanTime.toLocaleTimeString()}
				</Text>
			)} */}
		</View>
	);
};