import { useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { z } from 'zod';
import { ACCOUNT_SORTS, ROLLEN, accountsSearch, STATUSSEN, type accountItem } from '#shared/contracts/accounts.ts';
import { uniqueById, useListSearch } from '#core/web/lib/list-search.ts';
import { copy } from '#web/copy/ui.ts';
import {
  AsyncView,
  Button,
  ListToolbar,
  Notice,
  PageHeader,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  type SelectOption,
  Text,
} from '#web/ui/index.ts';
import { InviteDialog } from './invite-dialog.tsx';
import { useMe } from '#web/features/session/queries.ts';
import { useAccounts } from './queries.ts';
import type { AccountMessage } from './row-actions.tsx';
import { AccountRow } from './account-row.tsx';
import { RevokeInvitationHost } from './revoke-invitation-dialog.tsx';

type Account = z.output<typeof accountItem>;
type Message = AccountMessage;

const roleOptions: readonly SelectOption[] = [
  { value: '', label: copy.accounts.allRoles },
  ...ROLLEN.map((rol) => ({ value: rol, label: copy.accounts.roleName(rol) })),
];
const statusOptions: readonly SelectOption[] = [
  { value: '', label: copy.accounts.allStatuses },
  ...STATUSSEN.map((status) => ({ value: status, label: copy.accounts.statuses[status] })),
];
const sortOptions: readonly SelectOption[] = ACCOUNT_SORTS.map((sort) => ({
  value: sort,
  label: copy.accounts.sorts[sort],
}));

function AccountsTable({
  items,
  busy,
  onMessage,
  regionRef,
}: {
  items: readonly Account[];
  busy: boolean;
  onMessage: (message: Message) => void;
  regionRef: RefObject<HTMLDivElement | null>;
}) {
  // Zolang de eigen id onbekend is, bieden we geen menu aan: de eigen rij mag nooit even "Blokkeren" tonen.
  const myId = useMe().data?.id;
  return (
    <>
      <Table regionRef={regionRef} label={copy.accounts.title} aria-busy={busy}>
        <TableHeader>
          <TableRow>
            <TableHead>{copy.accounts.name}</TableHead>
            <TableHead>{copy.accounts.email}</TableHead>
            <TableHead>{copy.accounts.role}</TableHead>
            <TableHead>{copy.accounts.status}</TableHead>
            <TableHead>{copy.accounts.lastLogin}</TableHead>
            <TableHead>
              <span className="sr-only">{copy.accounts.actions}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((account) => (
            <AccountRow key={account.id} account={account} myId={myId} busy={busy} onMessage={onMessage} />
          ))}
        </TableBody>
      </Table>
    </>
  );
}

// Focus na intrekken (spec accountbeheer-uitbreiding, focusvolgorde). De refetch loopt nog als de dialoog dichtgaat; we wachten
// tot de lijst na het intrekken bijgewerkt is (data of fout). Staat de rij er dan nog (refetch faalde of de rij blijft), dan
// verplaatsen we niets; is hij weg, dan naar de focusbare region "Accounts" (src/core/web/ui/table.tsx), en is de lijst leeg
// (AsyncView toont de lege staat zonder tabel) naar de knop "Account uitnodigen".
function useFocusAfterRevoke(accounts: ReturnType<typeof useAccounts>) {
  const region = useRef<HTMLDivElement>(null);
  const invite = useRef<HTMLButtonElement>(null);
  const [removed, setRemoved] = useState<{ readonly id: string; readonly since: number } | null>(null);
  const { data, dataUpdatedAt, errorUpdatedAt } = accounts;
  useEffect(() => {
    if (removed === null) return;
    const rows = data?.pages.flatMap((page) => page.items) ?? [];
    if (rows.some((account) => account.id === removed.id)) {
      if (Math.max(dataUpdatedAt, errorUpdatedAt) >= removed.since) setRemoved(null);
      return;
    }
    setRemoved(null);
    (rows.length === 0 ? invite.current : region.current)?.focus();
  }, [data, dataUpdatedAt, errorUpdatedAt, removed]);
  return {
    region,
    invite,
    revoked: (id: string) => {
      setRemoved({ id, since: Date.now() });
    },
  };
}

// Accountlijst (spec accountbeheer): laden, leeg en fout via AsyncView; "Meer laden" met de cursor; uitnodigen in een dialoog.
export function AccountsPage() {
  const list = useListSearch();
  // De router laat ongeldige sleutels uit de URL staan (hij voegt de search van de ouder samen): opnieuw schonen vóór gebruik.
  const route = accountsSearch.web.parse(useSearch({ from: '/_app/admin/accounts' }));
  const accounts = useAccounts(route);
  const filtered = route.q !== undefined || route.rol !== undefined || route.status !== undefined;
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const focus = useFocusAfterRevoke(accounts);

  return (
    <RevokeInvitationHost
      onRevoked={(account, text) => {
        setMessage({ tone: 'info', text });
        focus.revoked(account.id);
      }}
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          title={copy.accounts.title}
          actions={
            <Button
              ref={focus.invite}
              onClick={() => {
                setMessage(null);
                setInviting(true);
              }}
            >
              {copy.accounts.invite}
            </Button>
          }
        />
        {message === null ? null : <Notice tone={message.tone}>{message.text}</Notice>}
        <ListToolbar
          searchLabel={copy.accounts.search}
          searchHint={copy.accounts.searchHint}
          query={route.q ?? ''}
          onQueryChange={list.setQuery}
          filters={[
            {
              id: 'rol',
              label: copy.accounts.role,
              value: route.rol ?? '',
              options: roleOptions,
              onChange: (value) => {
                list.setFilter('rol', value);
              },
            },
            {
              id: 'status',
              label: copy.accounts.status,
              value: route.status ?? '',
              options: statusOptions,
              onChange: (value) => {
                list.setFilter('status', value);
              },
            },
          ]}
          sortLabel={copy.accounts.sort}
          sort={route.sort ?? accountsSearch.defaultSort}
          sortOptions={sortOptions}
          onSortChange={list.setSort}
          onClear={list.clear}
        />
        <AsyncView
          query={accounts}
          isEmpty={(data) => data.pages.every((page) => page.items.length === 0)}
          emptyText={filtered ? copy.accounts.emptyFiltered : copy.accounts.empty}
        >
          {(data) => {
            const rows = uniqueById(data.pages.flatMap((page) => page.items));
            return (
              <div className="flex min-w-0 flex-col gap-4">
                <Text size="sm" tone="muted" aria-live="polite">
                  {accounts.isPlaceholderData
                    ? copy.accounts.loading
                    : copy.accounts.shown(rows.length, accounts.hasNextPage)}
                </Text>
                <AccountsTable
                  items={rows}
                  busy={accounts.isPlaceholderData}
                  onMessage={setMessage}
                  regionRef={focus.region}
                />
                {accounts.hasNextPage ? (
                  <div>
                    <Button
                      variant="outline"
                      disabled={accounts.isFetchingNextPage}
                      onClick={() => void accounts.fetchNextPage()}
                    >
                      {copy.accounts.more}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          }}
        </AsyncView>
        <InviteDialog
          open={inviting}
          onOpenChange={setInviting}
          onInvited={(email) => {
            setMessage({ tone: 'info', text: copy.inviteDialog.sent(email) });
          }}
        />
      </div>
    </RevokeInvitationHost>
  );
}
