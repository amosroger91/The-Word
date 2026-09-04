import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  backgroundById,
  backgroundForSeed,
  draftForBackground,
  overlayFor,
  paletteFor,
  verseBackgrounds,
  verseImageFontRange,
  verseTextColors,
  type Strings,
  type VerseImageDraft,
} from '@the-word/core';
import { verseBackgroundModules, backgroundDataUrl } from './backgrounds';
import type { VerseImageRequest } from './VerseImageShare';

export interface VerseImageJob {
  reference: string;
  text: string;
  translation: string;
  filename: string;
  seed?: string;
}

export function VerseImageEditor({
  job,
  fontStack,
  label,
  theme,
  onClose,
  onSave,
}: {
  job: VerseImageJob;
  fontStack: string;
  label: Strings;
  theme: 'light' | 'dark';
  onClose: () => void;
  onSave: (request: VerseImageRequest) => void;
}) {
  const palette = paletteFor(theme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [draft, setDraft] = useState<VerseImageDraft>(() => draftForBackground(backgroundForSeed(job.seed || job.reference)));
  const [saving, setSaving] = useState(false);
  const background = backgroundById(draft.backgroundId);
  const source = verseBackgroundModules[background.file];

  async function save() {
    setSaving(true);
    try {
      const imageDataUrl = await backgroundDataUrl(background.file);
      onSave({
        reference: job.reference,
        text: job.text,
        translation: job.translation,
        background: '#111111',
        textColor: draft.textColor,
        accent: '#947849',
        fontStack,
        fontSize: draft.fontSize,
        overlayOpacity: draft.overlayOpacity,
        imageDataUrl,
        filename: job.filename,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{label.createImage}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={label.closeEditor}><Text style={styles.close}>×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.preview}>
            <Image source={source} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            {draft.overlayOpacity > 0 ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(0,0,0,${draft.overlayOpacity})` }]} /> : null}
            <View style={styles.previewCopy}>
              <Text style={[styles.previewRef, { color: draft.textColor, fontFamily: fontStack === 'serif' ? undefined : undefined }]}>{job.reference}</Text>
              <Text style={[styles.previewText, { color: draft.textColor, fontSize: Math.round(draft.fontSize * 0.42), lineHeight: Math.round(draft.fontSize * 0.58) }]}>{job.text}</Text>
              <Text style={[styles.previewFoot, { color: draft.textColor }]}>The Word · {job.translation}</Text>
            </View>
          </View>
          <Text style={styles.label}>{label.background}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
            {verseBackgrounds.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setDraft((current) => ({ ...current, backgroundId: item.id, overlayOpacity: overlayFor(item.kind) }))}
                style={[styles.thumb, item.id === draft.backgroundId && styles.thumbActive]}
              >
                <Image source={verseBackgroundModules[item.file]} style={styles.thumbImage} />
                <Text style={styles.thumbName} numberOfLines={1}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.label}>{label.textSize} · {draft.fontSize}px</Text>
          <View style={styles.stepper}>
            <Pressable onPress={() => setDraft((current) => ({ ...current, fontSize: Math.max(verseImageFontRange.min, current.fontSize - 2) }))}><Text style={styles.step}>−</Text></Pressable>
            <Pressable onPress={() => setDraft((current) => ({ ...current, fontSize: Math.min(verseImageFontRange.max, current.fontSize + 2) }))}><Text style={styles.step}>+</Text></Pressable>
          </View>
          <Text style={styles.label}>{label.textColor}</Text>
          <View style={styles.colors}>
            {verseTextColors.map((color) => (
              <Pressable key={color} onPress={() => setDraft((current) => ({ ...current, textColor: color }))} style={[styles.swatch, { backgroundColor: color }, draft.textColor === color && styles.swatchActive]} />
            ))}
          </View>
          <Text style={styles.label}>{label.overlay} · {Math.round(draft.overlayOpacity * 100)}%</Text>
          <View style={styles.stepper}>
            <Pressable onPress={() => setDraft((current) => ({ ...current, overlayOpacity: Math.max(0, Math.round((current.overlayOpacity - 0.05) * 100) / 100) }))}><Text style={styles.step}>−</Text></Pressable>
            <Pressable onPress={() => setDraft((current) => ({ ...current, overlayOpacity: Math.min(0.8, Math.round((current.overlayOpacity + 0.05) * 100) / 100) }))}><Text style={styles.step}>+</Text></Pressable>
          </View>
          <Pressable style={styles.save} onPress={() => { void save(); }} disabled={saving}>
            <Text style={styles.saveText}>{saving ? label.exporting : label.saveImage}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(palette: ReturnType<typeof paletteFor>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background, paddingTop: 12 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
    title: { color: palette.text, fontSize: 22 },
    close: { color: palette.text, fontSize: 28, lineHeight: 30 },
    body: { paddingHorizontal: 18, paddingBottom: 40, gap: 12 },
    preview: { height: 360, borderRadius: 16, overflow: 'hidden', justifyContent: 'center' },
    previewCopy: { paddingHorizontal: 22, alignItems: 'center', gap: 12 },
    previewRef: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
    previewText: { textAlign: 'center', fontStyle: 'italic' },
    previewFoot: { fontSize: 12, opacity: 0.85, marginTop: 8 },
    label: { color: palette.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
    thumbs: { gap: 8, paddingVertical: 4 },
    thumb: { width: 72, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
    thumbActive: { borderColor: palette.accent },
    thumbImage: { width: 72, height: 96 },
    thumbName: { color: '#fff', fontSize: 10, textAlign: 'center', marginTop: -18, backgroundColor: '#0008', paddingVertical: 2 },
    stepper: { flexDirection: 'row', gap: 16 },
    step: { color: palette.text, fontSize: 22, borderColor: palette.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6 },
    colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: palette.border },
    swatchActive: { borderColor: palette.accent },
    save: { backgroundColor: palette.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    saveText: { color: '#fff7f2', fontSize: 16, fontWeight: '600' },
  });
}
