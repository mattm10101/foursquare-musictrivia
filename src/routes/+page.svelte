<script lang="ts">
	import { supabase } from '$lib/supabaseClient.js';
	import { goto } from '$app/navigation';
	import type { GameSession } from '$lib/types';

	let playerName: string = '';
	let isLoading: boolean = false;

	async function findActiveSession(): Promise<GameSession | null> {
		const { data: sessions, error } = await supabase
			.from('game_sessions')
			.select('id, status, current_question_id')
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
			alert('Please enter your name to join the fun!');
			return;
		}
		isLoading = true;

		try {
			const session = await findActiveSession();

			if (!session) {
				throw new Error('No active game session found! Please tell the host to kick off the party.');
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
			if (!newPlayer) throw new Error('Failed to create player. Try again!');

			localStorage.setItem('playerId', newPlayer.id);

			if (session.status.toUpperCase() === 'IN_PROGRESS') {
				await goto('/play');
			} else {
				await goto('/waiting-room');
			}
		} catch (error) {
			if (error instanceof Error) {
				alert(error.message);
			} else {
				alert('An unexpected error occurred. Let the host know!');
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<main>
	<div class="background-gradient" /> <div class="content-wrapper">
		<h1 class="game-title">Music Trivia! 🎶</h1>
		<p class="tagline">Get ready to test your tunes!</p>
		<div class="join-box">
			<input type="text" bind:value={playerName} placeholder="Your awesome name" disabled={isLoading} />
			<button on:click={handleJoin} disabled={isLoading}>
				{#if isLoading}
					Rocking In...
				{:else}
					Join The Jam!
				{/if}
			</button>
		</div>
	</div>
</main>

<style>
	/* Import a cool font from Google Fonts */
	@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&family=Open+Sans:wght@400;600&display=swap');

	:global(body) {
		margin: 0;
		font-family: 'Open Sans', sans-serif;
		background-color: #1a1a2e; /* Dark background as fallback */
		color: #e0e0e0; /* Light text for contrast */
		overflow: hidden; /* Hide overflow from background animation */
	}

	main {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		text-align: center;
		padding: 1rem;
		z-index: 1; /* Ensure content is above background */
	}

	.background-gradient {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #6a0572, #ab3c7c, #f76b1c, #f32d3d);
		background-size: 400% 400%;
		animation: gradientAnimation 15s ease infinite;
		z-index: 0;
	}

	@keyframes gradientAnimation {
		0% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
		100% {
			background-position: 0% 50%;
		}
	}

	.content-wrapper {
		position: relative; /* Position content above gradient */
		z-index: 2;
		background-color: rgba(0, 0, 0, 0.6); /* Slightly transparent dark overlay */
		padding: 2.5rem 1.5rem;
		border-radius: 15px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
		max-width: 90%;
		width: 400px;
		backdrop-filter: blur(5px); /* Frosted glass effect */
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.game-title {
		font-family: 'Poppins', sans-serif;
		font-size: 2.8rem;
		color: #f0f8ff; /* A bright, welcoming color */
		margin-bottom: 0.5rem;
		text-shadow: 0 0 15px rgba(247, 37, 133, 0.7), 0 0 5px rgba(247, 37, 133, 0.9); /* Neon glow */
	}

	.tagline {
		font-family: 'Open Sans', sans-serif;
		font-size: 1.1rem;
		color: #a0a0ff;
		margin-bottom: 2rem;
	}

	.join-box {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
		margin-top: 2rem;
		width: 100%; /* Ensure it fills the content wrapper */
	}

	input {
		padding: 1rem 1.2rem;
		font-size: 1.1rem;
		border-radius: 10px;
		border: 2px solid #5a189a; /* Purple border */
		background-color: #2c0657; /* Darker purple input background */
		color: #e0e0e0;
		outline: none;
		transition: all 0.3s ease;
	}

	input::placeholder {
		color: #a0a0a0;
	}

	input:focus {
		border-color: #f72585; /* Pink on focus */
		box-shadow: 0 0 10px rgba(247, 37, 133, 0.5);
	}

	button {
		padding: 1rem 1.2rem;
		font-size: 1.2rem;
		border-radius: 10px;
		border: none;
		background: linear-gradient(90deg, #f72585, #b5179e); /* Pink to purple gradient */
		color: white;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.3s ease;
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
	}

	button:hover:not(:disabled) {
		transform: translateY(-3px);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
		filter: brightness(1.1); /* Slightly brighter on hover */
	}

	button:disabled {
		background: linear-gradient(90deg, #888, #555);
		cursor: not-allowed;
		opacity: 0.7;
		box-shadow: none;
		transform: none;
	}

	/* Responsive adjustments */
	@media (max-width: 600px) {
		.game-title {
			font-size: 2.2rem;
		}
		.tagline {
			font-size: 1rem;
		}
		input,
		button {
			font-size: 1rem;
			padding: 0.8rem 1rem;
		}
		.content-wrapper {
			padding: 2rem 1rem;
		}
	}
</style>