<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import { goto } from '$app/navigation';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import type { Player } from '$lib/types';

	let players: Player[] = [];
	let playerSubscription: RealtimeChannel;
	let gameSubscription: RealtimeChannel;
	let currentPlayer: Player | null = null;
	let newName = '';

	async function updatePlayerName() {
		if (!newName.trim() || !currentPlayer) return;

		const { error } = await supabase
			.from('players')
			.update({ name: newName.trim() })
			.eq('id', currentPlayer.id);

		if (error) {
			alert(error.message);
		} else {
			// Optimistically update the local state
			currentPlayer.name = newName.trim();
			players = players.map((p) => (p.id === currentPlayer?.id ? currentPlayer : p));
			newName = '';
		}
	}

	onMount(async () => {
		const playerId = localStorage.getItem('playerId');
		if (!playerId) {
			await goto('/');
			return;
		}

		// Fetch the full current player data
		const { data: playerData, error: playerError } = await supabase
			.from('players')
			.select('*')
			.eq('id', playerId)
			.single();

		if (playerError || !playerData) {
			await goto('/');
			return;
		}
		currentPlayer = playerData;
		const sessionId = playerData.game_session_id;

		const { data: initialPlayers } = await supabase
			.from('players')
			.select('*')
			.eq('game_session_id', sessionId)
			.order('player_number');
		players = initialPlayers || [];

		// Listen for players joining AND updating their names
		playerSubscription = supabase
			.channel(`players:${sessionId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'players', filter: `game_session_id=eq.${sessionId}`},
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

		gameSubscription = supabase
			.channel(`game_sessions:${sessionId}`)
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}`},
				(payload) => {
					if (payload.new.status === 'IN_PROGRESS') {
						goto('/play');
					}
				}
			)
			.subscribe();
	});

	onDestroy(() => {
		if (playerSubscription) supabase.removeChannel(playerSubscription);
		if (gameSubscription) supabase.removeChannel(gameSubscription);
	});
</script>

<main>
	<h1>Waiting Room</h1>
	<p>Waiting for the host to start the game...</p>

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
</main>

<style>
	main {
		font-family: sans-serif;
		padding: 2rem;
		text-align: center;
	}
	.rename-form {
		margin: 2rem 0;
		display: flex;
		justify-content: center;
		gap: 0.5rem;
	}
	.rename-form input {
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #ccc;
	}
	.rename-form button {
		padding: 0.5rem 1rem;
		border-radius: 4px;
		border: none;
		background-color: #1DB954;
		color: white;
		cursor: pointer;
	}
	.player-list {
		margin-top: 2rem;
		display: inline-block;
		text-align: left;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		background-color: #f0f0f0;
		color: #333;
		padding: 0.5rem 1rem;
		margin-bottom: 0.5rem;
		border-radius: 8px;
	}
</style>