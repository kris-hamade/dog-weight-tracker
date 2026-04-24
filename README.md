# dog-weight-tracker

Track your dog's weight over time with a lightweight Node.js + SQLite app.

## Setup

1. Install dependencies:
	```bash
	npm install
	```

2. Start the server:
	```bash
	npm start
	```

3. Open the app:
	- http://localhost:3000 (or the `PORT` you set)

## Environment

Copy [.env.example](.env.example) to `.env` and fill in any values you need:

- `PORT` (optional) sets the web server port
- `OPENAI_API_KEY` enables AI chat + weight-loss advice
- `OPENAI_MODEL` lets you pick a model (default is `gpt-4o-mini`)
- `SESSION_SECRET` signs login sessions (required for auth)

## Login

- Visit `/login` and sign in with a manually created account.
- Admins can create users from `/admin`.

Create a user from the CLI:

```bash
npm run create-user -- <username> <password> [--admin]
```

Assign a pet to a user:

```bash
npm run assign-pet -- --user <username> --pet-name "Odi"
```

## What it does

- Stores pets with breed + birth date and weigh-ins per pet
- Captures routine details through a per-pet chat (food, treats, exercise)
- Persists extracted memory items in SQLite for better long-term context
- Renders a trend chart, recent entries, and cached AI tips with clickable links
- Refreshes advice on demand instead of generating on every page refresh
