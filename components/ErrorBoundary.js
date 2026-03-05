import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme/tokens';
import { t } from '../i18n';
import { Sentry } from '../sentry.config';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Report to Sentry with component stack context
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo?.componentStack } },
    });

    // Structured logging for local debugging
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
          <Ionicons name="warning-outline" size={64} color={colors.danger} />
          <Text style={styles.title}>{t('common.errorBoundaryTitle')}</Text>
          <Text style={styles.message}>{t('common.errorBoundaryMessage')}</Text>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel={t('common.errorBoundaryRetry')}
          >
            <Ionicons name="refresh-outline" size={20} color="#fff" />
            <Text style={styles.retryText}>{t('common.errorBoundaryRetry')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailsToggle}
            onPress={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
            accessibilityRole="button"
            accessibilityLabel={`${this.state.showDetails ? t('common.errorBoundaryHideDetails') : t('common.errorBoundaryShowDetails')}`}
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
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  retryText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  detailsToggle: {
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  detailsToggleText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  detailsContainer: {
    marginTop: spacing.sm,
    maxHeight: 200,
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  detailsText: {
    fontSize: 11,
    fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.textPrimary,
  },
});
