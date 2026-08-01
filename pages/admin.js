import { useEffect, useState } from 'react';

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [rsvps, setRsvps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sideFilter, setSideFilter] = useState('all'); // all | bride | groom | unspecified

  async function fetchRsvps() {
    setLoading(true);
    const res = await fetch('/api/rsvp');
    if (res.status === 401) {
      setLoggedIn(false);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRsvps(data.rsvps || []);
    setLoggedIn(true);
    setLoading(false);
  }

  useEffect(() => {
    fetchRsvps();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json();
      setLoginError(data.error || 'Login failed');
      return;
    }
    fetchRsvps();
  }

  const filteredRsvps = sideFilter === 'all' ? rsvps : rsvps.filter((r) => r.side === sideFilter);

  function exportCsv() {
    const headers = ['Name', 'Phone', 'Side', 'Attending', 'Guests', 'Message', 'Submitted At', 'Last Updated'];
    const rows = filteredRsvps.map((r) => [
      r.name,
      r.phone || '',
      r.side,
      r.attending,
      r.guest_count,
      (r.message || '').replace(/\n/g, ' '),
      new Date(r.created_at).toLocaleString(),
      r.updated_at ? new Date(r.updated_at).toLocaleString() : '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rsvps.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!loggedIn) {
    return (
      <div style={styles.loginWrap}>
        <form style={styles.loginCard} onSubmit={handleLogin}>
          <h2 style={{ margin: 0 }}>Admin Login</h2>
          <input
            type="password"
            placeholder="Password"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {loginError && <p style={{ color: '#c0392b', margin: 0, fontSize: 13 }}>{loginError}</p>}
          <button style={styles.button} type="submit">Log in</button>
        </form>
      </div>
    );
  }

  const totalGuests = filteredRsvps
    .filter((r) => r.attending === 'yes')
    .reduce((sum, r) => sum + (r.guest_count || 0), 0);

  const brideCount = rsvps.filter((r) => r.side === 'bride').length;
  const groomCount = rsvps.filter((r) => r.side === 'groom').length;
  const unspecifiedCount = rsvps.filter((r) => r.side === 'unspecified').length;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={{ margin: 0, fontSize: 22 }}>RSVPs</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.smallButton} onClick={fetchRsvps}>Refresh</button>
          <button style={styles.smallButton} onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div style={styles.filterRow}>
        {[
          { key: 'all', label: `All (${rsvps.length})` },
          { key: 'bride', label: `Bride's Side (${brideCount})` },
          { key: 'groom', label: `Groom's Side (${groomCount})` },
          ...(unspecifiedCount > 0 ? [{ key: 'unspecified', label: `Unspecified (${unspecifiedCount})` }] : []),
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSideFilter(opt.key)}
            style={sideFilter === opt.key ? styles.filterButtonActive : styles.filterButton}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={styles.stats}>
        <div style={styles.statCard}>
          <div style={styles.statNum}>{filteredRsvps.length}</div>
          <div style={styles.statLabel}>Responses</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNum}>{filteredRsvps.filter((r) => r.attending === 'yes').length}</div>
          <div style={styles.statLabel}>Attending</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNum}>{totalGuests}</div>
          <div style={styles.statLabel}>Total Guests</div>
        </div>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Side</th>
                <th style={styles.th}>Attending</th>
                <th style={styles.th}>Guests</th>
                <th style={styles.th}>Message</th>
                <th style={styles.th}>Submitted</th>
                <th style={styles.th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredRsvps.map((r) => (
                <tr key={r.id}>
                  <td style={styles.td}>{r.name}</td>
                  <td style={styles.td}>{r.phone || '—'}</td>
                  <td style={styles.td}>{r.side === 'bride' ? "Bride" : r.side === 'groom' ? "Groom" : '—'}</td>
                  <td style={styles.td}>{r.attending}</td>
                  <td style={styles.td}>{r.guest_count}</td>
                  <td style={styles.td}>{r.message}</td>
                  <td style={styles.td}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={styles.td}>{r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  loginWrap: {
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
  },
  loginCard: { display: 'flex', flexDirection: 'column', gap: 10, width: 280 },
  input: { padding: '8px 10px', fontSize: 15, borderRadius: 8, border: '1px solid #ccc' },
  button: {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#111',
    color: '#fff',
    fontSize: 15,
    cursor: 'pointer',
  },
  smallButton: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid #ccc',
    background: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
  page: { fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 1100, margin: '0 auto' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filterButton: {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid #ccc',
    background: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
  filterButtonActive: {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid #111',
    background: '#111',
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
  stats: { display: 'flex', gap: 12, marginBottom: 20 },
  statCard: { border: '1px solid #eee', borderRadius: 10, padding: '12px 20px', textAlign: 'center' },
  statNum: { fontSize: 24, fontWeight: 700 },
  statLabel: { fontSize: 12, color: '#666' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px 10px' },
  td: { borderBottom: '1px solid #eee', padding: '8px 10px' },
};
