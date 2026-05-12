import pool from "../db/index.js";
import {broadcastEvent} from '../websocket.js' ; 

const MATCHES = {
    INDvsAUS: { id: 'INDvsAUS', name: 'IND vs AUS', venue: 'Mumbai', teams: ['IND', 'AUS'], status: 'LIVE' },
    ENGvsNZ: { id: 'ENGvsNZ', name: 'ENG vs NZ', venue: "Lord's", teams: ['ENG', 'NZ'], status: 'LIVE' },
    SAvsPAK: { id: 'SAvsPAK', name: 'SA vs PAK', venue: 'Cape Town', teams: ['SA', 'PAK'], status: 'LIVE' }
};

function runsForEvent(event) {
    if (event.runs !== null && event.runs !== undefined && Number.isFinite(Number(event.runs))) return Number(event.runs);
    if (event.type === 'SIX') return 6;
    if (event.type === 'FOUR') return 4;
    return 0;
}

function ballForEvent(event) {
    if (event.balls !== null && event.balls !== undefined && Number.isFinite(Number(event.balls))) return Number(event.balls);
    return ['SIX', 'FOUR', 'WICKET', 'DOT', 'ONE', 'TWO', 'THREE'].includes(event.type) ? 1 : 0;
}

function formatOvers(balls) {
    return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function eventOver(event, index) {
    return event.over_text || event.over || formatOvers(index + 1);
}

function strikeRate(runs, balls) {
    if (!balls) return '0.00';
    return ((runs / balls) * 100).toFixed(2);
}

function buildMatchSummary(matchId, events) {
    const fallbackTeams = matchId.includes('vs') ? matchId.split('vs') : [matchId, 'Opponent'];
    const match = MATCHES[matchId] || {
        id: matchId,
        name: fallbackTeams.join(' vs '),
        venue: 'Venue TBD',
        teams: fallbackTeams,
        status: 'LIVE'
    };

    let totalRuns = 0;
    let wickets = 0;
    let legalBalls = 0;
    const runsByOver = new Map();
    const batting = new Map();
    const bowling = new Map();
    const wicketTimeline = [];
    let boundaries = 0;

    events.forEach((event, index) => {
        const runs = runsForEvent(event);
        const balls = ballForEvent(event);
        const over = eventOver(event, index);
        const overNumber = Number(String(over).split('.')[0]) || Math.floor(index / 6) + 1;

        totalRuns += runs;
        legalBalls += balls;
        runsByOver.set(overNumber, (runsByOver.get(overNumber) || 0) + runs);

        if (event.type === 'FOUR' || event.type === 'SIX') boundaries += 1;

        if (event.player) {
            const player = batting.get(event.player) || { name: event.player, runs: 0, balls: 0 };
            player.runs += runs;
            player.balls += balls;
            player.strikeRate = strikeRate(player.runs, player.balls);
            batting.set(event.player, player);
        }

        if (event.bowler) {
            const bowler = bowling.get(event.bowler) || { name: event.bowler, overs: '0.0', runs: 0, wickets: 0, balls: 0 };
            bowler.runs += runs;
            bowler.balls += balls;
            bowler.overs = formatOvers(bowler.balls);
            bowling.set(event.bowler, bowler);
        }

        if (event.type === 'WICKET') {
            wickets += 1;
            if (event.bowler) {
                const bowler = bowling.get(event.bowler) || { name: event.bowler, overs: '0.0', runs: 0, wickets: 0, balls: 0 };
                bowler.wickets += 1;
                bowling.set(event.bowler, bowler);
            }
            wicketTimeline.push({
                over,
                player: event.player,
                description: event.description || 'Wicket fell'
            });
        }
    });

    const battingStats = Array.from(batting.values()).sort((a, b) => b.runs - a.runs);
    const bowlingStats = Array.from(bowling.values()).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs);
    const runsPerOver = Array.from(runsByOver.entries())
        .sort(([a], [b]) => a - b)
        .map(([over, runs]) => ({ over, runs }));

    const runRate = [];
    let cumulative = 0;
    runsPerOver.forEach((item) => {
        cumulative += item.runs;
        runRate.push({
            over: item.over,
            current: Number((cumulative / item.over).toFixed(2)),
            required: 8
        });
    });

    const batters = battingStats.slice(0, 2);
    const bowler = bowlingStats[0] || { name: 'Waiting for bowler', wickets: 0, runs: 0, overs: '0.0' };

    return {
        ...match,
        battingTeam: events[events.length - 1]?.team || match.teams[0],
        toss: 'Toss info pending',
        scoreboard: { runs: totalRuns, wickets, overs: formatOvers(legalBalls) },
        score: `${totalRuns}/${wickets}`,
        overs: formatOvers(legalBalls),
        currentRunRate: legalBalls ? ((totalRuns / legalBalls) * 6).toFixed(2) : '0.00',
        batters: batters.length ? batters : [{ name: 'Kohli', runs: 0, balls: 0 }, { name: 'Rahul', runs: 0, balls: 0 }],
        bowler,
        boundaries,
        runsPerOver,
        wicketTimeline,
        runRate,
        playerStats: {
            batting: battingStats.length ? battingStats : [{ name: 'Kohli', runs: 0, balls: 0, strikeRate: '0.00' }],
            bowling: bowlingStats.length ? bowlingStats : [{ name: 'Starc', overs: '0.0', runs: 0, wickets: 0 }]
        }
    };
}

