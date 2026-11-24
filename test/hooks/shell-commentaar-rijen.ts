// Gegevens voor spec rolhek-herstel/AC-4 en AC-5: de zes vormen uit het Doel en de drie varianten, als shelltekst. Gedeeld door
// `shell-commentaar.test.ts` (de lezer) en `shell-woorden-bash.test.ts` (echte bash). Gegevens, geen toetsen.
export const LOS = 'rm -rf .claude/hooks';

export interface CommentaarRij {
  readonly naam: string;
  readonly tekst: string;
}

export const COMMENTAAR_RIJEN: readonly CommentaarRij[] = [
  { naam: 'cat;#<<EOF', tekst: `cat;#<<EOF\n${LOS}\nEOF` },
  { naam: 'true&&#<<E', tekst: `true&&#<<E\n${LOS}\nE` },
  { naam: '(#<<E', tekst: `(#<<E\n${LOS}\nE\n)` },
  { naam: 'echo ${x/ #/}', tekst: `echo \${x/ #/}; ${LOS}` },
  { naam: 'echo `true #`', tekst: `echo \`true #\`; ${LOS}` },
  { naam: '(( #))', tekst: `(( #)); ${LOS}` },
  { naam: 'echo ${x/;#/}', tekst: `echo \${x/;#/}; ${LOS}` },
  { naam: 'echo $(true #) <<E', tekst: `echo $(true #) <<E\n${LOS}\nE\n)` },
  { naam: '[[ -n x #⏎]] && rm', tekst: `[[ -n x #\n]] && ${LOS}` },
];
