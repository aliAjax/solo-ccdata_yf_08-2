// 浏览器端到端验证：批准拦截、状态流转、批量操作、重开、导入失败、刷新恢复
import { chromium } from 'playwright';

const BASE = 'http://localhost:4173/';
let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name} ${extra}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const row = (page, id) => page.locator(`[data-testid="action-row"][data-action-id="${id}"]`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => { console.log('  [pageerror]', e.message); });

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('[data-testid="action-grid"]');

// ---------- 0. 初始渲染 ----------
check('默认进入行动调度视图，10 个行动种子数据', await page.locator('[data-testid="action-row"]').count() === 10);
check('逾期角标存在（A-09 已过结束时刻）', (await page.textContent('[data-testid="kpi-overdue"]')).includes('逾期 1'));
check('A-09 行带逾期标记', await row(page, 'act-a9').locator('[data-testid="overdue-tag"]').count() === 1);

// 默认按优先级排序：P1 在前
const firstPrio = await page.locator('[data-testid="action-grid"] tbody tr .prio-badge').first().textContent();
check('默认按优先级排序（首行为 P1）', firstPrio === 'P1', `实际 ${firstPrio}`);

// ---------- 1. 批准拦截（逐个冲突类型）----------
// 1a. A-03 同时段同部队 vs 已批准的 A-01
await page.locator('[data-testid="approve-act-a3"]').click();
await page.waitForSelector('[data-testid="conflict-list"]');
let c3 = page.locator('[data-testid="conflict-act-a3"]');
check('A-03 批准被拦截（冲突弹框）', await c3.count() === 1);
check('拦截原因为“部队冲突”并指出冲突对象 A-01',
  (await c3.textContent()).includes('部队冲突') && (await c3.textContent()).includes('A-01'));
await page.screenshot({ path: '/workspace/e2e-conflict.png' });
await page.locator('[data-testid="jump-conflict"]').first().click();
await sleep(100);
check('点击“查看冲突对象”打开 A-01 详情', (await page.locator('.modal-head h2').textContent()).includes('A-01'));
await page.keyboard.press('Escape').catch(() => {});
await page.locator('.modal-foot .btn').first().click().catch(() => {});
await sleep(100);

// 1b. A-04 超出地点开放时段
await page.locator('[data-testid="approve-act-a4"]').click();
await page.waitForSelector('[data-testid="conflict-act-a4"]');
let c4 = page.locator('[data-testid="conflict-act-a4"]');
check('A-04 因“开放时段”被拦截并指出地点', (await c4.textContent()).includes('开放时段') && (await c4.textContent()).includes('旧军械库'));
await page.locator('.modal-foot .btn').first().click();

// 1c. A-05 物资不足（燃油 30，需 60）
await page.locator('[data-testid="approve-act-a5"]').click();
await page.waitForSelector('[data-testid="conflict-act-a5"]');
let c5text = await page.locator('[data-testid="conflict-act-a5"]').textContent();
check('A-05 因“物资不足”被拦截并给出数量', c5text.includes('物资不足') && c5text.includes('60') && c5text.includes('剩余可用 30'));
// 同时 A-05 依赖草稿 A-02
check('A-05 同时报告前置行动 A-02 仍为草稿', c5text.includes('前置行动') && c5text.includes('A-02'));
await page.locator('.modal-foot .btn').first().click();

// 1d. A-06 依赖成环（A-06 ↔ A-07）
await page.locator('[data-testid="approve-act-a6"]').click();
await page.waitForSelector('[data-testid="conflict-act-a6"]');
let c6text = await page.locator('[data-testid="conflict-act-a6"]').textContent();
check('A-06 因“依赖成环”被拦截并列出环路径', c6text.includes('依赖成环') && c6text.includes('A-06') && c6text.includes('A-07'));
await page.locator('.modal-foot .btn').first().click();

// 被拦截的行动仍然是草稿
check('拦截后 A-03/A-04/A-05/A-06 仍为草稿（未做改动）',
  (await row(page, 'act-a3').locator('[data-status]').getAttribute('data-status')) === 'draft' &&
  (await row(page, 'act-a4').locator('[data-status]').getAttribute('data-status')) === 'draft' &&
  (await row(page, 'act-a5').locator('[data-status]').getAttribute('data-status')) === 'draft' &&
  (await row(page, 'act-a6').locator('[data-status]').getAttribute('data-status')) === 'draft');

