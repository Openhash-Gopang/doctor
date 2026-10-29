/* 화면 디자인 선택 — <head>에서 먼저 불러 본문이 그려지기 전에 data-theme을 정합니다.
   순서: ① 주소의 ?theme= ② 저장된 navidoctor_theme ③ 기본값 D (직역 사이트에서도 바꾸지 않음) */
(function () {
  var DEFAULT = 'd';
  var OK = ['a', 'b', 'c', 'd', 'e'];
  var KEY = 'navidoctor_theme'; // 저장 키 접미사를 올리면(_v2) 이전 선택이 무시되고 모두 D 로 다시 시작
  var t = null;
  try {
    var m = /[?&]theme=([a-e])(?:&|#|$)/i.exec(location.search);
    if (m) t = m[1].toLowerCase();
  } catch (e) {}
  if (!t) {
    try {
      var s = localStorage.getItem(KEY);
      if (s && OK.indexOf(s) > -1) t = s;
    } catch (e) {}
  }
  if (!t) t = DEFAULT;
  document.documentElement.setAttribute('data-theme', t);
  window.NaviTheme = {
    ok: OK,
    key: KEY,
    get: function () { return document.documentElement.getAttribute('data-theme'); },
    set: function (v) {
      if (OK.indexOf(v) < 0) return false;
      try { localStorage.setItem(KEY, v); } catch (e) {}
      document.documentElement.setAttribute('data-theme', v);
      return true;
    }
  };
})();
