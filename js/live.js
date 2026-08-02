/* 지금 화제 — 실시간 트렌드 불러오기
 *
 * 두 갈래로 데이터를 가져옵니다.
 *  1) 브라우저에서 직접: 애플뮤직 차트·위키백과 조회수는 누구나 접근할 수 있는
 *     공개 API(CORS 허용)라 접속 순간의 최신 데이터를 바로 받아옵니다.
 *  2) 저장된 파일: 구글 급상승 검색어는 브라우저에서 직접 받을 수 없어,
 *     GitHub Actions가 6시간마다 수집해 둔 data/live-trends.json 을 읽습니다.
 *     직접 불러오기가 실패한 소스도 이 파일의 데이터로 대신 보여 줍니다.
 */
(function () {
  'use strict';

  var FETCH_TIMEOUT = 12000;

  var SOURCE_ORDER = ['google_trends', 'apple_music', 'wikipedia'];

  var SOURCE_INFO = {
    google_trends: {
      label: '구글 급상승 검색어',
      icon: '🔍',
      hint: '지금 한국에서 검색이 급증한 주제입니다.',
      empty: '급상승 검색어는 자동 수집(6시간마다)으로만 제공됩니다. 아직 수집 전이거나 잠시 불러올 수 없습니다.'
    },
    apple_music: {
      label: '애플뮤직 인기곡',
      icon: '🎵',
      hint: '요즘 젊은 층이 실제로 많이 듣는 노래입니다.',
      empty: '지금은 차트를 불러올 수 없습니다. 인터넷 연결을 확인한 뒤 "새로 불러오기"를 눌러 보세요.'
    },
    wikipedia: {
      label: '위키백과 많이 본 문서',
      icon: '📚',
      hint: '어제 하루 사람들이 많이 찾아본 인물·작품·사건입니다.',
      empty: '지금은 목록을 불러올 수 없습니다. 인터넷 연결을 확인한 뒤 "새로 불러오기"를 눌러 보세요.'
    }
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fetchWithTimeout(url, options) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var opts = options || {};
    if (controller) {
      opts.signal = controller.signal;
      setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    }
    return fetch(url, opts);
  }

  /* ---------- 소스별 직접 불러오기 (CORS 허용 API) ---------- */

  function fetchAppleFrom(host) {
    return fetchWithTimeout('https://' + host + '/api/v2/kr/music/most-played/10/songs.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var results = data && data.feed && data.feed.results;
        if (!results || !results.length) throw new Error('형식 오류');
        return results.slice(0, 10).map(function (s) {
          return { title: s.name, artist: s.artistName };
        });
      });
  }

  function fetchAppleDirect() {
    // 애플 신규 호스트 → 구 호스트 순으로 시도합니다.
    return fetchAppleFrom('rss.marketingtools.apple.com')
      .catch(function () { return fetchAppleFrom('rss.applemarketingtools.com'); });
  }

  var WIKI_SKIP_PREFIX = /^(대문|특수:|위키백과:|분류:|파일:|틀:|포털:|도움말:|사용자:|토론:)/;

  function wikiSkip(title) {
    return WIKI_SKIP_PREFIX.test(title) || /목록$/.test(title);
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function fetchWikipediaOn(hoursAgo) {
    // 위키미디어 통계의 하루 단위는 UTC이고 집계에 최대 하루 이상 걸리므로,
    // 넉넉히 hoursAgo 시간 전의 UTC 날짜를 요청합니다.
    var t = new Date(Date.now() - hoursAgo * 3600 * 1000);
    var url = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ko.wikipedia/all-access/'
      + t.getUTCFullYear() + '/' + pad2(t.getUTCMonth() + 1) + '/' + pad2(t.getUTCDate());
    return fetchWithTimeout(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var articles = data && data.items && data.items[0] && data.items[0].articles;
        if (!articles || !articles.length) throw new Error('형식 오류');
        var list = [];
        for (var i = 0; i < articles.length && list.length < 10; i++) {
          var title = String(articles[i].article).replace(/_/g, ' ');
          if (wikiSkip(title)) continue;
          list.push({ title: title, views: articles[i].views });
        }
        return list;
      });
  }

  function fetchWikipediaDirect() {
    // 집계가 안 끝난 날짜면 하루 더 이전으로 재시도합니다.
    return fetchWikipediaOn(36).catch(function () { return fetchWikipediaOn(60); });
  }

  /* ---------- 저장된 파일 (GitHub Actions 수집분) ---------- */

  function fetchStoredFile() {
    // 캐시를 피하기 위해 시간을 붙입니다. file:// 로 열면 실패할 수 있으며 그 경우 무시합니다.
    return fetchWithTimeout('data/live-trends.json?t=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () { return null; });
  }

  /* ---------- 화면 그리기 ---------- */

  function itemLine(sourceKey, item, rank) {
    var main, sub = '';
    if (sourceKey === 'apple_music') {
      main = item.title;
      sub = item.artist || '';
    } else if (sourceKey === 'wikipedia') {
      main = item.title;
      sub = typeof item.views === 'number' ? '조회 ' + item.views.toLocaleString('ko-KR') + '회' : '';
    } else {
      main = item.title;
      sub = item.context || (item.traffic ? '검색 ' + item.traffic : '');
    }
    return '<li class="live-item">' +
      '<span class="live-rank">' + rank + '</span>' +
      '<span class="live-item-text"><strong>' + esc(main) + '</strong>' +
      (sub ? '<small>' + esc(sub) + '</small>' : '') +
      '</span></li>';
  }

  function sourceCard(key, state) {
    var info = SOURCE_INFO[key];
    var body;
    if (state && state.items && state.items.length) {
      body = '<ol class="live-list">' +
        state.items.map(function (item, i) { return itemLine(key, item, i + 1); }).join('') +
        '</ol>' +
        '<p class="live-source-time">' + esc(state.timeNote || '') + '</p>';
    } else {
      body = '<p class="live-empty">' + esc(info.empty) + '</p>';
    }
    return '<section class="live-card" aria-labelledby="live-' + key + '">' +
      '<h2 id="live-' + key + '"><span aria-hidden="true">' + info.icon + '</span> ' + esc(info.label) + '</h2>' +
      '<p class="live-hint">' + esc(info.hint) + '</p>' +
      body +
    '</section>';
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    var mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return '방금 전 기준';
    if (mins < 60) return mins + '분 전 기준';
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + '시간 전 기준';
    var days = Math.round(hours / 24);
    return days + '일 전 기준';
  }

  function render(states, note) {
    var grid = document.getElementById('live-sources');
    var updated = document.getElementById('live-updated');
    if (!grid) return;
    grid.innerHTML = SOURCE_ORDER.map(function (key) { return sourceCard(key, states[key]); }).join('');
    if (updated) updated.textContent = note || '';
  }

  function load() {
    var grid = document.getElementById('live-sources');
    var updated = document.getElementById('live-updated');
    if (!grid) return;

    // fetch·Promise 미지원 구형 브라우저에서는 로딩 화면에 갇히지 않게 바로 안내합니다.
    if (typeof fetch !== 'function' || typeof Promise === 'undefined') {
      grid.innerHTML = '<p class="live-empty">사용 중인 브라우저가 오래되어 실시간 목록을 불러올 수 없습니다. ' +
        '다른 메뉴는 모두 정상적으로 이용하실 수 있습니다.</p>';
      if (updated) updated.textContent = '';
      return;
    }

    grid.innerHTML = '<p class="live-loading">실시간 데이터를 불러오는 중입니다…</p>';
    if (updated) updated.textContent = '';

    var direct = {
      apple_music: fetchAppleDirect().catch(function () { return null; }),
      wikipedia: fetchWikipediaDirect().catch(function () { return null; })
    };

    Promise.all([fetchStoredFile(), direct.apple_music, direct.wikipedia]).then(function (results) {
      var stored = results[0];
      var apple = results[1];
      var wiki = results[2];
      var states = {};
      var anyDirect = false;

      // 직접 불러오기 성공분 우선, 실패하면 저장 파일로 대체
      SOURCE_ORDER.forEach(function (key) {
        var directItems = key === 'apple_music' ? apple : key === 'wikipedia' ? wiki : null;
        if (directItems && directItems.length) {
          states[key] = { items: directItems, timeNote: '방금 불러온 최신 자료입니다.' };
          anyDirect = true;
          return;
        }
        var src = stored && stored.sources && stored.sources[key];
        if (src && src.items && src.items.length) {
          states[key] = { items: src.items, timeNote: '자동 수집 자료 (' + timeAgo(src.fetched) + ')' };
        } else {
          states[key] = null;
        }
      });

      var note;
      if (anyDirect) note = '일부 목록은 접속한 지금 이 순간의 최신 자료입니다.';
      else if (stored && stored.updated) note = '마지막 자동 수집: ' + timeAgo(stored.updated);
      else note = '지금은 실시간 데이터를 불러올 수 없습니다. 인터넷 연결을 확인해 주세요.';

      render(states, note);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var refresh = document.getElementById('live-refresh');
    if (refresh) refresh.addEventListener('click', load);

    // 화면을 열 때 처음 한 번 불러오고, 이후에는 새로고침 버튼으로 갱신합니다.
    var loaded = false;
    function maybeLoad() {
      if (loaded) return;
      var section = document.getElementById('live');
      if (section && !section.hidden) { loaded = true; load(); }
    }
    maybeLoad();
    window.addEventListener('hashchange', function () { setTimeout(maybeLoad, 50); });
  });
})();
