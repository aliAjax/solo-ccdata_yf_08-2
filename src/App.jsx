import React, { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store.jsx';
import { ToastProvider } from './ui.jsx';
import ActionsView from './ActionsView.jsx';
import EntitiesView from './EntitiesView.jsx';
import LogView from './LogView.jsx';
import ImportExportView from './ImportExportView.jsx';
import { isOverdue } from './model.js';

const NAV = [
  { key: 'actions', icon: '⚔', label: '行动调度' },
  { key: 'entities', icon: '⚙', label: '基础数据' },
  { key: 'log', icon: '📜', label: '变更留痕' },
  { key: 'io', icon: '⇅', label: '导入 / 导出' },
];

function Shell() {
  const store = useStore();
  const { state, undo, redo, canUndo, canRedo, undoLabel, redoLabel } = store;
  const [view, setView] = useState('actions');
  const [highlightId, setHighlightId] = useState(null);

  // Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const overdueCount = state.actions.filter((a) => isOverdue(a)).length;
  const draftCount = state.actions.filter((a) => a.status === 'draft').length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">◆</span>
          <div><b>战役调度台</b><small>CAMPAIGN OPS CONSOLE</small></div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.key} className={`nav-btn ${view === n.key ? 'on' : ''}`}
              onClick={() => setView(n.key)} data-testid={`nav-${n.key}`}>
              <i>{n.icon}</i>{n.label}
              {n.key === 'actions' && overdueCount > 0 && <em className="nav-dot" title={`${overdueCount} 个逾期`}>{overdueCount}</em>}
            </button>
          ))}
        </nav>
        <div className="side-stats">
          <div><b>{state.actions.length}</b><small>行动</small></div>
          <div><b className={overdueCount ? 'red' : ''}>{overdueCount}</b><small>逾期</small></div>
          <div><b>{draftCount}</b><small>草稿</small></div>
        </div>
        <div className="undo-box">
          <button className="btn btn-mini" disabled={!canUndo} onClick={undo} title={undoLabel} data-testid="undo">↶ 撤销{undoLabel ? `：${undoLabel}` : ''}</button>
          <button className="btn btn-mini" disabled={!canRedo} onClick={redo} title={redoLabel} data-testid="redo">↷ 重做{redoLabel ? `：${redoLabel}` : ''}</button>
        </div>
        <small className="side-foot">本地自动保存 · 刷新不丢失</small>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{NAV.find((n) => n.key === view)?.label}</h1>
          <div className="topbar-right">
            {view === 'actions' && <span className="chip chip-warn" data-testid="kpi-overdue">逾期 {overdueCount}</span>}
          </div>
        </header>
        <div className="content">
          {view === 'actions' && <ActionsView highlightId={highlightId} onHighlight={(id) => {
            setHighlightId(id);
            setTimeout(() => setHighlightId(null), 2500);
          }} />}
          {view === 'entities' && <EntitiesView />}
          {view === 'log' && <LogView />}
          {view === 'io' && <ImportExportView />}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  );
}
