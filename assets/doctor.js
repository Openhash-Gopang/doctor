/* 병원·의원 서류 전문가 사이트(doctor.hondi.net) — 공통 스크립트 (나비로 law.js 방식)
   직역마다 바꾸는 곳은 맨 위 설정뿐입니다. 순수 함수는 Node 테스트에서도 불러 쓸 수 있습니다. */
(function (root) {
  'use strict';

  /* ── 설정 ─────────────────────────────────────────────── */
  var HONDI = 'https://hondi.net';
  var LABEL = '병원 & 의원';
  var KEY = 'navidoctor_';
  var PERSONA = { doctor: 'hospital', nurse: 'hospital', admin: 'hospital' }; // hondi 전문가 ID: 의사·간호사·원무 통합 SP(SP_hospital-assistant)
  var ENGINE_L = PERSONA.doctor;
  var ISSUE_URL = 'https://www.gov.kr';
  var LINKS = {
    suggest: 'https://hondi.net/pages/suggest.html',
    kdoctor: 'https://doctor.hondi.net/kdoctor.html',
    platform: 'https://hondi.net/desktop.html',
    naviweb: 'https://hondi.net/'
  };
  var SIM_CLIENT = { name: '도 영민', addr: '제주시 한림읍 금능남로 3', tel: '010-9662-7170', email: 'tensor.city@gmail.com', rrn: '641005-1******' };
  var NOT_SELF_RE = /피신청인|상대방|보호자|법정대리인|대리인|증인|배우자|자녀|부모|가족|기관|관할|보건소|심평원|공단|보험사|보험회사|상호|사업자|사업장|법인명|소재지|직장|근무처|병원|의원|의사|간호사|담당의|주치의|의료인|약사|원무|진료과|담당자|수술자|집도의|마취의|검사자|판독의|작성자|확인자/;
  var SENSITIVE_RE = /주민|계좌|카드|비밀번호|여권|면허|보험증|증권번호|요양기관기호/;
  var RULES = '의료법, 국민건강보험법, 의료급여법, 약사법, 마약류 관리에 관한 법률, 감염병의 예방 및 관리에 관한 법률, 응급의료에 관한 법률, 환자안전법, 개인정보 보호법, 생명윤리 및 안전에 관한 법률, 산업재해보상보험법, 자동차손해배상 보장법, 노인장기요양보험법, 장애인복지법, 호스피스·완화의료 및 임종과정에 있는 환자의 연명의료결정에 관한 법률';
  var AGENCY = '환자·보호자 교부, 건강보험심사평가원·국민건강보험공단, 관할 보건소·질병관리청, 보험회사, 병무청·도로교통공단 등 서류 성격에 맞는 제출처';
  var VERDICTS = { '승인 예상': 'ok', '보정 요청 예상': 'fix', '수정 필요': 'need', '판단 불가': 'unk' };
  var CORE_BLANK_RE = /환자|성명|상병|진단|입원|퇴원|진료일|수술|처방|동의/;

  /* ── 순수 함수 ─────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

  function pdvKind(label) {
    var n = String(label || '').replace(/\s+/g, '');
    if (!n || NOT_SELF_RE.test(n)) return null;
    if (/주민등록번호|주민번호/.test(n)) return 'rrn';
    if (/이메일|전자우편/.test(n)) return 'email';
    if (/전화|연락처|휴대/.test(n)) return 'tel';
    if (/주소/.test(n)) return 'addr';
    if (/성명|대표자|환자명|신청인|동의인|^이름$/.test(n)) return 'name';
    return null;
  }

  function search(docs, q, n) {
    var k = norm(q);
    if (!k || !docs) return [];
    var out = [];
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i], t = norm(d.t), s = 0;
      if (t === k) s = 100;
      else if (t.indexOf(k) === 0) s = 80;
      else if (t.indexOf(k) > -1) s = 60;
      else {
        var a = d.a || [];
        for (var j = 0; j < a.length; j++) {
          var x = norm(a[j]);
          if (x === k) { s = 70; break; }
          if (x.indexOf(k) > -1) s = Math.max(s, 50);
        }
        if (!s && norm(d.d).indexOf(k) > -1) s = 20;
      }
      if (s) out.push({ d: d, s: s });
    }
    out.sort(function (x, y) { return y.s - x.s || x.d.t.length - y.d.t.length; });
    return out.slice(0, n || 5).map(function (x) { return x.d; });
  }

  var OPEN_RE = /(?:~~~|```)[ \t]*markdown[ \t]*\r?\n/i;
  var CLOSE_RE = /\r?\n(?:~~~|```)[ \t]*(?:\r?\n|$)/;
  function extractDraft(text) {
    var m = OPEN_RE.exec(text || '');
    if (!m) return null;
    var rest = text.slice(m.index + m[0].length);
    var c = CLOSE_RE.exec(rest);
    return c ? rest.slice(0, c.index) : null;
  }
  function partialDraft(text) {
    var m = OPEN_RE.exec(text || '');
    if (!m) return null;
    var rest = text.slice(m.index + m[0].length);
    var c = CLOSE_RE.exec(rest);
    if (c) rest = rest.slice(0, c.index);
    else {
      var i = rest.lastIndexOf('\n');
      if (i < 0) return null;
      rest = rest.slice(0, i);
    }
    return /(^|\n)#\s+\S/.test(rest) ? rest : null;
  }

  // 서식 맨 앞의 YAML 머리말(--- … ---)은 화면에 보이지 않게 한다.
  function stripFront(md) {
    return String(md || '').replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  }
  // 자격자가 채우는 자리표시자: [의사 기재: …] [간호사 기재: …] [원무 기재: …] [의사 판단] [항목: 의사 직접 기재] 등
  var NOTE_RE = /\[(?:(?:의사|간호사|원무) (?:기재|직접 기재|직접 확인[^\]]*)(?::\s*[^\]]+?)?|(?:의사|간호사) 판단(?::\s*[^\]]+?)?|[^\[\]:]+:\s*(?:의사|간호사|원무) 직접 기재)\s*\]/g;

  function renderMd(md, o) {
    o = o || {};
    md = stripFront(md);
    var lines = String(md || '').split(/\r?\n/), out = [], i = 0, cnt = {};
    var titleSkipped = !o.skipTitle, inList = false;
    function inl(s) {
      s = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      var re = /\[확인 필요:\s*([^\]]+?)\s*\]/g;
      s = note(s);
      if (o.inputs) {
        return s.replace(re, function (_, l) {
          cnt[l] = (cnt[l] || 0) + 1;
          return '<span class="fw"><input class="fld" type="text" data-k="' + l + '#' + cnt[l] + '" data-l="' + l + '" aria-label="' + l + '" placeholder="' + l + '"></span>';
        });
      }
      return s.replace(re, '<span class="blank">($1)</span>');
    }
    function note(h) { return h.replace(NOTE_RE, function (m) { return '<span class="blank">' + m + '</span>'; }); }
    function closeList() { if (inList) { out.push('</ul>'); inList = false; } }
    while (i < lines.length) {
      var L = lines[i], m;
      if (/^\s*$/.test(L)) { closeList(); i++; continue; }
      if (/^#\s+/.test(L) && !titleSkipped) { titleSkipped = true; i++; continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(L))) {
        closeList();
        var n = m[1].length <= 2 ? 3 : m[1].length + 1;
        out.push('<h' + n + '>' + inl(m[2]) + '</h' + n + '>');
        i++; continue;
      }
      if (/^\s*\|/.test(L)) {
        closeList();
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }));
          i++;
        }
        var sep = rows.length > 1 && rows[1].every(function (c) { return /^:?-{2,}:?$/.test(c); });
        var html = '<div class="tbl"><table>';
        rows.forEach(function (r, ri) {
          if (sep && ri === 1) return;
          var tag = sep && ri === 0 ? 'th' : 'td';
          html += '<tr>' + r.map(function (c) { return '<' + tag + '>' + inl(c) + '</' + tag + '>'; }).join('') + '</tr>';
        });
        out.push(html + '</table></div>');
        continue;
      }
      if ((m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(L))) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + inl(m[1]) + '</li>');
        i++; continue;
      }
      closeList();
      out.push('<p>' + inl(L) + '</p>');
      i++;
    }
    closeList();
    return out.join('');
  }

  function fillMd(md, vals) {
    var cnt = {};
    return String(md || '').replace(/\[확인 필요:\s*([^\]]+?)\s*\]/g, function (m, l) {
      cnt[l] = (cnt[l] || 0) + 1;
      var v = vals && vals[l + '#' + cnt[l]];
      if (!v) return m;
      return SENSITIVE_RE.test(l) ? '(민감 항목 제외)' : v;
    });
  }

  function attachmentsOf(md) {
    var lines = String(md || '').split(/\r?\n/), out = [], on = false, m;
    for (var i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s+/.test(lines[i])) { on = /첨부/.test(lines[i]); continue; }
      if (on && (m = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(lines[i]))) { out.push(m[1].replace(/\*\*/g, '').trim()); continue; }
      if (on && /^\s*\|/.test(lines[i])) {
        var c = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function (x) { return x.replace(/\*\*/g, '').trim(); });
        if (c.length < 2 || c.every(function (x) { return /^:?-{2,}:?$/.test(x); }) || c[0] === '순번' || !c[1]) continue;
        out.push(c[1] + (c[3] ? ' (' + c[3] + ')' : ''));
      }
    }
    return out;
  }

  function parseReview(text) {
    var re = /\[REVIEW_RESULT:\s*verdict=([^;\]]+?)\s*;\s*confidence=(\d+)\s*\]/;
    var m = re.exec(text || '');
    var verdict = '판단 불가', conf = 0;
    if (m) {
      var v = m[1].trim();
      if (VERDICTS[v]) verdict = v;
      conf = Math.max(0, Math.min(9, parseInt(m[2], 10) || 0));
    }
    var body = String(text || '').replace(/\[REVIEW_RESULT:[^\]]*\]/g, '').trim();
    return { verdict: verdict, confidence: conf, body: body, parsed: !!m };
  }

  function kstLabel(d) {
    var k = new Date((d || new Date()).getTime() + 9 * 3600 * 1000);
    return k.getUTCFullYear() + '년 ' + (k.getUTCMonth() + 1) + '월 ' + k.getUTCDate() + '일';
  }

  function draftStartMessage(doc, attach) {
    return '"' + doc.t + '" 서류의 초안 전체를 지금 바로 작성하세요. 인사나 질문 없이, 서류 전체를 ~~~markdown 코드 블록 하나로 출력하세요. ' +
      '첫 줄은 "# ' + doc.t + '" 제목 줄로 시작합니다. 환자 인적사항(성명·주소·전화번호·이메일·주민등록번호)은 [확인 필요: 항목명] 형태의 빈 칸으로 두고, ' +
      '알 수 없는 항목도 묻지 말고 같은 형식의 빈 칸으로 두세요. 첨부서류가 있으면 "## 첨부서류" 제목 아래 목록으로 적으세요.' +
      (attach ? '\n\n[사용자가 첨부한 서식]\n' + attach : '');
  }

  function reviewMessage(o) {
    return '[제출 결과 예상 요청]\n서류: ' + o.title + '\n기준일: ' + kstLabel(new Date()) + '(한국 표준시)\n' +
      '접수 기관 후보: ' + AGENCY + '\n결과 용어: 승인 예상 · 보정 요청 예상 · 수정 필요 · 판단 불가\n근거 규범: ' + RULES + '\n' +
      '빈 칸: ' + o.blanks.length + '개' + (o.blanks.length ? ' (' + o.blanks.join(', ') + ')' : '') + '\n' +
      '첨부서류 상태: ' + (o.attach.length ? o.attach.join('; ') : '해당 없음') + '\n' +
      '출력 형식: ① 결론(판정과 확신도) ② 근거(형식 요건, 실체 요건, 절차 요건, 결격 사유 순, 판정마다 법령 이름과 규범 단, 조문은 확실할 때만, 확실치 않으면 "확인 필요") ' +
      '③ 표(문제가 있으면 "항목 | 문제 | 근거 법령 | 조치", 승인 예상이면 "요건 | 확인한 내용 | 근거 법령") ④ 다음 단계 한 줄. 첨부 미확인을 미비로 단정하지 말고, 조문·판례·기한 수치를 만들어 내지 마세요. ' +
      '마지막 줄에 [REVIEW_RESULT: verdict=승인 예상|보정 요청 예상|수정 필요|판단 불가; confidence=0~9]\n\n[서류 본문]\n' + o.text;
  }

  var api = {
    HONDI: HONDI, KEY: KEY, SIM_CLIENT: SIM_CLIENT, NOT_SELF_RE: NOT_SELF_RE, SENSITIVE_RE: SENSITIVE_RE, VERDICTS: VERDICTS,
    esc: esc, norm: norm, pdvKind: pdvKind, search: search, extractDraft: extractDraft, partialDraft: partialDraft,
    stripFront: stripFront, renderMd: renderMd, fillMd: fillMd, attachmentsOf: attachmentsOf, parseReview: parseReview, kstLabel: kstLabel,
    draftStartMessage: draftStartMessage, reviewMessage: reviewMessage
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof document === 'undefined') return;
  root.NaviDoctor = api;

  /* ── 화면 ──────────────────────────────────────────────── */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function svg(p) { return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var ICON = {
    home: svg('<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>'),
    docs: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    check: svg('<path d="M5 12l5 5 9-10"/>'),
    mic: svg('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    suggest: svg('<path d="M12 3a6 6 0 00-3 11.2V17h6v-2.8A6 6 0 0012 3zM10 21h4"/>'),
    ext: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>'),
    spark: svg('<path d="M12 3l2.2 5.6L20 9.3l-4.4 3.8L17 19l-5-3.1L7 19l1.4-5.9L4 9.3l5.8-.7z"/>')
  };

  function chrome(active, opt) {
    opt = opt || {};
    var host = document.getElementById('chrome');
    if (!host) return;
    function cur(n) { return active === n ? ' aria-current="page"' : ''; }
    host.innerHTML =
      '<aside class="rail" aria-label="주 메뉴">' +
        '<a class="rl" href="' + LINKS.platform + '" target="_blank" rel="noopener"><span class="ri"><img src="assets/navi-icon.png" alt="" onerror="this.remove()"></span><span class="rt">나비 플랫폼</span></a>' +
        '<a class="rl" href="index.html"' + cur('home') + '><span class="ri">' + ICON.home + '</span><span class="rt">홈</span></a>' +
        '<a class="rl" href="mydocs.html"' + cur('mydocs') + '><span class="ri">' + ICON.docs + '</span><span class="rt">내 서류 목록</span></a>' +
        '<a class="rl rp" href="index.html?panel=p-how" data-panel="p-how"><span class="ri">' + ICON.help + '</span><span class="rt">사용법</span></a>' +
        '<a class="rl rp" href="index.html?panel=p-feat" data-panel="p-feat"><span class="ri">' + ICON.spark + '</span><span class="rt">사이트의 특징</span></a>' +
      '</aside>' +
      '<header class="bar">' +
        '<a class="brand" href="index.html">' + LABEL + '</a>' +
        '<nav class="bnav" aria-label="주 메뉴"><a href="index.html"' + cur('home') + '>홈</a><a href="mydocs.html"' + cur('mydocs') + '>내 서류 목록</a></nav>' +
        '<div class="tools">' +
          '<a href="' + LINKS.suggest + '" target="_blank" rel="noopener">제안</a>' +
          '<a href="settings.html" aria-label="설정"' + cur('settings') + '>' + ICON.gear + '</a>' +
          '<a href="' + LINKS.kdoctor + '" target="_blank" rel="noopener" title="K-Doctor 소개 — 진료과목별 AI 진단 참고·처치 제안" aria-label="K-Doctor 소개 — 진료과목별 AI 진단 참고·처치 제안">K-Doctor</a>' +
          '<span class="badge">' + esc(SIM_CLIENT.name) + '</span>' +
        '</div>' +
      '</header>';
    if (opt.chat) {
      var fab = document.createElement('button');
      fab.className = 'fab'; fab.type = 'button'; fab.setAttribute('aria-label', '대화 열기'); fab.innerHTML = ICON.chat;
      var dock = document.createElement('div');
      dock.className = 'chat'; dock.id = 'chat'; dock.setAttribute('role', 'dialog'); dock.setAttribute('aria-label', 'AI 대화');
      fab.addEventListener('click', function () { dock.classList.toggle('open'); });
      document.body.appendChild(dock);
      document.body.appendChild(fab);
    }
  }

  function initPanels() {
    var scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.appendChild(scrim);
    function closeAll() {
      $$('.panel').forEach(function (p) { p.classList.remove('open'); });
      scrim.classList.remove('on');
    }
    function toggle(id) {
      var p = document.getElementById(id);
      if (!p) return;
      var was = p.classList.contains('open');
      closeAll();
      if (!was) { p.classList.add('open'); scrim.classList.add('on'); }
    }
    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () { toggle(t.getAttribute('data-panel')); });
    });
    /* 디자인 D 데스크톱의 왼쪽 메뉴 항목(모든 페이지에 있음): 홈 화면이면 패널을 열고, 다른 페이지면 홈으로 가서 연다 */
    $$('.rail .rp').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (!document.getElementById(a.getAttribute('data-panel'))) return;
        e.preventDefault();
        toggle(a.getAttribute('data-panel'));
      });
    });
    try {
      var want = new URLSearchParams(location.search).get('panel');
      if (want && document.getElementById(want)) {
        toggle(want);
        /* 다른 페이지에서 넘어온 경우에만 열고, 주소에서 panel 값을 지워 새로 고침·주소 자동완성으로 다시 열리지 않게 한다 */
        if (history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
      }
    } catch (e) {}
    $$('.panel .x').forEach(function (b) { b.addEventListener('click', closeAll); });
    scrim.addEventListener('click', closeAll);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
  }

  /* 저장소(내 서류 목록) */
  function loadDocs() {
    try { var v = JSON.parse(localStorage.getItem(KEY + 'docs') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function storeDocs(list) { try { localStorage.setItem(KEY + 'docs', JSON.stringify(list.slice(0, 50))); } catch (e) {} }

  function initHome() {
    var DOCS = null;
    var q = $('#q'), docEl = $('#doc'), bodyEl = $('#body'), statusEl = $('#status'), errEl = $('#err');
    var chipsEl = $('#chips'), titleEl = $('#dtitle'), lawEl = $('#dlaw'), reviewEl = $('#review');
    var S = { cur: null, locked: false, job: 0, mode: '', md: '', vals: {}, pdv: {}, id: null, stage: '', nudged: false,
      partial: '', lastDraw: 0, drawT: null, exact: null, tmo: null, prevT: null, saveT: null, attach: '', acClient: null };
    var frame = null, framePid = null, frameReady = false, waiters = [], noteT = null;
    var acMode = false;
    try { acMode = new URLSearchParams(location.search).get('ac') === '1' && !!window.opener; } catch (e) {}

    function client() { return acMode ? S.acClient : SIM_CLIENT; }

    /* 대화 틀 */
    function ensureFrame(pid) {
      return new Promise(function (res) {
        if (frame && framePid === pid && frameReady) { res(); return; }
        waiters.push(res);
        if (frame && framePid === pid) return;
        if (frame) frame.remove();
        frameReady = false; framePid = pid;
        frame = document.createElement('iframe');
        frame.title = 'AI 전문가 대화';
        frame.src = HONDI + '/pages/expert-chat.html?persona=' + encodeURIComponent(pid) + '&embed=1&label=' + encodeURIComponent(LABEL);
        $('#chat').appendChild(frame);
        showNote('대화를 불러오는 중…');
        clearTimeout(noteT);
        noteT = setTimeout(function () {
          if (!frameReady) showNote('대화 화면을 불러오지 못했습니다. 페이지를 새로 고친 뒤 다시 열어 주세요.');
        }, 15000);
      });
    }
    function showNote(t) {
      var n = $('#chatNote');
      if (!n) { n = document.createElement('p'); n.id = 'chatNote'; n.className = 'chat-note'; n.setAttribute('role', 'status'); $('#chat').appendChild(n); }
      n.textContent = t; n.hidden = !t;
    }
    /* 대화 버튼으로 열 때도 대화 틀을 바로 만든다(서류를 시작하기 전에 열어도 빈 칸이 되지 않게) */
    var fabEl = $('.fab');
    if (fabEl) fabEl.addEventListener('click', function () {
      if ($('#chat').classList.contains('open') && !frame) ensureFrame((S.cur && S.cur.pid) || ENGINE_L);
    });
    function post(text) { frame.contentWindow.postMessage({ type: 'expert-embed-send', text: text }, HONDI); }

    window.addEventListener('message', function (e) {
      if (e.origin !== HONDI) return;
      var d = e.data || {};
      if (d.type === 'GWP_PDV_RESPONSE' && acMode) { S.acClient = d.data || null; applyPdv(); return; }
      if (!frame || e.source !== frame.contentWindow) return;
      if (d.type === 'expert-embed-ready') { frameReady = true; clearTimeout(noteT); showNote(''); var w = waiters; waiters = []; w.forEach(function (f) { f(); }); }
      else if (d.type === 'expert-embed-partial') onPartial(String(d.text || ''));
      else if (d.type === 'expert-embed-reply') onReply(String(d.text || ''));
    });
    if (acMode) {
      try { window.opener.postMessage({ type: 'GWP_PDV_REQUEST', fields: ['name', 'addr', 'tel', 'email'] }, HONDI); } catch (e) {}
    }

    /* 본문 그리기 */
    function collectVals() {
      $$('.fld', bodyEl).forEach(function (i) {
        var k = i.getAttribute('data-k');
        S.vals[k] = i.value;
        S.pdv[k] = i.parentNode.classList.contains('pdv');
      });
    }
    function applyPdv() {
      var c = client();
      $$('.fld', bodyEl).forEach(function (i) {
        var k = i.getAttribute('data-k');
        if (i.value || S.vals[k]) return;
        var kind = pdvKind(i.getAttribute('data-l'));
        if (kind && c && c[kind]) { i.value = c[kind]; i.parentNode.classList.add('pdv'); S.pdv[k] = true; }
      });
    }
    function drawBody(md) {
      collectVals();
      bodyEl.innerHTML = renderMd(md, { inputs: true, skipTitle: true });
      $$('.fld', bodyEl).forEach(function (i) {
        var k = i.getAttribute('data-k');
        if (S.vals[k] !== undefined) i.value = S.vals[k];
        if (S.pdv[k] && i.value) i.parentNode.classList.add('pdv');
      });
      applyPdv();
    }
    bodyEl.addEventListener('input', function (e) {
      var i = e.target;
      if (!i.classList.contains('fld')) return;
      i.parentNode.classList.remove('pdv');
      S.vals[i.getAttribute('data-k')] = i.value;
      S.pdv[i.getAttribute('data-k')] = false;
      clearTimeout(S.saveT);
      S.saveT = setTimeout(function () { save(); }, 400);
    });

    function skeleton() {
      return '## 환자\n| 항목 | 내용 |\n|---|---|\n| 성명 | [확인 필요: 성명] |\n| 주소 | [확인 필요: 주소] |\n| 전화번호 | [확인 필요: 전화번호] |\n| 이메일 | [확인 필요: 이메일] |\n| 주민등록번호 | [확인 필요: 주민등록번호] |';
    }
    function setCur(doc, rest, keepBody) {
      S.cur = doc;
      titleEl.textContent = doc.t;
      lawEl.textContent = doc.d || '';
      chipsEl.innerHTML = '';
      (rest || []).forEach(function (r) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'chip'; b.textContent = r.t;
        b.addEventListener('click', function () { confirmDoc(r); });
        chipsEl.appendChild(b);
      });
      if (!keepBody) {
        S.md = doc.p === 'issued' ? '' : skeleton();
        bodyEl.innerHTML = '';
        drawBody(S.md);
        statusEl.textContent = doc.p === 'issued' ? '발급받아 첨부하는 서류입니다. 엔터 키를 누르면 발급 안내로 이동합니다.' : '';
      }
      docEl.hidden = false;
    }

    /* 미리보기 */
    function preview() {
      var v = q.value.trim();
      S.job++; clearTimeout(S.exact); clearTimeout(S.tmo); S.mode = ''; S.locked = false;
      S.vals = {}; S.pdv = {}; S.id = null; S.stage = '';
      delete docEl.dataset.done; reviewEl.innerHTML = ''; errEl.innerHTML = '';
      if (!v) { docEl.hidden = true; S.cur = null; return; }
      var res = DOCS ? search(DOCS, v, 5) : [];
      var top = res[0] || { t: v, p: '', pid: ENGINE_L, c: '', d: '', a: [] };
      setCur(top, res.slice(1, 5));
      if (res[0] && norm(res[0].t) === norm(v) && res[0].p !== 'issued') {
        S.exact = setTimeout(function () { confirmDoc(res[0]); }, 700);
      }
    }
    q.addEventListener('input', function () { clearTimeout(S.prevT); clearTimeout(S.exact); S.prevT = setTimeout(preview, 120); });

    $('#askForm').addEventListener('submit', function (e) {
      e.preventDefault();
      clearTimeout(S.prevT);
      if (S.locked) return;
      if (!q.value.trim()) return;
      if (!S.cur || norm(S.cur.t) === '' ) preview();
      if (S.cur) confirmDoc(S.cur);
    });

    /* 작성 */
    function confirmDoc(doc) {
      if (doc.p === 'issued') { location.href = ISSUE_URL; return; }
      clearTimeout(S.exact); clearTimeout(S.prevT);
      q.value = doc.t;
      var rest = DOCS ? search(DOCS, doc.t, 6).filter(function (d) { return d.t !== doc.t; }).slice(0, 4) : [];
      S.locked = true; S.vals = {}; S.pdv = {}; S.id = 'd' + Date.now().toString(36);
      delete docEl.dataset.done; reviewEl.innerHTML = '';
      setCur(doc, rest);
      startDraft(doc);
    }
    function startTimeout(job) {
      clearTimeout(S.tmo);
      S.tmo = setTimeout(function () { if (S.job === job && S.mode) fail(); }, 90000);
    }
    function startDraft(doc) {
      var job = ++S.job;
      S.mode = 'draft'; S.nudged = false; S.partial = '';
      errEl.innerHTML = '';
      statusEl.textContent = 'AI가 이 서류의 나머지 항목을 작성하고 있습니다…';
      save('작성 중');
      startTimeout(job);
      ensureFrame(doc.pid || ENGINE_L).then(function () {
        if (S.job !== job || S.mode !== 'draft') return;
        post(draftStartMessage(doc, S.attach));
      });
    }
    function fail() {
      var was = S.mode;
      S.mode = ''; clearTimeout(S.tmo);
      statusEl.textContent = '';
      var url = HONDI + '/pages/expert-chat.html?persona=' + encodeURIComponent((S.cur && S.cur.pid) || ENGINE_L);
      errEl.setAttribute('role', 'alert');
      errEl.innerHTML = (was === 'review' ? '제출 결과 예상을 불러오지 못했습니다.' : '서류 초안을 불러오지 못했습니다.') +
        ' <a href="' + esc(url) + '" target="_blank" rel="noopener">작성 화면에서 하기</a>';
    }
    function onPartial(text) {
      S.partial = text;
      if (S.mode !== 'draft' || S.drawT) return;
      var wait = Math.max(0, 150 - (Date.now() - S.lastDraw));
      S.drawT = setTimeout(function () {
        S.drawT = null; S.lastDraw = Date.now();
        if (S.mode !== 'draft') return;
        var md = partialDraft(S.partial);
        if (!md) return;
        var a = document.activeElement;
        if (a && a.classList && a.classList.contains('fld') && bodyEl.contains(a)) return;
        S.md = md; drawBody(md);
      }, wait);
    }
    function onReply(text) {
      if (S.mode === 'draft') {
        var md = extractDraft(text);
        if (md) {
          clearTimeout(S.tmo); clearTimeout(S.drawT); S.drawT = null; S.mode = '';
          S.md = md; drawBody(md);
          statusEl.textContent = '';
          docEl.dataset.done = '1';
          save('초안 완료');
        } else if (!S.nudged) {
          S.nudged = true;
          post('질문하지 말고 서류 초안 전체를 ~~~markdown 코드 블록으로 지금 바로 작성하세요. 모르는 항목은 [확인 필요: 항목명]으로 두세요.');
          startTimeout(S.job);
        } else fail();
      } else if (S.mode === 'review') {
        clearTimeout(S.tmo); S.mode = '';
        statusEl.textContent = '';
        showReview(parseReview(text));
        save('검토됨');
      }
    }

    /* 저장 */
    function save(stage) {
      if (!S.id || !S.cur) return;
      collectVals();
      var vals = {}, cl = '';
      Object.keys(S.vals).forEach(function (k) {
        var l = k.replace(/#\d+$/, '');
        if (SENSITIVE_RE.test(l)) return;
        vals[k] = S.vals[k];
        if (!cl && S.vals[k] && pdvKind(l) === 'name') cl = S.vals[k];
      });
      if (stage) S.stage = stage;
      var rec = { id: S.id, title: S.cur.t, pid: S.cur.pid || ENGINE_L, client: cl, ts: Date.now(), stage: S.stage || '작성 중', md: S.md, vals: vals };
      var list = loadDocs().filter(function (r) { return r.id !== rec.id; });
      list.unshift(rec);
      list.sort(function (a, b) { return b.ts - a.ts; });
      storeDocs(list);
    }

    /* 제출 결과 예상 */
    function blanksNow() {
      var f = $$('.fld', bodyEl);
      return { total: f.length, blank: f.filter(function (i) { return !i.value.trim(); }).map(function (i) { return i.getAttribute('data-l'); }) };
    }
    function showReview(r) {
      var cls = VERDICTS[r.verdict] || 'unk';
      var conf = r.verdict === '판단 불가' && !r.parsed ? '' : '<span class="conf">확신도 ' + r.confidence + '/9</span>';
      reviewEl.innerHTML = '<div class="rbox" role="status"><p><span class="vb v-' + cls + '">' + esc(r.verdict) + '</span>' + conf + '</p>' + renderMd(r.body, {}) + '</div>';
      reviewEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function sendReview(attachState) {
      collectVals();
      var b = blanksNow();
      var job = ++S.job;
      S.mode = 'review';
      errEl.innerHTML = '';
      statusEl.textContent = '제출 결과를 검토하고 있습니다…';
      startTimeout(job);
      var msg = reviewMessage({ title: S.cur.t, blanks: b.blank, attach: attachState, text: fillMd(S.md, S.vals) });
      ensureFrame((S.cur && S.cur.pid) || ENGINE_L).then(function () { if (S.job === job && S.mode === 'review') post(msg); });
    }
    function startReview() {
      if (S.mode) return;
      collectVals();
      var b = blanksNow();
      var core = b.blank.some(function (l) { return CORE_BLANK_RE.test(l); });
      if (b.total && (b.blank.length * 2 >= b.total || core)) {
        showReview({ verdict: '판단 불가', confidence: 0, parsed: false, body: '## 빈 칸부터 채워 주세요\n핵심 항목이나 절반 이상의 칸이 비어 있어 제출 결과를 가늠할 수 없습니다.\n' + b.blank.map(function (l) { return '- ' + l; }).join('\n') });
        return;
      }
      var att = attachmentsOf(S.md);
      if (!att.length) { sendReview([]); return; }
      reviewEl.innerHTML = '<div class="rbox"><h3>첨부서류 준비 상태</h3><ul class="chk">' +
        att.map(function (a, i) { return '<li><label><input type="checkbox" data-i="' + i + '"> ' + esc(a) + '</label></li>'; }).join('') +
        '</ul><button type="button" class="btn" id="goReview">검토 시작</button></div>';
      $('#goReview').addEventListener('click', function () {
        var st = att.map(function (a, i) {
          var c = $('input[data-i="' + i + '"]', reviewEl);
          return a + '=' + (c && c.checked ? '준비됨' : '확인되지 않음');
        });
        sendReview(st);
      });
    }
    $$('[data-rv]').forEach(function (b) { b.addEventListener('click', startReview); });

    /* 서류 단추 */
    function plainClone() {
      var c = bodyEl.cloneNode(true);
      $$('.fw', c).forEach(function (f) {
        var s = document.createElement('span');
        s.textContent = f.querySelector('input').value || '(      )';
        f.replaceWith(s);
      });
      return c;
    }
    $('#dl').addEventListener('click', function () {
      var c = plainClone(), t = S.cur ? S.cur.t : '서류';
      var html = '<!doctype html><html lang="ko"><meta charset="utf-8"><title>' + esc(t) + '</title><body style="font-family:sans-serif;max-width:780px;margin:2rem auto;line-height:1.7"><h1>' + esc(t) + '</h1>' + c.innerHTML + '</body></html>';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      a.download = t + '.html';
      document.body.appendChild(a); a.click(); a.remove();
    });
    $('#cp').addEventListener('click', function () {
      var c = plainClone();
      c.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
      document.body.appendChild(c);
      var text = (S.cur ? S.cur.t + '\n\n' : '') + c.innerText;
      c.remove();
      try { navigator.clipboard.writeText(text); statusEl.textContent = '복사했습니다.'; setTimeout(function () { if (!S.mode) statusEl.textContent = ''; }, 1800); } catch (e) {}
    });
    $('#ed').addEventListener('click', function () {
      var f = $$('.fld', bodyEl);
      var t = f.filter(function (i) { return !i.value; })[0] || f[0];
      if (t) { t.focus(); t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    });

    /* 첨부·음성 */
    $('#attach').addEventListener('click', function () { $('#file').click(); });
    $('#file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      if (!/^text\//.test(f.type) && !/\.(txt|md|html?|csv|json)$/i.test(f.name)) { $('#attached').textContent = '텍스트 파일만 첨부할 수 있습니다.'; return; }
      var r = new FileReader();
      r.onload = function () { S.attach = String(r.result).slice(0, 20000); $('#attached').textContent = '첨부: ' + f.name; };
      r.readAsText(f);
    });
    $('#mic').addEventListener('click', function () {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { $('#attached').textContent = '이 브라우저는 음성 입력을 지원하지 않습니다.'; return; }
      var r = new SR(); r.lang = 'ko-KR';
      r.onresult = function (e) { q.value = e.results[0][0].transcript; preview(); };
      r.start();
    });

    /* 서류 DB */
    fetch('data/docs.json').then(function (r) { return r.json(); }).then(function (d) {
      DOCS = d;
      var n = d.filter(function (x) { return x.p !== 'issued'; }).length;
      $('#count').textContent = kstLabel(new Date()) + ' 현재, ' + n.toLocaleString('ko-KR') + '건의 ' + LABEL + ' 서류를 작성합니다.';
      var open = null;
      try { open = new URLSearchParams(location.search).get('open'); } catch (e) {}
      if (open) resume(open);
      else if (q.value.trim()) preview();
    }).catch(function () { DOCS = []; $('#count').textContent = kstLabel(new Date()) + ' 현재'; });

    function resume(id) {
      var rec = loadDocs().filter(function (r) { return r.id === id; })[0];
      if (!rec) return;
      var doc = (DOCS || []).filter(function (d) { return d.t === rec.title; })[0] || { t: rec.title, p: '', pid: rec.pid, c: '', d: '', a: [] };
      q.value = rec.title;
      S.id = rec.id; S.locked = true; S.md = rec.md; S.vals = rec.vals || {}; S.pdv = {}; S.stage = rec.stage;
      setCur(doc, [], true);
      drawBody(rec.md);
      docEl.dataset.done = '1';
    }
  }

  function initMyDocs() {
    var listEl = $('#list'), sortEl = $('#sort');
    function fmt(ts) {
      var k = new Date(ts + 9 * 3600 * 1000), p = function (n) { return (n < 10 ? '0' : '') + n; };
      return k.getUTCFullYear() + '.' + p(k.getUTCMonth() + 1) + '.' + p(k.getUTCDate()) + ' ' + p(k.getUTCHours()) + ':' + p(k.getUTCMinutes());
    }
    function draw() {
      var list = loadDocs(), s = sortEl.value;
      if (s === 'title') list.sort(function (a, b) { return a.title.localeCompare(b.title, 'ko'); });
      else if (s === 'client') list.sort(function (a, b) { return (a.client || '힣').localeCompare(b.client || '힣', 'ko') || b.ts - a.ts; });
      else list.sort(function (a, b) { return b.ts - a.ts; });
      if (!list.length) { listEl.innerHTML = '<li class="empty">작성한 서류가 없습니다.</li>'; return; }
      listEl.innerHTML = list.map(function (r) {
        return '<li class="row" data-id="' + esc(r.id) + '"><div class="info"><div class="t">' + esc(r.title) + '</div><div class="m">' +
          esc(r.client || '환자 미기재') + ' · ' + fmt(r.ts) + ' · ' + esc(r.stage || '') + '</div></div>' +
          '<a class="btn sm" href="index.html?open=' + encodeURIComponent(r.id) + '">열기</a>' +
          '<button type="button" class="btn sm line" data-del="' + esc(r.id) + '">삭제</button></li>';
      }).join('');
    }
    sortEl.addEventListener('change', draw);
    listEl.addEventListener('click', function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-del');
      if (!id || !confirm('이 서류를 삭제할까요?')) return;
      storeDocs(loadDocs().filter(function (r) { return r.id !== id; }));
      draw();
    });
    draw();
  }

  function initSettings() {
    var wrap = $('#cards');
    var cur = NaviTheme.get();
    $$('.card', wrap).forEach(function (c) {
      c.setAttribute('aria-checked', c.getAttribute('data-t') === cur ? 'true' : 'false');
      c.addEventListener('click', function () {
        if (NaviTheme.set(c.getAttribute('data-t'))) location.href = 'index.html';
      });
    });
  }

  root.NaviDoctor.chrome = chrome;
  root.NaviDoctor.initPanels = initPanels;
  root.NaviDoctor.initHome = initHome;
  root.NaviDoctor.initMyDocs = initMyDocs;
  root.NaviDoctor.initSettings = initSettings;
})(typeof window !== 'undefined' ? window : globalThis);
