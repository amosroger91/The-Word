import { useCallback, useEffect, useRef, useState } from 'react';
import { connectStudyBoard, type PublicStudy } from './studyBoard';

export function useStudyBoard(wanted: boolean) {
  const [list, setList] = useState<PublicStudy[]>([]);
  const boardRef = useRef<ReturnType<typeof connectStudyBoard> | null>(null);

  useEffect(() => {
    if (!wanted) {
      boardRef.current?.stop();
      boardRef.current = null;
      setList([]);
      return;
    }
    const board = connectStudyBoard(setList);
    boardRef.current = board;
    return () => {
      board.stop();
      if (boardRef.current === board) boardRef.current = null;
    };
  }, [wanted]);

  const advertise = useCallback((listing: PublicStudy) => {
    boardRef.current?.advertise(listing);
  }, []);

  const retract = useCallback((code: string) => {
    boardRef.current?.retract(code);
  }, []);

  return { list, advertise, retract };
}
