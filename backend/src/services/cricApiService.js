const CRIC_API_BASE = 'https://api.cricapi.com/v1';

function getApiKey() {
    const apiKey = process.env.CRIC_API;

    if (!apiKey) {
        throw new Error('CRIC_API is missing from backend/.env');
    }

    return apiKey;
}

async function fetchCricApi(path, params = {}) {
    const url = new URL(`${CRIC_API_BASE}/${path}`);
    url.searchParams.set('apikey', getApiKey());
    url.searchParams.set('offset', params.offset ?? 0);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && key !== 'offset') {
            url.searchParams.set(key, value);
        }
    });

    const response = await fetch(url);
    const payload = await response.json();

    if (!response.ok || payload.status === 'failure') {
        throw new Error(payload.reason || payload.message || 'CricAPI request failed');
    }

    return payload;
}

function normalizeScore(score) {
    return {
        inning: score.inning || 'Innings',
        runs: Number(score.r || 0),
        wickets: Number(score.w || 0),
        overs: String(score.o ?? '0.0')
    };
}

function normalizeMatch(match) {
    const teams = match.teams || match.teamInfo?.map((team) => team.shortname || team.name) || [];
    const scores = Array.isArray(match.score) ? match.score.map(normalizeScore) : [];
    const activeScore = scores[scores.length - 1] || { runs: 0, wickets: 0, overs: '0.0', inning: teams[0] || 'Innings' };

    return {
        id: match.id,
        name: match.name || teams.join(' vs '),
        venue: match.venue || 'Venue unavailable',
        status: match.status || 'Scheduled',
        matchType: match.matchType,
        date: match.date,
        teams,
        teamInfo: match.teamInfo || [],
        scores,
        score: `${activeScore.runs}/${activeScore.wickets}`,
        overs: activeScore.overs,
        battingTeam: activeScore.inning?.replace(/\s*Inning.*/i, '') || teams[0],
    };
}

function scoreToEvents(match) {
    return (match.scores || []).map((score, index) => ({
        id: `${match.id}-score-${index}`,
        type: 'SCORE',
        match_id: match.id,
        team: score.inning,
        player: null,
        bowler: null,
        description: `${score.inning}: ${score.runs}/${score.wickets} (${score.overs})`,
        over: score.overs,
        runs: score.runs,
        balls: 0,
        created_at: match.date || new Date().toISOString()
    }));
}

function buildApiSummary(match, scorecardPayload = null) {
    const battingStats = [];
    const bowlingStats = [];
    const events = scoreToEvents(match);

    const scorecard = scorecardPayload?.data;
    if (Array.isArray(scorecard?.scorecard)) {
        scorecard.scorecard.forEach((inning) => {
            const batting = inning.batting || inning.batsman || [];
            const bowling = inning.bowling || inning.bowler || [];

            batting.forEach((player) => {
                battingStats.push({
                    name: player.batsman?.name || player.name || player.batsman || 'Batter',
                    runs: Number(player.r || player.runs || 0),
                    balls: Number(player.b || player.balls || 0),
                    strikeRate: player.sr || player.strikeRate || '0.00'
                });
            });

            bowling.forEach((player) => {
                bowlingStats.push({
                    name: player.bowler?.name || player.name || player.bowler || 'Bowler',
                    overs: String(player.o || player.overs || '0.0'),
                    runs: Number(player.r || player.runs || 0),
                    wickets: Number(player.w || player.wickets || 0)
                });
            });
        });
    }

    const latestScore = match.scores[match.scores.length - 1] || { runs: 0, wickets: 0, overs: '0.0' };
    const runsPerOver = match.scores.map((score, index) => ({
        over: index + 1,
        runs: score.runs
    }));

    return {
        ...match,
        toss: scorecard?.tossWinner ? `${scorecard.tossWinner} won the toss` : 'Toss info unavailable',
        scoreboard: {
            runs: latestScore.runs,
            wickets: latestScore.wickets,
            overs: latestScore.overs
        },
        score: `${latestScore.runs}/${latestScore.wickets}`,
        overs: latestScore.overs,
        currentRunRate: Number(latestScore.overs) ? (latestScore.runs / Number(latestScore.overs)).toFixed(2) : '0.00',
        batters: battingStats.slice(0, 2),
        bowler: bowlingStats[0] || { name: 'Bowler unavailable', wickets: 0, runs: 0, overs: '0.0' },
        boundaries: 0,
        runsPerOver,
        wicketTimeline: [],
        runRate: runsPerOver.map((item) => ({
            over: item.over,
            current: item.over ? Number((item.runs / item.over).toFixed(2)) : 0,
            required: 8
        })),
        playerStats: {
            batting: battingStats,
            bowling: bowlingStats
        },
        events
    };
}

export async function getApiMatches() {
    const payload = await fetchCricApi('currentMatches');
    return (payload.data || []).map(normalizeMatch);
}

export async function getApiMatch(matchId) {
    const matches = await getApiMatches();
    const match = matches.find((item) => item.id === matchId);

    if (!match) {
        throw new Error('Match not found in CricAPI current matches');
    }

    let scorecardPayload = null;
    try {
        scorecardPayload = await fetchCricApi('match_scorecard', { id: matchId });
    } catch (err) {
        console.warn('CricAPI scorecard unavailable:', err.message);
    }

    return buildApiSummary(match, scorecardPayload);
}

export async function getApiMatchEvents(matchId) {
    const match = await getApiMatch(matchId);
    return match.events || [];
}
