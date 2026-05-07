export type PluralForms = Partial<Record<ReturnType<Intl.PluralRules["select"]>, string>> & {
  other: string
}

const defaultPluralRules = new Intl.PluralRules("en")

export function pluralForm(count: number, forms: PluralForms, rules: Intl.PluralRules = defaultPluralRules): string {
  const category = rules.select(count)
  return forms[category] ?? forms.other
}
