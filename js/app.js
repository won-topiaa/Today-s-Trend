/* 오늘의 트렌드 — 앱 로직 (외부 라이브러리 없이 동작) */
(function () {
  'use strict';

  var SECTIONS = ['home', 'dictionary', 'trends', 'live', 'guide', 'quiz'];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 글자 크기 조절 ---------- */

  function initFontControl() {
    var saved = null;
    try { saved = localStorage.getItem('trend-font-size'); } catch (e) { /* 시크릿 모드 등 */ }
    if (saved === '1' || saved === '2' || saved === '3') setFontSize(saved);

    $all('.font-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setFontSize(btn.getAttribute('data-font-size'));
      });
    });
  }

  function setFontSize(size) {
    document.documentElement.setAttribute('data-font', size);
    $all('.font-btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-font-size') === size));
    });
    try { localStorage.setItem('trend-font-size', size); } catch (e) { /* 저장 실패해도 동작에는 지장 없음 */ }
  }

  /* ---------- 화면 전환 (해시 라우팅) ---------- */

  function currentSection() {
    var hash = location.hash.replace('#', '');
    return SECTIONS.indexOf(hash) >= 0 ? hash : 'home';
  }

  function showSection(name) {
    SECTIONS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = (id !== name);
    });
    $all('.nav-link').forEach(function (link) {
      var active = link.getAttribute('data-section') === name;
      if (active) link.classList.add('active');
      else link.classList.remove('active');
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }

  function initRouting() {
    window.addEventListener('hashchange', function () { showSection(currentSection()); });
    showSection(currentSection());

    // 스킵 링크: 해시 라우터를 거치지 않고 본문으로 초점만 이동시킵니다.
    var skip = $('.skip-link');
    var main = document.getElementById('main');
    if (skip && main) {
      skip.addEventListener('click', function (ev) {
        ev.preventDefault();
        main.focus();
      });
    }
  }

  /* ---------- 홈: 검색 ---------- */

  function initHomeSearch() {
    var form = $('#home-search-form');
    var input = $('#home-search-input');
    if (!form || !input) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      dictState.query = input.value;
      var dictInput = $('#dict-search');
      if (dictInput) dictInput.value = input.value;
      renderDictionary();
      location.hash = '#dictionary';
    });
  }

  /* ---------- 홈: 오늘의 신조어 ---------- */

  function renderTodayWord() {
    var box = $('#today-word-card');
    if (!box || !window.SLANG_DATA || !SLANG_DATA.length) return;
    // 한국 시간(UTC+9) 자정에 바뀌도록 9시간을 더해 날짜를 셉니다.
    // (더하지 않으면 UTC 자정 = 한국 시간 오전 9시에 바뀝니다.)
    var days = Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000);
    var entry = SLANG_DATA[days % SLANG_DATA.length];
    box.innerHTML =
      '<p class="term">' + esc(entry.term) + '</p>' +
      '<p class="meaning">' + esc(entry.meaning) + '</p>' +
      '<div class="example">' +
        '<p class="dialog">“' + esc(entry.example_dialog) + '”</p>' +
        '<p class="explain">→ ' + esc(entry.example_explain) + '</p>' +
      '</div>' +
      '<a class="more-link" href="#dictionary">신조어 사전 전체 보기 →</a>';
  }

  /* ---------- 신조어 사전 ---------- */

  var dictState = { query: '', difficulty: '전체', category: '전체', savedOnly: false };

  /* 내 단어장 (localStorage에 저장) */

  function loadSavedTerms() {
    try {
      var raw = localStorage.getItem('trend-saved-terms');
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  var savedTerms = loadSavedTerms();

  function isSaved(term) { return savedTerms.indexOf(term) >= 0; }

  function toggleSaved(term) {
    var idx = savedTerms.indexOf(term);
    if (idx >= 0) savedTerms.splice(idx, 1);
    else savedTerms.push(term);
    try { localStorage.setItem('trend-saved-terms', JSON.stringify(savedTerms)); } catch (e) { /* 저장 실패해도 화면 동작 유지 */ }
    updateSavedCount();
  }

  function updateSavedCount() {
    var el = document.getElementById('saved-count');
    if (el) el.textContent = String(savedTerms.length);
  }

  function makeChips(containerId, values, onPick) {
    var box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = values.map(function (v) {
      return '<button type="button" class="chip" data-value="' + esc(v) + '" aria-pressed="' +
        (v === '전체' ? 'true' : 'false') + '">' + esc(v) + '</button>';
    }).join('');
    // 칩은 이 함수가 직접 만들었으므로 각 버튼에 리스너를 바로 답니다 (closest 미지원 브라우저 호환).
    $all('.chip', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        $all('.chip', box).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
        onPick(btn.getAttribute('data-value'));
      });
    });
  }

  function slangCard(e) {
    var saved = isSaved(e.term);
    return '<article class="entry-card">' +
      '<div class="entry-head">' +
        '<h2 class="entry-term">' + esc(e.term) + '</h2>' +
        '<span class="badge badge-difficulty-' + esc(e.difficulty) + '">' + esc(e.difficulty) + '</span>' +
        '<span class="badge badge-category">' + esc(e.category) + '</span>' +
        '<span class="badge badge-era">' + esc(e.era) + '</span>' +
        '<button type="button" class="save-btn" data-term="' + esc(e.term) + '" aria-pressed="' + saved + '" aria-label="' + esc(e.term) + ' 단어장에 저장">' +
          (saved ? '★ 저장됨' : '☆ 저장') + '</button>' +
      '</div>' +
      '<p class="entry-meaning">' + esc(e.meaning) + '</p>' +
      (e.origin ? '<p class="entry-origin">유래: ' + esc(e.origin) + '</p>' : '') +
      '<details class="entry-example">' +
        '<summary>예시 대화 보기</summary>' +
        '<div class="entry-example-body">' +
          '<p class="dialog">“' + esc(e.example_dialog) + '”</p>' +
          '<p class="explain">→ ' + esc(e.example_explain) + '</p>' +
        '</div>' +
      '</details>' +
      '<p class="entry-tip"><strong>사용 팁</strong> · ' + esc(e.usage_tip) + '</p>' +
    '</article>';
  }

  function renderDictionary() {
    var list = $('#dict-list');
    var count = $('#dict-count');
    if (!list || !window.SLANG_DATA) return;

    var q = dictState.query.trim().toLowerCase();

    function baseFilter(e) {
      if (dictState.savedOnly && !isSaved(e.term)) return false;
      if (dictState.difficulty !== '전체' && e.difficulty !== dictState.difficulty) return false;
      if (dictState.category !== '전체' && e.category !== dictState.category) return false;
      return true;
    }

    var filtered = SLANG_DATA.filter(function (e) {
      if (!baseFilter(e)) return false;
      if (!q) return true;
      var haystack = (e.term + ' ' + e.meaning + ' ' + e.example_dialog + ' ' + (e.origin || '')).toLowerCase();
      return haystack.indexOf(q) >= 0;
    });

    // 문장 해석: 단어로 못 찾았고 검색어가 문장처럼 길면,
    // 문장 안에 포함된 신조어를 대신 찾아 보여 줍니다 (띄어쓰기 무시).
    var sentenceMode = false;
    if (q && !filtered.length && q.length >= 6) {
      var compactQ = q.replace(/\s+/g, '');
      filtered = SLANG_DATA.filter(function (e) {
        if (!baseFilter(e)) return false;
        var t = e.term.toLowerCase();
        return compactQ.indexOf(t.replace(/\s+/g, '')) >= 0 ||
          (e.reading ? compactQ.indexOf(String(e.reading).toLowerCase().replace(/\s+/g, '')) >= 0 : false);
      });
      sentenceMode = filtered.length > 0;
    }

    if (sentenceMode) {
      count.textContent = '붙여넣은 문장에서 신조어 ' + filtered.length + '개를 찾았습니다. 아래에서 뜻을 확인해 보세요.';
    } else {
      count.textContent = '전체 ' + SLANG_DATA.length + '개 중 ' + filtered.length + '개를 보고 있습니다.';
    }

    list.innerHTML = filtered.length
      ? filtered.map(slangCard).join('')
      : (dictState.savedOnly && !q
          ? '<p class="empty-note">아직 저장한 단어가 없습니다.<br>카드 오른쪽의 "☆ 저장" 버튼을 누르면 여기에 모입니다.</p>'
          : '<p class="empty-note">검색 결과가 없습니다.<br>다른 말로 검색해 보시거나, 필터를 "전체"로 바꿔 보세요.<br><small>문장을 붙여넣으면 그 안의 신조어를 찾아 드립니다. 여기 없는 말은 젊은 사람에게 직접 물어보시는 것도 좋은 대화 시작이 됩니다.</small></p>');

    // 저장 버튼 (카드를 다시 그릴 때마다 새로 연결)
    $all('.save-btn', list).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var term = btn.getAttribute('data-term');
        toggleSaved(term);
        renderDictionary();
        // 다시 그린 뒤에도 키보드 초점을 같은 버튼에 유지합니다.
        $all('.save-btn', list).forEach(function (b) {
          if (b.getAttribute('data-term') === term) b.focus();
        });
      });
    });
  }

  function initDictionary() {
    if (!window.SLANG_DATA) return;

    // 데이터 개편으로 사전에서 빠진 단어는 단어장에서도 정리합니다.
    var existing = {};
    SLANG_DATA.forEach(function (e) { existing[e.term] = true; });
    var pruned = savedTerms.filter(function (t) { return existing[t]; });
    if (pruned.length !== savedTerms.length) {
      savedTerms = pruned;
      try { localStorage.setItem('trend-saved-terms', JSON.stringify(savedTerms)); } catch (e) { /* 무시 */ }
    }

    var categories = ['전체'];
    SLANG_DATA.forEach(function (e) {
      if (categories.indexOf(e.category) < 0) categories.push(e.category);
    });

    makeChips('difficulty-filters', ['전체', '입문', '중급', '고급'], function (v) {
      dictState.difficulty = v; renderDictionary();
    });
    makeChips('category-filters', categories, function (v) {
      dictState.category = v; renderDictionary();
    });

    var input = $('#dict-search');
    if (input) {
      // 글자마다 카드 40장을 다시 그리면 오래된 휴대폰에서 입력이 끊깁니다.
      // 잠깐 멈춘 뒤 한 번만 그리도록 모아서 처리합니다.
      var searchTimer = null;
      input.addEventListener('input', function () {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          searchTimer = null;
          dictState.query = input.value;
          renderDictionary();
        }, 150);
      });
    }

    var savedFilter = $('#saved-filter');
    if (savedFilter) {
      savedFilter.addEventListener('click', function () {
        dictState.savedOnly = !dictState.savedOnly;
        savedFilter.setAttribute('aria-pressed', String(dictState.savedOnly));
        renderDictionary();
      });
    }

    updateSavedCount();
    renderDictionary();
  }

  /* ---------- 바로 쓰는 말걸기 문장 ---------- */

  function copyText(text, btn) {
    // 원래 라벨은 첫 클릭 때 한 번만 저장합니다.
    // (연타하면 "복사됨 ✓"를 원래 라벨로 착각해 그대로 굳어 버립니다.)
    var original = btn.getAttribute('data-label');
    if (!original) {
      original = btn.textContent;
      btn.setAttribute('data-label', original);
    }
    if (btn.resetTimer) clearTimeout(btn.resetTimer);

    function done() {
      btn.textContent = '복사됨 ✓';
      btn.classList.add('copied');
      btn.resetTimer = setTimeout(function () {
        btn.textContent = original;
        btn.classList.remove('copied');
        btn.resetTimer = null;
      }, 1600);
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = '복사 실패'; }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function renderStarters(situation) {
    var box = $('#starter-list');
    if (!box || !window.STARTERS_DATA) return;
    var group = null;
    for (var i = 0; i < STARTERS_DATA.length; i++) {
      if (STARTERS_DATA[i].situation === situation) { group = STARTERS_DATA[i]; break; }
    }
    if (!group) group = STARTERS_DATA[0];

    box.innerHTML = group.lines.map(function (line) {
      return '<div class="starter-card">' +
        '<p class="starter-text">“' + esc(line.text) + '”</p>' +
        '<p class="starter-why">' + esc(line.why) + '</p>' +
        '<button type="button" class="btn btn-secondary btn-small starter-copy" data-copy="' + esc(line.text) + '">문장 복사</button>' +
      '</div>';
    }).join('');

    $all('.starter-copy', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyText(btn.getAttribute('data-copy'), btn);
      });
    });
  }

  function initStarters() {
    if (!window.STARTERS_DATA || !STARTERS_DATA.length) return;
    var names = STARTERS_DATA.map(function (g) { return g.situation; });
    var box = document.getElementById('starter-filters');
    if (!box) return;
    box.innerHTML = names.map(function (v, i) {
      return '<button type="button" class="chip" data-value="' + esc(v) + '" aria-pressed="' +
        (i === 0 ? 'true' : 'false') + '">' + esc(v) + '</button>';
    }).join('');
    $all('.chip', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        $all('.chip', box).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
        renderStarters(btn.getAttribute('data-value'));
      });
    });
    renderStarters(names[0]);
  }

  /* ---------- 요즘 유행 ---------- */

  var trendCategory = '전체';

  function trendCard(t) {
    return '<article class="entry-card trend-card">' +
      '<div class="entry-head">' +
        '<h2 class="entry-term">' + esc(t.name) + '</h2>' +
        '<span class="badge badge-category">' + esc(t.category) + '</span>' +
        '<span class="badge badge-era">' + esc(t.era) + '</span>' +
      '</div>' +
      '<p class="entry-meaning">' + esc(t.description) + '</p>' +
      '<p class="trend-why">왜 인기일까요? — ' + esc(t.why_popular) + '</p>' +
      '<p class="trend-talk"><strong><svg class="icon" aria-hidden="true"><use href="#i-chat"></use></svg> 이렇게 말 걸어 보세요</strong><br>“' + esc(t.talk_tip) + '”</p>' +
    '</article>';
  }

  function renderTrends() {
    var list = $('#trend-list');
    if (!list || !window.TRENDS_DATA) return;
    var filtered = TRENDS_DATA.filter(function (t) {
      return trendCategory === '전체' || t.category === trendCategory;
    });
    list.innerHTML = filtered.length
      ? filtered.map(trendCard).join('')
      : '<p class="empty-note">이 분야의 항목이 아직 없습니다.</p>';
  }

  function initTrends() {
    if (!window.TRENDS_DATA) return;
    var categories = ['전체'];
    TRENDS_DATA.forEach(function (t) {
      if (categories.indexOf(t.category) < 0) categories.push(t.category);
    });
    makeChips('trend-filters', categories, function (v) {
      trendCategory = v; renderTrends();
    });
    renderTrends();
  }

  /* ---------- 대화 팁 ---------- */

  function renderGuide() {
    var box = $('#guide-list');
    if (!box || !window.GUIDE_DATA) return;
    box.innerHTML = GUIDE_DATA.map(function (section, si) {
      return '<section class="guide-section" aria-labelledby="guide-sec-' + si + '">' +
        '<h2 id="guide-sec-' + si + '">' + esc(section.title) + '</h2>' +
        '<p class="guide-intro">' + esc(section.intro) + '</p>' +
        section.tips.map(function (tip) {
          return '<article class="tip-card">' +
            '<h3>' + esc(tip.tip) + '</h3>' +
            '<p class="tip-detail">' + esc(tip.detail) + '</p>' +
            (tip.do_example ? '<p class="example-box example-do"><strong>👍 이렇게</strong><br>“' + esc(tip.do_example) + '”</p>' : '') +
            (tip.dont_example ? '<p class="example-box example-dont"><strong>👎 이건 피하세요</strong><br>“' + esc(tip.dont_example) + '”</p>' : '') +
          '</article>';
        }).join('') +
      '</section>';
    }).join('');
  }

  /* ---------- 퀴즈 ---------- */

  var quizState = { index: 0, score: 0, answered: false, questions: [], savedMode: false };

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 보기로 쓰기 좋게 뜻풀이의 첫 문장만 잘라냅니다.
  function shortMeaning(m) {
    var idx = m.indexOf('다.');
    if (idx >= 0 && idx <= 90) return m.slice(0, idx + 2);
    return m.length > 80 ? m.slice(0, 80) + '…' : m;
  }

  // 저장한 단어로 4지선다 문제를 자동 생성합니다.
  // 정답은 그 단어의 뜻, 오답은 다른 신조어들의 뜻에서 무작위로 가져옵니다.
  function buildSavedQuiz() {
    var entries = SLANG_DATA.filter(function (e) { return isSaved(e.term); });
    return shuffleArray(entries).map(function (e) {
      var wrong = shuffleArray(SLANG_DATA.filter(function (x) { return x.term !== e.term; }))
        .slice(0, 3)
        .map(function (x) { return shortMeaning(x.meaning); });
      var answerIndex = Math.floor(Math.random() * 4);
      var options = wrong.slice();
      options.splice(answerIndex, 0, shortMeaning(e.meaning));
      return {
        question: "저장하신 단어입니다. '" + e.term + "'의 뜻으로 알맞은 것은 무엇일까요?",
        options: options,
        answer_index: answerIndex,
        explanation: e.meaning + (e.usage_tip ? ' — 사용 팁: ' + e.usage_tip : '')
      };
    });
  }

  var SAVED_QUIZ_MIN = 3;

  function renderQuizIntro() {
    var area = $('#quiz-area');
    if (!area || !window.QUIZ_DATA) return;
    quizState = { index: 0, score: 0, answered: false, questions: [], savedMode: false };

    var savedBlock;
    if (savedTerms.length >= SAVED_QUIZ_MIN) {
      savedBlock =
        '<div class="quiz-saved-block">' +
          '<h3>★ 내 단어장 복습 퀴즈</h3>' +
          '<p>사전에서 저장해 두신 단어 ' + savedTerms.length + '개로만 문제를 만들어 드립니다. 외웠는지 확인해 보세요.</p>' +
          '<button type="button" class="btn btn-secondary" id="quiz-start-saved">내 단어장 퀴즈 (' + savedTerms.length + '문항)</button>' +
        '</div>';
    } else {
      savedBlock =
        '<div class="quiz-saved-block">' +
          '<h3>★ 내 단어장 복습 퀴즈</h3>' +
          '<p>신조어 사전에서 단어를 ' + SAVED_QUIZ_MIN + '개 이상 저장하면, 저장한 단어로만 나만의 복습 퀴즈를 풀 수 있습니다. ' +
          '(지금 ' + savedTerms.length + '개 저장됨)</p>' +
          '<a class="more-link" href="#dictionary">신조어 사전에서 단어 저장하러 가기 →</a>' +
        '</div>';
    }

    area.innerHTML =
      '<div class="quiz-intro-card">' +
        '<h2>나의 트렌드 감각은 몇 점?</h2>' +
        '<p>신조어와 요즘 유행에 대한 문제 ' + QUIZ_DATA.length + '개가 준비되어 있습니다. ' +
        '틀려도 괜찮습니다. 문제마다 친절한 해설이 있으니, 재미로 풀어 보세요!</p>' +
        '<button type="button" class="btn" id="quiz-start">전체 퀴즈 시작하기</button>' +
        savedBlock +
      '</div>';

    $('#quiz-start').addEventListener('click', function () {
      startQuiz(QUIZ_DATA, false);
    });
    var savedBtn = $('#quiz-start-saved');
    if (savedBtn) {
      savedBtn.addEventListener('click', function () {
        startQuiz(buildSavedQuiz(), true);
      });
    }
  }

  function startQuiz(questions, savedMode) {
    quizState = { index: 0, score: 0, answered: false, questions: questions, savedMode: savedMode };
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    var area = $('#quiz-area');
    var qs = quizState.questions;
    var q = qs[quizState.index];
    quizState.answered = false;

    var progress = Math.round((quizState.index / qs.length) * 100);
    area.innerHTML =
      '<div class="quiz-question-card">' +
        '<p class="quiz-progress">' + (quizState.savedMode ? '내 단어장 퀴즈 · ' : '') + '문제 ' + (quizState.index + 1) + ' / ' + qs.length + '</p>' +
        '<div class="quiz-progress-bar" aria-hidden="true"><div class="quiz-progress-fill" style="width:' + progress + '%"></div></div>' +
        '<p class="quiz-question">' + esc(q.question) + '</p>' +
        '<div class="quiz-options">' +
          q.options.map(function (opt, i) {
            return '<button type="button" class="quiz-option" data-index="' + i + '">' +
              '<span class="opt-num">' + (i + 1) + '</span><span>' + esc(opt) + '</span></button>';
          }).join('') +
        '</div>' +
        '<div id="quiz-feedback" role="status" aria-live="polite"></div>' +
      '</div>';

    $all('.quiz-option', area).forEach(function (btn) {
      btn.addEventListener('click', function () { answerQuiz(parseInt(btn.getAttribute('data-index'), 10)); });
    });
  }

  function answerQuiz(picked) {
    if (quizState.answered) return;
    quizState.answered = true;

    var q = quizState.questions[quizState.index];
    var correct = picked === q.answer_index;
    if (correct) quizState.score += 1;

    $all('.quiz-option').forEach(function (btn, i) {
      btn.disabled = true;
      if (i === q.answer_index) btn.classList.add('correct');
      else if (i === picked) btn.classList.add('wrong');
    });

    var last = quizState.index === quizState.questions.length - 1;
    $('#quiz-feedback').innerHTML =
      '<div class="quiz-feedback ' + (correct ? 'good' : 'bad') + '">' +
        '<strong>' + (correct ? '⭕ 정답입니다!' : '❌ 아쉽네요. 정답은 ' + (q.answer_index + 1) + '번이에요.') + '</strong>' +
        '<p>' + esc(q.explanation) + '</p>' +
      '</div>' +
      '<button type="button" class="btn" id="quiz-next">' + (last ? '결과 보기' : '다음 문제') + '</button>';

    $('#quiz-next').addEventListener('click', function () {
      if (last) renderQuizResult();
      else { quizState.index += 1; renderQuizQuestion(); }
    });
    $('#quiz-next').focus();
  }

  function renderQuizResult() {
    var area = $('#quiz-area');
    var total = quizState.questions.length;
    var score = quizState.score;
    var ratio = score / total;

    var message;
    if (quizState.savedMode) {
      if (ratio >= 0.9) message = '완벽합니다! 저장하신 단어를 전부 소화하셨네요. 이제 사전에서 새 단어를 더 저장해 보세요.';
      else if (ratio >= 0.6) message = '잘하고 계십니다! 거의 다 외우셨어요. 틀린 단어만 단어장에서 다시 읽어 보시면 완성입니다.';
      else message = '복습이 조금 더 필요하네요. 괜찮습니다 — 단어장("★ 저장한 단어만 보기")에서 천천히 다시 읽고 내일 또 풀어 보세요!';
    } else if (ratio >= 0.9) message = '대단합니다! 젊은 사람들과 바로 대화해도 전혀 어색하지 않으시겠어요. 이 정도면 "인싸" 어른이십니다.';
    else if (ratio >= 0.6) message = '훌륭합니다! 웬만한 트렌드는 이미 알고 계시네요. 신조어 사전에서 조금만 더 채우면 완벽해요.';
    else if (ratio >= 0.3) message = '좋은 출발입니다! 오늘 처음 본 말이 많으셨죠? 신조어 사전을 천천히 읽어 보시면 금방 익숙해집니다.';
    else message = '괜찮습니다, 누구나 처음엔 이렇습니다. 중요한 건 알아가려는 마음이에요. 신조어 사전부터 하루 하나씩 시작해 보세요!';

    area.innerHTML =
      '<div class="quiz-result-card">' +
        '<h2>퀴즈 완료!</h2>' +
        '<p class="quiz-score">' + score + ' / ' + total + '</p>' +
        '<p class="quiz-message">' + esc(message) + '</p>' +
        '<button type="button" class="btn" id="quiz-retry">다시 풀어 보기</button> ' +
        '<button type="button" class="btn btn-secondary" id="quiz-to-dict">신조어 사전 보러 가기</button>' +
      '</div>';

    $('#quiz-retry').addEventListener('click', renderQuizIntro);
    $('#quiz-to-dict').addEventListener('click', function () { location.hash = '#dictionary'; });
  }

  /* ---------- 시작 ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    var updated = $('#site-updated');
    if (updated && window.SITE_META) updated.textContent = SITE_META.updated;

    initFontControl();
    initRouting();
    initHomeSearch();
    renderTodayWord();
    initDictionary();
    initTrends();
    renderGuide();
    initStarters();
    renderQuizIntro();

    // 퀴즈 화면에 들어올 때, 시작 전(첫 화면)이라면 저장 단어 수를 최신으로 갱신합니다.
    window.addEventListener('hashchange', function () {
      if (currentSection() === 'quiz' && document.getElementById('quiz-start')) renderQuizIntro();
    });
  });
})();
