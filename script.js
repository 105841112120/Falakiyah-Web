// state
var state = {
  prayerTimes: null,
  hijriDate: null,
  methodName: '',
  locationName: 'Jakarta, Indonesia',
  lat: -6.2088,
  lng: 106.8456,
  isGPS: false,
  loading: false,
  error: null,
  selectedDate: todayStr(),
  nextPrayer: null,
  now: new Date(),
  formOpen: false,
  currentPage: 'beranda',
};

// ─── Kiblat globals ─────────────────────────────────────────
var KAABA = { lat: 21.4225, lng: 39.8262 };
var kiblatBearing = null;
var kiblatFormOpen = false;
var compassRotation = 0;
var compassDragging = false;
var compassDragStartAngle = 0;
var compassDragStartRotation = 0;
var leafletMap = null;
var mapUserMarker = null;
var mapKiblatLine = null;
var kiblatMapReady = false;

// ─── Init ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  buildLogoRays();
  setupDateInput();
  syncThemeIcons();
  startClock();

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('gpsBtn').addEventListener('click', requestGPS);
  document.getElementById('retryBtn').addEventListener('click', fetchFallback);
  document.getElementById('formToggle').addEventListener('click', toggleForm);
  document.getElementById('citySelect').addEventListener('change', onCitySelect);
  document.getElementById('submitLocation').addEventListener('click', onSubmitLocation);
  document.getElementById('kiblatGpsBtn').addEventListener('click', requestKiblatGPS);
  document.getElementById('kiblatFormToggle').addEventListener('click', toggleKiblatForm);
  document.getElementById('kiblatCitySelect').addEventListener('change', onKiblatCitySelect);
  document.getElementById('kiblatSubmit').addEventListener('click', onKiblatSubmit);
  document.getElementById('ctaWaktuSholat').addEventListener('click', function() {
    switchPage('waktu-sholat');
  });

  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      switchPage(this.getAttribute('data-page'));
    });
  });

  fetchFallback();
});

// ─── Page switching ──────────────────────────────────────

function switchPage(name) {
  state.currentPage = name;

  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-page') === name);
  });

  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.toggle('hidden', p.id !== 'page-' + name);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'arah-kiblat') {
    setupCompassCanvas();
    updateKiblat();
    initKiblatMap();
  }
}

// ─── Logo rays ───────────────────────────────────────────

function buildLogoRays() {
  buildRaysInto('rays', 24, 13, 21);
  buildRaysInto('hero-rays', 32, 17, 28);
}

function buildRaysInto(id, cx, r1, r2) {
  var g = document.getElementById(id);
  if (!g) return;
  for (var i = 0; i < 12; i++) {
    var angle = (i * 30 * Math.PI) / 180;
    var x1 = cx + r1 * Math.cos(angle);
    var y1 = cx + r1 * Math.sin(angle);
    var x2 = cx + r2 * Math.cos(angle);
    var y2 = cx + r2 * Math.sin(angle);
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke-width', cx === 24 ? '2.2' : '3');
    line.setAttribute('stroke-linecap', 'round');
    line.classList.add('logo-ray');
    g.appendChild(line);
  }
}

// ─── Theme ───────────────────────────────────────────────

(function initTheme() {
  var saved = localStorage.getItem('theme');
  if (saved === 'light') document.documentElement.classList.remove('dark');
})();

function toggleTheme() {
  var html = document.documentElement;
  if (html.classList.contains('dark')) {
    html.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  } else {
    html.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }
  syncThemeIcons();
  if (state.currentPage === 'arah-kiblat') drawCompass();
}

function syncThemeIcons() {
  var isDark = document.documentElement.classList.contains('dark');
  document.getElementById('iconSun').style.display  = isDark ? 'block' : 'none';
  document.getElementById('iconMoon').style.display = isDark ? 'none'  : 'block';
}

// ─── Clock ───────────────────────────────────────────────

function startClock() {
  function tick() {
    state.now = new Date();
    var h = pad(state.now.getHours());
    var m = pad(state.now.getMinutes());
    var s = pad(state.now.getSeconds());
    document.getElementById('liveClock').textContent = h + ':' + m + ':' + s;
    updateDateDisplay();
    if (state.prayerTimes) {
      updateCountdown();
      refreshCardStates();
    }
  }
  tick();
  setInterval(tick, 1000);
}

