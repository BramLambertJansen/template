import { cents } from '#core/shared/money.ts';
import { format } from '#core/web/lib/format.ts';
import { Avatar, Image, Inline, Section, Stack, StatTile, Text } from '#web/ui/index.ts';

// Voorbeelden van spec ui-weergave-basis, alleen lokale voorbeelddata (R-WEB-08).
function AvatarSection() {
  return (
    <Section id="example-avatar" title="Avatar" description="Profielfoto of initialen, in drie maten." framed>
      <Inline gap="md" className="flex-wrap">
        <Avatar name="Anna de Vries" size="sm" />
        <Avatar name="Anna de Vries" size="md" />
        <Avatar name="Anna de Vries" size="lg" />
        <Avatar name="Élodie" />
        <Avatar name="Anna de Vries" src="/gallery-architecture.svg" />
        <Avatar name="Bert Jansen" src="/gallery-missing.svg" />
      </Inline>
      <Inline>
        <Avatar name="Anna de Vries" decorative />
        <Text as="span">Anna de Vries</Text>
      </Inline>
    </Section>
  );
}

const landscape = { src: '/gallery-landscape.svg', alt: 'Groene bergen met een gele zon' };
const unavailable = 'Afbeelding niet beschikbaar.';

function ImageSection() {
  return (
    <Section id="example-image" title="Image" description="Losse afbeelding met vaste beeldverhouding." framed>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stack gap="sm">
          <Image {...landscape} ratio="square" unavailableText={unavailable} />
          <Text>Vierkant</Text>
        </Stack>
        <Stack gap="sm">
          <Image {...landscape} ratio="video" unavailableText={unavailable} />
          <Text>Breed (16:9)</Text>
        </Stack>
        <Stack gap="sm">
          <Image {...landscape} ratio="portrait" unavailableText={unavailable} />
          <Text>Staand (3:4)</Text>
        </Stack>
        <Image src="/gallery-missing.svg" alt="Ontbrekend voorbeeld" unavailableText={unavailable} />
        <Stack gap="sm">
          <Image src="/gallery-architecture.svg" alt="" decorative unavailableText={unavailable} />
          <Text>Decoratief (lege alt)</Text>
        </Stack>
      </div>
    </Section>
  );
}

function StatTileSection() {
  return (
    <Section id="example-stat-tile" title="StatTile" description="KPI-tegels voor een dashboard, in een raster." framed>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Actieve accounts"
          value={format.number(1234)}
          trend={{ direction: 'up', label: '12% meer dan vorige maand' }}
          link={{ href: '/admin/accounts', label: 'Bekijk accounts' }}
        />
        <StatTile
          label="Omzet deze maand"
          value={format.cents(cents(1234567))}
          trend={{ direction: 'flat', label: 'Gelijk aan vorige maand' }}
        />
        <StatTile
          label="Openstaande taken"
          value={format.number(8)}
          trend={{ direction: 'down', label: '3 minder dan vorige week' }}
          description="Taken zonder eigenaar tellen niet mee."
        />
        <StatTile label="Langste wachtrij" value="Klantenservice-Noordoost-Nederland" />
      </div>
    </Section>
  );
}

export function DisplayBasicsExamples() {
  return (
    <>
      <AvatarSection />
      <ImageSection />
      <StatTileSection />
    </>
  );
}
