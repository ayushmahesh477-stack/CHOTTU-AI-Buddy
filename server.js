const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('.'));

// ============================================
// YOUR API KEYS (Already in Render Environment)
// ============================================
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY;
const GROQ_KEY = process.env.GROQ_KEY;
const OPENAI_KEY = process.env.OPENA1_KEY;  // Note: Typo in your env name
const WEATHER_KEY = process.env.WEATHER_KEY;
const GNEWS_KEY = process.env.GNEWS_KEY;
const TAVILY_KEY = process.env.TAVILY_KEY;

// ============================================
// 1. AI CHAT - Multiple Providers with Auto-Failover
// ============================================
async function callAI(messages) {
    console.log(`🧠 Trying AI providers...`);
    
    // Try 1: DeepSeek (Cheapest, 1M context)
    if (DEEPSEEK_KEY) {
        try {
            console.log('   Trying DeepSeek...');
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DEEPSEEK_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 500
                })
            });
            const data = await response.json();
            if (data.choices && data.choices[0]) {
                console.log('   ✅ DeepSeek responded');
                return data;
            }
        } catch(e) {
            console.log('   DeepSeek failed:', e.message);
        }
    }
    
    // Try 2: OpenAI (if you have key)
    if (OPENAI_KEY) {
        try {
            console.log('   Trying OpenAI...');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 500
                })
            });
            const data = await response.json();
            if (data.choices && data.choices[0]) {
                console.log('   ✅ OpenAI responded');
                return data;
            }
        } catch(e) {
            console.log('   OpenAI failed:', e.message);
        }
    }
    
    // Try 3: Groq (Fastest)
    if (GROQ_KEY) {
        try {
            console.log('   Trying Groq...');
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 500
                })
            });
            const data = await response.json();
            if (data.choices && data.choices[0]) {
                console.log('   ✅ Groq responded');
                return data;
            }
        } catch(e) {
            console.log('   Groq failed:', e.message);
        }
    }
    
    throw new Error('All AI providers failed');
}

