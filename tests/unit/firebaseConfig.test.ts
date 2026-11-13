import { describe, it, expect } from 'vitest';
import { readFirebaseConfig } from '@/sync/firebaseConfig';

describe('readFirebaseConfig', () => {
  it('returns null until every required value is present', () => {
    expect(readFirebaseConfig({})).toBeNull();
    expect(
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: 'key',
        VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'example',
      }),
    ).toBeNull();
    expect(
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: '  ',
        VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'example',
        VITE_FIREBASE_APP_ID: 'app',
      }),
    ).toBeNull();
  });

  it('trims values and includes optional fields only when provided', () => {
    expect(
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: ' key ',
        VITE_FIREBASE_AUTH_DOMAIN: ' example.firebaseapp.com ',
        VITE_FIREBASE_PROJECT_ID: ' example ',
        VITE_FIREBASE_APP_ID: ' app-id ',
      }),
    ).toEqual({
      apiKey: 'key',
      authDomain: 'example.firebaseapp.com',
      projectId: 'example',
      appId: 'app-id',
    });

    expect(
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: 'key',
        VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'example',
        VITE_FIREBASE_APP_ID: 'app-id',
        VITE_FIREBASE_STORAGE_BUCKET: 'example.appspot.com',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
      }),
    ).toMatchObject({
      storageBucket: 'example.appspot.com',
      messagingSenderId: '123',
    });
  });
});
