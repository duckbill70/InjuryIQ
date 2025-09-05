import React from 'react';

import {
	View,
	Text,
	//Button,
	TouchableOpacity,
	ScrollView,
	StyleSheet,
	//FlatList,
	ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
	BluetoothSearchingIcon,
	//Wifi,
	//WifiOff,
	//Power,
	//BatteryCharging,
} from 'lucide-react-native';

import { useAuth } from '../auth/AuthProvider';
import { useBle } from '../ble/BleProvider';
import DeviceBox from '../components/DeviceBox';

import { useTheme } from '../theme/ThemeContext';

//const MY_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';

//serviceUUIDs
//fatigue: "12345678-1234-5678-1234-56789abcdef0"
//imuRaw: "abcdef01-2345-6789-abcd-ef0123456789"
//ledControl: "19B10010-E8F2-537E-4F6C-D104768A1214"
//battery: "180F")

//characteristicUUIDs
//fatigue: "12345678-1234-5678-1234-56789abcdef1"
//imuRaw: "abcdef01-2345-6789-abcd-ef0123456790"
//ledControl: "19B10010-E8F2-537E-4F6C-D104768A1215"
//battery: "2A19"

export default function HomeScreen() {
	const { user, signOut } = useAuth();
	const { theme } = useTheme();

	const {
		scanning,
		startScan,
		//stopScan,
		connected,
		//knownServiceUUID,
		//disconnectDevice,
		isPoweredOn,
	} = useBle();

	return (
		<View style={{ flex: 1 }}>
			<ImageBackground
				source={require('../../assets/padel-tennis-2.png')}
				style={{ ...StyleSheet.absoluteFillObject }}
				imageStyle={{ resizeMode: 'cover' }}
			>
				<SafeAreaView
					style={{ flex: 1 }}
					edges={['top', 'bottom', 'left', 'right']}
				>
					<ScrollView
						style={{
							flex: 1,
							paddingVertical: 4,
							paddingHorizontal: 6,
						}}
					>
						{/* Header */}
						<View style={{ margin: 10 }}>
							<Text
								style={[
									theme.textStyles.title,
									{ color: 'white' },
								]}
							>
								BLE Device Connector
							</Text>
							<Text
								style={[
									theme.textStyles.body,
									{ color: 'white' },
								]}
							>
								Scan and connect to Bluetooth devices
							</Text>
						</View>

						{/* Scan Button */}
						<TouchableOpacity
							//onPress={() => startScan()}
							onPress={() =>
								startScan({ timeoutMs: 1500, maxDevices: 2 })
							}
							style={[
								theme.viewStyles.button,
								{
									backgroundColor: scanning
										? 'grey'
										: theme.colors.primary,
									margin: 10,
								},
							]}
							disabled={scanning || !isPoweredOn}
						>
							<BluetoothSearchingIcon size={24} color='white' />
							<Text
								style={[
									theme.textStyles.body,
									{ color: 'white', paddingLeft: 8 },
								]}
							>
								{scanning ? 'Scanning...' : 'Start Scanning'}
							</Text>
						</TouchableOpacity>

						{/* Device Boxes */}
						<View
							style={{
								flexDirection: 'row',
								justifyContent: 'space-between',
								margin: 10,
							}}
						>
							{Object.values(connected).map((device) => (
								<DeviceBox key={device.id} item={device} />
							))}
						</View>

						{/* Footer */}
						<View
							style={{
								margin: 10,
								borderColor: theme.colors.dgrey,
								borderTopWidth: 1,
								paddingTop: 10,
							}}
						>
							<Text
								style={[
									theme.textStyles.body,
									{ color: 'white' },
								]}
							>
								email: {user?.email ?? 'Anonymous'}
							</Text>
							<Text
								style={[
									theme.textStyles.body,
									{ color: 'white' },
								]}
							>
								UID: {user?.uid}
							</Text>
							<View style={{ height: 8 }} />
							<TouchableOpacity
								onPress={() => signOut()}
								style={[
									theme.viewStyles.button,
									{ width: '30%' },
								]}
							>
								<Text
									style={[
										theme.textStyles.body,
										{ color: 'white' },
									]}
								>
									Sign Out
								</Text>
							</TouchableOpacity>
						</View>
					</ScrollView>
				</SafeAreaView>
			</ImageBackground>
		</View>
	);
}
