// 战役复盘与行动调度台 —— 数据模型 / 状态层

export const STORAGE_KEY = 'campaign-console-v1';
export const DOC_VERSION = 1;

export const STATUSES = {
  draft: { label: '草稿', tone: 'neutral' },
  approved: { label: '已批准', tone: 'blue' },
  executing: { label: '执行中', tone: 'amber' },
  completed: { label: '已完成', tone: 'green' },
};

export const PRIORITIES = [1, 2, 3, 4, 5];

export const ENTITY_DEFS = {
  factions: { label: '阵营', idPrefix: 'fac', nameField: 'name', fields: [
    { key: 'name', label: '名称', required: true, placeholder: '例：北方联军' },
    { key: 'code', label: '代号', placeholder: '例：NLF' },
    { key: 'color', label: '标识色', type: 'color', default: '#7fa8c9' },
  ] },
  units: { label: '部队', idPrefix: 'unit', nameField: 'name', fields: [
    { key: 'name', label: '名称', required: true, placeholder: '例：第 7 装甲营' },
    { key: 'factionId', label: '所属阵营', type: 'ref', refType: 'factions', placeholder: '选择阵营' },
    { key: 'strength', label: '兵力', type: 'number', default: 0 },
  ] },
  officers: { label: '军官', idPrefix: 'off', nameField: 'name', fields: [
    { key: 'name', label: '姓名', required: true, placeholder: '例：林泽' },
    { key: 'rank', label: '军衔', placeholder: '例：上校' },
    { key: 'unitId', label: '所属部队', type: 'ref', refType: 'units', placeholder: '选择部队' },
  ] },
  locations: { label: '地点', idPrefix: 'loc', nameField: 'name', fields: [
    { key: 'name', label: '名称', required: true, placeholder: '例：铁桥' },
    { key: 'kind', label: '类型', placeholder: '例：桥梁 / 城镇 / 补给点' },
    { key: 'windows', label: '开放时段（每行一段：开始 | 结束，留空=全天开放）', type: 'windows' },
  ] },
  supplies: { label: '物资', idPrefix: 'sup', nameField: 'name', fields: [
    { key: 'name', label: '名称', required: true, placeholder: '例：燃油' },
    { key: 'unit', label: '计量单位', placeholder: '桶 / 箱 / 发' },
    { key: 'stock', label: '库存', type: 'number', default: 0 },
  ] },
};

// ---------- 时间工具 ----------
const pad = (n) => String(n).padStart(2, '0');
function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function windowContains(windows, start, end) {
  if (!windows || windows.length === 0) return true; // 无开放时段 = 全天开放
  const s = new Date(start).getTime(), e = new Date(end).getTime();
  return windows.some((w) => new Date(w.start).getTime() <= s && new Date(w.end).getTime() >= e);
}
export function overlaps(aS, aE, bS, bE) {
  // 真实时刻比较：ISO 文本带不同时区偏移时不能按字符串排序
  const as = new Date(aS).getTime(), ae = new Date(aE).getTime();
  const bs = new Date(bS).getTime(), be = new Date(bE).getTime();
  return as < be && bs < ae;
}

