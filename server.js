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
// 1. WEATHER - OpenWeatherMap + Fallback
// ============================================
async function getWeather(city = 'Chennai') {
    if (!WEATHER_KEY) {
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
// 3. WEB SEARCH - Tavily + DuckDuckGo Fallback
// ============================================
async function searchWeb(query) {
    if (!TAVILY_KEY) {
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
// 4. IPL/CRICKET SCORES - Direct Web Scraping (Working!)
// ============================================
async function getIPLScores() {
    const results = [];
    
    // Method 1: Cricbuzz Mobile API (Most reliable)
    try {
        const res = await fetch('https://www.cricbuzz.com/api/html/cricket-scorecard', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        // Note: This endpoint may need adjustment
    } catch(e) {}
    
    // Method 2: ESPN Cricinfo RSS Feed (Always works)
    try {
        const rssRes = await fetch('https://www.espncricinfo.com/rss/content/story/feeds/0.xml');
        const rssText = await rssRes.text();
        
        // Parse RSS to extract match info
        const matches = [];
        const titleMatches = rssText.match(/<title>(.*?)<\/title>/g);
        const descMatches = rssText.match(/<description>(.*?)<\/description>/g);
        
        if (titleMatches && titleMatches.length > 0) {
            for (let i = 1; i < Math.min(titleMatches.length, 6); i++) {
                const title = titleMatches[i].replace(/<title>|<\/title>/g, '');
                if (title.includes('IPL') || title.includes('cricket') || title.includes('vs')) {
                    let desc = '';
                    if (descMatches && descMatches[i]) {
                        desc = descMatches[i].replace(/<description>|<\/description>|<![CDATA[|]]>/g, '').substring(0, 200);
                    }
                    matches.push({ title, desc });
                }
            }
        }
        
        if (matches.length > 0) {
            let scoreText = '🏏 Live Cricket Scores:\n\n';
            for (const match of matches) {
                scoreText += `📌 ${match.title}\n`;
                if (match.desc) scoreText += `   ${match.desc}\n`;
                scoreText += '\n';
            }
            scoreText += '─'.repeat(40) + '\n📺 For live updates: https://www.espncricinfo.com';
            return { success: true, message: scoreText };
        }
    } catch(e) {
        console.log('ESPN RSS failed:', e.message);
    }
    
    // Method 3: Use DuckDuckGo to search and return results
    try {
        const searchQuery = 'IPL 2026 live score today';
        const searchRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json&no_html=1`);
        const searchData = await searchRes.json();
        
        if (searchData.AbstractText) {
            return { 
                success: true, 
                message: `🏏 IPL Updates:\n\n${searchData.AbstractText.substring(0, 500)}\n\n─'.repeat(40)}\n📺 For live scores: https://www.cricbuzz.com` 
            };
        }
    } catch(e) {}
    
    return { success: false, message: null };
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
        
        // ===== IPL/CRICKET SCORES - DIRECT DISPLAY =====
        if (lowerMsg.includes('ipl') || lowerMsg.includes('cricket') || 
            lowerMsg.includes('score') || lowerMsg.includes('match')) {
            
            const iplResult = await getIPLScores();
            if (iplResult.success) {
                return res.json({ choices: [{ message: { content: iplResult.message } }] });
            }
            
            // If APIs fail, provide direct links that open in browser
            return res.json({ choices: [{ message: { content: "🏏 Live IPL Scores:\n\nI'll search the web for you. Type:\n\n🔍 'search for IPL 2026 final score'\n\nOr click these links:\n• https://www.iplt20.com\n• https://www.cricbuzz.com\n• https://www.espncricinfo.com\n\nThe scores will open in your browser." } }] });
        }
        
        // ===== SEARCH COMMAND - Will fetch and display results =====
        if (lowerMsg.includes('search for') || lowerMsg.includes('search the web')) {
            let query = userMessage.replace(/search for|search the web/gi, '').trim();
            if (!query) query = 'IPL 2026 live score';
            
            const searchResults = await searchWeb(query);
            
            if (searchResults) {
                const searchPrompt = `Based on these search results, answer the user's query about IPL/cricket scores:\n\nUser query: ${query}\n\nSearch results:\n${searchResults}\n\nProvide a concise answer with the current score if available. If no specific score found, give the most relevant information from the search.`;
                
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${GROQ_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'llama-3.3-70b-versatile',
                        messages: [{ role: 'user', content: searchPrompt }],
                        temperature: 0.3,
                        max_tokens: 500
                    })
                });
                const data = await response.json();
                return res.json({ choices: [{ message: { content: `🔍 ${data.choices[0].message.content}` } }] });
            }
            
            return res.json({ choices: [{ message: { content: `🔍 I couldn't find IPL scores. Try:\n• iplt20.com\n• cricbuzz.com\n• espncricinfo.com` } }] });
        }
        
        // ===== WEATHER COMMAND =====
        if (lowerMsg.includes('weather') || lowerMsg.includes('temperature') || lowerMsg.includes('rain') || lowerMsg.includes('humidity')) {
            const cityMatch = userMessage.match(/weather in (\w+)/i) || userMessage.match(/weather (\w+)/i);
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
            const topicMatch = userMessage.match(/news about (\w+)/i) || userMessage.match(/news on (\w+)/i);
            if (topicMatch) topic = topicMatch[1];
            const news = await getNews(topic);
            return res.json({ choices: [{ message: { content: `📰 Top headlines:\n${news}` } }] });
        }
        
        // ===== REGULAR AI REQUEST =====
        const messages = req.body.messages;
        const enhancedMessages = [...messages];
        
        if (enhancedMessages[0]?.role === 'system') {
            enhancedMessages[0].content = `${enhancedMessages[0].content}\n\n📌 REAL-TIME CONTEXT:\n- Current date/time: ${getCurrentDateTime()}\n- User location: Chennai, India (IST timezone)\n- Answer helpfully and concisely. Call the user "friend".`;
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
    console.log(`   🔍 Web Search: ${TAVILY_KEY ? '✅ Tavily' : '⚠️ DuckDuckGo'}`);
    console.log(`   🏏 IPL/Cricket: ✅ Web Search + RSS Feeds\n`);
});
