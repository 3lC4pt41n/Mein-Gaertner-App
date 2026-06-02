import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { safeLaunchLibrary } from '../services/imagePickerHelper';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import DSInput from '../theme/DSInput';
import { KeyboardAwareModalContent } from '../theme/KeyboardAwareScreen';
import { t } from '../i18n';

export default function AddDiaryEntryDialog({ visible, onClose, onSave, plantId: _plantId }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [saving, setSaving] = useState(false);

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.permissionDenied'), t('dialog.cameraPermissionNeeded'));
        return;
      }

      const result = await safeLaunchLibrary({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (_error) {
      Alert.alert(t('common.error'), t('dialog.imagePickerError'));
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert(t('common.validation'), t('dialog.titleRequired'));
      return;
    }

    try {
      setSaving(true);
      await onSave({
        title: title.trim(),
        note: note.trim(),
        imageUri: selectedImage,
      });
      resetForm();
      onClose();
    } catch (_error) {
      Alert.alert(t('common.error'), t('dialog.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setTitle('');
    setNote('');
    setSelectedImage(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialogContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerButton} onPress={handleCancel} disabled={saving}>
              <Text style={styles.headerButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('dialog.newEntry')}</Text>
            <TouchableOpacity
              style={[styles.headerButton, styles.saveButton]}
              onPress={handleSave}
              disabled={saving || !title.trim()}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.headerButtonText, styles.saveButtonText]}>
                  {t('common.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Content */}
          <KeyboardAwareModalContent
            style={styles.content}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator={false}
          >
            {/* Title Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('dialog.title')}</Text>
              <DSInput
                placeholder={t('dialog.titlePlaceholder')}
                value={title}
                onChangeText={setTitle}
                editable={!saving}
                maxLength={100}
              />
              <Text style={styles.charCount}>{title.length} / 100</Text>
            </View>

            {/* Note Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('dialog.note')}</Text>
              <DSInput
                placeholder={t('dialog.notePlaceholder')}
                value={note}
                onChangeText={setNote}
                multiline
                editable={!saving}
                maxLength={500}
                inputStyle={styles.noteTextInput}
              />
              <Text style={styles.charCount}>{note.length} / 500</Text>
            </View>

            {/* Image Preview */}
            {selectedImage && (
              <View style={styles.imagePreviewContainer}>
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={handleRemoveImage}
                  disabled={saving}
                >
                  <Ionicons name="close-circle" size={28} color={colors.danger || '#e74c3c'} />
                </TouchableOpacity>
              </View>
            )}

            {/* Photo Button */}
            <TouchableOpacity
              style={[styles.photoButton, selectedImage && styles.photoButtonSecondary]}
              onPress={handlePickImage}
              disabled={saving}
            >
              <Ionicons
                name={selectedImage ? 'camera' : 'add-circle'}
                size={20}
                color={selectedImage ? colors.primary : colors.surface}
              />
              <Text
                style={[styles.photoButtonText, selectedImage && styles.photoButtonTextSecondary]}
              >
                {selectedImage ? t('dialog.changePhoto') : t('dialog.addPhoto')}
              </Text>
            </TouchableOpacity>
          </KeyboardAwareModalContent>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  dialogContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerButton: {
    padding: spacing.sm,
  },
  headerButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  saveButton: {
    minWidth: 50,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.primary,
  },
  content: {
    flexShrink: 1,
  },
  contentInner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  titleInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: spacing.xs,
  },
  noteTextInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    ...shadows.sm,
  },
  removeImageButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  photoButtonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  photoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
    marginLeft: spacing.sm,
  },
  photoButtonTextSecondary: {
    color: colors.primary,
  },
});
