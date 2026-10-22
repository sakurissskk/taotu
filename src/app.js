/* 陶土词卡 · 离线学习应用 v2（本地数据，核心功能无网络请求） */
(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('DATA').textContent);
  var PACKS = DATA.packs || [];
  var BIT = { zk: 1, gk: 2, cet4: 4, cet6: 8, ky: 16, ext: 32, jing: 64, my: 128 };
  var PACK_NAME = { jing: '精讲', zk: '初中', gk: '高中', cet4: '四级', cet6: '六级', ky: '考研', ext: '拓展', my: '我的词库' };

  var WORDS = [];          /* 全部词条对象 */
  var WM = {};             /* id -> word */
  var WBY = {};            /* lower word -> word */
  var CUSTOM = [];         /* 自定义词条 */
  var PACK_IDS = {};       /* bit -> id 数组（已排序） */

  var KEY = 'taotu.vocab.v1';
  var CKEY = 'taotu.custom.v1';
  var DAY = 86400000;
  var PER_PAGE = 10;
  var TODAY_LIMIT = 20;
  var S = null;

  /* ---------------- 基础工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function md(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }
  function localDate(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('on'); }, 2200);
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function normWord(w) { return String(w || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  function validWord(w) { return /^[A-Za-z][A-Za-z'\- .]{1,31}$/.test(w); }

  /* ---------------- 词条装载 ---------------- */
  function addWord(o) {
    if (!o || !o.w) return;
    var k = normWord(o.w);
    if (WBY[k]) return;
    WORDS.push(o);
    WM[o.id] = o;
    WBY[k] = o;
  }
  function loadWords() {
    WORDS = []; WM = {}; WBY = {};
    (DATA.core || []).forEach(function (c) {
      addWord({ id: c.id, w: c.w, ipa: c.ipa, pos: c.pos, cn: c.cn, en: c.en,
        ex: c.ex, exCn: c.exCn, note: c.note, tags: c.tags || [], unit: c.unit,
        m: c.m || BIT.jing, core: true });
    });
    (DATA.bulk || []).forEach(function (b) {
      addWord({ id: 'b:' + b[0], w: b[0], ipa: b[1], cn: b[2], m: b[3], bulk: true });
    });
    CUSTOM.forEach(function (c) {
      addWord({ id: 'c:' + c[0], w: c[0], ipa: c[1], cn: c[2], m: BIT.my, custom: true });
    });
    buildIndex();
  }
  function buildIndex() {
    PACK_IDS = {};
    Object.keys(BIT).forEach(function (k) { PACK_IDS[BIT[k]] = []; });
    WORDS.forEach(function (w) {
      Object.keys(BIT).forEach(function (k) {
        if (w.m & BIT[k]) PACK_IDS[BIT[k]].push(w.id);
      });
    });
    var byW = function (a, b) { return WM[a].w.toLowerCase() < WM[b].w.toLowerCase() ? -1 : 1; };
    Object.keys(PACK_IDS).forEach(function (bit) {
      if (+bit !== BIT.jing && +bit !== BIT.my) PACK_IDS[bit].sort(byW);
    });
  }
  function idsForPack(bit) {
    if (bit === 0) return WORDS.map(function (w) { return w.id; });
    return PACK_IDS[bit] || [];
  }
  function packLabel(w) {
    var out = [];
    ['zk', 'gk', 'cet4', 'cet6', 'ky', 'ext'].forEach(function (k) {
      if (w.m & BIT[k]) out.push(PACK_NAME[k]);
    });
    if (w.custom) out.push('我的');
    return out;
  }

  /* ---------------- 存储 ---------------- */
  var BASE = {
    v: 1, fav: {}, wrong: {}, srs: {}, notes: {},
    stats: { answered: 0, correct: 0, reviews: 0, days: {}, streak: 0, lastDay: '' },
    settings: { theme: 'auto' }
  };
  function normalize(raw) {
    var o = raw && typeof raw === 'object' ? raw : {};
    var s = JSON.parse(JSON.stringify(BASE));
    ['fav', 'wrong', 'srs', 'notes'].forEach(function (k) {
      if (o[k] && typeof o[k] === 'object') s[k] = o[k];
    });
    if (o.stats && typeof o.stats === 'object') {
      ['answered', 'correct', 'reviews', 'streak'].forEach(function (k) {
        if (typeof o.stats[k] === 'number') s.stats[k] = o.stats[k];
      });
      if (o.stats.days && typeof o.stats.days === 'object') s.stats.days = o.stats.days;
      if (typeof o.stats.lastDay === 'string') s.stats.lastDay = o.stats.lastDay;
    }
    if (o.settings && o.settings.theme) s.settings.theme = o.settings.theme;
    ['fav', 'wrong', 'srs', 'notes'].forEach(function (k) {
      Object.keys(s[k]).forEach(function (id) { if (!WM[id]) delete s[k][id]; });
    });
    return s;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('存储空间不足，备份后清理'); }
  }
  function loadCustom() {
    try {
      var a = JSON.parse(localStorage.getItem(CKEY) || '[]');
      CUSTOM = Array.isArray(a) ? a.filter(function (x) { return Array.isArray(x) && x[0]; }) : [];
    } catch (e) { CUSTOM = []; }
  }
  function saveCustom() {
    try { localStorage.setItem(CKEY, JSON.stringify(CUSTOM)); }
    catch (e) { toast('自定义词库过大，请精简后再导入'); }
  }

  /* ---------------- 主题 ---------------- */
  function applyTheme() {
    var t = S.settings.theme;
    var dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1c1916' : '#f4ecdf');
    if (window.NativeBridge && NativeBridge.setDark) { try { NativeBridge.setDark(dark); } catch (e) {} }
  }

  /* ---------------- 路由 ---------------- */
  var PAGE = 'home';
  function showPage(name, push) {
    if (!name) name = 'home';
    PAGE = name;
    $all('.page').forEach(function (p) { p.classList.toggle('on', p.id === 'page-' + name); });
    $all('.tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-page') === name); });
    if (push !== false) history.pushState({ p: name }, '', '#' + name);
    window.scrollTo(0, 0);
    if (name === 'home') renderHome();
    if (name === 'library') renderLibrary();
    if (name === 'cards') renderCards();
    if (name === 'quiz') renderQuiz();
    if (name === 'me') renderMe();
  }

  /* ---------------- 首页 ---------------- */
  function dueIds() {
    var now = Date.now(), out = [];
    WORDS.forEach(function (w) {
      var r = S.srs[w.id];
      if (r && r.due && r.due <= now) out.push(w.id);
    });
    return out;
  }
  function masteredCount() {
    var n = 0;
    Object.keys(S.srs).forEach(function (id) { if (S.srs[id].iv >= 21) n++; });
    return n;
  }
  function renderHome() {
    var total = WORDS.length, due = dueIds().length, done = S.stats.days[localDate()] || 0;
    var around = Math.min(TODAY_LIMIT, Math.max(0, TODAY_LIMIT - done));
    $('#home-total').textContent = total.toLocaleString();
    $('#home-mastered').textContent = masteredCount().toLocaleString();
    $('#home-due').textContent = due.toLocaleString();
    $('#home-streak').textContent = S.stats.streak || 0;
    $('#ring-num').textContent = done;
    $('#ring-cap').textContent = '/ ' + TODAY_LIMIT + ' 张';
    var deg = Math.min(360, done / TODAY_LIMIT * 360);
    $('#ring').style.background = 'conic-gradient(var(--clay) ' + deg + 'deg, var(--line) 0)';
    $('#home-hint').textContent = done >= TODAY_LIMIT ? '今天的目标已完成，可以随意加练。' :
      '今天还可以读 ' + around + ' 张，按到期顺序开始。';
    var list = [];
    var now = Date.now();
    WORDS.forEach(function (w) {
      var r = S.srs[w.id];
      if (r && r.due && r.due <= now) list.push(w);
    });
    if (list.length < 6) {
      WORDS.forEach(function (w) { if (!S.srs[w.id] && list.length < 6) list.push(w); });
    }
    $('#home-list').innerHTML = list.slice(0, 6).map(function (w) {
      return '<a class="row-word" data-act="open" data-id="' + w.id + '"><span class="rw-main"><b>' + esc(w.w) +
        '</b><i>' + esc(w.ipa || '') + '</i></span><span class="rw-cn">' + esc((w.cn || '').split('\n')[0]) + '</span></a>';
    }).join('');
  }

  /* ---------------- 词库 ---------------- */
  var LIB = { tab: 'jing', q: '', page: 1, open: null };
  function currentIds() {
    var bit = LIB.tab === 'all' ? 0 : BIT[LIB.tab] || 0;
    var ids = idsForPack(bit);
    var q = LIB.q.trim().toLowerCase();
    if (!q) return ids;
    return ids.filter(function (id) {
      var w = WM[id];
      return (w.w + ' ' + (w.cn || '') + ' ' + (w.ex || '') + ' ' + (w.note || '')).toLowerCase().indexOf(q) >= 0;
    });
  }
  function chipsHtml(active, counts, ids, act) {
    act = act || 'libtab';
    return ids.map(function (c) {
      var n = counts[c.id] || 0;
      if (c.id === 'my' && !n) return '';
      return '<button class="chip' + (c.id === active ? ' on' : '') + '" data-act="' + act + '" data-tab="' + c.id + '">' +
        c.name + (c.id === 'all' ? '' : ' <em>' + n.toLocaleString() + '</em>') + '</button>';
    }).join('');
  }
  function renderLibrary() {
    var counts = { all: WORDS.length };
    Object.keys(BIT).forEach(function (k) { counts[k] = (PACK_IDS[BIT[k]] || []).length; });
    var tabs = [{ id: 'all', name: '全部' }, { id: 'jing', name: '精讲' }]
      .concat(PACKS.map(function (p) { return { id: p.id, name: p.name }; }))
      .concat([{ id: 'my', name: '我的词库' }]);
    $('#lib-chips').innerHTML = chipsHtml(LIB.tab, counts, tabs);
    var ids = currentIds();
    var pages = Math.max(1, Math.ceil(ids.length / PER_PAGE));
    if (LIB.page > pages) LIB.page = pages;
    if (LIB.page < 1) LIB.page = 1;
    $('#lib-count').textContent = '共 ' + ids.length.toLocaleString() + ' 条';
    var slice = ids.slice((LIB.page - 1) * PER_PAGE, LIB.page * PER_PAGE);
    $('#lib-list').innerHTML = slice.length ? slice.map(function (id) { return wordCard(WM[id]); }).join('') :
      '<p class="empty">' + (LIB.q ? '没有匹配的词条，换个关键词试试。' : '还没有词条，点右上角导入。') + '</p>';
    $('#lib-page').innerHTML = ids.length > PER_PAGE ? '<button class="pg" data-act="pg" data-to="' + (LIB.page - 1) + '"' +
      (LIB.page === 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span class="pg-info">第 ' + LIB.page + ' / ' + pages + ' 页</span>' +
      '<button class="pg" data-act="pg" data-to="' + (LIB.page + 1) + '"' + (LIB.page === pages ? ' disabled' : '') + '>下一页</button>' +
      '<label class="pg-jump">跳至<input id="pg-jump" type="number" min="1" max="' + pages + '" value="' + LIB.page + '">页</label>' : '';
    var j = $('#pg-jump');
    if (j) j.addEventListener('change', function () {
      var v = parseInt(j.value, 10);
      if (v >= 1 && v <= pages) { LIB.page = v; renderLibrary(); }
      else j.value = LIB.page;
    });
    $('#lib-search').value = LIB.q;
  }
  function wordCard(w) {
    var open = LIB.open === w.id;
    var r = S.srs[w.id];
    var status = !r ? '未学' : (r.iv >= 21 ? '已掌握' : '复习中');
    var star = S.fav[w.id] ? 'on' : '';
    return '<div class="wcard' + (open ? ' open' : '') + '" data-act="card" data-id="' + w.id + '">' +
      '<div class="wc-head"><div class="wc-title"><b>' + esc(w.w) + '</b>' +
      (w.ipa ? '<i>' + esc(w.ipa) + '</i>' : '') +
      (w.pos ? '<span class="pos">' + esc(w.pos) + '</span>' : '') + '</div>' +
      '<button class="star ' + star + '" data-act="fav" data-id="' + w.id + '" aria-label="收藏">★</button></div>' +
      '<div class="wc-cn">' + esc((w.cn || '').split('\n')[0]) + '</div>' +
      '<div class="wc-meta"><span class="lvl">' + esc(packLabel(w).join(' · ') || '精讲') + '</span><span class="st">' + status + '</span></div>' +
      (open ? '<div class="wc-body">' +
        (w.en ? '<p class="en">' + esc(w.en) + '</p>' : '') +
        ((w.cn || '').split('\n').length > 1 ? '<p class="cn-full">' + esc(w.cn).replace(/\n/g, '<br>') + '</p>' : '') +
        (w.ex ? '<p class="ex">' + esc(w.ex) + (w.exCn ? '<br><span class="excn">' + esc(w.exCn) + '</span>' : '') + '</p>' : '') +
        (w.note ? '<p class="note">' + md(w.note) + '</p>' : '') +
        '<div class="wc-foot"><button class="ghost sm" data-act="note" data-id="' + w.id + '">笔记</button>' +
        (S.notes[w.id] ? '<span class="has-note">已记笔记</span>' : '') +
        (w.custom ? '<button class="ghost sm" data-act="delword" data-id="' + w.id + '">删除</button>' : '') + '</div></div>' : '') +
      '</div>';
  }

  /* ---------------- 翻卡 ---------------- */
  var CARD = { pack: 'jing', queue: [], i: 0, flipped: false };
  function buildQueue() {
    var bit = CARD.pack === 'all' ? 0 : BIT[CARD.pack] || 0;
    var ids = idsForPack(bit), now = Date.now(), due = [], fresh = [];
    ids.forEach(function (id) {
      var r = S.srs[id];
      if (r && r.due && r.due <= now) due.push(id);
      else if (!r) fresh.push(id);
    });
    CARD.queue = due.concat(fresh).slice(0, 30);
    CARD.i = 0; CARD.flipped = false;
  }
  function renderCards() {
    var tabs = [{ id: 'all', name: '全部' }, { id: 'jing', name: '精讲' }]
      .concat(PACKS.map(function (p) { return { id: p.id, name: p.name }; }))
      .concat([{ id: 'my', name: '我的词库' }]);
    var counts = {}; Object.keys(BIT).forEach(function (k) { counts[k] = (PACK_IDS[BIT[k]] || []).length; });
    counts.all = WORDS.length;
    $('#card-chips').innerHTML = chipsHtml(CARD.pack, counts, tabs, 'cardtab');
    if (!CARD.queue.length) buildQueue();
    var w = WM[CARD.queue[CARD.i]];
    $('#card-progress').textContent = CARD.queue.length ? (CARD.i + 1) + ' / ' + CARD.queue.length : '0 / 0';
    $('#card-bar').style.width = CARD.queue.length ? ((CARD.i) / CARD.queue.length * 100) + '%' : '0';
    if (!w) {
      $('#flip').innerHTML = '<div class="face front"><p class="big">这个范围暂时没有待学词</p><p class="hint">换一个词书，或去词库收藏几个词。</p></div>';
      return;
    }
    $('#flip').classList.toggle('flipped', CARD.flipped);
    $('.face.front', $('#flip')).innerHTML = '<div class="ipa">' + esc(w.ipa || '') + '</div><div class="word">' + esc(w.w) +
      '</div><div class="hint">轻点卡片翻面 · 空格键也可以</div>';
    $('.face.back', $('#flip')).innerHTML = '<div class="word sm">' + esc(w.w) + '</div><div class="cn">' +
      esc(w.cn || '').replace(/\n/g, '<br>') + '</div>' +
      (w.ex ? '<p class="ex">' + esc(w.ex) + '<br><span class="excn">' + esc(w.exCn || '') + '</span></p>' : '') +
      (w.note ? '<p class="note">' + md(w.note) + '</p>' : '') +
      '<div class="hint">认识 / 有印象 / 不认识</div>';
    $('#card-cat').textContent = packLabel(w).join(' · ') || '精讲';
  }
  function grade(g) {
    var id = CARD.queue[CARD.i];
    if (!id) return;
    srsRate(id, g);
    S.stats.reviews = (S.stats.reviews || 0) + 1;
    bumpDay();
    save();
    CARD.i++;
    CARD.flipped = false;
    if (CARD.i >= CARD.queue.length) {
      toast('这一组完成了');
      CARD.i = 0; buildQueue();
    }
    renderCards();
  }

  /* ---------------- 间隔重复 ---------------- */
  function srsRate(id, g) {
    var now = Date.now();
    var r = S.srs[id] || { iv: 0, due: now, n: 0 };
    if (g === 'good') { r.iv = Math.min(60, Math.max(2, (r.iv || 0) * 2.2)); }
    else if (g === 'vague') { r.iv = 1; }
    else { r.iv = 0.5; }
    r.due = now + r.iv * DAY;
    r.n = (r.n || 0) + 1;
    S.srs[id] = r;
  }
  function bumpDay() {
    var today = localDate();
    if (S.stats.lastDay !== today) {
      var y = localDate(new Date(Date.now() - DAY));
      S.stats.streak = S.stats.lastDay === y ? (S.stats.streak || 0) + 1 : 1;
      S.stats.lastDay = today;
    }
    S.stats.days[today] = (S.stats.days[today] || 0) + 1;
  }

  /* ---------------- 刷题 ---------------- */
  var QZ = { pack: 'jing', qs: [], i: 0, done: 0, right: 0, answered: false, picked: -1 };
  function shuffled(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function startQuiz() {
    var bit = QZ.pack === 'all' ? 0 : BIT[QZ.pack] || 0;
    var ids = idsForPack(bit).filter(function (id) { return (WM[id].cn || '').length >= 2; });
    if (ids.length < 6) ids = idsForPack(0).filter(function (id) { return (WM[id].cn || '').length >= 2; });
    var pool = shuffled(ids).slice(0, 10);
    QZ.qs = pool.map(function (id, idx) {
      var w = WM[id];
      if (idx % 3 === 2) return { type: 'spell', id: id, w: w, answer: w.w.toLowerCase(), graded: false };
      var others = shuffled(ids.filter(function (x) { return x !== id && WM[x].cn !== w.cn; })).slice(0, 3);
      var opts = shuffled([id].concat(others));
      return { type: 'choice', id: id, w: w, opts: opts, correct: opts.indexOf(id), picked: -1 };
    });
    QZ.i = 0; QZ.done = 0; QZ.right = 0;
    renderQuiz();
  }
  function renderQuiz() {
    var tabs = [{ id: 'all', name: '全部' }, { id: 'jing', name: '精讲' }]
      .concat(PACKS.map(function (p) { return { id: p.id, name: p.name }; }))
      .concat([{ id: 'my', name: '我的词库' }]);
    var counts = {}; Object.keys(BIT).forEach(function (k) { counts[k] = (PACK_IDS[BIT[k]] || []).length; });
    counts.all = WORDS.length;
    $('#quiz-chips').innerHTML = tabs.filter(function (c) { return c.id !== 'my' || counts.my; })
      .map(function (c) { return '<button class="chip' + (c.id === QZ.pack ? ' on' : '') + '" data-act="qztab" data-tab="' + c.id + '">' + c.name + '</button>'; }).join('');
    var acc = S.stats.answered ? Math.round(S.stats.correct / S.stats.answered * 100) : null;
    $('#quiz-stat').textContent = '累计答题 ' + (S.stats.answered || 0) + ' 道 · 正确率 ' + (acc == null ? '—' : acc + '%');
    var box = $('#quiz-box');
    if (!QZ.qs.length) {
      box.innerHTML = '<button class="primary wide" data-act="qzstart">开始练习</button>';
      return;
    }
    if (QZ.i >= QZ.qs.length) {
      var rate = QZ.done ? Math.round(QZ.right / QZ.done * 100) : 0;
      box.innerHTML = '<div class="result"><p class="big">本组完成</p><p>答对 ' + QZ.right + ' / ' + QZ.done + '，正确率 ' + rate + '%。</p>' +
        '<p class="hint">错题已经进入错题本，可以在「我的」里回看。</p>' +
        '<button class="primary wide" data-act="qzstart">再来一组</button></div>';
      return;
    }
    var q = QZ.qs[QZ.i];
    var head = '<div class="q-progress"><span>第 ' + (QZ.i + 1) + ' / ' + QZ.qs.length + ' 题</span><span>' +
      (q.type === 'choice' ? '选择题 · 自动判分' : '拼写 · 自评') + '</span></div>';
    if (q.type === 'choice') {
      box.innerHTML = head + '<p class="q-stem">「' + esc(q.w.w) + '」' + (q.w.ipa ? ' <span class="ipa">' + esc(q.w.ipa) + '</span>' : '') +
        ' 的意思是？</p><div class="opts">' + q.opts.map(function (oid, idx) {
          var cls = '';
          if (q.picked >= 0) {
            if (idx === q.correct) cls = ' right';
            else if (idx === q.picked) cls = ' wrong';
          }
          return '<button class="opt' + cls + '" data-act="opt" data-idx="' + idx + '"' + (q.picked >= 0 ? ' disabled' : '') + '>' +
            '<span class="key">' + 'ABCD'[idx] + '</span><span class="txt">' + esc((WM[oid].cn || '').split('\n')[0]) + '</span></button>';
        }).join('') + '</div>' +
        (q.picked >= 0 ? '<div class="fb ' + (q.picked === q.correct ? 'ok' : 'no') + '">' +
          (q.picked === q.correct ? '回答正确。' : '正确答案是 ' + 'ABCD'[q.correct] + '。') +
          (q.w.ex ? '<p class="ex">' + esc(q.w.ex) + '<br><span class="excn">' + esc(q.w.exCn || '') + '</span></p>' : '') +
          '<button class="primary sm" data-act="next">下一题</button></div>' : '');
    } else {
      box.innerHTML = head + '<p class="q-stem">听中文写单词：<b>' + esc((q.w.cn || '').split('\n')[0]) + '</b></p>' +
        '<input id="spell" class="spell" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入英文单词">' +
        '<div class="row-btns"><button class="primary" data-act="spellok">核对</button></div>' +
        (q.shown ? '<div class="fb"><p>参考答案：<b>' + esc(q.w.w) + '</b></p><p class="hint">拼写题由你自己判断，勾选「我写对了」才记入正确率。</p>' +
          '<div class="row-btns"><button class="ghost" data-act="selfno">没写对</button><button class="primary sm" data-act="selfyes">我写对了</button></div></div>' : '');
      var sp = $('#spell');
      if (sp) sp.focus();
    }
  }
  function answerChoice(idx) {
    var q = QZ.qs[QZ.i];
    if (q.picked >= 0) return;
    q.picked = idx;
    QZ.done++; S.stats.answered = (S.stats.answered || 0) + 1;
    if (idx === q.correct) { QZ.right++; S.stats.correct = (S.stats.correct || 0) + 1; }
    else { S.wrong[q.id] = { n: (S.wrong[q.id] ? S.wrong[q.id].n : 0) + 1, t: Date.now() }; }
    bumpDay(); save(); renderQuiz();
  }

  /* ---------------- 我的 ---------------- */
  function renderMe() {
    var total = WORDS.length, mastered = masteredCount();
    var learned = Object.keys(S.srs).length;
    var acc = S.stats.answered ? Math.round(S.stats.correct / S.stats.answered * 100) : null;
    $('#me-stats').innerHTML = [
      ['词条', total.toLocaleString()], ['已学', learned.toLocaleString()], ['掌握', mastered.toLocaleString()],
      ['答题', (S.stats.answered || 0).toLocaleString()], ['正确率', acc == null ? '—' : acc + '%'],
      ['连续', (S.stats.streak || 0) + ' 天']
    ].map(function (p) { return '<div class="stat"><b>' + p[1] + '</b><span>' + p[0] + '</span></div>'; }).join('');
    $('#me-theme').innerHTML = [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(function (t) {
      return '<button class="chip' + (S.settings.theme === t[0] ? ' on' : '') + '" data-act="theme" data-theme="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    var favs = Object.keys(S.fav).filter(function (id) { return WM[id]; });
    var wrongs = Object.keys(S.wrong).filter(function (id) { return WM[id]; })
      .sort(function (a, b) { return S.wrong[b].t - S.wrong[a].t; });
    $('#me-fav').innerHTML = favs.length ? favs.slice(0, 8).map(function (id) {
      return '<a class="mini-row" data-act="open" data-id="' + id + '"><b>' + esc(WM[id].w) + '</b><span>' + esc((WM[id].cn || '').split('\n')[0]) + '</span></a>';
    }).join('') : '<p class="empty">还没有收藏。词库和翻卡页点星标即可收藏。</p>';
    $('#me-wrong').innerHTML = wrongs.length ? wrongs.slice(0, 8).map(function (id) {
      return '<a class="mini-row" data-act="open" data-id="' + id + '"><b>' + esc(WM[id].w) + '</b><span>错 ' + S.wrong[id].n + ' 次</span></a>';
    }).join('') : '<p class="empty">暂无错题，去刷题页练一组。</p>';
    $('#me-custom').innerHTML = CUSTOM.length ?
      '自定义词库：<b>' + CUSTOM.length + '</b> 条（保存在本机）<div class="row-btns"><button class="ghost sm" data-act="expcustom">导出词库</button>' +
      '<button class="ghost sm" data-act="clrcustom">清空词库</button></div>' :
      '还没有导入自己的词表。<div class="row-btns"><button class="ghost sm" data-act="importhint">怎么导入？</button></div>';
    $('#me-version').textContent = 'v' + (DATA.meta.version || '1.1.0');
    $('#me-author').textContent = DATA.meta.author || '待署名';
    var mail = $('#me-mail');
    if (mail) { mail.textContent = DATA.meta.contact || ''; mail.href = 'mailto:' + (DATA.meta.contact || ''); }
  }

  /* ---------------- 笔记 ---------------- */
  function editNote(id) {
    var w = WM[id]; if (!w) return;
    var v = window.prompt('为「' + w.w + '」写一条笔记（留空可删除）：', S.notes[id] || '');
    if (v === null) return;
    v = v.trim();
    if (v) S.notes[id] = v; else delete S.notes[id];
    save(); renderLibrary();
  }

  /* ---------------- 导入词库 ---------------- */
  var IMP = { mode: 'file', fileText: '', fileLabel: '' };
  function openImport() {
    $('#impSheet').classList.add('on');
    $('#impResult').textContent = '';
    $('#impUrl').value = '';
    $('#impText').value = '';
    IMP.fileText = ''; IMP.fileLabel = '';
    setImpMode('file');
  }
  function setImpMode(m) {
    IMP.mode = m;
    $all('.imp-body').forEach(function (b) { b.hidden = b.getAttribute('data-imp') !== m; });
    $all('[data-act="imptab"]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === m); });
  }
  function parseImport(text) {
    var out = [], skipped = 0, bad = [];
    text = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!text) return { out: out, skipped: skipped, bad: ['内容为空'] };
    if (text[0] === '[' || text[0] === '{') {
      var arr = null;
      try { arr = JSON.parse(text); } catch (e) { bad.push('JSON 解析失败：' + e.message); }
      if (arr && !Array.isArray(arr)) arr = arr.words || arr.list || null;
      if (Array.isArray(arr)) {
        arr.forEach(function (o, i) {
          if (i >= 5000) return;
          if (typeof o === 'string') o = { word: o };
          var w = String(o.word || o.w || o.term || '').trim();
          var p = String(o.phonetic || o.ipa || o.p || '').trim();
          var t = String(o.translation || o.cn || o.mean || o.t || '').trim();
          if (!w || !validWord(w)) { skipped++; return; }
          if (!t) { skipped++; return; }
          out.push([w, p, t]);
        });
        return { out: out, skipped: skipped, bad: bad };
      }
    }
    text.split(/\r?\n/).forEach(function (line, i) {
      if (i > 8000) return;
      line = line.replace(/\s+$/, '');
      if (!line || /^[#\/]/.test(line)) return;
      var m = line.split('\t');
      if (m.length >= 2) {
        var w0 = m[0].trim(), p0 = '', t0 = m.slice(1).join(' ').trim();
        if (validWord(w0) && t0) out.push([w0, p0, t0]); else skipped++;
        return;
      }
      m = line.split(/[,，;；]/);
      if (m.length >= 2) {
        var w1 = m[0].trim(), p1 = /^\/.+\/$/.test(m[1].trim()) ? m[1].trim() : '', t1 = m.slice(p1 ? 2 : 1).join('，').trim();
        if (validWord(w1) && t1) out.push([w1, p1, t1]); else skipped++;
        return;
      }
      var mm = line.match(/^([A-Za-z][A-Za-z'\- ]{0,31}?)[\s:：]+(.+)$/);
      if (mm && validWord(mm[1].trim())) {
        var rest = mm[2].trim(), ph = '';
        var pm = rest.match(/^\/([^/]{1,40})\/\s*(.*)$/);
        if (pm) { ph = '/' + pm[1] + '/'; rest = pm[2].trim(); }
        if (rest) out.push([mm[1].trim(), ph, rest]); else skipped++;
      } else skipped++;
    });
    return { out: out, skipped: skipped, bad: bad };
  }
  function mergeImport(list) {
    var added = 0, dup = 0;
    list.forEach(function (x) {
      var k = normWord(x[0]);
      if (!k || WBY[k]) { dup++; return; }
      CUSTOM.push([x[0].trim(), x[1] || '', x[2].trim()]);
      var o = { id: 'c:' + x[0].trim(), w: x[0].trim(), ipa: x[1] || '', cn: x[2].trim(), m: BIT.my, custom: true };
      addWord(o);
      added++;
    });
    if (added) { saveCustom(); buildIndex(); }
    return { added: added, dup: dup };
  }
  function doImport() {
    var text = '';
    if (IMP.mode === 'file') text = IMP.fileText;
    else if (IMP.mode === 'paste') text = $('#impText').value;
    else text = IMP.urlText || '';
    if (!text) { toast(IMP.mode === 'url' ? '先拉取链接内容' : '还没有可导入的内容'); return; }
    var r = parseImport(text);
    if (!r.out.length) { $('#impResult').textContent = '没有识别到有效词条。示例：abandon,v. 放弃'; return; }
    var res = mergeImport(r.out);
    $('#impResult').textContent = '新增 ' + res.added + ' 条；重复或无效跳过 ' + (r.skipped + res.dup) + ' 条。';
    CUSTOM.length && (renderMe(), renderLibrary());
    toast('已导入 ' + res.added + ' 条');
  }
  function fetchUrl() {
    var url = $('#impUrl').value.trim();
    if (!/^https?:\/\//i.test(url)) { toast('请输入 http(s) 链接'); return; }
    IMP.urlText = '';
    $('#impResult').textContent = '正在拉取…';
    var done = function (txt, err) {
      if (err) { $('#impResult').textContent = '拉取失败：' + err + '（可改用文件或粘贴）'; return; }
      IMP.urlText = txt;
      var r = parseImport(txt);
      $('#impResult').textContent = '已拉取，识别到 ' + r.out.length + ' 条，点「导入」。';
    };
    if (window.NativeBridge && NativeBridge.httpGet) {
      window.__urlResult = function (u, text, err) { done(text, err); };
      NativeBridge.httpGet(url);
    } else {
      fetch(url).then(function (r) { return r.text(); }).then(function (t) { done(t, null); })
        .catch(function (e) { done(null, '网络或跨域限制'); });
    }
  }

  /* ---------------- 备份 ---------------- */
  function exportAll() {
    var payload = { app: 'taotu', v: 1, exportedAt: new Date().toISOString(), state: S, custom: CUSTOM };
    var text = JSON.stringify(payload, null, 1);
    var name = 'taotu-backup-' + localDate().replace(/-/g, '') + '.json';
    if (window.NativeBridge && NativeBridge.saveBackup) {
      try { NativeBridge.saveBackup(name, text); toast('已保存到 下载/ 目录'); } catch (e) { toast('保存失败'); }
    } else {
      var blob = new Blob([text], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      toast('已导出备份文件');
    }
  }
  function applyBackup(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('文件格式不正确');
    var st = obj.state || obj;
    S = normalize(st);
    if (Array.isArray(obj.custom)) { CUSTOM = obj.custom.filter(function (x) { return Array.isArray(x) && x[0]; }); saveCustom(); }
    loadWords(); save(); applyTheme();
    showPage('me');
    toast('已恢复备份');
  }
  window.__importText = function (text) {
    try {
      var obj = JSON.parse(text);
      applyBackup(obj);
    } catch (e) { toast('导入失败：' + e.message); }
  };

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    switch (act) {
      case 'nav': showPage(el.getAttribute('data-page')); break;
      case 'open':
        if (!WM[id]) break;
        LIB.tab = 'all'; LIB.q = WM[id].w; LIB.page = 1; LIB.open = id;
        showPage('library'); break;
      case 'libtab':
        LIB.tab = el.getAttribute('data-tab'); LIB.page = 1; LIB.q = ''; LIB.open = null; renderLibrary(); break;
      case 'card':
        if (ev.target.closest('[data-act="fav"],[data-act="note"],[data-act="delword"]')) return;
        LIB.open = LIB.open === id ? null : id; renderLibrary(); break;
      case 'fav':
        ev.stopPropagation();
        if (S.fav[id]) delete S.fav[id]; else S.fav[id] = 1;
        save(); renderLibrary(); break;
      case 'note': editNote(id); break;
      case 'delword':
        if (!confirm('删除词条「' + (WM[id] ? WM[id].w : '') + '」？学习记录会一并清理。')) break;
        CUSTOM = CUSTOM.filter(function (c) { return 'c:' + c[0] !== id; });
        saveCustom(); delete S.srs[id]; delete S.fav[id]; delete S.wrong[id]; delete S.notes[id];
        save(); loadWords(); renderLibrary(); renderMe(); break;
      case 'pg': LIB.page = +el.getAttribute('data-to'); renderLibrary(); break;
      case 'flip': CARD.flipped = !CARD.flipped; renderCards(); break;
      case 'grade': grade(el.getAttribute('data-g')); break;
      case 'cardtab': CARD.pack = el.getAttribute('data-tab'); buildQueue(); renderCards(); break;
      case 'qztab': QZ.pack = el.getAttribute('data-tab'); QZ.qs = []; renderQuiz(); break;
      case 'qzstart': startQuiz(); break;
      case 'opt': answerChoice(+el.getAttribute('data-idx')); break;
      case 'next': QZ.i++; renderQuiz(); break;
      case 'spellok': QZ.qs[QZ.i].shown = true; renderQuiz(); break;
      case 'selfyes': QZ.qs[QZ.i].graded = true; QZ.done++; QZ.right++; S.stats.answered++; S.stats.correct++; bumpDay(); save(); QZ.i++; renderQuiz(); break;
      case 'selfno':
        QZ.qs[QZ.i].graded = true; QZ.done++; S.stats.answered++;
        S.wrong[QZ.qs[QZ.i].id] = { n: (S.wrong[QZ.qs[QZ.i].id] ? S.wrong[QZ.qs[QZ.i].id].n : 0) + 1, t: Date.now() };
        bumpDay(); save(); QZ.i++; renderQuiz(); break;
      case 'theme': S.settings.theme = el.getAttribute('data-theme'); save(); applyTheme(); renderMe(); break;
      case 'export': exportAll(); break;
      case 'import': if (window.NativeBridge && NativeBridge.pickBackup) NativeBridge.pickBackup(); else $('#backupFile').click(); break;
      case 'reset':
        if (!confirm('清空全部学习记录？收藏、错题、笔记都会删除，自定义词库保留。')) break;
        S = normalize({}); save(); showPage('me'); toast('已清空'); break;
      case 'importhint': openImport(); break;
      case 'impopen': openImport(); break;
      case 'impclose': $('#impSheet').classList.remove('on'); break;
      case 'imptab': setImpMode(el.getAttribute('data-mode')); break;
      case 'impfile': $('#impFile').click(); break;
      case 'impurl': fetchUrl(); break;
      case 'impdo': doImport(); break;
      case 'expcustom': {
        var txt = JSON.stringify(CUSTOM.map(function (c) { return { word: c[0], phonetic: c[1], translation: c[2] }; }), null, 1);
        var name2 = 'taotu-custom-' + localDate().replace(/-/g, '') + '.json';
        if (window.NativeBridge && NativeBridge.saveBackup) { NativeBridge.saveBackup(name2, txt); toast('已保存到 下载/'); }
        else { var b2 = new Blob([txt], { type: 'application/json' }); var a2 = document.createElement('a'); a2.href = URL.createObjectURL(b2); a2.download = name2; a2.click(); }
        break;
      }
      case 'clrcustom':
        if (confirm('清空自定义词库？')) { CUSTOM = []; saveCustom(); loadWords(); renderMe(); renderLibrary(); }
        break;
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === ' ' && PAGE === 'cards' && !/INPUT|TEXTAREA/.test(ev.target.tagName)) {
      ev.preventDefault(); CARD.flipped = !CARD.flipped; renderCards();
    }
  });
  window.addEventListener('popstate', function (ev) {
    showPage((ev.state && ev.state.p) || (location.hash || '#home').slice(1), false);
  });

  /* ---------------- 初始化 ---------------- */
  function init() {
    loadCustom();
    loadWords();
    try { S = normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); }
    catch (e) { S = normalize(null); }
    S = normalize(S);
    applyTheme();
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var on = function () { if (S.settings.theme === 'auto') applyTheme(); };
      mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    }
    /* 导入相关输入 */
    $('#lib-search').addEventListener('input', function (e) { LIB.q = e.target.value; LIB.page = 1; renderLibrary(); });
    $('#impFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { IMP.fileText = String(rd.result || ''); $('#impResult').textContent = '已读取 ' + f.name + '（' + f.size + ' 字节），点「导入」。'; };
      rd.onerror = function () { $('#impResult').textContent = '读取文件失败'; };
      rd.readAsText(f);
    });
    $('#backupFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { window.__importText(String(rd.result || '')); };
      rd.readAsText(f);
    });
    $('#home-list').addEventListener('click', function () {});
    var start = (location.hash || '#home').slice(1) || 'home';
    if (['home', 'library', 'cards', 'quiz', 'me'].indexOf(start) < 0) start = 'home';
    showPage(start, false);
  }
  init();
})();