//create and braodcast a new event
export async function createAndBroadcastEvent(eventData) {
    try{
        //Validate required Fields
        const matchId = eventData.matchId || eventData.match_id;
        if(!eventData.type || !matchId){
            throw new Error('type and matchId are required');
        }

        //Save to DB
        const result = await pool.query(
            `INSERT INTO events (type, match_id, team, player, bowler, description, over_text, runs, balls)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`, 
            [
                eventData.type , 
                matchId,
                eventData.team || null , 
                eventData.player || null , 
                eventData.bowler || null,
                eventData.description || null,
                eventData.over || eventData.over_text || null,
                eventData.runs ?? runsForEvent(eventData),
                eventData.balls ?? ballForEvent(eventData)
            ]
        ); 

        const savedEvent = result.rows[0] ; 

        //Broadcast to all the relevent clients 
        await broadcastEvent(savedEvent);

        return savedEvent; 
    }catch(err){
        console.log('Error Creating Event :' , err); 
        throw err ; 
    }
}

//Get events after a SPecific ID (for replay)
export async function getEventsAfter(lastEventId, matchId = null) {
    try{
        let query = `
        SELECT * FROM events 
        WHERE id > $1
        ` ; 
        const params = [lastEventId] ;

        if(matchId) {
            query += ` AND match_id = $2` ; 
            params.push(matchId); 
        }

        query += ' ORDER BY id ASC' ; 

        const result = await pool.query(query, params); 
        return result.rows ; 
    } catch(err){
        console.log('Error Getting Events : ' , err); 
        throw err ; 
    }
}

//Get the recent events 
export async function getRecentEvents(limit = 50) {
    try{
        const result = await pool.query(
            `SELECT * FROM events 
             ORDER BY id DESC 
             LIMIT $1`,
            [limit]
        );

        //return in chronological order
        return result.rows.reverse() ; 
    }catch(err){
        console.error('Error Getting recent Events : ', err); 
        throw err ; 
    }
}

export async function getMatchEvents(matchId) {
    try {
        const result = await pool.query(
            `SELECT *
             FROM events
             WHERE match_id = $1
             ORDER BY id ASC`,
            [matchId]
        );

        return result.rows.map((event, index) => ({
            ...event,
            over: eventOver(event, index),
            runs: runsForEvent(event),
            balls: ballForEvent(event)
        }));
    } catch(err) {
        console.error('Error Getting match Events : ', err);
        throw err;
    }
}

export async function getMatchSummary(matchId) {
    const events = await getMatchEvents(matchId);
    return buildMatchSummary(matchId, events);
}
