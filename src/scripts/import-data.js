require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set } = require('firebase/database');
const fs = require('fs');
const path = require('path');

// Firebase configuration
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  databaseURL: process.env.FIREBASE_DATABASE_URL
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Import data
async function importData() {
  try {
    // Read sample data
    const sampleDataPath = path.join(__dirname, '../../firebase-sample-data.json');
    const sampleData = JSON.parse(fs.readFileSync(sampleDataPath, 'utf8'));
    
    console.log('Importing data to Firebase...');
    
    // Import aircraft data
    console.log('Importing aircraft data...');
    const aircraftRef = ref(database, 'aircraft');
    await set(aircraftRef, sampleData.aircraft);
    
    // Import routes data
    console.log('Importing routes data...');
    const routesRef = ref(database, 'routes');
    await set(routesRef, sampleData.routes);
    
    // Import FAQ data
    console.log('Importing FAQ data...');
    const faqRef = ref(database, 'faq');
    await set(faqRef, sampleData.faq);
    
    console.log('Data import completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error importing data:', error);
    process.exit(1);
  }
}

// Run the import
importData(); 