const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('.'));

// ============================================
// YOUR API KEYS (from Render Environment)
// ============================================
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY;
const GROQ_KEY = process.env.GROQ_KEY;
const OPENAI_KEY = process.env.OPENA1_KEY;
const WEATHER_KEY = process.env.WEATHER_KEY;
const GNEWS_KEY = process.env.GNEWS_KEY;
const TAVILY_KEY = process.env.TAVILY_KEY;

// ============================================
// IPL 2026 SCHEDULE (Based on typical IPL schedule)
// ============================================
function getIPLStatus() {
    const today = new Date();
    const year = today.getFullYear();
    
    // IPL typically starts in March and ends in May/June
    const iplStartDate = new Date(year, 2, 22); // March 22
    const iplEndDate = new Date(year, 4, 29);   // May 29 (typical final date)
    
    let status = {
        hasHappened: false,
        isOngoing: false,
        isUpcoming: false,
        message: ""
    };
    
    if (today > iplEndDate) {
        status.hasHappened = true;
        status.message = `IPL ${year} has already concluded (ended on ${iplEndDate.toLocaleDateString('en-IN')}). The winner has been declared.`;
    } else if (today >= iplStartDate && today <= iplEndDate) {
        status.isOngoing = true;
        status.message = `IPL ${year} is currently ongoing! (Started: ${iplStartDate.toLocaleDateString('en-IN')}, Final: ${iplEndDate.toLocaleDateString('en-IN')})`;
    } else {
        status.isUpcoming = true;
        status.message = `IPL ${year} hasn't started yet. It will begin on ${iplStartDate.toLocaleDateString('en-IN')} and the final will be on ${iplEndDate.toLocaleDateString('en-IN')}.`;
    }
    
    return status;
}

// ============================================
// AI CHAT - Multiple Providers with Auto-Failover
// ============================================
async function callAI(messages) {
    console.log(`🧠 Trying AI providers...`);
    
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
// WEB SEARCH - Tavily + DuckDuckGo
// ============================================
async function searchWeb(query) {
    console.log(`🔍 Searching: ${query}`);
    
    let enhancedQuery = query;
    if (query.toLowerCase().includes('ipl') || query.toLowerCase().includes('cricket')) {
        enhancedQuery = `${query} 2026 final winner match result score`;
    }
    
    if (TAVILY_KEY) {
        try {
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: TAVILY_KEY,
                    query: enhancedQuery,
                    search_depth: 'advanced',
                    max_results: 10,
                    include_answer: true,
                    include_raw_content: true
                })
            });
            const data = await response.json();
            
            if (data.answer) {
                console.log('   ✅ Tavily provided answer');
                return data.answer;
            }
            if (data.results && data.results.length > 0) {
                const relevantResults = data.results.filter(r => 
                    r.content.toLowerCase().includes('winner') || 
                    r.content.toLowerCase().includes('champion') ||
                    r.content.toLowerCase().includes('final') ||
                    r.content.toLowerCase().includes('defeated')
                );
                const resultsToUse = relevantResults.length > 0 ? relevantResults : data.results;
                const combinedContent = resultsToUse.slice(0, 5).map(r => r.content).join(' ');
                console.log('   ✅ Tavily found results');
                return combinedContent.substring(0, 2000);
            }
        } catch(e) {
            console.log('   Tavily failed:', e.message);
        }
    }
    
    try {
        console.log('   Trying DuckDuckGo fallback...');
        const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
        const data = await response.json();
        
        if (data.AbstractText && data.AbstractText.length > 50) {
            console.log('   ✅ DuckDuckGo found results');
            return data.AbstractText.substring(0, 1000);
        }
    } catch(e) {
        console.log('   DuckDuckGo failed:', e.message);
    }
    
    return null;
}

// ============================================
// NEWS - GNews + Google News RSS
// ============================================
async function getNews(topic = 'India') {
    console.log(`📰 Fetching news for: ${topic}`);
    
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
    
    try {
        console.log('   Trying Google News RSS...');
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
        const response = await fetch(rssUrl);
        const rssText = await response.text();
        
        const titleMatches = rssText.match(/<title>(.*?)<\/title>/g);
        const headlines = [];
        
        if (titleMatches) {
            for (let i = 1; i < Math.min(titleMatches.length, 6); i++) {
                let title = titleMatches[i].replace(/<title>|<\/title>/g, '');
                title = title.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                if (title.length > 5 && !title.includes('news.google.com')) {
                    headlines.push(`${i}. ${title}`);
                }
            }
        }
        
        if (headlines.length > 0) {
            console.log('   ✅ Google News found headlines');
            return headlines.join('\n');
        }
    } catch(e) {
        console.log('   Google News failed:', e.message);
    }
    
    return null;
}

