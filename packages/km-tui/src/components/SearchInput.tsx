/**
 * SearchInput Component
 *
 * Text input that appears when search mode is active.
 * Shows search query with cursor indicator.
 */

interface SearchInputProps {
  query: string;
  isActive: boolean;
}

export function SearchInput({ query, isActive }: SearchInputProps) {
  if (!isActive) {
    return null;
  }

  return (
    <box paddingLeft={1} paddingRight={1}>
      <text color="yellow">/</text>
      <text>{query}</text>
      <text inverse> </text>
    </box>
  );
}

export default SearchInput;
