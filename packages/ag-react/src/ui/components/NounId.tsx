/**
 * A compact, shared identity grammar: `noun#value.revision`.
 *
 * The punctuation belongs to the component rather than its consumers so an
 * application-wide notation change stays one line. The value is the only bold
 * segment; noun, separator, and optional revision remain plain.
 */
import { Text } from "../../components/Text"
import type { TextProps } from "../../components/Text"

export type NounIdValue = string | number

export interface NounIdProps extends Omit<TextProps, "bold" | "children"> {
  noun: string
  value: NounIdValue
  revision?: NounIdValue
}

export function formatNounId(noun: string, value: NounIdValue, revision?: NounIdValue): string {
  return `${noun}#${value}${revision === undefined ? "" : `.${revision}`}`
}

export function NounId({ noun, value, revision, ...props }: NounIdProps) {
  return (
    <Text {...props} bold={false}>
      {noun}#<Text bold>{value}</Text>
      {revision === undefined ? null : `.${revision}`}
    </Text>
  )
}
