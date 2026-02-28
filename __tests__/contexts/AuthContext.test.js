import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabase';

// Suppress async act warnings and RevenueCat warnings
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
beforeAll(() => {
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('act(')) return;
    originalConsoleError(...args);
  };
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('RevenueCat')) return;
    originalConsoleWarn(...args);
  };
});
afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Test component that reads from AuthContext
function TestConsumer() {
  const { userId, isAdmin, loading } = useAuth();
  return (
    <>
      <Text testID="loading">{loading ? 'loading' : 'ready'}</Text>
      <Text testID="userId">{userId || 'none'}</Text>
      <Text testID="isAdmin">{isAdmin ? 'admin' : 'user'}</Text>
    </>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: user is logged in
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
    });
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
  });

  it('provides AuthContext shape via useAuth()', async () => {
    // Profile fetch mock
    const singleMock = jest.fn().mockResolvedValue({
      data: { id: 'test-user-id', username: 'test', is_admin: false, language: 'de' },
      error: null,
    });
    const eqMock = jest.fn().mockReturnValue({ single: singleMock });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
    supabase.from.mockReturnValue({ select: selectMock });

    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Wait for profile fetch to complete (mocks resolve instantly)
    await waitFor(() => {
      expect(getByTestId('loading').props.children).toBe('ready');
    });

    expect(getByTestId('userId').props.children).toBe('test-user-id');
    expect(getByTestId('isAdmin').props.children).toBe('user');
  });

  it('detects admin users', async () => {
    const singleMock = jest.fn().mockResolvedValue({
      data: { id: 'test-user-id', username: 'admin', is_admin: true, language: 'en' },
      error: null,
    });
    const eqMock = jest.fn().mockReturnValue({ single: singleMock });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
    supabase.from.mockReturnValue({ select: selectMock });

    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getByTestId('isAdmin').props.children).toBe('admin');
    });
  });

  it('handles no user (logged out)', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getByTestId('loading').props.children).toBe('ready');
    });

    expect(getByTestId('userId').props.children).toBe('none');
  });

  it('throws when useAuth is used outside AuthProvider', () => {
    // Suppress the expected error
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );
    spy.mockRestore();
  });
});