// ============================================
// 2. WEB SEARCH - Tavily (Primary) + DuckDuckGo (Fallback)
// ============================================
async function searchWeb(query) {
    console.log(`🔍 Searching: ${query}`);
    
    // Try Tavily (your key)
    if (TAVILY_KEY) {
        try {
            const response = await fetch('https://api.tavily.com/search', {
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
            const data = await response.json();
            if (data.answer) {
                console.log('   ✅ Tavily answered');
                return data.answer;
            }
            if (data.results && data.results.length > 0) {
                console.log('   ✅ Tavily found results');
                return data.results.map(r => r.content).join(' ').substring(0, 1500);
            }
        } catch(e) {
            console.log('   Tavily failed:', e.message);
        }
    }
    
    // Fallback to DuckDuckGo (no key needed)
    try {
        console.log('   Trying DuckDuckGo fallback...');
        const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
        const data = await response.json();
        
        if (data.AbstractText && data.AbstractText.length > 50) {
            console.log('   ✅ DuckDuckGo found results');
            return data.AbstractText.substring(0, 1000);
        }
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            for (const topic of data.RelatedTopics) {
                if (topic.Text && topic.Text.length > 50) {
                    console.log('   ✅ DuckDuckGo found related topics');
                    return topic.Text.replace(/<[^>]*>/g, '').substring(0, 1000);
                }
            }
        }
    } catch(e) {
        console.log('   DuckDuckGo failed:', e.message);
    }
    
    return null;
}

// ============================================
// 3. NEWS - GNews (Your Key) + Google News RSS (Fallback)
// ============================================
async function getNews(topic = 'India') {
    console.log(`📰 Fetching news for: ${topic}`);
    
    // Try GNews (your key)
    if (GNEWS_KEY) {
        try {
            const url = `https://gnews.io/api/v4/search?q=${topic}&lang=en&country=in&max=5&apikey=${GNEWS_KEY}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.articles && data.articles.length > 0) {
                console.log('   ✅ GNews found headlines');
                return data.articles.map((a, i) => `${i+1}. ${a.title}`).join('\n');
            }
        } catch(e) {
            console.log('   GNews failed:', e.message);
        }
    }
    
    // Fallback to Google News RSS
    try {
        console.log('   Trying Google News RSS fallback...');
        const searchTopic = topic === 'India' ? 'India' : topic;
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchTopic)}&hl=en-IN&gl=IN&ceid=IN:en`;
        const response = await fetch(rssUrl);
        const rssText = await response.text();
        
        const titleMatches = rssText.match(/<title>(.*?)<\/title>/g);
        const headlines = [];
        
        if (titleMatches) {
            for (let i = 1; i < Math.min(titleMatches.length, 6); i++) {
                let title = titleMatches[i].replace(/<title>|<\/title>/g, '');
                title = title.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
                if (title.length > 5 && !title.includes('news.google.com')) {
                    headlines.push(`${i}. ${title}`);
                }
            }
        }
        
        if (headlines.length > 0) {
            console.log('   ✅ Google News RSS found headlines');
            return headlines.join('\n');
        }
    } catch(e) {
        console.log('   Google News RSS failed:', e.message);
    }
    
    return null;
}

// ============================================
// 4. WEATHER - OpenWeatherMap (Your Key)
// ============================================
async function getWeather(city = 'Chennai') {
    if (WEATHER_KEY) {
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_KEY}&units=metric`;
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.cod === 200) {
                return `${city}: ${data.main.temp}°C, ${data.weather[0].description}, Humidity: ${data.main.humidity}%`;
            }
        } catch(e) {
            console.log('Weather API failed:', e.message);
        }
    }
    return `Weather service temporarily unavailable for ${city}, sir.`;
}

// ============================================
// 5. APP LAUNCHER
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
// 6. TIME FUNCTION
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
// 7. JARVIS SYSTEM PROMPT
// ============================================
const JARVIS_PROMPT = `You are Chottu - an AI assistant that responds exactly like JARVIS from Iron Man.

PERSONALITY:
- Intelligent, calm, efficient, and slightly witty
- Speak concisely (2-3 sentences maximum)
- Call the user "sir" or "friend"
- Never say "as an AI" or make excuses

STYLE:
- Direct and professional like JARVIS
- Use phrases like "Certainly, sir", "Right away, sir"
- Keep responses elegant and brief

Remember: Your name is Chottu, but you behave exactly like JARVIS.`;

// ============================================
// MAIN JARVIS AGENT ENDPOINT
// ============================================
app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.messages[req.body.messages.length - 1]?.content || '';
        const lowerMsg = userMessage.toLowerCase();
        
        console.log(`\n🎯 Chottu received: ${userMessage}`);
        
        // ===== OPEN APPS =====
        if (lowerMsg.includes('open') || lowerMsg.includes('launch')) {
            const appToOpen = findAppToOpen(userMessage);
            if (appToOpen) {
                return res.json({ 
                    choices: [{ message: { content: `Opening ${appToOpen.app}, sir.` } }],
                    action: { type: 'open_url', url: appToOpen.url }
                });
            }
        }
        
        // ===== WEATHER =====
        if (lowerMsg.includes('weather') || lowerMsg.includes('temperature') || lowerMsg.includes('rain')) {
            const cityMatch = userMessage.match(/weather in (\w+)/i) || userMessage.match(/weather (\w+)/i);
            const city = cityMatch ? cityMatch[1] : 'Chennai';
            const weather = await getWeather(city);
            return res.json({ choices: [{ message: { content: `The weather in ${weather}, sir.` } }] });
        }
        
        // ===== TIME/DATE =====
        if (lowerMsg.includes('time') || lowerMsg.includes('date') || lowerMsg.includes('today')) {
            return res.json({ choices: [{ message: { content: `Sir, it is ${getCurrentDateTime()}.` } }] });
        }
        
        // ===== NEWS =====
        if (lowerMsg.includes('news') || lowerMsg.includes('headlines')) {
            let topic = 'India';
            if (lowerMsg.includes('world')) topic = 'world';
            if (lowerMsg.includes('tech')) topic = 'technology';
            if (lowerMsg.includes('sports')) topic = 'sports';
            const news = await getNews(topic);
            if (news) {
                return res.json({ choices: [{ message: { content: `Here are the latest headlines, sir:\n\n${news}` } }] });
            }
            return res.json({ choices: [{ message: { content: `Sir, I couldn't fetch news at the moment. Try visiting news.google.com for the latest updates.` } }] });
        }
        
        // ===== SEARCH ANYTHING (IPL, Sports, General Questions) =====
        const searchResults = await searchWeb(userMessage);
        
        if (searchResults) {
            const searchPrompt = `Based on this information, answer the user's question like JARVIS: "${userMessage}"

Information found:
${searchResults}

Respond concisely and helpfully, starting with "Sir,". Be specific with facts, names, and numbers. Don't say "based on the information" - just give the answer directly.`;
            
            const aiResponse = await callAI([{ role: 'user', content: searchPrompt }]);
            return res.json({ choices: [{ message: { content: aiResponse.choices[0].message.content } }] });
        }
        
        // ===== REGULAR JARVIS CHAT =====
        const messages = req.body.messages;
        const enhancedMessages = [
            { role: 'system', content: JARVIS_PROMPT },
            { role: 'system', content: `Current context: ${getCurrentDateTime()} (Chennai/IST). Answer as JARVIS.` },
            ...messages.slice(1)
        ];
        
        const aiResponse = await callAI(enhancedMessages);
        res.json(aiResponse);
        
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: { message: `System error: ${error.message}` } });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`⚡ CHOTTU (JARVIS Mode) - ONLINE`);
    console.log(`${'='.repeat(50)}`);
    console.log(`📍 URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
    console.log(`📅 Time: ${getCurrentDateTime()}`);
    console.log(`\n🔌 API STATUS:`);
    console.log(`   🧠 DeepSeek: ${DEEPSEEK_KEY ? '✅' : '❌'} (Primary AI)`);
    console.log(`   🧠 OpenAI: ${OPENAI_KEY ? '✅' : '❌'} (Fallback AI)`);
    console.log(`   🧠 Groq: ${GROQ_KEY ? '✅' : '❌'} (Fallback AI)`);
    console.log(`   🔍 Tavily: ${TAVILY_KEY ? '✅' : '❌'} (Primary Search)`);
    console.log(`   🌤️ Weather: ${WEATHER_KEY ? '✅' : '❌'}`);
    console.log(`   📰 News: ${GNEWS_KEY ? '✅' : '❌'} (Primary News)`);
    console.log(`${'='.repeat(50)}`);
    console.log(`🎯 "Sir, Chottu is ready to assist you."`);
    console.log(`${'='.repeat(50)}\n`);
});
