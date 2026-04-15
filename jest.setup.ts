// jest.setup.ts
import mongoose from 'mongoose';

// Increase timeout for DB operations
jest.setTimeout(30_000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});
