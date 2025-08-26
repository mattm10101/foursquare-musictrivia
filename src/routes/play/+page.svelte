<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import type { Player } from '$lib/types';

	type Question = {
		song_title: string;
		correct_artist: string;
		decoy_artist_1: string;
		decoy_artist_2: string;
		decoy_artist_3: string;
	};

	let score = 0;
	let questionNumber = 0;
	let streak = 0;
	let currentPlayer: Player | null = null;
	let currentQuestion: Question | null = null;
	let answerOptions: string[] = [];
	let isLoading = true;

	onMount(async () => {
		const playerId = localStorage.getItem('playerId');
		if (!playerId) {
			alert('Could not find player ID. Returning to join page.');
			return;
		}

		// 1. Get player's info
		const { data: playerData, error: playerError } = await supabase
			.from('players')
			.select('*')
			.eq('id', playerId)
			.single();

		if (playerError || !playerData) {
			alert('Could not load game data.');
			return;
		}
		
		currentPlayer = playerData;
		score = playerData.score;
		const sessionId = playerData.game_session_id;

		// 2. Get the current game session details
		const { data: sessionData, error: sessionError } = await supabase
			.from('game_sessions')
			.select('*')
			.eq('id', sessionId)
			.single();

		if (sessionError || !sessionData) {
			alert('Could not load session data.');
			return;
		}
		
		questionNumber = sessionData.current_question_id;

		// 3. Get the current question details
		const { data: questionData } = await supabase
			.from('trivia_questions')
			.select('*')
			.eq('id', questionNumber)
			.single();
		
		if (questionData) {
			currentQuestion = questionData;
			// 4. Create and shuffle the answer options
			const options = [
				questionData.correct_artist,
				questionData.decoy_artist_1,
				questionData.decoy_artist_2,
				questionData.decoy_artist_3
			];
			answerOptions = options.sort(() => Math.random() - 0.5);
		}
		isLoading = false;
	});

	function handleAnswer(selectedArtist: string) {
		if (!currentQuestion) return;

		if (selectedArtist === currentQuestion.correct_artist) {
			alert('Correct!');
			// We will add scoring logic here later
		} else {
			alert('Wrong!');
		}
	}
</script>

<main class="phone-screen">
	<header class="stats">
		<div class="stat-item">
			<span>Score</span>
			<strong>{score}</strong>
		</div>
		<div class="stat-item">
			<span>Question</span>
			<strong>{questionNumber} / 10</strong>
		</div>
		<div class="stat-item">
			<span>Streak</span>
			<strong>🔥 {streak}</strong>
		</div>
	</header>

	{#if isLoading}
		<div class="loading">Loading question...</div>
	{:else if answerOptions.length > 0}
		<div class="grid">
			{#each answerOptions as artist}
				<button class="grid-item" on:click={() => handleAnswer(artist)}>
					<img src="/api/artist-image/{encodeURIComponent(artist)}" alt={artist} />
				</button>
			{/each}
		</div>
	{:else}
		<div class="loading">Waiting for next question...</div>
	{/if}

	<footer class="player-info">
		{#if currentPlayer}
			<p>Player {currentPlayer.player_number}: {currentPlayer.name}</p>
		{/if}
	</footer>
</main>

<style>
	.loading {
		flex-grow: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		font-size: 1.5rem;
	}
	:global(body) {
		background-color: #121212;
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100vh;
		margin: 0;
	}
	.phone-screen {
		font-family: sans-serif;
		color: white;
		background: linear-gradient(160deg, #3a0ca3, #0c001f);
		width: 100%;
		max-width: 400px;
		aspect-ratio: 9 / 16;
		border-radius: 20px;
		border: 3px solid #7209b7;
		box-shadow: 0 0 20px rgba(189, 21, 230, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.stats {
		display: flex;
		justify-content: space-around;
		padding: 1rem;
		background-color: rgba(0, 0, 0, 0.2);
	}
	.stat-item {
		text-align: center;
	}
	.stat-item span {
		font-size: 0.8rem;
		display: block;
		opacity: 0.8;
	}
	.stat-item strong {
		font-size: 1.2rem;
	}
	.grid {
		flex-grow: 1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		gap: 10px;
		padding: 10px;
	}
	.grid-item {
		background-color: rgba(0, 0, 0, 0.3);
		border: 2px solid #b5179e;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease-in-out;
		color: white;
		font-size: 1.5rem;
		text-align: center;
		padding: 0; /* Remove padding for image */
		overflow: hidden; /* Hide parts of image that don't fit */
	}
	.grid-item:hover {
		transform: scale(1.05);
		border-color: #f72585;
		background-color: rgba(0, 0, 0, 0.5);
	}
	.grid-item img {
		width: 100%;
		height: 100%;
		object-fit: cover; /* This makes the image cover the button area */
		opacity: 0.85;
		transition: opacity 0.2s ease-in-out;
	}
	.grid-item:hover img {
		opacity: 1;
	}
	.player-info {
		text-align: center;
		padding: 1rem;
		background-color: rgba(0, 0, 0, 0.2);
	}
</style>