function updateDateDisplay() {
  var opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  document.getElementById('dateDisplay').textContent =
    state.now.toLocaleDateString('id-ID', opts);
}

// ─── Date input default ──────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function setupDateInput() {
  document.getElementById('inputDate').value = state.selectedDate;
}

// ─── API calls ───────────────────────────────────────────

function fetchFallback() {
  setLoading(true);
  clearError();
  fetch('https://api.aladhan.com/v1/timingsByCity?city=Jakarta&country=Indonesia&method=20')
    .then(function(r) {
      if (!r.ok) throw new Error('Gagal mengambil data waktu sholat');
      return r.json();
    })
    .then(function(json) {
      processResponse(json.data);
      state.locationName = 'Jakarta, Indonesia';
      state.lat = -6.2088;
      state.lng = 106.8456;
      state.isGPS = false;
      renderAll();
      updateKiblat();
    })
    .catch(function(err) {
      showError(err.message || 'Terjadi kesalahan');
    })
    .finally(function() { setLoading(false); });
}

function fetchByCoords(lat, lng, dateStr, cityName) {
  setLoading(true);
  clearError();
  var parts = dateStr ? dateStr.split('-') : null;
  var apiDate = parts ? parts[2] + '-' + parts[1] + '-' + parts[0] : Math.floor(Date.now() / 1000);
  var url = 'https://api.aladhan.com/v1/timings/' + apiDate +
            '?latitude=' + lat + '&longitude=' + lng + '&method=20';
  fetch(url)
    .then(function(r) {
      if (!r.ok) throw new Error('Gagal mengambil data waktu sholat');
      return r.json();
    })
    .then(function(json) {
      processResponse(json.data);
      state.locationName = cityName || (lat.toFixed(4) + ', ' + lng.toFixed(4));
      state.lat = lat;
      state.lng = lng;
      state.isGPS = false;
      renderAll();
      updateKiblat();
    })
    .catch(function(err) { showError(err.message || 'Terjadi kesalahan'); })
    .finally(function() { setLoading(false); });
}

function requestGPS() {
  if (!navigator.geolocation) { showError('Browser Anda tidak mendukung GPS'); return; }
  setLoading(true);
  clearError();
  document.getElementById('gpsBtn').disabled = true;
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      var ts  = Math.floor(Date.now() / 1000);
      fetch('https://api.aladhan.com/v1/timings/' + ts + '?latitude=' + lat + '&longitude=' + lng + '&method=20')
        .then(function(r) {
          if (!r.ok) throw new Error('Gagal mengambil data waktu sholat');
          return r.json();
        })
        .then(function(json) {
          processResponse(json.data);
          state.isGPS = true;
          state.lat = lat;
          state.lng = lng;
          return fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng)
            .then(function(gr) { return gr.ok ? gr.json() : null; })
            .then(function(geo) {
              if (geo && geo.address) {
                var city = geo.address.city || geo.address.town || geo.address.county || geo.address.state || 'Lokasi Terkini';
                state.locationName = city + ', ' + (geo.address.country || 'Indonesia');
              } else {
                state.locationName = 'Lokasi Terkini';
              }
            })
            .catch(function() { state.locationName = 'Lokasi Terkini'; });
        })
        .then(function() { renderAll(); updateKiblat(); })
        .catch(function(err) { showError(err.message || 'Terjadi kesalahan'); })
        .finally(function() {
          setLoading(false);
          document.getElementById('gpsBtn').disabled = false;
        });
    },
    function(err) {
      setLoading(false);
      document.getElementById('gpsBtn').disabled = false;
      var msgs = { 1: 'Izin lokasi ditolak', 2: 'Lokasi tidak tersedia', 3: 'Permintaan lokasi habis waktu' };
      showError(msgs[err.code] || 'GPS gagal');
    },
    { timeout: 10000 }
  );
}

// ─── Data processing ─────────────────────────────────────

function processResponse(data) {
  var t = data.timings;
  state.prayerTimes = {
    Imsak:   strip(t.Imsak),
    Subuh:   strip(t.Fajr),
    Terbit:  strip(t.Sunrise),
    Dzuhur:  strip(t.Dhuhr),
    Ashar:   strip(t.Asr),
    Maghrib: strip(t.Maghrib),
    Isya:    strip(t.Isha),
  };
  state.hijriDate  = data.date ? data.date.hijri : null;
  state.methodName = (data.meta && data.meta.method) ? data.meta.method.name : '';
  state.nextPrayer = calcNextPrayer();
}

