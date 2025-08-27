<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { GameSession } from '$lib/types';

	const VDJ_URL = 'http://127.0.0.1:80'; // Using port 80 as confirmed

	let activeSession: GameSession | null = null;
	let pollingInterval: NodeJS.Timeout;
	let isPolling = false;
	let lastKnownArtist = '';
	let currentVdjArtist = '...';

	// This function's only job is to update the database
	async function updateDetectedArtist(artistName: string) {
		if (!activeSession) return;
		await supabase
			.from('game_sessions')
			.update({ detected_artist: artistName })
			.eq('id', activeSession.id);
	}

	function startPolling() {
		if (isPolling) return;
		isPolling = true;

		pollingInterval = setInterval(async () => {
			try {
				// We now fetch the artist, not just the title
				const response = await fetch(`${VDJ_URL}/query?script=get_artist`);
				if (!response.ok) throw new Error('VDJ not responding');
				const artist = await response.text();
				currentVdjArtist = artist || 'No artist playing';

				if (artist && artist !== lastKnownArtist) {
					console.log(`🎤 New artist detected: ${artist}`);
					lastKnownArtist = artist;
					await updateDetectedArtist(artist);
				}
			} catch (err) {
				currentVdjArtist = 'Connection Error';
				stopPolling();
			}
		}, 3000);
	}

	function stopPolling() {
		clearInterval(pollingInterval);
		isPolling = false;
	}

	onMount(async () => {
		// Find the active game session when the page loads
		const { data: sessions } = await supabase
			.from('game_sessions')
			.select('id, status, current_question_id')
			.eq('status', 'IN_PROGRESS')
			.limit(1);
		activeSession = sessions && sessions.length > 0 ? sessions[0] : null;
	});

	onDestroy(() => {
		stopPolling();
	});
</script>

<main>
	<div class="container">
		<h1>VDJ Controller</h1>
		<div class="status-panel">
			<h3>Live Status</h3>
			<p>Game Session: {activeSession ? 'IN_PROGRESS' : 'NONE'}</p>
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