// 模型层断言：真实时刻比较 / 负责人归属 / 批量分派 / 导入既定状态语义校验
import assert from 'node:assert/strict';
import { validateImport } from '../src/importExport.js';
import { overlaps, windowContains, actionIssues, planBatchAssign, seedState } from '../src/model.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ✓', name); };

// ---------- 真实时刻比较（时区偏移）----------
test('overlaps：不同时区偏移表示同一时刻，判定重叠', () => {
  // 10:00Z–11:00Z 与 18:00+08–19:00+08 是同一时段
  assert.equal(overlaps('2026-09-13T10:00Z', '2026-09-13T11:00Z',
    '2026-09-13T18:00+08:00', '2026-09-13T19:00+08:00'), true);
  // 文本上“看起来更早”但加了 +10 偏移后在未来
  assert.equal(overlaps('2026-09-13T10:00Z', '2026-09-13T11:00Z',
    '2026-09-13T12:00+10:00', '2026-09-13T13:00+10:00'), false);
});

test('windowContains：按真实时刻判定，偏移不改变先后', () => {
  const wins = [{ start: '2026-09-13T20:00+10:00', end: '2026-09-13T22:00+10:00' }]; // 10:00Z–12:00Z
  // +02 的 12:30 = 10:30Z，真实在窗内（字符串比较会误判在窗外）
  assert.equal(windowContains(wins,
    new Date('2026-09-13T12:30+02:00').getTime(), new Date('2026-09-13T13:30+02:00').getTime()), true);
  // 文本 09:00 但 -10 偏移 = 19:00Z（前一天），真实在窗外（字符串比较会误判在窗内）
  assert.equal(windowContains([{ start: '2026-09-13T08:00Z', end: '2026-09-13T10:00Z' }],
    new Date('2026-09-13T09:00-10:00').getTime(), new Date('2026-09-13T09:30-10:00').getTime()), false);
});

// ---------- 负责人必须属于所选部队 ----------
test('actionIssues：负责人不属于所选部队 → officer-unit', () => {
  const s = seedState();
  const a = s.actions.find((x) => x.id === 'act-a2'); // 装甲营 / 林泽
  const bad = { ...a, status: 'draft', officerId: 'off-yeqi' }; // 叶柒属于侦察连
  const issues = actionIssues(s, bad);
  assert.ok(issues.some((i) => i.code === 'officer-unit'), JSON.stringify(issues));
  const good = { ...a, status: 'draft' };
  assert.ok(!actionIssues(s, good).some((i) => i.code === 'officer-unit'));
});

test('planBatchAssign：改派部队但负责人不匹配 → 拦截；一致 → 通过', () => {
  const s = seedState();
  // A-04 当前：步兵3营/安然；改派装甲营但仍带安然 → 拒绝
  let r = planBatchAssign(s, ['act-a4'], { unitId: 'unit-armor7', officerId: 'off-anran' });
  assert.equal(r.ok.length, 0);
  assert.equal(r.blocked[0].issues.some((i) => i.code === 'officer-unit'), true);
  // 只换部队不换负责人（原负责人安然不属装甲营）→ 拒绝（officer-required）
  r = planBatchAssign(s, ['act-a4'], { unitId: 'unit-armor7' });
  assert.equal(r.ok.length, 0);
  assert.ok(r.blocked[0].issues.some((i) => i.code === 'officer-required'));
  // 改派装甲营 + 林泽 → 通过
  r = planBatchAssign(s, ['act-a4'], { unitId: 'unit-armor7', officerId: 'off-linze' });
  assert.deepEqual(r.ok, ['act-a4']);
  // 非草稿不允许改派
  r = planBatchAssign(s, ['act-a1'], { priority: 1 });
  assert.equal(r.ok.length, 0);
  assert.ok(r.blocked[0].issues.some((i) => i.code === 'not-draft'));
});

// ---------- 导入：既定状态语义校验 ----------
const fac = [{ id: 'f1', name: '蓝方', color: '#123456' }];
const units = [
  { id: 'u1', name: '一营', factionId: 'f1', strength: 10 },
  { id: 'u2', name: '二营', factionId: 'f1', strength: 10 },
];
const officers = [
  { id: 'o1', name: '甲', rank: '上尉', unitId: 'u1' },
  { id: 'o2', name: '乙', rank: '中尉', unitId: 'u2' },
];
const locs = [{ id: 'l1', name: '窄窗阵地', kind: '阵地', windows: [{ start: '2026-09-13T08:00Z', end: '2026-09-13T10:00Z' }] }];
const sups = [{ id: 's1', name: '燃油', unit: '桶', stock: 5 }];
const base = (over) => JSON.stringify({ app: 'campaign-console', version: 1,
  exportedAt: '2026-09-13T00:00:00Z', data: {
    factions: fac, units, officers, locations: locs, supplies: sups, actions: over.actions } });

