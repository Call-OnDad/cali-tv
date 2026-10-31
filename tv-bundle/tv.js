// Cali TV screen -- deliberately standalone, not wired into the main webapp's
// router/tiles system (that's built for mouse/touch, not a 10-foot D-pad
// screen). Talks to the LAN API directly: this app only ever runs on the
// home network, which the server already trusts without an API key (see
// webapp/js/api.js's own comment on LAN/NetBird being trusted) -- so there's
// no sign-in flow here at all, unlike the phone/tablet builds.
// Set this to your own server's LAN address before building.
const LAN_API = 'http://192.168.1.10:5000';
const REFRESH_MS = 30000;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function getJSON(path) {
  const r = await fetch(LAN_API + path, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

function listOf(data, key) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  return [];
}

function setTile(id, titleText, bodyHtml) {
  document.getElementById(id).innerHTML = `<h2>${esc(titleText)}</h2>${bodyHtml}`;
}

async function refreshAlerts() {
  try {
    const d = await getJSON('/api/alerts/history?limit=30');
    const items = listOf(d, 'alerts').filter(a => ['critical', 'warning'].includes(a.severity)).reverse();
    if (!items.length) { setTile('tile-alerts', 'Alerts', '<div class="empty">Nothing needs attention.</div>'); return; }
    const rows = items.slice(0, 4).map(a => `<div class="row"><span><span class="dot ${a.severity === 'critical' ? 'bad' : 'warn'}"></span>${esc((a.title || '').slice(0, 40))}</span></div>`).join('');
    setTile('tile-alerts', 'Alerts', `<div class="big ${items.some(a => a.severity === 'critical') ? 'bad' : 'warn'}">${items.length}</div>${rows}`);
  } catch (e) {
    setTile('tile-alerts', 'Alerts', `<div class="empty">Unreachable: ${esc(e.message)}</div>`);
  }
}

async function refreshMachine() {
  try {
    const [cts, pulse] = await Promise.all([getJSON('/api/homelab/lxc'), getJSON('/api/pulse/status').catch(() => ({}))]);
    const rows = listOf(cts, 'containers');
    const running = rows.filter(c => c.status === 'running').length;
    const svc = Object.values(pulse || {}).filter(v => v && typeof v === 'object' && 'up' in v);
    const svcUp = svc.filter(v => v.up).length;
    const allOk = running === rows.length && svcUp === svc.length;
    setTile('tile-machine', 'Homelab', `<div class="big ${allOk ? 'ok' : 'warn'}">${running}/${rows.length}</div><div class="row"><span>Containers running</span></div><div class="row"><span>Services up</span><span class="${svcUp === svc.length ? 'ok' : 'warn'}">${svcUp}/${svc.length}</span></div>`);
  } catch (e) {
    setTile('tile-machine', 'Homelab', `<div class="empty">Unreachable: ${esc(e.message)}</div>`);
  }
}

async function refreshWeather() {
  try {
    const w = await getJSON('/api/weather');
    setTile('tile-weather', 'Weather', `<div class="big">${esc(w.temp)}°</div><div class="sub">${esc((w.state || '').trim())} · feels ${esc(w.feels_like)}°</div>`);
  } catch (e) {
    setTile('tile-weather', 'Weather', `<div class="empty">Unreachable: ${esc(e.message)}</div>`);
  }
}

async function refreshCalendar() {
  try {
    const d = await getJSON('/api/calendar/events?count=8');
    const today = new Date().toDateString();
    const evs = listOf(d, 'events').filter(e => { const dt = new Date(e.start); return !isNaN(dt) && dt.toDateString() === today; });
    if (!evs.length) { setTile('tile-calendar', 'Today', '<div class="empty">Nothing on the calendar.</div>'); return; }
    const rows = evs.slice(0, 4).map(e => `<div class="row"><span>${esc((e.summary || '').slice(0, 36))}</span><span class="sub">${e.all_day ? 'all day' : esc(new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</span></div>`).join('');
    setTile('tile-calendar', 'Today', rows);
  } catch (e) {
    setTile('tile-calendar', 'Today', `<div class="empty">Unreachable: ${esc(e.message)}</div>`);
  }
}

function tickClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('date').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

async function refreshAll() {
  document.getElementById('status').textContent = 'updated ' + new Date().toLocaleTimeString('en-GB');
  await Promise.allSettled([refreshAlerts(), refreshMachine(), refreshWeather(), refreshCalendar()]);
  console.log('CALI_TV_REFRESH_DONE ' + JSON.stringify({
    alerts: document.getElementById('tile-alerts').textContent.slice(0, 60),
    machine: document.getElementById('tile-machine').textContent.slice(0, 60),
  }));
}

console.log('CALI_TV_SCRIPT_LOADED');
tickClock();
setInterval(tickClock, 1000);
refreshAll();
setInterval(refreshAll, REFRESH_MS);

// First focusable tile gets initial D-pad focus so the remote isn't "lost"
// the moment the app opens.
document.getElementById('tile-alerts').focus();
