// Prisma Client loads .env into process.env on its own, but most other
// libraries (the Stripe SDK included) don't - this setup file makes
// process.env consistent for every test regardless of which client
// reads it.
import "dotenv/config";
