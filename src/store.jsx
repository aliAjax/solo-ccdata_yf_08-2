import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { reducer, seedState, loadState, saveState, STORAGE_KEY } from './model.js';

const HISTORY_LIMIT = 80;
const StoreCtx = createContext(null);
const stripLog = (s) => {
  const { log, ...rest } = s;
  return rest;
};

let logCounter = 0;
function withLogEntry(presentLog, entry) {
  const id = `log-u${++logCounter}-${Date.now()}`;
  return [{ id, at: new Date().toISOString(), ...entry }, ...presentLog].slice(0, 500);
}

function initialHistory() {
  const loaded = loadState();
  if (loaded && loaded.present) {
    return loaded;
  }
  const seed = seedState();
  seed.log = [{
    id: 'log-seed', at: new Date().toISOString(), kind: 'system',
    text: '初始化战役数据（可随时在「导入 / 导出」中重置为示例数据）',
  }];
  return { past: [], present: seed, future: [] };
}

export function StoreProvider({ children }) {
  const [hist, setHist] = useState(initialHistory);
  const histRef = useRef(hist);
  histRef.current = hist;

  // 刷新后保留：整段历史（含撤销/重做栈）写入 localStorage
  useEffect(() => { saveState(hist); }, [hist]);

  const api = useMemo(() => ({
    state: hist.present,

    // 所有写操作的唯一入口：reducer 产出下一状态 + 一条审计记录；快照入撤销栈
    commit(action, label) {
      setHist((h) => {
        const { next, entry } = reducer(h.present, action);
        if (!entry) return h;
        const present = { ...next, log: withLogEntry(h.present.log, entry) };
        const past = h.past.concat({ snap: stripLog(h.present), label: label || entry.text }).slice(-HISTORY_LIMIT);
        return { past, present, future: [] };
      });
    },

    undo() {
      setHist((h) => {
        if (!h.past.length) return h;
        const { snap, label } = h.past[h.past.length - 1];
        const present = {
          ...snap,
          log: withLogEntry(h.present.log, { kind: 'undo', text: `撤销：${label}` }),
        };
        return {
          past: h.past.slice(0, -1),
          present,
          future: [{ snap: stripLog(h.present), label }, ...h.future].slice(0, HISTORY_LIMIT),
        };
      });
    },

    redo() {
      setHist((h) => {
        if (!h.future.length) return h;
        const { snap, label } = h.future[0];
        const present = {
          ...snap,
          log: withLogEntry(h.present.log, { kind: 'redo', text: `重做：${label}` }),
        };
        return {
          past: h.past.concat({ snap: stripLog(h.present), label }).slice(-HISTORY_LIMIT),
          present,
          future: h.future.slice(1),
        };
      });
    },

    resetToSeed() {
      const seed = seedState();
      seed.log = withLogEntry(histRef.current.present.log, { kind: 'system', text: '重置为内置示例数据（整库替换，可撤销恢复）' });
      setHist({ past: histRef.current.past.concat({ snap: stripLog(histRef.current.present), label: '重置示例数据' }).slice(-HISTORY_LIMIT), present: seed, future: [] });
    },

    replaceAll(nextWithoutLog, label) {
      const present = {
        ...nextWithoutLog,
        log: withLogEntry(histRef.current.present.log, { kind: 'import', text: label }),
      };
      setHist({
        past: histRef.current.past.concat({ snap: stripLog(histRef.current.present), label }).slice(-HISTORY_LIMIT),
        present,
        future: [],
      });
    },

    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
    undoLabel: hist.past.at(-1)?.label,
    redoLabel: hist.future[0]?.label,
    storageKey: STORAGE_KEY,
  }), [hist]);

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// 每 30 秒走动一次的时钟，驱动逾期标记
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
