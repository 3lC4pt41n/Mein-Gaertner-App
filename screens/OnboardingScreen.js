import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import PagerView from 'react-native-pager-view';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';

const TOTAL_PAGES = 3;

/**
 * OnboardingScreen – 3-step swipeable carousel for new users & reviewers.
 *
 * Page 1: Value Proposition (identify plants with AI)
 * Page 2: Key Features (health checks, care tasks, diary)
 * Page 3: Credits & Quick-Start CTA
 *
 * Props:
 *   onDone() – dismisses onboarding (stored via AsyncStorage in AuthContext)
 */
export default function OnboardingScreen({ onDone }) {
  const pagerRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(0);

  const goToPage = (page) => {
    pagerRef.current?.setPage(page);
  };

  const handleNext = () => {
    if (currentPage < TOTAL_PAGES - 1) {
      goToPage(currentPage + 1);
    } else {
      onDone();
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Skip button (top-right) */}
      {currentPage < TOTAL_PAGES - 1 && (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={onDone}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.skip')}
        >
          <Text style={styles.skipText}>{t('common.skip')}</Text>
        </TouchableOpacity>
      )}

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
      >
        {/* --- Page 1: Value Proposition --- */}
        <View key="1" style={styles.page}>
          <View style={styles.illustrationCircle}>
            <Ionicons name="camera" size={56} color={colors.surface} />
          </View>
          <Text style={styles.pageTitle}>{t('onboarding.page1Title')}</Text>
          <Text style={styles.pageSubtitle}>{t('onboarding.page1Subtitle')}</Text>

          <View style={styles.featureRow}>
            <FeatureChip icon="scan" label={t('onboarding.chipScan')} />
            <FeatureChip icon="leaf" label={t('onboarding.chipIdentify')} />
            <FeatureChip icon="bulb" label={t('onboarding.chipTips')} />
          </View>
        </View>

        {/* --- Page 2: Key Features --- */}
        <View key="2" style={styles.page}>
          <View style={[styles.illustrationCircle, { backgroundColor: colors.info }]}>
            <Ionicons name="heart" size={56} color={colors.surface} />
          </View>
          <Text style={styles.pageTitle}>{t('onboarding.page2Title')}</Text>
          <Text style={styles.pageSubtitle}>{t('onboarding.page2Subtitle')}</Text>

          <View style={styles.featureList}>
            <FeatureItem
              icon="fitness"
              color={colors.success}
              title={t('onboarding.feature1Title')}
              desc={t('onboarding.feature1Desc')}
            />
            <FeatureItem
              icon="calendar"
              color={colors.info}
              title={t('onboarding.feature2Title')}
              desc={t('onboarding.feature2Desc')}
            />
            <FeatureItem
              icon="book"
              color={colors.warning}
              title={t('onboarding.feature3Title')}
              desc={t('onboarding.feature3Desc')}
            />
          </View>
        </View>

        {/* --- Page 3: Credits & CTA --- */}
        <View key="3" style={styles.page}>
          <View style={[styles.illustrationCircle, { backgroundColor: colors.warning }]}>
            <Ionicons name="flash" size={56} color={colors.surface} />
          </View>
          <Text style={styles.pageTitle}>{t('onboarding.page3Title')}</Text>
          <Text style={styles.pageSubtitle}>{t('onboarding.page3Subtitle')}</Text>

          <View style={styles.creditsCard}>
            <View style={styles.creditsCardHeader}>
              <Ionicons name="gift" size={24} color={colors.warning} />
              <Text style={styles.creditsCardTitle}>{t('onboarding.giftTitle')}</Text>
            </View>
            <Text style={styles.creditsCardText}>{t('onboarding.giftDesc')}</Text>
          </View>
        </View>
      </PagerView>

      {/* --- Bottom: Dots + Button --- */}
      <View style={styles.bottomBar}>
        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
            <View key={i} style={[styles.dot, i === currentPage && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleNext}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>
            {currentPage === TOTAL_PAGES - 1 ? t('onboarding.ctaStart') : t('onboarding.ctaNext')}
          </Text>
          <Ionicons
            name={currentPage === TOTAL_PAGES - 1 ? 'leaf' : 'arrow-forward'}
            size={20}
            color={colors.surface}
            style={{ marginLeft: spacing.sm }}
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------- Sub-components -------------------------------------------

function FeatureChip({ icon, label }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={16} color={colors.primary} style={{ marginRight: 4 }} />
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function FeatureItem({ icon, color, title, desc }) {
  return (
    <View style={styles.featureItem}>
      <View style={[styles.featureIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

// ---------- Styles ---------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: spacing.xl,
    zIndex: 10,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  skipText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 80,
  },

  // Illustration circle
  illustrationCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
    ...shadows.lg,
  },

  // Page text
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  pageSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },

  // Feature chips (Page 1)
  featureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  chipText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },

  // Feature list (Page 2)
  featureList: {
    width: '100%',
    gap: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  // Credits card (Page 3)
  creditsCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.warning,
    width: '100%',
    ...shadows.sm,
  },
  creditsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  creditsCardTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  creditsCardText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    ...shadows.md,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.surface,
  },
});
