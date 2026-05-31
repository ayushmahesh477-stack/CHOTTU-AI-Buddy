const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('.'));

// This is your GROQ key from console.groq.com
const GROQ_KEY = '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';

app.post('/api/chat', async (req, res) => {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', // Groq's fastest model
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

app.listen(3000, () => console.log('N.E.T.H.U online: http://localhost:3000'));