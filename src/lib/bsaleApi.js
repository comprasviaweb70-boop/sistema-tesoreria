require('dotenv').config();

const API_BASE = process.env.BSALE_API_BASE || 'https://api.bsale.io';
const API_KEY  = process.env.BSALE_API_KEY;

if (!API_KEY) {
  throw new Error('ERROR: BSALE_API_KEY requerida en .env');
}

const headers = {
  'access_token': API_KEY,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

async function request(url, opts = {}) {
  const config = { ...opts, headers: { ...headers, ...opts.headers } };
  const res = await fetch(`${API_BASE}${url}`, config);
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    const txt = await res.text();
    try { data = JSON.parse(txt); } catch { data = txt; }
  }
  if (!res.ok) {
    const msg = data && data.error ? data.error : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

async function getCashBoxes() {
  return request('/v1/cash_boxes.json');
}
async function getCashBoxTurns(cashBoxId, fecha) {
  return request(`/v1/cash_box_turns.json?cash_box_id=${cashBoxId}&fecha=${fecha}`);
}

module.exports = { getCashBoxes, getCashBoxTurns, headers };
