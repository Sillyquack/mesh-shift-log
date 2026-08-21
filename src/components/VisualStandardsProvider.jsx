import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  fetchVisualStandards,
  getVisualStandardPublicUrl,
  publishVisualStandard,
  restoreVisualStandardVersion,
} from '../lib/visualStandardsClient.js';
import {
  resolveAllVisualStandards,
  resolveVisualStandard,
} from '../lib/visualStandards.js';

const VisualStandardsContext = createContext(null);

export function VisualStandardsProvider({ children }) {
  const [backendRecords, setBackendRecords] = useState([]);
  const [status, setStatus] = useState({
    state: 'loading',
    message: 'Loading Visual Standards…',
    lastRefreshedAt: '',
  });

  const refresh = useCallback(async () => {
    const result = await fetchVisualStandards();
    if (result.ok) {
      setBackendRecords(result.records);
      setStatus({
        state: 'ready',
        message: result.message,
        lastRefreshedAt: new Date().toISOString(),
      });
    } else {
      setStatus({
        state: result.mode === 'backend_unavailable' ? 'fallback' : 'error',
        message: result.message,
        lastRefreshedAt: new Date().toISOString(),
      });
    }
    return result;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function refreshWhenReturning() {
      if (document.visibilityState === 'visible') refresh();
    }
    window.addEventListener('focus', refreshWhenReturning);
    document.addEventListener('visibilitychange', refreshWhenReturning);
    return () => {
      window.removeEventListener('focus', refreshWhenReturning);
      document.removeEventListener('visibilitychange', refreshWhenReturning);
    };
  }, [refresh]);

  const standards = useMemo(
    () => resolveAllVisualStandards(backendRecords, getVisualStandardPublicUrl),
    [backendRecords],
  );
  const standardsByKey = useMemo(
    () => new Map(standards.map((standard) => [standard.canonicalKey, standard])),
    [standards],
  );

  const resolve = useCallback(
    (canonicalKey, fallback = null) =>
      standardsByKey.get(canonicalKey) ||
      resolveVisualStandard(canonicalKey) ||
      fallback,
    [standardsByKey],
  );

  const publish = useCallback(async (input) => {
    const result = await publishVisualStandard(input);
    if (result.ok && result.record) {
      setBackendRecords((current) => [
        ...current.filter(
          (record) => record.canonicalKey !== result.record.canonicalKey,
        ),
        result.record,
      ]);
      setStatus({
        state: 'ready',
        message: result.message,
        lastRefreshedAt: new Date().toISOString(),
      });
    }
    return result;
  }, []);

  const restore = useCallback(async (input) => {
    const result = await restoreVisualStandardVersion(input);
    if (result.ok && result.record) {
      setBackendRecords((current) => [
        ...current.filter(
          (record) => record.canonicalKey !== result.record.canonicalKey,
        ),
        result.record,
      ]);
      setStatus({
        state: 'ready',
        message: result.message,
        lastRefreshedAt: new Date().toISOString(),
      });
    }
    return result;
  }, []);

  const value = useMemo(
    () => ({ standards, resolve, refresh, publish, restore, status }),
    [standards, resolve, refresh, publish, restore, status],
  );

  return (
    <VisualStandardsContext.Provider value={value}>
      {children}
    </VisualStandardsContext.Provider>
  );
}

export function useVisualStandards() {
  const context = useContext(VisualStandardsContext);
  if (!context) {
    throw new Error('useVisualStandards must be used inside VisualStandardsProvider.');
  }
  return context;
}
