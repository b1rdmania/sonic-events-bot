require('dotenv').config();
const { Telegraf } = require('telegraf');
const { resolveQuery, formatDataWithGemini, postProcessResponse } = require('./core/nlp/geminiService');
const { getEvents } = require('./services/lumaService');
const bot = new Telegraf(process.env.BOT_TOKEN);

async function processQuery(query, events) {
   try {
       const today = new Date().toISOString().split('T')[0];

       // Special case for Ash question
       if (query.toLowerCase().includes('ash') && query.toLowerCase().includes('drunk') && query.toLowerCase().includes('denver')) {
           return "Yes of course he will 🍻";
       }
       
       // Use Gemini for processing the query
       const response = await resolveQuery(query, { events });
       return response;
   } catch (error) {
       console.error('Gemini Error:', error);
       throw error;
   }
}

function filterEventsByRegion(events, region) {
   const regionMappings = {
       'na': ['USA', 'Canada'],
       'eu': ['Europe'],
       'asia': ['China', 'Japan', 'Korea', 'Singapore', 'Taiwan'],
       'me': ['Middle East', 'Dubai', 'UAE'],
       'latam': ['LATAM', 'Brazil', 'Argentina'],
       'aus': ['Australia', 'New Zealand'],
       'uk': ['UK', 'London'],
       'sea': ['Vietnam', 'Thailand', 'Indonesia'],
       'india': ['India']
   };

   const regions = regionMappings[region];
   return events.filter(event => 
       regions.some(r => event.location?.includes(r) || event.region?.includes(r))
   );
}

function formatEventsList(events) {
   return events
       .filter(event => event.name && event.date)
       .map(event => `${event.name} (${event.date})`)
       .join('\n');
}

const helpText = `Hey! 👋 I'm primarily designed for natural conversation - just ask me anything about events like you'd ask a colleague. 

Some example questions:
"What's coming up in Dubai?"
"Any big events in March?"
"What's the status of ETHDenver?"
"Are we doing anything in Asia this summer?"
"Will Ash get blackout drunk in Denver?" 🍻

If you prefer quick lookups, here are some commands:

⏱️ Time-based:
/next - Next 3 upcoming events
/thismonth - Events this month

🌎 Regions:
/na - North America
/eu - Europe
/asia - Asia
/me - Middle East
/latam - Latin America
/aus - Australia/NZ
/uk - United Kingdom
/sea - Southeast Asia
/india - India events

📊 Status:
/confirmed - Only confirmed events
/exploring - Events we're exploring
/watchlist - High priority events

🔍 Search:
/eth - All ETH-related events
/search [term] - Search specific events

Remember, you don't need these commands - just chat normally and ask whatever you want to know! 

Coming soon: Negotiation tracking, weekly reports, and team travel coordination. Stay tuned! 🚀`;

bot.command('start', (ctx) => {
   ctx.reply(helpText);
});

bot.command('next', async (ctx) => {
   const events = await getEvents();
   const sorted = events
       .filter(event => new Date(event.date) > new Date())
       .sort((a, b) => new Date(a.date) - new Date(b.date))
       .slice(0, 3);
   ctx.reply(`Next 3 events:\n\n${formatEventsList(sorted)}`);
});

bot.command('thismonth', async (ctx) => {
   const events = await getEvents();
   const currentMonth = new Date().getMonth();
   const currentYear = new Date().getFullYear();
   const monthEvents = events.filter(event => {
       const eventDate = new Date(event.date);
       return eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear;
   });
   ctx.reply(`Events this month:\n\n${formatEventsList(monthEvents)}`);
});

const regions = ['na', 'eu', 'asia', 'me', 'latam', 'aus', 'uk', 'sea', 'india'];
regions.forEach(region => {
   bot.command(region, async (ctx) => {
       const events = await getEvents();
       const filteredEvents = filterEventsByRegion(events, region);
       ctx.reply(`Events in ${region.toUpperCase()}:\n\n${formatEventsList(filteredEvents)}`);
   });
});

bot.command('confirmed', async (ctx) => {
   const events = await getEvents();
   const confirmedEvents = events.filter(event => event.status?.toLowerCase() === 'confirmed');
   ctx.reply(`Confirmed events:\n\n${formatEventsList(confirmedEvents)}`);
});

bot.command('exploring', async (ctx) => {
   const events = await getEvents();
   const exploringEvents = events.filter(event => event.status?.toLowerCase() === 'exploring');
   ctx.reply(`Events we're exploring:\n\n${formatEventsList(exploringEvents)}`);
});

bot.command('watchlist', async (ctx) => {
   const events = await getEvents();
   const highPriority = events.filter(event => event.priority?.toLowerCase() === 'high');
   ctx.reply(`High priority events:\n\n${formatEventsList(highPriority)}`);
});

bot.command('eth', async (ctx) => {
   const events = await getEvents();
   const ethEvents = events.filter(event => 
       event.name?.toLowerCase().includes('eth') || 
       event.name?.toLowerCase().includes('ethereum')
   );
   ctx.reply(`ETH-related events:\n\n${formatEventsList(ethEvents)}`);
});

bot.command('search', async (ctx) => {
   const searchTerm = ctx.message.text.split('/search ')[1]?.toLowerCase();
   if (!searchTerm) {
       ctx.reply('Please provide a search term: /search [term]');
       return;
   }
   const events = await getEvents();
   const searchResults = events.filter(event => 
       event.name?.toLowerCase().includes(searchTerm) || 
       event.location?.toLowerCase().includes(searchTerm)
   );
   ctx.reply(`Search results for "${searchTerm}":\n\n${formatEventsList(searchResults)}`);
});

bot.command('help', (ctx) => {
   ctx.reply(helpText);
});

bot.on('text', async (ctx) => {
   try {
       // Only respond to direct messages or if bot is mentioned in groups
       if (ctx.message.chat.type === 'private' || ctx.message.text.includes('@soniceventsbot')) {
           const query = ctx.message.text.replace('@soniceventsbot', '').trim();
           const events = await getEvents();
           const response = await processQuery(query, events);
           ctx.reply(response);
       }
   } catch (error) {
       console.error('Error:', error);
       ctx.reply('Sorry, something went wrong. Try asking another way?');
   }
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));