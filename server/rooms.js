// ============================================================================
//  ROOMS  —  the game state machine
// ============================================================================
//  Each Room is one game in progress. It owns the players, the current phase,
//  the timers, and the authoritative scores. The server (index.js) turns
//  incoming websocket messages into Room method calls, and the Room decides
//  what everyone should see next by calling broadcast().
//
//  The flow:  LOBBY → (per round: WRITING → [VOTING → RESULT]×N) → SCOREBOARD
//             → … → FINAL
// ============================================================================

import { rules } from '../config/rules.js';
import { getPack, getDefaultPackId, getPacks } from '../config/prompts.js';
import { copy } from '../config/copy.js';
import { theme } from '../config/theme.js';
import { metrics } from './metrics.js';
import { PHASE, S2C } from './protocol.js';
import {
  assignPrompts, scorePrompt, standings, winners, shuffle, pick, hasRealAnswer,
} from './engine.js';

const MAX_NAME = 20;
const MAX_ANSWER = 120;

// Names for test bots (feature: solo testing). Picked in order, uniqueness-checked.
const BOT_NAMES = [
  'Botniss', 'Clanker', 'HAL', 'Roboto', 'Cog', 'Nutbolt',
  'Tinny', 'Gizmo', 'Circuit', 'Sparky', 'Widget', 'Dot',
];

// ---------------------------------------------------------------------------
//  Room
// ---------------------------------------------------------------------------
export class Room {
  constructor(code, joinUrl, onEmpty) {
    this.code = code;
    this.joinUrl = joinUrl;      // where phones point their browser
    this.onEmpty = onEmpty;      // called when the room should be cleaned up

    this.hostWs = null;
    this.qr = null;              // data-URL QR of joinUrl (set by the server)
    this.players = new Map();    // playerId → player object
    this.packId = getDefaultPackId();
    this.phase = PHASE.LOBBY;

    this.game = null;            // per-game state, built in start()
    this.timer = null;           // active setTimeout handle
    this.deadline = null;        // ms epoch the current timer fires (for countdowns)
    this._pidSeq = 0;
    this._idleTimer = null;
    this.armIdleCleanup();
  }

  // ---- connections --------------------------------------------------------

  setHost(ws) {
    this.hostWs = ws;
    this.disarmIdleCleanup();
    this.broadcast();
  }

  hostGone() {
    this.hostWs = null;
    // The host screen is the game — if it's gone, close the room out.
    this.endRoom('host-left');
  }

  addPlayer(name, ws) {
    name = String(name || '').trim().slice(0, MAX_NAME);
    if (!name) return { error: 'error', message: copy.system.error };
    if (this.phase !== PHASE.LOBBY) return { error: 'gameStarted', message: copy.join.gameStarted };
    if (this.activePlayers().length >= rules.maxPlayers) {
      return { error: 'roomFull', message: copy.join.roomFull };
    }
    const taken = [...this.players.values()].some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) return { error: 'nameTaken', message: copy.join.nameTaken };

