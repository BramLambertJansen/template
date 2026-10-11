import { copy } from '#web/copy/ui.ts';
import { AsyncView, PageHeader } from '#web/ui/index.ts';
import { useMe } from '../session/queries.ts';
import { NameSection } from './name-section.tsx';
import { PasswordSection } from './password-section.tsx';

// Mijn account (spec eigen-account): secties in de volgorde van de spec; elk formulier verzendt met Enter alleen zichzelf.
export function AccountPage() {
  const me = useMe();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={copy.account.title} />
      <AsyncView query={me}>
        {(data) => (
          <div className="flex flex-col gap-8">
            <NameSection naam={data.naam} />
            <PasswordSection />
          </div>
        )}
      </AsyncView>
    </div>
  );
}
