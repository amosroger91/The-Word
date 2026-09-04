export type Language = 'en' | 'es' | 'fr' | 'zh' | 'vi';

export interface Strings {
  languageName: string;
  search: string;
  bookmarks: string;
  closeBookmarks: string;
  toggleTheme: string;
  settings: string;
  interfaceLanguage: string;
  translation: string;
  book: string;
  chapter: string;
  font: string;
  decreaseText: string;
  increaseText: string;
  voice: string;
  decreaseSpeed: string;
  increaseSpeed: string;
  volume: string;
  decreaseVolume: string;
  increaseVolume: string;
  readAloud: string;
  readSelection: string;
  pause: string;
  resume: string;
  stop: string;
  readingAloud: string;
  paused: string;
  previous: string;
  next: string;
  bookmark: string;
  copy: string;
  image: string;
  exporting: string;
  clearSelection: string;
  loading: string;
  chapterMissingTitle: string;
  chapterMissingBody: string;
  searchTitle: string;
  searchPlaceholder: string;
  allWords: string;
  exactPhrase: string;
  allTestaments: string;
  oldTestament: string;
  newTestament: string;
  allBooks: string;
  browseByTopic: string;
  searching: string;
  noMatches: string;
  noBookmarks: string;
  footerFree: string;
  footerLocal: string;
  filterPlaceholder: string;
  noVoice: string;
  results: (count: number) => string;
  chapterReference: (book: string, chapter: number) => string;
  verseReference: (book: string, chapter: number, verses: number[]) => string;
}

function verseList(verses: number[]) {
  return verses.join(', ');
}

export const languages: Language[] = ['en', 'es', 'fr', 'zh', 'vi'];

