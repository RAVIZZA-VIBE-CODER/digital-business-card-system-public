# Digital Business Card System

This repository contains the public, data-free version of the Digital Business Card System: a protected web app for creating, organizing, and publishing digital business cards.

The system is built for a new generation of workers, founders, freelancers, operators, agents, and team members who may represent more than one company, project, label, or role at the same time. Instead of forcing one person into one static identity, it gives each person and team a flexible way to maintain multiple public-facing cards from one protected backend.

This is the first version of a broader representation system for modern work. Version one focuses on personal and team digital business cards. Future extensions are planned for tickets, events, and other public identity or access tools.

## What It Does

- Runs as a server-backed web app, not a static-only site.
- Provides a protected backend for creating and managing cards.
- Publishes each card as its own standalone public URL.
- Supports QR-code workflows by letting each card URL become the destination for a printed or shared QR code.
- Keeps the public card page focused only on the selected card.
- Includes company and label organization so cards can be grouped by team, client, project, or business.
- Includes search and filtering by card details such as name, company, phone, email, and links.
- Includes a visual card builder for composing card layouts with text, images, colors, borders, and canvas layers.

## Public And Private Repo Model

This public repository intentionally ships without private card, contact, or company data.

The intended setup uses two repositories:

- A private repository with real card data, contacts, companies, and operational content.
- A public repository with the reusable application code and empty seed data.

This keeps the system shareable and deployable without exposing private personal information.

## Access Code

The backend is protected by an access code configured through the `HUB_ACCESS_CODE` environment variable.

Do not commit `.env` files or real access codes to this repository.

## Running Locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

3. Set `HUB_ACCESS_CODE` inside `.env`.

4. Start the local server:

   ```bash
   npm run dev
   ```

5. Open the app in a browser:

   ```text
   http://localhost:15000/
   ```

## Data

The public seed file at `data/site-content.json` intentionally contains no cards and no labels.

Create new cards from the protected backend after deployment, or connect the app to a private data source that is not committed to this public repository.

## Privacy Policy Maintenance

The public privacy notice is served at `/privacy-policy` and lives in `privacy-policy.html`. Update its date and affected sections whenever the system adds or changes personal-data fields, public visibility, authentication, cookies, analytics, storage, external providers, or future ticket/event features. Confirm the controller identity, privacy contact, retention periods, and provider agreements before each production launch.

## Validation

Use these checks before publishing:

```bash
npm run lint
npm run build
```
