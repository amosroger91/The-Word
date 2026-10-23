import { useMemo, type ReactNode } from 'react';
import { Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import type { Palette } from '@the-word/core';

export function FullSheet({
  title,
  onClose,
  palette,
  children,
}: {
  title: string;
  onClose: () => void;
  palette: Palette;
  children: ReactNode;
}) {
  const styles = useSheetStyles(palette);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={title}>
            <Text style={styles.close}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export function useSheetStyles(palette: Palette) {
  return useMemo(() => StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.background,
      paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomColor: palette.rule,
      borderBottomWidth: 1,
    },
    title: { color: palette.text, fontSize: 20, flexShrink: 1 },
    close: { color: palette.text, fontSize: 28, lineHeight: 30 },
    body: { padding: 18, gap: 12, paddingBottom: 48 },
    muted: { color: palette.muted, fontSize: 14, lineHeight: 20 },
    text: { color: palette.text, fontSize: 16, lineHeight: 22 },
    strong: { color: palette.text, fontSize: 16, fontWeight: '700' },
    input: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 8,
      color: palette.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
    },
    area: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 8,
      color: palette.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 96,
      textAlignVertical: 'top',
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    button: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    buttonOn: { backgroundColor: palette.highlight, borderColor: palette.accent },
    primary: { backgroundColor: palette.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center' },
    buttonText: { color: palette.text, fontSize: 14 },
    primaryText: { color: '#fff7f2', fontSize: 15, fontWeight: '700' },
    card: { borderColor: palette.rule, borderWidth: 1, borderRadius: 10, padding: 12, gap: 6 },
    kicker: { color: palette.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
    error: { color: palette.error, fontSize: 14 },
  }), [palette]);
}

export type SheetStyles = ReturnType<typeof useSheetStyles>;

export function Button({
  styles,
  text,
  onPress,
  primary,
  on,
  disabled,
}: {
  styles: SheetStyles;
  text: string;
  onPress: () => void;
  primary?: boolean;
  on?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[primary ? styles.primary : styles.button, on && styles.buttonOn, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={primary ? styles.primaryText : styles.buttonText}>{text}</Text>
    </Pressable>
  );
}
