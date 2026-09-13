import React, { useRef, useState } from 'react';
import { useStore } from './store.jsx';
import { useToast } from './ui.jsx';
import { buildExport, validateImport } from './importExport.js';
import { DOC_VERSION } from './model.js';
import { Modal, ConfirmModal } from './ui.jsx';

export default function ImportExportView() {
  const { state, replaceAll, resetToSeed, storageKey } = useStore();
  const toast = useToast();
  const fileRef = useRef(null);
  const [review, setReview] = useState(null); // {result, fileName}
  const [bad, setBad] = useState(null); // {errors, warnings, fileName}
  const [confirmReset, setConfirmReset] = useState(false);

  const doExport = () => {
    const doc = buildExport(state);
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `campaign-console-v${DOC_VERSION}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已导出版本化 JSON（v1）', 'success');
  };

  const onFile = async (file) => {
    const text = await file.text();
    const result = validateImport(text);
    if (!result.ok) {
      // 失败不覆盖现有数据：仅展示逐项错误
      setBad({ errors: result.errors, warnings: result.warnings, fileName: file.name });
      toast(`导入失败：${result.errors.length} 项校验错误，现有数据未改动`, 'error');
      return;
    }
    setReview({ result, fileName: file.name });
  };

  const applyImport = () => {
    const { result, fileName } = review;
    const c = countOf(result.state);
    replaceAll(result.state, `导入 ${fileName}（v${DOC_VERSION}，${c.actions} 行动 / ${c.supplies} 物资）`);
    setReview(null);
    toast('导入成功：整库已替换，可用撤销恢复原数据', 'success');
  };

  return (
    <div className="io-view">
      <section className="io-card" data-testid="io-export">
        <div className="io-icon">⇩</div>
        <h3>导出数据</h3>
        <p>导出全部阵营、部队、军官、地点、物资与行动，文件带 <code>version: {DOC_VERSION}</code> 版本号。</p>
        <button className="btn btn-primary" onClick={doExport} data-testid="btn-export">下载 JSON</button>
      </section>

      <section className="io-card" data-testid="io-import">
        <div className="io-icon">⇧</div>
        <h3>导入数据（版本化 JSON）</h3>
        <p>导入为<b>整库替换</b>。文件先经逐项校验：版本号、id 唯一性、引用完整性、时间格式、库存、依赖环……任何一项失败都会整体拒绝，<b>绝不覆盖现有数据</b>；校验通过后仍需二次确认，导入后可撤销恢复。</p>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} data-testid="file-input" />
        <div className="io-actions">
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} data-testid="btn-import">选择 JSON 文件…</button>
        </div>
        <div className="io-samples">
          <small className="muted">没有文件也可用内置样本演练（加载后进入确认/报错弹框）：</small>
          <div className="sample-row">
            <button className="btn btn-mini" data-testid="sample-good"
              onClick={() => {
                const r = validateImport(GOOD_SAMPLE);
                if (r.ok) setReview({ result: r, fileName: '合法样本.json' });
                else setBad({ errors: r.errors, warnings: r.warnings, fileName: '合法样本.json' });
              }}>载入：合法样本</button>
            <button className="btn btn-mini" data-testid="sample-badversion"
              onClick={() => { const r = validateImport(BAD_VERSION); if (!r.ok) setBad({ errors: r.errors, warnings: r.warnings, fileName: '错误版本.json' }); }}>载入：错误版本号</button>
            <button className="btn btn-mini" data-testid="sample-baditems"
              onClick={() => { const r = validateImport(BAD_ITEMS); if (!r.ok) setBad({ errors: r.errors, warnings: r.warnings, fileName: '多项错误.json' }); }}>载入：逐项错误（悬空引用/负库存/环/时段）</button>
            <button className="btn btn-mini" data-testid="sample-badstatus"
              onClick={() => { const r = validateImport(BAD_STATUS); if (!r.ok) setBad({ errors: r.errors, warnings: r.warnings, fileName: '既定状态冲突.json' }); else setReview({ result: r, fileName: '既定状态冲突.json' }); }}>载入：已批准行动互相冲突</button>
            <button className="btn btn-mini" data-testid="sample-tzbad"
              onClick={() => { const r = validateImport(TZ_OFFSET_BAD); if (!r.ok) setBad({ errors: r.errors, warnings: r.warnings, fileName: '时区伪装.json' }); else setReview({ result: r, fileName: '时区伪装.json' }); }}>载入：时区偏移伪装在窗内</button>
            <button className="btn btn-mini" data-testid="sample-tzgood"
              onClick={() => { const r = validateImport(TZ_OFFSET_GOOD); if (r.ok) setReview({ result: r, fileName: '时区合法样本.json' }); else setBad({ errors: r.errors, warnings: r.warnings, fileName: '时区合法样本.json' }); }}>载入：偏移文本不同但真实时刻在窗内</button>
          </div>
        </div>
      </section>

      <section className="io-card danger-card" data-testid="io-reset">
        <div className="io-icon">↺</div>
        <h3>重置与存储</h3>
        <p>数据自动保存在浏览器 <code>localStorage</code>（键 <code>{storageKey}</code>），刷新页面后保留，含撤销/重做栈。重置会恢复内置示例数据（同样可撤销）。</p>
        <button className="btn btn-danger" onClick={() => setConfirmReset(true)} data-testid="btn-reset">重置为示例数据</button>
      </section>

      {/* 校验通过 → 二次确认 */}
      {review && (
        <Modal title="确认导入" sub={`文件：${review.fileName} · 版本 v${DOC_VERSION} · 校验通过`}
          onClose={() => setReview(null)}
          footer={<>
            <button className="btn" onClick={() => setReview(null)} data-testid="import-cancel">取消（保留现有数据）</button>
            <button className="btn btn-primary" onClick={applyImport} data-testid="import-confirm">确认整库替换</button>
          </>}>
          <p className="confirm-text">导入后当前数据将被整体替换（自动进入撤销栈，可一键恢复）。文件包含：</p>
          <div className="import-counts" data-testid="import-counts">
            {Object.entries(countOf(review.result.state)).map(([k, v]) => (
              <span key={k} className="chip">{COUNT_LABEL[k]} <b>{v}</b></span>
            ))}
          </div>
          {review.result.warnings.length > 0 && (
            <div className="alert alert-warn"><b>{review.result.warnings.length} 条警告：</b>
              <ul>{review.result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
        </Modal>
      )}

      {/* 校验失败 → 逐项错误，不覆盖 */}
      {bad && (
        <Modal wide title={`导入被拒绝：${bad.fileName}`}
          sub={`发现 ${bad.errors.length} 项校验错误，现有数据保持不变。`}
          onClose={() => setBad(null)}
          footer={<button className="btn btn-primary" onClick={() => setBad(null)} data-testid="bad-close">知道了</button>}>
          <ul className="error-list" data-testid="import-errors">
            {bad.errors.map((e, i) => (
              <li key={i}><code className="err-path">{e.path}</code><span>{e.msg}</span></li>
            ))}
          </ul>
          {bad.warnings.length > 0 && <div className="alert alert-warn">警告：{bad.warnings.join('；')}</div>}
        </Modal>
      )}

      {confirmReset && <ConfirmModal danger title="重置为示例数据"
        text="当前全部数据将被内置示例替换（可撤销恢复）。继续？" confirmText="重置"
        onClose={() => setConfirmReset(false)}
        onConfirm={() => { resetToSeed(); toast('已重置为示例数据', 'success'); }} />}
    </div>
  );
}

const COUNT_LABEL = { factions: '阵营', units: '部队', officers: '军官', locations: '地点', supplies: '物资', actions: '行动' };
function countOf(s) {
  return { factions: s.factions.length, units: s.units.length, officers: s.officers.length,
    locations: s.locations.length, supplies: s.supplies.length, actions: s.actions.length };
}

// 相对当前时间构造 ISO，保证样本本身合法
function iso(h, m = 0) { return new Date(Date.now() + h * 3600000 + m * 60000).toISOString(); }
function docOf(data) {
  return JSON.stringify({ app: 'campaign-console', version: DOC_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
}

const GOOD_SAMPLE = docOf({
  factions: [{ id: 'fac-1', name: '蓝方', code: 'BLU', color: '#4a7ab8' }],
  units: [{ id: 'unit-1', name: '蓝方第 1 营', factionId: 'fac-1', strength: 300 }],
  officers: [{ id: 'off-1', name: '顾晨', rank: '少校', unitId: 'unit-1' }],
  locations: [{ id: 'loc-1', name: '河畔阵地', kind: '阵地', windows: [] }],
  supplies: [{ id: 'sup-1', name: '干粮', unit: '份', stock: 100 }],
  actions: [
    { id: 'act-1', code: 'X-01', title: '样本：前出侦察', status: 'approved', start: iso(1), end: iso(2),
      unitId: 'unit-1', officerId: 'off-1', locationId: 'loc-1', deps: [], priority: 2,
      costs: [{ supplyId: 'sup-1', qty: 10 }], note: '' },
    { id: 'act-2', code: 'X-02', title: '样本：占领要点', status: 'draft', start: iso(3), end: iso(4),
      unitId: 'unit-1', officerId: 'off-1', locationId: 'loc-1', deps: ['act-1'], priority: 1, costs: [], note: '' },
  ],
});

const BAD_VERSION = JSON.stringify({
  app: 'campaign-console', version: 99,
  data: { factions: [], units: [], officers: [], locations: [], supplies: [], actions: [] },
}, null, 2);

const BAD_ITEMS = docOf({
  factions: [{ id: 'fac-1', name: '蓝方', color: 'not-a-color' }],
  units: [{ id: 'unit-1', name: '幽灵营', factionId: 'fac-missing', strength: -5 },
          { id: 'unit-1', name: '重复 id 营', factionId: 'fac-1', strength: 2 }],
  officers: [{ id: 'off-1', name: '顾晨', unitId: 'unit-ghost' }],
  locations: [{ id: 'loc-1', name: '闭场地段', kind: '阵地',
    windows: [{ start: iso(10), end: iso(8) }] }],
  supplies: [{ id: 'sup-1', name: '燃油', unit: '桶', stock: -3 }],
  actions: [
    { id: 'act-1', code: 'Y-01', title: '环一', status: 'draft', start: iso(2), end: iso(1),
      unitId: 'unit-missing', officerId: 'off-missing', locationId: 'loc-missing',
      deps: ['act-2'], priority: 9, costs: [{ supplyId: 'sup-missing', qty: 0 }] },
    { id: 'act-2', code: 'Y-02', title: '环二', status: 'draft', start: 'not-a-date', end: iso(3),
      unitId: 'unit-1', officerId: 'off-1', locationId: 'loc-1', deps: ['act-1'], priority: 2, costs: [] },
  ],
});

// 结构全部合法，但文件中“已批准”的行动互相冲突 —— 必须整库拒绝并指出行动路径
const DOC_FIXED = (actions) => JSON.stringify({
  app: 'campaign-console', version: DOC_VERSION, exportedAt: '2026-09-13T00:00:00Z',
  data: {
    factions: [{ id: 'fac-1', name: '蓝方', code: 'BLU', color: '#4a7ab8' }],
    units: [{ id: 'u1', name: '一营', factionId: 'fac-1', strength: 100 },
            { id: 'u2', name: '二营', factionId: 'fac-1', strength: 100 }],
    officers: [{ id: 'o1', name: '甲军官', rank: '上尉', unitId: 'u1' },
               { id: 'o2', name: '乙军官', rank: '中尉', unitId: 'u2' }],
    // 仅 08:00–10:00Z 开放
    locations: [{ id: 'l1', name: '窄窗阵地', kind: '阵地',
      windows: [{ start: '2026-09-13T08:00Z', end: '2026-09-13T10:00Z' }] }],
    supplies: [{ id: 's1', name: '燃油', unit: '桶', stock: 5 }],
    actions,
  },
}, null, 2);
const fixedAct = (id, over) => ({
  id, code: id.toUpperCase(), title: id, status: 'approved',
  start: '2026-09-13T08:00Z', end: '2026-09-13T09:00Z',
  unitId: 'u1', officerId: 'o1', locationId: 'l1', deps: [], priority: 2, costs: [], note: '', ...over,
});
const BAD_STATUS = DOC_FIXED([
  fixedAct('a1', { costs: [{ supplyId: 's1', qty: 10 }] }),                 // 物资不足（库存 5）
  fixedAct('a2', { start: '2026-09-13T08:30Z', end: '2026-09-13T09:30Z' }), // 与 a1 同时段同部队
  fixedAct('a3', { start: '2026-09-13T09:00Z', end: '2026-09-13T09:30Z', deps: ['a4'] }), // 依赖草稿
  fixedAct('a4', { status: 'draft', unitId: 'u2', officerId: 'o2', start: '2026-09-13T06:00Z', end: '2026-09-13T07:00Z' }),
  fixedAct('a5', { unitId: 'u2', officerId: 'o2', start: '2026-09-13T11:00Z', end: '2026-09-13T12:00Z' }), // 超出开放时段
]);
// 文本上是 09:00（看似在 08–10 窗内），-10 偏移后真实时刻为前一天 19:00Z
const TZ_OFFSET_BAD = DOC_FIXED([
  fixedAct('a1', { start: '2026-09-13T09:00-10:00', end: '2026-09-13T09:30-10:00' }),
]);
// 文本上是 19:00（看似晚于窗口），+10 偏移后真实时刻为 09:00Z，实际在窗内
const TZ_OFFSET_GOOD = DOC_FIXED([
  fixedAct('a1', { start: '2026-09-13T19:00+10:00', end: '2026-09-13T19:30+10:00' }),
]);