// ---------- 种子数据（相对当前时刻生成，保证逾期/未逾期各有样本）----------
export function seedState() {
  const now = Date.now();
  const H = 60 * 60 * 1000;
  const at = (offsetH, min = 0) => new Date(now + offsetH * H + min * 60000);
  const iso = (d) => d.toISOString();
  const win = (a, b) => ({ start: iso(a), end: iso(b) });

  const factions = [
    { id: 'fac-north', name: '北方联军', code: 'NLF', color: '#7fa8c9' },
    { id: 'fac-red', name: '赤隼军团', code: 'CRF', color: '#c97f7f' },
    { id: 'fac-civil', name: '地方民防', code: 'CDF', color: '#9bc48d' },
  ];
  const units = [
    { id: 'unit-armor7', name: '第 7 装甲营', factionId: 'fac-north', strength: 420 },
    { id: 'unit-infantry3', name: '第 3 步兵营', factionId: 'fac-north', strength: 610 },
    { id: 'unit-art22', name: '第 22 炮兵连', factionId: 'fac-north', strength: 130 },
    { id: 'unit-recon1', name: '侦察 1 连', factionId: 'fac-north', strength: 90 },
  ];
  const officers = [
    { id: 'off-linze', name: '林泽', rank: '上校', unitId: 'unit-armor7' },
    { id: 'off-anran', name: '安然', rank: '中校', unitId: 'unit-infantry3' },
    { id: 'off-zhouyue', name: '周岳', rank: '上尉', unitId: 'unit-art22' },
    { id: 'off-yeqi', name: '叶柒', rank: '中尉', unitId: 'unit-recon1' },
  ];
  const locations = [
    { id: 'loc-bridge', name: '灰港铁桥', kind: '桥梁', windows: [win(at(-6), at(48))] },
    { id: 'loc-arsenal', name: '旧军械库', kind: '补给点', windows: [
      win(at(-6), at(2)), win(at(24), at(30)),
    ] },
    { id: 'loc-tower', name: '北境钟楼', kind: '观察点', windows: [] },
    { id: 'loc-square', name: '中央广场', kind: '城镇', windows: [win(at(6), at(34))] },
  ];
  const supplies = [
    { id: 'sup-fuel', name: '燃油', unit: '桶', stock: 30 },
    { id: 'sup-ammo', name: '弹药', unit: '箱', stock: 12 },
    { id: 'sup-med', name: '医疗包', unit: '个', stock: 5 },
  ];
  const actions = [
    { id: 'act-a1', code: 'A-01', title: '拂晓火力准备', status: 'approved',
      start: iso(at(2)), end: iso(at(3)), unitId: 'unit-art22', officerId: 'off-zhouyue',
      locationId: 'loc-bridge', deps: [], priority: 1,
      costs: [{ supplyId: 'sup-ammo', qty: 3 }], note: '压制桥北碉堡' },
    { id: 'act-a2', code: 'A-02', title: '装甲营强渡铁桥', status: 'draft',
      start: iso(at(3)), end: iso(at(4, 30)), unitId: 'unit-armor7', officerId: 'off-linze',
      locationId: 'loc-bridge', deps: ['act-a1'], priority: 1,
      costs: [{ supplyId: 'sup-fuel', qty: 8 }], note: '' },
    // 与 A-01 同时段、同部队 —— 批准时应被 A-01 拦截
    { id: 'act-a3', code: 'A-03', title: '炮兵连转移阵地', status: 'draft',
      start: iso(at(2, 30)), end: iso(at(3, 30)), unitId: 'unit-art22', officerId: 'off-zhouyue',
      locationId: 'loc-tower', deps: [], priority: 3, costs: [], note: '' },
    // 目标地点仅在 0–2h / 24–30h 开放，行动在 5h 之后 —— 开放时段拦截
    { id: 'act-a4', code: 'A-04', title: '军械库夜间补给', status: 'draft',
      start: iso(at(5)), end: iso(at(6)), unitId: 'unit-infantry3', officerId: 'off-anran',
      locationId: 'loc-arsenal', deps: [], priority: 2,
      costs: [{ supplyId: 'sup-ammo', qty: 2 }], note: '' },
    // 燃油库存仅 30：已批准 0，本条要 60 —— 物资不足拦截
    { id: 'act-a5', code: 'A-05', title: '纵深机动穿插', status: 'draft',
      start: iso(at(8)), end: iso(at(10)), unitId: 'unit-armor7', officerId: 'off-linze',
      locationId: 'loc-square', deps: ['act-a2'], priority: 2,
      costs: [{ supplyId: 'sup-fuel', qty: 60 }], note: '' },
    // 成环：A-06 ↔ A-07
    { id: 'act-a6', code: 'A-06', title: '广场侦察（环）', status: 'draft',
      start: iso(at(12)), end: iso(at(13)), unitId: 'unit-recon1', officerId: 'off-yeqi',
      locationId: 'loc-square', deps: ['act-a7'], priority: 3, costs: [], note: '' },
    { id: 'act-a7', code: 'A-07', title: '侦察连接应（环）', status: 'draft',
      start: iso(at(13)), end: iso(at(14)), unitId: 'unit-recon1', officerId: 'off-yeqi',
      locationId: 'loc-square', deps: ['act-a6'], priority: 3, costs: [], note: '' },
    // 可正常批准
    { id: 'act-a8', code: 'A-08', title: '钟楼观察哨', status: 'draft',
      start: iso(at(1)), end: iso(at(2)), unitId: 'unit-recon1', officerId: 'off-yeqi',
      locationId: 'loc-tower', deps: [], priority: 4,
      costs: [{ supplyId: 'sup-med', qty: 1 }], note: '' },
    // 执行中（结束时刻已过 → 逾期标记）
    { id: 'act-a9', code: 'A-09', title: '步兵 3 营接敌', status: 'executing',
      start: iso(at(-3)), end: iso(at(-1)), unitId: 'unit-infantry3', officerId: 'off-anran',
      locationId: 'loc-bridge', deps: [], priority: 2,
      costs: [{ supplyId: 'sup-ammo', qty: 2 }], note: '' },
    // 已完成（逾期标记只看结束时刻）
    { id: 'act-a10', code: 'A-10', title: '前夜警戒部署', status: 'completed',
      start: iso(at(-8)), end: iso(at(-5)), unitId: 'unit-infantry3', officerId: 'off-anran',
      locationId: 'loc-bridge', deps: [], priority: 5,
      costs: [{ supplyId: 'sup-ammo', qty: 1 }], note: '按计划完成' },
  ];
  return {
    factions, units, officers, locations, supplies, actions,
    seq: { factions: 1, units: 1, officers: 1, locations: 1, supplies: 1, actions: 10 },
    log: [],
  };
}

