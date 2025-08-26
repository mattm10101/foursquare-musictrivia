<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient.js';
	import { goto } from '$app/navigation'; // <-- This is the missing import
	import type { Player } from '$lib/types';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	type Question = {
		song_title: string;
		correct_artist: string;
		decoy_artist_1: string;
		decoy_artist_2: string;
		decoy_artist_3: string;
	};

	let score = 0;
	let questionNumber = 0;
	let currentPlayer: Player | null = null;
	let currentQuestion: Question | null = null;
	let answerOptions: string[] = [];
	let isLoading = true;
	let answered = false;
	let selectedAnswer = '';
	let gameSubscription: RealtimeChannel;

	// Timer state variables
	let timeLeft = 10;
	let timerInterval: NodeJS.Timeout;

	// Function to start the countdown
	function startTimer() {
		clearInterval(timerInterval); // Clear any existing timer
		timeLeft = 10;
		timerInterval = setInterval(() => {
			timeLeft -= 1;
			if (timeLeft <= 0) {
				clearInterval(timerInterval);
				answered = true; // Lock answers when time is up
			}
		}, 1000);
	}

	async function loadQuestion(qId: number) {
		isLoading = true;
		answered = false;
		selectedAnswer = '';
		questionNumber = qId;

		const { data: questionData } = await supabase
			.from('trivia_questions')
			.select('*')
			.eq('id', qId)
			.single();

		if (questionData) {
			currentQuestion = questionData;
			const options = [
				questionData.correct_artist,
				questionData.decoy_artist_1,
				questionData.decoy_artist_2,
				questionData.decoy_artist_3
			];
			answerOptions = options.sort(() => Math.random() - 0.5);
			startTimer(); // Start the timer when a new question is loaded
		} else {
			answerOptions = [];
			currentQuestion = null;
			clearInterval(timerInterval); // Stop timer if game is over
		}
		isLoading = false;
	}

	onMount(async () => {
		const playerId = localStorage.getItem('playerId');
		if (!playerId) return;

		const { data: playerData } = await supabase.from('players').select('*').eq('id', playerId).single();
		if (!playerData) return;

		currentPlayer = playerData;
		score = playerData.score;
		const sessionId = playerData.game_session_id;

		const { data: sessionData } = await supabase
			.from('game_sessions')
			.select('*')
			.eq('id', sessionId)
			.single();
		if (!sessionData) return;

		await loadQuestion(sessionData.current_question_id);

		gameSubscription = supabase
			.channel(`game_session_changes:${sessionId}`)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'game_sessions',
					filter: `id=eq.${sessionId}`
				},
				(payload) => {
					const newQuestionId = payload.new.current_question_id;
					const newStatus = payload.new.status;

					if (newStatus === 'ENDED') {
						// Game over, clear player ID and go to homepage
						localStorage.removeItem('playerId');
						goto('/');
					} else if (newQuestionId !== questionNumber) {
						loadQuestion(newQuestionId);
					}
				}
			)
			.subscribe();
	});

	onDestroy(() => {
		if (gameSubscription) supabase.removeChannel(gameSubscription);
		clearInterval(timerInterval); // Clean up timer when leaving page
	});

	async function handleAnswer(selectedArtist: string) {
		if (!currentQuestion || !currentPlayer || answered) return;

		clearInterval(timerInterval); // Stop the timer when an answer is selected
		answered = true;
		selectedAnswer = selectedArtist;

		if (selectedArtist === currentQuestion.correct_artist) {
			score += timeLeft * 10; // Bonus points for speed
			const { error } = await supabase.rpc('increment_score', {
				player_id_to_update: currentPlayer.id,
				points_to_add: timeLeft * 10
			});
			if (error) console.error('Error updating score:', error);
		}
	}
</script>

<main class="phone-screen">
	<div class="timer-bar" style="--time-left: {timeLeft * 10}%" />

	<header class="stats">
		<div class="timer">
			<span>TIME</span>
			<strong>{timeLeft}</strong>
		</div>
		<div class="score">
			<span>SCORE</span>
			<strong>{score}</strong>
		</div>
	</header>

	{#if isLoading}
		<div class="loading">Loading question...</div>
	{:else if answerOptions.length > 0}
		<div class="grid">
			{#each answerOptions as artist}
				<button
					class="grid-item"
					on:click={() => handleAnswer(artist)}
					disabled={answered}
					class:correct={answered && artist === currentQuestion?.correct_artist}
					class:incorrect={answered &&
						artist === selectedAnswer &&
						artist !== currentQuestion?.correct_artist}
				>
					<img src="/api/artist-image/{encodeURIComponent(artist)}" alt={artist} />
					<span class="artist-name">{artist}</span>
				</button>
			{/each}
		</div>
	{:else}
		<div class="loading">Game Over! Waiting for final scores...</div>
	{/if}

	<footer class="player-info">
		{#if currentPlayer}
			<p>Player {currentPlayer.player_number}: {currentPlayer.name}</p>
		{/if}
	</footer>
</main>

<style>
	.timer-bar {
		width: var(--time-left, 100%);
		height: 8px;
		background: linear-gradient(90deg, #f72585, #b5179e);
		transition: width 1s linear;
	}

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
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1.5rem;
		background-color: rgba(0, 0, 0, 0.2);
	}
	.timer,
	.score {
		text-align: center;
	}
	.timer span,
	.score span {
		font-size: 0.8rem;
		display: block;
		opacity: 0.8;
	}
	.timer strong,
	.score strong {
		font-size: 1.5rem;
		font-weight: bold;
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
		padding: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
	}
	.grid-item:hover:not(:disabled) {
		transform: scale(1.05);
		border-color: #f72585;
		background-color: rgba(0, 0, 0, 0.5);
	}
	.grid-item img {
		height: 80%;
		width: 100%;
		object-fit: cover;
		border-radius: 8px 8px 0 0;
	}
	.artist-name {
		flex-grow: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 5px;
		font-size: 1.1rem;
		width: 100%;
		text-align: center;
	}
	.player-info {
		text-align: center;
		padding: 1rem;
		background-color: rgba(0, 0, 0, 0.2);
	}
	.grid-item.correct {
		border-color: #1db954;
		transform: scale(1.05);
	}
	.grid-item.incorrect {
		border-color: #ff4136;
		opacity: 0.5;
	}
	.grid-item.correct img {
		opacity: 1;
	}
</style>