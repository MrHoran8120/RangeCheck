(() => {
  const form = document.getElementById('entryForm');
  const dt = document.getElementById('dt');
  const odo = document.getElementById('odometer');
  const pr = document.getElementById('predictedRange');
  const soc = document.getElementById('soc');
  const charged = document.getElementById('charged');
  const notes = document.getElementById('notes');
  const latEl = document.getElementById('lat');
  const lngEl = document.getElementById('lng');
  const formMsg = document.getElementById('formMsg');
  const pendingList = document.getElementById('pendingList');
  const recentList = document.getElementById('recentList');
  const syncBtn = document.getElementById('syncBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const installBtn = document.getElementById('installBtn');
  const tabNew = document.getElementById('tabNew');
  const tabPending = document.getElementById('tabPending');
  const tabSettings = document.getElementById('tabSettings');
  const sectionNew = document.getElementById('section-new');
  const sectionPending = document.getElementById('section-pending');
  const sectionRecent = document.getElementById('section-recent');
  const sectionSettings = document.getElementById('section-settings');
  const autoLocToggle = document.getElementById('autoLocToggle');
  const locPermBtn = document.getElementById('locPermBtn');
  const locPermStatus = document.getElementById('locPermStatus');

  let deferredPrompt = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toLocalDateTime(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${y}-${m}-${day}T${h}:${min}`;
  }

  function setOnlineStatus() {
    const online = navigator.onLine;
    statusDot.classList.toggle('online', online);
    statusDot.classList.toggle('offline', !online);
    statusText.textContent = online ? 'Online' : 'Offline';
  }

  async function refreshLists() {
    const pending = await window.RangeDB.listPending();
    pendingList.innerHTML = '';
    for (const p of pending) {
      const li = document.createElement('li');
      li.innerHTML = `<span>#${p.id} • ${new Date(p.createdAt).toLocaleString()} • ${p.odometer} km • ${p.predictedRange} km${p.charged ? ' • Charged' : ''}</span><small>pending</small>`;
      pendingList.appendChild(li);
    }
    const recent = await window.RangeDB.listEntries(20);
    recentList.innerHTML = '';
    for (const r of recent) {
      const li = document.createElement('li');
      const synced = r.synced ? 'synced' : 'local';
      li.innerHTML = `<span>${new Date(r.dt).toLocaleString()} • ${r.odometer} km • ${r.predictedRange} km</span><small>${synced}</small>`;
      recentList.appendChild(li);
    }
  }

  function deviceId() {
    const KEY = 'RANGECHECK_DEVICE_ID';
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.getRandomValues(new Uint32Array(4)).join('-');
      localStorage.setItem(KEY, id);
    }
    return id;
  }

  let watchId = null;
  let lastPos = null;

  async function onSubmit(e) {
    e.preventDefault();
    const now = Date.now();
    const entry = {
      dt: new Date(dt.value ? dt.value : toLocalDateTime(now)).toISOString(),
      odometer: parseFloat(odo.value),
      predictedRange: parseFloat(pr.value),
      soc: soc.value ? parseFloat(soc.value) : null,
      charged: !!charged.checked,
      notes: notes.value || '',
      lat: lastPos ? parseFloat(lastPos.coords.latitude.toFixed(6)) : (latEl.value ? parseFloat(latEl.value) : null),
      lng: lastPos ? parseFloat(lastPos.coords.longitude.toFixed(6)) : (lngEl.value ? parseFloat(lngEl.value) : null),
      deviceId: deviceId()
    };
    if (Number.isNaN(entry.odometer) || Number.isNaN(entry.predictedRange)) {
      formMsg.textContent = 'Please enter valid numbers.';
      return;
    }
    try {
      await window.RangeDB.addEntry(entry);
      formMsg.textContent = 'Saved locally.';
      form.reset();
      dt.value = toLocalDateTime(now);
      await refreshLists();
      window.RangeSync.tryBackgroundSync();
    } catch (err) {
      formMsg.textContent = 'Error saving entry: ' + (err && err.message ? err.message : String(err));
      console.error('Save failed', err);
    }
  }

  async function onSync() {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing…';
    try {
      const res = await window.RangeSync.syncNow();
      formMsg.textContent = `Uploaded ${res.uploaded} entr${res.uploaded === 1 ? 'y' : 'ies'}.`;
      await refreshLists();
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      formMsg.textContent = msg.includes('Failed to fetch')
        ? 'Sync failed: network/CORS (check Apps Script Web App URL & access)'
        : msg;
    } finally {
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync Now';
    }
  }

  function ensureLocationWatcher() {
    const enabled = localStorage.getItem('AUTO_LOC') === '1';
    autoLocToggle && (autoLocToggle.checked = enabled);
    if (!('geolocation' in navigator)) {
      locPermStatus && (locPermStatus.textContent = 'Geolocation not supported');
      return;
    }
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (enabled) {
      watchId = navigator.geolocation.watchPosition((pos) => {
        lastPos = pos;
        latEl.value = pos.coords.latitude.toFixed(6);
        lngEl.value = pos.coords.longitude.toFixed(6);
        locPermStatus && (locPermStatus.textContent = 'Location active');
      }, (err) => {
        locPermStatus && (locPermStatus.textContent = 'Location error: ' + err.message);
      }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    }
  }

  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.hidden = false;
    });
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      installBtn.hidden = true;
      deferredPrompt = null;
    });
  }

  function initSettings() {
    if (autoLocToggle) {
      autoLocToggle.checked = localStorage.getItem('AUTO_LOC') === '1';
      autoLocToggle.addEventListener('change', () => {
        localStorage.setItem('AUTO_LOC', autoLocToggle.checked ? '1' : '0');
        ensureLocationWatcher();
      });
    }
    if (locPermBtn) {
      locPermBtn.addEventListener('click', async () => {
        if (!('geolocation' in navigator)) { locPermStatus.textContent = 'No geolocation available'; return; }
        try {
          locPermStatus.textContent = 'Requesting permission…';
          await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 }));
          locPermStatus.textContent = 'Permission granted';
          ensureLocationWatcher();
        } catch (e) {
          locPermStatus.textContent = 'Permission denied or error';
        }
      });
    }
  }

  function initConnectivity() {
    setOnlineStatus();
    window.addEventListener('online', setOnlineStatus);
    window.addEventListener('offline', setOnlineStatus);
    navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SYNC_REQUEST') onSync();
    });
  }

  function route() {
    const hash = (location.hash || '#new').toLowerCase();
    const show = (el) => el && (el.hidden = false);
    const hide = (el) => el && (el.hidden = true);
    hide(sectionNew); hide(sectionPending); hide(sectionRecent); hide(sectionSettings);
    tabNew && tabNew.classList.remove('active');
    tabPending && tabPending.classList.remove('active');
    tabSettings && tabSettings.classList.remove('active');
    if (hash.startsWith('#pending')) { show(sectionPending); show(sectionRecent); tabPending && tabPending.classList.add('active'); }
    else if (hash.startsWith('#settings')) { show(sectionSettings); tabSettings && tabSettings.classList.add('active'); }
    else { show(sectionNew); show(sectionRecent); tabNew && tabNew.classList.add('active'); }
  }

  function initDefaults() {
    dt.value = toLocalDateTime(Date.now());
  }

  function init() {
    initDefaults();
    initInstallPrompt();
    initSettings();
    initConnectivity();
    form.addEventListener('submit', onSubmit);
    syncBtn.addEventListener('click', onSync);
    ensureLocationWatcher();
    refreshLists();
    window.addEventListener('hashchange', route);
    route();
  }

  window.addEventListener('load', init);
})();
