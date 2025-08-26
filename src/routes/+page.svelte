<script>
  export let data;
</script>

<main style="font-family: sans-serif; padding: 2rem;">
  <h1>Connection Test</h1>
  <p>
    Testing the connection to the <strong>trivia_questions</strong> table in Supabase.
  </p>

  <h2>Result:</h2>
  {#if data.questions.length > 0}
    <p>Success! Found {data.questions.length} questions.</p>
  {:else}
    <p>✅ Success! The connection works, but the table is currently empty.</p>
  {/if}

  <hr style="margin: 2rem 0;" />

  <h3>Raw Data Received from Server:</h3>
  <pre
    style="background-color: #eee; padding: 1rem; border-radius: 8px;"
  >{JSON.stringify(data, null, 2)}</pre>
</main>