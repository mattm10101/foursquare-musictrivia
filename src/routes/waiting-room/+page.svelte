<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import { goto } from '$app/navigation';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import type { Player } from '$lib/types';

	let players: Player[] = [];
	let playerSubscription: RealtimeChannel;
	let gameSubscription: RealtimeChannel;

	onMount(async () => {
		const playerId = localStorage.getItem('playerId');
		if (!playerId) {
			alert('Could not find your player ID. Please try rejoining.');
			await goto('/join');
			return;
		}

		const { data: playerData, error: playerError } = await supabase
			.from('players')
			.select('game_session_id')
			.eq('id', playerId)
			.single();

		if (playerError || !playerData) {
			alert('Error finding your game session. Please rejoin.');
			await goto('/join');
			return;
		}
		const sessionId = playerData.game_session_id;

		// Fetch initial players
		const { data: initialPlayers } = await supabase
			.from('players')
			.select('name, player_number')
			.eq('game_session_id', sessionId)
			.order('player_number');

		players = initialPlayers || [];

		// --- SUBSCRIPTION 1: Listen for NEW PLAYERS ---
		playerSubscription = supabase
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

		// --- SUBSCRIPTION 2: Listen for the GAME to START ---
		gameSubscription = supabase
			.channel(`game_sessions:${sessionId}`)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'game_sessions',
					filter: `id=eq.${sessionId}`
				},
				(payload) => {
					if (payload.new.status === 'IN_PROGRESS') {
						// The game has started! Navigate to the play screen.
						goto('/play');
					}
				}
			)
			.subscribe();
	});

	onDestroy(() => {
		// Clean up both subscriptions when the player leaves the page
		if (playerSubscription) {
			supabase.removeChannel(playerSubscription);
		}
		if (gameSubscription) {
			supabase.removeChannel(gameSubscription);
		}
	});
</script>

<main>
	<h1>Waiting Room</h1>
	<p>Waiting for the host to start the game...</p>

	<div class="player-list">
		<h2>Players Joined:</h2>
		<ul>
			{#each players as player (player.player_number)}
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
		padding: 0.5rem 1rem;
		margin-bottom: 0.5rem;
		border-radius: 8px;
	}
</style>