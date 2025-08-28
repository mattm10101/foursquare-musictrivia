<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import type { Player, GameSession } from '$lib/types';
	import { toast } from 'svelte-sonner';

	type TriviaQuestion = { id: number; song_title: string; correct_artist: string; played_at: string | null; };

	let players: Player[] = [];
	let remainingQuestions: TriviaQuestion[] = [];
	let playedQuestions: TriviaQuestion[] = [];
	let activeSession: GameSession | null = null;
	let isLoading = false;
	let subscriptions: RealtimeChannel[] = [];

	async function fetchAllQuestions() {
		const { data, error } = await supabase.from('trivia_questions').select('*').order('id');
		if (data) {
			remainingQuestions = data.filter((q) => !q.played_at);
			playedQuestions = data.filter((q) => !!q.played_at);
		}
		if (error) toast.error(error.message);
	}

	async function loadPlayers(sessionId: string) {
		const { data } = await supabase.from('players').select('*').eq('game_session_id', sessionId);
		players = data || [];
	}
	
	function setupSubscriptions(sessionId: string) {
		subscriptions.forEach(sub => supabase.removeChannel(sub));
		subscriptions = [];
		const playerSub = supabase.channel(`admin-players:${sessionId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => loadPlayers(sessionId)).subscribe();
		const questionSub = supabase.channel('admin-questions').on('postgres_changes', { event: '*', schema: 'public', table: 'trivia_questions' }, fetchAllQuestions).subscribe();
		subscriptions = [playerSub, questionSub];
	}

	async function getInitialState() {
		isLoading = true;
		const { data: sessions } = await supabase.from('game_sessions').select('*').in('status', ['WAITING', 'IN_PROGRESS']).order('created_at', { ascending: false }).limit(1);
		activeSession = sessions && sessions.length > 0 ? sessions[0] : null;

		if (activeSession) {
			await loadPlayers(activeSession.id);
			await fetchAllQuestions();
			setupSubscriptions(activeSession.id);
		}
		isLoading = false;
	}

	onMount(getInitialState);
	onDestroy(() => { subscriptions.forEach(sub => supabase.removeChannel(sub)); });

	// --- Simplified Game Controls ---
	async function startGame() {
		isLoading = true;
		await supabase.from('trivia_questions').update({ played_at: null }).not('played_at', 'is', null);
		await supabase.from('players').delete().not('id', 'is', null);
		const { data: newSessions } = await supabase.from('game_sessions').insert({ created_at: new Date().toISOString(), status: 'IN_PROGRESS', current_question_id: 1, dashboard_view: 'LEADERBOARD' }).select();
		if (newSessions && newSessions.length > 0) {
			toast.success('New game started!');
			await getInitialState();
		}
		isLoading = false;
	}
	
	async function endGame() {
		if (!activeSession) return;
		if (confirm('Are you sure you want to end the game?')) {
			isLoading = true;
			await supabase.from('game_sessions').update({ status: 'ENDED', dashboard_view: 'WINNER' }).eq('id', activeSession.id);
			activeSession = null;
			isLoading = false;
		}
	}
	
	async function nextQuestion() {
		if (!activeSession) return;
		const totalQuestions = remainingQuestions.length + playedQuestions.length;
		const nextId = activeSession.current_question_id + 1;

		if (nextId > totalQuestions) {
			toast.info('Last question reached! Ending game.');
			await endGame();
			return;
		}
		await supabase.from('game_sessions').update({ current_question_id: nextId }).eq('id', activeSession.id);
		activeSession.current_question_id = nextId; // Optimistic update
	}
	
	async function setDashboardView(view: 'QR_CODE' | 'LEADERBOARD' | 'INSTRUCTIONS') {
		if (!activeSession) return;
		const { error } = await supabase.from('game_sessions').update({ dashboard_view: view }).eq('id', activeSession.id);
		if (error) toast.error(error.message);
		else {
			toast.success(`Dashboard now showing ${view.replace('_', ' ')}`);
			activeSession.dashboard_view = view;
		}
	}
</script>

<main class="container">
	<h1>Admin Mission Control</h1>

	<details class="container-box" open>
		<summary><h2>Game Controls</h2></summary>
		<div class="controls">
			{#if !activeSession || activeSession.status === 'ENDED'}
				<button on:click={startGame} disabled={isLoading}>Start New Game</button>
			{:else}
				<button on:click={nextQuestion} disabled={isLoading}>Next Question →</button>
				<button on:click={endGame} class="stop-button" disabled={isLoading}>End Game</button>
				<button on:click={() => endGame().then(startGame)} disabled={isLoading}>Restart Game</button>
			{/if}
		</div>
	</details>

	<details class="container-box" open>
		<summary><h2>Dashboard Controls</h2></summary>
		<div class="controls">
			<button on:click={() => setDashboardView('QR_CODE')} class:active={activeSession?.dashboard_view === 'QR_CODE'}>
				Show QR Code
			</button>
			<button on:click={() => setDashboardView('LEADERBOARD')} class:active={activeSession?.dashboard_view === 'LEADERBOARD'}>
				Show Leaderboard
			</button>
			<button on:click={() => setDashboardView('INSTRUCTIONS')} class:active={activeSession?.dashboard_view === 'INSTRUCTIONS'}>
				Show Instructions
			</button>
		</div>
	</details>

	<details class="container-box" open>
		<summary><h2>Game Data</h2></summary>
		<div class="columns">
			<section class="list-view">
				<h3>Remaining ({remainingQuestions.length})</h3>
				<ul>{#each remainingQuestions as q}<li>{q.correct_artist} - {q.song_title}</li>{/each}</ul>
			</section>
			<section class="list-view">
				<h3>Played ({playedQuestions.length})</h3>
				<ul>{#each playedQuestions as q}<li class="played">{q.correct_artist} - {q.song_title}</li>{/each}</ul>
			</section>
			<section class="list-view">
				<h3>Players ({players.length})</h3>
				<ul>{#each players.sort((a, b) => b.score - a.score) as player}<li><span>{player.name}</span><strong>{player.score} pts</strong></li>{/each}</ul>
			</section>
		</div>
	</details>
	
	<details class="container-box">
		<summary><h2>Games (Playlists)</h2></summary>
		<div class="controls">
			<button disabled>Load Game</button>
			<button disabled>Add New Game</button>
		</div>
		<p style="text-align:center; color: #888;">(Functionality for managing playlists will be built next.)</p>
	</details>
</main>

<style>
	:global(body) { background-color: #121212; color: white; font-family: sans-serif; }
	.container { max-width: 1400px; margin: 2rem auto; padding: 1rem; }
	h1 { text-align: center; color: #f72585; font-size: 2.5rem; }
	.container-box { border: 1px solid #333; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; }
	.container-box summary { cursor: pointer; font-size: 1.5rem; color: #f72585; }
	.container-box summary h2 { display: inline; }
	.controls { display: flex; justify-content: center; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; }
	button { padding: 0.6rem 1.2rem; font-size: 1rem; border-radius: 8px; border: 2px solid #b5179e; background-color: rgba(0, 0, 0, 0.3); color: white; cursor: pointer; transition: all 0.2s; }
	button:hover:not(:disabled) { border-color: #f72585; }
	button.active { border-color: #f72585; background-color: #f72585; box-shadow: 0 0 10px #f72585; }
	.stop-button { border-color: #ff4136; }
	.stop-button:hover:not(:disabled) { background-color: #ff4136; }
	.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-top: 1rem; }
	.list-view h3 { margin-top: 0; text-align: center; }
	.list-view ul { list-style: none; padding: 1rem; background: #1e1e1e; border-radius: 8px; height: 300px; overflow-y: auto; }
	.list-view li { padding: 0.5rem; border-bottom: 1px solid #333; display: flex; justify-content: space-between; }
	.list-view li.played { color: #888; text-decoration: line-through; }
</style>