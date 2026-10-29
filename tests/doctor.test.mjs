import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const T = require('../assets/doctor.js');
const docs = JSON.parse(readFileSync(new URL('../data/docs.json', import.meta.url), 'utf8'));

test('pdvKind: 환자 본인 칸', () => {
  for (const [l, k] of [['성명', 'name'], ['성 명', 'name'], ['환자 성명', 'name'], ['환자명', 'name'], ['신청인 성명', 'name'],
    ['주소', 'addr'], ['환자 주소', 'addr'], ['전화번호', 'tel'], ['연락처', 'tel'], ['휴대전화', 'tel'], ['이메일', 'email'], ['주민등록번호', 'rrn']]) {
    assert.equal(T.pdvKind(l), k, l);
  }
});
test('pdvKind: 환자 값으로 채우지 않는 칸', () => {
  for (const l of ['보호자 성명', '법정대리인 성명', '대리인 주소', '의사 성명', '담당의 성명', '간호사 성명', '의료기관 명칭', '병원 소재지', '의원 전화번호',
    '요양기관 소재지', '사업자등록번호', '상호', '관할 보건소', '진료과', '수술자 성명', '배우자 성명', '보험사 담당자 성명', '작성자 성명', '확인자 성명']) {
    assert.equal(T.pdvKind(l), null, l);
  }
});
test('search: 한 글자·별칭·제목', () => {
  assert.equal(T.search(docs, '진단', 5)[0].t, '진단서');
  assert.equal(T.search(docs, 'MAR')[0].t, '투약 기록지');
  assert.equal(T.search(docs, '의무기록 사본 신청')[0].t, '진료기록 사본 발급 신청서');
  assert.equal(T.search(docs, '수술 동의서')[0].t, '수술 동의서');
  assert.deepEqual(T.search(docs, ''), []);
});
test('extractDraft / partialDraft', () => {
  const full = '안내\n~~~markdown\n# 제목\n\n## 의뢰인\n| 성명 | [확인 필요: 성명] |\n~~~\n끝';
  assert.match(T.extractDraft(full), /^# 제목/);
  const part = '~~~markdown\n# 제목\n## 의뢰인\n| 성명 | [확인';
  assert.equal(T.extractDraft(part), null);
  assert.equal(T.partialDraft(part), '# 제목\n## 의뢰인');
  assert.equal(T.partialDraft('~~~markdown\n일반 문장\n둘째'), null);
});
test('renderMd: 제목 한 번만, 빈 칸은 입력 칸, 표', () => {
  const h = T.renderMd('# 제목\n## 의뢰인\n| 항목 | 내용 |\n|---|---|\n| 성명 | [확인 필요: 성명] |\n| 성명 | [확인 필요: 성명] |', { inputs: true, skipTitle: true });
  assert.ok(!h.includes('제목</h'));
  assert.equal((h.match(/class="fld"/g) || []).length, 2);
  assert.ok(h.includes('data-k="성명#2"'));
  assert.ok(h.includes('<th>항목</th>'));
  assert.ok(T.renderMd('<script>x</script>', {}).includes('&lt;script&gt;'));
});
test('fillMd: 민감 항목은 본문에 싣지 않음', () => {
  const md = '성명 [확인 필요: 성명]\n주민 [확인 필요: 주민등록번호]\n전화 [확인 필요: 전화번호]';
  const r = T.fillMd(md, { '성명#1': '홍길동', '주민등록번호#1': '000000-1******' });
  assert.match(r, /홍길동/);
  assert.match(r, /\(민감 항목 제외\)/);
  assert.match(r, /\[확인 필요: 전화번호\]/);
});
test('attachmentsOf', () => {
  assert.deepEqual(T.attachmentsOf('# a\n## 첨부서류\n- 재무제표\n- **사업자등록증** 사본\n## 기타\n- 무관'), ['재무제표', '사업자등록증 사본']);
});
test('parseReview: 판정·확신도, 마지막 줄 제거', () => {
  const r = T.parseReview('결론\n[REVIEW_RESULT: verdict=보정 요청 예상; confidence=7]');
  assert.equal(r.verdict, '보정 요청 예상');
  assert.equal(r.confidence, 7);
  assert.ok(!r.body.includes('REVIEW_RESULT'));
  assert.equal(T.parseReview('결과 없음').verdict, '판단 불가');
  assert.equal(T.parseReview('[REVIEW_RESULT: verdict=승인 예상; confidence=12]').confidence, 9);
  assert.equal(T.parseReview('[REVIEW_RESULT: verdict=엉터리; confidence=5]').verdict, '판단 불가');
});
test('kstLabel: 한국 표준시 날짜', () => {
  assert.equal(T.kstLabel(new Date('2026-10-29T16:00:00Z')), '2026년 10월 30일');
  assert.equal(T.kstLabel(new Date('2026-10-29T14:59:00Z')), '2026년 10월 29일');
});
test('docs.json 형식', () => {
  assert.ok(docs.length > 30);
  for (const d of docs) {
    assert.ok(d.t && d.p && d.pid && d.c && d.d && Array.isArray(d.a), d.t);
  }
  assert.equal(new Set(docs.map((d) => d.t)).size, docs.length);
});

test('통합 SP 출력 호환: 머리말 제거·자격자 자리표시자·첨부 표', () => {
  const md = ['---', 'doc_type: 소견서', 'status: DRAFT', '---', '', '# 소견서', '',
    '## 2. 서류 본문 (교부용)', '| 항목 | 내용 |', '|---|---|', '| 성명 | [확인 필요: 성명] |', '| 소견 | [의사 판단] |',
    '| 면허번호 | [면허번호: 의사 직접 기재] |', '| 투약 | [간호사 기재: 투약 시각] |', '| 수납 | [원무 기재: 수납액] |', '', '## 3. 첨부서류 목록',
    '| 순번 | 서류 | 발급·작성처 | 상태(확보/미확보/작성 필요) |', '|---|---|---|---|',
    '| 1 | 검사 결과지 | 병원 | 확보 |', '| 2 | 위임장 | 환자 | 미확보 |'].join('\n');
  assert.ok(!T.stripFront(md).includes('doc_type'));
  const html = T.renderMd(md, { skipTitle: true, inputs: true });
  assert.ok(!html.includes('DRAFT'));
  assert.ok(html.includes('data-l="성명"'));
  assert.ok(html.includes('<span class="blank">[의사 판단]</span>'));
  assert.ok(html.includes('<span class="blank">[면허번호: 의사 직접 기재]</span>'));
  assert.ok(html.includes('<span class="blank">[간호사 기재: 투약 시각]</span>'));
  assert.ok(html.includes('<span class="blank">[원무 기재: 수납액]</span>'));
  assert.deepEqual(T.attachmentsOf(md), ['검사 결과지 (확보)', '위임장 (미확보)']);
});
test('fillMd: 보험증·면허 같은 민감 칸은 본문에 싣지 않음', () => {
  const r = T.fillMd('보험증 [확인 필요: 건강보험증번호]\\n면허 [확인 필요: 면허번호]', { '건강보험증번호#1': '123', '면허번호#1': '456' });
  assert.ok(!r.includes('123') && !r.includes('456'));
});
test('문서 목록의 전문가 ID 는 통합 페르소나 하나', () => {
  assert.ok(docs.every(d => d.pid === 'hospital'));
});
test('문서 목록: 의사·간호사·원무 영역이 모두 있다', () => {
  const ps = new Set(docs.map(d => d.p));
  for (const p of ['진단·증명', '의뢰·회송', '진료기록', '처방', '동의서', '신고·보고', '간호기록', '원무·접수', '원무·수납', '원무·보험', '원무·열람', 'issued']) assert.ok(ps.has(p), p);
});
test('사이트: 모든 페이지가 doctor.css·themes.css·theme.js 를 같은 순서로 부른다', () => {
  for (const f of ['index.html', 'mydocs.html', 'settings.html', '404.html']) {
    const h = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const a = h.search(/theme\.js/), b = h.search(/doctor\.css/), c = h.search(/themes\.css/);
    assert.ok(a > -1 && b > a && c > b, f);
    assert.ok(!/tax\.(css|js)|NaviTax|세무/.test(h), f);
  }
});
test('테마: 기본값 D, 저장 키는 navidoctor_', () => {
  const t = readFileSync(new URL('../assets/theme.js', import.meta.url), 'utf8');
  assert.match(t, /DEFAULT = 'd'/);
  assert.match(t, /KEY = 'navidoctor_theme/);
});
test('기존 K-Doctor 첫 화면은 kdoctor.html 로 보존되고 내부 링크가 따라간다', () => {
  const k = readFileSync(new URL('../kdoctor.html', import.meta.url), 'utf8');
  assert.match(k, /K-Doctor/);
  for (const f of ['case.html', 'library.html']) {
    const h = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/href="index\.html"/.test(h), f);
    assert.ok(/href="kdoctor\.html"/.test(h), f);
  }
  const idx = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!idx.includes('K-Doctor 소개'));
});
test('머리말 오른쪽에 K-Doctor 링크, CNAME 은 doctor.hondi.net', () => {
  const js = readFileSync(new URL('../assets/doctor.js', import.meta.url), 'utf8');
  assert.ok(js.includes("kdoctor: 'https://doctor.hondi.net/kdoctor.html'"));
  assert.equal(readFileSync(new URL('../CNAME', import.meta.url), 'utf8').trim(), 'doctor.hondi.net');
});
test('대화창: 반투명 + 옅은 회색 바탕(D)', () => {
  const c = readFileSync(new URL('../assets/themes.css', import.meta.url), 'utf8');
  const m = /^:root\[data-theme="d"\] \.chat \{ background: rgba\((\d+),(\d+),(\d+),([\d.]+)\)/m.exec(c);
  assert.ok(m, '.chat 배경 규칙');
  const [r, g, b, a] = m.slice(1).map(Number);
  assert.ok(r > 220 && g > 220 && b > 220, '옅은 회색(밝은 값)');
  assert.ok(a > 0.15 && a < 0.5, '반투명');
  assert.match(c, /\.chat iframe \{ background: transparent; opacity: \.[67]\d?;/);
});
