const OpenAI = require('openai');
const openai = new OpenAI(process.env.OPENAI_API_KEY);

async function processQuery(query) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{
                role: "system",
                content: "You are an events assistant. Help users find information about Sonic events."
            }, {
                role: "user",
                content: query
            }]
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error('Error processing query:', error);
        throw error;
    }
}

module.exports = { processQuery };
