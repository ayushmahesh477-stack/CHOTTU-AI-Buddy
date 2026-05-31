const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('.'));

// ============================================
// YOUR EXISTING API KEYS (Keep as is)
// ============================================
const GROQ_KEY = process.env.GROQ_KEY;
const WEATHER_KEY = process.env.WEATHER_KEY;
const GNEWS_KEY = process.env.GNEWS_KEY;
const TAVILY_KEY = process.env.TAVILY_KEY;

// ============================================
// WEATHER FUNCTION (Using your key)
// ============================================
async function getWeather(city = 'Chennai') {
    if (!WEATHER_KEY) {
        try {
            const res = await fetch(`https://wttr.in/${city}?format=j1`);
            const data = await res.json();
            const current = data.current_condition[0];
            return `${city}: ${current.temp_C}°C, ${current.weatherDesc[0].value}, Humidity: ${current.humidity}%`;
        } catch {
            return "Weather service temporarily unavailable, sir.";
        }
    }
    
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_KEY}&units=metric`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.cod !== 200) return `Could not find ${city}, sir.`;
        
        return `${city}: ${data.main.temp}°C, ${data.weather[0].description}, Humidity: ${data.main.humidity}%`;
    } catch (e) {
        return `Weather service temporarily unavailable, sir.`;
    }
}

// ============================================
// NEWS FUNCTION (Using your GNews key)
// ============================================
async function getNews(topic = 'India') {
    if (!GNEWS_KEY) {
        try {
            const res = await fetch(`https://api.duckduckgo.com/?q=${topic}+news&format=json&no_html=1`);
            const data = await res.json();
            if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                return data.RelatedTopics.slice(0, 5).map((t, i) => {
                    let text = (t.Text || '').replace(/<[^>]*>/g, '').substring(0, 100);
                    return `${i+1}. ${text}`;
                }).filter(h => h.length > 10).join('\n');
            }
            return "No recent news found, sir.";
        } catch {
            return "News service unavailable, sir.";
        }
    }
    
    try {
        const url = `https://gnews.io/api/v4/search?q=${topic}&lang=en&country=in&max=5&apikey=${GNEWS_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.articles || data.articles.length === 0) {
            return `No news found for "${topic}", sir.`;
        }
        
        return data.articles.map((a, i) => `${i+1}. ${a.title}`).join('\n');
    } catch (e) {
        return `News service temporarily unavailable, sir.`;
    }
}

// ============================================
// WEB SEARCH FUNCTION (Using your Tavily key)
// ============================================
async function searchWeb(query) {
    if (!TAVILY_KEY) {
        try {
            const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
            const data = await res.json();
            if (data.AbstractText) {
                return data.AbstractText.substring(0, 500);
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
        
        return data.results.map(r => r.content).join(' ').substring(0, 800);
    } catch (e) {
        return null;
    }
}

// ============================================
// APP LAUNCHER
// ============================================
const APP_LINKS = {
    'youtube': 'https://youtube.com',
    'gmail': 'https://mail.google.com',
    'google': 'https://google.com',
    'maps': 'https://maps.google.com',
    'github': 'https://github.com',
    'reddit': 'https://reddit.com',
    'twitter': 'https://twitter.com',
    'instagram': 'https://instagram.com',
    'iplt20': 'https://iplt20.com',
    'cricbuzz': 'https://cricbuzz.com',
    'espncricinfo': 'https://espncricinfo.com',
    'whatsapp': 'https://web.whatsapp.com',
    'netflix': 'https://netflix.com',
    'amazon': 'https://amazon.in'
};

function findAppToOpen(message) {
    const lowerMsg = message.toLowerCase();
    for (const [app, url] of Object.entries(APP_LINKS)) {
        if (lowerMsg.includes(app)) {
            return { app, url };
        }
    }
    return null;
}

// ============================================
// SPORTS SCORES (IPL/Cricket)
// ============================================
async function getSportsScores(query) {
    const searchQuery = `${query} live score`;
    const results = await searchWeb(searchQuery);
    return results;
}

// ============================================
// TIME FUNCTION
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
        minute: '2-digit'
    });
}

// ============================================
// JARVIS SYSTEM PROMPT (Chottu name)
// ============================================
const JARVIS_PROMPT = `You are Chottu - an AI assistant that responds exactly like JARVIS from Iron Man.

YOUR PERSONALITY:
- Intelligent, calm, efficient, and slightly witty
- Speak concisely (2-3 sentences maximum unless asked for details)
- Call the user "sir" or "friend"
- Never say "as an AI" or make excuses
- Be helpful and proactive

YOUR STYLE:
- Direct and professional like JARVIS
- Use phrases like "Certainly, sir", "Right away, sir", "Here's what I found, sir"
- Add subtle British-tinged humor occasionally
- Acknowledge all tasks professionally

IMPORTANT RULES:
- When asked to open an app, say "Opening [app name], sir" and nothing else
- When giving weather, say "The weather in [city] is [details], sir"
- When telling time, say "Sir, it is [time]"
- Keep responses elegant and brief - no fluff
- If you don't know something, say so honestly

Remember: Your name is Chottu, but you behave exactly like JARVIS.`;

// ============================================
// MAIN JARVIS AGENT ENDPOINT
// ============================================
app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.messages[req.body.messages.length - 1]?.content || '';
        const lowerMsg = userMessage.toLowerCase();
        
        console.log(`🎯 Chottu (JARVIS mode) received: ${userMessage}`);
        
        // ===== STEP 1: OPEN APPS =====
        if (lowerMsg.includes('open') || lowerMsg.includes('launch') || lowerMsg.includes('start')) {
            const appToOpen = findAppToOpen(userMessage);
            if (appToOpen) {
                return res.json({ 
                    choices: [{ 
                        message: { 
                            content: `Opening ${appToOpen.app}, sir.` 
                        } 
                    }],
                    action: { type: 'open_url', url: appToOpen.url }
                });
            }
        }
        
        // ===== STEP 2: WEATHER =====
        if (lowerMsg.includes('weather') || lowerMsg.includes('temperature') || lowerMsg.includes('rain') || lowerMsg.includes('humidity')) {
            const cityMatch = userMessage.match(/weather in (\w+)/i) || userMessage.match(/weather (\w+)/i);
            const city = cityMatch ? cityMatch[1] : 'Chennai';
            const weather = await getWeather(city);
            return res.json({ 
                choices: [{ 
                    message: { 
                        content: `The weather in ${city} is ${weather}, sir.` 
                    } 
                }] 
            });
        }
        
        // ===== STEP 3: TIME/DATE =====
        if (lowerMsg.includes('time') || lowerMsg.includes('date') || lowerMsg.includes('today') || lowerMsg.includes('clock')) {
            return res.json({ 
                choices: [{ 
                    message: { 
                        content: `Sir, it is ${getCurrentDateTime()}.` 
                    } 
                }] 
            });
        }
        
        // ===== STEP 4: NEWS =====
        if (lowerMsg.includes('news') || lowerMsg.includes('headlines') || lowerMsg.includes('headline') || lowerMsg.includes('update')) {
            let topic = 'India';
            if (lowerMsg.includes('world') || lowerMsg.includes('global')) topic = 'world';
            if (lowerMsg.includes('tech') || lowerMsg.includes('technology')) topic = 'technology';
            if (lowerMsg.includes('sports')) topic = 'sports';
            if (lowerMsg.includes('business')) topic = 'business';
            if (lowerMsg.includes('entertainment')) topic = 'entertainment';
            
            const news = await getNews(topic);
            return res.json({ 
                choices: [{ 
                    message: { 
                        content: `Here are the latest headlines, sir:\n\n${news}` 
                    } 
                }] 
            });
        }
        
        // ===== STEP 5: SPORTS/IPL/CRICKET/SCORES =====
        if (lowerMsg.includes('ipl') || lowerMsg.includes('cricket') || lowerMsg.includes('score') || 
            lowerMsg.includes('match') || lowerMsg.includes('sports')) {
            
            const sportsInfo = await getSportsScores(userMessage);
            if (sportsInfo) {
                return res.json({ 
                    choices: [{ 
                        message: { 
                            content: sportsInfo
                        } 
                    }] 
                });
            }
            return res.json({ 
                choices: [{ 
                    message: { 
                        content: "Sir, I'm checking live scores. For the most current updates, you may want to visit Cricbuzz or ESPNcricinfo." 
                    } 
                }] 
            });
        }
        
        // ===== STEP 6: SEARCH ANYTHING =====
        if (lowerMsg.includes('search') || lowerMsg.includes('find') || lowerMsg.includes('look up') || 
            lowerMsg.includes('tell me about') || lowerMsg.includes('what is') || lowerMsg.includes('who is')) {
            
            const searchResults = await searchWeb(userMessage);
            if (searchResults) {
                const searchPrompt = `Based on this information, answer the user's question like JARVIS: "${userMessage}"\n\nInformation: ${searchResults}\n\nRespond concisely and helpfully, starting with "Sir,".`;
                
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
                        max_tokens: 300
                    })
                });
                const data = await response.json();
                return res.json({ choices: [{ message: { content: data.choices[0].message.content } }] });
            }
        }
        
        // ===== STEP 7: REGULAR JARVIS CHAT =====
        const messages = req.body.messages;
        const enhancedMessages = [...messages];
        
        if (enhancedMessages[0]?.role === 'system') {
            enhancedMessages[0].content = JARVIS_PROMPT;
        }
        
        // Add real-time context
        enhancedMessages.push({ 
            role: 'system', 
            content: `Current context: ${getCurrentDateTime()} (Chennai/IST). Answer as JARVIS.` 
        });
        
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
                max_tokens: 500
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
        res.status(500).json({ error: { message: `System error: ${error.message}` } });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n⚡ Chottu (JARVIS mode) ONLINE on port ${PORT}`);
    console.log(`📍 ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}\n`);
    console.log(`🧠 AI Mode: Groq (JARVIS personality)`);
    console.log(`🌤️ Weather: ${WEATHER_KEY ? '✅ OpenWeatherMap' : '⚠️ wttr.in fallback'}`);
    console.log(`📰 News: ${GNEWS_KEY ? '✅ GNews' : '⚠️ DuckDuckGo fallback'}`);
    console.log(`🔍 Search: ${TAVILY_KEY ? '✅ Tavily' : '⚠️ DuckDuckGo fallback'}`);
    console.log(`\n🎯 "Sir, Chottu is ready to assist you."\n`);
});
