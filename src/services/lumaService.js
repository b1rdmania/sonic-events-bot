const axios = require('axios');
const config = require('../config/config');

// Create axios instance with SSL verification disabled for development
const lumaAxios = axios.create({
    httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
    })
});

async function getEvents() {
    try {
        console.log('Fetching events from Luma API...');
        console.log('API URL:', config.luma.apiUrl);
        console.log('API Key length:', config.luma.apiKey ? config.luma.apiKey.length : 0);
        
        const response = await lumaAxios.get(`${config.luma.apiUrl}/events`, {
            headers: {
                'Authorization': `Bearer ${config.luma.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Luma API response status:', response.status);
        console.log('Luma API response data:', JSON.stringify(response.data, null, 2));

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
        console.error('Error fetching events from Luma:', {
            message: error.message,
            response: error.response ? {
                status: error.response.status,
                data: error.response.data
            } : 'No response',
            config: error.config ? {
                url: error.config.url,
                method: error.config.method,
                headers: error.config.headers
            } : 'No config'
        });
        throw new Error(`Failed to fetch events from Luma API: ${error.message}`);
    }
}

async function getEventByName(eventName) {
    try {
        const events = await getEvents();
        const event = events.find(e => e.name.toLowerCase().includes(eventName.toLowerCase()));
        if (!event) {
            throw new Error(`Event "${eventName}" not found`);
        }
        return event;
    } catch (error) {
        console.error('Error finding event:', error);
        throw error;
    }
}

async function getGuests(eventId, status = null) {
    try {
        const url = `${config.luma.apiUrl}/events/${eventId}/guests`;
        const response = await lumaAxios.get(url, {
            headers: {
                'Authorization': `Bearer ${config.luma.apiKey}`,
                'Content-Type': 'application/json'
            },
            params: status ? { status } : undefined
        });

        return response.data.guests.map(guest => ({
            email: guest.email,
            name: guest.name,
            status: guest.status,
            registered_at: guest.registered_at
        }));
    } catch (error) {
        console.error('Error fetching guests from Luma:', error);
        throw new Error('Failed to fetch guests from Luma API');
    }
}

async function getPendingGuests(eventName) {
    try {
        const event = await getEventByName(eventName);
        const guests = await getGuests(event.api_id, 'pending');
        return {
            event,
            guests,
            count: guests.length
        };
    } catch (error) {
        console.error('Error getting pending guests:', error);
        throw error;
    }
}

async function getApprovedGuests(eventName) {
    try {
        const event = await getEventByName(eventName);
        const guests = await getGuests(event.api_id, 'approved');
        return {
            event,
            guests,
            count: guests.length
        };
    } catch (error) {
        console.error('Error getting approved guests:', error);
        throw error;
    }
}

module.exports = {
    getEvents,
    getEventByName,
    getGuests,
    getPendingGuests,
    getApprovedGuests
}; 