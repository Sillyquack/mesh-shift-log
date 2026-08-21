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
  publishVisualStandard,
  publishVisualStandardDetail,
  restoreVisualStandardDetailVersion,
  restoreVisualStandardVersion,
} from '../lib/visualStandardsClient.js';
import {
  attachVisualStandardDetails,
  resolveAllVisualStandards,
  resolveVisualStandard,
} from '../lib/visualStandards.js';
import { resolveCanonicalVisualStandardKey } from '../data/workbarVisualStandards.js';

const VisualStandardsContext = createContext(null);

export function VisualStandardsProvider({ children }) {
  const [backendRecords, setBackendRecords] = useState([]);
  const [backendDetailRecords, setBackendDetailRecords] = useState([]);
  const [status, setStatus] = useState({
    state: 'loading',
    message: 'Loading Visual Standards…',
    lastRefreshedAt: '',
  });

  const refresh = useCallback(async () => {
    const result = await fetchVisualStandards();
    if (result.ok) {
      setBackendRecords(result.records);
      setBackendDetailRecords(result.detailRecords || []);
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
    () => attachVisualStandardDetails(
      resolveAllVisualStandards(backendRecords),
      backendDetailRecords,
    ),
    [backendRecords, backendDetailRecords],
  );
  const standardsByKey = useMemo(
    () => new Map(standards.map((standard) => [standard.canonicalKey, standard])),
    [standards],
  );

  const resolve = useCallback(
    (canonicalKey, fallback = null) => {
      const resolvedKey = resolveCanonicalVisualStandardKey(canonicalKey);
      return standardsByKey.get(resolvedKey)
        || resolveVisualStandard(resolvedKey)
        || fallback;
    },
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

  const publishDetail = useCallback(async (input) => {
    const result = await publishVisualStandardDetail(input);
    if (result.ok && result.record) {
      setBackendDetailRecords((current) => [
        ...current.filter(
          (record) => !(
            record.canonicalKey === result.record.canonicalKey
            && record.detailKey === result.record.detailKey
          ),
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

  const restoreDetail = useCallback(async (input) => {
    const result = await restoreVisualStandardDetailVersion(input);
    if (result.ok && result.record) {
      setBackendDetailRecords((current) => [
        ...current.filter(
          (record) => !(
            record.canonicalKey === result.record.canonicalKey
            && record.detailKey === result.record.detailKey
          ),
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
    () => ({
      standards,
      resolve,
      refresh,
      publish,
      publishDetail,
      restore,
      restoreDetail,
      status,
    }),
    [standards, resolve, refresh, publish, publishDetail, restore, restoreDetail, status],
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
