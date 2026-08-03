export function createInventoryHistoryDetailState() {
  return {
    sessionId: '',
    requestId: 0,
    loading: false,
    record: null,
    lines: [],
    error: '',
  };
}

export function selectInventoryHistoryDetail(state, sessionId) {
  if (!sessionId) return createInventoryHistoryDetailState();
  const keepCurrent = state?.record?.id === sessionId;
  return {
    sessionId,
    requestId: Number(state?.requestId || 0),
    loading: true,
    record: keepCurrent ? state.record : null,
    lines: keepCurrent && Array.isArray(state.lines) ? state.lines : [],
    error: '',
  };
}

export function beginInventoryHistoryDetailRequest(state, sessionId, requestId) {
  return {
    ...selectInventoryHistoryDetail(state, sessionId),
    requestId,
  };
}

export function settleInventoryHistoryDetailRequest(
  state,
  { selectedSessionId, requestedSessionId, requestId, result },
) {
  if (
    state?.sessionId !== requestedSessionId
    || state?.requestId !== requestId
    || selectedSessionId !== requestedSessionId
  ) return state;

  if (
    !result?.ok
    || result.record?.id !== requestedSessionId
    || !Array.isArray(result.lines)
  ) {
    return {
      ...state,
      loading: false,
      record: null,
      lines: [],
      error: result?.message || 'The Stock Count detail could not be loaded.',
    };
  }

  return {
    ...state,
    loading: false,
    record: result.record,
    lines: result.lines,
    error: '',
  };
}

export function inventoryHistoryDetailView(state, selectedSessionId) {
  if (!selectedSessionId) return { state: 'empty', record: null, lines: [], error: '' };
  if (state?.sessionId !== selectedSessionId) {
    return { state: 'loading', record: null, lines: [], error: '' };
  }
  if (state.error) {
    return { state: 'error', record: null, lines: [], error: state.error };
  }
  if (state.record?.id === selectedSessionId && Array.isArray(state.lines)) {
    return {
      state: 'ready',
      record: state.record,
      lines: state.lines,
      error: '',
      refreshing: state.loading === true,
    };
  }
  return { state: 'loading', record: null, lines: [], error: '' };
}