// ---------- 纯选择器 ----------
export const byId = (list) => Object.fromEntries((list || []).map((x) => [x.id, x]));

export function supplyUsage(state) {
  // 已批准 + 执行中视为已占用；已完成视为已实际消耗
  const used = {};
  for (const a of state.actions) {
    if (!['approved', 'executing', 'completed'].includes(a.status)) continue;
    for (const c of (a.costs || [])) {
      used[c.supplyId] = (used[c.supplyId] || 0) + (Number(c.qty) || 0);
    }
  }
  return used;
}

export function findCycle(actions) {
  // 返回第一个环上的行动 id 数组；无环返回 null
  const adj = {};
  for (const a of actions) adj[a.id] = (a.deps || []).filter((d) => actions.some((x) => x.id === d));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  const stack = [];
  let found = null;
  const dfs = (u) => {
    if (found) return;
    color[u] = GRAY;
    stack.push(u);
    for (const v of adj[u] || []) {
      if (color[v] === GRAY) {
        found = stack.slice(stack.indexOf(v)).concat(v);
        return;
      }
      if (color[v] !== BLACK) dfs(v);
      if (found) return;
    }
    stack.pop();
    color[u] = BLACK;
  };
  for (const a of actions) {
    if (color[a.id] !== BLACK) dfs(a.id);
    if (found) return found;
  }
  return null;
}

