// ARCHIVED CODE - For future reference when implementing knowledge base
require('dotenv').config();
const Airtable = require('airtable');

const base = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

async function getEvents() {
    try {
        const records = await base('Events').select({
            view: 'Grid view'
        }).all();
        
        return records.map(record => ({
            id: record.id,
            name: record.get('Name'),
            date: record.get('Date'),
            location: record.get('Location'),
            status: record.get('Status'),
            priority: record.get('Priority'),
            region: record.get('Region')
        }));
    } catch (error) {
        console.error('Error fetching events:', error);
        throw error;
    }
}

module.exports = {
    getEvents
}; 