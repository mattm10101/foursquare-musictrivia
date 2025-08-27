import { VDJ_URL } from '$env/static/private';
import { error, json } from '@sveltejs/kit';

export async function POST({ request }) {
	const { script } = await request.json();

	if (!script) {
		throw error(400, 'A "script" parameter is required.');
	}

	try {
		// This server-side fetch talks to VDJ. No CORS issues here.
		const vdjResponse = await fetch(`${VDJ_URL}/query?script=${script}`);

		if (!vdjResponse.ok) {
			throw error(vdjResponse.status, 'Failed to communicate with Virtual DJ.');
		}

		const textResponse = await vdjResponse.text();

		// Return VDJ's response back to our controller page
		return json({ result: textResponse });
	} catch (err) {
		// This likely means VDJ is not running or the URL is wrong
		throw error(500, 'Could not connect to Virtual DJ.');
	}
}