    const id = `u${++this._pidSeq}`;
    const colorIndex = this.players.size;
    this.players.set(id, {
      id,
      name,
      score: 0,
      color: theme.playerColors[colorIndex % theme.playerColors.length],
      colorIndex,
      ws,
      connected: true,
    });
    this.disarmIdleCleanup();
    this.broadcast();
    return { playerId: id, name };
  }

  rejoin(playerId, ws) {
    const p = this.players.get(playerId);
    if (!p) return { error: 'roomNotFound', message: copy.join.roomNotFound };
    p.ws = ws;
    p.connected = true;
    this.broadcast();
    return { playerId, name: p.name };
  }

  // ---- test bots ----------------------------------------------------------
  //  A bot is an ordinary player with no websocket (ws:null) that the room
  //  answers/votes on behalf of. It lets one real person test a full game.
  //  Gated by ENABLE_BOTS in index.js — never reachable in a normal deploy.

  addBot() {
    if (this.phase !== PHASE.LOBBY) return;
    if (this.activePlayers().length >= rules.maxPlayers) return;
    const used = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    const name = BOT_NAMES.find((n) => !used.has(n.toLowerCase()))
      || `Bot ${this.players.size + 1}`;
    const id = `u${++this._pidSeq}`;
    const colorIndex = this.players.size;
    this.players.set(id, {
      id,
      name,
      score: 0,
      color: theme.playerColors[colorIndex % theme.playerColors.length],
      colorIndex,
      ws: null,
      connected: true,
      isBot: true,
    });
    this.disarmIdleCleanup();
    this.broadcast();
  }

  removeBot(playerId) {
    if (this.phase !== PHASE.LOBBY) return;
    const p = this.players.get(playerId);
    if (p && p.isBot) {
      this.players.delete(playerId);
      this.broadcast();
    }
  }

  // A websocket dropped — figure out who it was and mark them offline.
  connectionClosed(ws) {
    if (ws === this.hostWs) {
      this.hostGone();
      return;
    }
    for (const p of this.players.values()) {
      if (p.ws === ws) {
        p.ws = null;
        p.connected = false;
        this.broadcast();
        this.armIdleCleanupIfEmpty();
        return;
      }
    }
  }

  activePlayers() {
    // Everyone who joined counts as "in the game" (spectators past maxPlayers
    // are never created — addPlayer rejects them). Order by join order.
    return [...this.players.values()];
  }

  // ---- lobby actions ------------------------------------------------------

  setPack(packId) {
    if (this.phase !== PHASE.LOBBY) return;
    if (getPacks().some((p) => p.id === packId)) {
      this.packId = packId;
      this.broadcast();
    }
  }

  canStart() {
    return this.phase === PHASE.LOBBY && this.activePlayers().length >= rules.minPlayers;
  }

  start() {
    if (!this.canStart()) return;
    // A game needs 3 players for voting to work (with 2, both write every
    // matchup so neither can vote). Top up with CPU "house players" so a
    // 2-person game always has a neutral voter.
    while (this.activePlayers().length < 3 && this.activePlayers().length < rules.maxPlayers) {
      this.addBot();
    }
    metrics.gamesStarted += 1;
    for (const p of this.players.values()) p.score = 0;
    this.game = { roundIndex: -1, prompts: [], order: [], votingIndex: 0 };
    this.beginRound();
  }

  // ---- bot automation -----------------------------------------------------

  hasBots() {
    return [...this.players.values()].some((p) => p.isBot);
  }

  // Bots submit their answers for the current round. Real answerers are left
  // untouched, so a solo human still has to write theirs before writing ends.
  botsWrite() {
    if (!this.game) return;
    for (const prompt of this.game.prompts) {
      for (const id of prompt.answerers) {
        const p = this.players.get(id);
        if (p && p.isBot && !hasRealAnswer(prompt.answers[id])) {
          this.submitAnswer(id, prompt.id, pick(copy.botAnswers));
        }
      }
    }
  }

  // Bots cast a random legal vote on the current matchup (a bot never votes on
  // a prompt it authored). If a bot is the only eligible voter, this resolves
  // the matchup immediately — exactly what you want when testing alone.
  botsVote() {
    if (this.phase !== PHASE.VOTING || !this.game) return;
    const prompt = this.currentPrompt();
    if (!prompt) return;
    for (const id of this.eligibleVoters(prompt)) {
      const p = this.players.get(id);
      if (p && p.isBot && !prompt.votes[id]) {
        this.vote(id, prompt.id, pick(prompt.answerers));
      }
    }
  }

  // ---- round: writing -----------------------------------------------------

  beginRound() {
    this.game.roundIndex += 1;
    const ids = this.activePlayers().map((p) => p.id);
    const pool = getPack(this.packId).prompts;

    // assignPrompts needs at least one prompt per player.
    const assigned = assignPrompts(ids, pool);
    this.game.prompts = assigned.map((a) => ({
      id: a.id,
      text: a.text,
      answerers: a.answerers,
      answers: {},   // playerId → text
      votes: {},     // voterId → chosen answerer id
      result: null,  // filled at scoring time
    }));

    this.phase = PHASE.WRITING;
    this.startTimer(rules.answerSeconds, () => this.finishWriting());
    this.broadcast();
    this.botsWrite();   // bots answer immediately; humans still have the timer
  }

  submitAnswer(playerId, promptId, text) {
    if (this.phase !== PHASE.WRITING) return;
    const prompt = this.game.prompts.find((p) => p.id === promptId);
    if (!prompt || !prompt.answerers.includes(playerId)) return;
    if (hasRealAnswer(prompt.answers[playerId])) return; // already answered
    prompt.answers[playerId] = String(text || '').trim().slice(0, MAX_ANSWER);
    metrics.answersSubmitted += 1;

    if (this.allAnswersIn()) this.finishWriting();
    else this.broadcast();
  }

  allAnswersIn() {
    return this.game.prompts.every((p) =>
      p.answerers.every((id) => hasRealAnswer(p.answers[id])),
    );
  }

  finishWriting() {
    this.clearTimer();
    // Fill any blanks so every matchup has two answers to vote on.
    for (const prompt of this.game.prompts) {
      for (const id of prompt.answerers) {
        if (!hasRealAnswer(prompt.answers[id])) {
          prompt.answers[id] = rules.useSafetyQuips ? pick(copy.safetyQuips) : '';
        }
      }
    }
    // Vote on the matchups in a shuffled order for variety.
    this.game.order = shuffle(this.game.prompts.map((_, i) => i));
    this.game.votingIndex = 0;
    this.beginVoting();
  }

  // ---- round: voting ------------------------------------------------------

  currentPrompt() {
    return this.game.prompts[this.game.order[this.game.votingIndex]];
  }

  eligibleVoters(prompt) {
    return this.activePlayers()
      .map((p) => p.id)
      .filter((id) => !prompt.answerers.includes(id));
  }

  beginVoting() {
    const prompt = this.currentPrompt();
    this.phase = PHASE.VOTING;

    // Nobody can vote (tiny games) → skip straight to the result.
    if (this.eligibleVoters(prompt).length === 0) {
      this.finishVoting();
      return;
    }
    this.startTimer(rules.voteSeconds, () => this.finishVoting());
    this.broadcast();
    this.botsVote();   // bot voters decide right away; humans still have the timer
  }

  vote(playerId, promptId, choice) {
    if (this.phase !== PHASE.VOTING) return;
    const prompt = this.currentPrompt();
    if (!prompt || prompt.id !== promptId) return;
    if (prompt.answerers.includes(playerId)) return;        // can't vote your own
    if (!prompt.answerers.includes(choice)) return;         // must pick a real option
    if (prompt.votes[playerId]) return;                     // already voted
    prompt.votes[playerId] = choice;
    metrics.votesCast += 1;

    if (this.allVotesIn(prompt)) this.finishVoting();
    else this.broadcast();
  }

  allVotesIn(prompt) {
    return this.eligibleVoters(prompt).every((id) => prompt.votes[id]);
  }

  finishVoting() {
    this.clearTimer();
    const prompt = this.currentPrompt();
    const multiplier = rules.rounds[this.game.roundIndex].multiplier;
    const scored = scorePrompt(prompt, rules, multiplier);

    // Apply awards to running scores.
    for (const [id, pts] of Object.entries(scored.awards)) {
      const p = this.players.get(id);
      if (p) p.score += pts;
    }
    prompt.result = scored;

    this.phase = PHASE.RESULT;
    this.startTimer(rules.resultSeconds, () => this.afterResult());
    this.broadcast();
  }

  afterResult() {
    this.clearTimer();
    this.game.votingIndex += 1;
    if (this.game.votingIndex < this.game.order.length) {
      this.beginVoting();
    } else {
      // Round over.
      const isLastRound = this.game.roundIndex >= rules.rounds.length - 1;
      if (isLastRound) this.toFinal();
      else { this.phase = PHASE.SCOREBOARD; this.broadcast(); }
    }
  }

  // Host clicked "next round" on the scoreboard.
  advance() {
    if (this.phase !== PHASE.SCOREBOARD) return;
    this.beginRound();
  }

  toFinal() {
    this.clearTimer();
    this.phase = PHASE.FINAL;
    this.broadcast();
  }

  playAgain() {
    this.clearTimer();
    for (const p of this.players.values()) p.score = 0;
    this.game = null;
    this.phase = PHASE.LOBBY;
    this.broadcast();
  }

  // ---- timers -------------------------------------------------------------

  startTimer(seconds, cb) {
    this.clearTimer();
    this.deadline = Date.now() + seconds * 1000;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.deadline = null;
      cb();
    }, seconds * 1000);
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  // ---- idle cleanup -------------------------------------------------------

  armIdleCleanup() {
    this.disarmIdleCleanup();
    this._idleTimer = setTimeout(
      () => this.endRoom('idle'),
      rules.roomIdleMinutes * 60 * 1000,
    );
  }

  armIdleCleanupIfEmpty() {
    const anyoneConnected =
      this.hostWs || [...this.players.values()].some((p) => p.connected);
    if (!anyoneConnected) this.armIdleCleanup();
  }

  disarmIdleCleanup() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = null;
  }

  endRoom(reason) {
    this.clearTimer();
    this.disarmIdleCleanup();
    // Tell everyone still connected the room is gone.
    for (const p of this.players.values()) {
      this.send(p.ws, { t: S2C.ENDED, reason });
    }
    this.send(this.hostWs, { t: S2C.ENDED, reason });
    this.onEmpty(this.code);
  }

  // ---- sending ------------------------------------------------------------

  send(ws, msg) {
    if (ws && ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(msg));
    }
  }

  broadcast() {
    this.send(this.hostWs, { t: S2C.STATE, ...this.viewForHost() });
    for (const p of this.players.values()) {
      this.send(p.ws, { t: S2C.STATE, ...this.viewForPlayer(p.id) });
    }
  }

  // ---- view-models --------------------------------------------------------
  //  These decide what each screen is allowed to know. The host screen shows
  //  everything; a player's phone only sees their own prompts and choices —
  //  and answer authors stay hidden until the reveal.

  timing() {
    if (!this.deadline) return null;
    return { deadline: this.deadline, now: Date.now() };
  }

  publicPlayers() {
    return this.activePlayers().map((p) => ({
      id: p.id, name: p.name, score: p.score, color: p.color,
      connected: p.connected, isBot: !!p.isBot,
    }));
  }

  viewForHost() {
    const base = {
      role: 'host',
      phase: this.phase,
      code: this.code,
      players: this.publicPlayers(),
      packName: getPack(this.packId).name,
      timing: this.timing(),
      round: this.game ? {
        index: this.game.roundIndex,
        name: rules.rounds[this.game.roundIndex]?.name,
        total: rules.rounds.length,
      } : null,
    };

    switch (this.phase) {
      case PHASE.LOBBY:
        return {
          ...base,
          joinUrl: this.joinUrl,
          qr: this.qr,
          packs: getPacks().map((p) => ({ id: p.id, name: p.name })),
          activePackId: this.packId,
          canStart: this.canStart(),
          minPlayers: rules.minPlayers,
        };

      case PHASE.WRITING: {
        // Progress = how many players have finished BOTH their prompts.
        const done = this.activePlayers().filter((pl) =>
          this.game.prompts
            .filter((pr) => pr.answerers.includes(pl.id))
            .every((pr) => hasRealAnswer(pr.answers[pl.id])),
        ).length;
        return { ...base, progress: { done, total: this.activePlayers().length } };
      }

      case PHASE.VOTING: {
        const prompt = this.currentPrompt();
        return {
          ...base,
          matchup: {
            index: this.game.votingIndex,
            total: this.game.order.length,
            promptText: prompt.text,
            // Anonymous during voting — text only, in fixed answerer order.
            options: prompt.answerers.map((id) => ({ text: prompt.answers[id] })),
            votesIn: Object.keys(prompt.votes).length,
            votesNeeded: this.eligibleVoters(prompt).length,
          },
        };
      }

      case PHASE.RESULT: {
        const prompt = this.currentPrompt();
        const r = prompt.result;
        return {
          ...base,
          reveal: {
            index: this.game.votingIndex,
            total: this.game.order.length,
            promptText: prompt.text,
            // Now authors + votes are revealed.
            options: prompt.answerers.map((id) => ({
              playerId: id,
              name: this.players.get(id)?.name,
              color: this.players.get(id)?.color,
              text: prompt.answers[id],
              votes: r.tally[id] || 0,
              points: r.awards[id] || 0,
            })),
            quiplashWinner: r.quiplashWinner,
            tie: r.tie,
            totalVotes: r.totalVotes,
          },
        };
      }

      case PHASE.SCOREBOARD:
      case PHASE.FINAL: {
        const ranked = standings(this.publicPlayers());
        return {
          ...base,
          standings: ranked,
          winners: this.phase === PHASE.FINAL ? winners(this.publicPlayers()) : null,
          moreRounds: this.game ? this.game.roundIndex < rules.rounds.length - 1 : false,
        };
      }

      default:
        return base;
    }
  }

  viewForPlayer(playerId) {
    const p = this.players.get(playerId);
    const base = {
      role: 'player',
      phase: this.phase,
      you: p ? { id: p.id, name: p.name, score: p.score, color: p.color } : null,
      timing: this.timing(),
    };

    switch (this.phase) {
      case PHASE.LOBBY:
        return { ...base, waiting: true };

      case PHASE.WRITING: {
        const mine = this.game.prompts
          .filter((pr) => pr.answerers.includes(playerId))
          .map((pr) => ({
            id: pr.id,
            text: pr.text,
            answered: hasRealAnswer(pr.answers[playerId]),
            yourText: pr.answers[playerId] || '',
          }));
        return { ...base, prompts: mine };
      }

      case PHASE.VOTING: {
        const prompt = this.currentPrompt();
        const isAuthor = prompt.answerers.includes(playerId);
        const voted = Boolean(prompt.votes[playerId]);
        return {
          ...base,
          vote: {
            promptId: prompt.id,
            promptText: prompt.text,
            canVote: !isAuthor && !voted,
            isAuthor,
            voted,
            choice: prompt.votes[playerId] || null,
            // Anonymous options; `choice` sent back is the answerer id.
            options: isAuthor ? [] : prompt.answerers.map((id) => ({
              choice: id,
              text: prompt.answers[id],
            })),
          },
        };
      }

      case PHASE.RESULT:
        return { ...base, watch: true };

      case PHASE.SCOREBOARD:
      case PHASE.FINAL: {
        const ranked = standings(this.publicPlayers());
        const me = ranked.find((r) => r.id === playerId);
        return { ...base, me: me ? { rank: me.rank, score: me.score } : null };
      }

      default:
        return base;
    }
  }
}

// ---------------------------------------------------------------------------
//  RoomManager  —  makes codes, holds rooms, hands them out
// ---------------------------------------------------------------------------
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion

export class RoomManager {
  constructor() {
    this.rooms = new Map();       // code → Room
  }

  makeCode() {
    let code;
    do {
      code = Array.from({ length: rules.roomCodeLength },
        () => pick(CODE_ALPHABET.split(''))).join('');
    } while (this.rooms.has(code));
    return code;
  }

  // baseUrl is where phones should point (env BASE_URL or the LAN IP).
  create(baseUrl) {
    const code = this.makeCode();
    const joinUrl = `${baseUrl}/play?code=${code}`;
    const room = new Room(code, joinUrl, (c) => this.rooms.delete(c));
    this.rooms.set(code, room);
    metrics.roomsCreated += 1;
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || '').toUpperCase());
  }
}
