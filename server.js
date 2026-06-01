const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('.'));

// ============================================
// YOUR API KEYS (Add your NEW Lightning.ai key here)
// ============================================
const LIGHTNING_KEY = process.env.LIGHTNING_KEY || 'YOUR_NEW_LIGHTNING_KEY_HERE';
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY;
const GROQ_KEY = process.env.GROQ_KEY;
const OPENAI_KEY = process.env.OPENA1_KEY;
const WEATHER_KEY = process.env.WEATHER_KEY;
const GNEWS_KEY = process.env.GNEWS_KEY;
const TAVILY_KEY = process.env.TAVILY_KEY;

// ============================================
// IPL STATUS DETECTION
// ============================================
function getIPLStatus() {
    const today = new Date();
    const year = today.getFullYear();
    const iplStartDate = new Date(year, 2, 22); // March 22
    const iplEndDate = new Date(year, 4, 29);   // May 29
    
    if (today > iplEndDate) {
        return { 
            hasHappened: true, 
            isOngoing: false, 
            isUpcoming: false,
            message: `IPL ${year} has already concluded. The final happened on ${iplEndDate.toLocaleDateString('en-IN')}.`
        };
    } else if (today >= iplStartDate && today <= iplEndDate) {
        return { 
            hasHappened: false, 
            isOngoing: true, 
            isUpcoming: false,
            message: `IPL ${year} is currently ongoing! Matches are being played.`
        };
    } else {
        return { 
            hasHappened: false, 
            isOngoing: false, 
            isUpcoming: true,
            message: `IPL ${year} hasn't started yet. It will begin on ${iplStartDate.toLocaleDateString('en-IN')}.`
        };
    }
}

// ============================================
// AI CHAT - Lightning.ai (Primary) + Fallbacks
// ============================================
async function callLightningAI(messages) {
    if (!LIGHTNING_KEY || LIGHTNING_KEY === 'YOUR_NEW_LIGHTNING_KEY_HERE') return null;
    
    try {
        console.log('   🤖 Trying Lightning.ai (Gemini 3.5 Flash)...');
        const response = await fetch('https://lightning.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${LIGHTNING_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'google/gemini-3.5-flash',
                messages: messages,
                temperature: 0.7,
                max_tokens: 500
            })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) {
            console.log('   ✅ Lightning.ai responded');
            return data;
        }
    } catch(e) {
        console.log('   Lightning.ai failed:', e.message);
    }
    return null;
}

