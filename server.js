const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('.'));

// ============================================
// YOUR API KEYS (Loaded from Render Environment)
// ============================================
const GROQ_KEY = process.env.GROQ_KEY;
const WEATHER_KEY = process.env.WEATHER_KEY;
const GNEWS_KEY = process.env.GNEWS_KEY;
const TAVILY_KEY = process.env.TAVILY_KEY;

// ============================================
// 1. WEATHER - OpenWeatherMap
// ============================================
async function getWeather(city = 'Chennai') {
    if (!WEATHER_KEY) {
        // Fallback to free wttr.in
        try {
            const res = await fetch(`https://wttr.in/${city}?format=j1`);
            const data = await res.json();
            const current = data.current_condition[0];
            return `🌤️ ${city}: ${current.temp_C}°C, ${current.weatherDesc[0].value}, Humidity: ${current.humidity}%`;
        } catch {
            return "Weather API key not configured. Get free key from openweathermap.org";
        }
    }
    
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_KEY}&units=metric`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.cod !== 200) return `Could not find weather for ${city}`;
        
        return `🌤️ ${city}: ${data.main.temp}°C, ${data.weather[0].description}, Humidity: ${data.main.humidity}%, Wind: ${data.wind.speed} km/h`;
    } catch (e) {
        return `Weather unavailable for ${city}`;
    }
}

// ============================================
// 2. NEWS - GNews (Works on Render)
// ============================================
async function getNews(topic = 'India') {
    if (!GNEWS_KEY) {
        return "News API key not configured. Get free key from gnews.io (100 requests/day)";
    }
    
    try {
        const url = `https://gnews.io/api/v4/search?q=${topic}&lang=en&country=in&max=5&apikey=${GNEWS_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.articles || data.articles.length === 0) {
            return `No news found for "${topic}"`;
        }
        
        return data.articles.map((a, i) => `${i+1}. ${a.title} (${a.source?.name || 'News'})`).join('\n');
    } catch (e) {
        return `News temporarily unavailable`;
    }
}

// ============================================
// 3. WEB SEARCH - Tavily (Live Internet Search)
// ============================================
async function searchWeb(query) {
    if (!TAVILY_KEY) {
        // Fallback to DuckDuckGo (no key needed)
        try {
            const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
            const data = await res.json();
            
            if (data.AbstractText) {
                return data.AbstractText.substring(0, 500);
            }
            if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                const first = data.RelatedTopics[0];
                if (first.Text) {
                    return first.Text.substring(0, 500);
                }
            }
            return null;
        } catch {
            return null;
        }
    }
    
    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: TAVILY_KEY,
                query: query,
                search_depth: 'basic',
                max_results: 5,
                include_answer: true
            })
        });
        
        const data = await res.json();
        
        if (data.answer) {
            return data.answer;
        }
        
        if (!data.results || data.results.length === 0) {
            return null;
        }
        
        return data.results.map(r => r.content).join(' ').substring(0, 1000);
    } catch (e) {
        return null;
    }
}

