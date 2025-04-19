# Luma Event Intelligence Bot SaaS

**A multi-tenant SaaS platform providing Telegram-based guest intelligence, approvals, and follow-up tooling for Luma-powered events.**

Utilizes natural language processing via Gemini, integrates directly with the Luma API, and offers an optional web dashboard for deeper insights and team management.

---

## Table of Contents

*   [Purpose](#-purpose)
*   [Features](#-features)
    *   [MVP Scope](#-mvp-scope)
    *   [Potential Add-ons/Upgrades](#-potential-add-onsupgrades)
*   [Architecture Overview](#-architecture-overview)
*   [Technology Stack](#-technology-stack)
*   [API Integrations](#-api-integrations)
*   [Data Model](#-data-model)
*   [Project Structure](#-project-structure)
*   [Setup](#-setup)
*   [Running Locally](#-running-locally)
*   [Deployment](#-deployment)
*   [Security Considerations](#-security-considerations)

---

## 🎯 Purpose

To provide event organizers using Luma with a powerful, accessible toolset within Telegram for managing guest lists, understanding attendance patterns, and streamlining event workflows through natural language commands and automated intelligence.

---

## ✨ Features

### ✅ MVP Scope

*   **Telegram Bot (Group + DM mode):**
    *   Primary interface for interacting with the service.
    *   Responds to specific commands and natural language queries.
    *   Admin setup via `/link YOUR_LUMA_API_KEY` command (scoped to the group/DM).
*   **Natural Language Interface (Gemini Powered):**
    *   Understand requests like:
        *   "Show me events in Dubai next month."
        *   "How many guests are approved for the 'Summer Mixer' event?"
        *   "Who is pending approval for the Lisbon workshop?"
        *   "What's the attendance status for the main conference?"
*   **Luma Event & Guest Information:**
    *   Fetch list of events associated with the linked Luma API key.
    *   Pull guest lists for specific events (`get-guests`).
    *   Filter guests by `approval_status` (approved, declined, pending_approval, etc.), email domain, or potentially custom fields (if available via API).
    *   Display event summaries (e.g., total guests, count by status).
*   **Guest Actions:**
    *   Approve or reject guests individually via email address lookup (`update-guest-status` with status `approved` or `declined`).
    *   Potential for bulk actions based on filters (e.g., approve all pending from '@company.com').
*   **Basic Multi-Tenancy:**
    *   Stores Luma API keys securely, associated with Telegram chat IDs (groups or users).
    *   Ensures data isolation between different chats/organizations.

### ⚡ Potential Add-ons/Upgrades

*   **Automation:**
    *   Scheduled guest list fetching and analysis.
    *   Daily/regular status updates posted to Telegram.
    *   Automated post-event summary generation.
*   **Web Admin Portal:**
    *   Visual guest list browser with advanced filtering/sorting.
    *   Organization management (invite team members).
    *   API Key management.
    *   (Future) VIP scoring logic editor.
    *   (Future) CRM/Airtable sync configuration.
    *   (Future) Custom follow-up templates.
*   **Data Enrichment:**
    *   Integrate Clearbit/Apollo/PDL to enrich guest profiles (job title, company, sector).
*   **Enhanced Intelligence:**
    *   Tagging VIPs or adding notes (stored internally).
    *   Unified guest profiles across multiple events.
    *   Repeat guest detection.
    *   Trend analysis (sector/event/location).
*   **SaaS Features:**
    *   Stripe integration for billing/plans.
    *   Role-based access control.
*   **Communication Tools:**
    *   Direct email follow-ups via Gmail/SendGrid integration.
    *   CSV Exports.

---

## 🏗️ Architecture Overview

The system consists of the following core components:

1.  **Telegram Bot Interface:** Built using Node.js and the Telegraf library. Handles incoming messages, parses commands, manages chat state, and interacts with the backend core services.
2.  **Backend Core Services (Node.js/Express):** Contains the main business logic.
    *   **Luma API Wrapper:** A dedicated module to encapsulate all interactions with the Luma API (`get-guests`, `update-guest-status`, `list-events`, etc.), including error handling and potential caching.
    *   **NLP Service:** Integrates with the Gemini API to process natural language queries, extract intent, and identify entities (event names, locations, dates, emails).
    *   **Database Service:** Manages interaction with the PostgreSQL database (via an ORM like Prisma) for storing organization data, user/group mappings, API keys, and potentially cached Luma data.
    *   **Authentication/Authorization:** Handles linking Telegram chats to Luma API keys and ensuring users can only access data associated with their linked key.
3.  **Database (PostgreSQL):** Persists application state, including organization details, API keys, user mappings, and potentially cached data from Luma to improve performance and avoid rate limits.
4.  **Optional Web UI (Next.js):** A separate frontend application for administrative tasks, advanced visualization, and features not suited for a chat interface. Communicates with the Backend Core via a REST or GraphQL API.

---

## 🛠️ Technology Stack

| Layer           | Tech                      | Justification                                         |
| --------------- | ------------------------- | ----------------------------------------------------- |
| Bot Framework   | Telegraf (Node.js)        | Mature library for Telegram bots, integrates well.    |
| Backend         | Node.js + Express/Fastify | Efficient I/O, large ecosystem, JavaScript consistency. |
| NLP             | Google Gemini API         | Powerful natural language understanding capabilities. |
| Database        | PostgreSQL                | Robust, relational, good support for structured data. |
| ORM             | Prisma (Optional)         | Type-safe database access, simplifies queries.        |
| Frontend (Opt.) | Next.js + Tailwind        | Modern React framework for efficient web development. |
| Hosting         | Railway / Vercel / Supabase | Simplified deployment and scaling platforms.        |
| Authentication  | Telegram Bot API          | Uses Telegram User/Chat IDs for identification.     |

---

## 🔗 API Integrations

*   **Telegram Bot API:** Used via Telegraf for sending/receiving messages, handling commands, and identifying users/chats.
*   **Luma API (`https://api.lu.ma`):**
    *   `GET /public/v1/user/get-self`: Verify API key validity.
    *   `GET /public/v1/calendar/list-events`: Fetch events associated with an API key.
    *   `GET /public/v1/event/get-guests`: Retrieve guest lists for events, supporting pagination and status filtering.
    *   `POST /public/v1/event/update-guest-status`: Approve (`status: "approved"`) or decline (`status: "declined"`) guests identified by email (`{"type": "email", "email": "..."}`).
*   **Google Gemini API:** Used for processing natural language messages to understand user intent and extract relevant information (event names, locations, dates, emails, query types).

---

## 💾 Data Model

A relational database (PostgreSQL recommended) will store the following core entities:

*   **Organizations (`Orgs`):** Represents a customer/tenant.
    *   `org_id` (Primary Key)
    *   `name` (Optional)
    *   `luma_api_key_encrypted` (Stores the encrypted Luma API key)
    *   `created_at`, `updated_at`
*   **Users (`Users`):** Represents individual Telegram users interacting via DM.
    *   `user_id` (Telegram User ID, Primary Key)
    *   `first_name` (From Telegram)
    *   `username` (From Telegram, Optional)
    *   `org_id` (Foreign Key to `Orgs`)
    *   `role` (e.g., 'admin', 'member' - for future use)
    *   `created_at`, `updated_at`
*   **Groups (`Groups`):** Represents Telegram groups where the bot is added.
    *   `group_id` (Telegram Chat ID, Primary Key)
    *   `name` (From Telegram)
    *   `org_id` (Foreign Key to `Orgs`)
    *   `created_at`, `updated_at`
*   **Event Cache (`Events` - Optional):** Cache basic event details fetched from Luma.
    *   `event_api_id` (Primary Key)
    *   `org_id` (Foreign Key)
    *   `name`
    *   `start_at`, `end_at`
    *   `guest_count_estimate`
    *   `last_fetched_at`
*   **Guest Cache (`Guests` - Optional):** Cache guest details for faster lookups, especially if enrichment is added.
    *   `guest_api_id` (Primary Key - If available from Luma API)
    *   `event_api_id` (Foreign Key)
    *   `org_id` (Foreign Key)
    *   `email`
    *   `name`
    *   `status`
    *   `company` (Enriched/Manual)
    *   `tags` (Manual)
    *   `vip_score` (Calculated)
    *   `last_fetched_at`

*Note: Caching Luma data is optional for MVP but recommended for performance and rate limit management.*

---

## 📁 Project Structure

```

---

## ⚙️ Setup

1.  **Clone the repository.**
2.  **Install dependencies:** `npm install`
3.  **Environment Variables:** Create a `.env` file based on `.env.example`. You will need:
    *   `BOT_TOKEN`: Your Telegram Bot Token from BotFather.
    *   `GEMINI_API_KEY`: Your Google Gemini API Key.
    *   `DATABASE_URL`: Connection string for your PostgreSQL database.
    *   `(Optional) LUMA_API_KEY`: For testing purposes (users will provide their own via `/link`).
    *   `ENCRYPTION_KEY`: A secret key for encrypting stored Luma API keys.
4.  **Database Setup:** Run database migrations (e.g., `npx prisma migrate dev`).

---

## ▶️ Running Locally

*   **Development:** `npm run dev` (Starts bot, potentially with nodemon)
*   **Production Build:** `npm run build`
*   **Production Start:** `npm start`

---

## ☁️ Deployment

*   Hosting platforms like Railway, Vercel (for web), or Supabase (includes Postgres) are suitable.
*   Ensure environment variables are configured securely in the hosting environment.
*   A `Procfile` or similar configuration might be needed depending on the host (e.g., for defining a `worker` process for the bot).
*   Set up database migrations to run as part of the deployment process.

---

## 🔒 Security Considerations

*   **Luma API Keys:** Must be encrypted at rest in the database. Use a strong, rotating encryption key managed securely (e.g., environment variable, secrets manager). Never log API keys.
*   **Bot Token & Gemini Key:** Store securely as environment variables.
*   **Authentication:** Verify Telegram user/chat IDs rigorously before associating them with an organization or executing commands.
*   **Rate Limiting:** Implement rate limiting on bot commands and potentially Luma API calls to prevent abuse and manage costs.
*   **Input Sanitization:** Sanitize all user input, especially email addresses used in Luma API calls.

---