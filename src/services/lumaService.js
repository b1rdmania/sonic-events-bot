const axios = require('axios');
const config = require('../config/config');

async function getEvents() {
    try {
        const response = await axios.get(`${config.luma.apiUrl}/events`, {
            headers: {
                'Authorization': `Bearer ${config.luma.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.events.map(event => ({
            name: event.name,
            date: event.start_at,
            location: event.location,
            status: event.status,
            priority: event.priority,
            region: event.region,
            api_id: event.id
        }));
    } catch (error) {
        console.error('Error fetching events from Luma:', error);
        throw new Error('Failed to fetch events from Luma API');
    }
}

module.exports = {
    getEvents
}; 