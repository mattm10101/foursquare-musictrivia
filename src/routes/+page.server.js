// src/routes/+page.server.js

import { supabase } from '$lib/supabaseClient.js';

export async function load() {
  const { data, error } = await supabase.from('trivia_questions').select('*');

  if (error) {
    console.error('Error fetching questions:', error);
    return { questions: [], error: error.message };
  }

  return {
    questions: data ?? [],
  };
}