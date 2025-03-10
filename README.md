# CoinWings Bot 🛩️

Private aviation concierge bot for the crypto community. Handles initial inquiries, provides quotes, and connects clients with our aviation team.

## Features

- Natural language interaction
- Private jet pricing guidance
- Aircraft information and recommendations
- Crypto-native experience
- Seamless handoff to aviation team

## Setup

1. Clone the repository
```bash
git clone https://github.com/yourusername/coinwings-bot.git
cd coinwings-bot
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your tokens
```

4. Start the bot
```bash
npm start
```

For development:
```bash
npm run dev
```

## Environment Variables

Required environment variables:
- `BOT_TOKEN`: Telegram Bot Token
- `OPENAI_API_KEY`: OpenAI API Key
- `AGENT_CHANNEL`: Telegram Channel ID for agent notifications

## Project Structure

```
src/
├── config/        # Configuration files
├── handlers/      # Message and conversation handlers
├── services/      # External service integrations
└── utils/         # Utility functions
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
