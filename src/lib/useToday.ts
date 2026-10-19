import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { localDay } from '../shared/dates.ts';

/** Today's date (yyyy-mm-dd), refreshed at midnight and when the app comes back. */
export function useToday(): string {
  const [today, setToday] = useState(() => localDay(new Date()));
  useEffect(() => {
    const refresh = () => setToday(localDay(new Date()));
    const timer = setInterval(refresh, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return today;
}
