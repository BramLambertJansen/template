import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Notice, useErrorText } from '#web/ui/index.ts';
import { switchRole } from './switch-role.ts';

// Dev-switcher op /login (spec accounts/AC-8). De teksten staan hier en niet in src/web/copy: dan zitten ze ook niet in
// de productiebundel.
export function RoleSwitcher() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const errorText = useErrorText();
  const [error, setError] = useState<string | null>(null);
  const login = (role: 'user' | 'admin') => {
    switchRole(role, queryClient, navigate).catch((failure: unknown) => {
      setError(errorText(failure));
    });
  };
  return (
    <section aria-labelledby="dev-login" className="flex flex-col gap-3 border-t pt-4">
      <h2 id="dev-login" className="text-sm font-medium">
        Lokaal inloggen als
      </h2>
      {error === null ? null : <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            login('user');
          }}
        >
          Gebruiker
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            login('admin');
          }}
        >
          Beheerder
        </Button>
      </div>
    </section>
  );
}