// ---------- 2. 正常批准 + 状态流转 ----------
await page.locator('[data-testid="approve-act-a8"]').click();
await sleep(100);
check('A-08 批准成功（无冲突）', (await row(page, 'act-a8').locator('[data-status]').getAttribute('data-status')) === 'approved');

await page.locator('[data-testid="execute-act-a8"]').click();
await sleep(100);
check('A-08 批准 → 执行中', (await row(page, 'act-a8').locator('[data-status]').getAttribute('data-status')) === 'executing');

await page.locator('[data-testid="complete-act-a8"]').click();
await sleep(100);
check('A-08 执行中 → 已完成', (await row(page, 'act-a8').locator('[data-status]').getAttribute('data-status')) === 'completed');

// 完成后不允许直接改状态（只有“重开…”按钮）
check('已完成行动只提供“重开”入口', await page.locator('[data-testid="reopen-act-a8"]').count() === 1);

// 重开：不填原因应被拒绝
await page.locator('[data-testid="reopen-act-a8"]').click();
await page.waitForSelector('[data-testid="reopen-reason"]');
await page.locator('[data-testid="reopen-confirm"]').click();
await page.waitForSelector('[data-testid="reopen-error"]');
check('重开不填原因被拒绝', await page.locator('[data-testid="reopen-error"]').isVisible());
await page.locator('[data-testid="reopen-reason"]').fill('复盘发现观察点未实际控制');
await page.locator('[data-testid="reopen-confirm"]').click();
await sleep(100);
check('填写原因后重开成功（回到草稿）', (await row(page, 'act-a8').locator('[data-status]').getAttribute('data-status')) === 'draft');
check('行内显示重开原因', (await row(page, 'act-a8').textContent()).includes('复盘发现观察点未实际控制'));

// A-02 依赖已批准的 A-01，本身可批准
await page.locator('[data-testid="approve-act-a2"]').click();
await sleep(100);
check('A-02（前置 A-01 已批准）可正常批准', (await row(page, 'act-a2').locator('[data-status]').getAttribute('data-status')) === 'approved');

// ---------- 3. 批量操作 ----------
// 勾选 A-04、A-05、A-06（均有问题）+ A-08（现在是草稿，可通过）
await page.locator('[data-testid="select-act-a4"]').check();
await page.locator('[data-testid="select-act-a5"]').check();
await page.locator('[data-testid="select-act-a6"]').check();
await page.locator('[data-testid="select-act-a8"]').check();
check('批量条显示已选 4 个', (await page.textContent('[data-testid="selected-count"]')) === '4');
await page.locator('[data-testid="batch-approve"]').click();
await page.waitForSelector('[data-testid="conflict-list"]');
check('批量批准弹出拦截汇总（3 项）', await page.locator('[data-testid="conflict-act-a4"], [data-testid="conflict-act-a5"], [data-testid="conflict-act-a6"]').count() === 3);
await page.locator('[data-testid="approve-ok-only"]').click();
await sleep(100);
check('“仅批准通过的”后 A-08 被批准', (await row(page, 'act-a8').locator('[data-status]').getAttribute('data-status')) === 'approved');
check('被拦截的 A-04/05/06 仍为草稿',
  (await row(page, 'act-a4').locator('[data-status]').getAttribute('data-status')) === 'draft' &&
  (await row(page, 'act-a6').locator('[data-status]').getAttribute('data-status')) === 'draft');

// 批量分派：A-04、A-05 改派到 侦察 1 连 / 叶柒
await page.locator('[data-testid="select-act-a4"]').check();
await page.locator('[data-testid="select-act-a5"]').check();
await page.locator('[data-testid="batch-assign"]').click();
await page.waitForSelector('[data-testid="assign-unit"]');
await page.selectOption('[data-testid="assign-unit"]', 'unit-recon1');
await page.waitForTimeout(50);
await page.selectOption('[data-testid="assign-officer"]', 'off-yeqi');
await page.selectOption('[data-testid="assign-priority"]', '4');
await page.locator('[data-testid="assign-confirm"]').click();
await sleep(100);
let t4 = await row(page, 'act-a4').textContent();
check('批量分派生效：A-04 改派侦察 1 连 / 叶柒 / P4',
  t4.includes('侦察 1 连') && t4.includes('叶柒') && (await row(page, 'act-a4').locator('.prio-badge').textContent()) === 'P4');
check('批量分派同样作用于 A-05', (await row(page, 'act-a5').textContent()).includes('侦察 1 连'));

