/* 界面逻辑：纯静态，无 fetch / 无后端。规则调用 js/rules.js。 */
(function () {
  'use strict';

  var R = window.BBEERules;
  var EL_COLOR = { 火: '#ff6b4a', 冰: '#57b8ff', 电: '#f5c518', 毒: '#7ad06a', 暗: '#a06bff', 光: '#e8f0ff', 刃: '#ff9d5c' };
  var EL_GLYPH = { 火: '火', 冰: '冰', 电: '电', 毒: '毒', 暗: '暗', 光: '光', 刃: '刃' };
  var KIND_TXT = { t1: 'Ⅰ', t2: 'Ⅱ', t3: 'Ⅲ', dual: '双' };
  var SLOT_T1 = R.SLOT_T1;
  var SLOT_T2_FIRST = R.SLOT_T2_FIRST, SLOT_T2_LAST = R.SLOT_T2_LAST;
  var SLOT_T3_FIRST = R.SLOT_T3_FIRST, SLOT_T3_LAST = R.SLOT_T3_LAST;
  var SLOT_DUAL_FIRST = R.SLOT_DUAL_FIRST, SLOT_DUAL_LAST = R.SLOT_DUAL_LAST;

  var CFG = null;
  var CARDS = new Map();
  var picks = new Map();          // "row-slot" -> cardId
  var sel = null;                 // {row, slot}
  var violations = [];

  var key = function (r, s) { return r + '-' + s; };
  var el = function (id) { return document.getElementById(id); };
  // 规则引擎用的形状：{row, slot, cardId}
  var rulesPicks = function () {
    return Array.from(picks.entries()).map(function (kv) {
      var parts = kv[0].split('-').map(Number);
      return { row: parts[0], slot: parts[1], cardId: kv[1] };
    });
  };
  // 存档用的形状：{row, slot, id}（id 与游戏数据里的卡牌 id 同名）
  var picksPayload = function () {
    return Array.from(picks.entries()).map(function (kv) {
      var parts = kv[0].split('-').map(Number);
      return { row: parts[0], slot: parts[1], id: kv[1] };
    });
  };

  function glyph(card) {
    var color = EL_COLOR[card.element] || '#fff';
    return '<span class="glyph" style="color:' + color + '">' + (EL_GLYPH[card.element] || '?') + '</span>';
  }

  function iconTag(card, cls) {
    var has = !!card.icon;
    var img = has ? '<img src="' + card.icon + '" alt="" loading="lazy" onerror="this.remove()">' : '';
    return '<span class="' + cls + (has ? ' has-icon' : '') + '">' + glyph(card) + img + '</span>';
  }

  // ---- 构筑存档（localStorage）----
  var BUILDS_KEY = 'bbee.builds.v1';
  function loadBuilds() {
    try {
      var v = JSON.parse(localStorage.getItem(BUILDS_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }
  function storeBuilds(list) {
    try { localStorage.setItem(BUILDS_KEY, JSON.stringify(list)); } catch (e) { /* 隐私模式忽略 */ }
  }
  var msgTimer = null;
  function buildMsg(t) {
    var box = el('buildMsg');
    box.textContent = t;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { box.textContent = ''; }, 3200);
  }
  function applyBuild(b) {
    picks.clear();
    var n = 0;
    (b.picks || []).forEach(function (p) {
      var row = Number(p.row), slot = Number(p.slot);
      if (CARDS.has(p.id) && row >= 1 && row <= CFG.rows.length && slot >= 1 && slot <= SLOT_DUAL_LAST) {
        picks.set(key(row, slot), p.id);
        n++;
      }
    });
    return n;
  }
  function renderBuilds() {
    var host = el('buildList');
    var list = loadBuilds();
    host.textContent = '';
    if (!list.length) {
      var none = document.createElement('div');
      none.className = 'bnone';
      none.textContent = '还没有存档';
      host.appendChild(none);
      return;
    }
    list.forEach(function (b) {
      var d = new Date(b.ts);
      var ts = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      var item = document.createElement('div');
      item.className = 'bitem';
      var nm = document.createElement('span');
      nm.className = 'bn';
      nm.textContent = String(b.name || '未命名');
      nm.title = nm.textContent;
      var ct = document.createElement('span');
      ct.className = 'bc';
      ct.textContent = (b.picks || []).length + ' 张 · ' + ts;
      var imp = document.createElement('button');
      imp.type = 'button'; imp.className = 'mini'; imp.textContent = '导入';
      imp.onclick = function () { importBuild(b.id); };
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'mini del'; del.textContent = '删除';
      del.onclick = function () { deleteBuild(b.id); };
      item.appendChild(nm); item.appendChild(ct); item.appendChild(imp); item.appendChild(del);
      host.appendChild(item);
    });
  }
  function saveCurrent() {
    if (!picks.size) { buildMsg('还没有选卡'); return; }
    var list = loadBuilds();
    var name = (el('buildName').value || '').trim() || ('构筑 ' + (list.length + 1));
    list.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.slice(0, 24),
      ts: Date.now(),
      picks: picksPayload(),
    });
    storeBuilds(list);
    el('buildName').value = '';
    renderBuilds();
    buildMsg('已保存「' + name.slice(0, 24) + '」');
  }
  function importBuild(id) {
    var b = loadBuilds().find(function (x) { return x.id === id; });
    if (!b) return;
    var n = applyBuild(b);
    buildMsg('已导入「' + (b.name || '未命名') + '」（' + n + ' 张）');
    recheck();
    var k = picks.keys().next().value;
    if (k) { var p = k.split('-').map(Number); select(p[0], p[1]); } else { select(1, 1); }
  }
  function deleteBuild(id) {
    var list = loadBuilds();
    var b = list.find(function (x) { return x.id === id; });
    if (!b) return;
    if (!confirm('删除「' + (b.name || '未命名') + '」？')) return;
    storeBuilds(list.filter(function (x) { return x.id !== id; }));
    renderBuilds();
    buildMsg('已删除');
  }

  function runSelfTest() {
    var before = picksPayload();
    var testKey = 'bbee.builds.selftest';
    var ok = false;
    var n = 0;
    try {
      localStorage.setItem(testKey, JSON.stringify([{ id: 't', name: 'selftest', ts: 0, picks: before }]));
      picks.clear();
      n = applyBuild(JSON.parse(localStorage.getItem(testKey))[0]);
      localStorage.removeItem(testKey);
      ok = n === before.length && before.every(function (b) {
        return picks.get(key(b.row, b.slot)) === b.id;
      });
    } catch (e) {
      ok = false;
    }
    recheck();
    document.title = ok ? 'SELFTEST PASS' : 'SELFTEST FAIL';
    var d = document.createElement('div');
    d.id = 'selftest';
    d.textContent = document.title + ' (' + n + '/' + before.length + ')';
    d.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:99;background:#000;color:#7dff9a;padding:6px 10px;border-radius:4px';
    document.body.appendChild(d);
  }

  // ---- 行 / 格 ----
  function branchCount(kind, t1) {
    if (!t1) return 0;
    var n = 0;
    CARDS.forEach(function (c) {
      if (c.kind === kind && c.element === t1.element && c.branch === t1.branch) n++;
    });
    return n;
  }
  function branchT2(t1) { return Math.min(branchCount('t2', t1), SLOT_T2_LAST - SLOT_T2_FIRST + 1); }
  function branchT3(t1) { return Math.min(branchCount('t3', t1), SLOT_T3_LAST - SLOT_T3_FIRST + 1); }
  function branchDual(t1) { return Math.min(branchCount('dual', t1), SLOT_DUAL_LAST - SLOT_DUAL_FIRST + 1); }

  function makeSlot(row, slot, rowName) {
    var id = picks.get(key(row, slot));
    var card = id ? CARDS.get(id) : null;
    var b = document.createElement('button');
    b.type = 'button';
    var isBad = card && violations.some(function (v) { return (v.cards || []).indexOf(id) !== -1; });
    b.className = 'slot' + (card ? '' : ' empty')
      + (sel && sel.row === row && sel.slot === slot ? ' sel' : '')
      + (isBad ? ' bad' : '');
    if (card) {
      b.innerHTML = '<div class="hex' + (card.icon ? ' has-icon' : '') + '">' + glyph(card) +
        (card.icon ? '<img src="' + card.icon + '" alt="" onerror="this.remove()">' : '') + '</div>' +
        '<span class="tier">' + (KIND_TXT[card.kind] || '') + '</span>';
    } else {
      b.innerHTML = '<div class="hex">?</div>';
    }
    b.dataset.row = row; b.dataset.slot = slot;
    b.title = card ? (card.element + '/' + card.branch + ' · ' + card.name) : (rowName + ' 第 ' + slot + ' 格（空）');
    b.onclick = function () { select(row, slot); };
    return b;
  }

  function zone(label, hint, slots, showLabel) {
    var z = document.createElement('div');
    z.className = 'zone' + (slots.length ? '' : ' empty');
    z.innerHTML = '<span class="zt">' + (showLabel ? label : '') + '</span>';
    if (hint) {
      var h = document.createElement('span');
      h.className = 'zhint';
      h.textContent = hint;
      z.appendChild(h);
    }
    slots.forEach(function (b) { z.appendChild(b); });
    return z;
  }

  function renderRows() {
    var host = el('rows');
    host.textContent = '';

    var head = document.createElement('div');
    head.className = 'row tiers';
    head.innerHTML = '<div class="label ghost"></div>' +
      '<div class="lane">' +
      '<div class="tierhead z1">Ⅰ 一级</div>' +
      '<div class="tierhead z2">Ⅱ 二级</div>' +
      '<div class="tierhead z3">Ⅲ 三级</div>' +
      '<div class="tierhead z4">双 双重</div>' +
      '</div>';
    host.appendChild(head);

    CFG.rows.forEach(function (rowName, ri) {
      var row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<div class="label"><div class="inner"><span class="txt">' + rowName + '</span></div></div>';
      var lane = document.createElement('div');
      lane.className = 'lane';

      lane.appendChild(zone('Ⅰ', '', [makeSlot(ri + 1, SLOT_T1, rowName)], false));

      var t1 = rowT1(ri + 1);
      if (!t1) {
        var z2e = zone('Ⅱ', '先选一级策略', [], false); z2e.classList.add('t2');
        lane.appendChild(z2e);
        lane.appendChild(zone('Ⅲ', '', [], false));
        lane.appendChild(zone('双', '', [], false));
      } else {
        var t2 = [];
        for (var i = 0; i < branchT2(t1); i++) t2.push(makeSlot(ri + 1, SLOT_T2_FIRST + i, rowName));
        var z2 = zone('Ⅱ', '', t2, false); z2.classList.add('t2');
        lane.appendChild(z2);

        var t3 = [];
        for (var j = 0; j < branchT3(t1); j++) t3.push(makeSlot(ri + 1, SLOT_T3_FIRST + j, rowName));
        var z3 = zone('Ⅲ', '', t3, false); z3.classList.add('t3');
        lane.appendChild(z3);

        var ds = [];
        for (var k = 0; k < branchDual(t1); k++) ds.push(makeSlot(ri + 1, SLOT_DUAL_FIRST + k, rowName));
        var z4 = zone('双', '', ds, false); z4.classList.add('dual');
        lane.appendChild(z4);
      }
      row.appendChild(lane);
      host.appendChild(row);
    });
    el('cnt').textContent = picks.size;
  }

  function pruneRow(row, t1) {
    Array.from(picks.entries()).forEach(function (kv) {
      var parts = kv[0].split('-').map(Number);
      var r = parts[0], s = parts[1];
      if (r !== row || s === SLOT_T1) return;
      var c = CARDS.get(kv[1]);
      if (!t1 || !c || c.element !== t1.element || c.branch !== t1.branch) picks.delete(kv[0]);
    });
  }

  function rowT1(row) {
    var found = null;
    picks.forEach(function (id, k) {
      var r = Number(k.split('-')[0]);
      var c = CARDS.get(id);
      if (!found && r === row && c && c.kind === 't1') found = c;
    });
    return found;
  }

  function paintSelection() {
    document.querySelectorAll('#rows .slot').forEach(function (node) {
      node.classList.toggle('sel', !!sel && +node.dataset.row === sel.row && +node.dataset.slot === sel.slot);
    });
  }

  function select(row, slot) {
    sel = { row: row, slot: slot };
    paintSelection();
    var id = picks.get(key(row, slot));
    var title = el('selTitle');
    var sub = el('selSub');
    var body = el('pbody');
    var btn = el('btnClear');
    btn.style.display = id ? '' : 'none';
    btn.onclick = function () {
      picks.delete(key(row, slot));
      if (slot === SLOT_T1) pruneRow(row, null);
      select(row, slot);
      recheck();
    };

    if (id) {
      var c = CARDS.get(id);
      title.textContent = c.name;
      var subTxt = c.element + '系 · ' + c.branch + ' · ' + (KIND_TXT[c.kind] || '') + '阶';
      if (c.kind === 'dual' && (c.effectElement !== c.element || c.effectBranch !== c.branch)) {
        subTxt += ' · 效果分支 ' + c.effectElement + '/' + c.effectBranch;
      }
      sub.textContent = subTxt;
      var unlock = c.unlock ? '<div class="item no"><span class="why">游戏内解锁条件：' + c.unlock +
        '<br>可能占据的触发位：' + ((c.slots || []).join(' / ') || '—') + '</span></div>' : '';
      var prereq = (c.prereq && c.prereq.length)
        ? '<div class="item no"><span class="why">游戏内前置条件（组内任一、组间都要）：' +
          c.prereq.map(function (g, i) { return '第' + (i + 1) + '组 ' + g.join(' 或 '); }).join('；') +
          '</span></div>' : '';
      body.innerHTML = '<div class="card-detail">' + iconTag(c, 'bigicon') +
        '<div class="cd-text"><div class="cd-name">' + c.name + '</div>' +
        '<div class="cd-desc">' + (c.desc || '<span class="none">这张卡还没有游戏内描述</span>') + '</div></div></div>' +
        unlock + prereq + '<div class="sec">同格替换</div>' + candidateHtml(row, slot);
      bindCandidates(row, slot);
      return;
    }

    var t1 = rowT1(row);
    title.textContent = CFG.rows[row - 1] + ' · 第 ' + slot + ' 格';
    if (slot === 1) {
      sub.textContent = '第 1 格决定这一行是哪条分支，只能放该行的一级策略';
    } else if (!t1) {
      sub.textContent = '先在 1 号格选一个一级策略 —— 它决定这一行是哪条分支';
      body.innerHTML = '<div class="sec">第 1 格还没选</div>';
      return;
    } else {
      sub.textContent = '本行分支：' + t1.element + '/' + t1.branch + '（只能放这条分支的进阶与双重策略）';
    }
    body.innerHTML = candidateHtml(row, slot);
    bindCandidates(row, slot);
  }

  function candidateHtml(row, slot) {
    var list = R.candidates(CARDS, rulesPicks(), row, slot);
    if (!list.length) return '<div class="sec">这一行没有可放的策略</div>';
    var ok = list.filter(function (x) { return x[1]; });
    var no = list.filter(function (x) { return !x[1]; });
    function line(x, good) {
      var c = x[0];
      return '<div class="item' + (good ? '' : ' no') + '" data-id="' + c.id + '" data-ok="' + (good ? 1 : 0) + '">' +
        iconTag(c, 'mini') +
        '<span class="name">' + c.name + '<span class="k" style="margin-left:6px">' + (KIND_TXT[c.kind] || '') + '</span></span>' +
        (good ? '' : '<span class="why">' + x[2] + '</span>') +
        '</div>';
    }
    return '<div class="sec">可选 ' + ok.length + '</div>' + ok.map(function (x) { return line(x, true); }).join('') +
      '<div class="sec">不可选 ' + no.length + '</div>' + no.slice(0, 60).map(function (x) { return line(x, false); }).join('');
  }

  function bindCandidates(row, slot) {
    document.querySelectorAll('#pbody .item[data-id]').forEach(function (node) {
      node.onclick = function () {
        if (node.dataset.ok !== '1') return;
        picks.set(key(row, slot), node.dataset.id);
        if (slot === SLOT_T1) pruneRow(row, CARDS.get(node.dataset.id));
        recheck();
        select(row, slot);
      };
    });
  }

  function recheck() {
    var list = rulesPicks();
    violations = R.validate(CARDS, list);
    var warns = R.warnings(CARDS, list);
    el('vio').innerHTML = violations.length
      ? violations.map(function (x) { return '<div class="v">· ' + x.message + '</div>'; }).join('')
      : '<span class="none">暂无冲突</span>';
    el('warn').innerHTML = warns.length
      ? warns.map(function (x) { return '<div class="w">· ' + x.message + '</div>'; }).join('')
      : '<span class="none">—</span>';
    renderRows();
  }

  function boot() {
    if (!window.BBEE_DATA) throw new Error('缺少 js/data.js');
    CFG = window.BBEE_DATA;
    if (!R) throw new Error('缺少 js/rules.js');
    CARDS = new Map(CFG.cards.map(function (c) { return [c.id, c]; }));

    el('ver').textContent = 'v' + CFG.appVersion + ' · 数据 ' + CFG.dataVersion;
    el('ver').title = '非官方工具；数据来自游戏内实机整理，卡名与规则以游戏内为准';
    el('btnSave').onclick = saveCurrent;
    renderBuilds();
    renderRows();
    recheck();

    var params = new URLSearchParams(location.search);
    if (params.has('demo')) {
      var find = function (n) {
        var hit = null;
        CARDS.forEach(function (c) { if (!hit && c.name === n) hit = c.id; });
        return hit;
      };
      [['1-1', '普攻寒冷'], ['1-2', '寒气爆发'], ['1-7', '冰霜爆破'], ['1-8', '强力破冰'],
       ['3-1', '冲刺冰锥'], ['3-2', '冰锥强化'], ['3-7', '随机冰锥'], ['3-9', '冰锥极寒'],
       ['5-1', '召唤冰刺']].forEach(function (pair) {
        var id = find(pair[1]);
        if (id) picks.set(pair[0], id);
      });
      recheck();
      var selParam = params.get('sel');
      if (selParam && /^\d+-\d+$/.test(selParam)) {
        var p = selParam.split('-').map(Number);
        select(p[0], p[1]);
      } else {
        select(1, 4);
      }
    }
    if (params.has('selftest')) runSelfTest();

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 离线能力可选 */ });
    }
  }

  try {
    boot();
  } catch (err) {
    if (window.console) console.error(err);
    el('rows').style.display = 'none';
    document.querySelector('.panel').style.display = 'none';
    el('boot-error').style.display = '';
  }
})();
