import React, { useState } from 'react';
import { useStore } from './store.jsx';
import { useToast } from './ui.jsx';
import { ENTITY_DEFS, usageOf, fmtTime, supplyUsage } from './model.js';
import { Modal, Field, ConfirmModal } from './ui.jsx';

const KIND_ICONS = { factions: '♜', units: '▰', officers: '♟', locations: '⌖', supplies: '◇' };

export default function EntitiesView() {
  const store = useStore();
  const { state } = store;
  const [kind, setKind] = useState('factions');
  const [editing, setEditing] = useState(null); // item or '__new__'
  const [deleting, setDeleting] = useState(null);

  const used = supplyUsage(state);

  return (
    <div className="entities">
      <div className="entity-tabs">
        {Object.entries(ENTITY_DEFS).map(([k, def]) => (
          <button key={k} className={`entity-tab ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)} data-testid={`entity-tab-${k}`}>
            <i>{KIND_ICONS[k]}</i>{def.label}<em>{state[k].length}</em>
          </button>
        ))}
      </div>

      <div className="entity-head">
        <h2>{ENTITY_DEFS[kind].label}</h2>
        <button className="btn btn-primary" onClick={() => setEditing('__new__')} data-testid="entity-new">＋ 新建{ENTITY_DEFS[kind].label}</button>
      </div>

      <div className="entity-grid" data-testid="entity-grid">
        {state[kind].map((item) => (
          <div key={item.id} className="entity-card" data-testid={`entity-card-${item.id}`}>
            <EntityCard kind={kind} item={item} state={state} used={used} />
            <div className="entity-card-ops">
              <button className="btn btn-mini" onClick={() => setEditing(item)} data-testid={`entity-edit-${item.id}`}>编辑</button>
              <button className="btn btn-mini btn-ghost-danger" onClick={() => setDeleting(item)} data-testid={`entity-del-${item.id}`}>删除</button>
            </div>
          </div>
        ))}
        {state[kind].length === 0 && <div className="muted pad">暂无{ENTITY_DEFS[kind].label}，点击右上角新建。</div>}
      </div>

      {editing && <EntityForm key={editing === '__new__' ? 'new' : editing.id} kind={kind} initial={editing === '__new__' ? null : editing}
        onClose={() => setEditing(null)} />}

      {deleting && <DeleteEntity kind={kind} item={deleting} onClose={() => setDeleting(null)} onDeleted={() => setDeleting(null)} />}
    </div>
  );
}

function EntityCard({ kind, item, state, used }) {
  if (kind === 'factions') return (
    <div className="ec-body">
      <span className="color-dot" style={{ background: item.color }} />
      <b>{item.name}</b>
      {item.code && <em className="muted mono">{item.code}</em>}
      <div className="muted small">{state.units.filter((u) => u.factionId === item.id).length} 支部队</div>
    </div>
  );
  if (kind === 'units') {
    const fac = state.factions.find((f) => f.id === item.factionId);
    return <div className="ec-body">
      <b>{item.name}</b>
      {fac && <span className="chip">{fac.name}</span>}
      <div className="muted small">兵力 {item.strength ?? 0} · {state.officers.filter((o) => o.unitId === item.id).length} 名军官</div>
    </div>;
  }
  if (kind === 'officers') {
    const u = state.units.find((x) => x.id === item.unitId);
    return <div className="ec-body">
      <b>{item.name}</b>{item.rank && <span className="chip">{item.rank}</span>}
      <div className="muted small">{u?.name || '未编入部队'}</div>
    </div>;
  }
  if (kind === 'locations') return <div className="ec-body">
    <b>{item.name}</b>{item.kind && <span className="chip">{item.kind}</span>}
    <div className="muted small">
      {item.windows?.length
        ? item.windows.map((w, i) => <div key={i}>开放 {fmtTime(w.start)} – {fmtTime(w.end)}</div>)
        : '全天开放'}
    </div>
  </div>;
  return <div className="ec-body">
    <b>{item.name}</b>{item.unit && <span className="chip">{item.unit}</span>}
    <div className="muted small">
      库存 <b className={used[item.id] > item.stock ? 'short' : ''}>{item.stock}{item.unit}</b>
      {' '}· 已批准/执行占用 {used[item.id] || 0}{item.unit}
    </div>
  </div>;
}

function EntityForm({ kind, initial, onClose }) {
  const store = useStore();
  const { state, commit } = store;
  const toast = useToast();
  const def = ENTITY_DEFS[kind];
  const blank = {};
  for (const f of def.fields) if (f.default !== undefined) blank[f.key] = f.default;
  const [f, setF] = useState(initial ? { ...initial, windowsText: windowsToText(initial.windows) } : { ...blank, windowsText: '' });
  const [err, setErr] = useState('');

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = () => {
    if (def.nameField && !String(f[def.nameField] || '').trim()) { setErr('名称不能为空'); return; }
    let windows;
    if (kind === 'locations') {
      const parsed = parseWindows(f.windowsText);
      if (parsed.error) { setErr(parsed.error); return; }
      windows = parsed.windows;
    }
    const n = (state.seq[kind] || 0) + 1;
    const item = { id: initial?.id || `${def.idPrefix}-${n}` };
    for (const fld of def.fields) {
      if (fld.type === 'windows') continue;
      let v = f[fld.key];
      if (fld.type === 'number') v = Number(v) || 0;
      item[fld.key] = v ?? (fld.type === 'ref' ? '' : '');
    }
    if (kind === 'locations') item.windows = windows;
    if (kind === 'factions' && !item.color) item.color = '#7fa8c9';
    commit({ type: 'entity/upsert', kind, item }, initial ? `编辑${def.label}` : `新建${def.label}`);
    toast(`${initial ? '已保存' : '已新建'}${def.label}「${item[def.nameField]}」`, 'success');
    onClose();
  };

  return (
    <Modal title={`${initial ? '编辑' : '新建'}${def.label}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={save} data-testid="entity-save">保存</button></>}>
      {err && <div className="alert alert-error" data-testid="entity-error">{err}</div>}
      <div className="form-grid">
        {def.fields.map((fld) => {
          if (fld.type === 'color') return (
            <Field key={fld.key} label={fld.label}>
              <input type="color" className="inp inp-color" value={f[fld.key] || '#7fa8c9'} onChange={(e) => set(fld.key, e.target.value)} />
            </Field>
          );
          if (fld.type === 'number') return (
            <Field key={fld.key} label={fld.label}>
              <input type="number" min="0" className="inp" value={f[fld.key] ?? 0} onChange={(e) => set(fld.key, e.target.value)} />
            </Field>
          );
          if (fld.type === 'ref') {
            const refs = state[fld.refType];
            return (
              <Field key={fld.key} label={fld.label}>
                <select className="inp" value={f[fld.key] || ''} onChange={(e) => set(fld.key, e.target.value)}>
                  <option value="">{fld.placeholder || '无'}</option>
                  {refs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
            );
          }
          if (fld.type === 'windows') return (
            <div key={fld.key} className="span2">
              <Field label={fld.label} hint="每行一段，用竖线 | 分隔开始与结束（如 2026-09-13 08:00 | 2026-09-14 18:00）；留空表示全天开放">
                <textarea rows="4" className="inp mono small" value={f.windowsText || ''} onChange={(e) => set('windowsText', e.target.value)}
                  placeholder={'2026-09-13 08:00 | 2026-09-13 12:00\n2026-09-14 08:00 | 2026-09-14 12:00'} data-testid="entity-windows" />
              </Field>
            </div>
          );
          return (
            <Field key={fld.key} label={fld.label} required={fld.required}>
              <input className="inp" value={f[fld.key] ?? ''} onChange={(e) => set(fld.key, e.target.value)} placeholder={fld.placeholder} />
            </Field>
          );
        })}
      </div>
    </Modal>
  );
}

function windowsToText(windows) {
  return (windows || []).map((w) => `${toLocalDT(w.start)} | ${toLocalDT(w.end)}`).join('\n');
}
function toLocalDT(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function parseWindows(text) {
  const out = [];
  if (!text || !text.trim()) return { windows: [] };
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [s, e] = line.split('|').map((x) => (x || '').trim());
    if (!s || !e) return { error: `时段格式错误：「${line}」，需为 开始 | 结束` };
    const sd = new Date(s.replace(' ', 'T'));
    const ed = new Date(e.replace(' ', 'T'));
    if (isNaN(sd) || isNaN(ed)) return { error: `无法解析时间：「${line}」` };
    if (sd >= ed) return { error: `时段开始晚于结束：「${line}」` };
    out.push({ start: sd.toISOString(), end: ed.toISOString() });
  }
  return { windows: out };
}

function DeleteEntity({ kind, item, onClose, onDeleted }) {
  const store = useStore();
  const { state, commit } = store;
  const toast = useToast();
  const refs = usageOf(state, kind, item.id);
  const blocked = refs.length > 0;
  return (
    <ConfirmModal danger title={`删除${ENTITY_DEFS[kind].label}`}
      confirmText={blocked ? '仍要删除' : '删除'}
      onClose={onClose}
      onConfirm={() => {
        commit({ type: 'entity/delete', kind, id: item.id }, `删除${ENTITY_DEFS[kind].label}`);
        toast(`已删除「${item[ENTITY_DEFS[kind].nameField]}」（可撤销）`, blocked ? 'info' : 'success');
        onDeleted();
      }}
      text={blocked
        ? `「${item[ENTITY_DEFS[kind].nameField]}」正被 ${refs.length} 处引用：${refs.slice(0, 6).join('、')}${refs.length > 6 ? ' 等' : ''}。删除后这些引用将悬空，建议先改派。仍要删除？`
        : `确定删除「${item[ENTITY_DEFS[kind].nameField]}」？可通过撤销恢复。`} />
  );
}
