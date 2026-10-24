/* 陶土词卡 · 离线学习应用 v1.2（本地数据，核心功能无网络请求） */
(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('DATA').textContent);
  var PACKS = DATA.packs || [];
  var BIT = { zk: 1, gk: 2, cet4: 4, cet6: 8, ky: 16, ext: 32, jing: 64, my: 128 };
  var PACK_NAME = { jing: '精讲', zk: '初中', gk: '高中', cet4: '四级', cet6: '六级', ky: '考研', ext: '拓展', my: '我的词库' };
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  var CARD_SIZE = 15;

  var WORDS = [];
  var WM = {};
  var WBY = {};
  var CUSTOM = [];
  var PACK_IDS = {};

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
  function shuffled(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /* ---------------- 顶栏：问候 / 时间 / 电量 ---------------- */
  function greetingText() {
    var h = new Date().getHours();
    if (h < 5) return '夜深了';
    if (h < 8) return '早上好';
    if (h < 11) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    if (h < 23) return '晚上好';
    return '夜深了';
  }
  function updateGreeting() {
    var el = document.getElementById('greeting');
    if (el) el.textContent = greetingText();
  }
  function updateClock() {
    var d = new Date();
    var el = document.getElementById('clock');
    if (el) el.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function setBattery(pct, charging) {
    var el = document.getElementById('batt');
    if (!el) return;
    if (pct == null || isNaN(pct) || pct < 0) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = (charging ? '<span class="bolt">⚡</span>' : '') + Math.round(pct) + '%';
    el.classList.toggle('low', pct <= 20);
  }
  function initStatus() {
    updateClock();
    updateGreeting();
    setInterval(function () { updateClock(); updateGreeting(); }, 20000);
    if (window.NativeBridge && NativeBridge.getBattery) {
      var read = function () {
        try { var p = NativeBridge.getBattery(); setBattery(p < 0 ? null : p); } catch (e) { setBattery(null); }
      };
      read();
      setInterval(read, 60000);
      return;
    }
    if (navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        var sync = function () { setBattery(Math.round(b.level * 100), b.charging); };
        sync();
        b.addEventListener('levelchange', sync);
        b.addEventListener('chargingchange', sync);
      }).catch(function () { setBattery(null); });
    } else {
      setBattery(null);
    }
  }

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
  function favIds() { return Object.keys(S.fav).filter(function (id) { return WM[id]; }); }
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
    v: 1, fav: {}, wrong: {}, wrongfav: {}, srs: {}, notes: {},
    stats: { answered: 0, correct: 0, reviews: 0, days: {}, streak: 0, lastDay: '' },
    settings: { theme: 'auto' }
  };
  function normalize(raw) {
    var o = raw && typeof raw === 'object' ? raw : {};
    var s = JSON.parse(JSON.stringify(BASE));
    ['fav', 'wrong', 'srs', 'notes', 'wrongfav'].forEach(function (k) {
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
    ['fav', 'wrong', 'srs', 'notes', 'wrongfav'].forEach(function (k) {
      Object.keys(s[k]).forEach(function (id) { if (!WM[id]) delete s[k][id]; });
    });
    Object.keys(s.wrong).forEach(function (id) {
      var r = s.wrong[id];
      if (typeof r === 'number') s.wrong[id] = { n: r, t: Date.now(), fixed: false };
      else if (r && typeof r === 'object' && r.fixed == null) r.fixed = false;
    });
    return s;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('存储空间不足，请先导出备份'); }
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
    $all('nav.tab button').forEach(function (b) {
      var on = b.getAttribute('data-page') === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
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
    updateGreeting();
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
  var LIB = { tab: 'jing', q: '', page: 1, open: null, letter: 'all' };
  function currentIds() {
    var bit = LIB.tab === 'all' ? 0 : BIT[LIB.tab] || 0;
    var ids = idsForPack(bit);
    var q = LIB.q.trim().toLowerCase();
    if (q) {
      ids = ids.filter(function (id) {
        var w = WM[id];
        return (w.w + ' ' + (w.cn || '') + ' ' + (w.ex || '') + ' ' + (w.note || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    if (LIB.letter !== 'all') {
      var L = LIB.letter;
      ids = ids.filter(function (id) { return (WM[id].w.charAt(0) || '').toUpperCase() === L; });
    }
    return ids;
  }
  function chipsHtml(active, counts, tabs, act) {
    act = act || 'libtab';
    return tabs.map(function (c) {
      var n = counts[c.id] || 0;
      if ((c.id === 'my' || c.id === 'fav') && !n) return '';
      return '<button class="chip' + (c.id === active ? ' on' : '') + '" data-act="' + act + '" data-tab="' + c.id + '">' +
        c.name + (c.id === 'all' ? '' : ' <em>' + n.toLocaleString() + '</em>') + '</button>';
    }).join('');
  }
  function lettersHtml(active) {
    var out = '<button class="letter' + (active === 'all' ? ' on' : '') + '" data-act="libletter" data-l="all">全部</button>';
    LETTERS.forEach(function (L) {
      out += '<button class="letter' + (active === L ? ' on' : '') + '" data-act="libletter" data-l="' + L + '">' + L + '</button>';
    });
    return out;
  }
  function renderLibrary() {
    var counts = { all: WORDS.length, fav: favIds().length };
    Object.keys(BIT).forEach(function (k) { counts[k] = (PACK_IDS[BIT[k]] || []).length; });
    var tabs = [{ id: 'all', name: '全部' }, { id: 'jing', name: '精讲' }]
      .concat(PACKS.map(function (p) { return { id: p.id, name: p.name }; }))
      .concat([{ id: 'my', name: '我的词库' }]);
    $('#lib-chips').innerHTML = chipsHtml(LIB.tab, counts, tabs);
    $('#lib-letters').innerHTML = lettersHtml(LIB.letter);
    var ids = currentIds();
    var pages = Math.max(1, Math.ceil(ids.length / PER_PAGE));
    if (LIB.page > pages) LIB.page = pages;
    if (LIB.page < 1) LIB.page = 1;
    $('#lib-count').textContent = '共 ' + ids.length.toLocaleString() + ' 条';
    var slice = ids.slice((LIB.page - 1) * PER_PAGE, LIB.page * PER_PAGE);
    $('#lib-list').innerHTML = slice.length ? slice.map(function (id) { return wordCard(WM[id]); }).join('') :
      '<p class="empty">' + (LIB.q ? '没有匹配的词条，换个关键词试试。' : '这个分类下没有词条。') + '</p>';
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

  /* ---------------- 翻卡学习 ---------------- */
  var CARD = { pack: 'jing', queue: [], i: 0, flipped: false, done: false };

  function cardIds() {
    if (CARD.pack === 'fav') return favIds();
    var bit = CARD.pack === 'all' ? 0 : BIT[CARD.pack] || 0;
    return idsForPack(bit);
  }
  function firstLetter(w) { return (w.w.charAt(0) || '').toLowerCase(); }
  /* 洗牌后把相邻同首字母的词换开，避免连续多个同字母 */
  function scrambleNoRepeat(ids) {
    var a = shuffled(ids);
    for (var i = 1; i < a.length; i++) {
      if (firstLetter(WM[a[i]]) !== firstLetter(WM[a[i - 1]])) continue;
      for (var j = i + 1; j < a.length; j++) {
        var okPrev = firstLetter(WM[a[j]]) !== firstLetter(WM[a[i - 1]]);
        var okNext = (j + 1 >= a.length) || firstLetter(WM[a[j + 1]]) !== firstLetter(WM[a[i]]);
        if (okPrev && okNext) { var t = a[i]; a[i] = a[j]; a[j] = t; break; }
      }
    }
    return a;
  }
  function buildQueue() {
    var ids = cardIds(), now = Date.now(), due = [], fresh = [];
    ids.forEach(function (id) {
      var r = S.srs[id];
      if (r && r.due && r.due <= now) due.push(id);
      else if (!r) fresh.push(id);
    });
    var pool = due.concat(fresh);
    if (!pool.length) pool = ids.slice();   /* 全部已排期时仍可复习/翻收藏 */
    CARD.queue = scrambleNoRepeat(pool).slice(0, CARD_SIZE);
    CARD.i = 0; CARD.flipped = false; CARD.done = false;
  }
  function renderCards() {
    var counts = { all: WORDS.length, fav: favIds().length };
    Object.keys(BIT).forEach(function (k) { counts[k] = (PACK_IDS[BIT[k]] || []).length; });
    var tabs = [{ id: 'fav', name: '收藏本' }, { id: 'all', name: '全部' }, { id: 'jing', name: '精讲' }]
      .concat(PACKS.map(function (p) { return { id: p.id, name: p.name }; }))
      .concat([{ id: 'my', name: '我的词库' }]);
    $('#card-chips').innerHTML = chipsHtml(CARD.pack, counts, tabs, 'cardtab');
    if (!CARD.queue.length) buildQueue();
    var w = WM[CARD.queue[CARD.i]];
    $('#card-progress').textContent = CARD.queue.length ? (Math.min(CARD.i + 1, CARD.queue.length)) + ' / ' + CARD.queue.length : '0 / 0';
    $('#card-bar').style.width = CARD.queue.length ? (CARD.i / CARD.queue.length * 100) + '%' : '0';
    $('#card-rate').hidden = !CARD.queue.length || CARD.done;
    $('#card-star').hidden = !w || CARD.done;
    $('#card-star').setAttribute('data-id', w ? w.id : '');
    $('#card-star').classList.toggle('on', !!(w && S.fav[w.id]));
    if (!CARD.queue.length) {
      $('#flip').innerHTML = '<div class="face front"><p class="big">收藏本还是空的</p><p class="hint">在万词词库或错题本里点 ★，就会出现在这里。</p></div>' +
        '<div class="face back"></div>';
      $('#card-cat').textContent = '收藏本';
      return;
    }
    if (CARD.done) {
      $('#flip').innerHTML = '<div class="face front"><p class="big">这一组 15 张完成了</p><p class="hint">休息一下，或继续下一组。</p>' +
        '<button class="primary" style="margin-top:14px" data-act="nextgroup">再来一组</button></div><div class="face back"></div>';
      $('#card-cat').textContent = packLabel(w).join(' · ') || '精讲';
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
    if (!id || CARD.done) return;
    srsRate(id, g);
    S.stats.reviews = (S.stats.reviews || 0) + 1;
    bumpDay();
    save();
    CARD.i++;
    CARD.flipped = false;
    if (CARD.i >= CARD.queue.length) {
      CARD.i = CARD.queue.length - 1;
      CARD.done = true;
      toast('这组 15 张完成了');
    }
    renderCards();
  }
  function openFavSheet() {
    var ids = favIds();
    $('#favCount').textContent = ids.length + ' 个';
    $('#fav-list').innerHTML = ids.length ? ids.map(function (id) {
      var w = WM[id];
      return '<div class="fav-row"><div class="fav-word"><b>' + esc(w.w) + '</b><span>' + esc((w.cn || '').split('\n')[0]) + '</span></div>' +
        '<div class="fav-ops"><button class="ghost sm" data-act="open" data-id="' + id + '">查看</button>' +
        '<button class="ghost sm" data-act="unfav" data-id="' + id + '">取消</button></div></div>';
    }).join('') : '<p class="empty">还没有收藏词，去万词词库或错题本点 ★ 吧。</p>';
    $('#favSheet').classList.add('on');
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

  /* ---------------- 巩固拔高：练习 + 错题本 ---------------- */
  var QZ = { pack: 'jing', mode: 'practice', qs: [], i: 0, done: 0, right: 0 };
  var WQ = { active: false, finished: false, queue: [], right: 0, wrong: 0, asked: 0, picked: -1, answered: false, lastOk: false, cur: null };

  function practicePool() {
    var bit = QZ.pack === 'all' ? 0 : BIT[QZ.pack] || 0;
    var ids = idsForPack(bit).filter(function (id) { return (WM[id].cn || '').length >= 2; });
    if (ids.length < 6) ids = idsForPack(0).filter(function (id) { return (WM[id].cn || '').length >= 2; });
    return ids;
  }
  function startQuiz() {
    var ids = practicePool();
    var pool = shuffled(ids).slice(0, 10);
    QZ.qs = pool.map(function (id, idx) {
      var w = WM[id];
      if (idx % 3 === 2) return { type: 'spell', id: id, w: w, shown: false };
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
    var counts = { all: WORDS.length };
    Object.keys(BIT).forEach(function (k) { counts[k] = (PACK_IDS[BIT[k]] || []).length; });
    var acc = S.stats.answered ? Math.round(S.stats.correct / S.stats.answered * 100) : null;
    var wrongN = Object.keys(S.wrong).filter(function (id) { return WM[id]; }).length;
    $('#quiz-mode').innerHTML =
      '<button class="' + (QZ.mode === 'practice' ? 'on' : '') + '" data-act="qzmode" data-mode="practice">练习</button>' +
      '<button class="' + (QZ.mode === 'wrong' ? 'on' : '') + '" data-act="qzmode" data-mode="wrong">错题本 ' + wrongN + '</button>';
    $('#quiz-stat').textContent = '累计答题 ' + (S.stats.answered || 0) + ' 道 · 正确率 ' + (acc == null ? '—' : acc + '%');
    if (QZ.mode === 'wrong') { $('#quiz-chips').innerHTML = ''; renderWrongBook(); return; }
    $('#quiz-chips').innerHTML = chipsHtml(QZ.pack, counts, tabs, 'qztab');
    var box = $('#quiz-box');
    if (!QZ.qs.length) {
      box.innerHTML = '<button class="primary wide" data-act="qzstart">开始练习</button>' +
        '<p class="hint center" style="margin-top:10px">每轮 10 题：词义选择题自动判分，拼写题自评。</p>';
      return;
    }
    if (QZ.i >= QZ.qs.length) {
      var rate = QZ.done ? Math.round(QZ.right / QZ.done * 100) : 0;
      box.innerHTML = '<div class="result"><p class="big">本组完成</p><p>答对 ' + QZ.right + ' / ' + QZ.done + '，正确率 ' + rate + '%。</p>' +
        '<p class="hint">错题已收入「错题本」，可去重写巩固。</p>' +
        '<div class="row-btns" style="justify-content:center"><button class="primary" data-act="qzstart">再来一组</button>' +
        '<button class="ghost" data-act="qzmode" data-mode="wrong">去错题本</button></div></div>';
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
      box.innerHTML = head + '<p class="q-stem">看中文写单词：<b>' + esc((q.w.cn || '').split('\n')[0]) + '</b></p>' +
        '<input id="spell" class="spell" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入英文单词">' +
        '<div class="row-btns"><button class="primary" data-act="spellok">核对</button></div>' +
        (q.shown ? '<div class="fb"><p>参考答案：<b>' + esc(q.w.w) + '</b></p><p class="hint">拼写题为自评：确认无误再记正确。</p>' +
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
    else {
      var r = S.wrong[q.id] || { n: 0, t: Date.now(), fixed: false };
      r.n = (r.n || 0) + 1; r.t = Date.now(); r.fixed = false;
      S.wrong[q.id] = r;
    }
    bumpDay(); save(); renderQuiz();
  }
  function renderWrongBook() {
    var box = $('#quiz-box');
    var ids = Object.keys(S.wrong).filter(function (id) { return WM[id]; })
      .sort(function (a, b) {
        var fa = S.wrong[a].fixed ? 1 : 0, fb = S.wrong[b].fixed ? 1 : 0;
        return fa - fb || (S.wrong[b].t || 0) - (S.wrong[a].t || 0);
      });
    if (WQ.active) {
      if (WQ.finished) {
        box.innerHTML = '<div class="result"><p class="big">错题重写完成</p><p>答对 ' + WQ.right + ' 题，作答 ' + WQ.asked + ' 次。</p>' +
          '<p class="hint">答对的错题标记为「已订正」，仍保留在错题本里。</p>' +
          '<div class="row-btns" style="justify-content:center"><button class="primary" data-act="wrongstart">再刷一轮</button>' +
          '<button class="ghost" data-act="wrongexit">返回列表</button></div></div>';
        return;
      }
      var w = WQ.cur.w, q = WQ.cur;
      box.innerHTML = '<div class="q-progress"><span>错题重写 · 剩余 ' + WQ.queue.length + ' 题</span>' +
        '<span>已订正 ' + WQ.right + ' <button class="linkbtn" data-act="wrongexit">退出</button></span></div>' +
        '<p class="q-stem">「' + esc(w.w) + '」' + (w.ipa ? ' <span class="ipa">' + esc(w.ipa) + '</span>' : '') + ' 的意思是？</p>' +
        '<div class="opts">' + q.opts.map(function (oid, idx) {
          var cls = '';
          if (WQ.answered) {
            if (idx === q.correct) cls = ' right';
            else if (idx === WQ.picked) cls = ' wrong';
          }
          return '<button class="opt' + cls + '" data-act="wans" data-idx="' + idx + '"' + (WQ.answered ? ' disabled' : '') + '>' +
            '<span class="key">' + 'ABCD'[idx] + '</span><span class="txt">' + esc((WM[oid].cn || '').split('\n')[0]) + '</span></button>';
        }).join('') + '</div>' +
        (WQ.answered ? '<div class="fb ' + (WQ.lastOk ? 'ok' : 'no') + '">' +
          (WQ.lastOk ? '答对了，这道题标记为已订正。' : '答错，这道题会排到本轮末尾再出现。') +
          (w.note ? '<p class="ex">' + md(w.note) + '</p>' : '') +
          '<button class="primary sm" data-act="wnext">继续</button></div>' : '');
      return;
    }
    var fixed = ids.filter(function (id) { return S.wrong[id].fixed; }).length;
    box.innerHTML = '<div class="wrong-head"><p><b>错题本</b> ' + ids.length + ' 题' +
      (fixed ? ' · 已订正 ' + fixed : '') + '</p>' +
      '<button class="primary sm" data-act="wrongstart"' + (ids.length ? '' : ' disabled') + '>开始重写</button></div>' +
      '<p class="hint">答对后标记「已订正」但保留列表；答错会排到本轮末尾再出现。星标会把单词同步进收藏本。</p>' +
      (ids.length ? '<div class="wrong-list">' + ids.map(function (id) {
        var w = WM[id], r = S.wrong[id];
        return '<div class="wrong-item">' +
          '<button class="star ' + (S.wrongfav[id] ? 'on' : '') + '" data-act="wfav" data-id="' + id + '" aria-label="收藏">★</button>' +
          '<div class="wi-main" data-act="open" data-id="' + id + '"><b>' + esc(w.w) + '</b><span>' + esc((w.cn || '').split('\n')[0]) + '</span></div>' +
          '<div class="wi-meta">' + (r.fixed ? '<em class="fixed">已订正</em>' : '<em>错 ' + r.n + ' 次</em>') +
          '<button class="linkbtn" data-act="wremove" data-id="' + id + '">移出</button></div></div>';
      }).join('') + '</div>' : '<p class="empty">目前没有错题，去「练习」做一组吧。</p>');
  }
  function startWrong() {
    var ids = Object.keys(S.wrong).filter(function (id) { return WM[id]; });
    if (!ids.length) { toast('没有错题'); return; }
    WQ.active = true; WQ.finished = false;
    WQ.queue = shuffled(ids);
    WQ.right = 0; WQ.wrong = 0; WQ.asked = 0;
    loadWrongQ();
    renderQuiz();
  }
  function loadWrongQ() {
    if (!WQ.queue.length) { WQ.finished = true; WQ.cur = null; return; }
    var id = WQ.queue[0], w = WM[id];
    var pool = WORDS.filter(function (x) { return x.id !== id && (x.cn || '').length >= 2 && x.cn !== w.cn; });
    var others = shuffled(pool).slice(0, 3);
    var opts = shuffled([id].concat(others.map(function (o) { return o.id; })));
    WQ.cur = { id: id, w: w, opts: opts, correct: opts.indexOf(id) };
    WQ.picked = -1; WQ.answered = false; WQ.lastOk = false;
  }
  function answerWrong(idx) {
    if (WQ.answered || !WQ.cur) return;
    WQ.answered = true; WQ.picked = idx;
    WQ.asked++; S.stats.answered = (S.stats.answered || 0) + 1;
    var id = WQ.cur.id;
    var r = S.wrong[id] || { n: 0, t: Date.now(), fixed: false };
    WQ.lastOk = idx === WQ.cur.correct;
    if (WQ.lastOk) {
      S.stats.correct = (S.stats.correct || 0) + 1;
      WQ.right++;
      r.fixed = true; r.fixedAt = Date.now();
    } else {
      WQ.wrong++;
      r.n = (r.n || 0) + 1; r.fixed = false;
    }
    r.t = r.t || Date.now();
    S.wrong[id] = r;
    bumpDay(); save(); renderWrongBook();
  }
  function nextWrong() {
    if (!WQ.answered) { toast('先作答'); return; }
    var id = WQ.queue.shift();
    if (!WQ.lastOk) WQ.queue.push(id);
    if (!WQ.queue.length) { WQ.finished = true; WQ.cur = null; }
    else loadWrongQ();
    save(); renderWrongBook();
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
    var favs = favIds().length;
    var wrongs = Object.keys(S.wrong).filter(function (id) { return WM[id]; }).length;
    $('#me-shortcuts').innerHTML =
      '<div class="row"><div>收藏本<div class="tiny muted">' + favs + ' 个词 · 在「翻卡学习」</div></div>' +
      '<button class="ghost sm" data-act="gosheet">查看</button></div>' +
      '<div class="row"><div>错题本<div class="tiny muted">' + wrongs + ' 题 · 在「巩固拔高」</div></div>' +
      '<button class="ghost sm" data-act="gowrong">查看</button></div>';
    $('#me-custom').innerHTML = CUSTOM.length ?
      '自定义词库：<b>' + CUSTOM.length + '</b> 条（保存在本机）<div class="row-btns"><button class="ghost sm" data-act="expcustom">导出词库</button>' +
      '<button class="ghost sm" data-act="clrcustom">清空词库</button></div>' :
      '还没有导入自己的词表。<div class="row-btns"><button class="ghost sm" data-act="importhint">怎么导入？</button></div>';
    $('#me-version').textContent = 'v' + (DATA.meta.version || '1.2.0');
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
  var IMP = { mode: 'file', fileText: '' };
  function openImport() {
    $('#impSheet').classList.add('on');
    $('#impResult').textContent = '';
    $('#impUrl').value = '';
    $('#impText').value = '';
    IMP.fileText = '';
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
          if (!w || !validWord(w) || !t) { skipped++; return; }
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
        var w0 = m[0].trim(), t0 = m.slice(1).join(' ').trim();
        if (validWord(w0) && t0) out.push([w0, '', t0]); else skipped++;
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
      addWord({ id: 'c:' + x[0].trim(), w: x[0].trim(), ipa: x[1] || '', cn: x[2].trim(), m: BIT.my, custom: true });
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
    renderMe(); renderLibrary();
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
        .catch(function () { done(null, '网络或跨域限制'); });
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
    S = normalize(obj.state || obj);
    if (Array.isArray(obj.custom)) { CUSTOM = obj.custom.filter(function (x) { return Array.isArray(x) && x[0]; }); saveCustom(); }
    loadWords(); save(); applyTheme();
    showPage('me');
    toast('已恢复备份');
  }
  window.__importText = function (text) {
    try { applyBackup(JSON.parse(text)); } catch (e) { toast('导入失败：' + e.message); }
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
        LIB.tab = 'all'; LIB.q = WM[id].w; LIB.page = 1; LIB.open = id; LIB.letter = 'all';
        $('#favSheet').classList.remove('on');
        showPage('library'); break;
      case 'libtab':
        LIB.tab = el.getAttribute('data-tab'); LIB.page = 1; LIB.q = ''; LIB.open = null; LIB.letter = 'all';
        renderLibrary(); break;
      case 'libletter':
        LIB.letter = el.getAttribute('data-l'); LIB.page = 1; LIB.open = null; renderLibrary(); break;
      case 'card':
        if (ev.target.closest('[data-act="fav"],[data-act="note"],[data-act="delword"]')) return;
        LIB.open = LIB.open === id ? null : id; renderLibrary(); break;
      case 'fav':
        ev.stopPropagation();
        if (S.fav[id]) delete S.fav[id]; else S.fav[id] = 1;
        save(); renderLibrary(); break;
      case 'unfav':
        delete S.fav[id]; save(); openFavSheet(); renderCards(); break;
      case 'note': editNote(id); break;
      case 'delword':
        if (!confirm('删除词条「' + (WM[id] ? WM[id].w : '') + '」？学习记录会一并清理。')) break;
        CUSTOM = CUSTOM.filter(function (c) { return 'c:' + c[0] !== id; });
        saveCustom(); delete S.srs[id]; delete S.fav[id]; delete S.wrong[id]; delete S.notes[id];
        save(); loadWords(); renderLibrary(); renderMe(); break;
      case 'pg': LIB.page = +el.getAttribute('data-to'); renderLibrary(); break;

      /* 翻卡 */
      case 'flip': CARD.flipped = !CARD.flipped; renderCards(); break;
      case 'grade': grade(el.getAttribute('data-g')); break;
      case 'cardtab': CARD.pack = el.getAttribute('data-tab'); CARD.queue = []; CARD.done = false; buildQueue(); renderCards(); break;
      case 'nextgroup': CARD.queue = []; CARD.done = false; buildQueue(); renderCards(); break;
      case 'favcard':
        ev.stopPropagation();
        if (!id) break;
        if (S.fav[id]) delete S.fav[id]; else S.fav[id] = 1;
        save(); renderCards(); break;
      case 'favmanage': openFavSheet(); break;
      case 'favclose': $('#favSheet').classList.remove('on'); break;

      /* 练习 */
      case 'qzmode': QZ.mode = el.getAttribute('data-mode'); WQ.active = false; renderQuiz(); break;
      case 'qztab': QZ.pack = el.getAttribute('data-tab'); QZ.qs = []; renderQuiz(); break;
      case 'qzstart': startQuiz(); break;
      case 'opt': answerChoice(+el.getAttribute('data-idx')); break;
      case 'next': QZ.i++; renderQuiz(); break;
      case 'spellok': QZ.qs[QZ.i].shown = true; renderQuiz(); break;
      case 'selfyes':
        QZ.qs[QZ.i].graded = true; QZ.done++; QZ.right++; S.stats.answered++; S.stats.correct++;
        bumpDay(); save(); QZ.i++; renderQuiz(); break;
      case 'selfno':
        QZ.qs[QZ.i].graded = true; QZ.done++; S.stats.answered++;
        S.wrong[QZ.qs[QZ.i].id] = { n: ((S.wrong[QZ.qs[QZ.i].id] || {}).n || 0) + 1, t: Date.now(), fixed: false };
        bumpDay(); save(); QZ.i++; renderQuiz(); break;

      /* 错题本 */
      case 'wrongstart': startWrong(); break;
      case 'wrongexit': WQ.active = false; renderWrongBook(); break;
      case 'wans': answerWrong(+el.getAttribute('data-idx')); break;
      case 'wnext': nextWrong(); break;
      case 'wfav':
        if (S.wrongfav[id]) {
          delete S.wrongfav[id];  /* 单向同步：取消错题收藏不影响收藏本 */
        } else {
          S.wrongfav[id] = 1; S.fav[id] = 1;   /* 同步进收藏本 */
          toast('已同步到收藏本');
        }
        save(); renderWrongBook(); renderCards(); break;
      case 'wremove':
        delete S.wrong[id]; delete S.wrongfav[id]; save();
        WQ.queue = WQ.queue.filter(function (x) { return x !== id; });
        if (WQ.active && !WQ.queue.length) { WQ.finished = true; WQ.cur = null; }
        renderQuiz(); break;

      case 'theme': S.settings.theme = el.getAttribute('data-theme'); save(); applyTheme(); renderMe(); break;
      case 'export': exportAll(); break;
      case 'import': if (window.NativeBridge && NativeBridge.pickBackup) NativeBridge.pickBackup(); else $('#backupFile').click(); break;
      case 'reset':
        if (!confirm('清空全部学习记录？收藏、错题、笔记都会删除，自定义词库保留。')) break;
        S = normalize({}); save(); showPage('me'); toast('已清空'); break;
      case 'gosheet': openFavSheet(); break;
      case 'gowrong': QZ.mode = 'wrong'; WQ.active = false; showPage('quiz'); break;
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
      ev.preventDefault();
      if (!CARD.done) { CARD.flipped = !CARD.flipped; renderCards(); }
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
    initStatus();
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var on = function () { if (S.settings.theme === 'auto') applyTheme(); };
      mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    }
    $('#lib-search').addEventListener('input', function (e) {
      LIB.q = e.target.value; LIB.page = 1; LIB.letter = 'all'; LIB.open = null; renderLibrary();
    });
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
    var start = (location.hash || '#home').slice(1) || 'home';
    if (['home', 'library', 'cards', 'quiz', 'me'].indexOf(start) < 0) start = 'home';
    showPage(start, false);
  }
  init();
})();
