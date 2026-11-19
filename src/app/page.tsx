'use client';

import React from 'react';
import { AuthGate, AuthProvider } from '@/components/auth/AuthGate';
import { PlatformProvider } from '@/context/PlatformContext';
import { AppShell } from '@/components/shell/AppShell';

export default function HomePage() {
  return (
    <AuthProvider>
      <AuthGate>
        <PlatformProvider>
          <AppShell />
        </PlatformProvider>
      </AuthGate>
    </AuthProvider>
  );
}
