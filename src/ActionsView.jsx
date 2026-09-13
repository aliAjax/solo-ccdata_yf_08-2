import React, { useMemo, useState, useEffect } from 'react';
import { useStore, useNow } from './store.jsx';
import { useToast } from './ui.jsx';
import {
  STATUSES, isOverdue, planApproval, planBatchAssign, actionIssues, canTransition,
  fmtTime, byId, supplyUsage,
} from './model.js';
import { StatusBadge, Modal, Field, ConfirmModal } from './ui.jsx';
import ActionForm from './ActionForm.jsx';

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'approved', label: '已批准' },
  { key: 'executing', label: '执行中' },
  { key: 'completed', label: '已完成' },
];

export default function ActionsView({ highlightId, onHighlight }) {
  const store = useStore();
  const { state, commit } = store;
  const toast = useToast();
  const now = useNow();

  const [sort, setSort] = useState('priority');
  const [tab, setTab] = useState('all');
  const [unitFilter, setUnitFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [conflicts, setConflicts] = useState(null); // {scope:'single'|'batch', blocked, attempted}
  const [detailId, setDetailId] = useState(null);
  const [reopenId, setReopenId] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const units = byId(state.units);
  const officers = byId(state.officers);
  const locs = byId(state.locations);
  const sups = byId(state.supplies);
  const acts = byId(state.actions);
  const used = supplyUsage(state);

  // 行数据 + 派生
  const rows = useMemo(() => {
    let list = state.actions.slice();
    if (tab !== 'all') list = list.filter((a) => a.status === tab);
    if (unitFilter !== 'all') list = list.filter((a) => a.unitId === unitFilter);
    if (overdueOnly) list = list.filter((a) => isOverdue(a, now));
    const sOrder = { draft: 0, approved: 1, executing: 2, completed: 3 };
    list.sort((a, b) => {
      if (sort === 'priority') return a.priority - b.priority || new Date(a.start) - new Date(b.start) || a.code.localeCompare(b.code);
      if (sort === 'time') return new Date(a.start) - new Date(b.start) || a.priority - b.priority;
      if (sort === 'status') return sOrder[a.status] - sOrder[b.status] || a.priority - b.priority;
      return a.code.localeCompare(b.code);
    });
    return list;
  }, [state.actions, tab, unitFilter, overdueOnly, sort, now]);

  useEffect(() => {
    setSelected((s) => s.filter((id) => state.actions.some((a) => a.id === id)));
  }, [state.actions]);

  const allVisibleIds = rows.map((r) => r.id);
  const allChecked = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.includes(id));
  const draftSelected = selected.filter((id) => acts[id]?.status === 'draft');

  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.concat(id));

  // ---- 批准（单条 / 批量统一走 planApproval）----
  const approve = (ids, scope) => {
    if (!ids.length) { toast('请先选择草稿行动', 'error'); return; }
    const { ok, blocked } = planApproval(state, ids);
    if (blocked.length) {
      setConflicts({ scope, blocked, attempted: ids, ok });
      toast(`${blocked.length} 个行动被拦截${ok.length ? `，${ok.length} 个可批准` : ''}`, 'error');
      return;
    }
    commit({ type: 'action/batchApprove', ids: ok }, `批准 ${ok.length} 个行动`);
    setSelected((s) => s.filter((id) => !ok.includes(id)));
    toast(`已批准 ${ok.length} 个行动`, 'success');
  };

  const confirmBatchApprove = () => {
    if (!draftSelected.length) { toast('所选行动中没有草稿（只有草稿可批准）', 'error'); return; }
    approve(draftSelected, 'batch');
  };

  const transition = (a, to) => {
    if (!canTransition(a.status, to)) { toast('当前状态不允许该流转', 'error'); return; }
    commit({ type: 'action/setStatus', id: a.id, to }, `${STATUSES[a.status].label} → ${STATUSES[to].label}`);
    toast(`「${a.code} ${a.title}」已${STATUSES[to].label}`, 'success');
  };

  const reopen = (reason) => {
    const a = acts[reopenId];
    if (!a) return;
    commit({ type: 'action/setStatus', id: a.id, to: 'draft', reason }, `重开 ${a.code}`);
    toast(`已重开「${a.code}」，原因已记录`, 'success');
  };

  const selectedForAssign = selected.filter((id) => acts[id]?.status === 'draft');

  const detail = detailId ? acts[detailId] : null;

  return (
    <div className="board">
      <div className="toolbar">
        <div className="seg" role="tablist">
          {STATUS_TABS.map((t) => (
            <button key={t.key} className={`seg-btn ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}
              data-testid={`tab-${t.key}`}>
              {t.label}
              <em>{t.key === 'all' ? state.actions.length : state.actions.filter((a) => a.status === t.key).length}</em>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <label className="chk"><input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} data-testid="filter-overdue" /> 仅看逾期</label>
          <select className="inp inp-sm" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} data-testid="filter-unit">
            <option value="all">全部部队</option>
            {state.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="inp inp-sm" value={sort} onChange={(e) => setSort(e.target.value)} data-testid="sort-by">
            <option value="priority">按优先级排序</option>
            <option value="time">按时段排序</option>
            <option value="status">按状态排序</option>
            <option value="code">按编号排序</option>
          </select>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }} data-testid="new-action">＋ 新建行动</button>
        </div>
      </div>

      <div className={`batchbar ${selected.length ? 'open' : ''}`} data-testid="batchbar">
        <label className="chk"><input type="checkbox" checked={allChecked}
          onChange={() => setSelected(allChecked ? [] : allVisibleIds)} data-testid="select-all" /> 全选当前列表</label>
        <span className="muted">已选 <b data-testid="selected-count">{selected.length}</b> 个（草稿 {draftSelected.length}）</span>
        <span className="batch-spacer" />
        <button className="btn" disabled={!selectedForAssign.length} onClick={() => setAssignOpen(true)} data-testid="batch-assign">批量分派</button>
        <button className="btn btn-primary" disabled={!draftSelected.length} onClick={confirmBatchApprove} data-testid="batch-approve">批量批准</button>
      </div>

      <div className="table-wrap">
        <table className="grid" data-testid="action-grid">
          <thead>
            <tr>
              <th className="col-check"></th>
              <th className="col-prio">优先级</th>
              <th>行动 / 依赖</th>
              <th>时段</th>
              <th>部队 / 负责人</th>
              <th>目标地点</th>
              <th>消耗 / 库存</th>
              <th>状态</th>
              <th className="col-ops">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const overdue = isOverdue(a, now);
              const loc = locs[a.locationId];
              const issues = a.status === 'draft' ? actionIssues(state, a) : [];
              return (
                <tr key={a.id} className={`${highlightId === a.id ? 'row-hot' : ''} ${overdue ? 'row-overdue' : ''}`}
                  data-testid="action-row" data-action-id={a.id}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)}
                      data-testid={`select-${a.id}`} onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td><span className={`prio-badge p${a.priority}`}>P{a.priority}</span></td>
                  <td className="col-title">
                    <button className="linklike" onClick={() => setDetailId(a.id)} data-testid={`open-${a.id}`}>
                      <b>{a.code}</b> {a.title}
                    </button>
                    {a.deps?.length > 0 && (
                      <div className="deps-line">依赖：{a.deps.map((d) => acts[d] ? (
                        <button key={d} className="mini-link" onClick={() => setDetailId(d)}>{acts[d].code}</button>
                      ) : <em key={d} className="broken">缺失({d})</em>)}</div>
                    )}
                    {a.reopenReason && <div className="reopen-note" title={a.reopenReason}>↻ 重开：{a.reopenReason}</div>}
                  </td>
                  <td className="mono small">
                    <div>{fmtTime(a.start)}</div>
                    <div className="muted">至 {fmtTime(a.end)}</div>
                  </td>
                  <td className="small">
                    <div>{units[a.unitId]?.name || <em className="broken">未指定部队</em>}</div>
                    <div className="muted">{officers[a.officerId] ? `${officers[a.officerId].rank || ''} ${officers[a.officerId].name}` : <em className="broken">未指定负责人</em>}</div>
                  </td>
                  <td className="small">
                    {loc ? loc.name : <em className="broken">未指定</em>}
                    {loc?.kind && <div className="muted">{loc.kind}{loc.windows?.length ? '' : ' · 全天开放'}</div>}
                  </td>
                  <td className="small">
                    {a.costs?.length ? a.costs.map((c) => {
                      const s = sups[c.supplyId];
                      const short = a.status === 'draft' && issues.some((i) => i.code === 'supply-short' && i.with?.id === c.supplyId);
                      return <div key={c.supplyId} className={short ? 'short' : ''}>{s?.name || '?'} ×{c.qty}{s?.unit || ''} <em className="muted">/ 库存 {s?.stock ?? '?'}</em></div>;
                    }) : <span className="muted">—</span>}
                  </td>
                  <td><StatusBadge status={a.status} overdue={overdue} /></td>
                  <td className="col-ops">
                    <div className="row-ops">
                      {a.status === 'draft' && <>
                        <button className="btn btn-mini btn-primary" onClick={() => approve([a.id], 'single')} data-testid={`approve-${a.id}`}>批准</button>
                        <button className="btn btn-mini" onClick={() => { setEditing(a); setFormOpen(true); }} data-testid={`edit-${a.id}`}>编辑</button>
                      </>}
                      {a.status === 'approved' && <>
                        <button className="btn btn-mini btn-primary" onClick={() => transition(a, 'executing')} data-testid={`execute-${a.id}`}>开始执行</button>
                        <button className="btn btn-mini" onClick={() => transition(a, 'draft')} data-testid={`unapprove-${a.id}`}>撤回</button>
                      </>}
                      {a.status === 'executing' && <>
                        <button className="btn btn-mini btn-primary" onClick={() => transition(a, 'completed')} data-testid={`complete-${a.id}`}>完成</button>
                        <button className="btn btn-mini" onClick={() => transition(a, 'approved')}>暂停</button>
                      </>}
                      {a.status === 'completed' && <button className="btn btn-mini" onClick={() => setReopenId(a.id)} data-testid={`reopen-${a.id}`}>重开…</button>}
                      {a.status !== 'completed' && <button className="btn btn-mini btn-ghost-danger" onClick={() => setDeleteId(a.id)}>删除</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan="9" className="empty-row">没有符合筛选条件的行动</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && <ActionForm store={store} editing={editing} onClose={() => setFormOpen(false)} />}

      {/* 冲突弹框：指出每一条问题与冲突对象 */}
      {conflicts && (
        <Modal wide title={`批准被拦截（${conflicts.blocked.length} 项）`}
          sub={conflicts.ok?.length ? `另有 ${conflicts.ok.length} 个行动通过校验，可先处理冲突再统一批准。` : '以下问题必须全部解决后才能批准；现有数据未做任何改动。'}
          onClose={() => setConflicts(null)}
          footer={<>
            <button className="btn" onClick={() => setConflicts(null)}>关闭</button>
            {conflicts.ok?.length > 0 && (
              <button className="btn btn-primary" data-testid="approve-ok-only"
                onClick={() => {
                  commit({ type: 'action/batchApprove', ids: conflicts.ok }, `批准 ${conflicts.ok.length} 个无冲突行动`);
                  setSelected((s) => s.filter((id) => !conflicts.ok.includes(id)));
                  setConflicts(null);
                  toast(`已批准其余 ${conflicts.ok.length} 个行动`, 'success');
                }}>仅批准通过的 {conflicts.ok.length} 个</button>
            )}
          </>}>
          <div className="conflict-list" data-testid="conflict-list">
            {conflicts.blocked.map((b) => (
              <div key={b.id} className="conflict-card" data-testid={`conflict-${b.id}`}>
                <div className="conflict-head"><b>{b.code}</b> {b.title}</div>
                <ul>
                  {b.issues.map((iss, i) => (
                    <li key={i} className={`iss iss-${iss.code}`}>
                      <span className="iss-tag">{issTag(iss.code)}</span>
                      <span>{iss.msg}</span>
                      {iss.with?.type === 'action' && acts[iss.with.id] && (
                        <button className="mini-link" data-testid="jump-conflict"
                          onClick={() => { setTab('all'); setUnitFilter('all'); setOverdueOnly(false); onHighlight(iss.with.id); setConflicts(null); setDetailId(iss.with.id); }}>
                          查看冲突对象 →
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* 详情 */}
      {detail && (
        <Modal wide title={`${detail.code} ${detail.title}`}
          sub={STATUSES[detail.status].label + (isOverdue(detail, now) ? ' · 已逾期' : '')}
          onClose={() => setDetailId(null)}
          footer={<>
            {detail.status === 'draft' && <button className="btn" onClick={() => { setDetailId(null); setEditing(detail); setFormOpen(true); }}>编辑</button>}
            <button className="btn" onClick={() => setDetailId(null)}>关闭</button>
            {detail.status === 'draft' && <button className="btn btn-primary" onClick={() => { setDetailId(null); approve([detail.id], 'single'); }}>批准</button>}
            {detail.status === 'approved' && <button className="btn btn-primary" onClick={() => { transition(detail, 'executing'); setDetailId(null); }}>开始执行</button>}
            {detail.status === 'executing' && <button className="btn btn-primary" onClick={() => { transition(detail, 'completed'); setDetailId(null); }}>完成</button>}
            {detail.status === 'completed' && <button className="btn btn-primary" onClick={() => { setDetailId(null); setReopenId(detail.id); }}>重开…</button>}
          </>}>
          <div className="detail-grid">
            <div><small>时段</small><b className="mono">{fmtTime(detail.start)} – {fmtTime(detail.end)}</b></div>
            <div><small>部队</small><b>{units[detail.unitId]?.name || '—'}</b></div>
            <div><small>负责人</small><b>{detail.officerId ? `${officers[detail.officerId]?.rank || ''} ${officers[detail.officerId]?.name}` : '—'}</b></div>
            <div><small>目标地点</small><b>{locs[detail.locationId]?.name || '—'}{locs[detail.locationId]?.windows?.length ? '' : '（全天开放）'}</b></div>
            <div><small>优先级</small><b>P{detail.priority}</b></div>
            <div><small>状态</small><b>{STATUSES[detail.status].label}{isOverdue(detail, now) ? '（逾期）' : ''}</b></div>
          </div>
          {locs[detail.locationId]?.windows?.length > 0 && (
            <div className="kvline"><small>地点开放时段</small>{locs[detail.locationId].windows.map((w, i) => <span key={i} className="chip">{fmtTime(w.start)} – {fmtTime(w.end)}</span>)}</div>
          )}
          {detail.deps?.length > 0 && (
            <div className="kvline"><small>依赖行动</small>{detail.deps.map((d) => <span key={d} className="chip">{acts[d] ? `${acts[d].code} ${acts[d].title}` : `缺失：${d}`}</span>)}</div>
          )}
          <div className="kvline"><small>物资消耗</small>{detail.costs?.length ? detail.costs.map((c) => (
            <span key={c.supplyId} className="chip">{sups[c.supplyId]?.name} ×{c.qty}{sups[c.supplyId]?.unit}（库存 {sups[c.supplyId]?.stock}，已占用 {used[c.supplyId] || 0}）</span>
          )) : <span className="muted">无</span>}</div>
          {detail.note && <div className="kvline"><small>备注</small><span>{detail.note}</span></div>}
          {detail.reopenReason && <div className="kvline"><small>上次重开原因</small><span className="reopen-note">{detail.reopenReason}（{fmtTime(detail.reopenedAt)}）</span></div>}
          {detail.status === 'draft' && actionIssues(state, detail).length > 0 && (
            <div className="alert alert-warn">
              <b>批准前须解决：</b>
              <ul>{actionIssues(state, detail).map((i, k) => <li key={k}>{i.msg}</li>)}</ul>
            </div>
          )}
        </Modal>
      )}

      {reopenId && <ReopenModal action={acts[reopenId]} onCancel={() => setReopenId(null)} onConfirm={(reason) => { reopen(reason); setReopenId(null); }} />}

      {assignOpen && <BatchAssignModal
        ids={selectedForAssign}
        onClose={() => setAssignOpen(false)}
        onDone={(patch, label) => {
          commit({ type: 'action/batchAssign', ids: selectedForAssign, patch }, label);
          setAssignOpen(false);
          setSelected([]);
          toast(`已批量分派 ${selectedForAssign.length} 个行动`, 'success');
        }} />}

      {deleteId && <ConfirmModal danger title="删除行动"
        text={`确定删除「${acts[deleteId]?.code} ${acts[deleteId]?.title}」？该操作可通过撤销恢复。`}
        confirmText="删除" onClose={() => setDeleteId(null)}
        onConfirm={() => { commit({ type: 'action/delete', id: deleteId }, '删除行动'); toast('行动已删除（可撤销）'); }} />}
    </div>
  );
}

function issTag(code) {
  return {
    'unit-busy': '部队冲突', 'unit-busy-batch': '批内冲突',
    'cycle': '依赖成环', 'window': '开放时段',
    'supply-short': '物资不足', 'supply-short-batch': '物资不足',
    'dep-draft': '前置未批准', 'dep-missing': '依赖缺失', 'dep-self': '自依赖',
  }[code] || '校验失败';
}

function ReopenModal({ action, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(false);
  return (
    <Modal title={`重开行动 ${action.code}`} sub="已完成的行动必须填写重开原因，原因会写入变更留痕。"
      onClose={onCancel}
      footer={<>
        <button className="btn" onClick={onCancel}>取消</button>
        <button className="btn btn-primary" data-testid="reopen-confirm"
          onClick={() => { if (!reason.trim()) { setErr(true); return; } onConfirm(reason.trim()); }}>确认重开</button>
      </>}>
      <Field label="重开原因" required hint="例：敌情变化需重新部署 / 复盘发现目标未达成">
        <textarea className="inp" rows="3" value={reason} data-testid="reopen-reason"
          onChange={(e) => { setReason(e.target.value); setErr(false); }} placeholder="请说明为什么将已完成行动退回草稿" />
      </Field>
      {err && <div className="alert alert-error" data-testid="reopen-error">必须填写重开原因</div>}
    </Modal>
  );
}

function BatchAssignModal({ ids, onClose, onDone }) {
  const store = useStore();
  const { state } = store;
  const toast = useToast();
  const acts = byId(state.actions);
  const units = byId(state.units);
  const [unitId, setUnitId] = useState('');
  const [officerId, setOfficerId] = useState('');
  const [priority, setPriority] = useState('');
  const [errors, setErrors] = useState(null);

  // 目标部队：显式选择优先；否则取所选行动当前部队的并集
  const targetUnitIds = unitId
    ? [unitId]
    : [...new Set(ids.map((id) => acts[id]?.unitId).filter(Boolean))];
  const eligibleOfficers = state.officers.filter((o) => targetUnitIds.includes(o.unitId));

  const apply = () => {
    const patch = {};
    if (unitId) patch.unitId = unitId;
    if (officerId) patch.officerId = officerId;
    if (priority) patch.priority = Number(priority);
    if (!Object.keys(patch).length) { toast('没有选择任何要修改的字段', 'error'); return; }
    // 归属校验：负责人必须属于（新）部队；换部队必须同时给新部队的负责人
    const { blocked } = planBatchAssign(state, ids, patch);
    if (blocked.length) { setErrors(blocked); return; }
    onDone(patch, `批量分派 ${ids.length} 个行动`);
  };

  return (
    <Modal title={`批量分派 ${ids.length} 个草稿行动`} sub="仅修改已选草稿；留空的字段保持不变。改派部队时必须同时选择属于该部队的负责人。"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" data-testid="assign-confirm" onClick={apply}>应用分派</button>
      </>}>
      {errors && (
        <div className="alert alert-error" data-testid="assign-errors">
          <b>{errors.length} 个行动无法这样分派：</b>
          <ul>{errors.flatMap((b) => b.issues.map((i, k) => <li key={b.id + k}><b>{b.code}</b>：{i.msg}</li>))}</ul>
        </div>
      )}
      <div className="form-grid">
        <Field label="改派部队">
          <select className="inp" value={unitId} onChange={(e) => { setUnitId(e.target.value); setOfficerId(''); setErrors(null); }} data-testid="assign-unit">
            <option value="">不变</option>
            {state.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label={unitId ? '新部队的负责人（必选）' : '改派负责人（限各行动当前部队）'}>
          <select className="inp" value={officerId} onChange={(e) => { setOfficerId(e.target.value); setErrors(null); }} data-testid="assign-officer">
            <option value="">不变</option>
            {eligibleOfficers.map((o) => <option key={o.id} value={o.id}>{units[o.unitId]?.name} · {o.rank} {o.name}</option>)}
          </select>
        </Field>
        <Field label="统一优先级">
          <select className="inp" value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="assign-priority">
            <option value="">不变</option>
            {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>P{p}</option>)}
          </select>
        </Field>
      </div>
      <div className="assign-preview">
        {ids.map((id) => <span key={id} className="chip">{acts[id]?.code} {acts[id]?.title}（{units[acts[id]?.unitId]?.name}）</span>)}
      </div>
    </Modal>
  );
}
