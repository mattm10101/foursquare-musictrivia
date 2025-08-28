<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import type { Player, GameSession } from '$lib/types';
	import { toast } from 'svelte-sonner'; // <-- UPDATED IMPORT

	type TriviaQuestion = { id: number; song_title: string; correct_artist: string; played_at: string | null };

	let players: Player[] = [];
	let remainingQuestions: TriviaQuestion[] = [];
	let playedQuestions: TriviaQuestion[] = [];
	let activeSession: GameSession | null = null;
	let isLoading = false;
	let winners: Player[] = [];
	let detectedArtist: string | null = '';

	let subscriptions: RealtimeChannel[] = [];

	$: if (activeSession?.status === 'ENDED' && players.length > 0) {
		const maxScore = Math.max(...players.map((p) => p.score));
		winners = players.filter((p) => p.score === maxScore);
	} else {
		winners = [];
	}

	async function fetchAllQuestions() {
		const { data } = await supabase.from('trivia_questions').select('*').order('id');
		if (data) {
			remainingQuestions = data.filter((q) => !q.played_at);
			playedQuestions = data.filter((q) => !!q.played_at);
		}
	}

	async function loadPlayers(sessionId: string) {
		const { data } = await supabase.from('players').select('*').eq('game_session_id', sessionId);
		players = data || [];
	}

	function setupSubscriptions(sessionId: string) {
		subscriptions.forEach((sub) => supabase.removeChannel(sub));
		subscriptions = [];

		const playerSub = supabase
			.channel(`admin-players:${sessionId}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
				// This check is crucial for type safety
				if (activeSession) {
					loadPlayers(activeSession.id);
				}
			})
			.subscribe();

		const sessionSub = supabase
			.channel(`admin-sessions:${sessionId}`)
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'game_sessions' },
				(payload) => {
					detectedArtist = payload.new.detected_artist;
					if (activeSession) {
						activeSession.status = payload.new.status;
					}
				}
			)
			.subscribe();

		const questionSub = supabase
			.channel('admin-questions')
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'trivia_questions' },
				fetchAllQuestions
			)
			.subscribe();

		subscriptions = [playerSub, sessionSub, questionSub];
	}

	async function getInitialState() {
		isLoading = true;
		const { data: sessions } = await supabase
			.from('game_sessions')
			.select('*')
			.or('status.eq.WAITING,status.eq.IN_PROGRESS') // Using the reliable .or() filter
			.order('created_at', { ascending: false })
			.limit(1);
		activeSession = sessions && sessions.length > 0 ? sessions[0] : null;

		if (activeSession) {
			await loadPlayers(activeSession.id);
			await fetchAllQuestions();
			setupSubscriptions(activeSession.id);
		}
		isLoading = false;
	}

	onMount(getInitialState);
	onDestroy(() => {
		subscriptions.forEach((sub) => supabase.removeChannel(sub));
	});

	async function startGame() {
		isLoading = true;
		winners = [];
		await supabase.from('trivia_questions').update({ played_at: null }).not('played_at', 'is', null);
		await supabase.from('players').delete().not('id', 'is', null);
		const { data: newSessions } = await supabase
			.from('game_sessions')
			.insert({ created_at: new Date().toISOString() })
			.select();
		if (newSessions && newSessions.length > 0) {
			activeSession = newSessions[0];
			// This check is crucial for type safety
			if (activeSession) {
				await loadPlayers(activeSession.id);
				setupSubscriptions(activeSession.id);
			}
		}
		isLoading = false;
	}

	async function endGame() {
		if (!activeSession) return;
		if (confirm('Are you sure you want to end the game? This will calculate winners.')) {
			isLoading = true;
			await supabase
				.from('game_sessions')
				.update({ status: 'ENDED', dashboard_view: 'WINNER' })
				.eq('id', activeSession.id);
			activeSession = null; // Game is now inactive
			await getInitialState(); // Refresh state
			isLoading = false;
		}
	}

	async function setDashboardView(view: 'QR_CODE' | 'LEADERBOARD') {
		if (!activeSession) return;
		await supabase.from('game_sessions').update({ dashboard_view: view }).eq('id', activeSession.id);
	}

	async function launchQuestion(question: TriviaQuestion) {
		if (!activeSession) return;
		await supabase
			.from('trivia_questions')
			.update({ played_at: new Date().toISOString() })
			.eq('id', question.id);
		await supabase
			.from('game_sessions')
			.update({ current_question_id: question.id, detected_artist: null })
			.eq('id', activeSession.id);
		detectedArtist = null;
	}
</script>

<main class="container">
	<h1>Admin Mission Control</h1>

	{#if isLoading}
		<p>Loading...</p>
	{:else if activeSession}
		<!-- ACTIVE GAME STATE -->
		<section class="controls">
			<button class="stop-button" on:click={endGame}>End Game</button>
			<button
				on:click={() => {
					endGame().then(startGame);
				}}>Restart Game</button
			>
		</section>

		<section class="dashboard-controls">
			<h3>Dashboard Control</h3>
			<div class="controls">
				<button on:click={() => setDashboardView('QR_CODE')}>Show QR Code</button>
				<button on:click={() => setDashboardView('LEADERBOARD')}>Show Leaderboard</button>
			</div>
		</section>

		<section class="currently-playing">
			<h3>Question Launcher</h3>
			<p>Detected VDJ Artist: <strong>{detectedArtist || 'None'}</strong></p>
			{#if detectedArtist}
				<div class="question-buttons">
					{#each remainingQuestions.filter((q) => q.correct_artist === detectedArtist) as question}
						<button on:click={() => launchQuestion(question)}>Launch: {question.song_title}</button>
					{:else}
						<p class="warning">No questions available for this artist.</p>
					{/each}
				</div>
			{/if}
		</section>

		<div class="columns">
			<section class="list-view">
				<h3>Players ({players.length})</h3>
				<ul>
					{#each players.sort((a, b) => b.score - a.score) as player (player.id)}
						<li>
							<span>{player.name}</span><strong>{player.score} pts</strong>
						</li>
					{/each}
				</ul>
			</section>
			<section class="list-view">
				<h3>Remaining Questions ({remainingQuestions.length})</h3>
				<ul>
					{#each remainingQuestions as q}
						<li>{q.correct_artist} - {q.song_title}</li>
					{/each}
				</ul>
			</section>
			<section class="list-view">
				<h3>Played Questions ({playedQuestions.length})</h3>
				<ul>
					{#each playedQuestions as q}
						<li class="played">{q.correct_artist} - {q.song_title}</li>
					{/each}
				</ul>
			</section>
		</div>
	{:else}
		<!-- INACTIVE GAME STATE -->
		<section class="controls">
			<button on:click={startGame}>Start New Game</button>
		</section>
		{#if winners.length > 0}
			<div class="winner-banner">
				<h2>🏆 Last Game's {winners.length > 1 ? 'Winners' : 'Winner'} 🏆</h2>
				{#each winners as winner}
					<p>{winner.name} ({winner.score} pts)</p>
				{/each}
			</div>
		{/if}
	{/if}
</main>

<style>
	:global(body) {
		background-color: #121212;
		color: white;
		font-family: sans-serif;
	}
	.container {
		max-width: 1400px;
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
		display: flex;
		justify-content: center;
		gap: 1rem;
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
	.stop-button {
		border-color: #ff4136;
	}
	.stop-button:hover:not(:disabled) {
		background-color: #ff4136;
	}
	.dashboard-controls {
		border: 1px solid #555;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 2rem;
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
	.columns {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 2rem;
	}
	.list-view ul {
		list-style: none;
		padding: 1rem;
		background: #1e1e1e;
		border-radius: 8px;
		height: 400px;
		overflow-y: auto;
	}
	.list-view li {
		padding: 0.5rem;
		border-bottom: 1px solid #333;
		display: flex;
		justify-content: space-between;
	}
	.list-view li.played {
		color: #888;
		text-decoration: line-through;
	}
	.winner-banner {
		text-align: center;
		background-color: #1db954;
		padding: 1rem;
		border-radius: 8px;
		margin: 2rem 0;
	}
	.winner-banner h2 {
		color: white;
	}
	.warning {
		color: #ff4136;
	}
</style>