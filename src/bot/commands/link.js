const { encrypt } = require('../../lib/crypto');
const lumaClient = require('../../core/luma/client');
const prisma = require('../../core/db/prisma');

const linkCommandHandler = async (ctx) => {
  // Extract API key from the command text (e.g., /link myapikey)
  const parts = ctx.message.text.split(' ');
  if (parts.length !== 2 || !parts[1]) {
    return ctx.reply('Usage: /link <YOUR_LUMA_API_KEY>');
  }
  const apiKey = parts[1].trim();

  await ctx.reply('Validating your Luma API key...');

  let encryptedKeyForValidation; // Need to encrypt just for the validation call
  try {
    // IMPORTANT: LumaClient expects the *encrypted* key for validation too,
    // mirroring how it would be stored and retrieved later.
    // We encrypt here temporarily for the getSelf call.
    encryptedKeyForValidation = encrypt(apiKey);
  } catch (error) {
    console.error("Encryption error during /link validation prep:", error);
    return ctx.reply('An internal error occurred while preparing the key for validation.');
  }

  try {
    // Validate the key by calling getSelf
    const lumaUser = await lumaClient.getSelf(encryptedKeyForValidation);
    if (!lumaUser || !lumaUser.user?.api_id) { // Check for expected user data
      throw new Error('Invalid API key or unexpected response from Luma.');
    }

    await ctx.reply(`Validation successful! Linking Luma account for user: ${lumaUser.user.name} (${lumaUser.user.email})...`);

    // Encrypt the key properly for storage
    const encryptedKeyForStorage = encrypt(apiKey);

    // Determine if it's a private chat or group chat
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;
    const userId = ctx.from.id;
    const userFirstName = ctx.from.first_name;
    const username = ctx.from.username;
    const groupName = chatType !== 'private' ? ctx.chat.title : null;

    // Use Prisma transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // 1. Upsert the Organization record
      // We use the validated Luma user ID as a stable identifier for the org
      // to prevent multiple orgs being created if the key is linked in different chats.
      // A more robust approach might involve a separate org creation step or using Luma's calendar ID if available.
      const orgData = {
        id: lumaUser.user.api_id, // Using Luma User ID as Org ID for simplicity
        lumaApiKeyEncrypted: encryptedKeyForStorage,
        name: `${lumaUser.user.name}'s Org`, // Default name
      };
      const org = await tx.org.upsert({
        where: { id: orgData.id },
        update: { lumaApiKeyEncrypted: orgData.lumaApiKeyEncrypted, updatedAt: new Date() },
        create: orgData,
      });

      // 2. Upsert User or Group record and link to Org
      if (chatType === 'private') {
        await tx.user.upsert({
          where: { id: BigInt(userId) }, // Use BigInt for IDs
          update: { orgId: org.id, firstName: userFirstName, username: username },
          create: {
            id: BigInt(userId),
            orgId: org.id,
            firstName: userFirstName,
            username: username,
          },
        });
        console.log(`Linked/Updated User ${userId} with Org ${org.id}`);
      } else { // Group chat
        await tx.group.upsert({
          where: { id: BigInt(chatId) }, // Use BigInt for IDs
          update: { orgId: org.id, name: groupName },
          create: {
            id: BigInt(chatId),
            orgId: org.id,
            name: groupName,
          },
        });
        console.log(`Linked/Updated Group ${chatId} with Org ${org.id}`);
      }

      // 3. Create Audit Log entry
      await tx.auditLog.create({
        data: {
          orgId: org.id,
          userId: chatType === 'private' ? BigInt(userId) : null,
          groupId: chatType !== 'private' ? BigInt(chatId) : null,
          actionType: 'link_api_key',
          details: { success: true, lumaUserId: lumaUser.user.api_id }
        }
      });

    }); // End transaction

    await ctx.reply('Success! Your Luma API key has been linked to this chat.');

  } catch (error) {
    console.error("Error during /link command:", error);
    // Create Audit Log entry for failure
    // Note: We might not have an orgId if validation failed early
    try {
      await prisma.auditLog.create({
        data: {
          orgId: 'UNKNOWN', // Or try to get orgId if possible
          userId: chatType === 'private' ? BigInt(userId) : null,
          groupId: chatType !== 'private' ? BigInt(chatId) : null,
          actionType: 'link_api_key_failed',
          details: { error: error.message || 'Validation/Storage Failed' }
        }
      });
    } catch (logError) {
      console.error("Failed to create failure audit log:", logError);
    }

    await ctx.reply(`Failed to link API key. Error: ${error.message}`);
  }
};

module.exports = { linkCommandHandler }; 