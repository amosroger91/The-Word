import { createContext, useContext, type ReactNode } from 'react';
import type { PublicStudy } from '../../../web/src/studyBoard';
import type { useLedger } from '../../../web/src/useLedger';
import type { ReadParty } from '../../../web/src/useReadParty';
import type { useStudy } from '../../../web/src/useStudy';

export type Tool = 'progress' | 'study' | 'group' | 'account' | 'note' | 'breakdown';

export interface Features {
  ledger: ReturnType<typeof useLedger>;
  study: ReturnType<typeof useStudy>;
  party: ReadParty;
  tool: Tool | null;
  openTool: (tool: Tool | null) => void;
  noteVerse: number | null;
  openNote: (verse: number) => void;
  reloadSession: () => void;
  webrtc: boolean;
  board: PublicStudy[];
  pendingGroup: string;
  setPendingGroup: (code: string) => void;
}

const FeatureContext = createContext<Features | null>(null);

export function FeatureProvider({ value, children }: { value: Features; children: ReactNode }) {
  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
}

export function useFeatures(): Features {
  const value = useContext(FeatureContext);
  if (!value) throw new Error('Study features are not ready.');
  return value;
}

export function useOptionalFeatures(): Features | null {
  return useContext(FeatureContext);
}
