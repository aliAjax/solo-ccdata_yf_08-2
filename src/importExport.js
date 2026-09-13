// 版本化 JSON 导入 / 导出 —— 逐项校验，任一错误则整批拒绝（不覆盖现有数据）
import { DOC_VERSION, findCycle, actionIssues } from './model.js';

export function buildExport(state) {
  const { log, seq, ...data } = state;
  return {
    app: 'campaign-console',
    version: DOC_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const validIso = (v) => typeof v === 'string' && ISO.test(v) && !isNaN(new Date(v).getTime());
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const validId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;

const LISTS = ['factions', 'units', 'officers', 'locations', 'supplies', 'actions'];

// 返回 { ok, errors:[{path,msg}], warnings:[msg], data }
export function validateImport(json) {
  const errors = [];
  const warnings = [];
  const fail = (path, msg) => errors.push({ path, msg });

  let doc = json;
  if (typeof json === 'string') {
    try { doc = JSON.parse(json); } catch (e) { return { ok: false, errors: [{ path: '$', msg: `JSON 解析失败：${e.message}` }], warnings: [] }; }
  }
  if (!isObj(doc)) return { ok: false, errors: [{ path: '$', msg: '顶层必须是对象' }], warnings: [] };

  // 版本
  if (doc.version === undefined) return { ok: false, errors: [{ path: '$.version', msg: '缺少版本号 version；仅接受 version: 1 的版本化文件' }], warnings: [] };
  if (typeof doc.version !== 'number' || doc.version !== DOC_VERSION) {
    return { ok: false, errors: [{ path: '$.version', msg: `不支持的版本 v${doc.version}，当前仅支持 v${DOC_VERSION}` }], warnings: [] };
  }
  if (!isObj(doc.data)) return { ok: false, errors: [{ path: '$.data', msg: '缺少数据对象 data' }], warnings: [] };

  const data = doc.data;
  const ids = {};
  for (const list of LISTS) {
    if (data[list] === undefined) { data[list] = []; warnings.push(`缺少 ${list}，按空列表处理`); }
    if (!Array.isArray(data[list])) { fail(`$.data.${list}`, '必须是数组'); data[list] = []; }
    ids[list] = new Set();
  }
  if (errors.length) return { ok: false, errors, warnings };

  // id 唯一性 & 基础类型（逐项）
  const nameFieldOf = (list) => (list === 'actions' ? 'title' : 'name');
  for (const list of LISTS) {
    const nameField = nameFieldOf(list);
    data[list].forEach((item, i) => {
      const p = `$.data.${list}[${i}]`;
      if (!isObj(item)) { fail(p, '必须是对象'); return; }
      if (!validId(item.id)) { fail(`${p}.id`, '缺少合法 id（非空字符串，≤64 字符）'); }
      else if (ids[list].has(item.id)) { fail(`${p}.id`, `id「${item.id}」在 ${list} 中重复`); }
      else ids[list].add(item.id);
      if (typeof item[nameField] !== 'string' || !item[nameField].trim()) fail(`${p}.${nameField}`, `缺少${list === 'actions' ? '标题 title' : '名称 name'}`);
    });
  }

  const has = (list, id) => id !== undefined && id !== null && id !== '' && ids[list].has(id);

  // ---- 逐项字段校验 ----
  data.factions.forEach((f, i) => {
    const p = `$.data.factions[${i}]`;
    if (!isObj(f)) return;
    if (f.color !== undefined && (typeof f.color !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(f.color))) fail(`${p}.color`, '颜色需为 #RRGGBB 形式');
    if (f.code !== undefined && typeof f.code !== 'string') fail(`${p}.code`, '代号需为字符串');
  });

  data.units.forEach((u, i) => {
    const p = `$.data.units[${i}]`;
    if (!isObj(u)) return;
    if (u.factionId && !has('factions', u.factionId)) fail(`${p}.factionId`, `阵营 id「${u.factionId}」不存在`);
    if (u.strength !== undefined && (typeof u.strength !== 'number' || u.strength < 0)) fail(`${p}.strength`, '兵力需为非负数字');
  });

  data.officers.forEach((o, i) => {
    const p = `$.data.officers[${i}]`;
    if (!isObj(o)) return;
    if (o.unitId && !has('units', o.unitId)) fail(`${p}.unitId`, `部队 id「${o.unitId}」不存在`);
    if (o.rank !== undefined && typeof o.rank !== 'string') fail(`${p}.rank`, '军衔需为字符串');
  });

  data.locations.forEach((l, i) => {
    const p = `$.data.locations[${i}]`;
    if (!isObj(l)) return;
    if (l.windows === undefined) return;
    if (!Array.isArray(l.windows)) { fail(`${p}.windows`, '开放时段必须是数组'); return; }
    l.windows.forEach((w, j) => {
      const wp = `${p}.windows[${j}]`;
      if (!isObj(w)) return fail(wp, '时段必须是 {start,end} 对象');
      if (!validIso(w.start)) fail(`${wp}.start`, '开始时间需为 ISO 8601（如 2026-09-13T08:00Z）');
      if (!validIso(w.end)) fail(`${wp}.end`, '结束时间需为 ISO 8601');
      if (validIso(w.start) && validIso(w.end) && new Date(w.start) > new Date(w.end)) fail(wp, '开放时段开始晚于结束');
    });
  });

  data.supplies.forEach((s, i) => {
    const p = `$.data.supplies[${i}]`;
    if (!isObj(s)) return;
    if (typeof s.stock !== 'number' || s.stock < 0) fail(`${p}.stock`, '库存需为非负数字');
  });

  const VALID_STATUS = ['draft', 'approved', 'executing', 'completed'];
  data.actions.forEach((a, i) => {
    const p = `$.data.actions[${i}]`;
    if (!isObj(a)) return;
    if (typeof a.code !== 'string' || !a.code.trim()) fail(`${p}.code`, '缺少行动编号 code');
    if (!validIso(a.start)) fail(`${p}.start`, '开始时段需为 ISO 8601');
    if (!validIso(a.end)) fail(`${p}.end`, '结束时段需为 ISO 8601');
    if (validIso(a.start) && validIso(a.end) && new Date(a.start) >= new Date(a.end)) fail(p, '开始时段必须早于结束时段');
    if (!has('units', a.unitId)) fail(`${p}.unitId`, `部队 id「${a.unitId}」不存在`);
    if (!has('officers', a.officerId)) fail(`${p}.officerId`, `负责人 id「${a.officerId}」不存在`);
    else if (has('units', a.unitId)) {
      const off = data.officers.find((o) => o.id === a.officerId);
      if (off && off.unitId !== a.unitId) fail(`${p}.officerId`, `负责人「${off.name}」不属于所选部队（军官隶属 ${off.unitId}，行动部队 ${a.unitId}）`);
    }
    if (!has('locations', a.locationId)) fail(`${p}.locationId`, `目标地点 id「${a.locationId}」不存在`);
    if (!VALID_STATUS.includes(a.status)) fail(`${p}.status`, `状态需为 ${VALID_STATUS.join('/')} 之一`);
    if (a.priority !== undefined && (!Number.isInteger(a.priority) || a.priority < 1 || a.priority > 5)) fail(`${p}.priority`, '优先级需为 1–5 的整数');
    if (a.deps !== undefined) {
      if (!Array.isArray(a.deps)) fail(`${p}.deps`, '依赖需为 id 数组');
      else a.deps.forEach((d) => { if (!has('actions', d)) fail(`${p}.deps`, `依赖行动 id「${d}」不存在`); });
    } else { a.deps = []; }
    if (a.costs === undefined) { a.costs = []; }
    if (!Array.isArray(a.costs)) fail(`${p}.costs`, '消耗需为数组');
    else (a.costs || []).forEach((c, j) => {
      const cp = `${p}.costs[${j}]`;
      if (!isObj(c)) return fail(cp, '消耗项必须是对象');
      if (!has('supplies', c.supplyId)) fail(`${cp}.supplyId`, `物资 id「${c.supplyId}」不存在`);
      if (typeof c.qty !== 'number' || c.qty <= 0) fail(`${cp}.qty`, '消耗量需为正数');
    });
  });

  // 依赖成环（导入文件内）
  const cyc = findCycle(data.actions);
  if (cyc) {
    const names = data.actions.filter((x) => cyc.includes(x.id)).map((x) => x.code || x.id).join(' → ');
    fail('$.data.actions', `依赖成环：${names}`);
  }

  // 语义校验：文件中已批准 / 执行中的行动必须通过与调度台完全相同的批准校验
  // （同时段同部队、依赖状态、地点开放时段、物资余量、负责人归属）。
  // 任何一条不通过都整库拒绝，并指出具体行动的 JSON 路径。
  const candidate = {
    factions: data.factions, units: data.units, officers: data.officers,
    locations: data.locations, supplies: data.supplies, actions: data.actions,
  };
  data.actions.forEach((a, i) => {
    if (a.status !== 'approved' && a.status !== 'executing') return;
    const issues = actionIssues(candidate, a, { skipCycle: true });
    for (const iss of issues) {
      // 纯结构/引用问题前面已按精确路径报过，这里只补“既定状态”带来的语义冲突
      if (['unit', 'officer', 'officer-unit', 'location', 'time', 'dep-missing', 'supply-missing'].includes(iss.code)) continue;
      fail(`$.data.actions[${i}]`, `[既定状态=${a.status}] ${iss.msg}`);
    }
  });

  if (errors.length) return { ok: false, errors, warnings };

  // 归一化
  for (const a of data.actions) {
    a.deps = a.deps || [];
    a.costs = a.costs || [];
    a.note = a.note || '';
  }
  for (const l of data.locations) l.windows = l.windows || [];
  for (const f of data.factions) { if (!f.color) f.color = '#7fa8c9'; }
  for (const s of data.supplies) { s.unit = s.unit || ''; }

  // 重建 seq（取各列表 id 无法推断时的安全下限：不覆盖既有自增）
  return {
    ok: true,
    errors: [],
    warnings,
    state: {
      version: DOC_VERSION,
      factions: data.factions,
      units: data.units,
      officers: data.officers,
      locations: data.locations,
      supplies: data.supplies,
      actions: data.actions,
      seq: {
        factions: data.factions.length,
        units: data.units.length,
        officers: data.officers.length,
        locations: data.locations.length,
        supplies: data.supplies.length,
        actions: data.actions.reduce((m) => m + 1, 0) + Math.max(0, ...data.actions
          .map((a) => parseInt(String(a.code || '').replace(/\D/g, ''), 10)).filter((n) => !isNaN(n))),
      },
    },
  };
}
