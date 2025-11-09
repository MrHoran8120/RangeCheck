(() => {
  const KEY_URL = 'GAS_WEB_APP_URL';
  const HARDCODED_URL = (window.APP_CONFIG && window.APP_CONFIG.gasUrl) || '';

  function getUrl() {
    return HARDCODED_URL || localStorage.getItem(KEY_URL) || '';
  }
  function setUrl(url) {
    if (HARDCODED_URL) return; // URL is hard-coded; ignore setter
    if (!url) localStorage.removeItem(KEY_URL);
    else localStorage.setItem(KEY_URL, url);
  }

  async function syncNow() {
    const url = getUrl();
    if (!url) throw new Error('No Apps Script URL set.');
    const pending = await window.RangeDB.listPending();
    if (!pending.length) return { uploaded: 0 };
    const payload = pending.map(p => ({
      id: p.id,
      dt: p.dt,
      odometer: p.odometer,
      predictedRange: p.predictedRange,
      soc: p.soc,
      charged: p.charged,
      notes: p.notes,
      lat: p.lat,
      lng: p.lng,
      deviceId: p.deviceId,
      createdAt: p.createdAt
    }));

    // Use form-encoded to avoid CORS preflight on Apps Script
    const body = 'data=' + encodeURIComponent(JSON.stringify({ entries: payload }));
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!res.ok) throw new Error('Sync failed: HTTP ' + res.status);
    let jsonText = await res.text();
    let json = null;
    try { json = JSON.parse(jsonText); } catch (e) {
      throw new Error('Sync failed: non-JSON response: ' + jsonText.slice(0, 120));
    }
    if (!json || json.ok !== true || !Array.isArray(json.acceptedIds)) {
      throw new Error('Sync failed: unexpected response: ' + JSON.stringify(json).slice(0, 160));
    }
    const acceptedIds = json.acceptedIds;
    await window.RangeDB.markSynced(acceptedIds);
    return { uploaded: acceptedIds.length };
  }

  async function tryBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      try { await reg.sync.register('sync-entries'); } catch {}
    }
  }

  window.RangeSync = { getUrl, setUrl, syncNow, tryBackgroundSync };
})();
