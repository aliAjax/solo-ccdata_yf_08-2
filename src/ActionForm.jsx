import React, { useMemo, useState } from 'react';
import { Modal, Field } from './ui.jsx';
import { PRIORITIES, STATUSES, actionIssues, fmtTime, nextCode } from './model.js';

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function blankForm(state, unitId) {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    id: '', code: nextCode(state), title: '',
    start: toLocalInput(start.toISOString()), end: toLocalInput(end.toISOString()),
    unitId: unitId || state.units[0]?.id || '',
    officerId: state.officers[0]?.id || '',
    locationId: state.locations[0]?.id || '',
    deps: [], priority: 3, costs: [{ supplyId: state.supplies[0]?.id || '', qty: 1 }], note: '',
  };
}

export default function ActionForm({ store, editing, defaultUnitId, onClose, onSaved }) {
  const { state, commit } = store;
  const [f, setF] = useState(() => {
    if (editing) return { ...editing, start: toLocalInput(editing.start), end: toLocalInput(editing.end), costs: (editing.costs || []).map((c) => ({ ...c })) };
    return blankForm(state, defaultUnitId);
  });
  const [err, setErr] = useState('');

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const officersOfUnit = state.officers.filter((o) => o.unitId === f.unitId);

  // 依赖候选：不能选自己
  const depCandidates = useMemo(() => state.actions.filter((a) => a.id !== f.id), [state.actions, f.id]);

  // 实时预检（仅编辑/草稿）
  const preview = useMemo(() => {
    const probe = {
      id: f.id || '__new__', code: f.code, title: f.title || '(未命名)',
      start: f.start ? new Date(f.start).toISOString() : '',
      end: f.end ? new Date(f.end).toISOString() : '',
      unitId: f.unitId, officerId: f.officerId, locationId: f.locationId,
      deps: f.deps, priority: f.priority, costs: f.costs.filter((c) => c.supplyId),
      status: editing?.status || 'draft', note: f.note,
    };
    const stateWithProbe = f.id
      ? { ...state, actions: state.actions.map((a) => (a.id === f.id ? probe : a)) }
      : { ...state, actions: state.actions.concat(probe) };
    return actionIssues(stateWithProbe, probe);
  }, [f, state, editing]);

  const loc = state.locations.find((l) => l.id === f.locationId);

  const save = () => {
    if (!f.title.trim()) return setErr('请填写行动标题');
    if (!f.start || !f.end) return setErr('请选择开始与结束时段');
    if (new Date(f.start) >= new Date(f.end)) return setErr('结束时段必须晚于开始时段');
    if (!f.unitId) return setErr('请选择部队');
    if (!f.officerId) return setErr('请选择负责人');
    if (!f.locationId) return setErr('请选择目标地点');
    const costs = f.costs.filter((c) => c.supplyId && Number(c.qty) > 0);
    const item = {
      id: f.id || `act-${Date.now()}`,
      code: f.code,
      title: f.title.trim(),
      start: new Date(f.start).toISOString(),
      end: new Date(f.end).toISOString(),
      unitId: f.unitId, officerId: f.officerId, locationId: f.locationId,
      deps: f.deps, priority: Number(f.priority), costs,
      note: f.note,
      status: editing?.status || 'draft',
    };
    if (editing?.reopenReason) { item.reopenReason = editing.reopenReason; item.reopenedAt = editing.reopenedAt; }
    commit({ type: 'action/upsert', item }, editing ? `编辑行动 ${item.code}` : `新建行动 ${item.code}`);
    onSaved?.(item);
    onClose();
  };

  const locked = editing && editing.status !== 'draft';

  return (
    <Modal wide
      title={editing ? `编辑行动 ${editing.code}` : '新建行动'}
      sub={locked ? '该行动已离开草稿状态；如需大改，请先撤销批准或重开。' : '草稿可自由编辑，批准前会执行四项冲突校验。'}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={save} data-testid="action-save">保存草稿</button>
      </>}>
      {err && <div className="alert alert-error" data-testid="form-error">{err}</div>}
      <div className="form-grid">
        <Field label="标题" required>
          <input className="inp" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="例：拂晓火力准备" data-testid="action-title" />
        </Field>
        <Field label="编号">
          <input className="inp" value={f.code} onChange={(e) => set('code', e.target.value)} />
        </Field>
        <Field label="开始时段" required>
          <input type="datetime-local" className="inp" value={f.start} onChange={(e) => set('start', e.target.value)} data-testid="action-start" />
        </Field>
        <Field label="结束时段" required>
          <input type="datetime-local" className="inp" value={f.end} onChange={(e) => set('end', e.target.value)} data-testid="action-end" />
        </Field>
        <Field label="部队" required>
          <select className="inp" value={f.unitId} onChange={(e) => {
            const u = e.target.value;
            setF((p) => ({ ...p, unitId: u, officerId: state.officers.find((o) => o.id === p.officerId)?.unitId === u ? p.officerId : (state.officers.find((o) => o.unitId === u)?.id || '') }));
          }} data-testid="action-unit">
            <option value="">选择部队</option>
            {state.units.map((u) => {
              const fac = state.factions.find((x) => x.id === u.factionId);
              return <option key={u.id} value={u.id}>{u.name}{fac ? `（${fac.name}）` : ''}</option>;
            })}
          </select>
        </Field>
        <Field label="负责人" required hint={officersOfUnit.length ? undefined : '该部队暂无在编军官'}>
          <select className="inp" value={f.officerId} onChange={(e) => set('officerId', e.target.value)} data-testid="action-officer">
            <option value="">选择负责人</option>
            {officersOfUnit.map((o) => <option key={o.id} value={o.id}>{o.rank} {o.name}</option>)}
          </select>
        </Field>
        <Field label="目标地点" required hint={loc ? (loc.windows?.length ? `开放：${loc.windows.map((w) => `${fmtTime(w.start)}–${fmtTime(w.end)}`).join('；')}` : '全天开放') : undefined}>
          <select className="inp" value={f.locationId} onChange={(e) => set('locationId', e.target.value)} data-testid="action-location">
            <option value="">选择地点</option>
            {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}（{l.kind || '地点'}）</option>)}
          </select>
        </Field>
        <Field label="优先级（1 最高）">
          <select className="inp" value={f.priority} onChange={(e) => set('priority', Number(e.target.value))} data-testid="action-priority">
            {PRIORITIES.map((p) => <option key={p} value={p}>P{p}</option>)}
          </select>
        </Field>
      </div>

      <Field label="依赖行动（必须先完成/先批准）">
        <div className="check-grid" data-testid="action-deps">
          {depCandidates.length === 0 && <small className="muted">暂无其他行动</small>}
          {depCandidates.map((a) => (
            <label key={a.id} className={`check ${f.deps.includes(a.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={f.deps.includes(a.id)}
                onChange={(e) => set('deps', e.target.checked ? f.deps.concat(a.id) : f.deps.filter((x) => x !== a.id))} />
              <span className={`prio-dot p${a.priority}`}>P{a.priority}</span> {a.code} {a.title}
              <em className={`mini-status st-${a.status}`}>{STATUSES[a.status].label}</em>
            </label>
          ))}
        </div>
      </Field>

      <div className="cost-head">
        <span className="field-label">物资消耗</span>
        <button type="button" className="btn btn-mini" onClick={() => set('costs', f.costs.concat({ supplyId: state.supplies[0]?.id || '', qty: 1 }))}>＋ 增加一项</button>
      </div>
      <div className="cost-rows" data-testid="action-costs">
        {f.costs.map((c, i) => {
          const sup = state.supplies.find((s) => s.id === c.supplyId);
          return (
            <div key={i} className="cost-row">
              <select className="inp" value={c.supplyId} onChange={(e) => set('costs', f.costs.map((x, j) => j === i ? { ...x, supplyId: e.target.value } : x))}>
                <option value="">选择物资</option>
                {state.supplies.map((s) => <option key={s.id} value={s.id}>{s.name}（库存 {s.stock}{s.unit}）</option>)}
              </select>
              <input type="number" min="1" className="inp narrow" value={c.qty}
                onChange={(e) => set('costs', f.costs.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} />
              <span className="muted">{sup?.unit || ''}</span>
              <button type="button" className="icon-btn" onClick={() => set('costs', f.costs.filter((_, j) => j !== i))}>✕</button>
            </div>
          );
        })}
      </div>

      <Field label="备注">
        <textarea className="inp" rows="2" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="敌情说明 / 复盘要点（可选）" />
      </Field>

      {preview.length > 0 && (
        <div className="alert alert-warn" data-testid="action-preflight">
          <b>批准预检：当前配置有 {preview.length} 项问题（仍可保存为草稿）</b>
          <ul>{preview.map((p, i) => <li key={i}>{p.msg}</li>)}</ul>
        </div>
      )}
    </Modal>
  );
}
