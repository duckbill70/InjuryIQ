import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export class AppErrorBoundary extends React.Component<{
  children: React.ReactNode;
}, { hasError: boolean; error: any; errorInfo: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    this.setState({ error, errorInfo });
    // You can also log error to an error reporting service here
    console.error('AppErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text selectable style={styles.error}>{String(this.state.error)}</Text>
          {this.state.errorInfo && (
            <Text selectable style={styles.stack}>{this.state.errorInfo.componentStack}</Text>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#d32f2f',
  },
  error: {
    color: '#d32f2f',
    marginBottom: 8,
    fontSize: 14,
  },
  stack: {
    color: '#333',
    fontSize: 12,
  },
});
