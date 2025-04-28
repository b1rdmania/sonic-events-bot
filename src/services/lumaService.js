const axios = require('axios');
const config = require('../config/config');

const LUMA_API_BASE_URL = 'https://api.lu.ma/public/v1';

// Create axios instance for Luma API calls
const lumaAxios = axios.create({
    baseURL: LUMA_API_BASE_URL,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-luma-api-key': config.luma.apiKey
    },
    timeout: 15000 // 15 second timeout
});

async function getEvents() {
    try {
        console.log('Fetching events from Luma API...');
        const response = await lumaAxios.get('/calendar/list-events');
        console.log('Luma API response status:', response.status);
        console.log('Number of events found:', response.data.entries?.length || 0);
        
        if (!response.data.entries) {
            console.error('No events array in response:', response.data);
            throw new Error('Invalid response format from Luma API');
        }

        return response.data.entries.map(event => ({
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
            } : 'No response'
        });
        throw new Error(`Failed to fetch events from Luma API: ${error.message}`);
    }
}

async function getEventByName(eventName) {
    try {
        if (!eventName) {
            throw new Error('Event name is required');
        }

        console.log('Searching for event:', eventName);
        const events = await getEvents();
        console.log('Found events:', events.map(e => e.name));

        const searchName = eventName.toLowerCase();
        const event = events.find(e => {
            if (!e.name) {
                console.warn('Event missing name:', e);
                return false;
            }
            return e.name.toLowerCase().includes(searchName);
        });

        if (!event) {
            console.log('No matching event found for:', eventName);
            console.log('Available events:', events.map(e => e.name).join(', '));
            throw new Error(`Event "${eventName}" not found`);
        }

        console.log('Found matching event:', event.name);
        return event;
    } catch (error) {
        console.error('Error finding event:', error);
        throw error;
    }
}

async function getGuests(eventId, status = null) {
    try {
        if (!eventId) {
            throw new Error('Event ID is required');
        }

        const params = { event_api_id: eventId };
        if (status) {
            params.approval_status = status;
        }
        
        console.log('Fetching guests for event:', eventId, 'with status:', status);
        const response = await lumaAxios.get('/event/get-guests', { params });
        console.log('Found guests:', response.data.entries?.length || 0);

        if (!response.data.entries) {
            console.error('No guests array in response:', response.data);
            throw new Error('Invalid response format from Luma API');
        }

        return response.data.entries.map(guest => ({
            email: guest.email,
            name: guest.name,
            status: guest.status,
            registered_at: guest.registered_at
        }));
    } catch (error) {
        console.error('Error fetching guests from Luma:', {
            message: error.message,
            response: error.response ? {
                status: error.response.status,
                data: error.response.data
            } : 'No response'
        });
        throw new Error(`Failed to fetch guests from Luma API: ${error.message}`);
    }
}

async function getPendingGuests(eventName) {
    try {
        console.log('Getting pending guests for event:', eventName);
        const event = await getEventByName(eventName);
        const guests = await getGuests(event.api_id, 'pending_approval');
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
        console.log('Getting approved guests for event:', eventName);
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