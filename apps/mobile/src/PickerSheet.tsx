import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Palette } from '@the-word/core';

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
  group?: string;
}

interface Props {
  visible: boolean;
  title: string;
  filterPlaceholder: string;
  options: PickerOption[];
  value: string;
  palette: Palette;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function fold(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

// The native counterpart of the web SearchableSelect: same filtering, same grouping, same numbers.
export function PickerSheet({ visible, title, filterPlaceholder, options, value, palette, onSelect, onClose }: Props) {
  const [filter, setFilter] = useState('');
  const styles = useMemo(() => createStyles(palette), [palette]);

  const matches = useMemo(() => {
    const needle = fold(filter.trim());
    if (!needle) return options;
    return options.filter((option) => fold(`${option.label} ${option.hint ?? ''} ${option.group ?? ''}`).includes(needle));
  }, [options, filter]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} accessibilityLabel={title} hitSlop={12}><Text style={styles.close}>×</Text></Pressable>
        </View>
        <TextInput
          style={styles.filter}
          value={filter}
          onChangeText={setFilter}
          placeholder={filterPlaceholder}
          placeholderTextColor={palette.muted}
          autoCorrect={false}
        />
        <FlatList
          data={matches}
          keyExtractor={(option) => option.value}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          renderItem={({ item, index }) => {
            const showGroup = item.group && item.group !== matches[index - 1]?.group;
            return (
              <View>
                {showGroup && <Text style={styles.group}>{item.group}</Text>}
                <Pressable
                  style={[styles.option, item.value === value && styles.optionSelected]}
                  onPress={() => { onSelect(item.value); setFilter(''); onClose(); }}
                >
                  {item.hint ? <Text style={styles.hint}>{item.hint}</Text> : null}
                  <Text style={[styles.optionText, item.value === value && styles.optionTextSelected]}>{item.label}</Text>
                </Pressable>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#0006' },
    sheet: { maxHeight: '72%', backgroundColor: palette.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    title: { color: palette.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
    close: { color: palette.text, fontSize: 26, lineHeight: 28 },
    filter: { borderColor: palette.border, borderWidth: 1, borderRadius: 8, color: palette.text, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
    group: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 12 },
    optionSelected: { backgroundColor: palette.highlight },
    optionText: { color: palette.text, fontSize: 16, flexShrink: 1 },
    optionTextSelected: { fontWeight: '700' },
    hint: { color: palette.muted, fontSize: 12, minWidth: 24 },
  });
}
