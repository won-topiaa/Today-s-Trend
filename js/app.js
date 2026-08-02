/* 오늘의 트렌드 — 앱 로직 (외부 라이브러리 없이 동작) */
(function () {
  'use strict';

  var SECTIONS = ['home', 'dictionary', 'trends', 'guide', 'quiz'];

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
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }

  function initRouting() {
    window.addEventListener('hashchange', function () { showSection(currentSection()); });
    showSection(currentSection());
  }

  /* ---------- 홈: 오늘의 신조어 ---------- */

  function renderTodayWord() {
    var box = $('#today-word-card');
    if (!box || !window.SLANG_DATA || !SLANG_DATA.length) return;
    var days = Math.floor(Date.now() / 86400000);
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

  var dictState = { query: '', difficulty: '전체', category: '전체' };

  function makeChips(containerId, values, onPick) {
    var box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = values.map(function (v) {
      return '<button type="button" class="chip" data-value="' + esc(v) + '" aria-pressed="' +
        (v === '전체' ? 'true' : 'false') + '">' + esc(v) + '</button>';
    }).join('');
    box.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.chip');
      if (!btn) return;
      $all('.chip', box).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
      btn.setAttribute('aria-pressed', 'true');
      onPick(btn.getAttribute('data-value'));
    });
  }

  function slangCard(e) {
    return '<article class="entry-card">' +
      '<div class="entry-head">' +
        '<h2 class="entry-term">' + esc(e.term) + '</h2>' +
        '<span class="badge badge-difficulty-' + esc(e.difficulty) + '">' + esc(e.difficulty) + '</span>' +
        '<span class="badge badge-category">' + esc(e.category) + '</span>' +
        '<span class="badge badge-era">' + esc(e.era) + '</span>' +
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
    var filtered = SLANG_DATA.filter(function (e) {
      if (dictState.difficulty !== '전체' && e.difficulty !== dictState.difficulty) return false;
      if (dictState.category !== '전체' && e.category !== dictState.category) return false;
      if (!q) return true;
      var haystack = (e.term + ' ' + e.meaning + ' ' + e.example_dialog + ' ' + (e.origin || '')).toLowerCase();
      return haystack.indexOf(q) >= 0;
    });

    count.textContent = '전체 ' + SLANG_DATA.length + '개 중 ' + filtered.length + '개를 보고 있습니다.';
    list.innerHTML = filtered.length
      ? filtered.map(slangCard).join('')
      : '<p class="empty-note">검색 결과가 없습니다.<br>다른 말로 검색해 보시거나, 필터를 "전체"로 바꿔 보세요.</p>';
  }

  function initDictionary() {
    if (!window.SLANG_DATA) return;

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
      input.addEventListener('input', function () {
        dictState.query = input.value;
        renderDictionary();
      });
    }
    renderDictionary();
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
      '<p class="trend-talk"><strong>💬 이렇게 말 걸어 보세요</strong><br>“' + esc(t.talk_tip) + '”</p>' +
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

  var quizState = { index: 0, score: 0, answered: false };

  function renderQuizIntro() {
    var area = $('#quiz-area');
    if (!area || !window.QUIZ_DATA) return;
    quizState = { index: 0, score: 0, answered: false };
    area.innerHTML =
      '<div class="quiz-intro-card">' +
        '<h2>나의 트렌드 감각은 몇 점?</h2>' +
        '<p>신조어와 요즘 유행에 대한 문제 ' + QUIZ_DATA.length + '개가 준비되어 있습니다. ' +
        '틀려도 괜찮습니다. 문제마다 친절한 해설이 있으니, 재미로 풀어 보세요!</p>' +
        '<button type="button" class="btn" id="quiz-start">퀴즈 시작하기</button>' +
      '</div>';
    $('#quiz-start').addEventListener('click', renderQuizQuestion);
  }

  function renderQuizQuestion() {
    var area = $('#quiz-area');
    var q = QUIZ_DATA[quizState.index];
    quizState.answered = false;

    var progress = Math.round((quizState.index / QUIZ_DATA.length) * 100);
    area.innerHTML =
      '<div class="quiz-question-card">' +
        '<p class="quiz-progress">문제 ' + (quizState.index + 1) + ' / ' + QUIZ_DATA.length + '</p>' +
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

    var q = QUIZ_DATA[quizState.index];
    var correct = picked === q.answer_index;
    if (correct) quizState.score += 1;

    $all('.quiz-option').forEach(function (btn, i) {
      btn.disabled = true;
      if (i === q.answer_index) btn.classList.add('correct');
      else if (i === picked) btn.classList.add('wrong');
    });

    var last = quizState.index === QUIZ_DATA.length - 1;
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
    var total = QUIZ_DATA.length;
    var score = quizState.score;
    var ratio = score / total;

    var message;
    if (ratio >= 0.9) message = '대단합니다! 젊은 사람들과 바로 대화해도 전혀 어색하지 않으시겠어요. 이 정도면 "인싸" 어른이십니다.';
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
    renderTodayWord();
    initDictionary();
    initTrends();
    renderGuide();
    renderQuizIntro();
  });
})();
