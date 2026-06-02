export const AppleAuthenticationScope = {
  FULL_NAME: 'FULL_NAME',
  EMAIL: 'EMAIL',
};

export const AppleAuthenticationButtonType = {
  SIGN_IN: 'SIGN_IN',
};

export const AppleAuthenticationButtonStyle = {
  BLACK: 'BLACK',
};

export async function isAvailableAsync() {
  return false;
}

export async function signInAsync() {
  throw new Error('Apple Sign-In is not available on web.');
}

export function AppleAuthenticationButton() {
  return null;
}
