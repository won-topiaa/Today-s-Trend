/**
 * 실시간 트렌드 수집 스크립트
 *
 * GitHub Actions가 주기적으로 실행하며, 무료 공개 피드 3곳에서 데이터를 모아
 * data/live-trends.json 으로 저장합니다. API 키가 필요 없습니다.
 *
 *  1. 구글 트렌드 급상승 검색어 (KR)  — 지금 한국에서 검색이 급증한 주제
 *  2. 애플뮤직 인기곡 차트 (KR)       — 젊은 층이 실제로 많이 듣는 음악
 *  3. 한국어 위키백과 조회수 상위      — 사람들이 많이 찾아본 인물·작품·사건
 *
 * 일부 피드가 실패해도 이전 데이터를 유지하며, 전부 실패해도 기존 파일이 있으면
 * 종료 코드 0으로 끝납니다 (Actions 실패 알림 방지).
 *
 * 실행: node scripts/fetch-trends.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(ROOT, 'data/live-trends.json');
const UA = 'TodaysTrendBot/1.0 (https://github.com/won-topiaa/today-s-trend; 세대 소통 트렌드 안내 사이트)';
const TIMEOUT_MS = 20000;

async function fetchText(url, accept) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...(accept ? { Accept: accept } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}

/* ---------- 1. 구글 트렌드 급상승 검색어 ---------- */

function decodeXml(s) {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

async function fetchGoogleTrends() {
  // 비공식 피드라 예고 없이 바뀔 수 있습니다. 형식 오류가 나면 Actions 로그에서 바로 보이도록 명확히 실패시킵니다.
  const url = 'https://trends.google.com/trending/rss?geo=KR';
  const xml = await fetchText(url, 'application/rss+xml, application/xml, text/xml');

  const items = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of itemBlocks) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/);
    if (!title) continue;
    const traffic = block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
    const news = block.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/);
    items.push({
      title: decodeXml(title[1]),
      traffic: traffic ? decodeXml(traffic[1]) : null,
      context: news ? decodeXml(news[1]) : null,
    });
    if (items.length >= 10) break;
  }
  if (!items.length) throw new Error('구글 트렌드 RSS 형식이 예상과 다릅니다');
  return items;
}

/* ---------- 2. 애플뮤직 인기곡 차트 ---------- */

async function fetchAppleMusic() {
  // 애플이 신규 호스트(marketingtools.apple.com)를 운영 중이라 신주소 → 구주소 순으로 시도합니다.
  const urls = [
    'https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/10/songs.json',
    'https://rss.applemarketingtools.com/api/v2/kr/music/most-played/10/songs.json',
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const data = JSON.parse(await fetchText(url, 'application/json'));
      const results = data && data.feed && data.feed.results;
      if (!Array.isArray(results) || !results.length) throw new Error('애플뮤직 피드 형식이 예상과 다릅니다');
      return results.slice(0, 10).map((s) => ({ title: s.name, artist: s.artistName }));
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/* ---------- 3. 한국어 위키백과 많이 본 문서 ---------- */

const WIKI_SKIP_PREFIX = /^(대문|특수:|위키백과:|분류:|파일:|틀:|포털:|도움말:|사용자:|토론:)/;

function wikiSkip(title) {
  return WIKI_SKIP_PREFIX.test(title) || /목록$/.test(title);
}

function utcDayBefore(hoursAgo) {
  // 위키미디어 통계의 하루 단위는 UTC이며, 하루치 집계에 최대 24시간 이상 걸립니다.
  // 넉넉히 hoursAgo 시간 전의 UTC 날짜를 사용합니다.
  const t = new Date(Date.now() - hoursAgo * 3600 * 1000);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return { y, m, d };
}

async function fetchWikipedia() {
  // 아직 집계가 안 끝났으면 하루 더 이전 날짜로 재시도합니다.
  let lastErr = null;
  for (const hoursAgo of [36, 60]) {
    const { y, m, d } = utcDayBefore(hoursAgo);
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ko.wikipedia/all-access/${y}/${m}/${d}`;
    try {
      const data = JSON.parse(await fetchText(url, 'application/json'));
      const articles = data && data.items && data.items[0] && data.items[0].articles;
      if (!Array.isArray(articles) || !articles.length) throw new Error('위키백과 통계 형식이 예상과 다릅니다');
      return articles
        .map((a) => ({ title: a.article.replace(/_/g, ' '), views: a.views }))
        .filter((a) => !wikiSkip(a.title))
        .slice(0, 10);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/* ---------- 수집 및 저장 ---------- */

function loadPrevious() {
  try { return JSON.parse(readFileSync(OUT_FILE, 'utf8')); } catch { return null; }
}

const SOURCES = [
  { key: 'google_trends', label: '구글 급상승 검색어', hint: '지금 한국에서 검색이 급증한 주제입니다.', fetch: fetchGoogleTrends },
  { key: 'apple_music', label: '애플뮤직 인기곡', hint: '요즘 젊은 층이 실제로 많이 듣는 노래입니다.', fetch: fetchAppleMusic },
  { key: 'wikipedia', label: '위키백과 많이 본 문서', hint: '어제 하루 사람들이 많이 찾아본 인물·작품·사건입니다.', fetch: fetchWikipedia },
];

const previous = loadPrevious();
const now = new Date().toISOString();
const out = { updated: now, sources: {} };
let okCount = 0;

for (const src of SOURCES) {
  try {
    const items = await src.fetch();
    out.sources[src.key] = { label: src.label, hint: src.hint, fetched: now, items };
    okCount += 1;
    console.log(`✔ ${src.label}: ${items.length}개`);
  } catch (err) {
    console.error(`✖ ${src.label}: ${err.message}`);
    const prev = previous && previous.sources && previous.sources[src.key];
    if (prev && Array.isArray(prev.items) && prev.items.length) {
      out.sources[src.key] = prev; // 이전 데이터 유지
      console.error(`  ↳ 이전 데이터(${prev.fetched})를 유지합니다`);
    } else {
      out.sources[src.key] = { label: src.label, hint: src.hint, fetched: null, items: [] };
    }
  }
}

if (!okCount && !previous) {
  console.error('모든 피드 수집에 실패했고 이전 데이터도 없습니다.');
  process.exit(1);
}

// 아무 소스도 성공하지 못했으면 전부 이전 데이터 그대로이므로,
// updated 시각만 바꾼 무의미한 커밋을 만들지 않도록 저장을 건너뜁니다.
if (!okCount) {
  console.error('새로 수집된 데이터가 없어 파일을 갱신하지 않습니다.');
  process.exit(0);
}

// 실제 목록 내용이 이전과 완전히 같다면 (fetched 시각만 바뀜) 저장을 건너뜁니다.
const itemsOf = (obj) => JSON.stringify(
  Object.fromEntries(Object.entries(obj?.sources || {}).map(([k, v]) => [k, v.items || []]))
);
if (previous && itemsOf(previous) === itemsOf(out)) {
  console.log('목록 내용에 변화가 없어 파일을 갱신하지 않습니다.');
  process.exit(0);
}

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`저장 완료: ${OUT_FILE} (성공 ${okCount}/${SOURCES.length})`);
