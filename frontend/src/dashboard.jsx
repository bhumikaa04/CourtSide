import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API_BASE = 'http://localhost:8080';

const IMPORTANT_TYPES = new Set(['WICKET', 'FOUR', 'SIX']);

function eventIcon(type) {
  switch (type) {
    case 'WICKET':
      return 'W';
    case 'FOUR':
      return '4';
    case 'SIX':
      return '6';
    default:
      return '•';
  }
}

function eventTone(type) {
  if (type === 'WICKET') return 'border-red-400/50 bg-red-500/10 text-red-100';
  if (type === 'FOUR' || type === 'SIX') return 'border-green-400/50 bg-green-500/10 text-green-100';
  return 'border-white/10 bg-white/5 text-slate-100';
}

function mergeById(existing, incoming) {
  const map = new Map();
  [...incoming, ...existing].forEach((event, index) => {
    const key = event.id || `${event.match_id}-${event.created_at || index}-${event.type}-${event.description}`;
    map.set(key, event);
  });

  return Array.from(map.values()).sort((a, b) => {
    const aId = Number(a.id || 0);
    const bId = Number(b.id || 0);
    if (aId && bId) return aId - bId;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
}

function groupEventsByOver(events) {
  return events.reduce((groups, event) => {
    const key = event.over || event.over_text || 'Live';
    if (!groups[key]) groups[key] = [];
    groups[key].push(event);
    return groups;
  }, {});
}

function formatStrikeRate(runs, balls) {
  if (!balls) return '0.00';
  return ((runs / balls) * 100).toFixed(2);
}

function SummaryTile({ label, value, subtext, flash }) {
  return (
    <div className={`rounded-lg border border-white/10 bg-[#101a2b] p-4 ${flash ? 'score-flash' : ''}`}>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {subtext && <p className="mt-1 text-sm text-slate-400">{subtext}</p>}
    </div>
  );
}

export default function MatchDashboard({ token, isConnected, liveEvents, lastEvent, subscribe, source = 'test' }) {
  const { id = 'INDvsAUS' } = useParams();
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const feedRef = useRef(null);
  const previousScoreRef = useRef(null);

  const matchEndpoint = source === 'api'
    ? `${API_BASE}/api/cricket/match/${id}`
    : `${API_BASE}/match/${id}`;
  const eventsEndpoint = source === 'api'
    ? `${API_BASE}/api/cricket/match/${id}/events`
    : `${API_BASE}/match/${id}/events`;

  useEffect(() => {
    if (source === 'test') {
      subscribe([{ match_id: id }]);
    }
  }, [id, source, subscribe]);

  useEffect(() => {
    let isMounted = true;

    async function loadMatch() {
      setIsLoading(true);
      setError('');

      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const [summaryResponse, eventsResponse] = await Promise.all([
          fetch(matchEndpoint, { headers }),
          fetch(eventsEndpoint, { headers }),
        ]);

        if (!summaryResponse.ok || !eventsResponse.ok) {
          throw new Error('Unable to load match data');
        }

        const summaryData = await summaryResponse.json();
        const eventsData = await eventsResponse.json();

        if (!isMounted) return;

        setSummary(summaryData.match);
        setEvents(eventsData.events || []);
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Dashboard failed to load');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadMatch();

    return () => {
      isMounted = false;
    };
  }, [eventsEndpoint, id, matchEndpoint, token]);

  useEffect(() => {
    if (source !== 'api') return undefined;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(matchEndpoint);
        if (response.ok) {
          const data = await response.json();
          setSummary(data.match);
          setEvents(data.match?.events || []);
        }
      } catch (err) {
        console.warn('Could not refresh CricAPI match:', err);
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [matchEndpoint, source]);

  useEffect(() => {
    if (source !== 'test') return;

    const matchingLiveEvents = liveEvents.filter((event) => event.match_id === id);
    if (matchingLiveEvents.length > 0) {
      setEvents((current) => mergeById(current, matchingLiveEvents));
    }
  }, [id, liveEvents, source]);

  useEffect(() => {
    if (source !== 'test' || lastEvent?.match_id !== id) return;

    const refreshSummary = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch(matchEndpoint, { headers });
        if (response.ok) {
          const data = await response.json();
          setSummary(data.match);
        }
      } catch (err) {
        console.warn('Could not refresh match summary:', err);
      }
    };

    setSummary((current) => {
      if (!current) return current;

      const runs = lastEvent.runs ?? (lastEvent.type === 'SIX' ? 6 : lastEvent.type === 'FOUR' ? 4 : 0);
      const wickets = lastEvent.type === 'WICKET' ? 1 : 0;
      const activeTeam = lastEvent.team || current.battingTeam || current.teams?.[0] || 'Team';
      const nextScore = {
        runs: (current.scoreboard?.runs || 0) + runs,
        wickets: (current.scoreboard?.wickets || 0) + wickets,
        overs: lastEvent.over || current.scoreboard?.overs || '0.0',
      };

      return {
        ...current,
        scoreboard: nextScore,
        score: `${nextScore.runs}/${nextScore.wickets}`,
        battingTeam: activeTeam,
      };
    });

    setFlash(lastEvent.type === 'WICKET' ? 'wicket' : 'runs');
    refreshSummary();
    const timer = setTimeout(() => setFlash(''), 900);
    return () => clearTimeout(timer);
  }, [id, lastEvent, matchEndpoint, source, token]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events, filter]);

  useEffect(() => {
    if (!summary?.score) return;
    previousScoreRef.current = summary.score;
  }, [summary?.score]);

  const filteredEvents = useMemo(() => {
    if (filter === 'WICKET') return events.filter((event) => event.type === 'WICKET');
    if (filter === 'BOUNDARY') return events.filter((event) => event.type === 'FOUR' || event.type === 'SIX');
    return events;
  }, [events, filter]);

  const groupedEvents = useMemo(() => groupEventsByOver(filteredEvents), [filteredEvents]);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6 text-white sm:px-6">
        <div className="rounded-lg border border-white/10 bg-[#0d1a2d] p-8">Loading match dashboard...</div>
      </main>
    );
  }

  if (error || !summary) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6 text-white sm:px-6">
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-8">
          <p className="font-semibold">{error || 'Match not found'}</p>
          <Link to="/" className="mt-4 inline-block text-sm text-blue-200 hover:text-white">Back to matches</Link>
        </div>
      </main>
    );
  }

  const scoreboardClass = flash === 'wicket' ? 'wicket-flash' : flash === 'runs' ? 'score-flash' : '';
  const batters = summary.batters || [];
  const bowler = summary.bowler || {};
  const battingStats = summary.playerStats?.batting || [];
  const bowlingStats = summary.playerStats?.bowling || [];
  const runRateData = summary.runRate || [];

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 text-white sm:px-6">
      <style>{`
        @keyframes scoreFlash {
          0% { box-shadow: 0 0 0 rgba(34, 197, 94, 0); transform: translateY(0); }
          45% { box-shadow: 0 0 34px rgba(34, 197, 94, 0.38); transform: translateY(-2px); }
          100% { box-shadow: 0 0 0 rgba(34, 197, 94, 0); transform: translateY(0); }
        }
        @keyframes wicketFlash {
          0% { box-shadow: 0 0 0 rgba(248, 113, 113, 0); }
          45% { box-shadow: 0 0 34px rgba(248, 113, 113, 0.42); }
          100% { box-shadow: 0 0 0 rgba(248, 113, 113, 0); }
        }
        .score-flash { animation: scoreFlash 0.8s ease-out; }
        .wicket-flash { animation: wicketFlash 0.8s ease-out; }
      `}</style>

      <section className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <Link to="/" className="text-sm text-blue-200 hover:text-white">Back to matches</Link>
            <h1 className="mt-2 text-3xl font-bold">{summary.name}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {source === 'api' ? 'CricAPI live feed' : 'Local test feed'} - {summary.venue} {summary.toss ? `- ${summary.toss}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-100">
              {summary.status || 'LIVE'}
            </span>
          </div>
        </div>
      </section>

      <section className={`rounded-lg border border-white/10 bg-[#0d1a2d] p-5 ${scoreboardClass}`}>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase text-blue-300">{summary.battingTeam || summary.teams?.[0]}</p>
            <div className="mt-2 flex items-end gap-3">
              <p className="text-5xl font-black">{summary.score}</p>
              <p className="pb-1 text-xl text-slate-300">({summary.overs})</p>
            </div>
            <p className="mt-2 text-sm text-slate-400">Current run rate {summary.currentRunRate || '0.00'}</p>
          </div>

          <div className="rounded-lg bg-[#101a2b] p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Batting</p>
            <div className="mt-3 space-y-3">
              {batters.map((batter) => (
                <div key={batter.name} className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{batter.name}</span>
                  <span className="text-slate-300">{batter.runs} ({batter.balls})</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-[#101a2b] p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Bowling</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="font-semibold">{bowler.name || 'Bowler'}</span>
              <span className="text-slate-300">{bowler.wickets || 0}/{bowler.runs || 0} ({bowler.overs || 0})</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryTile label="Events" value={events.length} subtext="Recorded from database and WebSocket" />
        <SummaryTile label="Boundaries" value={summary.boundaries || 0} subtext="Fours and sixes" />
        <SummaryTile label="Wickets" value={summary.scoreboard?.wickets || 0} subtext="Wicket timeline below" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
            <h2 className="font-semibold">Runs Per Over</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.runsPerOver || []}>
                  <CartesianGrid stroke="#243247" strokeDasharray="3 3" />
                  <XAxis dataKey="over" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ background: '#101a2b', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }} />
                  <Bar dataKey="runs" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
            <h2 className="font-semibold">Run Rate Trend</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={runRateData}>
                  <CartesianGrid stroke="#243247" strokeDasharray="3 3" />
                  <XAxis dataKey="over" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ background: '#101a2b', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }} />
                  <Line type="monotone" dataKey="current" stroke="#22c55e" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="required" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
            <h2 className="font-semibold">Wicket Timeline</h2>
            <div className="mt-4 space-y-3">
              {(summary.wicketTimeline || []).length === 0 ? (
                <p className="text-sm text-slate-400">No wickets yet.</p>
              ) : (
                summary.wicketTimeline.map((wicket, index) => (
                  <div key={`${wicket.over}-${wicket.player}-${index}`} className="flex items-center gap-3 rounded-md border border-red-400/30 bg-red-500/10 p-3">
                    <span className="rounded-md bg-red-400 px-2 py-1 text-xs font-black text-red-950">{wicket.over}</span>
                    <span className="font-semibold">{wicket.player || 'Batter'} OUT</span>
                    <span className="text-sm text-slate-400">{wicket.description}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Commentary</h2>
            <div className="flex rounded-md bg-[#101a2b] p-1">
              {[
                ['ALL', 'All'],
                ['WICKET', 'Wickets'],
                ['BOUNDARY', 'Boundaries'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold ${filter === value ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div ref={feedRef} className="mt-4 max-h-[690px] space-y-4 overflow-y-auto pr-1">
            {Object.entries(groupedEvents).map(([over, overEvents]) => (
              <div key={over}>
                <p className="mb-2 text-xs font-bold uppercase text-slate-500">Over {over}</p>
                <div className="space-y-2">
                  {overEvents.map((event, index) => (
                    <div key={`${event.id || index}-${event.type}`} className={`rounded-md border p-3 ${eventTone(event.type)}`}>
                      <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-sm font-black">
                          {eventIcon(event.type)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {event.over || over} {IMPORTANT_TYPES.has(event.type) ? `${event.type}! ` : ''}
                            {event.description || `${event.player || event.team || 'Match'} update`}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">{event.player || event.team || 'Live event'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
          <h2 className="font-semibold">Batting Stats</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2">Player</th>
                  <th>Runs</th>
                  <th>Balls</th>
                  <th>SR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {battingStats.map((player) => (
                  <tr key={player.name}>
                    <td className="py-3 font-semibold">{player.name}</td>
                    <td>{player.runs}</td>
                    <td>{player.balls}</td>
                    <td>{player.strikeRate || formatStrikeRate(player.runs, player.balls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#0d1a2d] p-5">
          <h2 className="font-semibold">Bowling Stats</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2">Bowler</th>
                  <th>Overs</th>
                  <th>Runs</th>
                  <th>Wickets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {bowlingStats.map((player) => (
                  <tr key={player.name}>
                    <td className="py-3 font-semibold">{player.name}</td>
                    <td>{player.overs}</td>
                    <td>{player.runs}</td>
                    <td>{player.wickets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