const act = (id, over) => ({
  id, code: id.toUpperCase(), title: id, status: 'approved',
  start: '2026-09-13T08:00Z', end: '2026-09-13T09:00Z',
  unitId: 'u1', officerId: 'o1', locationId: 'l1', deps: [], priority: 2, costs: [], note: '', ...over,
});

const importExpect = (name, actions, { ok, pathIncludes = [], msgIncludes = [] }) => {
  test(name, () => {
    const r = validateImport(base({ actions }));
    assert.equal(r.ok, ok, JSON.stringify(r.errors, null, 1));
    if (!ok) {
      for (const p of pathIncludes) assert.ok(r.errors.some((e) => e.path === p), `缺少路径 ${p}: ${JSON.stringify(r.errors)}`);
      for (const m of msgIncludes) assert.ok(r.errors.some((e) => e.msg.includes(m)), `缺少信息「${m}」: ${JSON.stringify(r.errors)}`);
    }
  });
};

// 完全一致的已批准数据 → 通过
importExpect('导入：自洽的已批准行动通过', [act('a1')], { ok: true });

// ① 同时段同部队（两条都已批准）→ 整库拒绝，路径指向行动
importExpect('导入：已批准行动同时段同部队被拒',
  [act('a1'), act('a2', { start: '2026-09-13T08:30Z', end: '2026-09-13T09:30Z' })],
  { ok: false, pathIncludes: ['$.data.actions[1]'], msgIncludes: ['同时段'] });

// ② 已批准行动依赖草稿
importExpect('导入：已批准行动依赖草稿被拒',
  [act('a1', { id: 'a1', deps: ['a2'] }), act('a2', { status: 'draft', start: '2026-09-13T06:00Z' })],
  { ok: false, pathIncludes: ['$.data.actions[0]'], msgIncludes: ['仍为草稿'] });

// 依赖已完成 → 允许（首尾相接不算时段冲突）
importExpect('导入：已批准行动依赖已完成行动通过',
  [act('a2', { id: 'a2', start: '2026-09-13T08:00Z', end: '2026-09-13T08:30Z', status: 'completed' }),
   act('a1', { start: '2026-09-13T08:30Z', deps: ['a2'] })],
  { ok: true });

// ③ 超出地点开放时段（08:00–10:00Z）
importExpect('导入：已批准行动超出开放时段被拒',
  [act('a1', { start: '2026-09-13T11:00Z', end: '2026-09-13T12:00Z' })],
  { ok: false, pathIncludes: ['$.data.actions[0]'], msgIncludes: ['开放时段'] });

// 时区偏移：真实时刻在窗内（+10：文本 19:00“晚于”窗口结束 10:00Z，但 = 09:00Z，真实在窗内）→ 通过
importExpect('导入：时区偏移下真实时刻在开放窗内 → 通过',
  [act('a1', { start: '2026-09-13T19:00+10:00', end: '2026-09-13T19:30+10:00' })],
  { ok: true });
// 时区偏移：文本在窗内但真实时刻在窗外 → 拒绝
importExpect('导入：时区偏移伪装成窗内 → 仍被拒',
  [act('a1', { start: '2026-09-13T09:00-10:00', end: '2026-09-13T09:30-10:00' })],
  { ok: false, pathIncludes: ['$.data.actions[0]'], msgIncludes: ['开放时段'] });

// ④ 物资余量：一条已批准需 10，库存 5
importExpect('导入：已批准行动物资不足被拒',
  [act('a1', { costs: [{ supplyId: 's1', qty: 10 }] })],
  { ok: false, pathIncludes: ['$.data.actions[0]'], msgIncludes: ['物资', '剩余可用 5'] });
// 两条已批准合计超限（各 3，库存 5）
importExpect('导入：已批准行动物资合计超限被拒',
  [act('a1', { costs: [{ supplyId: 's1', qty: 3 }], end: '2026-09-13T08:30Z' }),
   act('a2', { unitId: 'u2', officerId: 'o2', costs: [{ supplyId: 's1', qty: 3 }], start: '2026-09-13T09:00Z', end: '2026-09-13T09:30Z' })],
  { ok: false, msgIncludes: ['物资'] });
// 草稿不占用：同一份草稿需 10 不因此被语义拒绝
importExpect('导入：草稿行动不占用物资 → 不因余量被拒',
  [act('a1', { status: 'draft', costs: [{ supplyId: 's1', qty: 10 }] })],
  { ok: true });

// ⑤ 负责人不属于所选部队（即便草稿也是结构错误）
importExpect('导入：负责人与部队不一致被拒（结构路径）',
  [act('a1', { status: 'draft', officerId: 'o2' })],
  { ok: false, pathIncludes: ['$.data.actions[0].officerId'], msgIncludes: ['不属于所选部队'] });

// ⑥ 执行中同样适用语义校验
importExpect('导入：执行中行动同时段同部队被拒',
  [act('a1', { status: 'executing' }), act('a2', { status: 'executing', start: '2026-09-13T08:30Z', end: '2026-09-13T09:30Z' })],
  { ok: false, msgIncludes: ['同时段'] });

console.log(`\n模型层：${n} 项全部通过`);
