<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { RealtimeChannel } from '@supabase/supabase-js'; // Corrected
	import type { Player, GameSession } from '$lib/types'; // Corrected
	import { PUBLIC_SITE_URL } from '$env/static/public';

	let QRCodeComponent: any = null;
	let qrCodeValue = PUBLIC_SITE_URL;
	let players: Player[] = [];
	let subscription: RealtimeChannel;
	let activeSession: GameSession | null = null;
	let winner: Player | null = null;

	$: if (activeSession?.status === 'ENDED' && players.length > 0) {
		winner = players.reduce((prev, current) => (prev.score > current.score ? prev : current));
	} else {
		winner = null;
	}

	async function getInitialData() {
		const { data: sessions, error } = await supabase
			.from('game_sessions')
			.select('id, status, current_question_id, detected_artist')
			.or('status.eq.WAITING,status.eq.IN_PROGRESS,status.eq.ENDED')
			.order('created_at', { ascending: false })
			.limit(1);

		if (error) {
			console.error('Error fetching initial session:', error);
			return;
		}

		const session = sessions && sessions.length > 0 ? sessions[0] : null;
		activeSession = session;

		if (session) {
			const { data: initialPlayers } = await supabase
				.from('players')
				.select('*')
				.eq('game_session_id', session.id);
			players = initialPlayers || [];
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

	onMount(async () => {
		QRCodeComponent = (await import('svelte-qrcode')).default;
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
				<h1 class="game-title">Music Trivia</h1>
			</header>

			{#if winner}
				<div class="winner-banner">
					<h2>🏆 WINNER 🏆</h2>
					<p class="winner-name">{winner.name}</p>
					<p class="winner-score">{winner.score} POINTS</p>
				</div>
			{:else}
				<ul class="leaderboard">
					{#each players.sort((a, b) => b.score - a.score).slice(0, 10) as player, i}
						<li>
							<span class="rank">{i + 1}</span>
							<span class="name">{player.name}</span>
							<span class="score">{player.score}</span>
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<div class="waiting-wrapper">
				<h1 class="game-title">Music Trivia! 🎶</h1>
				<p class="tagline">Scan with your phone to join!</p>
				{#if QRCodeComponent && qrCodeValue}
					<div class="qr-code-container">
						<svelte:component this={QRCodeComponent} value={qrCodeValue} size={250} />
					</div>
				{/if}
			</div>
		{/if}
	</div>
</main>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&family=Open+Sans:wght@400;600&display=swap');

	:global(body) {
		background-color: #000000;
		color: white;
		font-family: 'Open Sans', sans-serif;
		overflow: hidden;
	}
	.container {
		width: 100vw;
		height: 100vh;
		padding: 2rem;
		box-sizing: border-box;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.game-title {
		font-family: 'Poppins', sans-serif;
		font-size: 3.5rem;
		color: #f0f8ff;
		text-align: center;
		text-shadow: 0 0 15px rgba(247, 37, 133, 0.7), 0 0 6px rgba(247, 37, 133, 0.9);
	}
	.leaderboard {
		list-style: none;
		padding: 0;
		max-width: 700px;
		margin: 1.5rem auto;
	}
	.leaderboard li {
		display: flex;
		align-items: center;
		background-color: rgba(255, 255, 255, 0.05);
		margin-bottom: 0.8rem;
		padding: 1rem;
		border-radius: 8px;
		border: 1px solid #7209b7;
		font-size: 1.8rem;
		font-weight: bold;
		transition: all 0.2s ease-in-out;
	}
	.leaderboard li:hover {
		transform: scale(1.02);
		border-color: #f72585;
	}
	.leaderboard .rank {
		color: #f72585;
		margin-right: 1.5rem;
		min-width: 40px;
		text-align: right;
	}
	.leaderboard .name {
		flex-grow: 1;
	}
	.leaderboard .score {
		color: #1db954;
	}
	.waiting-wrapper {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 2rem;
		text-align: center;
	}
	.waiting-wrapper .game-title {
		font-size: 6rem;
		margin-bottom: 0.5rem;
	}
	.waiting-wrapper .tagline {
		font-size: 2.2rem;
		color: #ccc;
		font-weight: bold;
		margin-bottom: 1.5rem;
	}
	.qr-code-container {
		background-color: white;
		padding: 15px;
		border-radius: 12px;
		box-shadow: 0 0 30px rgba(255, 255, 255, 0.7);
	}
	.winner-banner {
		text-align: center;
		margin-top: 5vh;
	}
	.winner-banner h2 {
		font-size: 4.5rem;
		color: #1db954;
	}
	.winner-banner .winner-name {
		font-size: 6rem;
		font-weight: bold;
		color: white;
		text-shadow: 0 0 25px #f72585;
	}
	.winner-banner .winner-score {
		font-size: 3.5rem;
		color: #1db954;
	}
</style>