// 单条行动的批准问题（不含批内互查）。返回 [{code, msg, with?}]
export function actionIssues(state, action, opts = {}) {
  const issues = [];
  const loc = state.locations.find((l) => l.id === action.locationId);
  const unit = state.units.find((u) => u.id === action.unitId);
  const officer = state.officers.find((o) => o.id === action.officerId);
  const startMs = action.start ? new Date(action.start).getTime() : NaN;
  const endMs = action.end ? new Date(action.end).getTime() : NaN;

  if (!action.start || !action.end) issues.push({ code: 'time', msg: '缺少开始或结束时段' });
  else if (isNaN(startMs) || isNaN(endMs)) issues.push({ code: 'time', msg: '时段不是合法时间' });
  else if (startMs >= endMs) issues.push({ code: 'time', msg: '结束时段早于开始时段' });

  if (!unit) issues.push({ code: 'unit', msg: '未指定部队' });
  if (!officer) issues.push({ code: 'officer', msg: '未指定负责人' });
  if (!loc) issues.push({ code: 'location', msg: '未指定目标地点' });

  // 负责人必须属于所选部队（改派/导入后不一致都在此拦截）
  if (unit && officer && officer.unitId !== unit.id) {
    issues.push({ code: 'officer-unit', msg: `负责人「${officer.rank || ''} ${officer.name}」不属于部队「${unit.name}」`, with: { type: 'unit', id: unit.id } });
  }

  if (!isNaN(startMs) && !isNaN(endMs) && loc && !windowContains(loc.windows, startMs, endMs)) {
    issues.push({ code: 'window', msg: `超出地点「${loc.name}」的开放时段`, with: { type: 'location', id: loc.id } });
  }

  // 依赖：必须存在、不能是草稿（草稿不可作为前置）、不能指向自己
  for (const depId of action.deps || []) {
    const dep = state.actions.find((x) => x.id === depId);
    if (!dep) { issues.push({ code: 'dep-missing', msg: `依赖行动不存在（${depId}）`, with: { type: 'action', id: depId } }); continue; }
    if (dep.id === action.id) issues.push({ code: 'dep-self', msg: '不能依赖自身', with: { type: 'action', id: dep.id } });
    if (dep.status === 'draft') issues.push({ code: 'dep-draft', msg: `前置行动「${dep.code} ${dep.title}」仍为草稿`, with: { type: 'action', id: dep.id } });
  }

  // 同时段同部队（与已批准/执行中冲突；已完成的历史行动不阻挡未来批准）
  if (unit && action.start && action.end) {
    for (const other of state.actions) {
      if (other.id === action.id || other.unitId !== action.unitId) continue;
      if (!['approved', 'executing'].includes(other.status)) continue;
      if (overlaps(action.start, action.end, other.start, other.end)) {
        issues.push({ code: 'unit-busy', msg: `部队「${unit.name}」同时段已分派给「${other.code} ${other.title}」`, with: { type: 'action', id: other.id } });
      }
    }
  }

  // 物资：按当前全部已批准/执行中占用（本条若已是 approved/executing 则需扣除自身占用）
  const used = supplyUsage(state);
  for (const c of action.costs || []) {
    const sup = state.supplies.find((s) => s.id === c.supplyId);
    if (!sup) { issues.push({ code: 'supply-missing', msg: '消耗引用了不存在的物资' }); continue; }
    const qty = Number(c.qty) || 0;
    let reserved = used[sup.id] || 0;
    if (['approved', 'executing'].includes(action.status)) reserved -= qty; // 重批自身时不重复计数
    const left = (sup.stock || 0) - reserved;
    if (qty > left) {
      issues.push({ code: 'supply-short', msg: `物资「${sup.name}」不足：需要 ${qty}${sup.unit || ''}，剩余可用 ${Math.max(0, left)}${sup.unit || ''}`, with: { type: 'supply', id: sup.id } });
    }
  }

  // 环检测（全图）
  if (!opts.skipCycle) {
    const others = state.actions.filter((x) => x.id !== action.id);
    const probe = others.concat(action);
    const cyc = findCycle(probe);
    if (cyc && cyc.includes(action.id)) {
      const names = probe.filter((x) => cyc.includes(x.id)).map((x) => `${x.code}`).join(' → ');
      issues.push({ code: 'cycle', msg: `依赖成环：${names}`, with: { type: 'cycle', ids: cyc } });
    }
  }
  return issues;
}

// 批量批准计划：批内还要互查同部队时段 / 物资合计 / 环
export function planApproval(state, ids) {
  const targets = ids.map((id) => state.actions.find((a) => a.id === id)).filter(Boolean);
  // 单条固有问题
  const perAction = {};
  for (const a of targets) perAction[a.id] = actionIssues(state, a);

  // 批内同部队时段冲突
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i], b = targets[j];
      if (a.unitId && a.unitId === b.unitId && a.start && b.start && overlaps(a.start, a.end, b.start, b.end)) {
        perAction[a.id].push({ code: 'unit-busy-batch', msg: `批内冲突：与「${b.code} ${b.title}」同时段使用同一部队`, with: { type: 'action', id: b.id } });
        perAction[b.id].push({ code: 'unit-busy-batch', msg: `批内冲突：与「${a.code} ${a.title}」同时段使用同一部队`, with: { type: 'action', id: a.id } });
      }
    }
  }

  // 批内物资合计（只统计目标中当前为草稿者新增的占用）
  const stockById = byId(state.supplies);
  const used = supplyUsage(state);
  const need = {};
  for (const a of targets) need[a.id] = {};
  for (const a of targets) {
    for (const c of a.costs || []) need[a.id][c.supplyId] = (need[a.id][c.supplyId] || 0) + (Number(c.qty) || 0);
  }
  const totals = {};
  for (const a of targets) for (const [sid, q] of Object.entries(need[a.id])) totals[sid] = (totals[sid] || 0) + q;
  for (const a of targets) {
    for (const [sid, q] of Object.entries(need[a.id])) {
      const sup = stockById[sid];
      if (!sup) continue;
      const left = (sup.stock || 0) - (used[sid] || 0);
      if (totals[sid] > left) {
        perAction[a.id].push({ code: 'supply-short-batch', msg: `批量合计物资「${sup.name}」不足：本批共需 ${totals[sid]}${sup.unit || ''}，剩余可用 ${Math.max(0, left)}${sup.unit || ''}`, with: { type: 'supply', id: sid } });
      }
    }
  }

  // 批内/全图环
  const cyc = findCycle(state.actions);
  if (cyc) {
    for (const a of targets) {
      if (cyc.includes(a.id)) {
        const names = state.actions.filter((x) => cyc.includes(x.id)).map((x) => x.code).join(' → ');
        perAction[a.id].push({ code: 'cycle', msg: `依赖成环：${names}`, with: { type: 'cycle', ids: cyc } });
      }
    }
  }

  const ok = targets.filter((a) => perAction[a.id].length === 0).map((a) => a.id);
  const blocked = targets.filter((a) => perAction[a.id].length > 0)
    .map((a) => ({ id: a.id, code: a.code, title: a.title, issues: perAction[a.id] }));
  return { ok, blocked };
}

