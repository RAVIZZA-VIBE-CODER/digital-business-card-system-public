# Public Repository Instructions

This is the reusable public codebase for the Digital Business Card System.

It is designed to be published without private people, card, company, phone, email, or QR destination data. Real operational data belongs in the private repository or in a private deployment data source.

## Purpose

The system gives modern workers and teams one protected place to create and organize multiple public digital business cards. It supports people who represent several companies, labels, projects, or roles at the same time.

The protected backend is used to create, edit, clone, delete, filter, and organize cards. The public frontend shows only the individual card requested by a card URL.

This first version covers digital business cards and team/company labels. Later versions can extend the same model toward tickets, events, and other identity or access experiences.

## Local Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `HUB_ACCESS_CODE` in `.env`.
4. Run `npm run dev`.
5. Open `http://localhost:15000/`.

## Safety Rules

- Do not commit `.env`.
- Do not commit real access codes.
- Do not commit private card/contact data to this public repository.
- Keep `data/site-content.json` empty unless the data is safe to publish.
- Run `npm run lint` and `npm run build` before pushing.
