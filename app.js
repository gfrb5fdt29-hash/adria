/* ==========================================================================
   Senj 2026 PWA – app.js
   Magyar nyelvű, mobil-first útitárs. Adatforrás: ./data.json (38 POI).
   A felület csak kevés, tiszta információt mutat; a technikai és bizonytalan
   mezők háttéradatként maradnak, nyersen sosem jelennek meg.
   ========================================================================== */
(function () {
  'use strict';

  /* ---- localStorage kulcsok (külön kulcsok, nem keverednek) ---- */
  var LS_VIEW = 'senj2026.view';        // utolsó fül + rendezés
  var LS_FAVS = 'senj2026.favorites';
  var LS_VISITED = 'senj2026.visited';
  var LS_PLAN = 'senj2026.plan';

  /* ---- Kategória-leképezés ---- */
  var CATEGORIES = ['rejtett_gyongyszem', 'strand', 'étterem', 'bolt_bevasarlas'];
  var CAT_ICON = {
    rejtett_gyongyszem: '⭐',
    strand: '🌊',
    'étterem': '🍴',
    bolt_bevasarlas: '🛒'
  };

  /* ---- Bizonytalan / ellenőrzésre utaló szövegek szűrése ---- */
  var UNCERTAIN_TOKENS = [
    'ellenőrizendő', 'indulás előtt', 'változhat', 'bizonytalan', 'szezonális',
    'aktuális', 'pontos útvonal', 'nyitvatartás', 'parkolás', 'fizetés',
    'fizetési mód', 'belépő', 'díj', 'étlap alapján'
  ];
  var UNCERTAIN_LEHET = ['belépődíjas lehet', 'díjas lehet', 'szolgáltatási díjas lehet'];

  function isUncertain(text) {
    if (text === null || text === undefined) return true;
    var s = String(text).trim();
    if (!s) return true;
    var t = s.toLowerCase();
    for (var i = 0; i < UNCERTAIN_TOKENS.length; i++) {
      if (t.indexOf(UNCERTAIN_TOKENS[i]) !== -1) return true;
    }
    for (var j = 0; j < UNCERTAIN_LEHET.length; j++) {
      if (t.indexOf(UNCERTAIN_LEHET[j]) !== -1) return true;
    }
    return false;
  }

  /* ---- iOS felismerés (a Google Maps deep linkhez) ---- */
  var IS_IOS = (function () {
    var ua = navigator.userAgent || '';
    var iOSDevice = /iPad|iPhone|iPod/.test(ua);
    var iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return iOSDevice || iPadOS;
  })();

  /* ---- Állapot ---- */
  var state = {
    pois: [],
    byId: {},
    tab: 'rejtett_gyongyszem',
    sort: 'distance',          // 'distance' | 'recommended'
    favorites: loadSet(LS_FAVS),
    visited: loadSet(LS_VISITED),
    plan: loadArray(LS_PLAN),  // sorrendtartó tömb
    userLocation: null         // élő helyzet (a felhasználó saját helye), ha elérhető
  };

  /* ---- DOM hivatkozások ---- */
  var el = {};

  /* ======================================================================
     Segédfüggvények
     ====================================================================== */
  function $(sel, root) { return (root || document).querySelector(sel); }

  function loadSet(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return {};
      var arr = JSON.parse(raw);
      var o = {};
      if (Array.isArray(arr)) { arr.forEach(function (id) { o[id] = true; }); }
      return o;
    } catch (e) { return {}; }
  }
  function loadArray(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function saveSet(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(Object.keys(obj))); } catch (e) {}
  }
  function saveArray(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
  }
  function saveView() {
    try { localStorage.setItem(LS_VIEW, JSON.stringify({ tab: state.tab, sort: state.sort })); } catch (e) {}
  }
  function loadView() {
    try {
      var raw = localStorage.getItem(LS_VIEW);
      if (!raw) return;
      var v = JSON.parse(raw);
      if (v && CATEGORIES.indexOf(v.tab) !== -1) state.tab = v.tab;
      if (v && (v.sort === 'distance' || v.sort === 'recommended')) state.sort = v.sort;
    } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Megjelenített név – strandok magyarosítása (csak kijelzésre) */
  function displayName(poi) {
    if (poi.category === 'strand') {
      if (/^Plaža\s+/.test(poi.name)) {
        return poi.name.replace(/^Plaža\s+/, '').trim() + ' strand';
      }
      if (/Draga$/.test(poi.name)) {
        return poi.name + ' – öböl';
      }
      return poi.name;
    }
    return poi.name;
  }

  /* Távolság magyaros formázása */
  function fmtDistance(km) {
    if (km === null || km === undefined || isNaN(km)) return '';
    if (km < 10) {
      return (Math.round(km * 10) / 10).toFixed(1).replace('.', ',') + ' km';
    }
    return String(Math.round(km)) + ' km';
  }

  /* ---- Élő távolság a felhasználó saját helyétől ---- */
  /* Légvonalbeli (haversine) távolság km-ben. */
  function haversineKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    function toRad(d) { return d * Math.PI / 180; }
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var s1 = Math.sin(dLat / 2);
    var s2 = Math.sin(dLng / 2);
    var a = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  /* A POI élő távolsága a felhasználó helyétől, ha mindkettő ismert. */
  function liveDistanceKm(poi) {
    var loc = state.userLocation;
    if (!loc) return null;
    var g = poi.gps;
    if (!g || typeof g.lat !== 'number' || typeof g.lng !== 'number') return null;
    return haversineKm(loc.lat, loc.lng, g.lat, g.lng);
  }
  /* Megjelenítéshez és rendezéshez használt távolság:
     ha van élő helyzet, onnan számolunk; különben az eredeti (szállás-alapú) érték. */
  function effectiveDistanceKm(poi) {
    var live = liveDistanceKm(poi);
    if (live !== null && !isNaN(live)) return live;
    return (typeof poi.distance_one_way_km === 'number') ? poi.distance_one_way_km : 0;
  }
  /* A már kirenderelt kártyák távolságszámának frissítése helyben (átrendezés nélkül). */
  function refreshDistanceTexts() {
    if (!el.poiList) return;
    var cards = el.poiList.querySelectorAll('.card');
    cards.forEach(function (card) {
      var poi = state.byId[card.getAttribute('data-id')];
      if (!poi) return;
      var span = card.querySelector('.m-dist');
      if (span) span.textContent = fmtDistance(effectiveDistanceKm(poi));
    });
  }
  /* Helymeghatározás indítása: a távolságok a felhasználó saját helyétől frissülnek. */
  function initLocation() {
    if (!('geolocation' in navigator)) return;
    var firstFix = true;
    var opts = { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 };
    function onPos(pos) {
      if (!pos || !pos.coords) return;
      state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (firstFix) {
        firstFix = false;
        // első helyzet: nyitott kártyát ne zárjunk be, ilyenkor csak a számokat frissítjük
        if (el.poiList.querySelector('.card.is-open')) refreshDistanceTexts();
        else renderList(false);
      } else {
        // mozgás közben csak a számok frissülnek, nincs zavaró átrendezés
        refreshDistanceTexts();
      }
    }
    function onErr() { /* nincs helyadat: marad az eredeti, szállás-alapú távolság */ }
    try {
      navigator.geolocation.watchPosition(onPos, onErr, opts);
    } catch (e) {}
  }

  /* Időtartomány „perc"-ben; 0-t nem mutatunk félrevezetően */
  function fmtMinutes(min, max) {
    var a = (typeof min === 'number') ? min : null;
    var b = (typeof max === 'number') ? max : null;
    if (a === null && b === null) return null;
    if (a !== null && b !== null) {
      if (a === b) { return a > 0 ? a + ' perc' : null; }
      if (a === 0) { return b > 0 ? b + ' perc' : null; }
      return a + '–' + b + ' perc';
    }
    var v = (a !== null) ? a : b;
    return v > 0 ? v + ' perc' : null;
  }

  /* Egyetlen időadat: gyalog csak ha valóban praktikus, különben autó */
  function timeInfo(poi) {
    var d = poi.distance_one_way_km;
    var w = poi.walk_time_minutes;
    var walkEligible = w && (typeof w.max === 'number') && w.max <= 30 &&
      (typeof d === 'number') && d <= 3.5;
    if (walkEligible) {
      var wt = fmtMinutes(w.min, w.max);
      if (wt) return { icon: '🚶', text: wt, walk: true };
    }
    var dr = poi.drive_time_minutes;
    if (dr) {
      var dt = fmtMinutes(dr.min, dr.max);
      if (dt) return { icon: '🚗', text: dt, walk: false };
    }
    return null;
  }

  /* Tartományok szebb gondolatjellel (pl. „30-90 perc" -> „30–90 perc") */
  function prettyRange(s) {
    return String(s).replace(/(\d)\s*-\s*(\d)/g, '$1–$2');
  }

  /* ======================================================================
     Rendezés és szűrés
     ====================================================================== */
  function poisForTab() {
    var list = state.pois.filter(function (p) { return p.category === state.tab; });
    if (state.sort === 'distance') {
      list.sort(function (a, b) {
        return effectiveDistanceKm(a) - effectiveDistanceKm(b);
      });
    } else {
      var prioRank = function (p) {
        if (p.pwa_priority === 'magas') return 0;
        if (p.pwa_priority === 'közepes') return 1;
        return 2;
      };
      list.sort(function (a, b) {
        var pa = prioRank(a), pb = prioRank(b);
        if (pa !== pb) return pa - pb;
        return (a.rank || 9999) - (b.rank || 9999);
      });
    }
    return list;
  }

  /* ======================================================================
     Kártya HTML
     ====================================================================== */
  function detailLines(poi) {
    var lines = [];
    // 1. rövid mondat: main_reason_to_include, fallback best_for
    var reason = !isUncertain(poi.main_reason_to_include) ? poi.main_reason_to_include
      : (!isUncertain(poi.best_for) ? poi.best_for : null);
    if (reason) lines.push('<p class="detail-line">' + escapeHtml(reason) + '</p>');

    // 2. kategóriafüggő praktikus adat
    var practical = null;
    if (poi.category === 'strand' || poi.category === 'rejtett_gyongyszem') {
      if (!isUncertain(poi.recommended_duration)) practical = prettyRange(poi.recommended_duration);
    } else if (poi.category === 'étterem') {
      if (!isUncertain(poi.price_category)) practical = poi.price_category;
    } else if (poi.category === 'bolt_bevasarlas') {
      if (!isUncertain(poi.best_for) && poi.best_for !== reason) practical = poi.best_for;
    }
    if (practical) lines.push('<p class="detail-line muted">' + escapeHtml(practical) + '</p>');

    // 3. Kombináld ezzel – ID-k feloldása megjelenített névre
    var cw = poi.combine_with || [];
    if (cw.length) {
      var names = [];
      for (var i = 0; i < cw.length; i++) {
        var ref = state.byId[cw[i]];
        if (ref) names.push(escapeHtml(displayName(ref)));
      }
      if (names.length) {
        lines.push('<p class="detail-line combine">Kombináld ezzel: <b>' + names.join(', ') + '</b></p>');
      }
    }
    return lines.join('');
  }

  function cardHtml(poi) {
    var name = displayName(poi);
    var ico = CAT_ICON[poi.category] || '📍';
    var dist = fmtDistance(effectiveDistanceKm(poi));
    var ti = timeInfo(poi);

    var meta = '';
    if (dist) meta += '<span class="m-dist">' + dist + '</span>';
    if (ti) {
      if (meta) meta += '<span class="dot" aria-hidden="true"></span>';
      meta += '<span class="m-time">' + ti.icon + ' ' + ti.text + '</span>';
    }

    var isFav = !!state.favorites[poi.id];
    var isVis = !!state.visited[poi.id];
    var inPlan = state.plan.indexOf(poi.id) !== -1;
    var details = detailLines(poi);

    var visitedBadge = isVis
      ? '<div class="visited-badge" data-vis-badge><span aria-hidden="true">✓</span> Már jártatok itt</div>'
      : '';

    return '' +
      '<article class="card enter" data-id="' + poi.id + '" data-cat="' + escapeHtml(poi.category) + '">' +
        '<div class="card-media">' +
          '<img loading="lazy" src="' + escapeHtml(poi.image.local_path) + '" alt="' + escapeHtml(poi.image.alt || name) + '">' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-head" data-toggle>' +
            '<span class="card-cat-ico" aria-hidden="true">' + ico + '</span>' +
            '<div class="card-titles">' +
              '<h3 class="card-title">' + escapeHtml(name) + '</h3>' +
              (meta ? '<div class="card-meta">' + meta + '</div>' : '') +
            '</div>' +
            '<span class="chev" aria-hidden="true">▾</span>' +
          '</div>' +
          (visitedBadge) +
          '<div class="card-details">' +
            '<div class="card-details-inner">' + details + '</div>' +
          '</div>' +
          '<div class="card-actions">' +
            '<button type="button" class="btn btn-route" data-act="route" aria-label="Útvonal Google Maps">Útvonal</button>' +
            '<button type="button" class="btn btn-icon' + (isFav ? ' is-on' : '') + '" data-act="fav" aria-pressed="' + isFav + '" aria-label="Kedvenc">♥</button>' +
            '<button type="button" class="btn btn-icon' + (isVis ? ' is-on' : '') + '" data-act="visited" aria-pressed="' + isVis + '" aria-label="Jártam">✓</button>' +
            '<button type="button" class="btn btn-plan' + (inPlan ? ' is-on' : '') + '" data-act="plan" aria-label="Mai tervhez">' + (inPlan ? 'Mai tervben' : '+ Mai terv') + '</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  /* ======================================================================
     Lista renderelése + belépő stagger
     ====================================================================== */
  function renderList(animate) {
    var list = poisForTab();
    var html = '';
    for (var i = 0; i < list.length; i++) html += cardHtml(list[i]);
    el.poiList.innerHTML = html;

    // képek fade-in
    var imgs = el.poiList.querySelectorAll('.card-media img');
    imgs.forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('is-loaded');
      } else {
        img.addEventListener('load', function () { img.classList.add('is-loaded'); }, { once: true });
        img.addEventListener('error', function () { img.style.display = 'none'; }, { once: true });
      }
    });

    // stagger belépés az első néhány kártyán
    var cards = el.poiList.querySelectorAll('.card');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || animate === false) {
      cards.forEach(function (c) { c.classList.remove('enter'); });
    } else {
      cards.forEach(function (c, idx) {
        var delay = Math.min(idx, 7) * 42; // max ~294ms
        requestAnimationFrame(function () {
          setTimeout(function () {
            c.classList.add('enter-active');
            c.addEventListener('transitionend', function () {
              c.classList.remove('enter', 'enter-active');
            }, { once: true });
          }, delay);
        });
      });
    }
    if (animate !== false) {
      el.poiList.classList.remove('switching');
      void el.poiList.offsetWidth;
      el.poiList.classList.add('switching');
    }
  }

  /* ======================================================================
     Kártya interakciók (delegált)
     ====================================================================== */
  function onListClick(e) {
    var actBtn = e.target.closest('[data-act]');
    var card = e.target.closest('.card');
    if (!card) return;
    var poi = state.byId[card.getAttribute('data-id')];
    if (!poi) return;

    if (actBtn) {
      e.stopPropagation();
      var act = actBtn.getAttribute('data-act');
      if (act === 'route') openRoute(poi);
      else if (act === 'fav') toggleFav(poi, actBtn);
      else if (act === 'visited') toggleVisited(poi, card, actBtn);
      else if (act === 'plan') addToPlan(poi, actBtn);
      return;
    }
    // máshol a kártyán: nyit / zár
    card.classList.toggle('is-open');
  }

  /* press feedback */
  function onPressDown(e) {
    var card = e.target.closest('.card');
    if (card) card.classList.add('is-pressed');
  }
  function onPressUp() {
    var pressed = el.poiList.querySelectorAll('.card.is-pressed');
    pressed.forEach(function (c) { c.classList.remove('is-pressed'); });
  }

  /* ======================================================================
     Google Maps navigáció
     ====================================================================== */
  function openRoute(poi) {
    var web = poi.google_maps_directions_url;
    if (!web) return;
    if (IS_IOS && poi.ios_google_maps_app_directions_url) {
      var ios = poi.ios_google_maps_app_directions_url;
      var done = false;
      function cleanup() {
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('pagehide', onHide);
      }
      function cancel() { if (done) return; done = true; clearTimeout(timer); cleanup(); }
      function onVis() { if (document.hidden) cancel(); }
      function onHide() { cancel(); }
      var timer = setTimeout(function () {
        if (done) return;
        done = true; cleanup();
        window.location.href = web; // fallback a webes útvonalra
      }, 700);
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('pagehide', onHide);
      window.location.href = ios; // Google Maps app megnyitása
    } else {
      window.open(web, '_blank', 'noopener');
    }
  }

  /* ======================================================================
     Kedvenc / Jártam / Mai terv műveletek
     ====================================================================== */
  function toggleFav(poi, btn) {
    if (state.favorites[poi.id]) {
      delete state.favorites[poi.id];
      if (btn) { btn.classList.remove('is-on'); btn.setAttribute('aria-pressed', 'false'); }
      toast('Kedvencekből törölve');
    } else {
      state.favorites[poi.id] = true;
      if (btn) { btn.classList.add('is-on'); btn.setAttribute('aria-pressed', 'true'); }
      toast('Kedvencekhez adva');
    }
    saveSet(LS_FAVS, state.favorites);
    updateHeaderBadges();
    if (isSheetOpen('favSheet')) renderFavSheet();
  }

  function toggleVisited(poi, card, btn) {
    if (state.visited[poi.id]) {
      delete state.visited[poi.id];
      if (btn) { btn.classList.remove('is-on'); btn.setAttribute('aria-pressed', 'false'); }
      var b = card.querySelector('[data-vis-badge]');
      if (b) b.remove();
      toast('Jártam jelölés törölve');
    } else {
      state.visited[poi.id] = true;
      if (btn) { btn.classList.add('is-on'); btn.setAttribute('aria-pressed', 'true'); }
      if (!card.querySelector('[data-vis-badge]')) {
        var head = card.querySelector('.card-head');
        var badge = document.createElement('div');
        badge.className = 'visited-badge pop';
        badge.setAttribute('data-vis-badge', '');
        badge.innerHTML = '<span aria-hidden="true">✓</span> Már jártatok itt';
        head.insertAdjacentElement('afterend', badge);
      }
      toast('Jártamként jelölve');
    }
    saveSet(LS_VISITED, state.visited);
  }

  function addToPlan(poi, btn) {
    if (state.plan.indexOf(poi.id) !== -1) {
      toast('Már szerepel a mai tervben');
      return;
    }
    state.plan.push(poi.id);
    saveArray(LS_PLAN, state.plan);
    if (btn) { btn.classList.add('is-on'); btn.textContent = 'Mai tervben'; }
    updateHeaderBadges();
    toast('Mai tervhez adva');
    if (isSheetOpen('planSheet')) renderPlanSheet();
  }

  function removeFromPlan(id) {
    var idx = state.plan.indexOf(id);
    if (idx !== -1) {
      state.plan.splice(idx, 1);
      saveArray(LS_PLAN, state.plan);
      updateHeaderBadges();
      syncPlanButtons();
      toast('Eltávolítva');
      renderPlanSheet();
    }
  }

  function movePlan(id, dir) {
    var idx = state.plan.indexOf(id);
    if (idx === -1) return;
    var target = idx + dir;
    if (target < 0 || target >= state.plan.length) return;
    var tmp = state.plan[target];
    state.plan[target] = state.plan[idx];
    state.plan[idx] = tmp;
    saveArray(LS_PLAN, state.plan);
    renderPlanSheet(id);
  }

  function clearPlan() {
    state.plan = [];
    saveArray(LS_PLAN, state.plan);
    updateHeaderBadges();
    syncPlanButtons();
    renderPlanSheet();
    toast('Mai terv törölve');
  }

  /* A látható kártyák Mai terv gombjainak frissítése */
  function syncPlanButtons() {
    var cards = el.poiList.querySelectorAll('.card');
    cards.forEach(function (card) {
      var id = card.getAttribute('data-id');
      var btn = card.querySelector('[data-act="plan"]');
      if (!btn) return;
      if (state.plan.indexOf(id) !== -1) { btn.classList.add('is-on'); btn.textContent = 'Mai tervben'; }
      else { btn.classList.remove('is-on'); btn.textContent = '+ Mai terv'; }
    });
  }

  /* ======================================================================
     Fejléc jelzések
     ====================================================================== */
  function updateHeaderBadges() {
    var favCount = Object.keys(state.favorites).length;
    el.favBtn.classList.toggle('has-items', favCount > 0);
    el.planBtn.classList.toggle('has-items', state.plan.length > 0);
  }

  /* ======================================================================
     Toast
     ====================================================================== */
  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    void el.toast.offsetWidth;
    el.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('show');
      setTimeout(function () { el.toast.hidden = true; }, 260);
    }, 1700);
  }

  /* ======================================================================
     Bottom sheetek
     ====================================================================== */
  var lastFocus = null;
  function openSheet(id) {
    var sheet = document.getElementById(id);
    if (!sheet) return;
    lastFocus = document.activeElement;
    if (id === 'favSheet') renderFavSheet();
    if (id === 'planSheet') renderPlanSheet();
    el.overlay.hidden = false;
    void el.overlay.offsetWidth;
    el.overlay.classList.add('show');
    sheet.classList.remove('closing');
    sheet.classList.add('show');
    sheet.setAttribute('aria-hidden', 'false');
    var closeBtn = sheet.querySelector('.sheet-close');
    if (closeBtn) closeBtn.focus();
    document.body.style.overflow = 'hidden';
  }
  function closeSheet(id) {
    var sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.add('closing');
    sheet.classList.remove('show');
    sheet.setAttribute('aria-hidden', 'true');
    el.overlay.classList.remove('show');
    setTimeout(function () {
      el.overlay.hidden = true;
      sheet.classList.remove('closing');
    }, 240);
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function isSheetOpen(id) {
    var s = document.getElementById(id);
    return s && s.classList.contains('show');
  }
  function anySheetOpen() { return isSheetOpen('favSheet') || isSheetOpen('planSheet'); }
  function closeAllSheets() {
    if (isSheetOpen('favSheet')) closeSheet('favSheet');
    if (isSheetOpen('planSheet')) closeSheet('planSheet');
  }

  function sheetRowName(poi) {
    return '<span class="si-ico" aria-hidden="true">' + (CAT_ICON[poi.category] || '📍') + '</span>' +
      '<span class="si-name">' + escapeHtml(displayName(poi)) + '</span>';
  }

  function renderFavSheet() {
    var ids = Object.keys(state.favorites).filter(function (id) { return state.byId[id]; });
    if (!ids.length) {
      el.favBody.innerHTML = '<div class="empty-state"><span class="empty-ico" aria-hidden="true">♡</span>' +
        '<p>Még nincs kedvenc helyed.</p></div>';
      return;
    }
    // a betöltési / kategória sorrend megtartása
    var ordered = state.pois.filter(function (p) { return state.favorites[p.id]; });
    var html = '<div class="sheet-list">';
    ordered.forEach(function (poi) {
      html += '<div class="sheet-item" data-id="' + poi.id + '">' +
        sheetRowName(poi) +
        '<div class="si-actions">' +
          '<button type="button" class="si-btn route" data-sheet-act="route" aria-label="Útvonal">Útvonal</button>' +
          '<button type="button" class="si-btn danger" data-sheet-act="unfav" aria-label="Kedvenc törlése">♥</button>' +
        '</div></div>';
    });
    html += '</div>';
    el.favBody.innerHTML = html;
  }

  function renderPlanSheet(highlightId) {
    if (!state.plan.length) {
      el.planBody.innerHTML = '<div class="empty-state"><span class="empty-ico" aria-hidden="true">🗒️</span>' +
        '<p>Még nincs hely a mai tervben.</p></div>';
      el.planFoot.hidden = true;
      el.planFoot.innerHTML = '';
      return;
    }
    var html = '<div class="sheet-list">';
    for (var i = 0; i < state.plan.length; i++) {
      var poi = state.byId[state.plan[i]];
      if (!poi) continue;
      var up = i === 0 ? ' disabled' : '';
      var down = i === state.plan.length - 1 ? ' disabled' : '';
      var hl = (highlightId && state.plan[i] === highlightId) ? ' moving' : '';
      html += '<div class="sheet-item' + hl + '" data-id="' + poi.id + '">' +
        '<div class="si-order">' +
          '<button type="button" class="si-btn" data-sheet-act="up"' + up + ' aria-label="Feljebb">▲</button>' +
          '<button type="button" class="si-btn" data-sheet-act="down"' + down + ' aria-label="Lejjebb">▼</button>' +
        '</div>' +
        sheetRowName(poi) +
        '<div class="si-actions">' +
          '<button type="button" class="si-btn route" data-sheet-act="route" aria-label="Útvonal">Útvonal</button>' +
          '<button type="button" class="si-btn danger" data-sheet-act="remove" aria-label="Eltávolítás">✕</button>' +
        '</div></div>';
    }
    html += '</div>';
    el.planBody.innerHTML = html;

    el.planFoot.hidden = false;
    el.planFoot.innerHTML = '<button type="button" class="btn-clear" data-plan-clear>Mai terv törlése</button>';
  }

  function onFavSheetClick(e) {
    var btn = e.target.closest('[data-sheet-act]');
    if (!btn) return;
    var row = e.target.closest('.sheet-item');
    if (!row) return;
    var poi = state.byId[row.getAttribute('data-id')];
    if (!poi) return;
    var act = btn.getAttribute('data-sheet-act');
    if (act === 'route') openRoute(poi);
    else if (act === 'unfav') {
      delete state.favorites[poi.id];
      saveSet(LS_FAVS, state.favorites);
      updateHeaderBadges();
      // a háttérben lévő kártya gomb szinkronja
      var card = el.poiList.querySelector('.card[data-id="' + poi.id + '"] [data-act="fav"]');
      if (card) { card.classList.remove('is-on'); card.setAttribute('aria-pressed', 'false'); }
      toast('Kedvencekből törölve');
      renderFavSheet();
    }
  }

  function onPlanSheetClick(e) {
    var clearBtn = e.target.closest('[data-plan-clear]');
    if (clearBtn) { showClearConfirm(); return; }
    var btn = e.target.closest('[data-sheet-act]');
    if (!btn) return;
    var row = e.target.closest('.sheet-item');
    if (!row) return;
    var id = row.getAttribute('data-id');
    var poi = state.byId[id];
    if (!poi) return;
    var act = btn.getAttribute('data-sheet-act');
    if (act === 'route') openRoute(poi);
    else if (act === 'remove') removeFromPlan(id);
    else if (act === 'up') movePlan(id, -1);
    else if (act === 'down') movePlan(id, 1);
  }

  /* Appos mini megerősítés a Mai terv törléséhez (nincs natív confirm) */
  function showClearConfirm() {
    el.planFoot.innerHTML = '<div class="confirm-box">' +
      '<p>Biztosan törlöd a mai tervet?</p>' +
      '<div class="confirm-actions">' +
        '<button type="button" class="c-cancel" data-confirm="cancel">Mégse</button>' +
        '<button type="button" class="c-ok" data-confirm="ok">Törlés</button>' +
      '</div></div>';
    var box = el.planFoot.querySelector('[data-confirm="ok"]');
    if (box) box.focus();
  }
  function onPlanFootClick(e) {
    var c = e.target.closest('[data-confirm]');
    if (!c) return;
    if (c.getAttribute('data-confirm') === 'ok') clearPlan();
    else renderPlanSheet(); // Mégse: visszaáll a normál lábrész
  }

  /* ======================================================================
     Alsó nav + rendezés
     ====================================================================== */
  function setTab(cat) {
    if (state.tab === cat) return;
    state.tab = cat;
    el.nav.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-cat') === cat);
    });
    saveView();
    renderList(true);
    el.content.scrollTop = 0;
    window.scrollTo({ top: 0 });
  }
  function setSort(sort) {
    if (state.sort === sort) return;
    state.sort = sort;
    el.segmented.setAttribute('data-active', sort);
    el.segmented.querySelectorAll('.seg-btn').forEach(function (b) {
      var on = b.getAttribute('data-sort') === sort;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    saveView();
    renderList(true);
  }

  /* ======================================================================
     Offline jelzés
     ====================================================================== */
  function updateOnline() {
    var off = !navigator.onLine;
    el.offline.hidden = false;
    el.offline.classList.toggle('show', off);
    if (!off) {
      setTimeout(function () { if (navigator.onLine) el.offline.hidden = true; }, 320);
    }
  }

  /* ======================================================================
     Fejléc scroll háttér
     ====================================================================== */
  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    el.header.classList.toggle('is-scrolled', y > 6);
  }

  /* ======================================================================
     Init
     ====================================================================== */
  function cacheDom() {
    el.app = $('#app');
    el.header = $('#appHeader');
    el.content = $('#content');
    el.poiList = $('#poiList');
    el.loading = $('#loadingState');
    el.error = $('#errorState');
    el.nav = $('#bottomNav');
    el.segmented = $('#sortControl');
    el.favBtn = $('#favBtn');
    el.planBtn = $('#planBtn');
    el.overlay = $('#sheetOverlay');
    el.favBody = $('#favBody');
    el.planBody = $('#planBody');
    el.planFoot = $('#planFoot');
    el.toast = $('#toast');
    el.offline = $('#offlineBadge');
  }

  function bindEvents() {
    el.poiList.addEventListener('click', onListClick);
    el.poiList.addEventListener('pointerdown', onPressDown);
    el.poiList.addEventListener('pointerup', onPressUp);
    el.poiList.addEventListener('pointercancel', onPressUp);
    el.poiList.addEventListener('pointerleave', onPressUp);

    el.nav.addEventListener('click', function (e) {
      var b = e.target.closest('.nav-btn');
      if (b) setTab(b.getAttribute('data-cat'));
    });
    el.segmented.addEventListener('click', function (e) {
      var b = e.target.closest('.seg-btn');
      if (b) setSort(b.getAttribute('data-sort'));
    });

    el.favBtn.addEventListener('click', function () { openSheet('favSheet'); });
    el.planBtn.addEventListener('click', function () { openSheet('planSheet'); });
    el.overlay.addEventListener('click', closeAllSheets);
    document.querySelectorAll('.sheet-close').forEach(function (b) {
      b.addEventListener('click', function () { closeSheet(b.getAttribute('data-close')); });
    });
    el.favBody.addEventListener('click', onFavSheetClick);
    el.planBody.addEventListener('click', onPlanSheetClick);
    el.planFoot.addEventListener('click', onPlanFootClick);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && anySheetOpen()) closeAllSheets();
    });

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function applyView() {
    // alsó nav aktív
    el.nav.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-cat') === state.tab);
    });
    // segmented aktív
    el.segmented.setAttribute('data-active', state.sort);
    el.segmented.querySelectorAll('.seg-btn').forEach(function (b) {
      var on = b.getAttribute('data-sort') === state.sort;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function start(data) {
    state.pois = (data && Array.isArray(data.pois)) ? data.pois : [];
    state.byId = {};
    state.pois.forEach(function (p) { state.byId[p.id] = p; });
    // tisztítsuk a hivatkozásokat (csak létező POI-k)
    state.plan = state.plan.filter(function (id) { return state.byId[id]; });

    loadView();
    applyView();
    updateHeaderBadges();

    el.loading.hidden = true;
    renderList(true);

    // belépő animáció
    requestAnimationFrame(function () {
      el.app.classList.remove('is-booting');
      el.app.classList.add('is-ready');
    });

    // offline állapot
    if (!navigator.onLine) updateOnline();

    // élő helymeghatározás: a távolságok a felhasználó saját helyétől frissülnek
    initLocation();
  }

  function fail() {
    el.loading.hidden = true;
    el.error.hidden = false;
    el.app.classList.remove('is-booting');
    el.app.classList.add('is-ready');
  }

  function init() {
    cacheDom();
    bindEvents();
    onScroll();
    fetch('./data.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function (data) { start(data); })
      .catch(function () { fail(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
