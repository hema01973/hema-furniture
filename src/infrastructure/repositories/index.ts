// src/infrastructure/repositories/index.ts — HemaV050
// Barrel export for all repository singletons.
// Import from here to keep the codebase DRY.

export { productRepository } from './MongoProductRepository';
export { orderRepository   } from './MongoOrderRepository';
export { userRepository    } from './MongoUserRepository';
export { couponRepository  } from './MongoCouponRepository';
export { reviewRepository  } from './MongoReviewRepository';

// Re-export repository classes for testing / DI
export { MongoProductRepository } from './MongoProductRepository';
export { MongoOrderRepository   } from './MongoOrderRepository';
export { MongoUserRepository    } from './MongoUserRepository';
export { MongoCouponRepository  } from './MongoCouponRepository';
export { MongoReviewRepository  } from './MongoReviewRepository';
