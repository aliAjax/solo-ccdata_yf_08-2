import React, { useState } from 'react';
import { useStore } from './store.jsx';
import { fmtTime } from './model.js';

const KIND_META = {
  entity: { icon: '⚙', cls: 'log-entity', label: '基础数据' },
  action: { icon: '✎', cls: 'log-action', label: '行动编辑' },
  transition: { icon: '⇄', cls: 'log-transition', label: '状态流转' },
  batch: { icon: '▤', cls: 'log-batch', label: '批量操作' },
  import: { icon: '⇩', cls: 'log-import', label: '导入' },
  undo: { icon: '↶', cls: 'log-undo', label: '撤销' },
  redo: { icon: '↷', cls: 'log-redo', label: '重做' },
  system: { icon: '✦', cls: 'log-system', label: '系统' },
};

export default function LogView() {
  const { state } = useStore();
  const [filter, setFilter] = useState('all');
  const log = state.log || [];
  const shown = filter === 'all' ? log : log.filter((e) => e.kind === filter);

  return (
    <div className="logview">
      <div className="entity-head">
        <h2>变更留痕 <small className="muted">最近 {log.length} 条（自动记录，不可手工修改）</small></h2>
        <div className="seg">
          {[['all', '全部'], ...Object.entries(KIND_META).map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <button key={k} className={`seg-btn ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      </div>
      <ul className="log-list" data-testid="log-list">
        {shown.map((e) => {
          const meta = KIND_META[e.kind] || KIND_META.system;
          return (
            <li key={e.id} className={`log-item ${meta.cls}`} data-testid="log-item">
              <span className="log-icon">{meta.icon}</span>
              <div className="log-body">
                <span className="log-tag">{meta.label}</span>
                <span className="log-text">{e.text}</span>
              </div>
              <time className="log-time mono">{fmtTime(e.at)}</time>
            </li>
          );
        })}
        {shown.length === 0 && <li className="muted pad">暂无该类记录</li>}
      </ul>
    </div>
  );
}
