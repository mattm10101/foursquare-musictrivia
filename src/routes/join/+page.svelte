<script lang="ts">
	import { supabase } from '$lib/supabaseClient.js';
	import { goto } from '$app/navigation';
	import type { GameSession } from '$lib/types';

	let playerName: string = '';
	let isLoading: boolean = false;

	// This is our diagnostic function
	async function findActiveSession(): Promise<GameSession | null> {
		console.log('--- DIAGNOSTIC TEST START ---');
		console.log('Attempting to find active session...');

		// We will grab the last 5 sessions regardless of status
		const { data: sessions, error } = await supabase
			.from('game_sessions')
			.select('id, status')
			.order('created_at', { ascending: false })
			.limit(5);

		// Log the raw response from Supabase
		console.log('Raw Supabase response:', { sessions, error });

		if (error) {
			console.error('DATABASE ERROR:', error);
			return null;
		}

		if (!sessions || sessions.length === 0) {
			console.log('Query was successful but returned NO sessions.');
			return null;
		}

		// Now, let's filter for a 'WAITING' session in our code
		const waitingSession = sessions.find((s) => s.status.toUpperCase() === 'WAITING');
		console.log('Found a waiting session in the results:', waitingSession);
		console.log('--- DIAGNOSTIC TEST END ---');

		return waitingSession || null;
	}

	async function handleJoin() {
		if (!playerName.trim()) {
			alert('Please enter a name!');
			return;
		}
		isLoading = true;

		try {
			const session = await findActiveSession();

			if (!session) {
				throw new Error('No active game session found. Please tell the host to start a game!');
			}

			const { count: playerCount, error: countError } = await supabase
				.from('players')
				.select('*', { count: 'exact', head: true })
				.eq('game_session_id', session.id);

			if (countError) throw countError;

			const { data: newPlayer, error: insertError } = await supabase
				.from('players')
				.insert({
					name: playerName,
					game_session_id: session.id,
					player_number: (playerCount || 0) + 1
				})
				.select('id')
				.single();

			if (insertError) throw insertError;
			if (!newPlayer) throw new Error('Failed to create player.');

			localStorage.setItem('playerId', newPlayer.id);
			await goto('/waiting-room');
		} catch (error) {
			if (error instanceof Error) {
				alert(error.message);
			} else {
				alert('An unknown error occurred.');
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<main>
	<h1>Music Trivia</h1>
	<div class="join-box">
		<input type="text" bind:value={playerName} placeholder="Enter your name" disabled={isLoading} />
		<button on:click={handleJoin} disabled={isLoading}>
			{#if isLoading}
				Joining...
			{:else}
				Join Game
			{/if}
		</button>
	</div>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		text-align: center;
		font-family: sans-serif;
	}
	.join-box {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 2rem;
		width: 80%;
		max-width: 300px;
	}
	input {
		padding: 0.8rem;
		font-size: 1rem;
		border-radius: 8px;
		border: 1px solid #ccc;
	}
	button {
		padding: 0.8rem;
		font-size: 1rem;
		border-radius: 8px;
		border: none;
		background-color: #2c5ee8;
		color: white;
		cursor: pointer;
	}
	button:disabled {
		background-color: #aaa;
	}
</style>