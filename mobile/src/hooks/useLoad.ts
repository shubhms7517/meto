import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { onNetChange } from '../lib/netStatus';

/**
 * Page ka data: pehli baar loading, phir error (Retry) ya data; neeche kheencho → refresh.
 * focus: screen pe wapas aate hi chupchaap taaza (purana data dikhta rehta hai).
 */
export function useLoad<T>(fetcher: () => Promise<T>, { focus = false }: { focus?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fn = useRef(fetcher);
  fn.current = fetcher;

  const run = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try {
      setData(await fn.current());
      setFailed(false);
    } catch {
      setFailed(true); // purana data ho to wahi dikhta rahe
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!focus) run();
  }, [focus, run]);
  // Server wapas aaya → jo page fail tha wo khud dobara load
  const failedRef = useRef(false);
  failedRef.current = failed;
  useEffect(() => onNetChange(on => on && failedRef.current && run()), [run]);
  useFocusEffect(
    useCallback(() => {
      if (focus) run();
    }, [focus, run]),
  );

  return {
    data,
    setData,
    loading: data === null && !failed,
    failed: failed && data === null, // sirf tab error page jab dikhane ko kuch nahi
    refreshing,
    refresh: () => run(true),
    retry: () => {
      setFailed(false);
      run();
    },
  };
}
