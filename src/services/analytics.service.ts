// src/services/analytics.service.ts — HemaV050
// Cached analytics — all DB queries delegated to MongoAnalyticsQueries.
// No direct Mongoose model imports in this file.

import { fetchDashboardData } from '@/infrastructure/analytics/MongoAnalyticsQueries';
import { cacheGet, cacheSet } from '@/lib/redis';
import { logger }             from '@/lib/logger';
import type { DashboardStats } from '@/types';

const STATS_CACHE_KEY = 'analytics:dashboard';
const STATS_TTL       = 300; // 5 minutes

export async function getDashboardStats(): Promise<DashboardStats> {
  const cached = await cacheGet<DashboardStats>(STATS_CACHE_KEY);
  if (cached) {
    logger.debug('[Analytics] Cache hit');
    return cached;
  }

  const stats = await fetchDashboardData();

  await cacheSet(STATS_CACHE_KEY, stats, STATS_TTL);
  logger.info('[Analytics] Stats computed and cached');
  return stats;
}
