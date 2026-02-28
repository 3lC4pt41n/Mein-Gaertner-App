import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';
import { t } from '../i18n';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Structured logging (Sentry-ready)
    console.error('[ErrorBoundary] Uncaught error:', {
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={64} color={colors.error || '#D32F2F'} />
          <Text style={styles.title}>{t('common.errorBoundaryTitle')}</Text>
          <Text style={styles.message}>{t('common.errorBoundaryMessage')}</Text>

          <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
            <Ionicons name="refresh-outline" size={20} color="#fff" />
            <Text style={styles.retryText}>{t('common.errorBoundaryRetry')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailsToggle}
            onPress={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
          >
            <Text style={styles.detailsToggleText}>
              {this.state.showDetails ? '▲' : '▼'} {t('common.errorBoundaryDetails')}
            </Text>
          </TouchableOpacity>

          {this.state.showDetails && (
            <ScrollView style={styles.detailsContainer}>
              <Text style={styles.detailsText}>
                {this.state.error?.toString()}
                {'\n\n'}
                {this.state.errorInfo?.componentStack}
              </Text>
            </ScrollView>
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
    padding: spacing?.lg || 24,
    backgroundColor: colors?.background || '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors?.text || '#1B1B1B',
    marginTop: spacing?.md || 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: colors?.textSecondary || '#666',
    marginTop: spacing?.sm || 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors?.primary || '#2E7D32',
    paddingHorizontal: spacing?.lg || 24,
    paddingVertical: spacing?.sm || 12,
    borderRadius: radius?.md || 8,
    marginTop: spacing?.xl || 24,
    gap: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  detailsToggle: {
    marginTop: spacing?.md || 16,
    padding: spacing?.sm || 8,
  },
  detailsToggleText: {
    fontSize: 13,
    color: colors?.textSecondary || '#888',
  },
  detailsContainer: {
    marginTop: spacing?.sm || 8,
    maxHeight: 200,
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: radius?.sm || 4,
    padding: spacing?.sm || 8,
  },
  detailsText: {
    fontSize: 11,
    fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#333',
  },
});
