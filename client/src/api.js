// Every request can be scoped to a tournament via ?t=<slug>. Omitting it means
// the Ring Cup, so `api` behaves exactly as it always has.
async function apiFetch(path, options = {}, slug = null) {
  const url = slug
    ? `/api${path}${path.includes('?') ? '&' : '?'}t=${slug}`
    : `/api${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function makeApi(slug) {
  return {
    get:    (path)        => apiFetch(path, {}, slug),
    post:   (path, body)  => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }, slug),
    put:    (path, body)  => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }, slug),
    delete: (path)        => apiFetch(path, { method: 'DELETE' }, slug),
  };
}

export const api = makeApi(null);              // 戒指盃 Ring Cup
export const gjApi = makeApi('greenjacket');   // 綠夾克盃 Green Jacket
