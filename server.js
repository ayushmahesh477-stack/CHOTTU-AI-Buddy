const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static('.'));

// Use environment variable - NEVER hardcode keys
const GROQ_KEY = process.env.GROQ_KEY;

if (!GROQ_KEY) {
  console.error('ERROR: GROQ_KEY environment variable not set');
  process.exit(1);
}

app.post('/api/chat', async (req, res) => {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: req.body.messages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });
    
    const data = await r.json();
    
    if (!r.ok) {
      console.error('Groq API Error:', data);
      return res.status(r.status).json(data);
    }
    
    res.json(data);
  } catch (e) {
    console.error('Proxy Error:', e);
    res.status(500).json({ error: { message: e.message } });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Chottu online on port ${PORT}`));
