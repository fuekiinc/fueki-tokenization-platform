import { describe, expect, it } from 'vitest';
import { deriveNavRoleState } from '../../src/components/SecurityToken/ValuationDashboard';

describe('deriveNavRoleState', () => {
  it('allows token admins to manage NAV registration without granting publisher access', () => {
    const state = deriveNavRoleState({
      isPublisher: false,
      isOracleAdmin: false,
      isTokenAdmin: true,
      isPublisherRoleAdmin: false,
    });

    expect(state.canManage).toBe(true);
    expect(state.canManagePublishers).toBe(false);
    expect(state.canPublish).toBe(false);
  });

  it('allows oracle role admins to manage publishers', () => {
    const state = deriveNavRoleState({
      isPublisher: false,
      isOracleAdmin: true,
      isTokenAdmin: false,
      isPublisherRoleAdmin: true,
    });

    expect(state.canManage).toBe(true);
    expect(state.canManagePublishers).toBe(true);
    expect(state.canPublish).toBe(true);
  });
});