// 批量分派计划：改派后的部队/负责人必须一致；非草稿不允许改派调度归属
export function planBatchAssign(state, ids, patch) {
  const blocked = [];
  const ok = [];
  for (const id of ids) {
    const a = state.actions.find((x) => x.id === id);
    if (!a) continue;
    const nextUnitId = patch.unitId || a.unitId;
    const nextOfficerId = patch.officerId || a.officerId;
    const issues = [];
    if (a.status !== 'draft') {
      issues.push({ code: 'not-draft', msg: `行动「${a.code} ${a.title}」当前为${STATUSES[a.status].label}，仅草稿可改派（请先撤回批准/重开）` });
    }
    if (patch.unitId) {
      const u = state.units.find((x) => x.id === nextUnitId);
      if (!u) issues.push({ code: 'unit', msg: '目标部队不存在' });
      else if (patch.officerId) {
        const o = state.officers.find((x) => x.id === nextOfficerId);
        if (!o || o.unitId !== u.id) issues.push({ code: 'officer-unit', msg: `负责人「${o?.name || nextOfficerId}」不属于部队「${u.name}」` });
      } else {
        // 换部队时必须同时指定属于新部队的负责人，避免留下“新部队 + 旧负责人”的不一致
        const oldOfficer = state.officers.find((x) => x.id === nextOfficerId);
        if (!oldOfficer || oldOfficer.unitId !== u.id) {
          issues.push({ code: 'officer-required', msg: `改派到部队「${u.name}」时必须同时选择该部队的负责人（原负责人 ${oldOfficer ? `「${oldOfficer.name}」不属该部队` : '缺失'}）` });
        }
      }
    } else if (patch.officerId) {
      const o = state.officers.find((x) => x.id === nextOfficerId);
      const u = state.units.find((x) => x.id === nextUnitId);
      if (o && u && o.unitId !== u.id) issues.push({ code: 'officer-unit', msg: `负责人「${o.name}」不属于行动当前部队「${u.name}」` });
    }
    if (issues.length) blocked.push({ id, code: a.code, title: a.title, issues });
    else ok.push(id);
  }
  return { ok, blocked };
}

// 行动状态机
export const TRANSITIONS = {
  draft: ['approved'],
  approved: ['executing', 'draft'], // approved→draft = 撤销批准
  executing: ['completed', 'approved'], // 允许暂停退回已批准
  completed: [], // 完成后只能走“重开”，由专用入口（需填原因）转 draft
};
export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function isOverdue(action, now = Date.now()) {
  if (action.status === 'completed') return false;
  return action.end && new Date(action.end).getTime() < now;
}

export function nextCode(state) {
  const n = (state.seq.actions || 0) + 1;
  return 'A-' + String(n).padStart(2, '0');
}

// ---------- Reducer（返回 { next, entry }：next 为新数据，entry 为一条审计记录；
//            日志的落盘与撤销栈由 store 统一处理）----------
function withEntry(next, entry) {
  return { next, entry };
}

