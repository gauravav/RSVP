export default function Home() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 40 }}>
      <h1>RSVP App</h1>
      <p>
        This app has two pages:
      </p>
      <ul>
        <li><a href="/embed">/embed</a> — the RSVP form to iframe into your invitation page</li>
        <li><a href="/admin">/admin</a> — password-protected dashboard of all RSVPs</li>
      </ul>
    </div>
  );
}
