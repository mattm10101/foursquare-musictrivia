export type Player = {
	id: string;
	name: string;
	player_number: number;
	score: number;
	game_session_id: string;
};

export type GameSession = {
	id: string;
	status: string;
	current_question_id: number;
	detected_artist: string | null;
};