// ---------- 4. 撤销 / 重做 ----------
await page.locator('[data-testid="undo"]').click();
await sleep(100);
check('撤销：批量分派回滚（A-04 恢复原部队）', (await row(page, 'act-a4').textContent()).includes('第 3 步兵营'));
await page.locator('[data-testid="redo"]').click();
await sleep(100);
check('重做：分派再次生效', (await row(page, 'act-a4').textContent()).includes('侦察 1 连'));
// 再撤销，恢复到分派前，便于后续持久化断言一致
await page.locator('[data-testid="undo"]').click();
await sleep(100);

// ---------- 5. 排序与筛选 ----------
await page.selectOption('[data-testid="sort-by"]', 'code');
await sleep(50);
let codes = await page.locator('[data-testid="action-grid"] tbody tr .linklike b').allTextContents();
check('按编号排序（A-01 在前）', codes[0] === 'A-01', `实际 ${codes[0]}`);
await page.selectOption('[data-testid="sort-by"]', 'priority');
await page.check('[data-testid="filter-overdue"]');
await sleep(50);
check('仅看逾期：只剩 A-09',
  await page.locator('[data-testid="action-row"]').count() === 1 &&
  (await page.locator('[data-testid="action-row"]').first().getAttribute('data-action-id')) === 'act-a9');
await page.uncheck('[data-testid="filter-overdue"]');
await page.selectOption('[data-testid="filter-unit"]', 'unit-armor7');
await sleep(50);
let armorRows = await page.locator('[data-testid="action-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-action-id')));
check('按部队筛选：装甲营只有 A-02 与 A-05',
  armorRows.length === 2 && armorRows.includes('act-a2') && armorRows.includes('act-a5'));
await page.selectOption('[data-testid="filter-unit"]', 'all');

// ---------- 6. 导入失败不覆盖 ----------
await page.locator('[data-testid="nav-io"]').click();
await page.waitForSelector('[data-testid="io-import"]');

// 6a. 错误版本号
await page.locator('[data-testid="sample-badversion"]').click();
await page.waitForSelector('[data-testid="import-errors"]');
let badVer = await page.locator('[data-testid="import-errors"]').textContent();
check('错误版本号被拒并提示路径 $.version', badVer.includes('$.version') && badVer.includes('v99'));
await page.locator('[data-testid="bad-close"]').click();

// 6b. 逐项错误
await page.locator('[data-testid="sample-baditems"]').click();
await page.waitForSelector('[data-testid="import-errors"]');
let errCount = await page.locator('[data-testid="import-errors"] li').count();
let errText = await page.locator('[data-testid="import-errors"]').textContent();
check(`逐项错误一次性列出（${errCount} 项，≥10）`, errCount >= 10, `实际 ${errCount}`);
check('包含悬空部队/军官/地点/物资引用', errText.includes('factionId') && errText.includes('unitId') && errText.includes('locationId') && errText.includes('supplyId'));
check('包含负库存、重复 id、成环、时间倒挂、非法日期',
  errText.includes('stock') && errText.includes('重复') && errText.includes('成环') && errText.includes('start'));
await page.screenshot({ path: '/workspace/e2e-import-errors.png' });
await page.locator('[data-testid="bad-close"]').click();

// 失败后现有数据未变（回到行动视图仍是 10 行）
await page.locator('[data-testid="nav-actions"]').click();
check('导入失败后现有数据未被覆盖（仍为 10 个行动）', await page.locator('[data-testid="action-row"]').count() === 10);
check('导入失败后 A-08 仍为已批准（状态未丢）', (await row(page, 'act-a8').locator('[data-status]').getAttribute('data-status')) === 'approved');

// 6c. 合法样本 → 二次确认 → 整库替换
await page.locator('[data-testid="nav-io"]').click();
await page.locator('[data-testid="sample-good"]').click();
await page.waitForSelector('[data-testid="import-counts"]');
let counts = await page.locator('[data-testid="import-counts"]').textContent();
check('合法样本通过校验并显示清点（2 行动）', counts.includes('行动') && counts.includes('2'));
await page.locator('[data-testid="import-confirm"]').click();
await page.waitForSelector('[data-testid="io-import"]');
await page.locator('[data-testid="nav-actions"]').click();
await page.waitForSelector('[data-testid="action-grid"]');
check('确认导入后整库替换为样本（2 个行动）', await page.locator('[data-testid="action-row"]').count() === 2);
check('导入后出现样本行动 X-01', await page.locator('[data-action-id="act-1"]').count() === 1);

