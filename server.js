const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('.'));

const GROQ_KEY = process.env.GROQ_KEY;

// ============================================
// 1. WEATHER API - OpenWeatherMap (Works on Render)
// Get free key: https://openweathermap.org
// ============================================
const WEATHER_KEY = process.env.WEATHER_KEY;

async function getWeather(city = 'Chennai') {
    if (!WEATHER_KEY) {
        // Fallback to free wttr.in (no key needed)
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
        
        if (data.cod !== 200) {
            return `Could not find weather for ${city}`;
        }
        
        return `🌤️ ${city}: ${data.main.temp}°C, ${data.weather[0].description}, Humidity: ${data.main.humidity}%`;
    } catch (e) {
        return `Weather unavailable for ${city}`;
    }
}

// ============================================
// 2. NEWS API - GNews (Works on Render, no restrictions)
// Get free key: https://gnews.io
// ============================================
const GNEWS_KEY = process.env.GNEWS_KEY;

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
        
        return data.articles.map((a, i) => `${i+1}. ${a.title}${a.source?.name ? ` (${a.source.name})` : ''}`).join('\n');
    } catch (e) {
        return `News temporarily unavailable`;
    }
}

// ============================================
// 3. WEB SEARCH - Tavily (Works on Render)
// Get free key: https://tavily.com
// ============================================
const TAVILY_KEY = process.env.TAVILY_KEY;

async function searchWeb(query) {
    if (!TAVILY_KEY) {
        // Fallback to DuckDuckGo (no key needed)
        try {
            const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
            const data = await res.json();
            
            if (data.AbstractText) {
                return `🔍 ${data.AbstractText.substring(0, 500)}...\n\nSource: ${data.AbstractURL || 'DuckDuckGo'}`;
            }
            if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                const first = data.RelatedTopics[0];
                if (first.Text) {
                    return `🔍 ${first.Text.substring(0, 500)}...`;
                }
            }
            return `No search results found for "${query}". Try being more specific.`;
        } catch {
            return "Search API key not configured. Get free key from tavily.com (1000 searches/month)";
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
                max_results: 3
            })
        });
        
        const data = await res.json();
        
        if (!data.results || data.results.length === 0) {
            return `No search results found for "${query}"`;
        }
        
        return data.results.map((r, i) => `${i+1}. ${r.title}\n   ${r.content.substring(0, 200)}...`).join('\n\n');
    } catch (e) {
        return `Search temporarily unavailable`;
    }
}

// ============================================
// Helper: Get current time in Chennai (IST)
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
        
        // ===== WEB SEARCH COMMAND =====
        if (lowerMsg.includes('search') || lowerMsg.includes('google') || lowerMsg.includes('find') || lowerMsg.includes('look up')) {
            let query = userMessage;
            const searchMatch = userMessage.match(/search (?:for|google|web)?:?\s*(.+)/i) ||
                               userMessage.match(/find (.+)/i) ||
                               userMessage.match(/look up (.+)/i);
            if (searchMatch) query = searchMatch[1];
            const searchResults = await searchWeb(query);
            return res.json({ choices: [{ message: { content: `🔍 Search results:\n\n${searchResults}` } }] });
        }
        
        // ===== REGULAR AI REQUEST with real-time context =====
        const messages = req.body.messages;
        const enhancedMessages = [...messages];
        
        if (enhancedMessages[0]?.role === 'system') {
            enhancedMessages[0].content = `${enhancedMessages[0].content}\n\n📌 REAL-TIME CONTEXT:\n- Current date/time: ${getCurrentDateTime()}\n- User location: Chennai, India (IST timezone)\n- Answer helpfully and concisely. Be friendly.`;
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
    console.log(`\n✅ Chottu online on port ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}\n`);
    console.log(`📅 Current time: ${getCurrentDateTime()}`);
    console.log(`\n🔌 API Status:`);
    console.log(`   🌤️ Weather: ${WEATHER_KEY ? '✅ OpenWeatherMap' : '⚠️ wttr.in (fallback, no key needed)'}`);
    console.log(`   📰 News: ${GNEWS_KEY ? '✅ GNews' : '❌ Missing (get free at gnews.io)'}`);
    console.log(`   🔍 Search: ${TAVILY_KEY ? '✅ Tavily' : '⚠️ DuckDuckGo (fallback, no key needed)'}`);
    console.log(`   🧠 AI: ✅ Groq\n`);
});
