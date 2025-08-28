<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { GameSession } from '$lib/types';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	let activeSession: GameSession | null = null;
	let pollingInterval: NodeJS.Timeout;
	let isPolling = false;
	let lastKnownArtist = '';
	let currentVdjArtist = '...';
	let sessionListener: RealtimeChannel;

	async function updateGameWithArtist(artistName: string) {
		if (!activeSession) return;
		await supabase.from('game_sessions').update({ detected_artist: artistName }).eq('id', activeSession.id);
	}

	function startPolling() {
		if (isPolling) return;
		isPolling = true;
		pollingInterval = setInterval(async () => {
			try {
				const response = await fetch('/api/vdj', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ script: 'get_artist' })
				});
				if (!response.ok) throw new Error((await response.json()).message);

				const data = await response.json();
				const artist = data.result;
				currentVdjArtist = artist || 'No artist playing';

				if (artist && artist !== lastKnownArtist) {
					lastKnownArtist = artist;
					await updateGameWithArtist(artist);
				}
			} catch (err: any) {
				currentVdjArtist = err.message || 'Connection Error';
				stopPolling();
			}
		}, 3000);
	}

	function stopPolling() {
		clearInterval(pollingInterval);
		isPolling = false;
	}

	onMount(() => {
		// This subscription now listens for ANY game session change
		sessionListener = supabase
			.channel('controller-session-listener')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions' }, (payload) => {
				// We need to find the latest IN_PROGRESS session from all sessions
				supabase
					.from('game_sessions')
					.select('*')
					.eq('status', 'IN_PROGRESS')
					.order('created_at', { ascending: false })
					.limit(1)
					.then(({ data }) => {
						const session = data && data.length > 0 ? data[0] : null;
						activeSession = session;
						if (!session) {
							stopPolling(); // If game ends, stop polling
						}
					});
			})
			.subscribe();
		
		// Also check the state once on load
		sessionListener.emit('postgres_changes', {});
	});

	onDestroy(() => {
		stopPolling();
		if (sessionListener) supabase.removeChannel(sessionListener);
	});
</script>

<main>
	<div class="container">
		<h1>VDJ Controller</h1>
		<div class="status-panel">
			<h3>Live Status</h3>
			<p>Game Session: {activeSession ? activeSession.status : 'NONE'}</p>
			<p>Polling: <span class:active={isPolling}>{isPolling ? 'ACTIVE' : 'STOPPED'}</span></p>
			<p class="song-title">Current VDJ Artist: <strong>{currentVdjArtist}</strong></p>
			<div class="controls">
				<button on:click={startPolling} disabled={!activeSession || isPolling}>Start Polling</button>
				<button on:click={stopPolling} disabled={!isPolling}>Stop Polling</button>
			</div>
		</div>
	</div>
</main>

<style>
	:global(body) { background-color: #121212; color: white; font-family: sans-serif; }
	.container { max-width: 800px; margin: 2rem auto; padding: 2rem; background-color: #1e1e1e; border-radius: 12px; border: 1px solid #7209b7; }
	h1, h3 { text-align: center; color: #f72585; }
	.status-panel { border: 1px solid #333; border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; }
	p { font-size: 1.1rem; }
	.song-title strong { color: #1DB954; }
	.status-panel p .active { color: #1DB954; font-weight: bold; }
	.controls { display: flex; gap: 1rem; justify-content: center; margin-top: 1rem; }
	button { padding: 0.5rem 1rem; font-size: 1rem; border-radius: 8px; border: 2px solid #b5179e; background-color: rgba(0, 0, 0, 0.3); color: white; cursor: pointer; }
	button:hover:not(:disabled) { border-color: #f72585; background-color: #f72585; }
	button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>