<script lang="ts">
	import { supabase } from '$lib/supabaseClient.js';
	import { goto } from '$app/navigation';
	import type { GameSession } from '$lib/types';

	let playerName: string = '';
	let isLoading: boolean = false;

	async function findActiveSession(): Promise<GameSession | null> {
		// UPDATED QUERY: Look for a session that is either WAITING or IN_PROGRESS
		const { data: sessions, error } = await supabase
			.from('game_sessions')
			.select('id, status')
			.or('status.ilike.WAITING,status.ilike.IN_PROGRESS')
			.order('created_at', { ascending: false })
			.limit(1);

		if (error) {
			console.error('Error finding session:', error);
			return null;
		}

		return sessions && sessions.length > 0 ? sessions[0] : null;
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
            
            // If the game is already in progress, go straight to the play screen
			if (session.status.toUpperCase() === 'IN_PROGRESS') {
                await goto('/play');
            } else {
                await goto('/waiting-room');
            }

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