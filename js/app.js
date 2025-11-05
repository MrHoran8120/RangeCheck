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
  const locBtn = document.getElementById('locBtn');
  const formMsg = document.getElementById('formMsg');
  const pendingList = document.getElementById('pendingList');
  const recentList = document.getElementById('recentList');
  const gasUrlEl = document.getElementById('gasUrl');
  const saveUrlBtn = document.getElementById('saveUrlBtn');
  const syncBtn = document.getElementById('syncBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const installBtn = document.getElementById('installBtn');

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
      lat: latEl.value ? parseFloat(latEl.value) : null,
      lng: lngEl.value ? parseFloat(lngEl.value) : null,
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

  async function onLocate() {
    locBtn.disabled = true;
    locBtn.textContent = 'Locating…';
    try {
      if (!('geolocation' in navigator)) throw new Error('No geolocation available');
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      );
      latEl.value = pos.coords.latitude.toFixed(6);
      lngEl.value = pos.coords.longitude.toFixed(6);
      formMsg.textContent = 'Location added';
    } catch (e) {
      formMsg.textContent = 'Location failed';
    } finally {
      locBtn.disabled = false;
      locBtn.textContent = 'Add Location';
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
    gasUrlEl.value = window.RangeSync.getUrl();
    saveUrlBtn.addEventListener('click', () => {
      const url = gasUrlEl.value.trim();
      window.RangeSync.setUrl(url);
      formMsg.textContent = url ? 'Saved Apps Script URL.' : 'Cleared Apps Script URL.';
    });
  }

  function initConnectivity() {
    setOnlineStatus();
    window.addEventListener('online', setOnlineStatus);
    window.addEventListener('offline', setOnlineStatus);
    navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SYNC_REQUEST') onSync();
    });
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
    locBtn.addEventListener('click', onLocate);
    refreshLists();
  }

  window.addEventListener('load', init);
})();
