export interface BibleTopic {
  id: string;
  name: string;
  description: string;
  references: Array<{ bookId: number; chapter: number; verse: number }>;
}

export const BIBLE_TOPICS: BibleTopic[] = [
  { id: 'salvation', name: 'Salvation', description: 'Grace, faith, forgiveness, and new life.', references: [{ bookId: 43, chapter: 3, verse: 16 }, { bookId: 43, chapter: 3, verse: 17 }, { bookId: 45, chapter: 10, verse: 9 }, { bookId: 49, chapter: 2, verse: 8 }, { bookId: 56, chapter: 3, verse: 5 }] },
  { id: 'love', name: 'Love', description: 'God’s love and love for one another.', references: [{ bookId: 43, chapter: 3, verse: 16 }, { bookId: 43, chapter: 13, verse: 34 }, { bookId: 62, chapter: 4, verse: 7 }, { bookId: 62, chapter: 4, verse: 8 }, { bookId: 46, chapter: 13, verse: 4 }] },
  { id: 'faith', name: 'Faith', description: 'Trusting God through every season.', references: [{ bookId: 58, chapter: 11, verse: 1 }, { bookId: 45, chapter: 5, verse: 1 }, { bookId: 41, chapter: 11, verse: 24 }, { bookId: 20, chapter: 3, verse: 5 }, { bookId: 59, chapter: 1, verse: 6 }] },
  { id: 'prayer', name: 'Prayer', description: 'Words and promises for a life of prayer.', references: [{ bookId: 40, chapter: 6, verse: 6 }, { bookId: 40, chapter: 6, verse: 9 }, { bookId: 50, chapter: 4, verse: 6 }, { bookId: 52, chapter: 5, verse: 17 }, { bookId: 19, chapter: 23, verse: 4 }] },
  { id: 'peace', name: 'Peace', description: 'Rest for anxious hearts and troubled minds.', references: [{ bookId: 43, chapter: 14, verse: 27 }, { bookId: 50, chapter: 4, verse: 7 }, { bookId: 23, chapter: 26, verse: 3 }, { bookId: 19, chapter: 4, verse: 8 }, { bookId: 45, chapter: 5, verse: 1 }] },
  { id: 'wisdom', name: 'Wisdom', description: 'Guidance for choices, words, and daily life.', references: [{ bookId: 20, chapter: 1, verse: 7 }, { bookId: 20, chapter: 3, verse: 5 }, { bookId: 59, chapter: 1, verse: 5 }, { bookId: 19, chapter: 111, verse: 10 }, { bookId: 21, chapter: 12, verse: 13 }] },
  { id: 'courage', name: 'Courage', description: 'Strength and courage in difficult places.', references: [{ bookId: 6, chapter: 1, verse: 9 }, { bookId: 19, chapter: 27, verse: 1 }, { bookId: 55, chapter: 1, verse: 7 }, { bookId: 23, chapter: 41, verse: 10 }, { bookId: 43, chapter: 16, verse: 33 }] },
  { id: 'hope', name: 'Hope', description: 'Hope rooted in God’s promises.', references: [{ bookId: 24, chapter: 29, verse: 11 }, { bookId: 45, chapter: 15, verse: 13 }, { bookId: 58, chapter: 6, verse: 19 }, { bookId: 60, chapter: 1, verse: 3 }, { bookId: 19, chapter: 42, verse: 11 }] },
  { id: 'jesus', name: 'Jesus', description: 'The life, words, and work of Jesus Christ.', references: [{ bookId: 43, chapter: 1, verse: 1 }, { bookId: 40, chapter: 1, verse: 21 }, { bookId: 41, chapter: 10, verse: 45 }, { bookId: 42, chapter: 19, verse: 10 }, { bookId: 43, chapter: 14, verse: 6 }] },
  { id: 'suffering', name: 'Suffering', description: 'Comfort and faith in suffering.', references: [{ bookId: 45, chapter: 8, verse: 28 }, { bookId: 47, chapter: 1, verse: 3 }, { bookId: 60, chapter: 5, verse: 7 }, { bookId: 59, chapter: 1, verse: 2 }, { bookId: 19, chapter: 34, verse: 18 }] },
];
