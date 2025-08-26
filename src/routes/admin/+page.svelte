<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	// --- TYPE DEFINITIONS ---
	type Player = { name: string; player_number: number };
	type GameSession = { id: string; status: string };

	// --- STATE VARIABLES ---
	let players: Player[] = [];
	let subscription: RealtimeChannel;
	let activeSession: GameSession | null = null;
	let isLoading = false;

	// --- DATA FETCHING & REALTIME ---

	async function loadPlayers(sessionId: string) {
		const { data: initialPlayers } = await supabase
			.from('players')
			.select('name, player_number')
			.eq('game_session_id', sessionId)
			.order('player_number');
		players = initialPlayers || [];
	}

	function setupSubscription(sessionId: string) {
		if (subscription) {
			supabase.removeChannel(subscription);
		}

		subscription = supabase
			.channel(`players:${sessionId}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'players',
					filter: `game_session_id=eq.${sessionId}`
				},
				(payload) => {
					players = [...players, payload.new as Player];
				}
			)
			.subscribe();
	}

	// Helper function to update the UI with a session's data
	async function updateUIWithSession(session: GameSession) {
		activeSession = session;
		await loadPlayers(session.id);
		setupSubscription(session.id);
	}

	async function checkForActiveSession() {
		isLoading = true;
		const { data: sessions, error } = await supabase
			.from('game_sessions')
			.select('id, status')
			.ilike('status', 'WAITING')
			.order('created_at', { ascending: false })
			.limit(1);

		if (error) {
			alert(error.message);
			activeSession = null;
		} else {
			const session = sessions && sessions.length > 0 ? sessions[0] : null;
			if (session) {
				await updateUIWithSession(session);
			} else {
				activeSession = null;
				players = [];
			}
		}
		isLoading = false;
	}

	// --- LIFECYCLE HOOKS ---
	onMount(() => {
		checkForActiveSession();
	});

	onDestroy(() => {
		if (subscription) {
			supabase.removeChannel(subscription);
		}
	});

	// --- UI EVENT HANDLERS ---

	async function createNewGame() {
		isLoading = true;
		const { data: newSessions, error } = await supabase
			.from('game_sessions')
			.insert({ created_at: new Date().toISOString() })
			.select();

		if (error) {
			alert(error.message);
		} else if (newSessions && newSessions.length > 0) {
			await updateUIWithSession(newSessions[0]);
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
			// Manually update status and trigger Svelte's reactivity
			activeSession.status = 'IN_PROGRESS';
			activeSession = activeSession;
		}
		isLoading = false;
	}
</script>

<main>
	<h1>Admin Control Panel</h1>

	{#if activeSession}
		<p><strong>Game Status:</strong> {activeSession.status}</p>
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
			{#each players as player (player.player_number)}
				<li>Player {player.player_number}: {player.name}</li>
			{:else}
				<li>No players have joined yet.</li>
			{/each}
		</ul>
	</div>
</main>

<style>
	main {
		font-family: sans-serif;
		padding: 2rem;
	}
	.controls {
		margin-bottom: 2rem;
	}
	button {
		padding: 0.8rem 1.5rem;
		font-size: 1.2rem;
		border-radius: 8px;
		border: none;
		background-color: #1db954;
		color: white;
		cursor: pointer;
		min-width: 200px;
	}
	button:disabled {
		background-color: #aaa;
	}
	.player-list {
		margin-top: 2rem;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		background-color: #f0f0f0;
		padding: 0.5rem 1rem;
		margin-bottom: 0.5rem;
		border-radius: 8px;
	}
</style>