export const strings: Record<Language, Strings> = {
  en: {
    languageName: 'English',
    search: 'Search',
    bookmarks: 'Bookmarks',
    closeBookmarks: 'Close bookmarks',
    toggleTheme: 'Toggle theme',
    settings: 'Settings',
    interfaceLanguage: 'Language',
    translation: 'Translation',
    book: 'Book',
    chapter: 'Chapter',
    font: 'Font',
    decreaseText: 'Decrease text size',
    increaseText: 'Increase text size',
    voice: 'Speech voice',
    decreaseSpeed: 'Decrease reading speed',
    increaseSpeed: 'Increase reading speed',
    volume: 'Volume',
    decreaseVolume: 'Decrease volume',
    increaseVolume: 'Increase volume',
    readAloud: 'Read aloud',
    readSelection: 'Read selection',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
    readingAloud: 'Reading aloud',
    paused: 'Paused',
    previous: 'Previous',
    next: 'Next',
    bookmark: 'Bookmark',
    copy: 'Copy',
    image: 'Image',
    exporting: 'Exporting…',
    clearSelection: 'Unhighlight selected',
    loading: 'Loading translation…',
    chapterMissingTitle: 'This chapter is not installed yet',
    chapterMissingBody: 'This chapter is not available in the selected translation asset.',
    searchTitle: 'Search',
    searchPlaceholder: 'Search words or an exact phrase…',
    allWords: 'All words',
    exactPhrase: 'Exact phrase',
    allTestaments: 'All Testaments',
    oldTestament: 'Old Testament',
    newTestament: 'New Testament',
    allBooks: 'All Books',
    browseByTopic: 'Browse by topic',
    searching: 'Searching…',
    noMatches: 'No matches for this search and filter combination.',
    noBookmarks: 'No bookmarks yet. Select verses and press Bookmark.',
    footerFree: 'Free Scripture. No ads.',
    footerLocal: 'Local reading mode',
    filterPlaceholder: 'Filter…',
    noVoice: 'No speech voice is installed for this language.',
    results: (count) => `${count} result${count === 1 ? '' : 's'}`,
    chapterReference: (book, chapter) => `${book} chapter ${chapter}`,
    verseReference: (book, chapter, verses) => `${book} chapter ${chapter}, verse${verses.length === 1 ? '' : 's'} ${verseList(verses)}`,
  },
  es: {
    languageName: 'Español',
    search: 'Buscar',
    bookmarks: 'Marcadores',
    closeBookmarks: 'Cerrar marcadores',
    toggleTheme: 'Cambiar tema',
    settings: 'Ajustes',
    interfaceLanguage: 'Idioma',
    translation: 'Traducción',
    book: 'Libro',
    chapter: 'Capítulo',
    font: 'Tipografía',
    decreaseText: 'Reducir el tamaño del texto',
    increaseText: 'Aumentar el tamaño del texto',
    voice: 'Voz de lectura',
    decreaseSpeed: 'Reducir la velocidad de lectura',
    increaseSpeed: 'Aumentar la velocidad de lectura',
    volume: 'Volumen',
    decreaseVolume: 'Bajar el volumen',
    increaseVolume: 'Subir el volumen',
    readAloud: 'Leer en voz alta',
    readSelection: 'Leer selección',
    pause: 'Pausar',
    resume: 'Reanudar',
    stop: 'Detener',
    readingAloud: 'Leyendo en voz alta',
    paused: 'En pausa',
    previous: 'Anterior',
    next: 'Siguiente',
    bookmark: 'Marcador',
    copy: 'Copiar',
    image: 'Imagen',
    exporting: 'Exportando…',
    clearSelection: 'Quitar selección',
    loading: 'Cargando la traducción…',
    chapterMissingTitle: 'Este capítulo aún no está instalado',
    chapterMissingBody: 'Este capítulo no está disponible en la traducción seleccionada.',
    searchTitle: 'Buscar',
    searchPlaceholder: 'Busca palabras o una frase exacta…',
    allWords: 'Todas las palabras',
    exactPhrase: 'Frase exacta',
    allTestaments: 'Ambos Testamentos',
    oldTestament: 'Antiguo Testamento',
    newTestament: 'Nuevo Testamento',
    allBooks: 'Todos los libros',
    browseByTopic: 'Explorar por tema',
    searching: 'Buscando…',
    noMatches: 'No hay resultados para esta búsqueda y estos filtros.',
    noBookmarks: 'Aún no hay marcadores. Selecciona versículos y pulsa Marcador.',
    footerFree: 'Escritura gratuita. Sin anuncios.',
    footerLocal: 'Modo de lectura local',
    filterPlaceholder: 'Filtrar…',
    noVoice: 'No hay ninguna voz instalada para este idioma.',
    results: (count) => `${count} resultado${count === 1 ? '' : 's'}`,
    chapterReference: (book, chapter) => `${book} capítulo ${chapter}`,
    verseReference: (book, chapter, verses) => `${book} capítulo ${chapter}, versículo${verses.length === 1 ? '' : 's'} ${verseList(verses)}`,
  },
  fr: {
    languageName: 'Français',
    search: 'Rechercher',
    bookmarks: 'Signets',
    closeBookmarks: 'Fermer les signets',
    toggleTheme: 'Changer de thème',
    settings: 'Réglages',
    interfaceLanguage: 'Langue',
    translation: 'Traduction',
    book: 'Livre',
    chapter: 'Chapitre',
    font: 'Police',
    decreaseText: 'Réduire la taille du texte',
    increaseText: 'Augmenter la taille du texte',
    voice: 'Voix de lecture',
    decreaseSpeed: 'Réduire la vitesse de lecture',
    increaseSpeed: 'Augmenter la vitesse de lecture',
    volume: 'Volume',
    decreaseVolume: 'Baisser le volume',
    increaseVolume: 'Augmenter le volume',
    readAloud: 'Lire à voix haute',
    readSelection: 'Lire la sélection',
    pause: 'Pause',
    resume: 'Reprendre',
    stop: 'Arrêter',
    readingAloud: 'Lecture en cours',
    paused: 'En pause',
    previous: 'Précédent',
    next: 'Suivant',
    bookmark: 'Signet',
    copy: 'Copier',
    image: 'Image',
    exporting: 'Exportation…',
    clearSelection: 'Désélectionner',
    loading: 'Chargement de la traduction…',
    chapterMissingTitle: "Ce chapitre n'est pas encore installé",
    chapterMissingBody: "Ce chapitre n'est pas disponible dans la traduction sélectionnée.",
    searchTitle: 'Rechercher',
    searchPlaceholder: 'Cherchez des mots ou une expression exacte…',
    allWords: 'Tous les mots',
    exactPhrase: 'Expression exacte',
    allTestaments: 'Les deux Testaments',
    oldTestament: 'Ancien Testament',
    newTestament: 'Nouveau Testament',
    allBooks: 'Tous les livres',
    browseByTopic: 'Parcourir par thème',
    searching: 'Recherche…',
    noMatches: 'Aucun résultat pour cette recherche et ces filtres.',
    noBookmarks: 'Aucun signet pour le moment. Sélectionnez des versets puis appuyez sur Signet.',
    footerFree: 'Écriture gratuite. Sans publicité.',
    footerLocal: 'Mode de lecture local',
    filterPlaceholder: 'Filtrer…',
    noVoice: "Aucune voix n'est installée pour cette langue.",
    results: (count) => `${count} résultat${count === 1 ? '' : 's'}`,
    chapterReference: (book, chapter) => `${book} chapitre ${chapter}`,
    verseReference: (book, chapter, verses) => `${book} chapitre ${chapter}, verset${verses.length === 1 ? '' : 's'} ${verseList(verses)}`,
  },
  zh: {
    languageName: '中文',
    search: '搜索',
    bookmarks: '书签',
    closeBookmarks: '关闭书签',
    toggleTheme: '切换主题',
    settings: '设置',
    interfaceLanguage: '语言',
    translation: '译本',
    book: '书卷',
    chapter: '章',
    font: '字体',
    decreaseText: '缩小字号',
    increaseText: '放大字号',
    voice: '朗读语音',
    decreaseSpeed: '减慢朗读速度',
    increaseSpeed: '加快朗读速度',
    volume: '音量',
    decreaseVolume: '降低音量',
    increaseVolume: '提高音量',
    readAloud: '朗读',
    readSelection: '朗读所选',
    pause: '暂停',
    resume: '继续',
    stop: '停止',
    readingAloud: '正在朗读',
    paused: '已暂停',
    previous: '上一章',
    next: '下一章',
    bookmark: '加书签',
    copy: '复制',
    image: '图片',
    exporting: '正在导出…',
    clearSelection: '取消选择',
    loading: '正在加载译本…',
    chapterMissingTitle: '本章尚未安装',
    chapterMissingBody: '所选译本中没有本章内容。',
    searchTitle: '搜索',
    searchPlaceholder: '搜索词语或完整短语…',
    allWords: '所有词语',
    exactPhrase: '完整短语',
    allTestaments: '新旧约全书',
    oldTestament: '旧约',
    newTestament: '新约',
    allBooks: '所有书卷',
    browseByTopic: '按主题浏览',
    searching: '正在搜索…',
    noMatches: '没有符合此搜索和筛选条件的结果。',
    noBookmarks: '还没有书签。选择经文后点按“加书签”。',
    footerFree: '免费圣经，没有广告。',
    footerLocal: '本地阅读模式',
    filterPlaceholder: '筛选…',
    noVoice: '此语言尚未安装朗读语音。',
    results: (count) => `${count} 个结果`,
    chapterReference: (book, chapter) => `${book}第${chapter}章`,
    verseReference: (book, chapter, verses) => `${book}第${chapter}章 ${verseList(verses)}节`,
  },
  vi: {
    languageName: 'Tiếng Việt',
    search: 'Tìm kiếm',
    bookmarks: 'Dấu trang',
    closeBookmarks: 'Đóng dấu trang',
    toggleTheme: 'Đổi giao diện',
    settings: 'Cài đặt',
    interfaceLanguage: 'Ngôn ngữ',
    translation: 'Bản dịch',
    book: 'Sách',
    chapter: 'Đoạn',
    font: 'Phông chữ',
    decreaseText: 'Giảm cỡ chữ',
    increaseText: 'Tăng cỡ chữ',
    voice: 'Giọng đọc',
    decreaseSpeed: 'Giảm tốc độ đọc',
    increaseSpeed: 'Tăng tốc độ đọc',
    volume: 'Âm lượng',
    decreaseVolume: 'Giảm âm lượng',
    increaseVolume: 'Tăng âm lượng',
    readAloud: 'Đọc to',
    readSelection: 'Đọc phần đã chọn',
    pause: 'Tạm dừng',
    resume: 'Tiếp tục',
    stop: 'Dừng',
    readingAloud: 'Đang đọc',
    paused: 'Đã tạm dừng',
    previous: 'Trước',
    next: 'Tiếp',
    bookmark: 'Dấu trang',
    copy: 'Sao chép',
    image: 'Hình ảnh',
    exporting: 'Đang xuất…',
    clearSelection: 'Bỏ chọn',
    loading: 'Đang tải bản dịch…',
    chapterMissingTitle: 'Đoạn này chưa được cài đặt',
    chapterMissingBody: 'Đoạn này không có trong bản dịch đã chọn.',
    searchTitle: 'Tìm kiếm',
    searchPlaceholder: 'Tìm từ hoặc cụm từ chính xác…',
    allWords: 'Mọi từ',
    exactPhrase: 'Cụm từ chính xác',
    allTestaments: 'Cả hai Giao ước',
    oldTestament: 'Cựu Ước',
    newTestament: 'Tân Ước',
    allBooks: 'Mọi sách',
    browseByTopic: 'Xem theo chủ đề',
    searching: 'Đang tìm…',
    noMatches: 'Không có kết quả cho tìm kiếm và bộ lọc này.',
    noBookmarks: 'Chưa có dấu trang. Hãy chọn câu rồi nhấn Dấu trang.',
    footerFree: 'Kinh Thánh miễn phí. Không quảng cáo.',
    footerLocal: 'Chế độ đọc ngoại tuyến',
    filterPlaceholder: 'Lọc…',
    noVoice: 'Chưa cài giọng đọc cho ngôn ngữ này.',
    results: (count) => `${count} kết quả`,
    chapterReference: (book, chapter) => `${book} đoạn ${chapter}`,
    verseReference: (book, chapter, verses) => `${book} đoạn ${chapter}, câu ${verseList(verses)}`,
  },
};

export function resolveLanguage(value: string | null): Language {
  return languages.includes(value as Language) ? (value as Language) : 'en';
}
