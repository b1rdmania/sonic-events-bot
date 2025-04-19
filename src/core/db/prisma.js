const { PrismaClient } = require('../../generated/prisma');

// Instantiate PrismaClient
const prisma = new PrismaClient();

// Export the instance
module.exports = prisma; 