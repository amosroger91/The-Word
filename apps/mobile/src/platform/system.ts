import { Appearance, NativeModules, Platform } from 'react-native';

export function deviceLocales(): string[] {
  if (Platform.OS === 'ios') {
    const settings = NativeModules.SettingsManager?.settings;
    const languages = settings?.AppleLanguages;
    if (Array.isArray(languages) && languages.length) return languages.map(String);
    if (settings?.AppleLocale) return [String(settings.AppleLocale)];
  } else {
    const identifier = NativeModules.I18nManager?.localeIdentifier;
    if (identifier) return [String(identifier)];
  }
  const intl = Intl.DateTimeFormat().resolvedOptions().locale;
  return intl ? [intl] : ['en'];
}

export function deviceColorScheme(): 'light' | 'dark' {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export function watchDeviceColorScheme(listener: (theme: 'light' | 'dark') => void): () => void {
  const subscription = Appearance.addChangeListener(({ colorScheme }) => {
    listener(colorScheme === 'dark' ? 'dark' : 'light');
  });
  return () => subscription.remove();
}
