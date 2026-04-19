# My Awesome App

[![Build Status](https://travis-ci.org/user/my-app.svg?branch=main)](https://travis-ci.org/user/my-app)

A REST API built with Express.

## Prerequisites

- Node.js 16 or higher
- Redis
- Docker

## Getting Started

```bash
npm run build
npm run dev
npm test
```

## Configuration

Set the following environment variables:

- `MONGO_URI` — MongoDB connection string
- `API_KEY` — Your API key

## Project Structure

- `src/config/database.js` — Database configuration
- `src/middleware/auth.js` — Authentication middleware
- `docker-compose.yml` — Docker services

## API

### Users

```
POST /api/users — Create a new user
GET /api/users/:id — Get user by ID
DELETE /api/admin/remove — Remove a user
```
