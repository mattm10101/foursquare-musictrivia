export type Player = {
	id: string; // The unique UUID for the player
	name: string;
	player_number: number;
	score: number;
	game_session_id: string;
};

export type GameSession = {
	id: string;
	status: string;
	current_question_id: number;
};