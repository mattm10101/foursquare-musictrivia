<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import type { Player, GameSession } from '$lib/types';
	import { PUBLIC_SITE_URL } from '$env/static/public';

	let QRCodeComponent: any = null;
	let players: Player[] = [];
	let activeSession: GameSession | null = null;
	let winners: Player[] = [];
	let subscriptions: RealtimeChannel[] = [];

	async function handleSessionUpdate(session: GameSession) {
		activeSession = session;
		if (
			session.dashboard_view === 'LEADERBOARD' ||
			(session.status === 'ENDED' && session.dashboard_view === 'WINNER')
		) {
			await loadPlayers(session.id);
		}
	}

	async function getInitialState() {
		const { data: sessions } = await supabase
			.from('game_sessions')
			.select('*')
			.in('status', ['WAITING', 'IN_PROGRESS', 'ENDED'])
			.order('created_at', { ascending: false })
			.limit(1);

		if (sessions && sessions.length > 0) {
			const session = sessions[0];
			handleSessionUpdate(session);
			setupSubscriptions(session.id);
		}
	}

	async function loadPlayers(sessionId: string) {
		const { data } = await supabase.from('players').select('*').eq('game_session_id', sessionId);
		players = data || [];
		if (activeSession?.status === 'ENDED' && players.length > 0) {
			const maxScore = Math.max(...players.map((p) => p.score));
			winners = players.filter((p) => p.score === maxScore);
		}
	}

	function setupSubscriptions(sessionId: string) {
		subscriptions.forEach((sub) => supabase.removeChannel(sub));
		subscriptions = [];

		const sessionSub = supabase
			.channel(`dashboard-session:${sessionId}`)
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
				(payload) => {
					handleSessionUpdate(payload.new as GameSession);
				}
			)
			.subscribe();

		const playerSub = supabase
			.channel(`dashboard-players:${sessionId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'players', filter: `game_session_id=eq.${sessionId}` },
				() => {
					if (activeSession) loadPlayers(activeSession.id);
				}
			)
			.subscribe();
		subscriptions = [sessionSub, playerSub];
	}

	onMount(async () => {
		QRCodeComponent = (await import('svelte-qrcode')).default;
		getInitialState();
	});
	onDestroy(() => {
		subscriptions.forEach((sub) => supabase.removeChannel(sub));
	});
</script>

<main>
	<div class="container">
		{#if !activeSession || activeSession.dashboard_view === 'QR_CODE'}
			<div class="view-wrapper">
				<h1 class="game-title">Music Trivia! 🎶</h1>
				<p class="tagline">Scan with your phone to join!</p>
				{#if QRCodeComponent}
					<div class="qr-code-container">
						<svelte:component this={QRCodeComponent} value={PUBLIC_SITE_URL} size={250} />
					</div>
				{/if}
			</div>
		{:else if activeSession.dashboard_view === 'LEADERBOARD'}
			<div class="view-wrapper">
				<h1 class="game-title">Leaderboard</h1>
				<ul class="leaderboard">
					{#each players.sort((a, b) => b.score - a.score).slice(0, 10) as player, i}
						<li>
							<span class="rank">{i + 1}</span>
							<span class="name">{player.name}</span>
							<span class="score">{player.score} pts</span>
						</li>
					{/each}
				</ul>
			</div>
		{:else if activeSession.dashboard_view === 'INSTRUCTIONS'}
			<div class="view-wrapper">
				<h1 class="game-title">How to Play</h1>
				<div class="instructions">
					<p>When a new song plays, a question will appear on your phone.</p>
					<p>Guess the correct artist as fast as you can to earn more points!</p>
				</div>
			</div>
		{:else if activeSession.dashboard_view === 'WINNER' && winners.length > 0}
			<div class="view-wrapper">
				<div class="winner-banner">
					<h2>🏆 {winners.length > 1 ? 'Winners!' : 'Winner!'} 🏆</h2>
					{#each winners as winner}
						<p class="winner-name">{winner.name}</p>
						<p class="winner-score">{winner.score} POINTS</p>
					{/each}
				</div>
			</div>
		{:else}
			<div class="view-wrapper">
				<h1>Music Trivia</h1>
				<p>Waiting for the host to start the game...</p>
			</div>
		{/if}
	</div>
</main>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&family=Open+Sans:wght@400;600&display=swap');
	:global(body) {
		background-color: #000;
		color: white;
		font-family: 'Open Sans', sans-serif;
		overflow: hidden;
	}
	.container {
		width: 100vw;
		height: 100vh;
		padding: 2rem;
		box-sizing: border-box;
	}
	.view-wrapper {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		height: 100%;
	}
	.game-title {
		font-family: 'Poppins', sans-serif;
		font-size: 4rem;
		color: #f0f8ff;
		text-align: center;
		text-shadow: 0 0 15px rgba(247, 37, 133, 0.7);
	}
	.leaderboard {
		list-style: none;
		padding: 0;
		width: 100%;
		max-width: 900px;
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
		backdrop-filter: blur(5px);
	}
	.leaderboard .rank {
		color: #f72585;
		margin-right: 1.5rem;
		min-width: 40px;
	}
	.leaderboard .name {
		flex-grow: 1;
		text-align: left;
	}
	.leaderboard .score {
		color: #1db954;
	}
	.tagline {
		font-size: 2.2rem;
		color: #ccc;
		margin-top: 1rem;
	}
	.instructions p {
		font-size: 2rem;
		line-height: 1.6;
	}
	.qr-code-container {
		background-color: white;
		padding: 15px;
		border-radius: 12px;
		margin-top: 2rem;
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