import React from 'react';
import { View, TouchableOpacity, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { colors, spacing, radius } from './tokens';

export default function DSChipGroup({
  items = [],
  selected,
  onSelect,
  variant = 'pills',
  scrollable = true,
  style,
}) {
  if (variant === 'segmented') {
    return (
      <View style={[styles.segmentedTrack, style]}>
        {items.map((item) => {
          const active = item.key === selected;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => onSelect(item.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              style={[styles.segmentedItem, active && styles.segmentedActive]}
            >
              {item.icon && (
                <Ionicons
                  name={item.icon}
                  size={16}
                  color={active ? '#FFFFFF' : colors.textSecondary}
                  style={styles.chipIcon}
                />
              )}
              <Text style={[styles.segmentedText, active && styles.segmentedTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  const content = items.map((item) => {
    const active = item.key === selected;
    return (
      <TouchableOpacity
        key={item.key}
        onPress={() => onSelect(item.key)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
        style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
      >
        {item.icon && (
          <Ionicons
            name={item.icon}
            size={16}
            color={active ? '#FFFFFF' : colors.textSecondary}
            style={styles.chipIcon}
          />
        )}
        <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.pillContainer, style]}
      >
        {content}
      </ScrollView>
    );
  }

  return <View style={[styles.pillContainer, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  // Pills variant
  pillContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  pillInactive: {
    backgroundColor: colors.borderLight,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillTextInactive: {
    color: colors.textSecondary,
  },

  // Segmented variant
  segmentedTrack: {
    flexDirection: 'row',
    backgroundColor: colors.borderLight,
    borderRadius: radius.md,
    padding: 3,
  },
  segmentedItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  segmentedActive: {
    backgroundColor: colors.primary,
  },
  segmentedText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentedTextActive: {
    color: '#FFFFFF',
  },

  // Shared
  chipIcon: {
    marginRight: spacing.xs,
  },
});

DSChipGroup.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.string,
      key: PropTypes.string,
      icon: PropTypes.string,
    })
  ).isRequired,
  selected: PropTypes.string,
  onSelect: PropTypes.func,
  variant: PropTypes.oneOf(['segmented', 'pills']),
  scrollable: PropTypes.bool,
  style: PropTypes.object,
};

DSChipGroup.defaultProps = {
  variant: 'pills',
  scrollable: true,
};
