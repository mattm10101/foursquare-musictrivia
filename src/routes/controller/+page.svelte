<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { GameSession } from '$lib/types';

	let activeSession: GameSession | null = null;
	let pollingInterval: NodeJS.Timeout;
	let isPolling = false;
	let lastKnownArtist = '';
	let currentVdjArtist = '...';

	async function updateGameWithArtist(artistName: string) {
		if (!activeSession) return;

		console.log(`Updating game with new artist: ${artistName}`);
		const { error } = await supabase
			.from('game_sessions')
			.update({ detected_artist: artistName })
			.eq('id', activeSession.id);

		if (error) {
			console.error('Failed to update detected_artist:', error);
		}
	}

	function startPolling() {
		if (isPolling) return;
		console.log('Polling started...');
		isPolling = true;

		pollingInterval = setInterval(async () => {
			try {
				const response = await fetch('/api/vdj', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ script: 'get_artist' })
				});

				if (!response.ok) {
					const err = await response.json();
					throw new Error(err.message);
				}

				const data = await response.json();
				const artist = data.result;
				currentVdjArtist = artist || 'No artist playing';

				if (artist && artist !== lastKnownArtist) {
					lastKnownArtist = artist;
					await updateGameWithArtist(artist);
				}
			} catch (err: any) {
				currentVdjArtist = err.message || 'Connection Error';
				console.error(err.message);
				stopPolling();
			}
		}, 3000);
	}

	function stopPolling() {
		clearInterval(pollingInterval);
		isPolling = false;
		console.log('Polling stopped.');
	}

	// --- UPDATED onMount FUNCTION FOR DIAGNOSTICS ---
	onMount(async () => {
		console.log('Controller onMount: Fetching all game sessions...');
		const { data: sessions, error } = await supabase
			.from('game_sessions')
			.select('*'); // Select everything with no filters

		console.log('Controller onMount response:', { sessions, error });

		if (error) {
			alert('Failed to fetch sessions: ' + error.message);
			return;
		}

		if (sessions && sessions.length > 0) {
			// Manually find the latest IN_PROGRESS session in our code
			const inProgressSessions = sessions
				.filter((s) => s.status === 'IN_PROGRESS')
				.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

			activeSession = inProgressSessions.length > 0 ? inProgressSessions[0] : null;
			console.log('Found active session:', activeSession);
		} else {
			activeSession = null;
		}
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
	:global(body) {
		background-color: #121212;
		color: white;
		font-family: sans-serif;
	}
	.container {
		max-width: 800px;
		margin: 2rem auto;
		padding: 2rem;
		background-color: #1e1e1e;
		border-radius: 12px;
		border: 1px solid #7209b7;
	}
	h1,
	h3 {
		text-align: center;
		color: #f72585;
	}
	.status-panel {
		border: 1px solid #333;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 2rem;
	}
	p {
		font-size: 1.1rem;
	}
	.song-title strong {
		color: #1db954;
	}
	.status-panel p .active {
		color: #1db954;
		font-weight: bold;
	}
	.controls {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-top: 1rem;
	}
	button {
		padding: 0.5rem 1rem;
		font-size: 1rem;
		border-radius: 8px;
		border: 2px solid #b5179e;
		background-color: rgba(0, 0, 0, 0.3);
		color: white;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: #f72585;
		background-color: #f72585;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>