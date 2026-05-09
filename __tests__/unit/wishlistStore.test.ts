// __tests__/unit/wishlistStore.test.ts — V031
// Unit tests for the enhanced WishlistStore (setIds, setSynced, server-sync merge).

import { describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useWishlistStore } from '@/store/cartStore';

beforeEach(() => {
  useWishlistStore.setState({ ids: [], synced: false });
});

describe('useWishlistStore', () => {
  it('toggles an id in and out', () => {
    const { result } = renderHook(() => useWishlistStore());
    act(() => result.current.toggle('abc'));
    expect(result.current.ids).toContain('abc');
    act(() => result.current.toggle('abc'));
    expect(result.current.ids).not.toContain('abc');
  });

  it('has() returns correct boolean', () => {
    const { result } = renderHook(() => useWishlistStore());
    act(() => result.current.toggle('xyz'));
    expect(result.current.has('xyz')).toBe(true);
    expect(result.current.has('nope')).toBe(false);
  });

  it('clear() resets ids and synced flag', () => {
    const { result } = renderHook(() => useWishlistStore());
    act(() => { result.current.toggle('a'); result.current.toggle('b'); result.current.setSynced(true); });
    act(() => result.current.clear());
    expect(result.current.ids).toHaveLength(0);
    expect(result.current.synced).toBe(false);
  });

  it('setIds() merges server ids without duplicating local ones', () => {
    const { result } = renderHook(() => useWishlistStore());
    act(() => result.current.toggle('local-1'));
    act(() => result.current.setIds(['local-1', 'server-2', 'server-3']));
    expect(result.current.ids).toEqual(expect.arrayContaining(['local-1', 'server-2', 'server-3']));
    // No duplicates
    const count = result.current.ids.filter(id => id === 'local-1').length;
    expect(count).toBe(1);
  });

  it('setIds() marks store as synced', () => {
    const { result } = renderHook(() => useWishlistStore());
    expect(result.current.synced).toBe(false);
    act(() => result.current.setIds(['server-1']));
    expect(result.current.synced).toBe(true);
  });

  it('setSynced() updates synced flag independently', () => {
    const { result } = renderHook(() => useWishlistStore());
    act(() => result.current.setSynced(true));
    expect(result.current.synced).toBe(true);
    act(() => result.current.setSynced(false));
    expect(result.current.synced).toBe(false);
  });
});