// ============================================
// WEATHER
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
            console.log('Weather failed:', e.message);
        }
    }
    return `Weather service temporarily unavailable for ${city}, sir.`;
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
// JARVIS SYSTEM PROMPT
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
        
        // ===== IPL STATUS CHECK (New Feature) =====
        if (lowerMsg.includes('ipl') && (lowerMsg.includes('status') || lowerMsg.includes('happened') || 
            lowerMsg.includes('ongoing') || lowerMsg.includes('upcoming') || lowerMsg.includes('when'))) {
            const iplStatus = getIPLStatus();
            return res.json({ 
                choices: [{ 
                    message: { 
                        content: `Sir, ${iplStatus.message}\n\nFor specific match results, you can ask me to "search for IPL ${new Date().getFullYear()} winner".` 
                    } 
                }] 
            });
        }
        
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
        
        // ===== SPORTS/IPL/CRICKET (with status awareness) =====
        if (lowerMsg.includes('ipl') || lowerMsg.includes('cricket') || 
            lowerMsg.includes('score') || lowerMsg.includes('match') || 
            lowerMsg.includes('winner') || lowerMsg.includes('champion')) {
            
            console.log(`🏏 Sports query detected: ${userMessage}`);
            
            // First check if the user is asking for the winner
            const isAskingForWinner = lowerMsg.includes('winner') || lowerMsg.includes('won') || lowerMsg.includes('champion');
            
            if (isAskingForWinner) {
                const iplStatus = getIPLStatus();
                const currentYear = new Date().getFullYear();
                
                // If IPL hasn't happened yet, tell the user
                if (!iplStatus.hasHappened) {
                    if (iplStatus.isOngoing) {
                        return res.json({ 
                            choices: [{ 
                                message: { 
                                    content: `Sir, IPL ${currentYear} is currently ongoing! The winner hasn't been declared yet. The final is scheduled for May/June ${currentYear}. I can search for live scores if you'd like.` 
                                } 
                            }] 
                        });
                    } else if (iplStatus.isUpcoming) {
                        return res.json({ 
                            choices: [{ 
                                message: { 
                                    content: `Sir, IPL ${currentYear} hasn't started yet. It will begin in March ${currentYear}. There is no winner yet. Would you like me to remind you when it starts?` 
                                } 
                            }] 
                        });
                    }
                }
            }
            
            // Search the web for IPL information
            const searchResults = await searchWeb(userMessage);
            
            if (searchResults) {
                const iplStatus = getIPLStatus();
                const contextPrompt = `Current IPL status: ${iplStatus.message}\n\n`;
                
                const sportsPrompt = `${contextPrompt}Based on this search information, answer the user's question: "${userMessage}"

Search results:
${searchResults}

Give a DIRECT, SPECIFIC answer. If you find a winner, say "Sir, [Team Name] won IPL ${new Date().getFullYear()}." 
If no winner is found in the search results and the tournament should have happened, say "Sir, I couldn't find the IPL winner in my search. The information may not be available yet or the tournament may still be ongoing."
Be honest about what you find.`;
                
                const aiResponse = await callAI([{ role: 'user', content: sportsPrompt }]);
                return res.json({ choices: [{ message: { content: aiResponse.choices[0].message.content } }] });
            }
            
            // If search fails, provide helpful response
            const iplStatus = getIPLStatus();
            return res.json({ 
                choices: [{ 
                    message: { 
                        content: `Sir, ${iplStatus.message}\n\nI searched for IPL information but couldn't find specific results. You can try:\n• Asking "IPL schedule ${new Date().getFullYear()}"\n• Checking iplt20.com directly\n• Asking me to search for "IPL live score"` 
                    } 
                }] 
            });
        }
        
        // ===== GENERAL SEARCH =====
        const searchResults = await searchWeb(userMessage);
        
        if (searchResults) {
            const searchPrompt = `Based on this information, answer the user's question like JARVIS: "${userMessage}"

Information found:
${searchResults}

Respond concisely and helpfully, starting with "Sir,". Be specific with facts, names, and numbers.`;
            
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
    const iplStatus = getIPLStatus();
    console.log(`\n${'='.repeat(50)}`);
    console.log(`⚡ CHOTTU (JARVIS Mode) - ONLINE`);
    console.log(`${'='.repeat(50)}`);
    console.log(`📍 URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
    console.log(`📅 Time: ${getCurrentDateTime()}`);
    console.log(`\n🏏 IPL Status: ${iplStatus.message}`);
    console.log(`\n🔌 API STATUS:`);
    console.log(`   🧠 DeepSeek: ${DEEPSEEK_KEY ? '✅' : '❌'}`);
    console.log(`   🧠 OpenAI: ${OPENAI_KEY ? '✅' : '❌'}`);
    console.log(`   🧠 Groq: ${GROQ_KEY ? '✅' : '❌'}`);
    console.log(`   🔍 Tavily: ${TAVILY_KEY ? '✅' : '❌'}`);
    console.log(`   🌤️ Weather: ${WEATHER_KEY ? '✅' : '❌'}`);
    console.log(`   📰 News: ${GNEWS_KEY ? '✅' : '❌'}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`🎯 "Sir, Chottu is ready to assist you."`);
    console.log(`${'='.repeat(50)}\n`);
});
