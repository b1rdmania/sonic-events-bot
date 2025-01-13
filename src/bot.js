require('dotenv').config();
const { Telegraf } = require('telegraf');
const { getEvents } = require('./airtable');
const OpenAI = require('openai');

const openai = new OpenAI(process.env.OPENAI_API_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);

async function processQuery(query, events) {
   try {
       const today = new Date().toISOString().split('T')[0];

       // Special case for Ash question
       if (query.toLowerCase().includes('ash') && query.toLowerCase().includes('drunk') && query.toLowerCase().includes('denver')) {
           return "Yes of course he will 🍻";
       }
       
       const completion = await openai.chat.completions.create({
           model: "gpt-4",
           messages: [
               {
                   role: "system",
                   content: `You are a knowledgeable and slightly sarcastic assistant helping senior team members check Sonic World events. 
                   Today's date is ${today}.
                   
                   Key principles:
                   - Be extremely concise and clear like Hemingway or Orwell
                   - Channel George Carlin's wit when appropriate
                   - Use British English
                   - Avoid listing events unless specifically asked
                   - Give brief, focused answers - one or two sentences when possible
                   - Skip unnecessary details
                   - No adverbs or unnecessary adjectives
                   - Treat the user as an expert
                   - Be accurate above all else

                   If the query is completely unrelated to events or business, respond with something like:
                   "Look, Andy's paying good money for these OpenAI credits. Maybe ask about events instead?"
                   or
                   "I'd love to help, but every token costs money and Andy's watching the bill."
                   
                   If they ask about features we don't have yet, mention that we're working on:
                   - Integration with negotiation tracking
                   - Weekly report summaries
                   - Event documentation links
                   - Team travel coordination
                   
                   Only mention events if directly relevant to the query. Default to mentioning single events rather than lists. If someone asks about a region or timeframe, give a highlight or two rather than exhaustive lists.`
               },
               {
                   role: "user",
                   content: `Query: ${query}\n\nEvents data: ${JSON.stringify(events)}`
               }
           ]
       });

       return completion.choices[0].message.content;
   } catch (error) {
       console.error('GPT Error:', error);
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
       const query = ctx.message.text;
       const events = await getEvents();
       const response = await processQuery(query, events);
       ctx.reply(response);
   } catch (error) {
       console.error('Error:', error);
       ctx.reply('Sorry, something went wrong. Try asking another way?');
   }
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));