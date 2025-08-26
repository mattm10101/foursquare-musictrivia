import { error, redirect } from '@sveltejs/kit';
import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } from '$env/static/private';

export async function GET({ params }) {
	const artistName = params.artist_name;

	// 1. Get an access token from Spotify using our secret credentials
	const authResponse = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${Buffer.from(
				`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
			).toString('base64')}`
		},
		body: new URLSearchParams({ grant_type: 'client_credentials' })
	});

	if (!authResponse.ok) {
		console.error('Spotify Auth Error:', await authResponse.text());
		throw error(500, 'Failed to authenticate with Spotify');
	}

	const authData = await authResponse.json();
	const accessToken = authData.access_token;

	// 2. Use the token to search for the artist on Spotify
	const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
		artistName
	)}&type=artist&limit=1`;

	const searchResponse = await fetch(searchUrl, {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	if (!searchResponse.ok) {
		console.error('Spotify Search Error:', await searchResponse.text());
		throw error(500, 'Failed to search for artist on Spotify');
	}

	const searchData = await searchResponse.json();

	// 3. Find the first image URL from the search results
	const imageUrl = searchData?.artists?.items[0]?.images[0]?.url;

	if (!imageUrl) {
		// If no image is found, we could redirect to a placeholder,
		// but for now, we'll return a 404 error.
		throw error(404, `No image found for ${artistName}`);
	}

	// 4. Redirect the player's browser directly to the image URL
	throw redirect(307, imageUrl);
}