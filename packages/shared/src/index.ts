/**
 * Shared constants and types for The Word Bible App
 */

// Bible book structure
export interface BibleBook {
  id: number;
  name: string;
  shortName: string;
  testament: 'old' | 'new';
  chapters: number;
}

// Verse reference
export interface VerseRef {
  bookId: number;
  chapter: number;
  verse: number;
}

// Verse text
export interface Verse {
  ref: VerseRef;
  text: string;
  redLetters?: Array<[number, number]>;
}

// Chapter with verses
export interface Chapter {
  bookId: number;
  chapter: number;
  verses: Verse[];
}

// Translation metadata
export interface Translation {
  id: string;
  name: string;
  shortName: string;
  description: string;
  copyright: string;
  language: string;
  isPublicDomain: boolean;
  apiEndpoint?: string;
}

// Search result
export interface SearchResult {
  verse: Verse;
  translationId: string;
  score: number;
}

// User preferences
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  translationId: string;
  showVerseNumbers: boolean;
  showCrossReferences: boolean;
  showFootnotes: boolean;
}

// Reading plan
export interface ReadingPlan {
  id: string;
  name: string;
  description: string;
  durationDays: number;
  readings: ReadingPlanDay[];
}

// Reading plan day
export interface ReadingPlanDay {
  day: number;
  passages: ReadingPlanPassage[];
}

// Reading plan passage
export interface ReadingPlanPassage {
  bookId: number;
  startChapter: number;
  startVerse?: number;
  endChapter: number;
  endVerse?: number;
}

// Highlight color
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'purple';

// User highlight
export interface UserHighlight {
  id: string;
  verseRef: VerseRef;
  translationId: string;
  color: HighlightColor;
  createdAt: Date;
  noteId?: string;
}

// User bookmark
export interface UserBookmark {
  id: string;
  verseRef: VerseRef;
  translationId: string;
  label?: string;
  createdAt: Date;
}

// User note
export interface UserNote {
  id: string;
  verseRef: VerseRef;
  translationId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

// Achievement
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteria: AchievementCriteria;
}

// Achievement criteria
export interface AchievementCriteria {
  type: 'streak' | 'chapters_read' | 'books_completed' | 'plan_completed' | 'testament_completed' | 'bible_completed';
  value: number;
  testament?: 'old' | 'new';
  bookIds?: number[];
  planIds?: string[];
}

// User achievement
export interface UserAchievement {
  achievementId: string;
  unlockedAt: Date;
  progress: number;
}

// Verse image template
export interface VerseImageTemplate {
  id: string;
  name: string;
  background: string; // image URL or color
  fontFamily: string;
  fontSize: number;
  textColor: string;
  alignment: 'left' | 'center' | 'right';
  padding: number;
  showReference: boolean;
  showTranslation: boolean;
}

// Sync data
export interface SyncData {
  highlights: UserHighlight[];
  bookmarks: UserBookmark[];
  notes: UserNote[];
  readingProgress: ReadingProgress[];
  preferences: UserPreferences;
  achievements: UserAchievement[];
}

// Reading progress
export interface ReadingProgress {
  planId: string;
  currentDay: number;
  completedDays: number[];
  startedAt: Date;
  lastReadAt: Date;
}

// Premium entitlements
export interface Entitlements {
  cloudSync: boolean;
  advancedSearch: boolean;
  verseImageDesigner: boolean;
  customThemes: boolean;
  advancedStats: boolean;
  customReadingPlans: boolean;
  widgets: boolean;
  studyTools: boolean;
}

// API response wrapper
export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}