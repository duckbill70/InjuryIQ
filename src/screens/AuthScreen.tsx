import React, { useState } from 'react';
import {
	View,
	TextInput,
	Button,
	Text,
	ActivityIndicator,
	StyleSheet,
	Image,
	TouchableOpacity,
	ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeContext';
//import { Color } from 'react-native/types_generated/Libraries/Animated/AnimatedExports';

export default function AuthScreen() {
	const {
		signIn,
		signUp,
		signInAnonymously,
		sendPasswordReset,
		signInWithGoogle,
	} = useAuth();
	const { theme } = useTheme();

	const [email, setEmail] = useState('');
	const [pw, setPw] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	async function run(fn: () => Promise<void>) {
		setBusy(true);
		setError(null);
		setMessage(null);
		try {
			await fn();
		} catch (e: unknown) {
			if (e instanceof Error) {
				setError(e.message);
			} else {
				setError('Something went wrong');
			}
		} finally {
			setBusy(false);
		}
	}

	return (
		<View style={{ flex: 1 }}>
			<ImageBackground
				source={require('../../assets/single-runner.png')}
				style={{ ...StyleSheet.absoluteFillObject }}
				imageStyle={{ resizeMode: 'cover' }}
			>
				<SafeAreaView
					style={{ flex: 1 }}
					edges={['top', 'bottom', 'left', 'right']}
				>
					<View style={styles.wrap}>
						<Text style={[styles.title, { color: 'white' }]}>
							Sign in to Injury IQ
						</Text>
						<View style={{ height: 8 }} />

						<TouchableOpacity
							onPress={() => run(() => signInWithGoogle())}
							style={[
								theme.viewStyles.button,
								{ backgroundColor: 'white' },
							]}
						>
							<Image
								source={{
									uri: 'https://developers.google.com/identity/images/g-logo.png',
								}}
								style={theme.imageStyles.googleIcon}
							/>
							<Text>Continue with Google</Text>
						</TouchableOpacity>
						<View style={{ height: 8 }} />

						<TextInput
							style={styles.input}
							autoCapitalize='none'
							autoCorrect={false}
							placeholder='Email'
							keyboardType='email-address'
							value={email}
							onChangeText={setEmail}
						/>
						<TextInput
							style={styles.input}
							placeholder='Password'
							secureTextEntry
							value={pw}
							onChangeText={setPw}
						/>
						{busy ? (
							<ActivityIndicator />
						) : (
							<>
								<View style={{ height: 8 }} />
								<TouchableOpacity
									onPress={() => run(() => signIn(email, pw))}
									style={[
										theme.viewStyles.button,
										{ backgroundColor: 'white' },
									]}
								>
									<Text>Sign In</Text>
								</TouchableOpacity>
								<View style={{ height: 8 }} />

								<Button
									disabled={true}
									title='Create Account'
									onPress={() => run(() => signUp(email, pw))}
								/>
								<View style={{ height: 0 }} />
								<Button
									disabled={true}
									title='Forgot Password'
									onPress={() =>
										run(() => sendPasswordReset(email))
									}
								/>
								<View style={{ height: 0 }} />
								<Button
									disabled={true}
									title='Continue Anonymously'
									onPress={() =>
										run(() => signInAnonymously())
									}
								/>
							</>
						)}
						{!!error && <Text style={styles.error}>{error}</Text>}
						{!!message && <Text>{message}</Text>}
					</View>
				</SafeAreaView>
			</ImageBackground>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
	title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
	input: {
		borderWidth: 1,
		borderColor: '#ccc',
		borderRadius: 8,
		padding: 12,
		backgroundColor: 'white',
		opacity: 0.75,
	},
	error: { color: 'red', marginTop: 8 },
});
