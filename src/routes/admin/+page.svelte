<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import type { Player, GameSession } from '$lib/types';

	type TriviaQuestion = {
		id: number;
		song_title: string;
		correct_artist: string;
		played_at: string | null;
	};

	let players: Player[] = [];
	let remainingQuestions: TriviaQuestion[] = [];
	let playedQuestions: TriviaQuestion[] = [];
	let activeSession: GameSession | null = null;
	let isLoading = false;
	let winners: Player[] = [];
	let detectedArtist: string | null = '';

	let playerSubscription: RealtimeChannel;
	let sessionSubscription: RealtimeChannel;
	let questionSubscription: RealtimeChannel;

	$: if (activeSession?.status === 'ENDED' && players.length > 0) {
		const maxScore = Math.max(...players.map((p) => p.score));
		winners = players.filter((p) => p.score === maxScore);
	} else {
		winners = [];
	}

	async function fetchAllQuestions() {
		const { data } = await supabase.from('trivia_questions').select('*').order('id');
		if (data) {
			remainingQuestions = data.filter((q) => q.played_at === null);
			playedQuestions = data.filter((q) => q.played_at !== null);
		}
	}

	async function launchQuestion(question: TriviaQuestion) {
		if (!activeSession) return;
		isLoading = true;

		await supabase
			.from('trivia_questions')
			.update({ played_at: new Date().toISOString() })
			.eq('id', question.id);

		const { error } = await supabase
			.from('game_sessions')
			.update({ current_question_id: question.id, detected_artist: null })
			.eq('id', activeSession.id);

		if (error) alert(error.message);

		detectedArtist = null;
		isLoading = false;
	}

	async function loadPlayers(sessionId: string) {
		const { data } = await supabase
			.from('players')
			.select('*')
			.eq('game_session_id', sessionId)
			.order('player_number');
		players = data || [];
	}

	function setupSubscriptions(sessionId: string) {
		if (playerSubscription) supabase.removeChannel(playerSubscription);
		playerSubscription = supabase
			.channel(`admin-players:${sessionId}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
				// This check resolves the 'possibly null' error
				if (activeSession) {
					loadPlayers(activeSession.id);
				}
			})
			.subscribe();

		if (sessionSubscription) supabase.removeChannel(sessionSubscription);
		sessionSubscription = supabase
			.channel(`admin-sessions:${sessionId}`)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'game_sessions',
					filter: `id=eq.${sessionId}`
				},
				(payload) => {
					detectedArtist = payload.new.detected_artist;
				}
			)
			.subscribe();

		if (questionSubscription) supabase.removeChannel(questionSubscription);
		questionSubscription = supabase
			.channel('admin-questions')
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'trivia_questions' },
				() => {
					fetchAllQuestions();
				}
			)
			.subscribe();
	}

	async function checkForActiveSession() {
		isLoading = true;
		const { data: sessions } = await supabase
			.from('game_sessions')
			.select('*')
			.or('status.ilike.WAITING,status.ilike.IN_PROGRESS,status.ilike.ENDED')
			.order('created_at', { ascending: false })
			.limit(1);
		activeSession = sessions && sessions.length > 0 ? sessions[0] : null;

		if (activeSession) {
			detectedArtist = activeSession.detected_artist;
			await loadPlayers(activeSession.id);
			await fetchAllQuestions();
			setupSubscriptions(activeSession.id);
		}
		isLoading = false;
	}

	onMount(() => {
		checkForActiveSession();
	});
	onDestroy(() => {
		if (playerSubscription) supabase.removeChannel(playerSubscription);
		if (sessionSubscription) supabase.removeChannel(sessionSubscription);
		if (questionSubscription) supabase.removeChannel(questionSubscription);
	});

	async function createNewGame() {
		isLoading = true;
		winners = [];
		await supabase.from('trivia_questions').update({ played_at: null }).not('played_at', 'is', null);
		const { data: newSessions } = await supabase
			.from('game_sessions')
			.insert({ created_at: new Date().toISOString() })
			.select();
		if (newSessions && newSessions.length > 0) {
			activeSession = newSessions[0];
			// This check resolves the 'possibly null' error
			if (activeSession) {
				await loadPlayers(activeSession.id);
				setupSubscriptions(activeSession.id);
			}
		}
		isLoading = false;
	}

	async function startGame() {
		if (!activeSession) return;
		isLoading = true;
		const { error } = await supabase
			.from('game_sessions')
			.update({ status: 'IN_PROGRESS', current_question_id: 0 })
			.eq('id', activeSession.id);
		if (!error) {
			activeSession.status = 'IN_PROGRESS';
			activeSession = activeSession;
		}
	}

	async function endGame() {
		if (!activeSession) return;
		if (confirm('Are you sure you want to end the game?')) {
			const { error } = await supabase
				.from('game_sessions')
				.update({ status: 'ENDED' })
				.eq('id', activeSession.id);
			if (!error) activeSession.status = 'ENDED';
		}
	}
</script>

<main class="container">
	<h1>Admin Mission Control</h1>

	{#if winners.length > 0}
		<div class="winner-banner">
			<h2>🏆 {winners.length > 1 ? 'Winners!' : 'Winner!'} 🏆</h2>
			{#each winners as winner}
				<p>{winner.name} ({winner.score} pts)</p>
			{/each}
		</div>
	{/if}

	<section class="controls">
		{#if !activeSession || activeSession.status === 'ENDED'}
			<button on:click={createNewGame} disabled={isLoading}>Create New Game</button>
		{:else}
			{#if activeSession.status === 'WAITING'}
				<button on:click={startGame} disabled={isLoading}>Start Game</button>
			{/if}
			{#if activeSession.status === 'IN_PROGRESS'}
				<button class="stop-button" on:click={endGame} disabled={isLoading}>End Game</button>
			{/if}
		{/if}
	</section>

	{#if activeSession}
		<section class="currently-playing">
			<h2>Currently Playing</h2>
			<p>Detected VDJ Artist: <strong>{detectedArtist || 'None'}</strong></p>
			{#if detectedArtist}
				<div class="question-buttons">
					{#each remainingQuestions.filter((q) => q.correct_artist === detectedArtist) as question}
						<button on:click={() => launchQuestion(question)} disabled={isLoading}>
							Launch: {question.song_title}
						</button>
					{:else}
						<p class="warning">No questions available for this artist.</p>
					{/each}
				</div>
			{/if}
		</section>

		<div class="columns">
			<section class="question-list">
				<h3>Remaining ({remainingQuestions.length})</h3>
				<ul>
					{#each remainingQuestions as q}
						<li>{q.correct_artist} - {q.song_title}</li>
					{/each}
				</ul>
			</section>
			<section class="question-list">
				<h3>Played ({playedQuestions.length})</h3>
				<ul>
					{#each playedQuestions as q}
						<li class="played">{q.correct_artist} - {q.song_title}</li>
					{/each}
				</ul>
			</section>
		</div>

		<section class="player-list">
			<h3>Players ({players.length})</h3>
			<ul>
				{#each players.sort((a, b) => b.score - a.score) as player (player.id)}
					<li>
						<span>{player.player_number}: {player.name}</span>
						<strong>{player.score} pts</strong>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<style>
	:global(body) {
		background-color: #121212;
		color: white;
		font-family: sans-serif;
	}
	.container {
		max-width: 1200px;
		margin: 2rem auto;
		padding: 2rem;
	}
	h1,
	h2,
	h3 {
		text-align: center;
		color: #f72585;
	}
	.controls {
		text-align: center;
		margin-bottom: 2rem;
	}
	button {
		padding: 0.8rem 1.5rem;
		font-size: 1.2rem;
		border-radius: 8px;
		border: 2px solid #b5179e;
		background-color: rgba(0, 0, 0, 0.3);
		color: white;
		cursor: pointer;
		transition: all 0.2s;
	}
	button:hover:not(:disabled) {
		border-color: #f72585;
		background-color: #f72585;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.stop-button {
		border-color: #ff4136;
	}
	.stop-button:hover:not(:disabled) {
		background-color: #ff4136;
	}
	.currently-playing {
		border: 1px solid #7209b7;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 2rem;
		text-align: center;
	}
	.currently-playing strong {
		color: #1db954;
	}
	.question-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		margin-bottom: 2rem;
	}
	.question-list ul,
	.player-list ul {
		list-style: none;
		padding: 0;
		background: #1e1e1e;
		border-radius: 8px;
		padding: 1rem;
		height: 300px;
		overflow-y: auto;
	}
	.question-list li,
	.player-list li {
		padding: 0.5rem;
		border-bottom: 1px solid #333;
	}
	.question-list li.played {
		color: #888;
		text-decoration: line-through;
	}
	.player-list li {
		display: flex;
		justify-content: space-between;
	}
	.winner-banner {
		text-align: center;
		background-color: #1db954;
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 8px;
		margin-bottom: 2rem;
	}
	.winner-banner h2 {
		color: white;
	}
	.warning {
		color: #ff4136;
	}
</style>