async function callDeepSeek(messages) {
    if (!DEEPSEEK_KEY) return null;
    try {
        console.log('   🤖 Trying DeepSeek...');
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
    return null;
}

async function callGroq(messages) {
    if (!GROQ_KEY) return null;
    try {
        console.log('   🤖 Trying Groq...');
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
    return null;
}

async function callAI(messages) {
    console.log(`🧠 Trying AI providers...`);
    
    const lightningResult = await callLightningAI(messages);
    if (lightningResult) return lightningResult;
    
    const deepseekResult = await callDeepSeek(messages);
    if (deepseekResult) return deepseekResult;
    
    const groqResult = await callGroq(messages);
    if (groqResult) return groqResult;
    
    throw new Error('All AI providers failed');
}

// ============================================
// WEB SEARCH - Tavily + DuckDuckGo
// ============================================
async function searchWeb(query) {
    console.log(`🔍 Searching: ${query}`);
    
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
    
    try {
        console.log('   Trying DuckDuckGo...');
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
    return `Weather temporarily unavailable for ${city}, sir.`;
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
    'amazon': 'https://amazon.in',
    'flipkart': 'https://flipkart.com'
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
// JARVIS PROMPT
// ============================================
const JARVIS_PROMPT = `You are Chottu - an AI assistant that responds exactly like JARVIS from Iron Man.

PERSONALITY:
- Intelligent, calm, efficient, and slightly witty
- Speak concisely (2-3 sentences maximum)
- Call the user "sir"
- Never say "as an AI" or make excuses

STYLE:
- Direct and professional like JARVIS
- Use phrases like "Certainly, sir", "Right away, sir"
- Keep responses elegant and brief

Remember: Your name is Chottu, but you behave exactly like JARVIS.`;

// ============================================
// MAIN ENDPOINT
// ============================================
app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.messages[req.body.messages.length - 1]?.content || '';
        const lowerMsg = userMessage.toLowerCase();
        
        console.log(`\n🎯 Chottu received: ${userMessage}`);
        
        // ===== IPL STATUS =====
        if (lowerMsg.includes('ipl') && (lowerMsg.includes('status') || lowerMsg.includes('happened') || 
            lowerMsg.includes('ongoing') || lowerMsg.includes('upcoming') || lowerMsg.includes('when'))) {
            const iplStatus = getIPLStatus();
            return res.json({ 
                choices: [{ 
                    message: { 
                        content: `Sir, ${iplStatus.message}` 
                    } 
                }] 
            });
        }
        
        // ===== WHO WON IPL =====
        if ((lowerMsg.includes('who won') || lowerMsg.includes('winner')) && lowerMsg.includes('ipl')) {
            const iplStatus = getIPLStatus();
            
            if (!iplStatus.hasHappened) {
                if (iplStatus.isOngoing) {
                    return res.json({ 
                        choices: [{ 
                            message: { 
                                content: `Sir, IPL ${new Date().getFullYear()} is currently ongoing! The winner hasn't been declared yet. The final is scheduled for late May.` 
                            } 
                        }] 
                    });
                } else if (iplStatus.isUpcoming) {
                    return res.json({ 
                        choices: [{ 
                            message: { 
                                content: `Sir, IPL ${new Date().getFullYear()} hasn't started yet. It will begin in March. There is no winner yet.` 
                            } 
                        }] 
                    });
                }
            }
            
            // Search for winner
            const searchResults = await searchWeb(`IPL ${new Date().getFullYear()} winner champion final result`);
            if (searchResults) {
                const prompt = `Based on this info, answer who won IPL ${new Date().getFullYear()}:\n\n${searchResults}\n\nGive direct answer: "Sir, [Team Name] won IPL ${new Date().getFullYear()}." If not found, say so.`;
                const aiResponse = await callAI([{ role: 'user', content: prompt }]);
                return res.json({ choices: [{ message: { content: aiResponse.choices[0].message.content } }] });
            }
            return res.json({ 
                choices: [{ 
                    message: { 
                        content: `Sir, I couldn't find the IPL ${new Date().getFullYear()} winner. Try checking iplt20.com for official results.` 
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
            return res.json({ choices: [{ message: { content: `Sir, I couldn't fetch news at the moment. Try news.google.com for updates.` } }] });
        }
        
        // ===== GENERAL SEARCH =====
        const searchResults = await searchWeb(userMessage);
        if (searchResults) {
            const prompt = `Based on this info, answer the user's question like JARVIS:\n\nUser: ${userMessage}\n\nInfo: ${searchResults}\n\nAnswer concisely starting with "Sir,". Be specific.`;
            const aiResponse = await callAI([{ role: 'user', content: prompt }]);
            return res.json({ choices: [{ message: { content: aiResponse.choices[0].message.content } }] });
        }
        
        // ===== REGULAR CHAT =====
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
    console.log(`   🤖 Lightning.ai (Gemini): ${LIGHTNING_KEY && LIGHTNING_KEY !== 'YOUR_NEW_LIGHTNING_KEY_HERE' ? '✅ PRIMARY' : '❌'}`);
    console.log(`   🤖 DeepSeek: ${DEEPSEEK_KEY ? '✅' : '❌'}`);
    console.log(`   🤖 Groq: ${GROQ_KEY ? '✅' : '❌'}`);
    console.log(`   🔍 Tavily: ${TAVILY_KEY ? '✅' : '❌'}`);
    console.log(`   🌤️ Weather: ${WEATHER_KEY ? '✅' : '❌'}`);
    console.log(`   📰 News: ${GNEWS_KEY ? '✅' : '❌'}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`🎯 "Sir, Chottu is ready to assist you."`);
    console.log(`${'='.repeat(50)}\n`);
});
