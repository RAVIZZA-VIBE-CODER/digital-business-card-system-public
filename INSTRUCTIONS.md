# Digital Business Card System

This public repository contains the server-backed business card application without private card, contact, or company data.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `HUB_ACCESS_CODE` in `.env`.
4. Run `npm run dev`.

## Data

The public seed file at `data/site-content.json` intentionally contains no cards and no labels. Create cards from the protected backend after deployment, or use a private data source outside this repository.
