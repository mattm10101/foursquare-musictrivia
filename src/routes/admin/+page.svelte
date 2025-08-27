<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import type { Player, GameSession } from '$lib/types';

	let players: Player[] = [];
	let subscription: RealtimeChannel;
	let activeSession: GameSession | null = null;
	let isLoading = false;
	let winners: Player[] = [];

	$: if (activeSession?.status === 'ENDED' && players.length > 0) {
		const maxScore = Math.max(...players.map((p) => p.score));
		winners = players.filter((p) => p.score === maxScore);
	} else {
		winners = [];
	}

	async function checkForActiveSession() {
		isLoading = true;
		const { data: sessions, error } = await supabase
			.from('game_sessions')
			.select('id, status, current_question_id')
			.or('status.ilike.WAITING,status.ilike.IN_PROGRESS,status.ilike.ENDED')
			.order('created_at', { ascending: false })
			.limit(1);

		if (error) {
			alert(error.message);
			activeSession = null;
		} else {
			activeSession = sessions && sessions.length > 0 ? sessions[0] : null;
		}
		if (activeSession) {
			await loadPlayers(activeSession.id);
			setupSubscription(activeSession.id);
		} else {
			players = [];
		}
		isLoading = false;
	}

	async function loadPlayers(sessionId: string) {
		const { data: initialPlayers } = await supabase
			.from('players')
			.select('*')
			.eq('game_session_id', sessionId)
			.order('player_number');
		players = initialPlayers || [];
	}

	function setupSubscription(sessionId: string) {
		if (subscription) supabase.removeChannel(subscription);
		subscription = supabase
			.channel(`players:${sessionId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'players',
					filter: `game_session_id=eq.${sessionId}`
				},
				(payload) => {
					if (payload.eventType === 'INSERT') {
						players = [...players, payload.new as Player];
					}
					if (payload.eventType === 'UPDATE') {
						const updatedPlayer = payload.new as Player;
						players = players.map((p) => (p.id === updatedPlayer.id ? updatedPlayer : p));
					}
				}
			)
			.subscribe();
	}

	onMount(() => {
		checkForActiveSession();
	});
	onDestroy(() => {
		if (subscription) {
			supabase.removeChannel(subscription);
		}
	});

	async function createNewGame() {
		isLoading = true;
		winners = [];
		const { data: newSessions, error } = await supabase
			.from('game_sessions')
			.insert({ created_at: new Date().toISOString() })
			.select();
		if (error) {
			alert(error.message);
		} else if (newSessions && newSessions.length > 0) {
			activeSession = newSessions[0];
			if (activeSession) {
				await loadPlayers(activeSession.id);
				setupSubscription(activeSession.id);
			}
		}
		isLoading = false;
	}

	async function startGame() {
		if (!activeSession) return;
		isLoading = true;
		const { error } = await supabase
			.from('game_sessions')
			.update({ status: 'IN_PROGRESS', current_question_id: 1 })
			.eq('id', activeSession.id);
		if (error) {
			alert('Error starting game: ' + error.message);
		} else {
			alert('Game started!');
			activeSession.status = 'IN_PROGRESS';
			activeSession.current_question_id = 1;
			activeSession = activeSession;
		}
		isLoading = false;
	}
</script>

<main>
	<div class="container">
		<h1>Admin Control Panel</h1>

		{#if winners.length > 0}
			<div class="winner-banner">
				<h2>🏆 {winners.length > 1 ? 'Winners!' : 'Winner!'} 🏆</h2>
				{#each winners as winner}
					<p>{winner.name} ({winner.score} pts)</p>
				{/each}
			</div>
		{/if}

		{#if activeSession}
			<p>
				<strong>Game Status:</strong> {activeSession.status}
				{#if activeSession.status === 'IN_PROGRESS'}
					| <strong>Question:</strong> {activeSession.current_question_id}
				{/if}
			</p>
			<div class="controls">
				<button on:click={startGame} disabled={activeSession.status !== 'WAITING' || isLoading}>
					Start Game
				</button>
			</div>
		{:else}
			<p><strong>Game Status:</strong> No active game found.</p>
			<div class="controls">
				<button on:click={createNewGame} disabled={isLoading}> Create New Game </button>
			</div>
		{/if}

		<div class="player-list">
			<h2>Players Joined ({players.length}):</h2>
			<ul>
				{#each players.sort((a, b) => b.score - a.score) as player (player.id)}
					<li>
						<span>Player {player.player_number}: {player.name}</span>
						<strong>{player.score} pts</strong>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</main>

<style>
	:global(body) {
		background-color: #121212;
		color: white;
		font-family: sans-serif;
	}
	.container {
		max-width: 800px;
		margin: 2rem auto;
		padding: 2rem;
		background-color: #1e1e1e;
		border-radius: 12px;
		border: 1px solid #7209b7;
	}
	h1,
	h2 {
		text-align: center;
		color: #f72585;
	}
	p {
		text-align: center;
		font-size: 1.2rem;
		margin-bottom: 2rem;
	}
	.controls {
		text-align: center;
		margin-bottom: 2rem;
		display: flex;
		gap: 1rem;
		justify-content: center;
	}
	button {
		padding: 0.8rem 1.5rem;
		font-size: 1.2rem;
		border-radius: 8px;
		border: 2px solid #b5179e;
		background-color: rgba(0, 0, 0, 0.3);
		color: white;
		cursor: pointer;
		transition: all 0.2s ease-in-out;
	}
	button:hover:not(:disabled) {
		border-color: #f72585;
		background-color: #f72585;
	}
	button:disabled {
		background-color: #333;
		border-color: #555;
		cursor: not-allowed;
		opacity: 0.6;
	}
	.player-list {
		margin-top: 2rem;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background-color: #3a0ca3;
		padding: 0.8rem 1.2rem;
		margin-bottom: 0.5rem;
		border-radius: 8px;
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
		margin-bottom: 0.5rem;
	}
	.winner-banner p {
		margin: 0;
		font-size: 1rem;
	}
</style>