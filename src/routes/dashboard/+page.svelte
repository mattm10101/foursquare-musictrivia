<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import type { Player, GameSession } from '$lib/types';
	import { PUBLIC_SITE_URL } from '$env/static/public';
	import './styles.css'; // Import the new CSS file

	let QRCodeComponent: any = null;
	let qrCodeValue = PUBLIC_SITE_URL;
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
		const { data: sessions, error } = await supabase
			.from('game_sessions')
			.select('*')
			.in('status', ['WAITING', 'IN_PROGRESS', 'ENDED'])
			.order('created_at', { ascending: false })
			.limit(1);
		
		if (error){
			console.error(error);
			return;
		}

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
					<div class="qr-code-animated-border">
						<div class="qr-code-container">
							<svelte:component this={QRCodeComponent} value={PUBLIC_SITE_URL} size={250} />
						</div>
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