// ============================================
// Helper: Current Time (Chennai/IST)
// ============================================
function getCurrentDateTime() {
    const now = new Date();
    return now.toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// ============================================
// MAIN API ENDPOINT
// ============================================
app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.messages[req.body.messages.length - 1]?.content || '';
        const lowerMsg = userMessage.toLowerCase();
        
        // ===== WEATHER COMMAND =====
        if (lowerMsg.includes('weather') || lowerMsg.includes('temperature') || lowerMsg.includes('rain') || lowerMsg.includes('humidity')) {
            const cityMatch = userMessage.match(/weather in (\w+)/i) || 
                              userMessage.match(/weather (\w+)/i);
            const city = cityMatch ? cityMatch[1] : 'Chennai';
            const weather = await getWeather(city);
            return res.json({ choices: [{ message: { content: weather } }] });
        }
        
        // ===== TIME/DATE COMMAND =====
        if (lowerMsg.includes('time') || lowerMsg.includes('date') || lowerMsg.includes('today') || lowerMsg.includes('clock')) {
            return res.json({ choices: [{ message: { content: `📅 ${getCurrentDateTime()}` } }] });
        }
        
        // ===== NEWS COMMAND =====
        if (lowerMsg.includes('news') || lowerMsg.includes('headline') || lowerMsg.includes('headlines')) {
            let topic = 'India';
            const topicMatch = userMessage.match(/news about (\w+)/i) || 
                              userMessage.match(/news on (\w+)/i);
            if (topicMatch) topic = topicMatch[1];
            const news = await getNews(topic);
            return res.json({ choices: [{ message: { content: `📰 Top headlines:\n${news}` } }] });
        }
        
        // ===== SPORTS/IPL/SCORE COMMAND =====
        if (lowerMsg.includes('ipl') || lowerMsg.includes('cricket') || lowerMsg.includes('score') || lowerMsg.includes('match') || lowerMsg.includes('sports')) {
            const searchQuery = `IPL 2026 final score ${new Date().toLocaleDateString()} cricket match result`;
            const searchResults = await searchWeb(searchQuery);
            
            if (searchResults) {
                // Use Groq to summarize the search results
                const sportsPrompt = `Based on these search results, answer the user's question about IPL/cricket/score:\n\nUser question: ${userMessage}\n\nSearch results:\n${searchResults}\n\nGive a concise, factual answer about the current score or match status. If no live score found in the search results, say "I couldn't find live scores. Try searching Google for 'IPL 2026 live score'." Be honest about what you found.`;
                
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${GROQ_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'llama-3.3-70b-versatile',
                        messages: [{ role: 'user', content: sportsPrompt }],
                        temperature: 0.3,
                        max_tokens: 300
                    })
                });
                const data = await response.json();
                return res.json({ choices: [{ message: { content: data.choices[0].message.content } }] });
            }
            
            return res.json({ choices: [{ message: { content: "🏏 I couldn't find live IPL scores. Try searching Google for 'IPL 2026 live score' or check the official IPL website." } }] });
        }
        
        // ===== WEB SEARCH COMMAND =====
        if (lowerMsg.includes('search') || lowerMsg.includes('google') || lowerMsg.includes('find') || lowerMsg.includes('look up')) {
            let query = userMessage;
            const searchMatch = userMessage.match(/search (?:for|google|web)?:?\s*(.+)/i) ||
                               userMessage.match(/find (.+)/i) ||
                               userMessage.match(/look up (.+)/i);
            if (searchMatch) query = searchMatch[1];
            
            const searchResults = await searchWeb(query);
            
            if (searchResults) {
                // Let Groq summarize search results
                const searchPrompt = `Based on these search results, answer the user's query:\n\nUser query: ${query}\n\nSearch results:\n${searchResults}\n\nGive a helpful, accurate answer based on the search results. If the results don't fully answer the question, say so.`;
                
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${GROQ_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'llama-3.3-70b-versatile',
                        messages: [{ role: 'user', content: searchPrompt }],
                        temperature: 0.5,
                        max_tokens: 500
                    })
                });
                const data = await response.json();
                return res.json({ choices: [{ message: { content: `🔍 ${data.choices[0].message.content}` } }] });
            }
            
            return res.json({ choices: [{ message: { content: `🔍 I couldn't find search results for "${query}". Try rephrasing or checking your internet connection.` } }] });
        }
        
        // ===== REGULAR AI REQUEST with real-time context =====
        const messages = req.body.messages;
        const enhancedMessages = [...messages];
        
        if (enhancedMessages[0]?.role === 'system') {
            enhancedMessages[0].content = `${enhancedMessages[0].content}\n\n📌 REAL-TIME CONTEXT:\n- Current date/time: ${getCurrentDateTime()}\n- User location: Chennai, India (IST timezone)\n- Today is ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n- Answer helpfully and concisely. If asked about live events (sports, news, current scores), say you don't have live data and suggest searching. Be friendly and call the user "friend".`;
        }
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: enhancedMessages,
                temperature: 0.7,
                max_tokens: 1024
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error('Groq API Error:', data);
            return res.status(response.status).json(data);
        }
        
        res.json(data);
        
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: { message: `Server error: ${error.message}` } });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n✅ Chottu ONLINE on port ${PORT}`);
    console.log(`📍 ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}\n`);
    console.log(`📅 Current time: ${getCurrentDateTime()}\n`);
    console.log(`🔌 API Status:`);
    console.log(`   🧠 Groq AI: ${GROQ_KEY ? '✅' : '❌'}`);
    console.log(`   🌤️ Weather: ${WEATHER_KEY ? '✅ OpenWeatherMap' : '⚠️ wttr.in (fallback)'}`);
    console.log(`   📰 News: ${GNEWS_KEY ? '✅ GNews' : '❌ Missing'}`);
    console.log(`   🔍 Web Search: ${TAVILY_KEY ? '✅ Tavily' : '⚠️ DuckDuckGo (fallback)'}`);
    console.log(`   📅 Time/Date: ✅ Built-in\n`);
});
