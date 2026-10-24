/* 策略搭配规则引擎（浏览器 / Node 共用，无依赖）。
 *
 * 模型与 core/rules.py 一致：
 *   5 行 = 触发方式；一条分支同时只有一条线：一级 → 二级 → 三级 → 双重。
 *   二级/三级/双重可多张；双重有前置分组（组内任一、组间都要）与效果分支三级要求。
 *
 * 对外：
 *   BBEERules.validate(cards, picks)            -> [{code,message,cards}]
 *   BBEERules.warnings(cards, picks)            -> [{code,message,cards}]
 *   BBEERules.candidates(cards, picks,row,slot) -> [[card, ok, reason]]
 *   cards: Map<id, card>；picks: [{row,slot,cardId}]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BBEERules = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ROWS = ['普攻', '技能', '冲刺', '传承', '召唤'];
  var SLOT_T1 = 1;
  var SLOT_T2_FIRST = 2, SLOT_T2_LAST = 6;
  var SLOT_T3_FIRST = 7, SLOT_T3_LAST = 8;
  var SLOT_DUAL_FIRST = 9, SLOT_DUAL_LAST = 13;
  var TIER = { t1: 1, t2: 2, t3: 3, dual: 4 };

  function slotKind(slot) {
    if (slot === SLOT_T1) return 't1';
    if (slot >= SLOT_T2_FIRST && slot <= SLOT_T2_LAST) return 't2';
    if (slot >= SLOT_T3_FIRST && slot <= SLOT_T3_LAST) return 't3';
    if (slot >= SLOT_DUAL_FIRST && slot <= SLOT_DUAL_LAST) return 'dual';
    return null;
  }

  function bad(code, message, cards) {
    return { code: code, message: message, cards: cards ? cards.slice() : [] };
  }

  function branchKey(element, branch) {
    return element + '\u0000' + branch;
  }

  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function validate(cards, picks) {
    var out = [];
    var i, p, c;

    /* 1) 未知卡 / 行号越界 */
    for (i = 0; i < picks.length; i++) {
      p = picks[i];
      if (!cards.has(p.cardId)) out.push(bad('UNKNOWN_CARD', '未知策略：' + p.cardId, [p.cardId]));
      if (!(p.row >= 1 && p.row <= ROWS.length) || p.slot < 1) {
        out.push(bad('BAD_SLOT', '非法格子：第 ' + p.row + ' 行第 ' + p.slot + ' 格', [p.cardId]));
      }
    }

    /* 2) 双重策略只能放在卡面标注的触发位 */
    for (i = 0; i < picks.length; i++) {
      p = picks[i];
      c = cards.get(p.cardId);
      if (!c || c.kind !== 'dual' || !c.pos || !c.pos.length) continue;
      if (!(p.row >= 1 && p.row <= ROWS.length)) continue;
      if (c.pos.indexOf(ROWS[p.row - 1]) === -1) {
        out.push(bad('POS_MISMATCH',
          '「' + c.name + '」只能放在 ' + c.pos.join('/') + ' 行，当前在「' + ROWS[p.row - 1] + '」行',
          [c.id]));
      }
    }

    /* 3) 同一张卡被放到多个格子 */
    var used = new Map();
    for (i = 0; i < picks.length; i++) {
      p = picks[i];
      if (!cards.has(p.cardId)) continue;
      if (!used.has(p.cardId)) used.set(p.cardId, []);
      used.get(p.cardId).push([p.row, p.slot]);
    }
    used.forEach(function (slots, cid) {
      if (slots.length > 1) {
        var where = slots.map(function (s) { return '第' + s[0] + '行第' + s[1] + '格'; }).join('、');
        out.push(bad('CARD_DUP',
          '「' + cards.get(cid).name + '」被重复放了 ' + slots.length + ' 次（' + where + '）', [cid]));
      }
    });

    /* 4) 同一格重复占位 */
    var seen = new Map();
    for (i = 0; i < picks.length; i++) {
      p = picks[i];
      var sk = p.row + '\u0000' + p.slot;
      if (seen.has(sk)) {
        out.push(bad('SLOT_DUP', '第 ' + p.row + ' 行第 ' + p.slot + ' 格被重复占用', [p.cardId]));
      }
      seen.set(sk, p.cardId);
    }

    /* 5) 按 (元素,分支) 归组 */
    var lines = new Map();
    for (i = 0; i < picks.length; i++) {
      p = picks[i];
      c = cards.get(p.cardId);
      if (!c) continue;
      var lk = branchKey(c.element, c.branch);
      if (!lines.has(lk)) {
        lines.set(lk, { element: c.element, branch: c.branch, kinds: new Map() });
      }
      var kinds = lines.get(lk).kinds;
      if (!kinds.has(c.kind)) kinds.set(c.kind, []);
      kinds.get(c.kind).push(c);
    }

    var present = new Set();
    for (i = 0; i < picks.length; i++) {
      c = cards.get(picks[i].cardId);
      if (c) present.add(c.name);
    }
    var t3Branches = new Set();
    for (i = 0; i < picks.length; i++) {
      c = cards.get(picks[i].cardId);
      if (c && c.kind === 't3') {
        t3Branches.add(branchKey(c.effectElement || c.element, c.effectBranch || c.branch));
      }
    }

    lines.forEach(function (line) {
      var kinds = line.kinds;
      var t1s = kinds.get('t1') || [];
      if (t1s.length > 1) {
        out.push(bad('BRANCH_T1_DUP',
          '「' + line.branch + '」只能选一个触发方式，当前选了 ' + t1s.map(function (x) { return x.name; }).join('、'),
          t1s.map(function (x) { return x.id; })));
      }
      if ((kinds.get('t3') || []).length && !(kinds.get('t2') || []).length) {
        out.push(bad('MISSING_T2',
          '「' + line.branch + '」的三级策略需要先有该分支的二级策略',
          (kinds.get('t3') || []).map(function (x) { return x.id; })));
      }
    });

    lines.forEach(function (line) {
      var kinds = line.kinds;
      if ((kinds.get('t2') || []).length && !(kinds.get('t1') || []).length) {
        out.push(bad('MISSING_T1',
          '「' + line.branch + '」的二级策略需要先有该分支的一级策略',
          (kinds.get('t2') || []).map(function (x) { return x.id; })));
      }
    });

    lines.forEach(function (line) {
      var duals = line.kinds.get('dual') || [];
      duals.forEach(function (du) {
        var groups = du.prereq || [];
        for (var gi = 0; gi < groups.length; gi++) {
          var group = groups[gi] || [];
          if (!group.length) continue;
          var hit = group.some(function (n) { return present.has(n); });
          if (!hit) {
            var label = groups.map(function (g, idx) {
              return '第' + (idx + 1) + '组（' + g.join('/') + '）';
            }).join('；');
            out.push(bad('DUAL_PREREQ',
              '「' + du.name + '」的前置需要：' + label + '——组内任一、组间都要；第' + (gi + 1) + '组一张都没有',
              [du.id]));
          }
        }
        var effEl = du.effectElement || line.element;
        var effBr = du.effectBranch || line.branch;
        if (du.needT3 && !t3Branches.has(branchKey(effEl, effBr))) {
          out.push(bad('DUAL_NEED_T3',
            '「' + du.name + '」需要「' + effEl + '/' + effBr + '」的三级策略在场', [du.id]));
        }
      });
    });

    /* 6) 一行只能有一条分支：一级必须在第 1 格，其余格必须是该分支 */
    var byRow = new Map();
    for (i = 0; i < picks.length; i++) {
      p = picks[i];
      if (!cards.has(p.cardId)) continue;
      if (!byRow.has(p.row)) byRow.set(p.row, []);
      byRow.get(p.row).push(p);
    }
    byRow.forEach(function (ps, row) {
      var t1p = ps.filter(function (x) { return cards.get(x.cardId).kind === 't1'; });
      t1p.forEach(function (x) {
        if (x.slot !== 1) {
          out.push(bad('T1_NOT_FIRST',
            '「' + cards.get(x.cardId).name + '」是一级策略，只能放在该行第 1 格（第 1 格决定这一行是哪条分支）',
            [x.cardId]));
        }
      });
      if (t1p.length) {
        var owner = cards.get(t1p[0].cardId);
        ps.forEach(function (x) {
          var cc = cards.get(x.cardId);
          if (cc.kind !== 't1' && (cc.element !== owner.element || cc.branch !== owner.branch)) {
            out.push(bad('ROW_BRANCH_MIX',
              '「' + cc.name + '」不属于「' + owner.name + '」这条分支（' + owner.element + '/' + owner.branch + '）',
              [cc.id]));
          }
        });
      }
    });

    /* 7) 一条线的卡必须落在该分支一级策略所在的行 */
    for (i = 0; i < picks.length; i++) {
      p = picks[i];
      c = cards.get(p.cardId);
      if (!c) continue;
      if (!(p.row >= 1 && p.row <= ROWS.length)) continue;
      if (c.kind === 't1') {
        if (c.trigger && ROWS[p.row - 1] !== c.trigger) {
          out.push(bad('ROW_MISMATCH',
            '「' + c.name + '」属于「' + c.trigger + '」行，不能放在「' + ROWS[p.row - 1] + '」行',
            [c.id]));
        }
        continue;
      }
      var line = lines.get(branchKey(c.element, c.branch));
      var own = line ? (line.kinds.get('t1') || []) : [];
      if (own.length && own[0].trigger && ROWS[p.row - 1] !== own[0].trigger) {
        out.push(bad('ROW_MISMATCH',
          '「' + c.name + '」应跟随「' + own[0].name + '」放在「' + own[0].trigger + '」行',
          [c.id]));
      }
    }

    return out;
  }

  function warnings(cards, picks) {
    var out = [];
    for (var i = 0; i < picks.length; i++) {
      var p = picks[i];
      var c = cards.get(p.cardId);
      if (!c || c.kind !== 'dual' || !c.pos || !c.pos.length) continue;
      if (!(p.row >= 1 && p.row <= ROWS.length)) continue;
      if (c.pos.indexOf(ROWS[p.row - 1]) === -1) {
        out.push(bad('POS_WARN',
          '「' + c.name + '」游戏内可能占据的触发位是 ' + c.pos.join('/') +
          '，当前放在「' + ROWS[p.row - 1] + '」行（同时会阻断）',
          [c.id]));
      }
    }
    return out;
  }

  function candidates(cards, picks, row, slot) {
    var base = picks.filter(function (p) { return !(p.row === row && p.slot === slot); });
    var rowName = ROWS[row - 1];
    var ownT1 = null;
    for (var i = 0; i < base.length; i++) {
      var c0 = cards.get(base[i].cardId);
      if (base[i].row === row && c0 && c0.kind === 't1') { ownT1 = c0; break; }
    }
    var kind = slotKind(slot);
    if (!kind) return [];
    var taken = new Set(base.map(function (p) { return p.cardId; }));
    var out = [];
    cards.forEach(function (c) {
      if (taken.has(c.id)) return;
      if (kind === 't1') {
        if (c.kind !== 't1') return;
        if (c.trigger && c.trigger !== rowName) return;
      } else {
        if (!ownT1 || c.element !== ownT1.element || c.branch !== ownT1.branch) return;
        if (c.kind !== kind) return;
      }
      var trial = base.concat([{ row: row, slot: slot, cardId: c.id }]);
      var bads = validate(cards, trial);
      var ok = bads.length === 0;
      out.push([c, ok, ok ? '' : bads[0].message]);
    });
    out.sort(function (a, b) {
      var x = a[0], y = b[0];
      return (x.tier - y.tier) ||
        cmpStr(x.element, y.element) ||
        cmpStr(x.branch, y.branch) ||
        cmpStr(x.name, y.name);
    });
    return out;
  }

  return {
    ROWS: ROWS,
    TIER: TIER,
    SLOT_T1: SLOT_T1,
    SLOT_T2_FIRST: SLOT_T2_FIRST, SLOT_T2_LAST: SLOT_T2_LAST,
    SLOT_T3_FIRST: SLOT_T3_FIRST, SLOT_T3_LAST: SLOT_T3_LAST,
    SLOT_DUAL_FIRST: SLOT_DUAL_FIRST, SLOT_DUAL_LAST: SLOT_DUAL_LAST,
    slotKind: slotKind,
    validate: validate,
    warnings: warnings,
    candidates: candidates
  };
});