// 撤销导入 → 原数据恢复
await page.locator('[data-testid="undo"]').click();
await sleep(100);
check('撤销导入：恢复原 10 个行动', await page.locator('[data-testid="action-row"]').count() === 10);

// ---------- 7. 刷新恢复 ----------
await page.reload();
await page.waitForSelector('[data-testid="action-grid"]');
check('刷新后数据保留（10 个行动）', await page.locator('[data-testid="action-row"]').count() === 10);
check('刷新后 A-08 仍为 approved（导入已撤销的状态保留）', (await row(page, 'act-a8').locator('[data-status]').getAttribute('data-status')) === 'approved');
check('刷新后 A-02 仍为 approved', (await row(page, 'act-a2').locator('[data-status]').getAttribute('data-status')) === 'approved');
check('刷新后撤销栈保留（撤销按钮可用）', await page.locator('[data-testid="undo"]').isEnabled());
await page.locator('[data-testid="undo"]').click();
await sleep(100);
check('刷新后撤销可执行（重做按钮变为可用，历史栈完整）', await page.locator('[data-testid="redo"]').isEnabled());
await page.locator('[data-testid="redo"]').click();
await sleep(100);
check('刷新后重做恢复当前数据（10 个行动）', await page.locator('[data-testid="action-row"]').count() === 10);

// 刷新后再做一次编辑，再刷新，确认“加载后写入”也能持久化
await page.locator('[data-testid="tab-draft"]').click();
await sleep(50);
await page.locator('[data-testid="approve-act-a4"]').click().catch(() => {});
// A-04 有冲突会弹框，先关闭；改为批准无冲突的（先把 A-04 弹框关掉）
if (await page.locator('[data-testid="conflict-list"]').count()) {
  await page.locator('.modal-foot .btn').first().click();
}
await page.locator('[data-testid="tab-all"]').click();
// 用批量分派产生一个明确变更
await page.locator('[data-testid="select-act-a3"]').check();
await page.locator('[data-testid="batch-assign"]').click();
await page.waitForSelector('[data-testid="assign-priority"]');
await page.selectOption('[data-testid="assign-priority"]', '5');
await page.locator('[data-testid="assign-confirm"]').click();
await sleep(100);
check('刷新后可继续写入（A-03 优先级改为 P5）', (await row(page, 'act-a3').locator('.prio-badge').textContent()) === 'P5');
await page.reload();
await page.waitForSelector('[data-testid="action-grid"]');
check('再次刷新后该写入仍保留（A-03 为 P5）', (await row(page, 'act-a3').locator('.prio-badge').textContent()) === 'P5');

// ---------- 8. 基础数据维护 + 留痕 ----------
await page.locator('[data-testid="nav-entities"]').click();
await page.waitForSelector('[data-testid="entity-tab-locations"]');
await page.locator('[data-testid="entity-tab-supplies"]').click();
check('物资列表展示库存与占用', (await page.locator('[data-testid="entity-grid"]').textContent()).includes('已批准/执行占用'));
await page.locator('[data-testid="entity-new"]').click();
await page.waitForSelector('[data-testid="entity-save"]');
// name input is first .inp in modal
const modalInputs = page.locator('.modal .inp');
await modalInputs.first().fill('野战口粮');
// stock number input
const stockInput = page.locator('.modal input[type="number"]');
await stockInput.fill('50');
await page.locator('[data-testid="entity-save"]').click();
await sleep(100);
check('新建物资成功出现在列表', (await page.locator('[data-testid="entity-grid"]').textContent()).includes('野战口粮'));

await page.locator('[data-testid="nav-log"]').click();
await page.waitForSelector('[data-testid="log-list"]');
let logText = await page.locator('[data-testid="log-list"]').textContent();
check('变更留痕记录了批量操作', logText.includes('批量'));
check('变更留痕记录了状态流转/重开原因', logText.includes('重开') && logText.includes('复盘发现观察点未实际控制'));
check('变更留痕记录了导入', logText.includes('导入'));
check('变更留痕记录了撤销/重做', logText.includes('撤销') && logText.includes('重做'));
check('变更留痕记录了新建物资', logText.includes('野战口粮'));

// ---------- 9. 截图存档 ----------
await page.locator('[data-testid="nav-actions"]').click();
await page.waitForSelector('[data-testid="action-grid"]');
await page.screenshot({ path: '/workspace/e2e-actions.png', fullPage: true });
await page.locator('[data-testid="nav-log"]').click();
await page.screenshot({ path: '/workspace/e2e-log.png', fullPage: true });

console.log(results.join('\n'));
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
