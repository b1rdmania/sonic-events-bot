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
        const response = await lumaAxios.get(`${config.luma.apiUrl}/events`, {
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