export function makeId(state, kind) {
  const def = ENTITY_DEFS[kind];
  const n = (state.seq[kind] || 0) + 1;
  return { id: `${def.idPrefix}-${n}`, seq: { ...state.seq, [kind]: n } };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'entity/upsert': {
      const { kind, item } = action;
      const list = state[kind];
      const idx = list.findIndex((x) => x.id === item.id);
      const exists = idx >= 0;
      const nextList = exists ? list.map((x) => (x.id === item.id ? item : x)) : list.concat(item);
      let next = { ...state, [kind]: nextList };
      if (!exists) {
        const n = (state.seq[kind] || 0) + 1;
        next.seq = { ...state.seq, [kind]: n };
      }
      const label = ENTITY_DEFS[kind].label;
      return withEntry(next, { kind: 'entity', text: `${exists ? '编辑' : '新建'}${label}「${item[ENTITY_DEFS[kind].nameField]}」` });
    }
    case 'entity/delete': {
      const { kind, id } = action;
      const item = state[kind].find((x) => x.id === id);
      const next = { ...state, [kind]: state[kind].filter((x) => x.id !== id) };
      return withEntry(next, { kind: 'entity', text: `删除${ENTITY_DEFS[kind].label}「${item?.[ENTITY_DEFS[kind].nameField] || id}」` });
    }
    case 'action/upsert': {
      const { item } = action;
      const idx = state.actions.findIndex((x) => x.id === item.id);
      const exists = idx >= 0;
      let next;
      if (exists) {
        next = { ...state, actions: state.actions.map((x) => (x.id === item.id ? item : x)) };
      } else {
        const n = (state.seq.actions || 0) + 1;
        next = { ...state, actions: state.actions.concat(item), seq: { ...state.seq, actions: n } };
      }
      return withEntry(next, { kind: 'action', text: `${exists ? '编辑行动' : '新建草稿'}「${item.code} ${item.title}」` });
    }
    case 'action/delete': {
      const item = state.actions.find((x) => x.id === action.id);
      const next = { ...state, actions: state.actions.filter((x) => x.id !== action.id) };
      return withEntry(next, { kind: 'action', text: `删除行动「${item?.code || action.id} ${item?.title || ''}」` });
    }
    case 'action/setStatus': {
      const { id, to, reason } = action;
      const item = state.actions.find((x) => x.id === id);
      if (!item) return withEntry(state, null);
      const updated = { ...item, status: to };
      if (to === 'draft' && item.status === 'completed') {
        updated.reopenReason = reason;
        updated.reopenedAt = new Date().toISOString();
      }
      const next = { ...state, actions: state.actions.map((x) => (x.id === id ? updated : x)) };
      const verb = to === 'draft' && item.status === 'completed' ? '重开' : `状态改为「${STATUSES[to].label}」`;
      return withEntry(next, { kind: 'transition', actionId: id, from: item.status, to,
        text: `${verb}行动「${item.code} ${item.title}」${reason ? `，原因：${reason}` : ''}` });
    }
    case 'action/batchAssign': {
      const { ids, patch } = action;
      // 防御：任何入口都不允许把负责人改成与部队不一致
      const { ok } = planBatchAssign(state, ids, patch);
      if (!ok.length) return withEntry(state, null);
      const okSet = new Set(ok);
      const parts = [];
      if (patch.unitId) parts.push('更换部队');
      if (patch.officerId) parts.push('更换负责人');
      if (patch.priority !== undefined) parts.push(`调整优先级为 P${patch.priority}`);
      const next = { ...state, actions: state.actions.map((a) => (okSet.has(a.id) ? { ...a, ...patch } : a)) };
      return withEntry(next, { kind: 'batch', text: `批量分派 ${ok.length} 个行动（${parts.join('、') || '无变更'}）` });
    }
    case 'action/batchApprove': {
      const { ids } = action;
      const next = { ...state, actions: state.actions.map((a) => (ids.includes(a.id) ? { ...a, status: 'approved' } : a)) };
      const codes = ids.map((id) => state.actions.find((a) => a.id === id)?.code).filter(Boolean).join('、');
      return withEntry(next, { kind: 'batch', text: `批量批准 ${ids.length} 个行动：${codes}` });
    }
    default:
      return withEntry(state, null);
  }
}

// 实体被引用检查（删除前）
export function usageOf(state, kind, id) {
  const refs = [];
  const add = (text) => refs.push(text);
  if (kind === 'factions') for (const u of state.units) if (u.factionId === id) add(`部队「${u.name}」`);
  if (kind === 'units') {
    for (const o of state.officers) if (o.unitId === id) add(`军官「${o.name}」`);
    for (const a of state.actions) if (a.unitId === id) add(`行动「${a.code} ${a.title}」`);
  }
  if (kind === 'officers') for (const a of state.actions) if (a.officerId === id) add(`行动「${a.code} ${a.title}」`);
  if (kind === 'locations') for (const a of state.actions) if (a.locationId === id) add(`行动「${a.code} ${a.title}」`);
  if (kind === 'supplies') for (const a of state.actions) for (const c of a.costs || []) if (c.supplyId === id) add(`行动「${a.code} ${a.title}」的消耗`);
  return refs;
}

// ---------- 持久化 ----------
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.present || !parsed.present.actions) return null;
    return parsed;
  } catch {
    return null;
  }
}
export function saveState(history) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch { /* 配额满时静默 */ }
}
