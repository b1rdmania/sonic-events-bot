require('dotenv').config();
const { Telegraf } = require('telegraf');
const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Fallback responses when OpenAI is unavailable
const fallbackResponses = {
    pricing: `Here's our typical pricing structure:

✈️ Light Jet (4-6 pax)
• 2-3 hour flights: $15-25k
• Cross-country: $25-35k
• Transatlantic: $45-65k

✈️ Mid-size Jet (7-8 pax)
• Add ~30% to above prices

Would you like to connect with our aviation team for exact quotes?`,
    
    process: `Our process is straightforward:

1. Tell us your route and requirements
2. We provide aircraft options and pricing
3. Connect with our aviation team for final details
4. Book with crypto or fiat
5. Take off ✈️

What route are you interested in?`,
    
    general: `Thanks for your message! Our team typically responds with:

• Route-specific pricing
• Aircraft recommendations
• Booking process details

Would you like information about any of these?`
};

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Error handling
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err);
    ctx.reply('An error occurred while processing your request.');
});

// Welcome message
bot.command('start', async (ctx) => {
    try {
        const welcomeMessage = `✈️ Welcome to CoinWings – private aviation for the crypto jet set.\n\n` +
            `We fly fast, book discreetly, and accept crypto. 🚀\n\n` +
            `How can we help?`;
        
        await ctx.reply(welcomeMessage);
    } catch (error) {
        console.error('Error in start command:', error);
        ctx.reply('Sorry, there was an error processing your request.');
    }
});

// Help command
bot.command('help', async (ctx) => {
    try {
        const helpMessage = `✈️ **CoinWings Commands**\n\n` +
            `/start - Welcome message\n` +
            `/help - Show this help message\n\n` +
            `You can also just chat naturally about your flight requirements!`;
        
        await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error in help command:', error);
        ctx.reply('Sorry, there was an error processing your request.');
    }
});

// Message handling with fallback responses
bot.on('text', async (ctx) => {
    try {
        console.log('Received message:', ctx.message.text);
        
        try {
            // Attempt OpenAI response
            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: `You are CoinWings' private aviation expert. You help crypto-native clients with private jet inquiries.
                        Keep responses concise and professional. Focus on:
                        - Route information
                        - Aircraft recommendations
                        - Approximate pricing
                        - Next steps
                        
                        If the user shows serious interest, suggest connecting them with our aviation team.`
                    },
                    {
                        role: "user",
                        content: ctx.message.text
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
            });

            const response = completion.choices[0].message.content;
            await ctx.reply(response);
            
        } catch (aiError) {
            console.error('OpenAI Error:', aiError);
            
            // Determine appropriate fallback response
            let response = fallbackResponses.general;
            const message = ctx.message.text.toLowerCase();
            
            if (message.includes('price') || message.includes('cost') || message.includes('how much')) {
                response = fallbackResponses.pricing;
            } else if (message.includes('process') || message.includes('how does') || message.includes('how do')) {
                response = fallbackResponses.process;
            }
            
            await ctx.reply(response);
        }
        
    } catch (error) {
        console.error('Error in message handler:', error);
        await ctx.reply(fallbackResponses.general);
    }
});

// Start bot
bot.launch()
    .then(() => {
        console.log('CoinWings bot (simple version) is running...');
    })
    .catch((err) => {
        console.error('Error starting bot:', err);
    });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 