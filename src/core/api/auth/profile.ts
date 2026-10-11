import type { Auth } from './auth.ts';

// Het eigen account (spec eigen-account): naam wijzigen buiten /update-user om (dat endpoint is dicht: het accepteert ook
// `image` en kent de grenzen van de app niet). De route valideert de invoer; de gebruiker komt uit de sessie.
export async function renameUser(auth: Auth, userId: string, name: string): Promise<void> {
  const context = await auth.$context;
  await context.internalAdapter.updateUser(userId, { name });
}