function strip(s) { return s ? s.split(' ')[0] : s; }

function calcNextPrayer() {
  if (!state.prayerTimes) return null;
  var list = prayerList();
  var cur  = state.now.getHours() * 60 + state.now.getMinutes() + state.now.getSeconds() / 60;
  for (var i = 0; i < list.length; i++) {
    var mins = toMins(list[i].time);
    if (mins > cur) return { name: list[i].name, time: list[i].time, isTomorrow: false };
  }
  return { name: list[1].name, time: list[1].time, isTomorrow: true };
}

function prayerList() {
  var pt = state.prayerTimes;
  return [
    { name: 'Imsak',   time: pt.Imsak },
    { name: 'Subuh',   time: pt.Subuh },
    { name: 'Terbit',  time: pt.Terbit },
    { name: 'Dzuhur',  time: pt.Dzuhur },
    { name: 'Ashar',   time: pt.Ashar },
    { name: 'Maghrib', time: pt.Maghrib },
    { name: 'Isya',    time: pt.Isya },
  ];
}

function toMins(t) {
  var p = t.split(':').map(Number);
  return p[0] * 60 + p[1];
}

// ─── Render all ──────────────────────────────────────────

function renderAll() {
  renderLocation();
  renderPrayerGrid();
  renderHijri();
  renderMethod();
}

function renderPrayerGrid() {
  var grid = document.getElementById('prayerGrid');
  grid.innerHTML = '';
  document.getElementById('errorBox').classList.add('hidden');

  var list = prayerList();
  var cur  = state.now.getHours() * 60 + state.now.getMinutes() + state.now.getSeconds() / 60;

  list.forEach(function(p, i) {
    var isPassed = toMins(p.time) <= cur;
    var isActive = state.nextPrayer && state.nextPrayer.name === p.name;

    var card = document.createElement('div');
    card.className = 'prayer-card' + (isActive ? ' active' : '') + (isPassed && !isActive ? ' passed' : '');
    card.id = 'card-' + p.name;
    card.style.animationDelay = (i * 0.05) + 's';

    var html = '';
    if (isActive) html += '<div class="card-pulse"></div>';
    if (isActive) html += '<div class="card-clock"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>';
    html += '<span class="card-name">' + p.name + '</span>';
    html += '<span class="card-time">' + p.time + '</span>';
    card.innerHTML = html;
    grid.appendChild(card);
  });

  updateCountdown();
}

function refreshCardStates() {
  if (!state.prayerTimes) return;
  var list = prayerList();
  var next = calcNextPrayer();
  state.nextPrayer = next;
  var cur = state.now.getHours() * 60 + state.now.getMinutes() + state.now.getSeconds() / 60;

  list.forEach(function(p) {
    var card = document.getElementById('card-' + p.name);
    if (!card) return;
    var isPassed = toMins(p.time) <= cur;
    var isActive = next && next.name === p.name;

    card.className = 'prayer-card' + (isActive ? ' active' : '') + (isPassed && !isActive ? ' passed' : '');

    var hasPulse = !!card.querySelector('.card-pulse');
    var hasClock = !!card.querySelector('.card-clock');

    if (isActive && !hasPulse) {
      var pulse = document.createElement('div');
      pulse.className = 'card-pulse';
      card.insertBefore(pulse, card.firstChild);
    } else if (!isActive && hasPulse) {
      card.querySelector('.card-pulse').remove();
    }

    if (isActive && !hasClock) {
      var clk = document.createElement('div');
      clk.className = 'card-clock';
      clk.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      card.insertBefore(clk, card.firstChild);
    } else if (!isActive && hasClock) {
      card.querySelector('.card-clock').remove();
    }
  });
}

