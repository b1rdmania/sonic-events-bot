const Airtable = require('airtable');
const base = new Airtable({apiKey: process.env.AIRTABLE_API_KEY}).base(process.env.AIRTABLE_BASE_ID);

async function getEvents() {
    try {
        const records = await base('Events').select({
            maxRecords: 100,
            view: 'Grid view'
        }).firstPage();
        
        return records.map(record => ({
            name: record.get('Event Name'),
            date: record.get('Date'),
            location: record.get('Location'),
            status: record.get('Status'),
            priority: record.get('Priority')
        }));
    } catch (error) {
        console.error('Error fetching events:', error);
        throw error;
    }
}

module.exports = { getEvents };