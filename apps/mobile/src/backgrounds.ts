import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

export const verseBackgroundModules: Record<string, number> = {
  'cross-black.jpg': require('../assets/backgrounds/cross-black.jpg'),
  'man-reading-bible-black.jpg': require('../assets/backgrounds/man-reading-bible-black.jpg'),
  'church-color.jpg': require('../assets/backgrounds/church-color.jpg'),
  'flowers-color.jpg': require('../assets/backgrounds/flowers-color.jpg'),
  'flowers-1-color.jpg': require('../assets/backgrounds/flowers-1-color.jpg'),
  'lamb-color.jpg': require('../assets/backgrounds/lamb-color.jpg'),
  'mountains-color.jpg': require('../assets/backgrounds/mountains-color.jpg'),
  'roman-structure-color.jpg': require('../assets/backgrounds/roman-structure-color.jpg'),
  'sunset-color.jpg': require('../assets/backgrounds/sunset-color.jpg'),
  'sunset-1-color.jpg': require('../assets/backgrounds/sunset-1-color.jpg'),
  'valley-color.jpg': require('../assets/backgrounds/valley-color.jpg'),
};

export async function backgroundDataUrl(file: string) {
  const moduleId = verseBackgroundModules[file];
  if (!moduleId) throw new Error('Unknown background');
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:image/jpeg;base64,${base64}`;
}
