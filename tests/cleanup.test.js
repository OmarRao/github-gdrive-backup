// Copyright (c) Omar Rao. All rights reserved.
'use strict';

/**
 * Tests for the chain-aware retention planner — the guard that prevents
 * age-based cleanup from deleting a base/intermediate bundle a retained delta
 * chain still needs (the delta-chain data-loss hazard).
 */

const { planCleanup } = require('../src/cleanup');

const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
const cutoff = new Date(Date.now() - 30 * 86400000); // 30-day retention

describe('planCleanup', () => {
  test('deletes only sessions older than the cutoff (no chains)', () => {
    const sessions = [
      { name: 's-new', createdTime: day(5) },
      { name: 's-old', createdTime: day(40) },
    ];
    const plan = planCleanup(sessions, cutoff, {});
    expect(plan.toDelete).toEqual(['s-old']);
    expect(plan.toKeep).toEqual(['s-new']);
    expect(plan.protectedOld).toEqual([]);
  });

  test('protects an old base bundle that a retained delta chain depends on', () => {
    const sessions = [
      { name: 's-base', createdTime: day(45) },  // old, but base of the chain
      { name: 's-mid',  createdTime: day(20) },  // within retention
      { name: 's-head', createdTime: day(2) },   // within retention, depends on base+mid
    ];
    const chainDeps = { 's-head': ['s-base', 's-mid', 's-head'], 's-mid': ['s-base', 's-mid'] };
    const plan = planCleanup(sessions, cutoff, chainDeps);
    expect(plan.toDelete).toEqual([]);             // s-base must NOT be deleted
    expect(plan.protectedOld).toContain('s-base'); // it's old but chain-protected
    expect(plan.toKeep).toEqual(expect.arrayContaining(['s-base', 's-mid', 's-head']));
  });

  test('still deletes an old session no retained chain references', () => {
    const sessions = [
      { name: 's-orphan', createdTime: day(50) },     // old, unreferenced
      { name: 's-base',   createdTime: day(45) },     // old, referenced
      { name: 's-head',   createdTime: day(1) },      // retained, needs base
    ];
    const chainDeps = { 's-head': ['s-base', 's-head'] };
    const plan = planCleanup(sessions, cutoff, chainDeps);
    expect(plan.toDelete).toEqual(['s-orphan']);
    expect(plan.protectedOld).toEqual(['s-base']);
  });

  test('empty input yields empty plan', () => {
    const plan = planCleanup([], cutoff, {});
    expect(plan).toEqual({ toDelete: [], toKeep: [], protectedOld: [] });
  });
});