function updateCountdown() {
  var next = state.nextPrayer;
  if (!next) return;
  var wrap = document.getElementById('countdownWrap');
  wrap.style.display = 'flex';
  document.getElementById('countdownLabel').textContent = 'Menunggu ' + next.name;

  var now    = state.now;
  var parts  = next.time.split(':').map(Number);
  var target = new Date(now);
  target.setHours(parts[0], parts[1], 0, 0);
  if (next.isTomorrow || target.getTime() < now.getTime()) target.setDate(target.getDate() + 1);

  var diff = Math.max(0, target.getTime() - now.getTime());
  document.getElementById('cdHours').textContent = pad(Math.floor(diff / 3600000));
  document.getElementById('cdMins').textContent  = pad(Math.floor((diff % 3600000) / 60000));
  document.getElementById('cdSecs').textContent  = pad(Math.floor((diff % 60000) / 1000));
}

function renderLocation() {
  document.getElementById('locationName').textContent = state.locationName;
  var icon = document.getElementById('locIcon');
  icon.innerHTML = state.isGPS
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
}

function renderHijri() {
  var el = document.getElementById('hijriDisplay');
  if (state.hijriDate) {
    el.textContent = state.hijriDate.day + ' ' + state.hijriDate.month.en + ' ' + state.hijriDate.year + ' H';
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

function renderMethod() {
  var el = document.getElementById('methodInfo');
  el.textContent = state.methodName ? 'Metode: ' + state.methodName : '';
}

// ─── Loading / error ─────────────────────────────────────

function setLoading(on) {
  state.loading = on;
  document.getElementById('gpsBtn').disabled = on;
  document.getElementById('submitLocation').disabled = on;
  document.getElementById('submitLabel').textContent = on ? 'Memuat...' : 'Tampilkan Jadwal';

  if (on && !state.prayerTimes) {
    var grid = document.getElementById('prayerGrid');
    grid.innerHTML = '';
    for (var i = 0; i < 7; i++) {
      var s = document.createElement('div');
      s.className = 'card-skeleton';
      grid.appendChild(s);
    }
    document.getElementById('countdownWrap').style.display = 'none';
  }
}

function showError(msg) {
  state.error = msg;
  document.getElementById('errorMsg').textContent = msg;
  document.getElementById('errorBox').classList.remove('hidden');
  document.getElementById('prayerGrid').innerHTML = '';
  document.getElementById('countdownWrap').style.display = 'none';
}

function clearError() {
  state.error = null;
  document.getElementById('errorBox').classList.add('hidden');
}

// ─── Location form ───────────────────────────────────────

function toggleForm() {
  state.formOpen = !state.formOpen;
  var form  = document.getElementById('locationForm');
  var label = document.getElementById('formToggleLabel');
  if (state.formOpen) {
    form.classList.remove('hidden');
    label.textContent = 'Tutup';
    document.getElementById('countdownWrap').style.display = 'none';
  } else {
    form.classList.add('hidden');
    label.textContent = 'Atur Lokasi';
    if (state.nextPrayer) document.getElementById('countdownWrap').style.display = 'flex';
  }
}

function onCitySelect() {
  var val = this.value;
  if (!val) {
    document.getElementById('inputLat').value = '';
    document.getElementById('inputLng').value = '';
    document.getElementById('inputTz').value  = '7';
    return;
  }
  var p = val.split(',');
  document.getElementById('inputLat').value = p[1];
  document.getElementById('inputLng').value = p[2];
  document.getElementById('inputTz').value  = p[3];
  clearFieldErrors();
}

function onSubmitLocation() {
  clearFieldErrors();
  var latVal  = document.getElementById('inputLat').value.trim();
  var lngVal  = document.getElementById('inputLng').value.trim();
  var tzVal   = document.getElementById('inputTz').value.trim();
  var dateVal = document.getElementById('inputDate').value;
  var lat = parseFloat(latVal), lng = parseFloat(lngVal), tz = parseInt(tzVal, 10);
  var hasErr = false;

  if (latVal === '' || isNaN(lat) || lat < -90  || lat > 90)   { showFieldErr('errLat',  'Lintang harus antara -90 dan 90'); hasErr = true; }
  if (lngVal === '' || isNaN(lng) || lng < -180 || lng > 180)  { showFieldErr('errLng',  'Bujur harus antara -180 dan 180'); hasErr = true; }
  if (tzVal  === '' || isNaN(tz)  || tz  < -12  || tz  > 14)   { showFieldErr('errTz',   'Zona waktu tidak valid'); hasErr = true; }
  if (!dateVal) { showFieldErr('errDate', 'Pilih tanggal'); hasErr = true; }
  if (hasErr) return;

  var sel      = document.getElementById('citySelect');
  var cityName = sel.value ? sel.options[sel.selectedIndex].text : null;
  state.selectedDate = dateVal;
  if (state.formOpen) toggleForm();
  fetchByCoords(lat, lng, dateVal, cityName);
}

function showFieldErr(id, msg) {
  var el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
}

function clearFieldErrors() {
  ['errLat','errLng','errTz','errDate'].forEach(function(id) {
    var el = document.getElementById(id);
    el.textContent = '';
    el.classList.remove('show');
  });
}

// ─── Utils ───────────────────────────────────────────────

function pad(n) { return n < 10 ? '0' + n : '' + n; }

// ═══════════════════════════════════════════════════════════
//  ARAH KIBLAT
// ═══════════════════════════════════════════════════════════

// ─── Calculation ─────────────────────────────────────────

function calcKiblatBearing(lat, lng) {
  var lat1  = lat * Math.PI / 180;
  var lat2  = KAABA.lat * Math.PI / 180;
  var dLng  = (KAABA.lng - lng) * Math.PI / 180;
  var y     = Math.sin(dLng) * Math.cos(lat2);
  var x     = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  var brng  = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return Math.round(brng * 10) / 10;
}

function calcKiblatDistance(lat, lng) {
  var R    = 6371;
  var dLat = (KAABA.lat - lat) * Math.PI / 180;
  var dLng = (KAABA.lng - lng) * Math.PI / 180;
  var lat1 = lat * Math.PI / 180;
  var lat2 = KAABA.lat * Math.PI / 180;
  var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
             Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function bearingToCardinal(b) {
  var dirs = ['Utara','Timur Laut','Timur','Tenggara','Selatan','Barat Daya','Barat','Barat Laut'];
  return dirs[Math.round(b / 45) % 8];
}

// ─── Master update ───────────────────────────────────────

function updateKiblat() {
  var lat = state.lat, lng = state.lng;
  kiblatBearing = calcKiblatBearing(lat, lng);
  var dist      = calcKiblatDistance(lat, lng);

  // Stat cards
  var bEl = document.getElementById('kiblatBearingText');
  var dEl = document.getElementById('kiblatDistanceText');
  if (bEl) bEl.textContent = kiblatBearing;
  if (dEl) dEl.textContent = dist.toLocaleString('id-ID');
  renderKiblatLocation();

  // Compass hint
  updateCompassHint();

  // Guidance text
  var gEl = document.getElementById('kiblatGuideText');
  if (gEl) gEl.innerHTML = buildGuideText(kiblatBearing, dist);

  // Compass redraw (only if canvas exists / page is visible)
  drawCompass();

  // Map update (only if already initialized)
  if (leafletMap) updateKiblatMap();
}

// ─── Compass canvas setup ────────────────────────────────

function setupCompassCanvas() {
  var canvas = document.getElementById('compassCanvas');
  if (!canvas || canvas._kiblatReady) return;
  canvas._kiblatReady = true;

  var SIZE = 280;
  var dpr  = window.devicePixelRatio || 1;
  canvas.width  = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width  = SIZE + 'px';
  canvas.style.height = SIZE + 'px';

  setupCompassDrag(canvas);
  drawCompass();
}

// ─── Compass draw ────────────────────────────────────────

function drawCompass() {
  var canvas = document.getElementById('compassCanvas');
  if (!canvas) return;
  var ctx  = canvas.getContext('2d');
  var SIZE = 280;
  var dpr  = window.devicePixelRatio || 1;
  var cx   = SIZE / 2, cy = SIZE / 2;
  var R    = SIZE * 0.44;
  var dark = document.documentElement.classList.contains('dark');

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);

  ctx.save();
  ctx.translate(cx, cy);

  // Background disc
  var grad = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
  if (dark) {
    grad.addColorStop(0, 'hsl(152,38%,14%)');
    grad.addColorStop(1, 'hsl(152,28%,9%)');
  } else {
    grad.addColorStop(0, 'hsl(152,22%,98%)');
    grad.addColorStop(1, 'hsl(152,16%,90%)');
  }
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // ── Rotating disc ──
  ctx.save();
  ctx.rotate(compassRotation * Math.PI / 180);

  // Tick marks
  for (var deg = 0; deg < 360; deg += 5) {
    var rad    = deg * Math.PI / 180;
    var isCard = deg % 90 === 0;
    var isOrd  = deg % 45 === 0 && !isCard;
    var isMaj  = deg % 30 === 0 && !isCard && !isOrd;
    var inner  = R * (isCard ? 0.76 : isOrd ? 0.80 : isMaj ? 0.84 : 0.87);
    var outer  = R * 0.94;
    var sn = Math.sin(rad), cs = Math.cos(rad);
    ctx.beginPath();
    ctx.moveTo(inner * sn, -inner * cs);
    ctx.lineTo(outer * sn, -outer * cs);
    ctx.strokeStyle = isCard
      ? 'hsl(43,72%,55%)'
      : (dark ? 'hsla(150,15%,65%,0.45)' : 'hsla(152,30%,25%,0.30)');
    ctx.lineWidth = isCard ? 2.5 : isOrd ? 1.5 : 1;
    ctx.stroke();
  }

  // Degree numbers at every 30° (skip cardinal positions)
  for (var d30 = 0; d30 < 360; d30 += 30) {
    if (d30 % 90 === 0) continue;
    var a30 = d30 * Math.PI / 180;
    var rx  = R * 0.68 * Math.sin(a30);
    var ry  = -R * 0.68 * Math.cos(a30);
    ctx.save();
    ctx.translate(rx, ry);
    ctx.font = '8.5px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dark ? 'hsla(150,15%,62%,0.65)' : 'hsla(152,28%,28%,0.50)';
    ctx.fillText(d30 + '°', 0, 0);
    ctx.restore();
  }

  // Cardinal / ordinal labels
  var labels = ['N','NE','E','SE','S','SW','W','NW'];
  labels.forEach(function(lbl, i) {
    var a   = i * 45 * Math.PI / 180;
    var r   = R * 0.60;
    var isN = lbl === 'N';
    var isC = lbl.length === 1;
    ctx.save();
    ctx.translate(r * Math.sin(a), -r * Math.cos(a));
    ctx.font = (isC ? 'bold 15px' : 'bold 10px') + ' Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isN
      ? 'hsl(0,78%,60%)'
      : (dark ? 'hsl(150,12%,78%)' : 'hsl(152,38%,22%)');
    ctx.fillText(lbl, 0, 0);
    ctx.restore();
  });

  // Kiblat marker on disc
  if (kiblatBearing !== null) {
    var kRad = kiblatBearing * Math.PI / 180;
    ctx.save();
    ctx.rotate(kRad);

    var tip  = -R * 0.52;
    var base = -R * 0.28;

    // Shaft
    ctx.beginPath();
    ctx.moveTo(0, base);
    ctx.lineTo(0, tip + 16);
    ctx.strokeStyle = 'hsl(43,90%,54%)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(0, tip);
    ctx.lineTo(-9, tip + 18);
    ctx.lineTo(9, tip + 18);
    ctx.closePath();
    ctx.fillStyle = 'hsl(43,90%,54%)';
    ctx.fill();

    // Small Ka'bah square at tip
    ctx.fillStyle = 'hsl(43,90%,54%)';
    ctx.fillRect(-4.5, tip - 9, 9, 9);

    // "KIBLAT" label near base
    ctx.font = 'bold 8px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'hsl(43,90%,54%)';
    ctx.fillText('KIBLAT', 0, base + 6);

    ctx.restore();
  }

  ctx.restore(); // end rotating disc

  // Fixed: reference chevron at top (inside rim)
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.97);
  ctx.lineTo(-6, -R * 0.86);
  ctx.lineTo(6, -R * 0.86);
  ctx.closePath();
  ctx.fillStyle = dark ? 'hsl(152,50%,62%)' : 'hsl(152,52%,28%)';
  ctx.fill();

  // Center pin
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fillStyle = 'hsl(43,80%,50%)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fillStyle = dark ? 'hsl(152,30%,11%)' : 'white';
  ctx.fill();

  ctx.restore(); // end translate
}

// ─── Compass drag ────────────────────────────────────────

function setupCompassDrag(canvas) {
  function pointerAngle(e) {
    var rect = canvas.getBoundingClientRect();
    var cx   = rect.left + rect.width / 2;
    var cy   = rect.top + rect.height / 2;
    var px   = e.touches ? e.touches[0].clientX : e.clientX;
    var py   = e.touches ? e.touches[0].clientY : e.clientY;
    return Math.atan2(px - cx, cy - py) * 180 / Math.PI;
  }

  function onStart(e) {
    e.preventDefault();
    compassDragging          = true;
    compassDragStartAngle    = pointerAngle(e);
    compassDragStartRotation = compassRotation;
  }

  function onMove(e) {
    if (!compassDragging) return;
    e.preventDefault();
    compassRotation = compassDragStartRotation + (pointerAngle(e) - compassDragStartAngle);
    drawCompass();
    updateCompassHint();
  }

  function onEnd() { compassDragging = false; }

  canvas.addEventListener('mousedown',  onStart);
  canvas.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('mousemove',  onMove);
  document.addEventListener('touchmove',  onMove, { passive: false });
  document.addEventListener('mouseup',  onEnd);
  document.addEventListener('touchend', onEnd);
}

function updateCompassHint() {
  var el = document.getElementById('compassBearingHint');
  if (!el || kiblatBearing === null) return;
  var dir = bearingToCardinal(kiblatBearing);
  el.textContent = 'Kiblat berada ' + kiblatBearing + '° dari Utara (' + dir + ')';
}

// ─── Guide text ──────────────────────────────────────────

function buildGuideText(bearing, dist) {
  var dir  = bearingToCardinal(bearing);
  var hour = new Date().getHours();
  var txt  = 'Kiblat dari lokasi ini berada di arah <strong>' + dir +
             '</strong>, yaitu <strong>' + bearing + '°</strong> dari Utara geografis ' +
             '(searah jarum jam). Jarak ke Ka\'bah: <strong>' + dist.toLocaleString('id-ID') + ' km</strong>.';

  if (hour >= 5 && hour < 9) {
    var fromEast = ((bearing - 90) + 360) % 360;
    var side = fromEast < 180 ? ('kanan ' + Math.round(fromEast) + '°') : ('kiri ' + Math.round(360 - fromEast) + '°');
    txt += ' <em>Petunjuk pagi: hadap matahari terbit (Timur), lalu belok ' + side + '.</em>';
  } else if (hour >= 17 && hour < 19) {
    var fromWest = ((bearing - 270) + 360) % 360;
    var sideW = fromWest < 180 ? ('kanan ' + Math.round(fromWest) + '°') : ('kiri ' + Math.round(360 - fromWest) + '°');
    txt += ' <em>Petunjuk sore: hadap matahari terbenam (Barat), lalu belok ' + sideW + '.</em>';
  } else if (hour >= 11 && hour < 13) {
    txt += ' <em>Petunjuk siang: bayangan terpendek menunjuk ke Utara — gunakan sebagai patokan arah kompas.</em>';
  } else {
    txt += ' Putar piringan kompas hingga <strong>N</strong> sejajar dengan Utara sebenarnya, lalu ikuti penanda emas.';
  }
  return txt;
}

// ─── Leaflet map ─────────────────────────────────────────

function initKiblatMap() {
  if (kiblatMapReady || !window.L) return;
  kiblatMapReady = true;

  leafletMap = L.map('kiblatMap', { zoomControl: true })
    .setView([state.lat, state.lng], 4);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(leafletMap);

  // Ka'bah marker
  var kaabaIcon = L.divIcon({
    html: '<div style="width:13px;height:13px;background:hsl(43,90%,52%);border:2px solid white;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
    className: '',
    iconAnchor: [6, 6]
  });
  L.marker([KAABA.lat, KAABA.lng], { icon: kaabaIcon })
    .addTo(leafletMap)
    .bindPopup("<strong>Ka'bah</strong><br>Makkah, Arab Saudi");

  updateKiblatMap();
  setTimeout(function() { leafletMap.invalidateSize(); }, 200);
}

function updateKiblatMap() {
  if (!leafletMap) return;
  var lat = state.lat, lng = state.lng;

  if (mapUserMarker) leafletMap.removeLayer(mapUserMarker);
  if (mapKiblatLine) leafletMap.removeLayer(mapKiblatLine);

  var userIcon = L.divIcon({
    html: '<div style="width:12px;height:12px;background:hsl(152,55%,28%);border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    className: '',
    iconAnchor: [6, 6]
  });
  mapUserMarker = L.marker([lat, lng], { icon: userIcon })
    .addTo(leafletMap)
    .bindPopup('<strong>' + (state.locationName || 'Lokasi Anda') + '</strong>');

  mapKiblatLine = L.polyline([[lat, lng], [KAABA.lat, KAABA.lng]], {
    color: 'hsl(43,88%,52%)',
    weight: 3,
    opacity: 0.85,
    dashArray: '10, 8'
  }).addTo(leafletMap);

  leafletMap.setView([lat, lng], 4);
}

// ─── Kiblat location form ────────────────────────────────

function renderKiblatLocation() {
  var nameEl = document.getElementById('kiblatLocationName');
  var iconEl = document.getElementById('kiblatLocIcon');
  if (nameEl) nameEl.textContent = state.locationName;
  if (iconEl) {
    iconEl.innerHTML = state.isGPS
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  }
}

function toggleKiblatForm() {
  kiblatFormOpen = !kiblatFormOpen;
  var form  = document.getElementById('kiblatLocationForm');
  var label = document.getElementById('kiblatFormToggleLabel');
  if (!form || !label) return;
  if (kiblatFormOpen) {
    form.classList.remove('hidden');
    label.textContent = 'Tutup';
  } else {
    form.classList.add('hidden');
    label.textContent = 'Atur Lokasi';
  }
}

function onKiblatCitySelect() {
  var val = this.value;
  if (!val) {
    document.getElementById('kiblatInputLat').value = '';
    document.getElementById('kiblatInputLng').value = '';
    document.getElementById('kiblatInputTz').value  = '7';
    return;
  }
  var p = val.split(',');
  document.getElementById('kiblatInputLat').value = p[1];
  document.getElementById('kiblatInputLng').value = p[2];
  document.getElementById('kiblatInputTz').value  = p[3];
  clearKiblatFieldErrors();
}

function onKiblatSubmit() {
  clearKiblatFieldErrors();
  var latVal = document.getElementById('kiblatInputLat').value.trim();
  var lngVal = document.getElementById('kiblatInputLng').value.trim();
  var tzVal  = document.getElementById('kiblatInputTz').value.trim();
  var lat = parseFloat(latVal), lng = parseFloat(lngVal), tz = parseInt(tzVal, 10);
  var hasErr = false;

  if (latVal === '' || isNaN(lat) || lat < -90  || lat > 90)  { showKiblatFieldErr('kiblatErrLat', 'Lintang harus antara -90 dan 90'); hasErr = true; }
  if (lngVal === '' || isNaN(lng) || lng < -180 || lng > 180) { showKiblatFieldErr('kiblatErrLng', 'Bujur harus antara -180 dan 180'); hasErr = true; }
  if (tzVal  === '' || isNaN(tz)  || tz  < -12  || tz  > 14)  { showKiblatFieldErr('kiblatErrTz',  'Zona waktu tidak valid'); hasErr = true; }
  if (hasErr) return;

  var sel      = document.getElementById('kiblatCitySelect');
  var cityName = sel.value ? sel.options[sel.selectedIndex].text : (lat.toFixed(4) + ', ' + lng.toFixed(4));

  state.lat          = lat;
  state.lng          = lng;
  state.locationName = cityName;
  state.isGPS        = false;

  if (kiblatFormOpen) toggleKiblatForm();
  updateKiblat();
}

function requestKiblatGPS() {
  if (!navigator.geolocation) { return; }
  var btn = document.getElementById('kiblatGpsBtn');
  if (btn) btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      state.lat   = lat;
      state.lng   = lng;
      state.isGPS = true;

      fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng)
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(geo) {
          if (geo && geo.address) {
            var city = geo.address.city || geo.address.town || geo.address.county || geo.address.state || 'Lokasi Terkini';
            state.locationName = city + ', ' + (geo.address.country || '');
          } else {
            state.locationName = 'Lokasi Terkini';
          }
        })
        .catch(function() { state.locationName = 'Lokasi Terkini'; })
        .then(function() {
          if (kiblatFormOpen) toggleKiblatForm();
          updateKiblat();
          if (btn) btn.disabled = false;
        });
    },
    function() {
      if (btn) btn.disabled = false;
    },
    { timeout: 10000 }
  );
}

function showKiblatFieldErr(id, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function clearKiblatFieldErrors() {
  ['kiblatErrLat','kiblatErrLng','kiblatErrTz'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.classList.remove('show');
  });
}
