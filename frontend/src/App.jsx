import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import MatchDashboard from './dashboard.jsx';
import { useWebSocket } from './hooks/useWebSocket';

const AVAILABLE_MATCHES = [
  { id: 'INDvsAUS', label: 'IND vs AUS', teams: ['IND', 'AUS'], venue: 'Mumbai' },
  { id: 'ENGvsNZ', label: 'ENG vs NZ', teams: ['ENG', 'NZ'], venue: "Lord's" },
  { id: 'SAvsPAK', label: 'SA vs PAK', teams: ['SA', 'PAK'], venue: 'Cape Town' },
];

const EVENT_TYPES = [
  { type: 'WICKET', label: 'Wickets' },
  { type: 'FOUR', label: 'Fours' },
  { type: 'SIX', label: 'Sixes' },
];

function eventIcon(type) {
  switch (type) {
    case 'WICKET':
      return 'W';
    case 'FOUR':
      return '4';
    case 'SIX':
      return '6';
    default:
      return 'C';
  }
}

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [subscriptions, setSubscriptions] = useState([]);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [apiMatches, setApiMatches] = useState([]);
  const [apiError, setApiError] = useState('');
  const [apiLoading, setApiLoading] = useState(false);

  const { isConnected, events, lastEvent, subscribe } = useWebSocket(
    token ? 'ws://localhost:8080' : null
  );

  useEffect(() => {
    if (!token) return undefined;

    let isMounted = true;

    async function loadApiMatches() {
      setApiLoading(true);
      setApiError('');

      try {
        const response = await fetch('http://localhost:8080/api/cricket/matches');
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Could not load CricAPI matches');
        }

        if (isMounted) {
          setApiMatches(data.matches || []);
        }
      } catch (err) {
        if (isMounted) {
          setApiError(err.message || 'CricAPI unavailable');
        }
      } finally {
        if (isMounted) {
          setApiLoading(false);
        }
      }
    }

    loadApiMatches();
    const timer = setInterval(loadApiMatches, 60000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:8080/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      } else {
        alert(data.message || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Server error. Is backend running?');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:8080/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (data.success) {
        alert('Registration successful! Please login.');
        setIsLoginMode(true);
      } else {
        alert(data.message || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert('Server error. Is backend running?');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setSubscriptions([]);
  };

  const hasSubscription = (target) =>
    subscriptions.some((sub) =>
      target.match_id ? sub.match_id === target.match_id : sub.event_type === target.event_type
    );

  const isSameSubscription = (subscription, target) =>
    target.match_id
      ? subscription.match_id === target.match_id
      : subscription.event_type === target.event_type;

  const toggleSubscription = (target) => {
    const nextSubscriptions = hasSubscription(target)
      ? subscriptions.filter((subscription) => !isSameSubscription(subscription, target))
      : [...subscriptions, target];

    setSubscriptions(nextSubscriptions);
    subscribe(nextSubscriptions);
  };

  const getMatchEvents = (matchId) => events.filter((event) => event.match_id === matchId);

  const getMatchScore = (matchId) => {
    const matchEvents = getMatchEvents(matchId);

    return matchEvents.reduce(
      (score, event) => {
        const team = event.team || 'Updates';

        if (!score.byTeam[team]) {
          score.byTeam[team] = { runs: 0, wickets: 0 };
        }

        if (event.type === 'SIX') score.byTeam[team].runs += 6;
        if (event.type === 'FOUR') score.byTeam[team].runs += 4;
        if (event.type === 'WICKET') score.byTeam[team].wickets += 1;

        score.totalEvents += 1;
        return score;
      },
      { byTeam: {}, totalEvents: 0 }
    );
  };

  const matchScores = AVAILABLE_MATCHES.reduce((scores, match) => {
    scores[match.id] = getMatchScore(match.id);
    return scores;
  }, {});

  const homePage = (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <section className="flex flex-col justify-between gap-3 rounded-lg border border-white/10 bg-[#0d1a2d] p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-400">Connection</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="font-semibold">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>

        {lastEvent && (
          <div className="rounded-md border border-green-400/30 bg-green-400/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-green-300">Latest Event</p>
            <p className="text-sm text-slate-100">
              {eventIcon(lastEvent.type)} {lastEvent.type} in {lastEvent.match_id}
              {lastEvent.team ? ` by ${lastEvent.team}` : ''}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold">Live Matches From CricAPI</h2>
            <p className="text-sm text-slate-400">These cards come from your backend proxy using CRIC_API.</p>
          </div>
          {apiLoading && <span className="text-sm text-slate-400">Refreshing...</span>}
        </div>

        {apiError ? (
          <p className="mt-4 rounded-md border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            {apiError}
          </p>
        ) : apiMatches.length === 0 && !apiLoading ? (
          <p className="mt-4 rounded-md border border-dashed border-white/10 p-4 text-sm text-slate-400">
            No live CricAPI matches returned right now.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {apiMatches.map((match) => (
              <article key={match.id} className="rounded-lg border border-white/10 bg-[#101a2b] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">{match.venue}</p>
                    <h3 className="mt-1 text-xl font-bold">{match.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{match.status}</p>
                  </div>
                  <span className="rounded-md bg-green-500/15 px-2 py-1 text-xs font-bold text-green-200">
                    API
                  </span>
                </div>

                <div className="mt-5 space-y-2">
                  {(match.scores || []).length === 0 ? (
                    <p className="rounded-md bg-white/5 p-3 text-sm text-slate-400">Score not available yet.</p>
                  ) : (
                    match.scores.map((score) => (
                      <div key={`${match.id}-${score.inning}`} className="flex items-center justify-between gap-3 rounded-md bg-white/5 p-3">
                        <span className="text-sm text-slate-300">{score.inning}</span>
                        <span className="font-bold">{score.runs}/{score.wickets} ({score.overs})</span>
                      </div>
                    ))
                  )}
                </div>

                <Link
                  to={`/live/${match.id}`}
                  className="mt-5 block rounded-md bg-blue-500 px-4 py-3 text-center text-sm font-bold text-white hover:bg-blue-600"
                >
                  Open Live Dashboard
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
        <div>
          <h2 className="text-xl font-bold">Test Dashboard</h2>
          <p className="text-sm text-slate-400">Use these for local backend commands, `/events`, and WebSocket testing.</p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {AVAILABLE_MATCHES.map((match) => {
          const score = matchScores[match.id];
          const matchEvents = getMatchEvents(match.id);
          const isSubscribed = hasSubscription({ match_id: match.id });
          const isLive = lastEvent?.match_id === match.id;

          return (
            <article
              key={`${match.id}-${isLive ? lastEvent?.id || lastEvent?.created_at || events.length : 'idle'}`}
              className={`rounded-lg border bg-[#0d1a2d] p-5 shadow-xl transition ${
                isLive ? 'live-card border-green-400/70' : 'border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">{match.venue}</p>
                  <h2 className="mt-1 text-2xl font-bold">{match.label}</h2>
                </div>
                <button
                  onClick={() => toggleSubscription({ match_id: match.id })}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                    isSubscribed
                      ? 'bg-green-500/20 text-green-200 hover:bg-red-500/20 hover:text-red-100'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                {match.teams.map((team) => {
                  const teamScore = score.byTeam[team] || { runs: 0, wickets: 0 };

                  return (
                    <div key={team} className="rounded-md bg-[#14243a] p-4">
                      <p className="text-sm text-slate-400">{team}</p>
                      <p className="mt-2 text-3xl font-bold">
                        {teamScore.runs}
                        <span className="text-lg text-slate-400">/{teamScore.wickets}</span>
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Score Feed</h3>
                  <span className="text-xs text-slate-400">{score.totalEvents} updates</span>
                </div>

                {matchEvents.length === 0 ? (
                  <p className="rounded-md border border-dashed border-white/10 p-4 text-sm text-slate-400">
                    No score events for this match yet.
                  </p>
                ) : (
                  <div className="max-h-[170px] space-y-2 overflow-y-auto pr-1">
                    {matchEvents.map((event, index) => (
                      <div
                        key={`${event.id || event.created_at || index}-${event.type}`}
                        className="event-row flex items-center gap-3 rounded-md bg-[#14243a] p-3"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-lg font-bold">
                          {eventIcon(event.type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {event.description || `${event.team || 'Match'} update`}
                          </p>
                          <p className="text-xs text-slate-400">
                            {event.player ? `${event.player} - ` : ''}
                            {event.created_at ? new Date(event.created_at).toLocaleTimeString() : 'Live now'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Link
                to={`/test/match/${match.id}`}
                className="mt-5 block rounded-md bg-white/10 px-4 py-3 text-center text-sm font-bold text-white hover:bg-white/15"
              >
                Open Test Dashboard
              </Link>
            </article>
          );
        })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
          <h3 className="font-semibold">Event Subscriptions</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {EVENT_TYPES.map((event) => {
              const isSubscribed = hasSubscription({ event_type: event.type });

              return (
                <button
                  key={event.type}
                  onClick={() => toggleSubscription({ event_type: event.type })}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    isSubscribed
                      ? 'bg-green-500/20 text-green-200 hover:bg-red-500/20 hover:text-red-100'
                      : 'bg-slate-700 text-white hover:bg-slate-600'
                  }`}
                >
                  {eventIcon(event.type)} {isSubscribed ? 'Unsubscribe' : event.label}
                </button>
              );
            })}
          </div>

          {subscriptions.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-medium text-slate-300">Active subscriptions</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {subscriptions.map((sub, index) => (
                  <span key={`${sub.match_id || sub.event_type}-${index}`} className="rounded-md bg-white/10 px-3 py-1 text-xs text-slate-200">
                    {sub.match_id ? `Match: ${sub.match_id}` : `Event: ${sub.event_type}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
          <h3 className="font-semibold">All Recent Events ({events.length})</h3>

          {events.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No events yet. Add events through the backend to see them animate into the match cards.</p>
          ) : (
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
              {events.map((event, index) => (
                <div key={`${event.id || index}-list`} className="event-row flex items-center gap-3 rounded-md bg-[#14243a] p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10 font-bold">
                    {eventIcon(event.type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {event.match_id} - {event.type}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {event.description || `${event.team || 'Team'} ${event.player ? `- ${event.player}` : ''}`}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {event.created_at ? new Date(event.created_at).toLocaleTimeString() : 'now'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <style>{`
        @keyframes scorePulse {
          0% { transform: scale(0.98); box-shadow: 0 0 0 rgba(34, 197, 94, 0); }
          45% { transform: scale(1.01); box-shadow: 0 0 32px rgba(34, 197, 94, 0.35); }
          100% { transform: scale(1); box-shadow: 0 0 0 rgba(34, 197, 94, 0); }
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .live-card { animation: scorePulse 1.4s ease-out; }
        .event-row { animation: slideIn 0.32s ease-out both; }
      `}</style>

      <header className="border-b border-white/10 bg-[#0d1a2d]/95 px-6 py-4 shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link to="/" className="block">
            <h1 className="text-2xl font-bold">Cricket Live Notifications</h1>
            <p className="text-sm text-slate-400">Subscribe to matches and watch backend score events land live.</p>
          </Link>

          {user && (
            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-slate-300 sm:inline">{user.email}</span>
              <button
                onClick={handleLogout}
                className="rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {!token ? (
        <main className="flex min-h-[80vh] items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#0d1a2d] p-8 shadow-xl">
            <h2 className="mb-6 text-center text-xl font-semibold">
              {isLoginMode ? 'Login' : 'Register'}
            </h2>

            <form onSubmit={isLoginMode ? handleLogin : handleRegister} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#14243a] p-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
                required
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#14243a] p-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
                required
              />

              <button className="w-full rounded-md bg-blue-500 py-3 font-medium text-white hover:bg-blue-600">
                {isLoginMode ? 'Login' : 'Register'}
              </button>
            </form>

            <button
              onClick={() => setIsLoginMode(!isLoginMode)}
              className="mt-4 w-full text-sm text-slate-400 hover:text-white"
            >
              {isLoginMode ? 'Need an account? Register' : 'Have an account? Login'}
            </button>
          </div>
        </main>
      ) : (
        <Routes>
          <Route
            path="/live/:id"
            element={
              <MatchDashboard
                token={token}
                isConnected={isConnected}
                liveEvents={events}
                lastEvent={lastEvent}
                subscribe={subscribe}
                source="api"
              />
            }
          />
          <Route
            path="/test/match/:id"
            element={
              <MatchDashboard
                token={token}
                isConnected={isConnected}
                liveEvents={events}
                lastEvent={lastEvent}
                subscribe={subscribe}
                source="test"
              />
            }
          />
          <Route
            path="/match/:id"
            element={
              <MatchDashboard
                token={token}
                isConnected={isConnected}
                liveEvents={events}
                lastEvent={lastEvent}
                subscribe={subscribe}
                source="test"
              />
            }
          />
          <Route path="/" element={homePage} />
        </Routes>
      )}
    </div>
  );
}

export default App;
