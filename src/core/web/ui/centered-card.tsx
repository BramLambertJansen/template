import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card.tsx';

interface CenteredCardProps {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}

// Voor schermen zonder app-layout: inloggen, verificatiecode, uitnodiging (spec accountbeheer).
export function CenteredCard({ title, description, children }: CenteredCardProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          {description === undefined ? null : <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
