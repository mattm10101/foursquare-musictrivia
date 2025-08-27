<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import type { Player, GameSession } from '$lib/types';

	let players: Player[] = [];
	let subscription: RealtimeChannel;
	let activeSession: GameSession | null = null;
	let winner: Player | null = null; // Single winner for simplicity on dashboard

	// This reactive statement will find the winner when the game ends
	$: if (activeSession?.status === 'ENDED' && players.length > 0) {
		winner = players.reduce((prev, current) => (prev.score > current.score ? prev : current));
	} else {
		winner = null;
	}

	async function getInitialData() {
		// Find the current active game session
		const { data: sessions } = await supabase
			.from('game_sessions')
			.select('id, status')
			.or('status.ilike.WAITING,status.ilike.IN_PROGRESS,status.ilike.ENDED')
			.order('created_at', { ascending: false })
			.limit(1);

		const session = sessions && sessions.length > 0 ? sessions[0] : null;
		activeSession = session;

		if (session) {
			// Get the players for that session
			const { data: initialPlayers } = await supabase
				.from('players')
				.select('*')
				.eq('game_session_id', session.id);
			players = initialPlayers || [];

			// Set up a subscription to listen for score changes
			setupSubscription(session.id);
		}
	}

	function setupSubscription(sessionId: string) {
		if (subscription) supabase.removeChannel(subscription);
		subscription = supabase
			.channel(`dashboard-listener:${sessionId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'players', filter: `game_session_id=eq.${sessionId}` },
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
		getInitialData();
	});

	onDestroy(() => {
		if (subscription) {
			supabase.removeChannel(subscription);
		}
	});
</script>

<main>
	<div class="container">
		{#if activeSession}
			<header>
				<h1>Music Trivia</h1>
			</header>

			{#if winner}
				<div class="winner-banner">
					<h2>🏆 WINNER 🏆</h2>
					<p class="winner-name">{winner.name}</p>
					<p class="winner-score">{winner.score} POINTS</p>
				</div>
			{:else}
				<ul class="leaderboard">
					{#each players.sort((a, b) => b.score - a.score).slice(0, 5) as player, i}
						<li>
							<span class="rank">{i + 1}</span>
							<span class="name">{player.name}</span>
							<span class="score">{player.score}</span>
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<div class="waiting">
				<h1>Music Trivia</h1>
				<p>Waiting for the host to start the game...</p>
				</div>
		{/if}
	</div>
</main>

<style>
	:global(body) {
		background-color: #121212;
		color: white;
		font-family: sans-serif;
	}
	.container {
		width: 100vw;
		height: 100vh;
		padding: 3rem;
		box-sizing: border-box;
		background: linear-gradient(160deg, #3a0ca3, #0c001f);
	}
	header h1 {
		font-size: 4rem;
		color: #f72585;
		text-align: center;
		text-shadow: 0 0 20px rgba(247, 37, 133, 0.7);
	}
	.leaderboard {
		list-style: none;
		padding: 0;
		max-width: 900px;
		margin: 2rem auto;
	}
	.leaderboard li {
		display: flex;
		align-items: center;
		background-color: rgba(0, 0, 0, 0.3);
		margin-bottom: 1rem;
		padding: 1.5rem;
		border-radius: 8px;
		border: 1px solid #7209b7;
		font-size: 2rem;
		font-weight: bold;
	}
	.leaderboard .rank {
		color: #f72585;
		margin-right: 2rem;
		min-width: 50px;
		text-align: right;
	}
	.leaderboard .name {
		flex-grow: 1;
	}
	.leaderboard .score {
		color: #1db954;
	}
	.waiting {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		height: 100%;
	}
	.waiting h1 {
		font-size: 6rem;
	}
	.waiting p {
		font-size: 2rem;
		color: #ccc;
	}
	.winner-banner {
		text-align: center;
		margin-top: 10vh;
	}
	.winner-banner h2 {
		font-size: 5rem;
		color: #1db954;
	}
	.winner-banner .winner-name {
		font-size: 7rem;
		font-weight: bold;
		color: white;
		text-shadow: 0 0 30px #f72585;
	}
	.winner-banner .winner-score {
		font-size: 4rem;
		color: #1db954;
	}
</style>