<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import { goto } from '$app/navigation';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import type { Player, GameSession } from '$lib/types';
	import { toast } from 'svelte-sonner';

	let players: Player[] = [];
	let playerSubscription: RealtimeChannel;
	let gameSubscription: RealtimeChannel;
	let currentPlayer: Player | null = null;
	let newName = '';
	let viewMode: 'loading' | 'pre-game' | 'post-game' = 'loading';
	let lastGameScore: number | null = null;

	async function updatePlayerName() {
		if (!newName.trim() || !currentPlayer) return;
		const { error } = await supabase
			.from('players')
			.update({ name: newName.trim() })
			.eq('id', currentPlayer.id);
		if (error) toast.error(error.message);
		else {
			toast.success('Name updated!');
			newName = '';
		}
	}

	async function exitGame() {
		if (!currentPlayer) return;
		if (confirm('Are you sure? You will lose your name and score and have to rejoin.')) {
			await supabase.from('players').delete().eq('id', currentPlayer.id);
			localStorage.removeItem('playerId');
			await goto('/');
		}
	}

	async function joinNextGame(newSessionId: string) {
		if (!currentPlayer) return;
		const { error } = await supabase
			.from('players')
			.update({ game_session_id: newSessionId, score: 0 })
			.eq('id', currentPlayer.id);
		if (error) toast.error(error.message);
		else window.location.reload();
	}

	function setupPreGameSubscriptions(sessionId: string) {
		if (playerSubscription) supabase.removeChannel(playerSubscription);
		playerSubscription = supabase
			.channel(`players:${sessionId}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
				loadPlayers(sessionId);
			})
			.subscribe();

		if (gameSubscription) supabase.removeChannel(gameSubscription);
		gameSubscription = supabase
			.channel(`game_sessions:${sessionId}`)
			.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions' }, (payload) => {
					if (payload.new.status === 'IN_PROGRESS') {
						goto('/play');
					}
				}
			)
			.subscribe();
	}

	async function loadPlayers(sessionId: string) {
		const { data } = await supabase.from('players').select('*').eq('game_session_id', sessionId);
		players = data || [];
	}

	onMount(async () => {
		const playerId = localStorage.getItem('playerId');
		if (!playerId) {
			goto('/');
			return;
		}

		// --- UPDATED QUERY LOGIC ---
		// Step 1: Get the player's own data first.
		const { data: playerData, error: playerError } = await supabase
			.from('players')
			.select('*')
			.eq('id', playerId)
			.single();

		if (playerError || !playerData) {
			toast.error('Could not find your player data. Please rejoin.');
			localStorage.removeItem('playerId');
			goto('/');
			return;
		}
		currentPlayer = playerData;

		// Step 2: Use the player's game_session_id to get the session data.
		const { data: sessionData, error: sessionError } = await supabase
			.from('game_sessions')
			.select('*')
			.eq('id', playerData.game_session_id)
			.single();

		if (sessionError || !sessionData) {
			toast.error('Could not find your game session. Please rejoin.');
			localStorage.removeItem('playerId');
			goto('/');
			return;
		}
		// --- END OF UPDATED LOGIC ---

		if (sessionData.status === 'ENDED') {
			viewMode = 'post-game';
			lastGameScore = currentPlayer.score;
			gameSubscription = supabase
				.channel('new-game-listener')
				.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_sessions' },
					(payload) => {
						if (payload.new.status === 'WAITING') {
							joinNextGame(payload.new.id);
						}
					}
				)
				.subscribe();
		} else {
			viewMode = 'pre-game';
			await loadPlayers(sessionData.id);
			setupPreGameSubscriptions(sessionData.id);
		}
	});

	onDestroy(() => {
		if (playerSubscription) supabase.removeChannel(playerSubscription);
		if (gameSubscription) supabase.removeChannel(gameSubscription);
	});
</script>

<main>
	{#if viewMode === 'loading'}
		<h1>Loading...</h1>
	{:else if viewMode === 'post-game'}
		<h1>Game Over!</h1>
		<p class="final-score">Your Final Score: <strong>{lastGameScore}</strong></p>
		<p>Waiting for the host to start the next round...</p>
		<div class="rename-form">
			<input type="text" bind:value={newName} placeholder="New name..." />
			<button on:click={updatePlayerName}>Update</button>
		</div>
		<button class="exit-button" on:click={exitGame}>Exit Game</button>
	{:else if viewMode === 'pre-game'}
		<h1>Waiting Room</h1>
		<p>Welcome, {currentPlayer?.name}! Waiting for the host to start...</p>
		<div class="rename-form">
			<input type="text" bind:value={newName} placeholder="Change your name..." />
			<button on:click={updatePlayerName}>Update</button>
		</div>
		<div class="player-list">
			<h2>Players Joined:</h2>
			<ul>
				{#each players as player (player.id)}
					<li>Player {player.player_number}: {player.name}</li>
				{/each}
			</ul>
		</div>
	{/if}
</main>

<style>
	main { font-family: sans-serif; text-align: center; padding: 2rem; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #121212; color: white; box-sizing: border-box; }
	h1 { color: #f72585; font-size: 3rem; }
	.final-score { font-size: 1.5rem; margin: 2rem 0; }
	.rename-form { margin: 2rem 0; display: flex; justify-content: center; gap: 0.5rem; }
	.rename-form input { padding: 0.5rem; border-radius: 4px; border: 1px solid #ccc; font-size: 1rem; }
	.rename-form button { padding: 0.5rem 1rem; border-radius: 4px; border: none; background-color: #1DB954; color: white; cursor: pointer; font-size: 1rem; }
	.exit-button { margin-top: 1rem; background-color: #ff4136; padding: 0.5rem 1rem; border-radius: 4px; border: none; color: white; cursor: pointer; font-size: 1rem; }
	.player-list { margin-top: 2rem; display: inline-block; text-align: left; }
	ul { list-style: none; padding: 0; }
	li { background-color: #3a0ca3; color: white; padding: 0.5rem 1rem; margin-bottom: 0.5rem; border-radius: 8px; }
</style>