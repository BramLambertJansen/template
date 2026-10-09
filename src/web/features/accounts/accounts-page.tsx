import { useState } from 'react';
import type { z } from 'zod';
import type { accountItem } from '#shared/contracts/accounts.ts';
import { copy } from '#web/copy/ui.ts';
import {
  AsyncView,
  Button,
  Notice,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useErrorText,
} from '#web/ui/index.ts';
import { InviteDialog } from './invite-dialog.tsx';
import { useAccounts, useReinvite } from './queries.ts';

type Account = z.output<typeof accountItem>;
type Message = { readonly tone: 'info' | 'error'; readonly text: string } | null;

function AccountsTable({ items, onMessage }: { items: readonly Account[]; onMessage: (message: Message) => void }) {
  const reinvite = useReinvite();
  const errorText = useErrorText();
  const again = (account: Account) => {
    reinvite.mutateAsync(account.id).then(
      () => {
        onMessage({ tone: 'info', text: copy.inviteDialog.sent(account.email) });
      },
      (error: unknown) => {
        onMessage({ tone: 'error', text: errorText(error) });
      },
    );
  };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{copy.accounts.name}</TableHead>
          <TableHead>{copy.accounts.email}</TableHead>
          <TableHead>{copy.accounts.role}</TableHead>
          <TableHead>{copy.accounts.status}</TableHead>
          <TableHead>
            <span className="sr-only">{copy.accounts.actions}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((account) => (
          <TableRow key={account.id}>
            <TableCell>{account.naam}</TableCell>
            <TableCell>{account.email}</TableCell>
            <TableCell>{copy.accounts.roles[account.rol]}</TableCell>
            <TableCell>{copy.accounts.statuses[account.status]}</TableCell>
            <TableCell>
              {account.status === 'uitgenodigd' ? (
                <Button
                  variant="outline"
                  disabled={reinvite.isPending}
                  onClick={() => {
                    again(account);
                  }}
                >
                  {copy.accounts.reinvite}
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Accountlijst (spec accountbeheer): laden, leeg en fout via AsyncView; "Meer laden" met de cursor; uitnodigen in een dialoog.
export function AccountsPage() {
  const accounts = useAccounts();
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={copy.accounts.title}
        actions={
          <Button
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
      <AsyncView
        query={accounts}
        isEmpty={(data) => data.pages.every((page) => page.items.length === 0)}
        emptyText={copy.accounts.empty}
      >
        {(data) => (
          <div className="flex flex-col items-start gap-4">
            <AccountsTable items={data.pages.flatMap((page) => page.items)} onMessage={setMessage} />
            {accounts.hasNextPage ? (
              <Button
                variant="outline"
                disabled={accounts.isFetchingNextPage}
                onClick={() => void accounts.fetchNextPage()}
              >
                {copy.accounts.more}
              </Button>
            ) : null}
          </div>
        )}
      </AsyncView>
      <InviteDialog
        open={inviting}
        onOpenChange={setInviting}
        onInvited={(email) => {
          setMessage({ tone: 'info', text: copy.inviteDialog.sent(email) });
        }}
      />
    </div>
  );
}
