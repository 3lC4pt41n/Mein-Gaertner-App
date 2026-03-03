import React, { useEffect, useState } from 'react';
import { View, Text, Image, FlatList, TouchableOpacity, Modal, Dimensions, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchGallery } from '../services/diaryService';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';

const COLUMNS = 3;
const screenWidth = Dimensions.get('window').width;
const itemSize = (screenWidth - spacing.md * 2 - spacing.sm * (COLUMNS - 1)) / COLUMNS;

const typeBadges = {
  manual: '📝',
  healthcheck: '💚',
  task: '✅',
  discovery: '🌱',
};

export default function PlantGallery({ plantId }) {
  const [gallery, setGallery] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    loadGallery();
  }, [plantId]);

  const loadGallery = async () => {
    try {
      setLoading(true);
      const data = await fetchGallery(plantId);
      setGallery(data);
    } catch (error) {
      console.error('Failed to load gallery:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleImagePress = (item, index) => {
    setSelectedImage(item);
    setSelectedIndex(index);
  };

  const handlePrevious = () => {
    if (selectedIndex > 0) {
      const prevItem = gallery[selectedIndex - 1];
      setSelectedImage(prevItem);
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex < gallery.length - 1) {
      const nextItem = gallery[selectedIndex + 1];
      setSelectedImage(nextItem);
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const renderGalleryItem = ({ item, index }) => (
    <TouchableOpacity
      style={styles.galleryItem}
      onPress={() => handleImagePress(item, index)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: item.image_url }}
        style={styles.galleryImage}
        resizeMode="cover"
      />
      <View style={styles.badgeContainer}>
        <Text style={styles.badge}>{typeBadges[item.type] || '📌'}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (gallery.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="image-outline" size={48} color={colors.textSecondary} />
        <Text style={styles.emptyText}>{t('gallery.noPhotos')}</Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={gallery}
        renderItem={renderGalleryItem}
        keyExtractor={(item) => item.id.toString()}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        scrollEventThrottle={16}
      />

      <Modal
        visible={!!selectedImage}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedImage(null)}
            >
              <Ionicons name="close" size={28} color={colors.surface} />
            </TouchableOpacity>
            <Text style={styles.modalCounter}>
              {selectedIndex + 1} / {gallery.length}
            </Text>
          </View>

          {selectedImage && (
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: selectedImage.image_url }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            </View>
          )}

          <View style={styles.modalFooter}>
            {selectedImage && (
              <>
                <Text style={styles.modalTitle}>{selectedImage.title}</Text>
                <Text style={styles.modalDate}>{formatDate(selectedImage.created_at)}</Text>
              </>
            )}
          </View>

          <View style={styles.navigationContainer}>
            <TouchableOpacity
              style={[
                styles.navButton,
                selectedIndex === 0 && styles.navButtonDisabled,
              ]}
              onPress={handlePrevious}
              disabled={selectedIndex === 0}
            >
              <Ionicons
                name="chevron-back"
                size={28}
                color={selectedIndex === 0 ? colors.textSecondary : colors.surface}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.navButton,
                selectedIndex === gallery.length - 1 && styles.navButtonDisabled,
              ]}
              onPress={handleNext}
              disabled={selectedIndex === gallery.length - 1}
            >
              <Ionicons
                name="chevron-forward"
                size={28}
                color={selectedIndex === gallery.length - 1 ? colors.textSecondary : colors.surface}
              />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  galleryItem: {
    width: itemSize,
    height: itemSize,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  badgeContainer: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: radius.sm,
    padding: spacing.xs,
  },
  badge: {
    fontSize: 14,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    marginTop: spacing.md,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  closeButton: {
    padding: spacing.sm,
  },
  modalCounter: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: screenWidth,
    height: screenWidth,
  },
  modalFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
    marginBottom: spacing.xs,
  },
  modalDate: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  navButton: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  navButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
});
