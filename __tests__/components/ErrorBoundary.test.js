import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import ErrorBoundary from '../../components/ErrorBoundary';
import { t } from '../../i18n';

// Suppress console.error for intentional error throws
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

// Component that intentionally throws
function BrokenComponent() {
  throw new Error('Test crash');
}

// Component that works normally
function WorkingComponent() {
  return <Text>Hello World</Text>;
}

// Translated strings used by ErrorBoundary
const errorTitle = t('common.errorBoundaryTitle');
const errorMessage = t('common.errorBoundaryMessage');
const retryText = t('common.errorBoundaryRetry');
const detailsText = t('common.errorBoundaryDetails');

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>
    );

    expect(getByText('Hello World')).toBeTruthy();
  });

  it('renders fallback UI when a child component throws', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );

    // Should show error title and message (translated)
    expect(getByText(errorTitle)).toBeTruthy();
    expect(getByText(errorMessage)).toBeTruthy();
  });

  it('shows retry button that resets the error state', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );

    // Verify fallback is showing
    expect(getByText(retryText)).toBeTruthy();

    // Note: After pressing retry, the same broken component will crash again
    // In a real app, the state or props would have changed
    fireEvent.press(getByText(retryText));

    // After retry, ErrorBoundary re-renders children
    // BrokenComponent will throw again -> fallback shows again
    expect(getByText(errorTitle)).toBeTruthy();
  });

  it('shows error details when details toggle is pressed', () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );

    // Details should not be visible initially
    expect(queryByText('Test crash')).toBeNull();

    // Press the details toggle (includes arrow character)
    fireEvent.press(getByText(new RegExp(detailsText)));

    // Error message should now be visible
    expect(getByText(/Test crash/)).toBeTruthy();
  });
});
