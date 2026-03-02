import React, { useState } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, Modal, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';

export default function AddDiaryEntryDialog({ visible, onClose, onSave, plantId }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [saving, setSaving] = useState(false);

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissions();
      if (status !== 'granted') {
        Alert.alert(
          t('common.permissionDenied'),
          t('dialog.cameraPermissionNeeded')
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.cancelled) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Image picker error:', error);
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
    } catch (error) {
      console.error('Save error:', error);
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
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialogContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleCancel}
              disabled={saving}
            >
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
          <View style={styles.content}>
            {/* Title Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('dialog.title')}</Text>
              <TextInput
                style={styles.titleInput}
                placeholder={t('dialog.titlePlaceholder')}
                placeholderTextColor={colors.textSecondary}
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
              <TextInput
                style={styles.noteInput}
                placeholder={t('dialog.notePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={note}
                onChangeText={setNote}
                multiline
                editable={!saving}
                maxLength={500}
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
              style={[
                styles.photoButton,
                selectedImage && styles.photoButtonSecondary,
              ]}
              onPress={handlePickImage}
              disabled={saving}
            >
              <Ionicons
                name={selectedImage ? 'camera' : 'add-circle'}
                size={20}
                color={selectedImage ? colors.primary : colors.white}
              />
              <Text
                style={[
                  styles.photoButtonText,
                  selectedImage && styles.photoButtonTextSecondary,
                ]}
              >
                {selectedImage ? t('dialog.changePhoto') : t('dialog.addPhoto')}
              </Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
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
    color: colors.text,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  titleInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: spacing.xs,
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
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  photoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
    marginLeft: spacing.sm,
  },
  photoButtonTextSecondary: {
    color: colors.primary,
  },
});
