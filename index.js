console.log('--- Minimal Test: Starting index.js ---');

try {
    console.log('Requiring @google/genai...');
    const genaiPackage = require('@google/genai');
    console.log('Require successful.');

    console.log('Accessing GoogleGenerativeAI property...');
    const GoogleGenerativeAI = genaiPackage.GoogleGenerativeAI;

    if (!GoogleGenerativeAI || typeof GoogleGenerativeAI !== 'function') {
        console.error('!!! GoogleGenerativeAI constructor NOT FOUND on genaiPackage !!!');
        console.log('Imported package keys:', Object.keys(genaiPackage));
        throw new Error('GoogleGenerativeAI constructor not found on required object.');
    } 
    
    console.log('GoogleGenerativeAI constructor found successfully.');
    
    // We don't need a real API key for this test, just need to see if `new` works
    const DUMMY_API_KEY = 'DUMMY_KEY_FOR_TESTING';
    console.log('Attempting instantiation with dummy key...');
    const genAI = new GoogleGenerativeAI(DUMMY_API_KEY);
    console.log('+++ Instantiation SUCCESSFUL! +++');
    console.log('Instance:', genAI);

} catch (error) {
    console.error('--- Minimal Test FAILED --- ');
    console.error('Error:', error);
}

console.log('--- Minimal Test: Finished index.js ---'); 